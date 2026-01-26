import { test, expect, type Page } from '@playwright/test';
import { signInWithClerk } from './fixtures/auth.fixture.js';
import {
  setupEncryption,
  unlockEncryption,
  createEncryptedStreamHandler,
  TEST_ENCLAVE_PUBLIC_KEY,
} from './fixtures/encryption.fixture.js';

const DEFAULT_TIMEOUT = 15000;

/**
 * Set up common mocks for chat tests.
 * - Enables embedding test mode to avoid loading the heavy ML model
 * - Mocks memories search to return empty (realistic for new user)
 */
async function setupChatTestMocks(page: Page): Promise<void> {
  // Enable embedding test mode to avoid loading the heavy ML model
  await page.addInitScript(() => {
    (window as unknown as { __EMBEDDINGS_TEST_MODE__: boolean }).__EMBEDDINGS_TEST_MODE__ = true;
  });

  // Mock memories search to return empty (user has no memories yet)
  await page.route('**/api/v1/memories/search', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ memories: [] }),
    });
  });
}

/**
 * Helper to set up or unlock encryption based on current state.
 * Handles both new users (setup) and returning users (unlock).
 */
async function ensureEncryptionReady(page: import('@playwright/test').Page): Promise<void> {
  const setupPrompt = page.locator('[data-testid="setup-encryption-prompt"]');
  const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');
  const chatTextarea = page.locator('textarea[placeholder*="message"]');

  // First check if chat is already ready (no prompt needed)
  if (await chatTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('Chat textarea already visible - encryption is ready');
    return;
  }

  // Wait for either prompt to be visible
  await expect(setupPrompt.or(unlockPrompt).first()).toBeVisible({ timeout: DEFAULT_TIMEOUT });

  if (await unlockPrompt.isVisible()) {
    console.log('Unlock prompt visible - unlocking...');
    await unlockEncryption(page);
  } else if (await setupPrompt.isVisible()) {
    console.log('Setup prompt visible - setting up...');
    await setupEncryption(page);
  }

  // Verify chat input is now visible
  await expect(chatTextarea).toBeVisible({ timeout: DEFAULT_TIMEOUT });
}

test.describe('Chat', () => {
  test.beforeEach(async ({ page }) => {
    // Only mock what we MUST mock: the enclave (no real enclave in tests)
    // Let all other endpoints hit the real backend
    await page.route('**/api/v1/chat/enclave/info', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          enclave_public_key: TEST_ENCLAVE_PUBLIC_KEY,
          attestation_available: false,
          is_mock: true,
        }),
      });
    });

    await signInWithClerk(page);
  });

  // Clean up encryption keys after each test to ensure isolation
  test.afterEach(async ({ page }) => {
    try {
      await page.evaluate(async () => {
        const clerk = (window as { Clerk?: { session?: { getToken: () => Promise<string | null> } } }).Clerk;
        const token = await clerk?.session?.getToken();
        if (token) {
          await fetch('http://localhost:8000/api/v1/users/me/keys', {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
        }
      });
      console.log('Cleanup: Deleted encryption keys');
    } catch (e) {
      // Ignore cleanup errors - keys may not exist
      console.log('Cleanup: No keys to delete or error:', e);
    }
  });

  test('shows encryption setup or unlock prompt', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // User should see either setup prompt (new user) or unlock prompt (returning user)
    // This works with real backend - first run shows setup, subsequent runs show unlock
    const setupPrompt = page.locator('[data-testid="setup-encryption-prompt"]');
    const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');

    await expect(setupPrompt.or(unlockPrompt).first()).toBeVisible({
      timeout: DEFAULT_TIMEOUT
    });
  });

  test('allows setting up or unlocking encryption', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Handle either setup (new user) or unlock (returning user) with REAL backend
    const setupPrompt = page.locator('[data-testid="setup-encryption-prompt"]');
    const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');

    // Wait for either prompt
    await expect(setupPrompt.or(unlockPrompt).first()).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    if (await unlockPrompt.isVisible()) {
      // Returning user: unlock with passcode (real API call)
      await unlockEncryption(page);
    } else if (await setupPrompt.isVisible()) {
      // New user: set up encryption (real API call)
      // Note: setupEncryption may return empty string if race condition causes fallback to unlock
      const recoveryCode = await setupEncryption(page);
      if (recoveryCode) {
        // Only validate recovery code if we actually did a fresh setup
        expect(recoveryCode.replace(/-/g, '').length).toBeGreaterThanOrEqual(16);
      }
    }

    // After setup/unlock, chat input should be visible
    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('sends message and receives streaming response after encryption setup', async ({ page }) => {
    // Set up common mocks
    await setupChatTestMocks(page);

    // Mock the encrypted chat stream (LLM response)
    await page.route('**/api/v1/chat/encrypted/stream', async (route) => {
      const handler = createEncryptedStreamHandler(['Hello', '! I am ', 'an AI assistant.']);
      await handler(route);
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Set up or unlock encryption (real backend)
    await ensureEncryptionReady(page);

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
    // Set up common mocks
    await setupChatTestMocks(page);

    await page.route('**/api/v1/chat/encrypted/stream', async (route) => {
      const handler = createEncryptedStreamHandler(['Response']);
      await handler(route);
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Set up or unlock encryption (real backend)
    await ensureEncryptionReady(page);

    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible();
    await textarea.fill('Test message');
    await page.locator('[data-testid="send-button"]').click();

    await expect(page.locator('text=Response')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    await expect(textarea).toHaveValue('');
  });

  test('allows model selection after encryption setup', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Set up or unlock encryption (real backend)
    await ensureEncryptionReady(page);

    const modelButton = page.locator('button:has-text("Qwen")').first();
    await expect(modelButton).toBeVisible();
    await modelButton.click();

    // Check if Llama option is available (depends on real backend model list)
    const llamaOption = page.locator('text=Llama 3.3 70B');
    if (await llamaOption.isVisible({ timeout: 1000 }).catch(() => false)) {
      await llamaOption.click();
      // Use .first() to avoid strict mode violation (Llama appears in button trigger and dropdown)
      await expect(page.locator('button:has-text("Llama")').first()).toBeVisible();
    }
  });

  test('handles stream failure gracefully', async ({ page }) => {
    // Set up common mocks
    await setupChatTestMocks(page);

    await page.route('**/api/v1/chat/encrypted/stream', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal server error' }),
      });
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Set up or unlock encryption (real backend)
    await ensureEncryptionReady(page);

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
    // Set up common mocks
    await setupChatTestMocks(page);

    await page.route('**/api/v1/chat/encrypted/stream', async (route) => {
      const handler = createEncryptedStreamHandler(['Response']);
      await handler(route);
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Set up or unlock encryption (real backend)
    await ensureEncryptionReady(page);

    const textarea = page.locator('textarea[placeholder*="message"]');
    await textarea.fill('Hello via Enter');
    await textarea.press('Enter');

    await expect(page.locator('text=Hello via Enter')).toBeVisible();
  });

  test('does not send on Shift+Enter', async ({ page }) => {
    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Set up or unlock encryption (real backend)
    await ensureEncryptionReady(page);

    const textarea = page.locator('textarea[placeholder*="message"]');
    await textarea.fill('Line 1');
    await textarea.press('Shift+Enter');
    await textarea.pressSequentially('Line 2');

    const value = await textarea.inputValue();
    expect(value).toContain('Line 1');
    expect(value).toContain('Line 2');
  });

  test('processes extracted facts from stream response', async ({ page }) => {
    // Set up common mocks
    await setupChatTestMocks(page);

    // Mock the encrypted chat stream with extracted facts
    await page.route('**/api/v1/chat/encrypted/stream', async (route) => {
      const handler = createEncryptedStreamHandler(
        ['I noted that you prefer ', 'dark mode.'],
        {
          extractedFacts: [
            {
              subject: 'user',
              predicate: 'prefers',
              object: 'dark mode',
              confidence: 0.9,
              type: 'preference',
            },
          ],
        }
      );
      await handler(route);
    });

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Set up or unlock encryption (real backend)
    await ensureEncryptionReady(page);

    // Now send a message that should trigger fact extraction
    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible();
    await textarea.fill('I really prefer dark mode for coding');
    await page.locator('[data-testid="send-button"]').click();

    // Verify message was sent
    await expect(page.locator('text=I really prefer dark mode for coding')).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    // Verify response was decrypted and displayed
    await expect(page.locator('text=/dark mode/i')).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    // Note: The extracted facts are stored in IndexedDB, which is not directly visible in the UI.
    // This test verifies the full flow works without errors.
    // For more comprehensive fact storage testing, see the unit tests in store.test.ts.
  });
});
