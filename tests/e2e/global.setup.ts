/**
 * Global setup for Playwright E2E tests.
 *
 * This runs once before all tests to obtain a Clerk Testing Token.
 * The token allows tests to bypass Clerk's bot detection mechanisms.
 *
 * See: https://clerk.com/docs/testing/playwright/overview
 */
import { clerkSetup } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';

// Setup must run serially
setup.describe.configure({ mode: 'serial' });

setup('global setup', async ({}) => {
  await clerkSetup();
});
