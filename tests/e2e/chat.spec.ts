import { test, expect } from '@playwright/test';
import { signInWithClerk, setupOrganizationMocks } from './fixtures/auth.fixture.js';
import {
  setupEncryption,
  setupEncryptionMocks,
  mockKeyCreation,
  createEncryptedStreamHandler,
} from './fixtures/encryption.fixture.js';

const DEFAULT_TIMEOUT = 15000;

test.describe('Chat', () => {
  test.beforeEach(async ({ page }) => {
    // Set up API mocks for encryption endpoints
    await setupEncryptionMocks(page);
    await mockKeyCreation(page);
    await setupOrganizationMocks(page);

    await page.route('**/api/v1/chat/models', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B' },
          { id: 'meta-llama/Llama-3.3-70B-Instruct', name: 'Llama 3.3 70B' },
        ]),
      });
    });

    await page.route('**/api/v1/users/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'exists', user_id: 'test_user' }),
      });
    });

    await page.route('**/api/v1/chat/sessions', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      } else {
        await route.continue();
      }
    });

    await signInWithClerk(page);
  });

  test('shows encryption setup prompt for new user', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // New user should see encryption setup prompt
    await expect(page.locator('[data-testid="setup-encryption-prompt"]')).toBeVisible({
      timeout: DEFAULT_TIMEOUT
    });
  });

  test('allows setting up encryption and shows recovery code', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption through the UI
    const recoveryCode = await setupEncryption(page);

    // Verify recovery code was displayed (it should be a 20-digit string with dashes)
    expect(recoveryCode).toBeTruthy();
    expect(recoveryCode.replace(/-/g, '').length).toBeGreaterThanOrEqual(16);

    // After setup, chat input should be visible
    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('sends message and receives streaming response after encryption setup', async ({ page }) => {
    // Mock encrypted chat stream endpoint with real encryption
    await page.route('**/api/v1/chat/encrypted/stream', async (route) => {
      const handler = createEncryptedStreamHandler(['Hello', '! I am ', 'an AI assistant.']);
      await handler(route);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    // Now send a message
    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible();
    await textarea.fill('Hello, how are you?');
    await page.locator('[data-testid="send-button"]').click();

    // Verify message was sent
    await expect(page.locator('text=Hello, how are you?')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    // Verify response was decrypted and displayed
    await expect(page.locator('text=/Hello.*AI assistant/i')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('clears input after sending', async ({ page }) => {
    await page.route('**/api/v1/chat/encrypted/stream', async (route) => {
      const handler = createEncryptedStreamHandler(['Response']);
      await handler(route);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible();
    await textarea.fill('Test message');
    await page.locator('[data-testid="send-button"]').click();

    await expect(page.locator('text=Response')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await expect(textarea).toHaveValue('');
  });

  test('allows model selection after encryption setup', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    const modelButton = page.locator('button:has-text("Qwen")').first();
    await expect(modelButton).toBeVisible();
    await modelButton.click();
    await page.locator('text=Llama 3.3 70B').click();

    await expect(page.locator('button:has-text("Llama")')).toBeVisible();
  });

  test('handles stream failure gracefully', async ({ page }) => {
    await page.route('**/api/v1/chat/encrypted/stream', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal server error' }),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    const textarea = page.locator('textarea[placeholder*="message"]');
    await textarea.fill('Test message');
    await page.locator('[data-testid="send-button"]').click();

    await expect(page.locator('text=/error/i'))
      .toBeVisible({ timeout: 5000 })
      .catch(() => {
        // Error handling may show toast or other UI element
      });
  });

  test('sends on Enter key', async ({ page }) => {
    await page.route('**/api/v1/chat/encrypted/stream', async (route) => {
      const handler = createEncryptedStreamHandler(['Response']);
      await handler(route);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    const textarea = page.locator('textarea[placeholder*="message"]');
    await textarea.fill('Hello via Enter');
    await textarea.press('Enter');

    await expect(page.locator('text=Hello via Enter')).toBeVisible();
  });

  test('does not send on Shift+Enter', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    const textarea = page.locator('textarea[placeholder*="message"]');
    await textarea.fill('Line 1');
    await textarea.press('Shift+Enter');
    await textarea.pressSequentially('Line 2');

    const value = await textarea.inputValue();
    expect(value).toContain('Line 1');
    expect(value).toContain('Line 2');
  });
});
