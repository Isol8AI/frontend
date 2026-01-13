/**
 * Key management - passcode derivation and encrypted key storage.
 *
 * This module handles:
 * - Generating keypairs encrypted with user passcodes
 * - Recovery code generation and key encryption
 * - Decrypting private keys with passcode/recovery code
 * - Serialization for server storage
 *
 * Security Properties:
 * - Private keys never stored in plaintext
 * - Argon2id makes passcode brute-forcing expensive
 * - Recovery codes provide backup access
 * - All encryption uses AES-256-GCM with random IVs
 */

import {
  generateX25519Keypair,
  generateSalt,
  generateRecoveryCode,
  deriveKeyFromPasscode,
  encryptAesGcm,
  decryptAesGcm,
  bytesToHex,
  hexToBytes,
} from './primitives';

// =============================================================================
// Types
// =============================================================================

/**
 * Encrypted key material ready for server storage.
 * All fields are hex-encoded strings for JSON serialization.
 */
export interface EncryptedKeyMaterial {
  /** User's X25519 public key (not encrypted) */
  publicKey: string;
  /** Private key encrypted with derived key */
  encryptedPrivateKey: string;
  /** AES-GCM IV */
  iv: string;
  /** AES-GCM auth tag */
  tag: string;
  /** Argon2id salt */
  salt: string;
}

/**
 * Complete key setup result including both passcode and recovery encrypted copies.
 */
export interface KeySetupResult {
  /** Passcode-encrypted keys */
  personal: EncryptedKeyMaterial;
  /** Recovery code-encrypted keys */
  recovery: EncryptedKeyMaterial;
  /** 20-digit recovery code (display to user, they must save it) */
  recoveryCode: string;
  /**
   * Raw private key (hex string) - ONLY for keeping in memory after setup.
   * This allows the user to be immediately unlocked after creating their keys.
   * NEVER persist or transmit this value.
   */
  rawPrivateKey: string;
}

/**
 * API request format for storing user keys.
 */
export interface StoreKeysRequest {
  public_key: string;
  encrypted_private_key: string;
  iv: string;
  tag: string;
  salt: string;
  recovery_encrypted_private_key: string;
  recovery_iv: string;
  recovery_tag: string;
  recovery_salt: string;
}

/**
 * API response format when fetching user keys.
 */
export interface FetchKeysResponse {
  public_key: string;
  encrypted_private_key: string;
  iv: string;
  tag: string;
  salt: string;
  recovery_encrypted_private_key?: string;
  recovery_iv?: string;
  recovery_tag?: string;
  recovery_salt?: string;
}

// =============================================================================
// Key Generation & Encryption
// =============================================================================

/**
 * Generate a new keypair and encrypt it with both passcode and recovery code.
 *
 * This is the primary function for setting up a new user's encryption keys.
 *
 * @param passcode - User's chosen passcode (6+ characters recommended)
 * @returns KeySetupResult with encrypted keys and recovery code
 *
 * @example
 * const result = await generateAndEncryptKeys("123456");
 * // Store result.personal and result.recovery on server
 * // Display result.recoveryCode to user (one time only!)
 */
export async function generateAndEncryptKeys(
  passcode: string
): Promise<KeySetupResult> {
  if (!passcode || passcode.length < 6) {
    throw new Error('Passcode must be at least 6 characters');
  }

  // Generate the keypair
  const keypair = generateX25519Keypair();

  // Encrypt with passcode
  const passSalt = generateSalt(32);
  const passKey = await deriveKeyFromPasscode(passcode, passSalt);
  const passEnc = encryptAesGcm(passKey, keypair.privateKey);

  // Generate recovery code and encrypt with it
  const recoveryCode = generateRecoveryCode(20);
  const recSalt = generateSalt(32);
  const recKey = await deriveKeyFromPasscode(recoveryCode, recSalt);
  const recEnc = encryptAesGcm(recKey, keypair.privateKey);

  return {
    personal: {
      publicKey: bytesToHex(keypair.publicKey),
      encryptedPrivateKey: bytesToHex(passEnc.ciphertext),
      iv: bytesToHex(passEnc.iv),
      tag: bytesToHex(passEnc.authTag),
      salt: bytesToHex(passSalt),
    },
    recovery: {
      publicKey: bytesToHex(keypair.publicKey),
      encryptedPrivateKey: bytesToHex(recEnc.ciphertext),
      iv: bytesToHex(recEnc.iv),
      tag: bytesToHex(recEnc.authTag),
      salt: bytesToHex(recSalt),
    },
    recoveryCode,
    rawPrivateKey: bytesToHex(keypair.privateKey),
  };
}

/**
 * Encrypt an existing private key with a passcode.
 *
 * Used when changing passcode or re-encrypting keys.
 *
 * @param privateKey - Raw private key bytes
 * @param passcode - Passcode to encrypt with
 * @returns Encrypted key material
 */
export async function encryptPrivateKeyWithPasscode(
  privateKey: Uint8Array,
  passcode: string
): Promise<EncryptedKeyMaterial> {
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }

  const salt = generateSalt(32);
  const derivedKey = await deriveKeyFromPasscode(passcode, salt);
  const encrypted = encryptAesGcm(derivedKey, privateKey);

  // Derive public key from private key
  const { x25519 } = await import('@noble/curves/ed25519');
  const publicKey = x25519.getPublicKey(privateKey);

  return {
    publicKey: bytesToHex(publicKey),
    encryptedPrivateKey: bytesToHex(encrypted.ciphertext),
    iv: bytesToHex(encrypted.iv),
    tag: bytesToHex(encrypted.authTag),
    salt: bytesToHex(salt),
  };
}

// =============================================================================
// Key Decryption
// =============================================================================

/**
 * Decrypt private key using passcode.
 *
 * @param passcode - User's passcode
 * @param encrypted - Encrypted key material from server
 * @returns Decrypted private key as hex string
 *
 * @throws Error if passcode is incorrect or decryption fails
 */
export async function decryptPrivateKey(
  passcode: string,
  encrypted: EncryptedKeyMaterial
): Promise<string> {
  const salt = hexToBytes(encrypted.salt);
  const derivedKey = await deriveKeyFromPasscode(passcode, salt);

  try {
    const privateKeyBytes = decryptAesGcm(
      derivedKey,
      hexToBytes(encrypted.iv),
      hexToBytes(encrypted.encryptedPrivateKey),
      hexToBytes(encrypted.tag)
    );
    return bytesToHex(privateKeyBytes);
  } catch {
    throw new Error('Incorrect passcode');
  }
}

/**
 * Decrypt private key from API response format.
 *
 * @param passcode - User's passcode
 * @param response - API response with encrypted keys
 * @returns Decrypted private key as hex string
 */
export async function decryptPrivateKeyFromResponse(
  passcode: string,
  response: FetchKeysResponse
): Promise<string> {
  return decryptPrivateKey(passcode, {
    publicKey: response.public_key,
    encryptedPrivateKey: response.encrypted_private_key,
    iv: response.iv,
    tag: response.tag,
    salt: response.salt,
  });
}

/**
 * Decrypt private key using recovery code.
 *
 * @param recoveryCode - User's 20-digit recovery code
 * @param response - API response with recovery-encrypted keys
 * @returns Decrypted private key as hex string
 *
 * @throws Error if recovery code is incorrect or recovery keys not available
 */
export async function decryptPrivateKeyWithRecovery(
  recoveryCode: string,
  response: FetchKeysResponse
): Promise<string> {
  if (
    !response.recovery_encrypted_private_key ||
    !response.recovery_iv ||
    !response.recovery_tag ||
    !response.recovery_salt
  ) {
    throw new Error('Recovery keys not available');
  }

  return decryptPrivateKey(recoveryCode, {
    publicKey: response.public_key,
    encryptedPrivateKey: response.recovery_encrypted_private_key,
    iv: response.recovery_iv,
    tag: response.recovery_tag,
    salt: response.recovery_salt,
  });
}

// =============================================================================
// Passcode Change
// =============================================================================

/**
 * Change user's passcode by re-encrypting private key.
 *
 * @param currentPasscode - Current passcode
 * @param newPasscode - New passcode
 * @param encrypted - Current encrypted key material
 * @returns New encrypted key material
 */
export async function changePasscode(
  currentPasscode: string,
  newPasscode: string,
  encrypted: EncryptedKeyMaterial
): Promise<EncryptedKeyMaterial> {
  if (!newPasscode || newPasscode.length < 6) {
    throw new Error('New passcode must be at least 6 characters');
  }

  // Decrypt with current passcode
  const privateKeyHex = await decryptPrivateKey(currentPasscode, encrypted);
  const privateKey = hexToBytes(privateKeyHex);

  // Re-encrypt with new passcode
  return encryptPrivateKeyWithPasscode(privateKey, newPasscode);
}

// =============================================================================
// Serialization Helpers
// =============================================================================

/**
 * Convert KeySetupResult to API request format.
 */
export function toStoreKeysRequest(result: KeySetupResult): StoreKeysRequest {
  return {
    public_key: result.personal.publicKey,
    encrypted_private_key: result.personal.encryptedPrivateKey,
    iv: result.personal.iv,
    tag: result.personal.tag,
    salt: result.personal.salt,
    recovery_encrypted_private_key: result.recovery.encryptedPrivateKey,
    recovery_iv: result.recovery.iv,
    recovery_tag: result.recovery.tag,
    recovery_salt: result.recovery.salt,
  };
}

/**
 * Format recovery code for display (groups of 4 digits).
 *
 * @example
 * formatRecoveryCode("12345678901234567890")
 * // Returns: "1234-5678-9012-3456-7890"
 */
export function formatRecoveryCode(code: string): string {
  return code.match(/.{1,4}/g)?.join('-') ?? code;
}

/**
 * Parse formatted recovery code back to raw digits.
 */
export function parseRecoveryCode(formatted: string): string {
  return formatted.replace(/-/g, '');
}
