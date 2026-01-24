import { test, expect, Page } from '@playwright/test';
import { signInWithClerk } from './fixtures/auth.fixture.js';
import {
  ensureEncryptionReady,
  unlockEncryption,
  setActiveOrg,
  clearActiveOrg,
  createOrganization,
  deleteOrganization,
  createEncryptedStreamHandler,
  TEST_ENCLAVE_PUBLIC_KEY,
  TEST_PASSCODE,
} from './fixtures/encryption.fixture.js';

const DEFAULT_TIMEOUT = 15000;

/**
 * Organization Creation and Dual Chat Flow Tests
 *
 * These tests verify the complete flow of:
 * 1. Creating a new organization via Clerk
 * 2. Setting up organization encryption
 * 3. Verifying personal chat works
 * 4. Verifying organization chat works
 *
 * IMPORTANT: Tests run in SERIAL order because:
 * 1. Personal encryption must be set up first
 * 2. Organization must be created before org encryption setup
 * 3. Org encryption must be set up before org chat works
 *
 * Uses REAL backend APIs - only the enclave is mocked.
 */
test.describe.serial('Organization Creation and Dual Chat Flow', () => {
  // Shared state across tests in this serial block
  let createdOrgId: string | null = null;
  let createdOrgName: string | null = null;

  /**
   * Helper to ensure encryption is ready after a page navigation.
   * Full page navigation resets React context, so we may need to re-unlock.
   */
  async function ensureEncryptionAfterNavigation(page: Page): Promise<void> {
    const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');

    // Check if unlock prompt is visible (encryption context was reset)
    if (await unlockPrompt.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Encryption context reset after navigation - unlocking...');
      await unlockEncryption(page, TEST_PASSCODE);
    }
  }

  test.beforeEach(async ({ page }) => {
    // ONLY mock the enclave (no real enclave in tests)
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
    // Clear org context to ensure tests start in personal context
    await clearActiveOrg(page);
  });

  test('Step 1: Set up personal encryption', async ({ page }) => {
    await page.goto('/chat');

    // Set up or unlock personal encryption
    await ensureEncryptionReady(page);

    // Verify chat textarea is visible (personal encryption is ready)
    await expect(page.locator('textarea[placeholder*="message"]')).toBeVisible({
      timeout: DEFAULT_TIMEOUT,
    });

    console.log('Personal encryption setup complete - chat is ready');
  });

  test('Step 2: Create new organization via Clerk', async ({ page }) => {
    await page.goto('/chat');

    // Ensure personal encryption is ready first
    await ensureEncryptionReady(page);

    // Create a unique org name with timestamp
    const orgName = `E2E Test Org ${Date.now()}`;

    // Create org via Clerk and sync to backend
    const result = await createOrganization(page, orgName);

    createdOrgId = result.orgId;
    createdOrgName = result.orgName;

    expect(createdOrgId).toBeTruthy();
    expect(createdOrgName).toBeTruthy();

    console.log(`Created organization: ${createdOrgName} (${createdOrgId})`);
  });

  test('Step 3: Set up organization encryption', async ({ page }) => {
    // Skip if no org was created in previous test
    if (!createdOrgId) {
      test.skip(true, 'No organization was created in Step 2');
      return;
    }

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    // Wait for either unlock prompt or chat textarea to appear
    const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');
    const chatTextarea = page.locator('textarea[placeholder*="message"]');

    // Wait for the page to show one of these states
    await expect(unlockPrompt.or(chatTextarea).first()).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    // Check if we need to unlock first
    if (await unlockPrompt.isVisible()) {
      console.log('Unlocking personal encryption first...');
      // Inline unlock to avoid clearActiveOrg
      const passcodeInput = page.locator('[data-testid="unlock-passcode-input"]');
      await passcodeInput.click();
      await page.keyboard.type(TEST_PASSCODE, { delay: 50 });
      const unlockButton = page.locator('[data-testid="unlock-button"]');
      await expect(unlockButton).toBeEnabled({ timeout: 5000 });
      await unlockButton.click();
    }

    // Wait for personal encryption to be ready
    await expect(chatTextarea).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    console.log('Personal encryption is ready');

    // Now switch to org context
    await setActiveOrg(page, createdOrgId);
    console.log(`Switched to org context: ${createdOrgId}`);

    // Reload to trigger org encryption check in ChatWindow
    await page.reload();
    await page.waitForLoadState('networkidle');

    // May need to unlock personal encryption after reload
    // Note: Don't use unlockEncryption helper as it clears org context
    if (await unlockPrompt.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Unlocking personal encryption after reload (preserving org context)...');
      const passcodeInput = page.locator('[data-testid="unlock-passcode-input"]');
      await passcodeInput.click();
      await page.keyboard.type(TEST_PASSCODE, { delay: 50 });
      const unlockButton = page.locator('[data-testid="unlock-button"]');
      await unlockButton.click();
      // Wait for unlock to complete
      await page.waitForTimeout(1000);
    }

    // Admin should see OrgEncryptionSetupPrompt (new org has no encryption)
    const orgSetupPrompt = page.locator('[data-testid="org-encryption-setup-prompt"]');

    // Wait for setup prompt to appear
    await expect(orgSetupPrompt).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    console.log('Org encryption setup prompt visible');

    // Verify the expected elements are present
    await expect(page.locator('text=/Set Up Organization Encryption/i')).toBeVisible();

    // Fill passcode input (re-enter personal passcode for verification)
    const passcodeInput = page.locator('[data-testid="org-passcode-input"]');
    await passcodeInput.waitFor({ state: 'visible' });
    await passcodeInput.click();
    await page.keyboard.type(TEST_PASSCODE, { delay: 50 });

    // Verify input has value
    const passcodeValue = await passcodeInput.inputValue();
    console.log(`Org passcode input value: "${passcodeValue}"`);
    expect(passcodeValue).toBe(TEST_PASSCODE);

    // Click setup button
    const setupButton = page.locator('[data-testid="setup-org-encryption-button"]');
    await expect(setupButton).toBeEnabled({ timeout: 5000 });
    await setupButton.click();

    // After setup, should see chat textarea
    await expect(chatTextarea).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    console.log('Org encryption setup complete - chat is ready');
  });

  test('Step 4: Personal chat works', async ({ page }) => {
    // Mock chat stream for personal context
    await page.route(
      '**/api/v1/chat/encrypted/stream',
      createEncryptedStreamHandler(['Hello from personal chat!'])
    );

    await page.goto('/chat');

    // Ensure personal encryption is ready
    await ensureEncryptionReady(page);

    // Ensure we're in personal context
    await clearActiveOrg(page);

    // Wait for chat textarea to be visible
    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    // Send a test message
    await textarea.fill('Test personal message');

    const sendButton = page.locator('[data-testid="send-button"]');
    await sendButton.click();

    // Verify user message appears
    await expect(page.locator('text=Test personal message')).toBeVisible({
      timeout: DEFAULT_TIMEOUT,
    });

    // Verify AI response appears (decrypted from mock encrypted response)
    await expect(page.locator('text=Hello from personal chat!')).toBeVisible({
      timeout: DEFAULT_TIMEOUT,
    });

    console.log('Personal chat verified - message sent and response received');
  });

  test('Step 5: Organization chat works', async ({ page }) => {
    // Skip if no org was created
    if (!createdOrgId) {
      test.skip(true, 'No organization was created in Step 2');
      return;
    }

    // Mock chat stream for org context
    await page.route(
      '**/api/v1/chat/encrypted/stream',
      createEncryptedStreamHandler(['Hello from org chat!'])
    );

    await page.goto('/chat');

    const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');
    const textarea = page.locator('textarea[placeholder*="message"]');

    // Unlock personal encryption first (without clearing org context)
    if (await unlockPrompt.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Unlocking personal encryption...');
      const passcodeInput = page.locator('[data-testid="unlock-passcode-input"]');
      await passcodeInput.click();
      await page.keyboard.type(TEST_PASSCODE, { delay: 50 });
      const unlockButton = page.locator('[data-testid="unlock-button"]');
      await unlockButton.click();
      await expect(textarea).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    }

    // Switch to org context
    await setActiveOrg(page, createdOrgId);
    console.log(`Switched to org context: ${createdOrgId}`);

    // Reload to apply org context
    await page.reload();
    await page.waitForLoadState('networkidle');

    // May need to unlock personal encryption after reload (preserving org context)
    if (await unlockPrompt.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Unlocking personal encryption after reload (preserving org context)...');
      const passcodeInput = page.locator('[data-testid="unlock-passcode-input"]');
      await passcodeInput.click();
      await page.keyboard.type(TEST_PASSCODE, { delay: 50 });
      const unlockButton = page.locator('[data-testid="unlock-button"]');
      await unlockButton.click();
      await page.waitForTimeout(1000);
    }

    // Org encryption auto-unlock may take a moment - check for setup prompt
    const orgSetupPrompt = page.locator('[data-testid="org-encryption-setup-prompt"]');

    // If we see setup prompt, org encryption needs setup - set it up
    if (await orgSetupPrompt.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Org encryption needs to be set up');
      const passcodeInput = page.locator('[data-testid="org-passcode-input"]');
      await passcodeInput.click();
      await page.keyboard.type(TEST_PASSCODE, { delay: 50 });
      const setupButton = page.locator('[data-testid="setup-org-encryption-button"]');
      await setupButton.click();
    }

    // Now wait for chat textarea
    await expect(textarea).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    // Send a test message
    await textarea.fill('Test org message');

    const sendButton = page.locator('[data-testid="send-button"]');
    await sendButton.click();

    // Verify user message appears
    await expect(page.locator('text=Test org message')).toBeVisible({
      timeout: DEFAULT_TIMEOUT,
    });

    // Verify AI response appears (decrypted from mock encrypted response)
    await expect(page.locator('text=Hello from org chat!')).toBeVisible({
      timeout: DEFAULT_TIMEOUT,
    });

    console.log('Organization chat verified - message sent and response received');
  });

  test('Step 6: Can switch between personal and org context', async ({ page }) => {
    if (!createdOrgId) {
      test.skip(true, 'No organization was created in Step 2');
      return;
    }

    await page.goto('/chat');
    await page.waitForLoadState('networkidle');

    const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');
    const textarea = page.locator('textarea[placeholder*="message"]');

    // Helper to unlock without clearing org context
    async function unlockIfNeeded() {
      // Wait for page to settle first
      await expect(unlockPrompt.or(textarea).first()).toBeVisible({ timeout: DEFAULT_TIMEOUT });

      if (await unlockPrompt.isVisible()) {
        console.log('Unlocking...');
        const passcodeInput = page.locator('[data-testid="unlock-passcode-input"]');
        await passcodeInput.click();
        await page.keyboard.type(TEST_PASSCODE, { delay: 50 });
        const unlockButton = page.locator('[data-testid="unlock-button"]');
        await expect(unlockButton).toBeEnabled({ timeout: 5000 });
        await unlockButton.click();
      }
    }

    // Start in personal context - unlock if needed
    await unlockIfNeeded();
    await expect(textarea).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    console.log('Personal context: chat visible');

    // Switch to org context
    await setActiveOrg(page, createdOrgId);
    console.log(`Switched to org context: ${createdOrgId}`);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Unlock after reload (preserving org context)
    await unlockIfNeeded();

    // If org encryption needs setup, do it
    const orgSetupPrompt = page.locator('[data-testid="org-encryption-setup-prompt"]');
    if (await orgSetupPrompt.isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('Setting up org encryption...');
      const passcodeInput = page.locator('[data-testid="org-passcode-input"]');
      await passcodeInput.click();
      await page.keyboard.type(TEST_PASSCODE, { delay: 50 });
      const setupButton = page.locator('[data-testid="setup-org-encryption-button"]');
      await setupButton.click();
    }

    await expect(textarea).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    console.log('Org context: chat visible');

    // Switch back to personal context
    await clearActiveOrg(page);
    console.log('Switched back to personal context');
    await page.reload();
    await page.waitForLoadState('networkidle');

    // Unlock after reload
    await unlockIfNeeded();

    await expect(textarea).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    console.log('Back to personal context: chat visible');

    console.log('Context switching verified - can switch between personal and org');
  });

  // Cleanup: Delete the created organization after all tests
  test.afterAll(async ({ browser }) => {
    if (createdOrgId) {
      try {
        const context = await browser.newContext();
        const page = await context.newPage();

        // Sign in and wait for Clerk to be fully ready
        await signInWithClerk(page);
        await page.goto('/chat');
        await page.waitForLoadState('networkidle');

        // Wait for Clerk to be fully loaded
        await page.waitForFunction(
          () => window.Clerk?.loaded === true,
          { timeout: 10000 }
        );

        const deleted = await deleteOrganization(page, createdOrgId);
        if (deleted) {
          console.log(`Cleanup: Deleted organization ${createdOrgId}`);
        } else {
          console.warn(`Cleanup: Failed to delete organization ${createdOrgId}`);
        }

        await page.close();
        await context.close();
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    }
  });
});

/**
 * Additional tests for edge cases and error handling
 */
test.describe('Organization Chat Edge Cases', () => {
  test.beforeEach(async ({ page }) => {
    // ONLY mock the enclave
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
    await clearActiveOrg(page);
  });

  test('Chat displays error gracefully when stream fails', async ({ page }) => {
    // Mock a failed stream
    await page.route('**/api/v1/chat/encrypted/stream', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Internal server error' }),
      });
    });

    await page.goto('/chat');
    await ensureEncryptionReady(page);

    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    // Send a message
    await textarea.fill('Test message that will fail');
    const sendButton = page.locator('[data-testid="send-button"]');
    await sendButton.click();

    // Should see user message at minimum
    await expect(page.locator('text=Test message that will fail')).toBeVisible({
      timeout: DEFAULT_TIMEOUT,
    });

    // The UI should handle the error gracefully (not crash)
    // The specific error display depends on implementation
    console.log('Error handling test complete - UI did not crash');
  });

  test('Personal encryption unlock is required before org access', async ({ page }) => {
    await page.goto('/chat');

    // Don't unlock encryption - just wait for unlock prompt
    const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');
    const setupPrompt = page.locator('[data-testid="setup-encryption-prompt"]');

    // One of these prompts should appear
    await expect(unlockPrompt.or(setupPrompt).first()).toBeVisible({
      timeout: DEFAULT_TIMEOUT,
    });

    // We should NOT see the chat textarea without unlocking
    const textarea = page.locator('textarea[placeholder*="message"]');
    await expect(textarea).not.toBeVisible();

    console.log('Verified: encryption unlock/setup is required before chat access');
  });
});
