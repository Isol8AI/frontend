import { test, expect } from '@playwright/test';
import { clerk } from '@clerk/testing/playwright';
import { signInWithClerk, setupOrganizationMocks } from './fixtures/auth.fixture.js';
import { setupEncryptionMocks } from './fixtures/encryption.fixture.js';

const API_BASE = 'http://localhost:8000';
const DEFAULT_TIMEOUT = 10000;

test.describe('Authenticated User', () => {
  test.beforeEach(async ({ page }) => {
    await setupOrganizationMocks(page);
    await setupEncryptionMocks(page);
    await signInWithClerk(page);
    // Wait for the page to render (don't use networkidle as Clerk may keep connections open)
    // The encryption prompt or chat UI should appear after sign-in
    const encryptionUI = page
      .locator('[data-testid="setup-encryption-prompt"]')
      .or(page.locator('[data-testid="unlock-encryption-prompt"]'))
      .or(page.locator('textarea[placeholder*="message"]'));
    await encryptionUI.first().waitFor({ state: 'visible', timeout: DEFAULT_TIMEOUT });
  });

  test('can access chat interface', async ({ page }) => {
    await expect(page).not.toHaveURL(/sign-in/, { timeout: DEFAULT_TIMEOUT });
    // After auth, user sees encryption setup or unlock prompt (never textarea directly)
    // Use .first() to avoid strict mode violations when multiple elements match
    const encryptionUI = page
      .locator('[data-testid="setup-encryption-prompt"]')
      .or(page.locator('[data-testid="unlock-encryption-prompt"]'));
    await expect(encryptionUI.first()).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('chat interface shows model selector', async ({ page }) => {
    const modelSelector = page
      .getByRole('combobox')
      .or(page.locator('[data-testid="model-selector"]'))
      .or(page.locator('button:has-text("Qwen")'));
    await expect(modelSelector).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('chat interface shows encryption setup', async ({ page }) => {
    // New users see passcode setup, returning users see passcode unlock
    // Use .first() to avoid strict mode violations when multiple elements match
    const passcodeInput = page
      .locator('[data-testid="passcode-input"]')
      .or(page.locator('[data-testid="unlock-passcode-input"]'));
    await expect(passcodeInput.first()).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('can sign out', async ({ page }) => {
    await clerk.signOut({ page });
    // After sign out, user goes to landing page (/) not sign-in
    // The landing page is public, so no redirect to sign-in
    // Note: toHaveURL receives full URL like "http://localhost:3000/"
    await expect(page).toHaveURL(/\/$|\/sign-in/, { timeout: DEFAULT_TIMEOUT });
  });
});

test.describe('Unauthenticated Access', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('redirects to sign-in when accessing protected route', async ({ page }) => {
    // / is now a public landing page, /chat is protected
    await page.goto('/chat');
    await expect(page).toHaveURL(/sign-in/, { timeout: DEFAULT_TIMEOUT });
  });

  test('landing page is accessible without auth', async ({ page }) => {
    await page.goto('/');
    // Landing page should load without redirect
    await expect(page).toHaveURL('/');
    await expect(page.locator('body')).toBeVisible();
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

  test('encrypted chat stream endpoint requires auth', async ({ request }) => {
    const response = await request.post(`${API_BASE}/api/v1/chat/encrypted/stream`, {
      data: { message: 'Hello' },
    });
    expect([401, 403]).toContain(response.status());
  });
});
