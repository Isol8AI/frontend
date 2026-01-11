import { test, expect } from '@playwright/test';
import { clerk } from '@clerk/testing/playwright';
import { signInWithClerk } from './fixtures/auth.fixture';

/**
 * Authentication E2E tests.
 *
 * Verifies authentication flow:
 * - Authenticated users can access the chat interface
 * - Unauthenticated users are redirected to sign-in
 * - Protected routes require authentication
 */

test.describe('Authenticated User', () => {
  test.beforeEach(async ({ page }) => {
    await signInWithClerk(page);
    await page.goto('/');
  });

  test('can access chat interface', async ({ page }) => {
    await expect(page).not.toHaveURL(/sign-in/, { timeout: 10000 });
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10000 });
  });

  test('chat interface shows model selector', async ({ page }) => {
    const modelSelector = page
      .getByRole('combobox')
      .or(page.locator('[data-testid="model-selector"]'))
      .or(page.locator('button:has-text("Qwen")'));
    await expect(modelSelector).toBeVisible({ timeout: 10000 });
  });

  test('chat interface shows message input', async ({ page }) => {
    const messageInput = page.getByPlaceholder(/message/i).or(page.locator('textarea'));
    await expect(messageInput).toBeVisible({ timeout: 10000 });
  });

  test('can sign out', async ({ page }) => {
    await clerk.signOut({ page });
    await expect(page).toHaveURL(/sign-in/, { timeout: 10000 });
  });
});

test.describe('Unauthenticated Access', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('unauthenticated user is redirected to sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/sign-in/, { timeout: 10000 });
  });

  test('sign-in page is accessible', async ({ page }) => {
    await page.goto('/sign-in');
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
  // Note: These tests use a standalone request context which doesn't share
  // browser cookies. They verify that unauthenticated API requests are rejected.
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
