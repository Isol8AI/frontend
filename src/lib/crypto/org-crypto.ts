/**
 * Cryptographic operations for organization key distribution.
 *
 * This module handles the admin workflow for distributing org keys to members:
 * 1. Admin decrypts their copy of the org key (using personal private key)
 * 2. Admin re-encrypts the org key TO each member's public key
 * 3. Each member can then decrypt using their personal private key
 *
 * Security Properties:
 * - Org private key never exposed to server
 * - Each member gets a unique encrypted copy
 * - Only the member can decrypt their copy
 */

import {
  type EncryptedPayload,
  encryptToPublicKey,
  decryptWithPrivateKey,
  hexToBytes,
} from './primitives';
import type { SerializedEncryptedPayload } from './message-crypto';

const ORG_KEY_DISTRIBUTION_CONTEXT = 'org-key-distribution';

// =============================================================================
// Types
// =============================================================================

export interface MemberKeyDistribution {
  membershipId: string;
  encryptedOrgKey: SerializedEncryptedPayload;
}

// =============================================================================
// Key Distribution Functions
// =============================================================================

/**
 * Distribute org key to a single member.
 *
 * @param adminPrivateKey - Admin's personal private key (hex string)
 * @param adminEncryptedOrgKey - Org key encrypted to admin's public key
 * @param memberPublicKey - New member's public key (hex string)
 * @returns Org key encrypted to member's public key
 *
 * @throws Error if decryption or encryption fails
 */
export function distributeOrgKeyToMember(
  adminPrivateKey: string,
  adminEncryptedOrgKey: SerializedEncryptedPayload,
  memberPublicKey: string
): SerializedEncryptedPayload {
  // 1. Convert admin's encrypted org key to bytes
  const adminPayload: EncryptedPayload = {
    ephemeralPublicKey: hexToBytes(adminEncryptedOrgKey.ephemeral_public_key),
    iv: hexToBytes(adminEncryptedOrgKey.iv),
    ciphertext: hexToBytes(adminEncryptedOrgKey.ciphertext),
    authTag: hexToBytes(adminEncryptedOrgKey.auth_tag),
    hkdfSalt: hexToBytes(adminEncryptedOrgKey.hkdf_salt),
  };

  // 2. Admin decrypts org key using their personal private key
  const orgKeyBytes = decryptWithPrivateKey(
    hexToBytes(adminPrivateKey),
    adminPayload,
    ORG_KEY_DISTRIBUTION_CONTEXT
  );

  // 3. Re-encrypt org key TO member's public key
  const memberPayload = encryptToPublicKey(
    hexToBytes(memberPublicKey),
    orgKeyBytes,
    ORG_KEY_DISTRIBUTION_CONTEXT
  );

  // 4. Convert to serialized format
  return {
    ephemeral_public_key: bytesToHex(memberPayload.ephemeralPublicKey),
    iv: bytesToHex(memberPayload.iv),
    ciphertext: bytesToHex(memberPayload.ciphertext),
    auth_tag: bytesToHex(memberPayload.authTag),
    hkdf_salt: bytesToHex(memberPayload.hkdfSalt),
  };
}

/**
 * Batch distribute org key to multiple members.
 *
 * More efficient than calling distributeOrgKeyToMember repeatedly
 * because we only decrypt the org key once.
 *
 * @param adminPrivateKey - Admin's personal private key (hex string)
 * @param adminEncryptedOrgKey - Org key encrypted to admin's public key
 * @param members - Array of members with their public keys
 * @returns Array of membership IDs with encrypted org keys
 */
export function distributeOrgKeyToMembers(
  adminPrivateKey: string,
  adminEncryptedOrgKey: SerializedEncryptedPayload,
  members: Array<{ membershipId: string; publicKey: string }>
): MemberKeyDistribution[] {
  // 1. Convert admin's encrypted org key to bytes
  const adminPayload: EncryptedPayload = {
    ephemeralPublicKey: hexToBytes(adminEncryptedOrgKey.ephemeral_public_key),
    iv: hexToBytes(adminEncryptedOrgKey.iv),
    ciphertext: hexToBytes(adminEncryptedOrgKey.ciphertext),
    authTag: hexToBytes(adminEncryptedOrgKey.auth_tag),
    hkdfSalt: hexToBytes(adminEncryptedOrgKey.hkdf_salt),
  };

  // 2. Decrypt org key once (expensive operation)
  const orgKeyBytes = decryptWithPrivateKey(
    hexToBytes(adminPrivateKey),
    adminPayload,
    ORG_KEY_DISTRIBUTION_CONTEXT
  );

  // 3. Encrypt to each member's public key
  return members.map(({ membershipId, publicKey }) => {
    const memberPayload = encryptToPublicKey(
      hexToBytes(publicKey),
      orgKeyBytes,
      ORG_KEY_DISTRIBUTION_CONTEXT
    );

    return {
      membershipId,
      encryptedOrgKey: {
        ephemeral_public_key: bytesToHex(memberPayload.ephemeralPublicKey),
        iv: bytesToHex(memberPayload.iv),
        ciphertext: bytesToHex(memberPayload.ciphertext),
        auth_tag: bytesToHex(memberPayload.authTag),
        hkdf_salt: bytesToHex(memberPayload.hkdfSalt),
      },
    };
  });
}

/**
 * Decrypt org key that was distributed to this user.
 *
 * Used by members to access the org private key for decrypting org messages.
 *
 * @param userPrivateKey - User's personal private key (hex string)
 * @param encryptedOrgKey - Org key encrypted to user's public key
 * @returns Org private key as hex string
 */
export function decryptDistributedOrgKey(
  userPrivateKey: string,
  encryptedOrgKey: SerializedEncryptedPayload
): string {
  const payload: EncryptedPayload = {
    ephemeralPublicKey: hexToBytes(encryptedOrgKey.ephemeral_public_key),
    iv: hexToBytes(encryptedOrgKey.iv),
    ciphertext: hexToBytes(encryptedOrgKey.ciphertext),
    authTag: hexToBytes(encryptedOrgKey.auth_tag),
    hkdfSalt: hexToBytes(encryptedOrgKey.hkdf_salt),
  };

  const orgKeyBytes = decryptWithPrivateKey(
    hexToBytes(userPrivateKey),
    payload,
    ORG_KEY_DISTRIBUTION_CONTEXT
  );

  return bytesToHex(orgKeyBytes);
}

// =============================================================================
// Helper - bytesToHex (imported from primitives but also defined here for clarity)
// =============================================================================

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
