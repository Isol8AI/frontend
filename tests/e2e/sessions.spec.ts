import { test, expect } from '@playwright/test';
import { signInWithClerk, createMockChatStream } from './fixtures/auth.fixture';

/**
 * Session management E2E tests.
 *
 * Verifies session-related functionality:
 * - Session creation on first message
 * - Session list in sidebar
 * - Switching between sessions
 * - Creating new chats
 */

test.describe('Sessions', () => {
  test.beforeEach(async ({ page }) => {
    await signInWithClerk(page);

    await page.route('**/api/v1/chat/models', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B' }]),
      });
    });

    await page.route('**/api/v1/users/sync', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'exists', user_id: 'test_user' }),
      });
    });
  });

  test('first message creates new session in sidebar', async ({ page }) => {
    let sessionCreated = false;

    await page.route('**/api/v1/chat/sessions', async (route) => {
      if (route.request().method() === 'GET') {
        const sessions = sessionCreated
          ? [{ id: 'new-session', name: 'What is AI?', created_at: new Date().toISOString() }]
          : [];
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(sessions),
        });
      } else {
        await route.continue();
      }
    });

    await page.route('**/api/v1/chat/stream', async (route) => {
      sessionCreated = true;
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: createMockChatStream(['AI is artificial intelligence.']),
      });
    });

    await page.goto('/');
    await expect(page.locator('text=No conversations yet')).toBeVisible();

    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible();
    await textarea.fill('What is AI?');
    await page.locator('[data-testid="send-button"]').click();

    await expect(page.locator('text=/AI.*artificial intelligence/i')).toBeVisible({ timeout: 10000 });
  });

  test('clicking session loads its messages', async ({ page }) => {
    await page.route('**/api/v1/chat/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'session-1', name: 'Previous Chat', created_at: new Date().toISOString() },
        ]),
      });
    });

    await page.route('**/api/v1/chat/sessions/session-1/messages', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'msg-1', role: 'user', content: 'Hello from previous chat' },
          { id: 'msg-2', role: 'assistant', content: 'Hi! This is a previous response.' },
        ]),
      });
    });

    await page.goto('/');
    await page.locator('text=Previous Chat').click();

    await expect(page.locator('text=Hello from previous chat')).toBeVisible();
    await expect(page.locator('text=Hi! This is a previous response.')).toBeVisible();
  });

  test('New Chat button clears conversation', async ({ page }) => {
    await page.route('**/api/v1/chat/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'session-1', name: 'Existing Chat', created_at: new Date().toISOString() },
        ]),
      });
    });

    await page.route('**/api/v1/chat/sessions/session-1/messages', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'msg-1', role: 'user', content: 'Previous message' }]),
      });
    });

    await page.goto('/');
    await page.locator('text=Existing Chat').click();
    await expect(page.locator('text=Previous message')).toBeVisible();

    await page.locator('text=New Chat').click();

    await expect(page.locator('text=Previous message')).not.toBeVisible();
    await expect(page.locator('textarea[placeholder*="message"]')).toBeVisible();
  });

  test('sidebar shows multiple sessions', async ({ page }) => {
    await page.route('**/api/v1/chat/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'session-1', name: 'First Conversation', created_at: new Date().toISOString() },
          { id: 'session-2', name: 'Second Conversation', created_at: new Date(Date.now() - 86400000).toISOString() },
          { id: 'session-3', name: 'Third Conversation', created_at: new Date(Date.now() - 172800000).toISOString() },
        ]),
      });
    });

    await page.goto('/');

    await expect(page.locator('text=First Conversation')).toBeVisible();
    await expect(page.locator('text=Second Conversation')).toBeVisible();
    await expect(page.locator('text=Third Conversation')).toBeVisible();
  });

  test('current session is highlighted in sidebar', async ({ page }) => {
    await page.route('**/api/v1/chat/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'session-1', name: 'First Chat', created_at: new Date().toISOString() },
          { id: 'session-2', name: 'Second Chat', created_at: new Date().toISOString() },
        ]),
      });
    });

    await page.route('**/api/v1/chat/sessions/session-1/messages', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/');
    await page.locator('text=First Chat').click();

    const firstSessionButton = page.locator('button:has-text("First Chat")');
    await expect(firstSessionButton).toHaveClass(/secondary/);

    const secondSessionButton = page.locator('button:has-text("Second Chat")');
    await expect(secondSessionButton).not.toHaveClass(/secondary/);
  });
});
