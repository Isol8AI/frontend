import { test, expect } from '@playwright/test';
import { clerk } from '@clerk/testing/playwright';
import { signInWithClerk, setupOrganizationMocks } from './fixtures/auth.fixture.js';

const API_BASE = 'http://localhost:8000';
const DEFAULT_TIMEOUT = 10000;

test.describe('Authenticated User', () => {
  test.beforeEach(async ({ page }) => {
    await setupOrganizationMocks(page);
    await signInWithClerk(page);
    await page.goto('/');
  });

  test('can access chat interface', async ({ page }) => {
    await expect(page).not.toHaveURL(/sign-in/, { timeout: DEFAULT_TIMEOUT });
    await expect(page.locator('textarea')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('chat interface shows model selector', async ({ page }) => {
    const modelSelector = page
      .getByRole('combobox')
      .or(page.locator('[data-testid="model-selector"]'))
      .or(page.locator('button:has-text("Qwen")'));
    await expect(modelSelector).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('chat interface shows message input', async ({ page }) => {
    const messageInput = page.getByPlaceholder(/message/i).or(page.locator('textarea'));
    await expect(messageInput).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('can sign out', async ({ page }) => {
    await clerk.signOut({ page });
    await expect(page).toHaveURL(/sign-in/, { timeout: DEFAULT_TIMEOUT });
  });
});

test.describe('Unauthenticated Access', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('redirects to sign-in', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/sign-in/, { timeout: DEFAULT_TIMEOUT });
  });

  test('sign-in page is accessible', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page).not.toHaveURL(/error/i);
    await expect(page.locator('body')).toBeVisible();
  });
});

test.describe('Public API Endpoints', () => {
  test('health endpoint is accessible', async ({ request }) => {
    const response = await request.get(`${API_BASE}/health`);

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe('healthy');
  });

  test('models endpoint is public', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/chat/models`);

    expect(response.status()).toBe(200);
    const models = await response.json();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  });
});

test.describe('Protected API Endpoints', () => {
  test('sessions endpoint requires auth', async ({ request }) => {
    const response = await request.get(`${API_BASE}/api/v1/chat/sessions`);
    expect([401, 403]).toContain(response.status());
  });

  test('chat stream endpoint requires auth', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/chat/stream`, {
      data: { message: 'Hello' },
    });
    expect([401, 403]).toContain(response.status());
  });
});
