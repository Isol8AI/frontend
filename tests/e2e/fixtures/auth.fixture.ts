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

/**
 * Sync the authenticated user to the backend database.
 * This MUST be called after Clerk sign-in before any other API calls.
 */
export async function syncUserToBackend(page: Page): Promise<void> {
  // Wait for Clerk to be fully loaded and have a session
  await page.waitForFunction(
    () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clerk = (window as any).Clerk;
      return clerk?.loaded && clerk?.session;
    },
    { timeout: CLERK_TIMEOUT }
  );

  const result = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clerk = (window as any).Clerk;

    // Wait a bit for session to fully initialize
    let token = await clerk?.session?.getToken();

    // Retry a few times if token is not immediately available
    for (let i = 0; i < 5 && !token; i++) {
      await new Promise(resolve => setTimeout(resolve, 200));
      token = await clerk?.session?.getToken();
    }

    if (!token) {
      return { success: false, error: 'No auth token after retries' };
    }

    try {
      const response = await fetch('http://localhost:8000/api/v1/users/sync', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        return { success: true, status: response.status };
      }

      const errorText = await response.text();
      return { success: false, status: response.status, error: errorText };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  if (result.success) {
    console.log(`User synced to backend (status: ${result.status})`);
  } else {
    console.warn(`Failed to sync user to backend: ${result.error || result.status}`);
  }
}

export async function signInWithClerk(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });

  // Enable embedding test mode to avoid loading the heavy ML model (~22MB)
  // This prevents tests from timing out while waiting for model initialization
  await page.addInitScript(() => {
    (window as unknown as { __EMBEDDINGS_TEST_MODE__: boolean }).__EMBEDDINGS_TEST_MODE__ = true;
  });

  await page.goto('/chat');
  await page.waitForFunction(() => window.Clerk !== undefined, { timeout: CLERK_TIMEOUT });
  await page.waitForFunction(() => window.Clerk.loaded, { timeout: CLERK_TIMEOUT });
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_CLERK_USER_USERNAME!,
  });
  // clerk.signIn is a testing utility that sets auth state but doesn't trigger navigation.
  // Manually navigate to / after signing in.
  await page.goto('/chat');

  // IMPORTANT: Sync user to backend database before any API calls.
  // The frontend normally does this via ChatLayout, but E2E tests may make
  // direct API calls before ChatLayout renders.
  await syncUserToBackend(page);
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
