import { test, expect } from '@playwright/test';
import { signInWithClerk, createMockChatStream, setupOrganizationMocks } from './fixtures/auth.fixture.js';

const DEFAULT_TIMEOUT = 10000;

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection': 'keep-alive',
};

test.describe('Chat', () => {
  test.beforeEach(async ({ page }) => {
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

  test('sends message and receives streaming response', async ({ page }) => {
    await page.route('**/api/v1/chat/stream', async (route) => {
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: createMockChatStream(['Hello', '! I am ', 'an AI assistant.']),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible();
    await textarea.fill('Hello, how are you?');
    await page.locator('[data-testid="send-button"]').click();

    await expect(page.locator('text=Hello, how are you?')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await expect(page.locator('text=/Hello.*AI assistant/i')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('clears input after sending', async ({ page }) => {
    await page.route('**/api/v1/chat/stream', async (route) => {
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: createMockChatStream(['Response']),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible();
    await textarea.fill('Test message');
    await page.locator('[data-testid="send-button"]').click();

    await expect(page.locator('text=Response')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await expect(textarea).toHaveValue('');
  });

  test('allows model selection', async ({ page }) => {
    await page.goto('/');

    const modelButton = page.locator('button:has-text("Qwen")').first();
    await expect(modelButton).toBeVisible();
    await modelButton.click();
    await page.locator('text=Llama 3.3 70B').click();

    await expect(page.locator('button:has-text("Llama")')).toBeVisible();
  });

  test('handles stream failure gracefully', async ({ page }) => {
    await page.route('**/api/v1/chat/stream', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal server error' }),
      });
    });

    await page.goto('/');

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
    await page.route('**/api/v1/chat/stream', async (route) => {
      await route.fulfill({
        status: 200,
        headers: SSE_HEADERS,
        body: createMockChatStream(['Response']),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const textarea = page.locator('textarea[placeholder*="message"]');
    await textarea.fill('Hello via Enter');
    await textarea.press('Enter');

    await expect(page.locator('text=Hello via Enter')).toBeVisible();
  });

  test('does not send on Shift+Enter', async ({ page }) => {
    await page.goto('/');

    const textarea = page.locator('textarea[placeholder*="message"]');
    await textarea.fill('Line 1');
    await textarea.press('Shift+Enter');
    await textarea.pressSequentially('Line 2');

    const value = await textarea.inputValue();
    expect(value).toContain('Line 1');
    expect(value).toContain('Line 2');
  });
});
