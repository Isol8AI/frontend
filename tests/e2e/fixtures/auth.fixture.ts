import { test as base, expect, Page } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';

/**
 * Auth fixture for Playwright E2E tests.
 *
 * This fixture uses Clerk Testing Tokens to bypass bot detection.
 * Authentication state is loaded from playwright/.clerk/user.json
 * which is created by auth.setup.ts before tests run.
 *
 * See: https://clerk.com/docs/testing/playwright/overview
 */

// Extend the base test with Clerk testing support
export const test = base.extend<{
  clerkPage: Page;
}>({
  clerkPage: async ({ page }: { page: Page }, use: (page: Page) => Promise<void>) => {
    // Set up Clerk Testing Token for this page
    await setupClerkTestingToken({ page });
    await use(page);
  },
});

export { expect };

/**
 * Helper to create a mock SSE stream response for chat endpoint.
 */
export function createMockChatStream(chunks: string[]): string {
  let response = `data: {"type":"session","session_id":"test-session-id"}\n\n`;

  for (const chunk of chunks) {
    response += `data: {"type":"content","content":"${chunk}"}\n\n`;
  }

  response += `data: {"type":"done"}\n\n`;

  return response;
}
