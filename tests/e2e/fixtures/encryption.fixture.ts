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

/**
 * Helper to fill React controlled inputs/textareas that don't respond to regular fill/type.
 * This sets the value directly and dispatches proper events.
 */
async function fillReactInput(page: Page, selector: string, value: string): Promise<void> {
  await page.evaluate(({ selector, value }) => {
    const element = document.querySelector(selector) as HTMLInputElement | HTMLTextAreaElement;
    if (element) {
      // Get the appropriate prototype based on element type
      const prototype = element.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;

      const nativeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      if (nativeValueSetter) {
        nativeValueSetter.call(element, value);
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { selector, value });
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
 * Set up encryption for a new user (first-time setup).
 * This goes through the actual encryption UI flow with real crypto.
 */
export async function setupEncryption(page: Page): Promise<string> {
  // Wait for the setup prompt to appear
  await page.waitForSelector('[data-testid="setup-encryption-prompt"]', { timeout: 15000 });

  // Wait for passcode inputs to be visible and interactive
  const passcodeInput = page.locator('[data-testid="passcode-input"]');
  const confirmInput = page.locator('[data-testid="passcode-confirm-input"]');
  await passcodeInput.waitFor({ state: 'visible' });
  await confirmInput.waitFor({ state: 'visible' });

  // Small wait for React to be ready
  await page.waitForTimeout(500);

  // Use fillReactInput helper for React controlled inputs
  await fillReactInput(page, '[data-testid="passcode-input"]', TEST_PASSCODE);
  await fillReactInput(page, '[data-testid="passcode-confirm-input"]', TEST_PASSCODE);

  // Small wait for React to process the state updates
  await page.waitForTimeout(300);

  // Wait for button to be enabled
  const setupButton = page.locator('[data-testid="setup-encryption-button"]');
  await setupButton.waitFor({ state: 'visible' });
  await expect(setupButton).toBeEnabled({ timeout: 5000 });

  // Click setup button
  await setupButton.click();

  // Wait for recovery code to appear
  await page.waitForSelector('[data-testid="recovery-code-display"]', { timeout: 15000 });
  const recoveryCode = await page.textContent('[data-testid="recovery-code-display"]') || '';

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
  await page.waitForSelector('[data-testid="unlock-encryption-prompt"]', { timeout: 15000 });

  // Small wait for React to be ready
  await page.waitForTimeout(500);

  // Use fillReactInput helper for React controlled inputs
  await fillReactInput(page, '[data-testid="unlock-passcode-input"]', passcode);
  await page.waitForTimeout(200);

  // Click unlock button
  await page.click('[data-testid="unlock-button"]');

  // Wait for unlock to complete (chat input should appear)
  await page.waitForSelector('textarea[placeholder*="message"]', { timeout: 15000 });
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
        transport_public_key: TEST_ENCLAVE_PUBLIC_KEY,
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
        transport_public_key: TEST_ENCLAVE_PUBLIC_KEY,
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
      body: JSON.stringify(encryptedMessages),
    });
  };
}

/**
 * Setup organization encryption mocks with real encrypted org key.
 * Must be called AFTER user encryption is set up and public key is known.
 *
 * This mocks the following endpoints:
 * - GET /organizations/{org_id}/encryption-status
 * - GET /organizations/{org_id}/my-membership (used by useOrgSession.unlockOrgEncryption)
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

  // Mock the my-membership endpoint used by useOrgSession.unlockOrgEncryption
  await page.route('**/api/v1/organizations/*/my-membership', async (route) => {
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
