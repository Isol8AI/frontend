import { test, expect } from '@playwright/test';
import { clerk } from '@clerk/testing/playwright';

/**
 * Authentication E2E tests.
 *
 * These tests verify the authentication flow works correctly:
 * - Authenticated users can access the chat interface
 * - Unauthenticated users are redirected to sign-in
 * - Protected routes require authentication
 *
 * Uses Clerk Testing Tokens for authentication bypass.
 * See: https://clerk.com/docs/testing/playwright/overview
 */

test.describe('Authenticated User', () => {
  // These tests use the pre-authenticated state from auth.setup.ts

  test('can access chat interface', async ({ page }) => {
    await page.goto('/');

    // Should see the chat interface, not a sign-in redirect
    await expect(page.locator('body')).toBeVisible();
    await expect(page).not.toHaveURL(/sign-in/);
  });

  test('chat interface shows model selector', async ({ page }) => {
    await page.goto('/');

    // Should see the model selector dropdown
    await expect(
      page.getByRole('combobox').or(page.locator('[data-testid="model-selector"]')).or(page.locator('button:has-text("Qwen")'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('chat interface shows message input', async ({ page }) => {
    await page.goto('/');

    // Should see the message input area
    await expect(
      page.getByPlaceholder(/message/i).or(page.locator('textarea'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('can sign out', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();

    // Sign out using Clerk helper
    await clerk.signOut({ page });

    // Should be redirected to sign-in
    await expect(page).toHaveURL(/sign-in/, { timeout: 10000 });
  });
});

test.describe('Unauthenticated Access', () => {
  // These tests run without the stored auth state
  test.use({ storageState: { cookies: [], origins: [] } });

  test('unauthenticated user is redirected to sign-in', async ({ page }) => {
    await page.goto('/');

    // Should redirect to Clerk sign-in
    await expect(page).toHaveURL(/sign-in/, { timeout: 10000 });
  });

  test('sign-in page is accessible', async ({ page }) => {
    await page.goto('/sign-in');

    // Should load without errors
    await expect(page).not.toHaveURL(/error/i);
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Public API Endpoints', () => {
  test('health endpoint is accessible without auth', async ({ request }) => {
    const response = await request.get('http://localhost:8000/health');

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });

  test('models endpoint is public', async ({ request }) => {
    const response = await request.get('http://localhost:8000/api/v1/chat/models');

    expect(response.status()).toBe(200);
    const models = await response.json();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  });
});

test.describe('Protected API Endpoints', () => {
  test('sessions endpoint requires auth', async ({ request }) => {
    const response = await request.get('http://localhost:8000/api/v1/chat/sessions');

    expect([401, 403]).toContain(response.status());
  });

  test('chat stream endpoint requires auth', async ({ request }) => {
    const response = await request.post('http://localhost:8000/api/v1/chat/stream', {
      data: { message: 'Hello' },
    });

    expect([401, 403]).toContain(response.status());
  });
});
