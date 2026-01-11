import { test as base, expect, Page } from '@playwright/test';
import { setupClerkTestingToken, clerk } from '@clerk/testing/playwright';

/**
 * Auth fixture for Playwright E2E tests.
 *
 * Provides Clerk testing token setup and sign-in helper.
 * See: https://clerk.com/docs/testing/playwright/overview
 */

export const test = base.extend<{
  clerkPage: Page;
}>({
  clerkPage: async ({ page }, use) => {
    await setupClerkTestingToken({ page });
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

export { expect, clerk };

/**
 * Signs in using Clerk and waits for it to be ready.
 * Use this in beforeEach hooks to authenticate before tests.
 */
export async function signInWithClerk(page: Page): Promise<void> {
  await setupClerkTestingToken({ page });
  await page.goto('/');
  await page.waitForFunction(() => window.Clerk !== undefined, { timeout: 10000 });
  await page.waitForFunction(() => window.Clerk.loaded, { timeout: 10000 });
  await clerk.signIn({
    page,
    emailAddress: process.env.E2E_CLERK_USER_USERNAME!,
  });
}

/**
 * Creates a mock SSE stream response for the chat endpoint.
 */
export function createMockChatStream(chunks: string[]): string {
  const sessionEvent = 'data: {"type":"session","session_id":"test-session-id"}\n\n';
  const contentEvents = chunks
    .map((chunk) => `data: {"type":"content","content":"${chunk}"}\n\n`)
    .join('');
  const doneEvent = 'data: {"type":"done"}\n\n';

  return sessionEvent + contentEvents + doneEvent;
}
