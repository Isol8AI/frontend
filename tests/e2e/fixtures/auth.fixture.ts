import { test as base, expect, Page } from '@playwright/test';
import { setupClerkTestingToken, clerk } from '@clerk/testing/playwright';

export const test = base.extend<{ clerkPage: Page }>({
  clerkPage: async ({ page }, use) => {
    await setupClerkTestingToken({ page });
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

export { expect, clerk };

const CLERK_TIMEOUT = 10000;

export async function signInWithClerk(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });

  // Enable embedding test mode to avoid loading the heavy ML model (~22MB)
  // This prevents tests from timing out while waiting for model initialization
  await page.addInitScript(() => {
    (window as unknown as { __EMBEDDINGS_TEST_MODE__: boolean }).__EMBEDDINGS_TEST_MODE__ = true;
  });

  await page.goto('/');
  await page.waitForFunction(() => window.Clerk !== undefined, { timeout: CLERK_TIMEOUT });
  await page.waitForFunction(() => window.Clerk.loaded, { timeout: CLERK_TIMEOUT });
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_CLERK_USER_USERNAME!,
  });
  // clerk.signIn is a testing utility that sets auth state but doesn't trigger navigation.
  // Manually navigate to / after signing in.
  await page.goto('/');
}

export function createMockChatStream(chunks: string[]): string {
  const sessionEvent = 'data: {"type":"session","session_id":"test-session-id"}\n\n';
  const contentEvents = chunks
    .map((chunk) => `data: {"type":"content","content":"${chunk}"}\n\n`)
    .join('');
  const doneEvent = 'data: {"type":"done"}\n\n';

  return sessionEvent + contentEvents + doneEvent;
}

export async function setupOrganizationMocks(page: Page): Promise<void> {
  await page.route('**/api/v1/organizations/sync', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'created', org_id: 'org_test_123' }),
    });
  });

  await page.route('**/api/v1/organizations/current', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        org_id: null,
        is_personal_context: true,
        is_org_admin: false,
      }),
    });
  });

  await page.route('**/api/v1/organizations/', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ organizations: [] }),
      });
    } else {
      await route.continue();
    }
  });
}
