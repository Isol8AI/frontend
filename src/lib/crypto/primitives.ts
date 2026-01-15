/**
 * Cryptographic primitives for the zero-trust LLM platform.
 *
 * Security Properties:
 * - All randomness from crypto.getRandomValues (CSPRNG)
 * - Argon2id for passcode derivation (memory-hard)
 * - X25519 for key exchange (ephemeral ECDH pattern)
 * - HKDF-SHA512 with random salt for key derivation
 * - AES-256-GCM for authenticated encryption
 *
 * Usage Contexts (must match Python backend):
 * - "client-to-enclave-transport": Messages from client to enclave
 * - "enclave-to-client-transport": Responses from enclave to client
 * - "user-message-storage": User messages stored in database
 * - "assistant-message-storage": Assistant messages stored in database
 * - "org-key-distribution": Org private key encrypted to member
 */

import { x25519 } from '@noble/curves/ed25519';
import { gcm } from '@noble/ciphers/aes';
import { hkdf } from '@noble/hashes/hkdf';
import { sha512 } from '@noble/hashes/sha512';
import { randomBytes } from '@noble/ciphers/webcrypto';
import { argon2id } from 'hash-wasm';

// =============================================================================
// Types
// =============================================================================

/**
 * X25519 keypair container.
 */
export interface KeyPair {
  /** 32-byte private key (KEEP SECRET) */
  privateKey: Uint8Array;
  /** 32-byte public key (safe to share) */
  publicKey: Uint8Array;
}

/**
 * Standard encrypted payload structure for storage/transmission.
 *
 * This structure is used for all encrypt-to-public-key operations.
 * The ephemeral ECDH pattern provides forward secrecy per-message.
 */
export interface EncryptedPayload {
  /** Sender's ephemeral public key for ECDH (32 bytes) */
  ephemeralPublicKey: Uint8Array;
  /** AES-GCM initialization vector (16 bytes) */
  iv: Uint8Array;
  /** Encrypted data (variable length) */
  ciphertext: Uint8Array;
  /** AES-GCM authentication tag (16 bytes) */
  authTag: Uint8Array;
  /** Random salt used in HKDF derivation (32 bytes) */
  hkdfSalt: Uint8Array;
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Convert bytes to hex string.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to bytes.
 */
export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error('Hex string must have even length');
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Compare two byte arrays in constant time.
 * Prevents timing attacks when comparing secrets.
 */
export function secureCompare(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}

// =============================================================================
// Key Generation
// =============================================================================

/**
 * Generate cryptographically secure random bytes.
 *
 * @param length - Number of bytes to generate (default: 32)
 * @returns Random bytes of specified length
 */
export function generateSalt(length: number = 32): Uint8Array {
  return randomBytes(length);
}

/**
 * Generate a new X25519 keypair for key exchange.
 *
 * Uses cryptographically secure random number generation.
 *
 * @returns KeyPair with 32-byte private and public keys
 *
 * @example
 * const keypair = generateX25519Keypair();
 * console.log(keypair.privateKey.length); // 32
 * console.log(keypair.publicKey.length); // 32
 */
export function generateX25519Keypair(): KeyPair {
  const privateKey = randomBytes(32);
  const publicKey = x25519.getPublicKey(privateKey);

  return {
    privateKey,
    publicKey,
  };
}

/**
 * Generate a numeric recovery code.
 *
 * Recovery codes are used as a backup to recover encrypted private keys
 * if the user forgets their passcode.
 *
 * @param length - Number of digits (default: 20)
 * @returns String of random digits (e.g., "12345678901234567890")
 *
 * Security Note:
 *   20 digits = ~66 bits of entropy, sufficient for recovery codes
 *   that are stored offline by users.
 */
export function generateRecoveryCode(length: number = 20): string {
  const bytes = randomBytes(length);
  return Array.from(bytes)
    .map((b) => (b % 10).toString())
    .join('');
}

// =============================================================================
// Key Derivation
// =============================================================================

/**
 * Derive a 32-byte key from a passcode using Argon2id.
 *
 * Argon2id is memory-hard and resistant to GPU/ASIC attacks.
 * The default parameters (t=4, m=128MB, p=2) provide strong protection
 * even for low-entropy passcodes like 6 digits.
 *
 * @param passcode - User's passcode (6+ digits recommended)
 * @param salt - Random 32-byte salt (must be stored for later derivation)
 * @param timeCost - Number of iterations (default: 4)
 * @param memoryCost - Memory in KB (default: 131072 = 128MB)
 * @param parallelism - Number of threads (default: 2)
 * @returns 32-byte derived key
 *
 * @throws Error if passcode is empty or salt is wrong length
 *
 * Security Note:
 *   With these parameters, even a 6-digit passcode (1M combinations)
 *   requires significant resources to brute-force offline.
 */
// Default Argon2id memory cost: 128 MB for strong protection
const DEFAULT_ARGON2_MEMORY = 131072;

export async function deriveKeyFromPasscode(
  passcode: string,
  salt: Uint8Array,
  timeCost: number = 4,
  memoryCost: number = DEFAULT_ARGON2_MEMORY,
  parallelism: number = 2
): Promise<Uint8Array> {
  if (!passcode) {
    throw new Error('Passcode cannot be empty');
  }
  if (salt.length !== 32) {
    throw new Error('Salt must be 32 bytes');
  }

  // Use hash-wasm argon2id - WASM implementation bundled as base64,
  // works in both Node.js (tests) and browser without loading issues
  const hashHex = await argon2id({
    password: passcode,
    salt: salt,
    iterations: timeCost,
    memorySize: memoryCost, // in KB
    parallelism: parallelism,
    hashLength: 32,
    outputType: 'hex',
  });

  return hexToBytes(hashHex);
}

/**
 * Derive a symmetric key from X25519 ECDH shared secret using HKDF-SHA512.
 *
 * This function:
 * 1. Computes the X25519 shared secret
 * 2. Generates a random salt if not provided
 * 3. Derives a 32-byte key using HKDF-SHA512
 *
 * The context string ensures different keys for different purposes
 * even with the same keypair combination.
 *
 * @param privateKey - Our X25519 private key (32 bytes)
 * @param publicKey - Their X25519 public key (32 bytes)
 * @param context - Context string for domain separation
 * @param salt - Optional HKDF salt. If undefined, generates random 32-byte salt.
 * @returns Object with derivedKey and salt (both 32 bytes)
 *
 * @throws Error if keys are wrong length
 *
 * @example
 * const alice = generateX25519Keypair();
 * const bob = generateX25519Keypair();
 * const { derivedKey: key1, salt } = deriveKeyFromEcdh(alice.privateKey, bob.publicKey, "test");
 * const { derivedKey: key2 } = deriveKeyFromEcdh(bob.privateKey, alice.publicKey, "test", salt);
 * // key1 and key2 are identical
 */
export function deriveKeyFromEcdh(
  privateKey: Uint8Array,
  publicKey: Uint8Array,
  context: string,
  salt?: Uint8Array
): { derivedKey: Uint8Array; salt: Uint8Array } {
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }
  if (publicKey.length !== 32) {
    throw new Error('Public key must be 32 bytes');
  }

  // Generate random salt if not provided
  const actualSalt = salt ?? generateSalt(32);
  if (actualSalt.length !== 32) {
    throw new Error('Salt must be 32 bytes');
  }

  // Compute X25519 shared secret
  const sharedSecret = x25519.getSharedSecret(privateKey, publicKey);

  // Derive key using HKDF-SHA512
  const derivedKey = hkdf(
    sha512,
    sharedSecret,
    actualSalt,
    new TextEncoder().encode(context),
    32
  );

  return { derivedKey, salt: actualSalt };
}

// =============================================================================
// Symmetric Encryption (AES-256-GCM)
// =============================================================================

/**
 * Encrypt data using AES-256-GCM.
 *
 * AES-GCM provides both confidentiality and authenticity.
 * A random 16-byte IV is generated for each encryption.
 *
 * @param key - 32-byte encryption key
 * @param plaintext - Data to encrypt
 * @param associatedData - Optional additional authenticated data (AAD)
 * @returns Object with iv, ciphertext, and authTag
 *
 * @throws Error if key is not 32 bytes
 *
 * Security Note:
 *   The IV is randomly generated for each call. Never reuse an IV
 *   with the same key - this is handled automatically.
 */
export function encryptAesGcm(
  key: Uint8Array,
  plaintext: Uint8Array,
  associatedData?: Uint8Array
): { iv: Uint8Array; ciphertext: Uint8Array; authTag: Uint8Array } {
  if (key.length !== 32) {
    throw new Error('Key must be 32 bytes');
  }

  const iv = randomBytes(16);
  const cipher = gcm(key, iv, associatedData);
  const ciphertextWithTag = cipher.encrypt(plaintext);

  // Split ciphertext and tag (tag is last 16 bytes)
  const ciphertext = ciphertextWithTag.slice(0, -16);
  const authTag = ciphertextWithTag.slice(-16);

  return { iv, ciphertext, authTag };
}

/**
 * Decrypt data using AES-256-GCM.
 *
 * Verifies the authentication tag before returning plaintext.
 *
 * @param key - 32-byte decryption key
 * @param iv - 16-byte initialization vector (from encryption)
 * @param ciphertext - Encrypted data
 * @param authTag - 16-byte authentication tag (from encryption)
 * @param associatedData - Optional AAD (must match encryption)
 * @returns Decrypted plaintext
 *
 * @throws Error if key/iv/tag are wrong length or authentication fails
 */
export function decryptAesGcm(
  key: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array,
  authTag: Uint8Array,
  associatedData?: Uint8Array
): Uint8Array {
  if (key.length !== 32) {
    throw new Error('Key must be 32 bytes');
  }
  if (iv.length !== 16) {
    throw new Error('IV must be 16 bytes');
  }
  if (authTag.length !== 16) {
    throw new Error('Auth tag must be 16 bytes');
  }

  // Reconstruct ciphertext + tag
  const ciphertextWithTag = new Uint8Array(ciphertext.length + authTag.length);
  ciphertextWithTag.set(ciphertext);
  ciphertextWithTag.set(authTag, ciphertext.length);

  const cipher = gcm(key, iv, associatedData);
  return cipher.decrypt(ciphertextWithTag);
}

// =============================================================================
// High-Level Encryption (Ephemeral ECDH Pattern)
// =============================================================================

/**
 * Encrypt data to a recipient's public key using ephemeral ECDH.
 *
 * This implements the ephemeral ECDH pattern:
 * 1. Generate ephemeral X25519 keypair
 * 2. Compute shared secret with recipient's public key
 * 3. Derive symmetric key via HKDF with random salt
 * 4. Encrypt with AES-256-GCM
 * 5. Discard ephemeral private key
 *
 * The result can only be decrypted by the holder of the recipient's private key.
 *
 * @param recipientPublicKey - Recipient's X25519 public key (32 bytes)
 * @param plaintext - Data to encrypt
 * @param context - Context string for domain separation
 * @returns EncryptedPayload containing all data needed for decryption
 *
 * @example
 * const recipient = generateX25519Keypair();
 * const payload = encryptToPublicKey(
 *   recipient.publicKey,
 *   new TextEncoder().encode("secret message"),
 *   "user-message-storage"
 * );
 * const plaintext = decryptWithPrivateKey(
 *   recipient.privateKey,
 *   payload,
 *   "user-message-storage"
 * );
 */
export function encryptToPublicKey(
  recipientPublicKey: Uint8Array,
  plaintext: Uint8Array,
  context: string
): EncryptedPayload {
  if (recipientPublicKey.length !== 32) {
    throw new Error('Recipient public key must be 32 bytes');
  }

  // 1. Generate ephemeral keypair
  const ephemeral = generateX25519Keypair();

  // 2-3. ECDH + HKDF with random salt
  const { derivedKey, salt } = deriveKeyFromEcdh(
    ephemeral.privateKey,
    recipientPublicKey,
    context
  );

  // 4. Encrypt
  const { iv, ciphertext, authTag } = encryptAesGcm(derivedKey, plaintext);

  // 5. Ephemeral private key is discarded (goes out of scope)

  return {
    ephemeralPublicKey: ephemeral.publicKey,
    iv,
    ciphertext,
    authTag,
    hkdfSalt: salt,
  };
}

/**
 * Decrypt data encrypted with encryptToPublicKey.
 *
 * This performs the inverse of the ephemeral ECDH pattern:
 * 1. Compute shared secret using our private key and sender's ephemeral public key
 * 2. Derive the same symmetric key via HKDF (using stored salt)
 * 3. Decrypt with AES-256-GCM
 *
 * @param privateKey - Our X25519 private key (32 bytes)
 * @param payload - EncryptedPayload from encryptToPublicKey
 * @param context - Context string (MUST match encryption context)
 * @returns Decrypted plaintext
 *
 * @throws Error if private key is wrong length, context doesn't match, or decryption fails
 */
export function decryptWithPrivateKey(
  privateKey: Uint8Array,
  payload: EncryptedPayload,
  context: string
): Uint8Array {
  if (privateKey.length !== 32) {
    throw new Error('Private key must be 32 bytes');
  }

  // Derive the same symmetric key
  const { derivedKey } = deriveKeyFromEcdh(
    privateKey,
    payload.ephemeralPublicKey,
    context,
    payload.hkdfSalt // Use stored salt
  );

  // Decrypt
  return decryptAesGcm(
    derivedKey,
    payload.iv,
    payload.ciphertext,
    payload.authTag
  );
}
