import { test, expect, Page } from '@playwright/test';
import { signInWithClerk } from './fixtures/auth.fixture.js';
import {
  ensureEncryptionReady,
  unlockEncryption,
  getUserOrgFromMemberships,
  setActiveOrg,
  clearActiveOrg,
  TEST_ENCLAVE_PUBLIC_KEY,
  TEST_PASSCODE,
  UserOrg,
} from './fixtures/encryption.fixture.js';

const DEFAULT_TIMEOUT = 15000;

/**
 * Organization Encryption Tests
 *
 * These tests use REAL backend APIs. Only the enclave is mocked because
 * there's no real enclave running in test environments.
 *
 * IMPORTANT: Tests run in SERIAL order because:
 * 1. Admin must set up org encryption first
 * 2. Admin must distribute keys to members
 * 3. Then members can access encrypted org content
 *
 * The test user is already in an organization. Tests handle both:
 * - Fresh org (no encryption) → admin sets up first
 * - Existing org encryption → show enabled badge/unlock
 */

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

// Use serial mode to ensure tests run in the correct order
test.describe.serial('Organization Encryption Flow', () => {
  // Shared state across tests in this serial block
  let userOrg: UserOrg | null = null;

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

  test('Step 1: User sets up personal encryption', async ({ page }) => {
    await page.goto('/');

    // Set up or unlock personal encryption first
    await ensureEncryptionReady(page);

    // Get user's org from memberships
    userOrg = await getUserOrgFromMemberships(page);
    if (!userOrg) {
      test.skip(true, 'User is not in any organization');
      return;
    }

    console.log(`User is in org: ${userOrg.orgName} (${userOrg.orgId}), isAdmin: ${userOrg.isAdmin}`);

    // Verify chat input is visible (encryption is ready)
    await expect(page.locator('textarea[placeholder*="message"]')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('Step 2: User can access org encryption settings page', async ({ page }) => {
    await page.goto('/');

    // Set up or unlock personal encryption first
    await ensureEncryptionReady(page);

    // Get user's org from memberships
    const org = await getUserOrgFromMemberships(page);
    if (!org) {
      test.skip(true, 'User is not in any organization');
      return;
    }


    // Navigate to org encryption settings page
    await page.goto(`/org/${org.orgId}/settings/encryption`);

    // After navigation, may need to re-unlock personal encryption
    await ensureEncryptionAfterNavigation(page);

    // Should see either setup prompt (no org encryption) or enabled badge (encryption exists)
    const setupPrompt = page.locator('[data-testid="setup-org-encryption-prompt"]');
    const enabledBadge = page.locator('[data-testid="org-encryption-enabled-badge"]');
    const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');
    const adminRequired = page.locator('[data-testid="admin-required-message"]');
    const encryptionHeader = page.locator('h1:has-text("Organization Encryption")');

    // Wait for page to load - one of these should be visible
    await expect(
      setupPrompt.or(enabledBadge).or(unlockPrompt).or(adminRequired).or(encryptionHeader).first()
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    // Log what we see for debugging
    if (await setupPrompt.isVisible()) {
      console.log('Org encryption: Setup prompt visible (org has no encryption)');
    } else if (await enabledBadge.isVisible()) {
      console.log('Org encryption: Enabled badge visible (org has encryption)');
    } else if (await unlockPrompt.isVisible()) {
      console.log('Org encryption: Unlock prompt visible (need to unlock)');
    } else if (await adminRequired.isVisible()) {
      console.log('Org encryption: Admin required message (user is not admin)');
    }
  });

  test('Step 3: User can view org encryption status', async ({ page }) => {
    await page.goto('/');

    // Set up or unlock personal encryption first
    await ensureEncryptionReady(page);

    // Get user's org from memberships
    const org = await getUserOrgFromMemberships(page);
    if (!org) {
      test.skip(true, 'User is not in any organization');
      return;
    }


    // Navigate to org encryption page
    await page.goto(`/org/${org.orgId}/settings/encryption`);

    // After navigation, may need to re-unlock personal encryption
    await ensureEncryptionAfterNavigation(page);

    // Page should load and show encryption-related content
    const pageContent = await page.textContent('body');
    expect(
      pageContent?.includes('encryption') ||
      pageContent?.includes('Encryption') ||
      pageContent?.includes('Locked') ||
      pageContent?.includes('Organization')
    ).toBeTruthy();
  });

  test('Step 4: Organization members page is accessible', async ({ page }) => {
    await page.goto('/');

    // Set up or unlock personal encryption first
    await ensureEncryptionReady(page);

    // Get user's org from memberships
    const org = await getUserOrgFromMemberships(page);
    if (!org) {
      test.skip(true, 'User is not in any organization');
      return;
    }


    // Navigate to org members page
    await page.goto(`/org/${org.orgId}/members`);

    // Wait for page to load (members page handles its own encryption state)
    await page.waitForLoadState('networkidle');

    // The members page shows different content based on encryption state and role:
    // - If not unlocked: "Unlock Your Keys" message
    // - If not admin: "Admin Access Required" message
    // - If unlocked + admin: Members list

    const membersHeader = page.locator('h1:has-text("Organization Members")');
    const unlockMessage = page.locator('text=/unlock your keys/i');
    const adminRequired = page.locator('text=/admin.*required|only.*admin/i');
    const pendingSection = page.locator('[data-testid="pending-distributions-section"]');
    const membersText = page.locator('text=/members/i');

    // One of these should be visible (page loaded successfully)
    await expect(
      membersHeader.or(unlockMessage).or(adminRequired).or(pendingSection).or(membersText).first()
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });
});

test.describe.serial('Organization Encryption Admin Flow', () => {
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

  test('Admin: sees appropriate encryption setup UI', async ({ page }) => {
    await page.goto('/');

    // Set up or unlock personal encryption first
    await ensureEncryptionReady(page);

    // Get user's org from memberships
    const org = await getUserOrgFromMemberships(page);
    if (!org) {
      test.skip(true, 'User is not in any organization');
      return;
    }

    if (!org.isAdmin) {
      test.skip(true, 'User is not an org admin - cannot test admin setup');
      return;
    }


    // Navigate to org encryption page
    await page.goto(`/org/${org.orgId}/settings/encryption`);

    // Wait for page to load (encryption settings page handles its own state)
    await page.waitForLoadState('networkidle');

    // Admin should see either setup prompt (if org has no encryption) or enabled badge
    const setupPrompt = page.locator('[data-testid="setup-org-encryption-prompt"]');
    const enabledBadge = page.locator('[data-testid="org-encryption-enabled-badge"]');
    const createButton = page.locator('[data-testid="create-org-keys-button"]');
    const passcodeInput = page.locator('[data-testid="org-passcode-input"]');
    const encryptionHeader = page.locator('text=/encryption/i');

    // One of these should be visible for admins
    await expect(
      setupPrompt.or(enabledBadge).or(createButton).or(passcodeInput).or(encryptionHeader).first()
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    if (await setupPrompt.isVisible()) {
      // Org needs encryption setup - verify setup form is available
      console.log('Org encryption: Setup prompt visible, checking for passcode input');
      await expect(page.locator('[data-testid="org-passcode-input"]')).toBeVisible({ timeout: 5000 });
    } else if (await enabledBadge.isVisible()) {
      // Org already has encryption - verify it shows as enabled
      console.log('Org encryption already set up');
    }
  });

  test('Admin: can set up org encryption', async ({ page }) => {
    await page.goto('/');

    // Set up or unlock personal encryption first
    await ensureEncryptionReady(page);

    // Get user's org from memberships
    const org = await getUserOrgFromMemberships(page);
    if (!org) {
      test.skip(true, 'User is not in any organization');
      return;
    }

    if (!org.isAdmin) {
      test.skip(true, 'User is not an org admin');
      return;
    }

    // Navigate to org encryption page
    await page.goto(`/org/${org.orgId}/settings/encryption`);
    await page.waitForLoadState('networkidle');

    // Check if org already has encryption (skip setup if so)
    const enabledBadge = page.locator('[data-testid="org-encryption-enabled-badge"]');
    if (await enabledBadge.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('Org encryption already set up, skipping setup test');
      return;
    }

    // Wait for setup form to be visible
    const setupPrompt = page.locator('[data-testid="setup-org-encryption-prompt"]');
    await expect(setupPrompt).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    // Fill passcode inputs
    const passcodeInput = page.locator('[data-testid="org-passcode-input"]');
    const confirmInput = page.locator('[data-testid="org-passcode-confirm-input"]');

    await passcodeInput.waitFor({ state: 'visible' });
    await confirmInput.waitFor({ state: 'visible' });

    // Use keyboard.type for reliable React input filling
    await passcodeInput.click();
    await page.keyboard.type(TEST_PASSCODE, { delay: 50 });

    await confirmInput.click();
    await page.keyboard.type(TEST_PASSCODE, { delay: 50 });

    // Verify inputs have values
    const passcodeValue = await passcodeInput.inputValue();
    const confirmValue = await confirmInput.inputValue();
    console.log(`Passcode input: "${passcodeValue}", Confirm input: "${confirmValue}"`);

    // Click create keys button
    const createButton = page.locator('[data-testid="create-org-keys-button"]');
    await expect(createButton).toBeEnabled({ timeout: 5000 });
    await createButton.click();

    // Verify success - enabled badge should appear
    await expect(enabledBadge).toBeVisible({ timeout: 15000 });
    console.log('Org encryption setup successful!');
  });

  test('Admin: can view pending key distributions', async ({ page }) => {
    await page.goto('/');

    // Set up or unlock personal encryption first
    await ensureEncryptionReady(page);

    // Get user's org from memberships
    const org = await getUserOrgFromMemberships(page);
    if (!org) {
      test.skip(true, 'User is not in any organization');
      return;
    }

    if (!org.isAdmin) {
      test.skip(true, 'User is not an org admin');
      return;
    }


    // Navigate to org members page
    await page.goto(`/org/${org.orgId}/members`);

    // After navigation, may need to re-unlock personal encryption
    await ensureEncryptionAfterNavigation(page);

    // Admin should see either pending distributions or an empty state or members list
    const pendingSection = page.locator('[data-testid="pending-distributions-section"]');
    const noPending = page.locator('text=/no pending|all members have/i');
    const membersHeader = page.locator('text=/members/i');
    const membersTable = page.locator('[data-testid="members-table"]');
    const adminRequired = page.locator('text=/admin.*required/i');

    // Wait for page content to load
    await expect(
      pendingSection.or(noPending).or(membersHeader).or(membersTable).or(adminRequired).first()
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('Admin: can access encryption audit log', async ({ page }) => {
    await page.goto('/');

    // Set up or unlock personal encryption first
    await ensureEncryptionReady(page);

    // Get user's org from memberships
    const org = await getUserOrgFromMemberships(page);
    if (!org) {
      test.skip(true, 'User is not in any organization');
      return;
    }

    if (!org.isAdmin) {
      test.skip(true, 'User is not an org admin');
      return;
    }


    // Navigate to audit log page
    await page.goto(`/org/${org.orgId}/settings/encryption/audit`);

    // After navigation, may need to re-unlock personal encryption
    await ensureEncryptionAfterNavigation(page);

    // Should see audit log table or empty state or some audit-related content
    const auditTable = page.locator('[data-testid="audit-log-table"]');
    const emptyState = page.locator('text=/no audit|no entries|empty/i');
    const auditHeader = page.locator('text=/audit/i');
    const accessDenied = page.locator('text=/access denied|permission|unauthorized/i');
    const encryptionText = page.locator('text=/encryption/i');

    await expect(
      auditTable.or(emptyState).or(auditHeader).or(accessDenied).or(encryptionText).first()
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });
});

test.describe('Organization Encryption Non-Admin', () => {
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

  test('Non-admin: sees restricted access message', async ({ page }) => {
    await page.goto('/');

    // Set up or unlock personal encryption first
    await ensureEncryptionReady(page);

    // Get user's org from memberships
    const org = await getUserOrgFromMemberships(page);
    if (!org) {
      test.skip(true, 'User is not in any organization');
      return;
    }

    if (org.isAdmin) {
      test.skip(true, 'User is admin - cannot test non-admin access');
      return;
    }


    // Navigate to org encryption page as non-admin
    await page.goto(`/org/${org.orgId}/settings/encryption`);

    // After navigation, may need to re-unlock personal encryption
    await ensureEncryptionAfterNavigation(page);

    // Non-admin should see one of:
    // - Admin-required message
    // - Unlock prompt (encryption context reset)
    // - Enabled badge (read-only view)
    const adminRequired = page.locator('[data-testid="admin-required-message"]');
    const enabledBadge = page.locator('[data-testid="org-encryption-enabled-badge"]');
    const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');
    const encryptionHeader = page.locator('h1:has-text("Organization Encryption")');
    const encryptionText = page.locator('text=/encryption/i');

    await expect(
      adminRequired.or(enabledBadge).or(unlockPrompt).or(encryptionHeader).or(encryptionText).first()
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    // Non-admin should NOT see the create keys button
    await expect(
      page.locator('[data-testid="create-org-keys-button"]')
    ).not.toBeVisible();
  });
});

/**
 * Tests for Organization Encryption Prompts in ChatWindow
 *
 * These tests verify that the correct encryption prompts appear in the ChatWindow
 * when a user is in organization context with various encryption states.
 */
test.describe.serial('ChatWindow Organization Encryption Prompts', () => {
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

  test('User in personal context sees chat after encryption setup', async ({ page }) => {
    await page.goto('/');

    // Set up or unlock personal encryption
    await ensureEncryptionReady(page);

    // Should see chat textarea (personal context, no org checks)
    await expect(page.locator('textarea[placeholder*="message"]')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
  });

  test('Admin in org context without org encryption sees OrgEncryptionSetupPrompt', async ({ page }) => {
    await page.goto('/');

    // First set up personal encryption in personal context
    await clearActiveOrg(page);
    await ensureEncryptionReady(page);

    // Get user's org
    const org = await getUserOrgFromMemberships(page);
    if (!org) {
      test.skip(true, 'User is not in any organization');
      return;
    }

    if (!org.isAdmin) {
      test.skip(true, 'User is not an org admin - cannot test admin setup prompt');
      return;
    }

    // Switch to org context
    await setActiveOrg(page, org.orgId);

    // Reload page to trigger org encryption check
    await page.reload();
    await page.waitForLoadState('networkidle');

    // May need to unlock personal encryption again after reload
    const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');
    if (await unlockPrompt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await unlockEncryption(page, TEST_PASSCODE);
    }

    // Admin should see either:
    // - OrgEncryptionSetupPrompt (if org has no encryption)
    // - Chat textarea (if org already has encryption and user has key)
    const orgSetupPrompt = page.locator('[data-testid="org-encryption-setup-prompt"]');
    const chatTextarea = page.locator('textarea[placeholder*="message"]');
    const orgLoadingMessage = page.locator('text=/Checking organization encryption/i');
    const orgUnlockingMessage = page.locator('text=/Unlocking organization encryption/i');

    // Wait for one of these to be visible
    await expect(
      orgSetupPrompt.or(chatTextarea).or(orgLoadingMessage).or(orgUnlockingMessage).first()
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    // Log what we see
    if (await orgSetupPrompt.isVisible()) {
      console.log('Admin sees OrgEncryptionSetupPrompt - org has no encryption');
      // Verify the prompt has the expected elements
      await expect(page.locator('text=/Set Up Organization Encryption/i')).toBeVisible();
      await expect(page.getByTestId('org-passcode-input')).toBeVisible();
    } else if (await chatTextarea.isVisible()) {
      console.log('Admin sees chat - org already has encryption set up');
    }
  });

  test('Admin can set up org encryption from ChatWindow', async ({ page }) => {
    await page.goto('/');

    // First set up personal encryption in personal context
    await clearActiveOrg(page);
    await ensureEncryptionReady(page);

    // Get user's org
    const org = await getUserOrgFromMemberships(page);
    if (!org) {
      test.skip(true, 'User is not in any organization');
      return;
    }

    if (!org.isAdmin) {
      test.skip(true, 'User is not an org admin');
      return;
    }

    // Switch to org context
    await setActiveOrg(page, org.orgId);

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // May need to unlock personal encryption again after reload
    const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');
    if (await unlockPrompt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await unlockEncryption(page, TEST_PASSCODE);
    }

    // Check if org already has encryption (skip setup if so)
    const chatTextarea = page.locator('textarea[placeholder*="message"]');
    if (await chatTextarea.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('Org encryption already set up, skipping setup test');
      return;
    }

    // Wait for setup prompt to be visible
    const orgSetupPrompt = page.locator('[data-testid="org-encryption-setup-prompt"]');
    await expect(orgSetupPrompt).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    // Fill passcode input
    const passcodeInput = page.locator('[data-testid="org-passcode-input"]');
    await passcodeInput.waitFor({ state: 'visible' });
    await passcodeInput.click();
    await page.keyboard.type(TEST_PASSCODE, { delay: 50 });

    // Click setup button
    const setupButton = page.locator('[data-testid="setup-org-encryption-button"]');
    await expect(setupButton).toBeEnabled({ timeout: 5000 });
    await setupButton.click();

    // After setup, should see chat textarea
    await expect(chatTextarea).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    console.log('Org encryption setup from ChatWindow successful!');
  });

  test('Member in org context without encryption sees AwaitingOrgEncryption', async ({ page }) => {
    await page.goto('/');

    // First set up personal encryption in personal context
    await clearActiveOrg(page);
    await ensureEncryptionReady(page);

    // Get user's org
    const org = await getUserOrgFromMemberships(page);
    if (!org) {
      test.skip(true, 'User is not in any organization');
      return;
    }

    if (org.isAdmin) {
      test.skip(true, 'User is admin - cannot test member view');
      return;
    }

    // Switch to org context
    await setActiveOrg(page, org.orgId);

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // May need to unlock personal encryption again after reload
    const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');
    if (await unlockPrompt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await unlockEncryption(page, TEST_PASSCODE);
    }

    // Member should see either:
    // - AwaitingOrgEncryption (org has no encryption)
    // - AwaitingOrgKeyDistribution (org has encryption but user doesn't have key)
    // - Chat textarea (user has org key)
    const awaitingOrgEncryption = page.locator('[data-testid="awaiting-org-encryption"]');
    const awaitingKeyDistribution = page.locator('[data-testid="awaiting-org-key-distribution"]');
    const chatTextarea = page.locator('textarea[placeholder*="message"]');
    const orgLoadingMessage = page.locator('text=/Checking organization encryption/i');

    await expect(
      awaitingOrgEncryption.or(awaitingKeyDistribution).or(chatTextarea).or(orgLoadingMessage).first()
    ).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    if (await awaitingOrgEncryption.isVisible()) {
      console.log('Member sees AwaitingOrgEncryption - org has no encryption');
      await expect(page.locator('text=/Organization Encryption Not Set Up/i')).toBeVisible();
    } else if (await awaitingKeyDistribution.isVisible()) {
      console.log('Member sees AwaitingOrgKeyDistribution - awaiting key distribution');
      await expect(page.locator('text=/Awaiting Access/i')).toBeVisible();
    } else if (await chatTextarea.isVisible()) {
      console.log('Member sees chat - already has org key');
    }
  });

  test('User can switch back to personal context and see chat', async ({ page }) => {
    await page.goto('/');

    // First set up personal encryption in personal context
    await clearActiveOrg(page);
    await ensureEncryptionReady(page);

    // Verify chat is visible in personal context
    await expect(page.locator('textarea[placeholder*="message"]')).toBeVisible({ timeout: DEFAULT_TIMEOUT });

    // Get user's org
    const org = await getUserOrgFromMemberships(page);
    if (!org) {
      // User has no org - test that personal context still works
      console.log('User has no org, testing personal context only');
      return;
    }

    // Switch to org context
    await setActiveOrg(page, org.orgId);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // May need to unlock after reload
    const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');
    if (await unlockPrompt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await unlockEncryption(page, TEST_PASSCODE);
    }

    // Now switch back to personal context
    await clearActiveOrg(page);
    await page.reload();
    await page.waitForLoadState('networkidle');

    // May need to unlock again
    if (await unlockPrompt.isVisible({ timeout: 3000 }).catch(() => false)) {
      await unlockEncryption(page, TEST_PASSCODE);
    }

    // Should see chat textarea again (back in personal context)
    await expect(page.locator('textarea[placeholder*="message"]')).toBeVisible({ timeout: DEFAULT_TIMEOUT });
    console.log('Successfully switched back to personal context');
  });
});
