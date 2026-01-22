/**
 * Message encryption for encrypted chat.
 *
 * This module provides high-level functions for encrypting/decrypting
 * chat messages with the correct context strings.
 *
 * Context strings MUST match the Python backend exactly for interoperability.
 *
 * Encryption Flow:
 * 1. Client encrypts message TO enclave public key (transport encryption)
 * 2. Enclave decrypts, processes with LLM, re-encrypts FOR storage
 * 3. Storage encryption uses user/org public key
 * 4. Client decrypts stored messages with private key
 */

import {
  encryptToPublicKey,
  decryptWithPrivateKey,
  bytesToHex,
  hexToBytes,
  type EncryptedPayload,
} from './primitives';

// =============================================================================
// Context Strings (MUST match Python backend)
// =============================================================================

/**
 * Encryption context strings for domain separation.
 *
 * CRITICAL: These values must exactly match the Python backend's
 * EncryptionContext enum in core/crypto/primitives.py
 */
export const EncryptionContext = {
  /** Client sending message to enclave for processing */
  CLIENT_TO_ENCLAVE: 'client-to-enclave-transport',
  /** Enclave sending response back to client */
  ENCLAVE_TO_CLIENT: 'enclave-to-client-transport',
  /** User messages stored in database */
  USER_MESSAGE_STORAGE: 'user-message-storage',
  /** Assistant messages stored in database */
  ASSISTANT_MESSAGE_STORAGE: 'assistant-message-storage',
  /** Organization key distributed to member */
  ORG_KEY_DISTRIBUTION: 'org-key-distribution',
  /** Memory content stored in database */
  MEMORY_STORAGE: 'memory-storage',
} as const;

export type EncryptionContextType =
  (typeof EncryptionContext)[keyof typeof EncryptionContext];

// =============================================================================
// Serialized Payload Types (for API transmission)
// =============================================================================

/**
 * Encrypted payload serialized for JSON transmission.
 * All binary fields are hex-encoded strings.
 */
export interface SerializedEncryptedPayload {
  ephemeral_public_key: string;
  iv: string;
  ciphertext: string;
  auth_tag: string;
  hkdf_salt: string;
}

/**
 * Message content with optional role information.
 */
export interface EncryptedMessage {
  role: 'user' | 'assistant';
  encrypted_content: SerializedEncryptedPayload;
}

// =============================================================================
// Serialization Helpers
// =============================================================================

/**
 * Serialize EncryptedPayload to JSON-safe format.
 */
export function serializePayload(
  payload: EncryptedPayload
): SerializedEncryptedPayload {
  return {
    ephemeral_public_key: bytesToHex(payload.ephemeralPublicKey),
    iv: bytesToHex(payload.iv),
    ciphertext: bytesToHex(payload.ciphertext),
    auth_tag: bytesToHex(payload.authTag),
    hkdf_salt: bytesToHex(payload.hkdfSalt),
  };
}

/**
 * Deserialize JSON payload to EncryptedPayload.
 */
export function deserializePayload(
  serialized: SerializedEncryptedPayload
): EncryptedPayload {
  return {
    ephemeralPublicKey: hexToBytes(serialized.ephemeral_public_key),
    iv: hexToBytes(serialized.iv),
    ciphertext: hexToBytes(serialized.ciphertext),
    authTag: hexToBytes(serialized.auth_tag),
    hkdfSalt: hexToBytes(serialized.hkdf_salt),
  };
}

// =============================================================================
// Transport Encryption (Client <-> Enclave)
// =============================================================================

/**
 * Encrypt a message for transport to the enclave.
 *
 * This is used when sending a new message from the client to be processed.
 * The enclave will decrypt this using its private key.
 *
 * @param enclavePublicKey - Enclave's transport public key (hex)
 * @param message - Plaintext message content
 * @returns Serialized encrypted payload ready for API transmission
 */
export function encryptMessageToEnclave(
  enclavePublicKey: string,
  message: string
): SerializedEncryptedPayload {
  const payload = encryptToPublicKey(
    hexToBytes(enclavePublicKey),
    new TextEncoder().encode(message),
    EncryptionContext.CLIENT_TO_ENCLAVE
  );
  return serializePayload(payload);
}

/**
 * Decrypt a response received from the enclave.
 *
 * This is used when receiving streaming response chunks from the enclave.
 * The client uses its transport private key to decrypt.
 *
 * @param privateKey - Client's transport private key (hex)
 * @param serialized - Serialized encrypted payload from enclave
 * @returns Decrypted message content
 */
export function decryptMessageFromEnclave(
  privateKey: string,
  serialized: SerializedEncryptedPayload
): string {
  const payload = deserializePayload(serialized);
  const plaintext = decryptWithPrivateKey(
    hexToBytes(privateKey),
    payload,
    EncryptionContext.ENCLAVE_TO_CLIENT
  );
  return new TextDecoder().decode(plaintext);
}

// =============================================================================
// Storage Encryption (Persisted Messages)
// =============================================================================

/**
 * Decrypt a stored message from the database.
 *
 * Messages are stored encrypted to the user's (or org's) public key.
 * The correct context is used based on the message role.
 *
 * @param privateKey - User's or org's private key (hex)
 * @param serialized - Serialized encrypted payload from database
 * @param role - Message role ('user' or 'assistant')
 * @returns Decrypted message content
 */
export function decryptStoredMessage(
  privateKey: string,
  serialized: SerializedEncryptedPayload,
  role: 'user' | 'assistant'
): string {
  const context =
    role === 'user'
      ? EncryptionContext.USER_MESSAGE_STORAGE
      : EncryptionContext.ASSISTANT_MESSAGE_STORAGE;

  const payload = deserializePayload(serialized);
  const plaintext = decryptWithPrivateKey(
    hexToBytes(privateKey),
    payload,
    context
  );
  return new TextDecoder().decode(plaintext);
}

/**
 * Decrypt multiple stored messages in batch.
 *
 * @param privateKey - User's or org's private key (hex)
 * @param messages - Array of encrypted messages with roles
 * @returns Array of decrypted message contents in same order
 */
export function decryptStoredMessages(
  privateKey: string,
  messages: EncryptedMessage[]
): string[] {
  return messages.map((msg) =>
    decryptStoredMessage(privateKey, msg.encrypted_content, msg.role)
  );
}

// =============================================================================
// History Re-encryption (for transport)
// =============================================================================

/**
 * Re-encrypt stored messages for transport to enclave.
 *
 * When sending conversation history to the enclave, we need to:
 * 1. Decrypt each message using our storage key
 * 2. Re-encrypt to the enclave's transport key
 *
 * This ensures the enclave can read the history while maintaining
 * proper encryption boundaries.
 *
 * @param privateKey - User's or org's private key (hex)
 * @param enclavePublicKey - Enclave's transport public key (hex)
 * @param messages - Array of stored encrypted messages
 * @returns Array of re-encrypted payloads for transport
 */
export function reEncryptHistoryForTransport(
  privateKey: string,
  enclavePublicKey: string,
  messages: EncryptedMessage[]
): SerializedEncryptedPayload[] {
  return messages.map((msg) => {
    // Decrypt from storage
    const plaintext = decryptStoredMessage(
      privateKey,
      msg.encrypted_content,
      msg.role
    );
    // Re-encrypt for transport
    return encryptMessageToEnclave(enclavePublicKey, plaintext);
  });
}

// =============================================================================
// Organization Key Distribution
// =============================================================================

/**
 * Decrypt an organization private key distributed to a member.
 *
 * When a member joins an org, the org private key is encrypted to their
 * personal public key. This function decrypts that key.
 *
 * @param memberPrivateKey - Member's personal private key (hex)
 * @param encryptedOrgKey - Encrypted org key payload
 * @returns Decrypted org private key (hex)
 */
export function decryptOrgKey(
  memberPrivateKey: string,
  encryptedOrgKey: SerializedEncryptedPayload
): string {
  const payload = deserializePayload(encryptedOrgKey);
  const orgKeyBytes = decryptWithPrivateKey(
    hexToBytes(memberPrivateKey),
    payload,
    EncryptionContext.ORG_KEY_DISTRIBUTION
  );
  return bytesToHex(orgKeyBytes);
}

/**
 * Encrypt an organization private key to a member's public key.
 *
 * This is used by admins when distributing org keys to new members.
 *
 * @param orgPrivateKey - Organization's private key (hex)
 * @param memberPublicKey - New member's public key (hex)
 * @returns Serialized encrypted payload for the member
 */
export function encryptOrgKeyForMember(
  orgPrivateKey: string,
  memberPublicKey: string
): SerializedEncryptedPayload {
  const payload = encryptToPublicKey(
    hexToBytes(memberPublicKey),
    hexToBytes(orgPrivateKey),
    EncryptionContext.ORG_KEY_DISTRIBUTION
  );
  return serializePayload(payload);
}

// =============================================================================
// Memory Encryption (Stored Memories)
// =============================================================================

/**
 * Decrypt a stored memory from the database.
 *
 * Memories are stored encrypted to the user's (or org's) public key
 * using the MEMORY_STORAGE context.
 *
 * @param privateKey - User's or org's private key (hex)
 * @param serialized - Serialized encrypted payload from database
 * @returns Decrypted memory content
 */
export function decryptStoredMemory(
  privateKey: string,
  serialized: SerializedEncryptedPayload
): string {
  const payload = deserializePayload(serialized);
  const plaintext = decryptWithPrivateKey(
    hexToBytes(privateKey),
    payload,
    EncryptionContext.MEMORY_STORAGE
  );
  return new TextDecoder().decode(plaintext);
}

/**
 * Re-encrypt a memory for transport to enclave.
 *
 * When sending relevant memories to the enclave for context injection,
 * we need to:
 * 1. Decrypt the memory using our storage key
 * 2. Re-encrypt to the enclave's transport key
 *
 * @param privateKey - User's or org's private key (hex)
 * @param enclavePublicKey - Enclave's transport public key (hex)
 * @param encryptedMemory - Encrypted memory from storage
 * @returns Re-encrypted payload for transport to enclave
 */
export function reEncryptMemoryForTransport(
  privateKey: string,
  enclavePublicKey: string,
  encryptedMemory: SerializedEncryptedPayload
): SerializedEncryptedPayload {
  // Decrypt from storage
  const plaintext = decryptStoredMemory(privateKey, encryptedMemory);
  // Re-encrypt for transport
  return encryptMessageToEnclave(enclavePublicKey, plaintext);
}
