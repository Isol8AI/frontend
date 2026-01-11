/**
 * Authentication setup for Playwright E2E tests.
 *
 * Signs in a test user and saves the authenticated state to be reused
 * by all other tests. This eliminates the need to sign in for each test.
 *
 * Required environment variables:
 *   E2E_CLERK_USER_USERNAME - Test user's username or email
 *   E2E_CLERK_USER_PASSWORD - Test user's password
 *
 * See: https://clerk.com/docs/testing/playwright/test-authenticated-flows
 */
import { clerk } from '@clerk/testing/playwright';
import { test as setup, expect } from '@playwright/test';

const authFile = 'playwright/.clerk/user.json';

setup('authenticate', async ({ page }) => {
  // Navigate to home page first (required before clerk.signIn)
  await page.goto('/');

  // Sign in using Clerk test helpers
  // This internally uses setupClerkTestingToken()
  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'password',
      identifier: process.env.E2E_CLERK_USER_USERNAME!,
      password: process.env.E2E_CLERK_USER_PASSWORD!,
    },
  });

  // Verify we're signed in by checking for authenticated content
  // Wait for Clerk to be loaded and user to be authenticated
  await clerk.loaded({ page });

  // Navigate to a protected page to confirm authentication works
  await page.goto('/');

  // Wait for the page to be ready (chat interface should be visible)
  await expect(page.locator('body')).toBeVisible();

  // Save the authenticated state
  await page.context().storageState({ path: authFile });
});
