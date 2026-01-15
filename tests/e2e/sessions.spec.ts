import { test, expect } from '@playwright/test';
import { signInWithClerk, setupOrganizationMocks } from './fixtures/auth.fixture.js';
import {
  setupEncryption,
  setupEncryptionMocks,
  mockKeyCreation,
  createEncryptedStreamHandler,
  createEncryptedMessagesHandler,
} from './fixtures/encryption.fixture.js';

const DEFAULT_TIMEOUT = 15000;
const ONE_DAY_MS = 86400000;

test.describe('Sessions', () => {
  test.beforeEach(async ({ page }) => {
    await setupEncryptionMocks(page);
    await mockKeyCreation(page);
    await setupOrganizationMocks(page);

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

    await signInWithClerk(page);
  });

  test('first message creates new session', async ({ page }) => {
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

    await page.route('**/api/v1/chat/encrypted/stream', async (route) => {
      sessionCreated = true;
      const handler = createEncryptedStreamHandler(['AI is artificial intelligence.']);
      await handler(route);
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    // Now we should see the chat interface
    await expect(page.locator('text=No conversations yet')).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible();
    await textarea.fill('What is AI?');
    await page.locator('[data-testid="send-button"]').click();

    await expect(page.locator('text=/AI.*artificial intelligence/i')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('clicking session loads its messages', async ({ page }) => {
    // Unroute the beforeEach's mockKeyCreation to avoid conflicts
    await page.unroute('**/api/v1/users/me/keys');

    // Set up fresh key capture
    const keyCapture = await mockKeyCreation(page);

    await page.route('**/api/v1/chat/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'session-1', name: 'Previous Chat', created_at: new Date().toISOString() },
        ]),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first - this captures the user's public key
    await setupEncryption(page);

    // Now set up the encrypted messages route with the captured public key
    const userPublicKey = keyCapture.getPublicKey();
    if (userPublicKey) {
      await page.route(
        '**/api/v1/chat/sessions/session-1/messages',
        createEncryptedMessagesHandler(userPublicKey, [
          { id: 'msg-1', role: 'user', content: 'Hello from previous chat' },
          { id: 'msg-2', role: 'assistant', content: 'Hi! This is a previous response.' },
        ])
      );
    }

    await page.locator('text=Previous Chat').click();

    await expect(page.locator('text=Hello from previous chat')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await expect(page.locator('text=Hi! This is a previous response.')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('New Chat button clears conversation', async ({ page }) => {
    // Unroute the beforeEach's mockKeyCreation to avoid conflicts
    await page.unroute('**/api/v1/users/me/keys');

    // Set up fresh key capture
    const keyCapture = await mockKeyCreation(page);

    await page.route('**/api/v1/chat/sessions', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 'session-1', name: 'Existing Chat', created_at: new Date().toISOString() },
        ]),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first - this captures the user's public key
    await setupEncryption(page);

    // Now set up the encrypted messages route with the captured public key
    const userPublicKey = keyCapture.getPublicKey();
    if (userPublicKey) {
      await page.route(
        '**/api/v1/chat/sessions/session-1/messages',
        createEncryptedMessagesHandler(userPublicKey, [
          { id: 'msg-1', role: 'user', content: 'Previous message' },
        ])
      );
    }

    await page.locator('text=Existing Chat').click();
    await expect(page.locator('text=Previous message')).toBeVisible({ timeout: DEFAULT_TIMEOUT });

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
          { id: 'session-2', name: 'Second Conversation', created_at: new Date(Date.now() - ONE_DAY_MS).toISOString() },
          { id: 'session-3', name: 'Third Conversation', created_at: new Date(Date.now() - ONE_DAY_MS * 2).toISOString() },
        ]),
      });
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    await expect(page.locator('text=First Conversation')).toBeVisible();
    await expect(page.locator('text=Second Conversation')).toBeVisible();
    await expect(page.locator('text=Third Conversation')).toBeVisible();
  });

  test('highlights current session in sidebar', async ({ page }) => {
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
    await page.waitForLoadState('networkidle');

    // Set up encryption first
    await setupEncryption(page);

    await page.locator('text=First Chat').click();

    await expect(page.locator('button:has-text("First Chat")')).toHaveClass(/secondary/);
    await expect(page.locator('button:has-text("Second Chat")')).not.toHaveClass(/secondary/);
  });
});
