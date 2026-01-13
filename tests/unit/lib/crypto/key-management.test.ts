/**
 * Tests for key management module.
 *
 * Tests cover:
 * - Key generation and encryption with passcode
 * - Recovery code generation and encryption
 * - Key decryption with passcode/recovery
 * - Passcode change flow
 * - Serialization helpers
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  generateAndEncryptKeys,
  encryptPrivateKeyWithPasscode,
  decryptPrivateKey,
  decryptPrivateKeyFromResponse,
  decryptPrivateKeyWithRecovery,
  changePasscode,
  toStoreKeysRequest,
  formatRecoveryCode,
  parseRecoveryCode,
  type EncryptedKeyMaterial,
  type KeySetupResult,
} from '@/lib/crypto/key-management';
import { hexToBytes, bytesToHex } from '@/lib/crypto/primitives';

// =============================================================================
// Key Generation Tests
// =============================================================================

describe('Key Generation', () => {
  describe('generateAndEncryptKeys', () => {
    it('generates keys with correct structure', async () => {
      const result = await generateAndEncryptKeys('123456');

      // Personal keys
      expect(result.personal.publicKey).toHaveLength(64); // 32 bytes hex
      expect(result.personal.encryptedPrivateKey.length).toBeGreaterThan(0);
      expect(result.personal.iv).toHaveLength(32); // 16 bytes hex
      expect(result.personal.tag).toHaveLength(32); // 16 bytes hex
      expect(result.personal.salt).toHaveLength(64); // 32 bytes hex

      // Recovery keys
      expect(result.recovery.publicKey).toBe(result.personal.publicKey);
      expect(result.recovery.encryptedPrivateKey.length).toBeGreaterThan(0);
      expect(result.recovery.iv).toHaveLength(32);
      expect(result.recovery.tag).toHaveLength(32);
      expect(result.recovery.salt).toHaveLength(64);

      // Recovery code
      expect(result.recoveryCode).toHaveLength(20);
      expect(/^\d+$/.test(result.recoveryCode)).toBe(true);
    });

    it('uses different salts for passcode and recovery', async () => {
      const result = await generateAndEncryptKeys('123456');
      expect(result.personal.salt).not.toBe(result.recovery.salt);
    });

    it('uses different IVs for passcode and recovery', async () => {
      const result = await generateAndEncryptKeys('123456');
      expect(result.personal.iv).not.toBe(result.recovery.iv);
    });

    it('generates unique recovery codes', async () => {
      const codes = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const result = await generateAndEncryptKeys('123456');
        codes.add(result.recoveryCode);
      }
      expect(codes.size).toBe(10);
    });

    it('rejects short passcode', async () => {
      await expect(generateAndEncryptKeys('12345')).rejects.toThrow(
        'Passcode must be at least 6 characters'
      );
    });

    it('rejects empty passcode', async () => {
      await expect(generateAndEncryptKeys('')).rejects.toThrow(
        'Passcode must be at least 6 characters'
      );
    });
  });

  describe('encryptPrivateKeyWithPasscode', () => {
    it('encrypts private key correctly', async () => {
      // Generate a test private key
      const { personal } = await generateAndEncryptKeys('original');
      const privateKey = await decryptPrivateKey('original', personal);

      // Re-encrypt with new passcode
      const encrypted = await encryptPrivateKeyWithPasscode(
        hexToBytes(privateKey),
        'newpasscode'
      );

      // Verify structure
      expect(encrypted.publicKey).toHaveLength(64);
      expect(encrypted.encryptedPrivateKey.length).toBeGreaterThan(0);
      expect(encrypted.iv).toHaveLength(32);
      expect(encrypted.tag).toHaveLength(32);
      expect(encrypted.salt).toHaveLength(64);
    });

    it('derives correct public key', async () => {
      const { personal } = await generateAndEncryptKeys('original');
      const privateKey = await decryptPrivateKey('original', personal);

      const encrypted = await encryptPrivateKeyWithPasscode(
        hexToBytes(privateKey),
        'newpasscode'
      );

      // Public key should match original
      expect(encrypted.publicKey).toBe(personal.publicKey);
    });

    it('rejects wrong private key length', async () => {
      await expect(
        encryptPrivateKeyWithPasscode(new Uint8Array(31), 'passcode')
      ).rejects.toThrow('Private key must be 32 bytes');
    });
  });
});

// =============================================================================
// Key Decryption Tests
// =============================================================================

describe('Key Decryption', () => {
  let keySetup: KeySetupResult;

  beforeAll(async () => {
    keySetup = await generateAndEncryptKeys('testpasscode');
  });

  describe('decryptPrivateKey', () => {
    it('decrypts with correct passcode', async () => {
      const privateKey = await decryptPrivateKey('testpasscode', keySetup.personal);
      expect(privateKey).toHaveLength(64); // 32 bytes hex
    });

    it('fails with wrong passcode', async () => {
      await expect(
        decryptPrivateKey('wrongpasscode', keySetup.personal)
      ).rejects.toThrow('Incorrect passcode');
    });

    it('produces consistent results', async () => {
      const key1 = await decryptPrivateKey('testpasscode', keySetup.personal);
      const key2 = await decryptPrivateKey('testpasscode', keySetup.personal);
      expect(key1).toBe(key2);
    });
  });

  describe('decryptPrivateKeyFromResponse', () => {
    it('decrypts from API response format', async () => {
      const response = {
        public_key: keySetup.personal.publicKey,
        encrypted_private_key: keySetup.personal.encryptedPrivateKey,
        iv: keySetup.personal.iv,
        tag: keySetup.personal.tag,
        salt: keySetup.personal.salt,
      };

      const privateKey = await decryptPrivateKeyFromResponse('testpasscode', response);
      expect(privateKey).toHaveLength(64);
    });
  });

  describe('decryptPrivateKeyWithRecovery', () => {
    it('decrypts with recovery code', async () => {
      const response = {
        public_key: keySetup.personal.publicKey,
        encrypted_private_key: keySetup.personal.encryptedPrivateKey,
        iv: keySetup.personal.iv,
        tag: keySetup.personal.tag,
        salt: keySetup.personal.salt,
        recovery_encrypted_private_key: keySetup.recovery.encryptedPrivateKey,
        recovery_iv: keySetup.recovery.iv,
        recovery_tag: keySetup.recovery.tag,
        recovery_salt: keySetup.recovery.salt,
      };

      const privateKey = await decryptPrivateKeyWithRecovery(
        keySetup.recoveryCode,
        response
      );
      expect(privateKey).toHaveLength(64);
    });

    it('recovers same key as passcode', async () => {
      const response = {
        public_key: keySetup.personal.publicKey,
        encrypted_private_key: keySetup.personal.encryptedPrivateKey,
        iv: keySetup.personal.iv,
        tag: keySetup.personal.tag,
        salt: keySetup.personal.salt,
        recovery_encrypted_private_key: keySetup.recovery.encryptedPrivateKey,
        recovery_iv: keySetup.recovery.iv,
        recovery_tag: keySetup.recovery.tag,
        recovery_salt: keySetup.recovery.salt,
      };

      const passcodeKey = await decryptPrivateKeyFromResponse('testpasscode', response);
      const recoveryKey = await decryptPrivateKeyWithRecovery(
        keySetup.recoveryCode,
        response
      );

      expect(passcodeKey).toBe(recoveryKey);
    });

    it('fails without recovery keys in response', async () => {
      const response = {
        public_key: keySetup.personal.publicKey,
        encrypted_private_key: keySetup.personal.encryptedPrivateKey,
        iv: keySetup.personal.iv,
        tag: keySetup.personal.tag,
        salt: keySetup.personal.salt,
      };

      await expect(
        decryptPrivateKeyWithRecovery(keySetup.recoveryCode, response)
      ).rejects.toThrow('Recovery keys not available');
    });

    it('fails with wrong recovery code', async () => {
      const response = {
        public_key: keySetup.personal.publicKey,
        encrypted_private_key: keySetup.personal.encryptedPrivateKey,
        iv: keySetup.personal.iv,
        tag: keySetup.personal.tag,
        salt: keySetup.personal.salt,
        recovery_encrypted_private_key: keySetup.recovery.encryptedPrivateKey,
        recovery_iv: keySetup.recovery.iv,
        recovery_tag: keySetup.recovery.tag,
        recovery_salt: keySetup.recovery.salt,
      };

      await expect(
        decryptPrivateKeyWithRecovery('12345678901234567890', response)
      ).rejects.toThrow('Incorrect passcode');
    });
  });
});

// =============================================================================
// Passcode Change Tests
// =============================================================================

describe('Passcode Change', () => {
  it('changes passcode successfully', async () => {
    const original = await generateAndEncryptKeys('oldpasscode');
    const newEncrypted = await changePasscode(
      'oldpasscode',
      'newpasscode',
      original.personal
    );

    // Can decrypt with new passcode
    const privateKey = await decryptPrivateKey('newpasscode', newEncrypted);
    expect(privateKey).toHaveLength(64);

    // Cannot decrypt with old passcode
    await expect(
      decryptPrivateKey('oldpasscode', newEncrypted)
    ).rejects.toThrow('Incorrect passcode');
  });

  it('preserves private key through change', async () => {
    const original = await generateAndEncryptKeys('oldpasscode');
    const originalKey = await decryptPrivateKey('oldpasscode', original.personal);

    const newEncrypted = await changePasscode(
      'oldpasscode',
      'newpasscode',
      original.personal
    );
    const newKey = await decryptPrivateKey('newpasscode', newEncrypted);

    expect(newKey).toBe(originalKey);
  });

  it('rejects short new passcode', async () => {
    const original = await generateAndEncryptKeys('oldpasscode');

    await expect(
      changePasscode('oldpasscode', '12345', original.personal)
    ).rejects.toThrow('New passcode must be at least 6 characters');
  });

  it('rejects wrong current passcode', async () => {
    const original = await generateAndEncryptKeys('oldpasscode');

    await expect(
      changePasscode('wrongpasscode', 'newpasscode', original.personal)
    ).rejects.toThrow('Incorrect passcode');
  });
});

// =============================================================================
// Serialization Tests
// =============================================================================

describe('Serialization', () => {
  describe('toStoreKeysRequest', () => {
    it('converts to API format correctly', async () => {
      const result = await generateAndEncryptKeys('123456');
      const request = toStoreKeysRequest(result);

      expect(request.public_key).toBe(result.personal.publicKey);
      expect(request.encrypted_private_key).toBe(result.personal.encryptedPrivateKey);
      expect(request.iv).toBe(result.personal.iv);
      expect(request.tag).toBe(result.personal.tag);
      expect(request.salt).toBe(result.personal.salt);
      expect(request.recovery_encrypted_private_key).toBe(result.recovery.encryptedPrivateKey);
      expect(request.recovery_iv).toBe(result.recovery.iv);
      expect(request.recovery_tag).toBe(result.recovery.tag);
      expect(request.recovery_salt).toBe(result.recovery.salt);
    });
  });

  describe('formatRecoveryCode', () => {
    it('formats code in groups of 4', () => {
      expect(formatRecoveryCode('12345678901234567890')).toBe('1234-5678-9012-3456-7890');
    });

    it('handles codes not divisible by 4', () => {
      expect(formatRecoveryCode('123456789012345678901')).toBe('1234-5678-9012-3456-7890-1');
    });

    it('handles short codes', () => {
      expect(formatRecoveryCode('123')).toBe('123');
    });
  });

  describe('parseRecoveryCode', () => {
    it('removes dashes from formatted code', () => {
      expect(parseRecoveryCode('1234-5678-9012-3456-7890')).toBe('12345678901234567890');
    });

    it('handles code without dashes', () => {
      expect(parseRecoveryCode('12345678901234567890')).toBe('12345678901234567890');
    });
  });

  it('format and parse are inverse operations', () => {
    const original = '12345678901234567890';
    const formatted = formatRecoveryCode(original);
    const parsed = parseRecoveryCode(formatted);
    expect(parsed).toBe(original);
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  it('full key lifecycle', async () => {
    // 1. Generate and encrypt keys
    const result = await generateAndEncryptKeys('mypasscode');

    // 2. Simulate storing on server
    const stored = toStoreKeysRequest(result);

    // 3. Simulate fetching and unlocking with passcode
    const response = {
      public_key: stored.public_key,
      encrypted_private_key: stored.encrypted_private_key,
      iv: stored.iv,
      tag: stored.tag,
      salt: stored.salt,
      recovery_encrypted_private_key: stored.recovery_encrypted_private_key,
      recovery_iv: stored.recovery_iv,
      recovery_tag: stored.recovery_tag,
      recovery_salt: stored.recovery_salt,
    };

    const privateKey = await decryptPrivateKeyFromResponse('mypasscode', response);

    // 4. Verify private key works
    expect(privateKey).toHaveLength(64);

    // 5. Later, recover with recovery code
    const recoveredKey = await decryptPrivateKeyWithRecovery(
      result.recoveryCode,
      response
    );
    expect(recoveredKey).toBe(privateKey);

    // 6. Change passcode
    const newEncrypted = await changePasscode(
      'mypasscode',
      'newpasscode',
      result.personal
    );

    const keyAfterChange = await decryptPrivateKey('newpasscode', newEncrypted);
    expect(keyAfterChange).toBe(privateKey);
  });
});
