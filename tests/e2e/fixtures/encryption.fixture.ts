import { Page, expect, Route } from '@playwright/test';
import { x25519 } from '@noble/curves/ed25519';
import { gcm } from '@noble/ciphers/aes';
import { hkdf } from '@noble/hashes/hkdf';
import { sha512 } from '@noble/hashes/sha512';
import { randomBytes } from '@noble/ciphers/webcrypto';

/**
 * Default test passcode used for encryption setup/unlock in E2E tests.
 */
export const TEST_PASSCODE = '123456';

// =============================================================================
// Real Backend Helpers
// =============================================================================

export interface UserOrg {
  orgId: string;
  orgName: string;
  orgSlug: string;
  isAdmin: boolean;
  hasOrgKey: boolean;
}

/**
 * Set the active organization in Clerk.
 * This is needed before navigating to org pages because the org layout validates
 * that organization.id matches the URL param.
 */
export async function setActiveOrg(page: Page, orgId: string): Promise<boolean> {
  try {
    const result = await page.evaluate(async (targetOrgId) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clerk = (window as any).Clerk;
      if (!clerk) {
        console.log('Clerk not available');
        return { success: false, error: 'Clerk not available' };
      }

      try {
        // Set the active organization
        await clerk.setActive({ organization: targetOrgId });
        console.log(`Set active org to: ${targetOrgId}`);
        return { success: true };
      } catch (e) {
        console.error('Failed to set active org:', e);
        return { success: false, error: String(e) };
      }
    }, orgId);

    if (!result.success) {
      console.error('Failed to set active org:', result.error);
      return false;
    }

    // Wait for Clerk to update
    await page.waitForTimeout(500);
    return true;
  } catch (error) {
    console.error('Error setting active org:', error);
    return false;
  }
}

/**
 * Get the test user's organization memberships from Clerk.
 * Returns the first org if user is in any orgs.
 */
export async function getUserOrgFromMemberships(page: Page): Promise<UserOrg | null> {
  try {
    // Get user's org memberships from Clerk
    const orgs = await page.evaluate(async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clerk = (window as any).Clerk;
      if (!clerk?.user) {
        return null;
      }

      // Get organization memberships
      const memberships = await clerk.user.getOrganizationMemberships();
      if (!memberships?.data?.length) {
        return null;
      }

      // Return first org with its role
      const membership = memberships.data[0];
      return {
        id: membership.organization.id,
        name: membership.organization.name,
        role: membership.role,
      };
    });

    if (!orgs) {
      console.log('User has no organization memberships');
      return null;
    }

    const orgSlug = orgs.name
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || orgs.id;

    console.log(`Got org from memberships: ${orgs.id} (${orgs.name}), role: ${orgs.role}`);

    return {
      orgId: orgs.id,
      orgName: orgs.name || 'Unknown Org',
      orgSlug,
      isAdmin: orgs.role === 'org:admin',
      hasOrgKey: false,
    };
  } catch (error) {
    console.error('Error getting org from memberships:', error);
    return null;
  }
}

/**
 * Get the test user's real organization from Clerk's context.
 * This gets the org that Clerk is currently active in, which matches what the layout validates.
 */
export async function getUserOrg(page: Page): Promise<UserOrg | null> {
  try {
    // Get org from Clerk's active organization - this is what the layout validates against
    const clerkOrg = await page.evaluate(() => {
      // Clerk is injected globally by Clerk SDK
      const clerk = (window as { Clerk?: {
        organization?: { id: string; name: string; memberships?: { data: Array<{ role: string; publicUserData?: { userId: string } }> } };
        user?: { id: string };
      } }).Clerk;

      if (!clerk?.organization) {
        return null;
      }

      const org = clerk.organization;

      // Try to determine the role - check if current user is admin
      // The organization object may have memberships loaded
      let role = 'org:member';
      if (org.memberships?.data && clerk.user?.id) {
        const userMembership = org.memberships.data.find(
          (m) => m.publicUserData?.userId === clerk.user?.id
        );
        if (userMembership) {
          role = userMembership.role;
        }
      }

      return {
        id: org.id,
        name: org.name,
        role,
      };
    });

    if (!clerkOrg) {
      console.log('No active Clerk organization');
      return null;
    }

    // Create a URL-friendly slug from org name
    const orgSlug = clerkOrg.name
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || clerkOrg.id;

    console.log(`Got Clerk org: ${clerkOrg.id} (${clerkOrg.name}), role: ${clerkOrg.role}`);

    return {
      orgId: clerkOrg.id,
      orgName: clerkOrg.name || 'Unknown Org',
      orgSlug,
      isAdmin: clerkOrg.role === 'org:admin',
      hasOrgKey: false, // Will be fetched from backend when needed
    };
  } catch (error) {
    console.error('Error fetching user org from Clerk:', error);
    return null;
  }
}

/**
 * Helper to set up or unlock encryption based on current state.
 * Handles both new users (setup) and returning users (unlock).
 */
export async function ensureEncryptionReady(page: Page): Promise<void> {
  const setupPrompt = page.locator('[data-testid="setup-encryption-prompt"]');
  const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');
  const chatTextarea = page.locator('textarea[placeholder*="message"]');

  // First check if chat is already ready (no prompt needed)
  if (await chatTextarea.isVisible({ timeout: 2000 }).catch(() => false)) {
    console.log('Chat textarea already visible - encryption is ready');
    return;
  }

  // Wait for either prompt to be visible
  await expect(setupPrompt.or(unlockPrompt).first()).toBeVisible({ timeout: 15000 });

  if (await unlockPrompt.isVisible()) {
    console.log('Unlock prompt visible - unlocking...');
    await unlockEncryption(page);
  } else if (await setupPrompt.isVisible()) {
    console.log('Setup prompt visible - setting up...');
    await setupEncryption(page);
  }

  // Verify chat input is now visible
  await expect(chatTextarea).toBeVisible({ timeout: 15000 });
}


/**
 * Robustly type into a React controlled input using multiple fallback methods.
 * Works with password inputs and numeric-only inputs.
 */
async function robustTypeIntoInput(page: Page, locator: ReturnType<Page['locator']>, value: string): Promise<string> {
  // Click to focus the input first
  await locator.click();
  await page.waitForTimeout(100);

  // Clear any existing value
  await locator.evaluate((el: HTMLInputElement) => {
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(100);

  // Method 1: Use keyboard.type() which simulates real keyboard events
  await page.keyboard.type(value, { delay: 50 });
  await page.waitForTimeout(200);

  let inputValue = await locator.inputValue();

  // Method 2: Direct React state update if keyboard.type didn't work
  if (inputValue !== value) {
    console.log(`keyboard.type got: "${inputValue}", trying direct value set`);
    await locator.evaluate((el: HTMLInputElement, val: string) => {
      el.focus();
      el.value = '';
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;
      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, val);
      }
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
    await page.waitForTimeout(200);
    inputValue = await locator.inputValue();
  }

  // Method 3: Fill as final fallback
  if (inputValue !== value) {
    console.log(`Direct set got: "${inputValue}", trying fill`);
    await locator.clear();
    await locator.fill(value);
    await page.waitForTimeout(100);
    inputValue = await locator.inputValue();
  }

  return inputValue;
}

// =============================================================================
// Crypto Utilities (using real @noble libraries)
// =============================================================================

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

interface EncryptedPayload {
  ephemeral_public_key: string;
  iv: string;
  ciphertext: string;
  auth_tag: string;
  hkdf_salt: string;
}

/**
 * Encrypt data to a public key using the same algorithm as the frontend.
 * Uses X25519 ECDH + HKDF-SHA512 + AES-256-GCM.
 */
function encryptToPublicKey(
  recipientPublicKeyHex: string,
  plaintext: string,
  context: string
): EncryptedPayload {
  const recipientPublicKey = hexToBytes(recipientPublicKeyHex);

  // Generate ephemeral keypair
  const ephemeralPrivateKey = randomBytes(32);
  const ephemeralPublicKey = x25519.getPublicKey(ephemeralPrivateKey);

  // ECDH shared secret
  const sharedSecret = x25519.getSharedSecret(ephemeralPrivateKey, recipientPublicKey);

  // HKDF key derivation
  const salt = randomBytes(32);
  const derivedKey = hkdf(
    sha512,
    sharedSecret,
    salt,
    new TextEncoder().encode(context),
    32
  );

  // AES-GCM encryption
  const iv = randomBytes(16);
  const cipher = gcm(derivedKey, iv);
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertextWithTag = cipher.encrypt(plaintextBytes);

  // Split ciphertext and tag
  const ciphertext = ciphertextWithTag.slice(0, -16);
  const authTag = ciphertextWithTag.slice(-16);

  return {
    ephemeral_public_key: bytesToHex(ephemeralPublicKey),
    iv: bytesToHex(iv),
    ciphertext: bytesToHex(ciphertext),
    auth_tag: bytesToHex(authTag),
    hkdf_salt: bytesToHex(salt),
  };
}

// =============================================================================
// Test Enclave (simulates the enclave with real crypto)
// =============================================================================

// Generate a test enclave keypair (consistent across test runs for debugging)
const testEnclavePrivateKey = randomBytes(32);
const testEnclavePublicKey = x25519.getPublicKey(testEnclavePrivateKey);
export const TEST_ENCLAVE_PUBLIC_KEY = bytesToHex(testEnclavePublicKey);

// =============================================================================
// Encryption Setup Helpers
// =============================================================================

/**
 * Reset user's encryption keys by calling the backend DELETE endpoint.
 * This ensures a clean state for setup tests.
 */
export async function resetEncryptionKeys(page: Page): Promise<void> {
  console.log('Resetting encryption keys...');

  const result = await page.evaluate(async () => {
    // Get Clerk token for authentication
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const clerk = (window as any).Clerk;
    const token = await clerk?.session?.getToken();
    if (!token) {
      return { success: false, error: 'No auth token' };
    }

    try {
      const response = await fetch('http://localhost:8000/api/v1/users/me/keys', {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      // 204 = deleted, 404 = didn't exist (both are fine)
      if (response.status === 204 || response.status === 404) {
        return { success: true, status: response.status };
      }

      return { success: false, status: response.status };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  });

  if (result.success) {
    console.log(`Encryption keys reset (status: ${result.status})`);
  } else {
    console.warn(`Failed to reset encryption keys: ${result.error || result.status}`);
  }
}

/**
 * Set up encryption for a new user (first-time setup).
 * This goes through the actual encryption UI flow with real crypto.
 *
 * Note: Handles race condition when multiple parallel tests share the same user.
 * If another test creates keys between our reset and setup, we'll see the unlock
 * prompt instead - in that case, we just unlock rather than failing.
 */
export async function setupEncryption(page: Page): Promise<string> {
  // Reset any existing keys to ensure clean setup
  await resetEncryptionKeys(page);

  // Wait for the page to refresh and show the setup prompt
  await page.reload();
  await page.waitForLoadState('networkidle');

  // Check what prompt appears - could be setup or unlock (race condition)
  const setupPrompt = page.locator('[data-testid="setup-encryption-prompt"]');
  const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');

  // Wait for either prompt to appear
  await expect(setupPrompt.or(unlockPrompt).first()).toBeVisible({ timeout: 15000 });

  // Handle race condition: if unlock prompt appears, another test created keys
  if (await unlockPrompt.isVisible()) {
    console.log('Race condition detected: keys exist after reset (parallel test created them), unlocking instead...');
    await unlockEncryption(page, TEST_PASSCODE);
    return ''; // Return empty recovery code since we didn't set up new keys
  }

  // Normal setup flow - setup prompt is visible

  // Wait for passcode inputs to be visible and interactive
  const passcodeInput = page.locator('[data-testid="passcode-input"]');
  const confirmInput = page.locator('[data-testid="passcode-confirm-input"]');
  await passcodeInput.waitFor({ state: 'visible' });
  await confirmInput.waitFor({ state: 'visible' });

  // Small wait for React to be ready
  await page.waitForTimeout(500);

  // Fill passcode input using robust method
  const passcodeValue = await robustTypeIntoInput(page, passcodeInput, TEST_PASSCODE);
  console.log(`Passcode input value: "${passcodeValue}"`);

  // Fill confirm passcode input
  const confirmValue = await robustTypeIntoInput(page, confirmInput, TEST_PASSCODE);
  console.log(`Confirm passcode input value: "${confirmValue}"`);

  // Verify both inputs have the correct values
  if (passcodeValue !== TEST_PASSCODE || confirmValue !== TEST_PASSCODE) {
    console.error(`Input values don't match expected: passcode="${passcodeValue}", confirm="${confirmValue}"`);
  }

  // Wait for button to be enabled
  const setupButton = page.locator('[data-testid="setup-encryption-button"]');
  await setupButton.waitFor({ state: 'visible' });

  try {
    await expect(setupButton).toBeEnabled({ timeout: 5000 });
    console.log('Setup button is enabled');
  } catch {
    console.error('Setup button did not become enabled');
    const isDisabled = await setupButton.isDisabled();
    console.log(`Button disabled state: ${isDisabled}`);
  }

  // Click setup button
  console.log('Clicking setup button...');
  await setupButton.click();

  // Wait for recovery code to appear
  console.log('Waiting for recovery code display...');
  await page.waitForSelector('[data-testid="recovery-code-display"]', { timeout: 15000 });
  const recoveryCode = await page.textContent('[data-testid="recovery-code-display"]') || '';
  console.log(`Recovery code received: ${recoveryCode.substring(0, 10)}...`);

  // Confirm we saved the recovery code
  await page.click('[data-testid="recovery-code-saved-checkbox"]');
  await page.click('[data-testid="continue-button"]');

  // Wait for chat input to be visible (encryption is ready)
  await page.waitForSelector('textarea[placeholder*="message"]', { timeout: 10000 });

  return recoveryCode;
}

/**
 * Unlock encryption with passcode (returning user).
 */
export async function unlockEncryption(page: Page, passcode: string = TEST_PASSCODE): Promise<void> {
  // Wait for the unlock prompt to appear
  const unlockPrompt = page.locator('[data-testid="unlock-encryption-prompt"]');
  await expect(unlockPrompt).toBeVisible({ timeout: 15000 });

  // Small wait for React to be ready
  await page.waitForTimeout(500);

  // Get the passcode input
  const passcodeInput = page.locator('[data-testid="unlock-passcode-input"]');
  await passcodeInput.waitFor({ state: 'visible' });

  // Click to focus the input first
  await passcodeInput.click();
  await page.waitForTimeout(100);

  // Clear any existing value first
  await passcodeInput.evaluate((el: HTMLInputElement) => {
    el.value = '';
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(100);

  // Use keyboard.type() which simulates real keyboard events
  // This is more reliable for React controlled inputs than fill() or pressSequentially()
  await page.keyboard.type(passcode, { delay: 50 });
  await page.waitForTimeout(200);

  // Verify the input has the value
  let inputValue = await passcodeInput.inputValue();
  console.log(`After keyboard.type: "${inputValue}"`);

  // If keyboard.type didn't work, try using evaluate to set value and dispatch events
  if (inputValue !== passcode) {
    console.log(`keyboard.type did not work (got: "${inputValue}"), trying direct React state update`);

    // This approach directly triggers React's event handling
    await passcodeInput.evaluate((el: HTMLInputElement, value: string) => {
      // Clear first
      el.focus();
      el.value = '';

      // Set value using native setter to bypass React
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype, 'value'
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(el, value);
      }

      // Dispatch input event - React listens to this
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      // Also dispatch change for good measure
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, passcode);

    await page.waitForTimeout(200);
    inputValue = await passcodeInput.inputValue();
    console.log(`After direct value set: "${inputValue}"`);
  }

  // Final fallback - try fill() which sometimes works better in certain environments
  if (inputValue !== passcode) {
    console.log(`Direct set did not work, trying fill`);
    await passcodeInput.clear();
    await passcodeInput.fill(passcode);
    await page.waitForTimeout(100);
    inputValue = await passcodeInput.inputValue();
    console.log(`After fill: "${inputValue}"`);
  }

  // Wait for unlock button to be enabled
  const unlockButton = page.locator('[data-testid="unlock-button"]');

  // Check button state before waiting
  const isDisabledBefore = await unlockButton.isDisabled();
  console.log(`Unlock button disabled before: ${isDisabledBefore}`);

  try {
    await expect(unlockButton).toBeEnabled({ timeout: 5000 });
    console.log('Unlock button is now enabled');
  } catch {
    console.log('Unlock button did not become enabled');
    // Re-check input value
    const finalValue = await passcodeInput.inputValue();
    console.log(`Final passcode input value: "${finalValue}"`);

    // Take a screenshot for debugging
    console.log('Button state indicates passcode may not have been entered correctly');
  }

  // Click unlock button
  console.log('Clicking unlock button...');
  await unlockButton.click();
  console.log('Clicked unlock button');

  // Wait for unlock to complete (chat input should appear)
  console.log('Waiting for chat input to appear...');
  await page.waitForSelector('textarea[placeholder*="message"]', { timeout: 15000 });
  console.log('Chat input appeared - encryption unlocked!');
}

// =============================================================================
// API Mocks
// =============================================================================

/**
 * Mock encryption-related API endpoints.
 */
export async function setupEncryptionMocks(page: Page): Promise<void> {
  // Mock enclave info endpoint with our test enclave public key
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

  // Mock user encryption status (no keys yet - new user)
  await page.route('**/api/v1/users/me/encryption-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        has_encryption_keys: false,
        public_key: null,
      }),
    });
  });
}

/**
 * Mock for user who already has encryption keys set up.
 */
export async function setupExistingEncryptionMocks(page: Page): Promise<void> {
  // Mock enclave info
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

  await page.route('**/api/v1/users/me/encryption-status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        has_encryption_keys: true,
        public_key: '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
      }),
    });
  });

  // Mock encrypted private key retrieval
  await page.route('**/api/v1/users/me/keys', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        encrypted_private_key: 'mock_encrypted_key_hex',
        iv: '00'.repeat(16),
        auth_tag: '00'.repeat(16),
        salt: '00'.repeat(32),
        recovery_encrypted_private_key: 'mock_recovery_key_hex',
        recovery_iv: '00'.repeat(16),
        recovery_auth_tag: '00'.repeat(16),
        recovery_salt: '00'.repeat(32),
      }),
    });
  });
}

/**
 * Mock successful key creation and capture the full encrypted key data.
 * Returns an object with getPublicKey() to retrieve the captured key.
 *
 * IMPORTANT: This also:
 * 1. Updates the encryption-status endpoint to return has_encryption_keys: true
 * 2. Updates the GET /users/me/keys endpoint to return the captured encrypted keys
 *    so that unlock flow works after page reload
 */
export async function mockKeyCreation(page: Page): Promise<{ getPublicKey: () => string | null }> {
  let capturedPublicKey: string | null = null;
  let capturedKeyData: Record<string, unknown> | null = null;

  await page.route('**/api/v1/users/me/keys', async (route) => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON();

      // Capture ALL the encrypted key data for later GET requests
      if (body) {
        capturedPublicKey = body.public_key;
        capturedKeyData = {
          public_key: body.public_key,
          encrypted_private_key: body.encrypted_private_key,
          iv: body.iv,
          tag: body.tag,
          salt: body.salt,
          recovery_encrypted_private_key: body.recovery_encrypted_private_key,
          recovery_iv: body.recovery_iv,
          recovery_tag: body.recovery_tag,
          recovery_salt: body.recovery_salt,
        };

        // Update encryption-status to return that keys exist now
        await page.unroute('**/api/v1/users/me/encryption-status');
        await page.route('**/api/v1/users/me/encryption-status', async (statusRoute) => {
          await statusRoute.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              has_encryption_keys: true,
              public_key: capturedPublicKey,
            }),
          });
        });
      }

      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'created',
          public_key: body?.public_key || '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
        }),
      });
    } else if (route.request().method() === 'GET') {
      // Return the captured encrypted keys for unlock flow
      if (capturedKeyData) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(capturedKeyData),
        });
      } else {
        // No keys captured yet, return 404
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'No encryption keys found' }),
        });
      }
    } else {
      await route.continue();
    }
  });

  return {
    getPublicKey: () => capturedPublicKey,
  };
}

/**
 * Create a mock encrypted chat stream that uses REAL encryption.
 * The response chunks are properly encrypted to the client's transport public key.
 */
export function createEncryptedStreamHandler(chunks: string[]) {
  return async (route: Route) => {
    // Parse the request to get the transport public key
    const postData = route.request().postData();
    let transportPublicKey: string | null = null;

    if (postData) {
      try {
        const body = JSON.parse(postData);
        // Field is called client_transport_public_key in the actual API
        transportPublicKey = body.client_transport_public_key;
      } catch {
        // If we can't parse, we'll use a fallback
      }
    }

    // Build the SSE response
    let responseBody = 'data: {"type":"session","session_id":"test-session-id"}\n\n';

    for (const chunk of chunks) {
      if (transportPublicKey) {
        // Encrypt the chunk using real crypto
        const encryptedContent = encryptToPublicKey(
          transportPublicKey,
          chunk,
          'enclave-to-client-transport'
        );
        responseBody += `data: {"type":"encrypted_chunk","encrypted_content":${JSON.stringify(encryptedContent)}}\n\n`;
      } else {
        // Fallback: return unencrypted (for tests that don't provide transport key)
        responseBody += `data: {"type":"chunk","content":"${chunk}"}\n\n`;
      }
    }

    responseBody += 'data: {"type":"done"}\n\n';

    await route.fulfill({
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
      body: responseBody,
    });
  };
}

/**
 * Legacy mock for backwards compatibility.
 * Creates a mock stream with fake encryption (for tests that don't need real decryption).
 */
export function createMockEncryptedChatStream(chunks: string[]): string {
  const sessionEvent = 'data: {"type":"session","session_id":"mock-session-id"}\n\n';

  // Create chunks with placeholder encrypted content
  // Note: These can't be decrypted without the real transport key
  const contentEvents = chunks
    .map(
      (chunk) =>
        `data: {"type":"encrypted_chunk","encrypted_content":{"ephemeral_public_key":"${'aa'.repeat(
          32
        )}","iv":"${'bb'.repeat(16)}","ciphertext":"${Buffer.from(chunk).toString(
          'hex'
        )}","auth_tag":"${'cc'.repeat(16)}","hkdf_salt":"${'dd'.repeat(32)}"}}\n\n`
    )
    .join('');

  const doneEvent = 'data: {"type":"done"}\n\n';

  return sessionEvent + contentEvents + doneEvent;
}

/**
 * Capture and inspect requests to verify encryption.
 */
export async function captureEncryptedRequests(page: Page): Promise<string[]> {
  const capturedBodies: string[] = [];

  await page.route('**/api/v1/chat/encrypted/**', async (route) => {
    const body = route.request().postData();
    if (body) {
      capturedBodies.push(body);
    }
    await route.continue();
  });

  return capturedBodies;
}

// Generate a test org keypair (for org encryption tests)
const testOrgPrivateKey = randomBytes(32);
const testOrgPublicKey = x25519.getPublicKey(testOrgPrivateKey);
export const TEST_ORG_PUBLIC_KEY = bytesToHex(testOrgPublicKey);
export const TEST_ORG_PRIVATE_KEY = bytesToHex(testOrgPrivateKey);

/**
 * Create encrypted org key payload for a user's public key.
 * This simulates an admin distributing the org key to a member.
 */
export function createEncryptedOrgKey(userPublicKeyHex: string): EncryptedPayload {
  return encryptToPublicKey(
    userPublicKeyHex,
    TEST_ORG_PRIVATE_KEY,
    'org-key-distribution'
  );
}

/**
 * Create encrypted message content for storage.
 * Uses the appropriate context based on the message role.
 */
export function createEncryptedMessageContent(
  userPublicKeyHex: string,
  content: string,
  role: 'user' | 'assistant'
): EncryptedPayload {
  const context = role === 'user' ? 'user-message-storage' : 'assistant-message-storage';
  return encryptToPublicKey(userPublicKeyHex, content, context);
}

/**
 * Create a handler for session messages that returns properly encrypted messages.
 * Must be called AFTER user encryption is set up and public key is known.
 *
 * Returns format: { messages: [ { id, role, encrypted_content } ] }
 */
export function createEncryptedMessagesHandler(
  userPublicKeyHex: string,
  messages: Array<{ id: string; role: 'user' | 'assistant'; content: string }>
) {
  return async (route: Route) => {
    const encryptedMessages = messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      encrypted_content: createEncryptedMessageContent(
        userPublicKeyHex,
        msg.content,
        msg.role
      ),
    }));

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      // Frontend expects { messages: [...] } wrapper
      body: JSON.stringify({ messages: encryptedMessages }),
    });
  };
}

/**
 * Setup organization encryption mocks with real encrypted org key.
 * Must be called AFTER user encryption is set up and public key is known.
 *
 * This mocks the following endpoints:
 * - GET /organizations/{org_id}/encryption-status
 * - GET /organizations/{org_id}/membership (used by useOrgSession.unlockOrgEncryption)
 * - GET /organizations/{org_id}/pending-distributions
 */
export async function setupOrgEncryptionMocksWithRealCrypto(
  page: Page,
  userPublicKeyHex: string
): Promise<void> {
  const encryptedOrgKey = createEncryptedOrgKey(userPublicKeyHex);

  await page.route(
    '**/api/v1/organizations/*/encryption-status',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          has_encryption_keys: true,
          org_public_key: TEST_ORG_PUBLIC_KEY,
        }),
      });
    }
  );

  // Mock the membership endpoint used by useOrgSession.unlockOrgEncryption
  await page.route('**/api/v1/organizations/*/membership', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'test-membership-id',
        org_id: 'test-org-id',
        org_name: 'Test Organization',
        role: 'org:admin',
        has_org_key: true,
        encrypted_org_key: encryptedOrgKey,
        key_distributed_at: new Date().toISOString(),
        joined_at: new Date().toISOString(),
      }),
    });
  });

  await page.route(
    '**/api/v1/organizations/*/pending-distributions',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pending_members: [] }),
      });
    }
  );
}

/**
 * Setup organization encryption mocks (basic - for UI tests that don't need real decryption).
 */
export async function setupOrgEncryptionMocks(page: Page): Promise<void> {
  await page.route(
    '**/api/v1/organizations/*/encryption-status',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          has_encryption_keys: true,
          org_public_key: TEST_ORG_PUBLIC_KEY,
        }),
      });
    }
  );

  await page.route('**/api/v1/organizations/*/membership', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        has_org_key: true,
        encrypted_org_key: {
          ephemeral_public_key: '8520f0098930a754748b7ddcb43ef75a0dbf3a0d26381af4eba4a98eaa9b4e6a',
          iv: '00'.repeat(16),
          ciphertext: 'mock_encrypted_org_key',
          auth_tag: '00'.repeat(16),
          hkdf_salt: '00'.repeat(32),
        },
      }),
    });
  });

  await page.route(
    '**/api/v1/organizations/*/pending-distributions',
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ pending_members: [] }),
      });
    }
  );
}
