import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E test configuration for Freebird.
 *
 * Uses Clerk Testing Tokens for authentication bypass.
 * See: https://clerk.com/docs/testing/playwright/overview
 *
 * Run tests:
 *   npm run test:e2e           # Run all E2E tests
 *   npm run test:e2e:ui        # Run with interactive UI
 *   npx playwright test --project=chromium  # Single browser
 *
 * Required environment variables:
 *   CLERK_PUBLISHABLE_KEY      # From Clerk Dashboard
 *   CLERK_SECRET_KEY           # From Clerk Dashboard
 *   E2E_CLERK_USER_USERNAME    # Test user username
 *   E2E_CLERK_USER_PASSWORD    # Test user password
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Global setup - obtains Clerk Testing Token
    {
      name: 'setup',
      testMatch: /global\.setup\.ts/,
    },

    // Auth setup - signs in and saves auth state
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
      dependencies: ['setup'],
    },

    // Browser tests with pre-authenticated state
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'playwright/.clerk/user.json',
      },
      dependencies: ['auth-setup'],
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        storageState: 'playwright/.clerk/user.json',
      },
      dependencies: ['auth-setup'],
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        storageState: 'playwright/.clerk/user.json',
      },
      dependencies: ['auth-setup'],
    },
  ],
  webServer: [
    {
      command: 'npm run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      command: 'cd ../backend && source env/bin/activate && uvicorn main:app --port 8000',
      url: 'http://localhost:8000/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
});
