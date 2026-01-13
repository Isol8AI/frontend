/**
 * Cryptographic primitives package for zero-trust encryption.
 * Browser-compatible, cross-platform with Python backend.
 */

// =============================================================================
// Core Primitives (low-level crypto operations)
// =============================================================================
export {
  type KeyPair,
  type EncryptedPayload,
  generateX25519Keypair,
  deriveKeyFromPasscode,
  deriveKeyFromEcdh,
  encryptAesGcm,
  decryptAesGcm,
  encryptToPublicKey,
  decryptWithPrivateKey,
  generateSalt,
  generateRecoveryCode,
  secureCompare,
  bytesToHex,
  hexToBytes,
} from './primitives';

// =============================================================================
// Key Management (passcode encryption, recovery codes)
// =============================================================================
export {
  type EncryptedKeyMaterial,
  type KeySetupResult,
  type StoreKeysRequest,
  type FetchKeysResponse,
  generateAndEncryptKeys,
  encryptPrivateKeyWithPasscode,
  decryptPrivateKey,
  decryptPrivateKeyFromResponse,
  decryptPrivateKeyWithRecovery,
  changePasscode,
  toStoreKeysRequest,
  formatRecoveryCode,
  parseRecoveryCode,
} from './key-management';

// =============================================================================
// Message Encryption (chat encryption with context strings)
// =============================================================================
export {
  EncryptionContext,
  type EncryptionContextType,
  type SerializedEncryptedPayload,
  type EncryptedMessage,
  serializePayload,
  deserializePayload,
  encryptMessageToEnclave,
  decryptMessageFromEnclave,
  decryptStoredMessage,
  decryptStoredMessages,
  reEncryptHistoryForTransport,
  decryptOrgKey,
  encryptOrgKeyForMember,
} from './message-crypto';

// =============================================================================
// Org Key Distribution (admin operations for distributing org keys)
// =============================================================================
export {
  type MemberKeyDistribution,
  distributeOrgKeyToMember,
  distributeOrgKeyToMembers,
  decryptDistributedOrgKey,
} from './org-crypto';
