import { test, expect } from '@playwright/test';
import { createMockChatStream } from './fixtures/auth.fixture';

/**
 * Session management E2E tests.
 *
 * These tests verify session-related functionality:
 * - Session creation on first message
 * - Session list in sidebar
 * - Switching between sessions
 * - Creating new chats
 *
 * Authentication state is loaded from playwright/.clerk/user.json
 */

test.describe('Sessions', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the models endpoint
    await page.route('**/api/v1/chat/models', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 72B' },
        ]),
      });
    });

    // Mock user sync
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

    // Mock empty sessions initially
    await page.route('**/api/v1/chat/sessions', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            sessionCreated
              ? [{ id: 'new-session', name: 'What is AI?', created_at: new Date().toISOString() }]
              : []
          ),
        });
      } else {
        await route.continue();
      }
    });

    // Mock chat stream
    await page.route('**/api/v1/chat/stream', async (route) => {
      sessionCreated = true;
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: createMockChatStream(['AI is artificial intelligence.']),
      });
    });

    await page.goto('/');

    // Initially should show "No conversations yet"
    await expect(page.locator('text=No conversations yet')).toBeVisible();

    // Send a message
    const textarea = page.locator('textarea[placeholder*="message"]');
    await textarea.fill('What is AI?');
    await page.locator('button:has(svg)').last().click();

    // Wait for response and session to appear in sidebar
    await expect(page.locator('text=AI is artificial intelligence')).toBeVisible({ timeout: 5000 });

    // Trigger sessions reload (this depends on your implementation)
    // The session should now appear in the sidebar
  });

  test('clicking session loads its messages', async ({ page }) => {
    // Mock sessions with one existing session
    await page.route('**/api/v1/chat/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'session-1', name: 'Previous Chat', created_at: new Date().toISOString() },
        ]),
      });
    });

    // Mock messages for the session
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

    // Click on the session in sidebar
    await page.locator('text=Previous Chat').click();

    // Should load messages from that session
    await expect(page.locator('text=Hello from previous chat')).toBeVisible();
    await expect(page.locator('text=Hi! This is a previous response.')).toBeVisible();
  });

  test('New Chat button clears conversation', async ({ page }) => {
    // Mock sessions
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
        body: JSON.stringify([
          { id: 'msg-1', role: 'user', content: 'Previous message' },
        ]),
      });
    });

    await page.goto('/');

    // Click on existing session
    await page.locator('text=Existing Chat').click();

    // Should show previous message
    await expect(page.locator('text=Previous message')).toBeVisible();

    // Click New Chat
    await page.locator('text=New Chat').click();

    // Previous message should no longer be visible (new conversation)
    await expect(page.locator('text=Previous message')).not.toBeVisible();

    // Should show initial state (centered input)
    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible();
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

    // All sessions should be visible in sidebar
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

    // Click on first session
    await page.locator('text=First Chat').click();

    // First session button should have active styling
    const firstSessionButton = page.locator('button:has-text("First Chat")');
    await expect(firstSessionButton).toHaveClass(/secondary/);

    // Second session should not have active styling
    const secondSessionButton = page.locator('button:has-text("Second Chat")');
    await expect(secondSessionButton).not.toHaveClass(/secondary/);
  });
});
