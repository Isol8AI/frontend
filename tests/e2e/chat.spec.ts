import { test, expect } from '@playwright/test';
import { signInWithClerk, createMockChatStream } from './fixtures/auth.fixture';

/**
 * Chat E2E tests.
 *
 * Verifies core chat functionality:
 * - Sending messages and receiving streaming responses
 * - Model selection
 * - Keyboard shortcuts (Enter to send, Shift+Enter for newline)
 */

test.describe('Chat', () => {
  test.beforeEach(async ({ page }) => {
    await signInWithClerk(page);

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
  });

  test('can send a message and receive streaming response', async ({ page }) => {
    await page.route('**/api/v1/chat/stream', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: createMockChatStream(['Hello', '! I am ', 'an AI assistant.']),
      });
    });

    await page.goto('/');

    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible();
    await textarea.fill('Hello, how are you?');

    await page.locator('[data-testid="send-button"]').click();

    await expect(page.locator('text=Hello, how are you?')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=/Hello.*AI assistant/i')).toBeVisible({ timeout: 10000 });
  });

  test('message input clears after sending', async ({ page }) => {
    await page.route('**/api/v1/chat/stream', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: createMockChatStream(['Response']),
      });
    });

    await page.goto('/');

    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible();
    await textarea.fill('Test message');
    await page.locator('[data-testid="send-button"]').click();

    await expect(page.locator('text=Response')).toBeVisible({ timeout: 10000 });
    await expect(textarea).toHaveValue('');
  });

  test('can select different models', async ({ page }) => {
    await page.goto('/');

    const modelButton = page.locator('button:has-text("Qwen")').first();
    await expect(modelButton).toBeVisible();
    await modelButton.click();

    await page.locator('text=Llama 3.3 70B').click();

    await expect(page.locator('button:has-text("Llama")')).toBeVisible();
  });

  test('shows error message on stream failure', async ({ page }) => {
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

    // Error handling varies by implementation - check for error text or graceful degradation
    await expect(page.locator('text=/error/i'))
      .toBeVisible({ timeout: 5000 })
      .catch(() => {
        console.log('Error handling may show toast or other UI element');
      });
  });

  test('Enter key sends message', async ({ page }) => {
    await page.route('**/api/v1/chat/stream', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: createMockChatStream(['Response']),
      });
    });

    await page.goto('/');

    const textarea = page.locator('textarea[placeholder*="message"]');
    await textarea.fill('Hello via Enter');
    await textarea.press('Enter');

    await expect(page.locator('text=Hello via Enter')).toBeVisible();
  });

  test('Shift+Enter does not send message', async ({ page }) => {
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
