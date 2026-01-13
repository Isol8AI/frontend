/**
 * Comprehensive tests for TypeScript cryptographic primitives.
 *
 * These tests verify:
 * - Correct implementation of all crypto operations
 * - Edge cases and error handling
 * - Security properties (randomness, authentication)
 */
import { describe, it, expect } from 'vitest';
import {
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
} from '@/lib/crypto/primitives';

// =============================================================================
// Key Generation Tests
// =============================================================================

describe('Key Generation', () => {
  describe('generateX25519Keypair', () => {
    it('generates keypair with correct lengths', () => {
      const keypair = generateX25519Keypair();
      expect(keypair.privateKey.length).toBe(32);
      expect(keypair.publicKey.length).toBe(32);
    });

    it('generates unique keypairs', () => {
      const keypairs = Array.from({ length: 100 }, () => generateX25519Keypair());
      const privateKeys = new Set(keypairs.map((kp) => bytesToHex(kp.privateKey)));
      const publicKeys = new Set(keypairs.map((kp) => bytesToHex(kp.publicKey)));
      expect(privateKeys.size).toBe(100);
      expect(publicKeys.size).toBe(100);
    });
  });

  describe('generateSalt', () => {
    it('generates 32 bytes by default', () => {
      const salt = generateSalt();
      expect(salt.length).toBe(32);
    });

    it('respects custom length', () => {
      const salt = generateSalt(64);
      expect(salt.length).toBe(64);
    });

    it('generates unique salts', () => {
      const salts = new Set(
        Array.from({ length: 100 }, () => bytesToHex(generateSalt()))
      );
      expect(salts.size).toBe(100);
    });
  });

  describe('generateRecoveryCode', () => {
    it('generates 20 digits by default', () => {
      const code = generateRecoveryCode();
      expect(code.length).toBe(20);
      expect(/^\d+$/.test(code)).toBe(true);
    });

    it('respects custom length', () => {
      const code = generateRecoveryCode(10);
      expect(code.length).toBe(10);
      expect(/^\d+$/.test(code)).toBe(true);
    });

    it('generates unique codes', () => {
      const codes = new Set(Array.from({ length: 100 }, () => generateRecoveryCode()));
      expect(codes.size).toBe(100);
    });
  });
});

// =============================================================================
// Passcode Derivation Tests
// =============================================================================

describe('Passcode Derivation', () => {
  // Use fast parameters for testing
  const TEST_PARAMS = {
    timeCost: 1,
    memoryCost: 16384, // 16 MB
    parallelism: 1,
  };

  it('derives 32-byte key', async () => {
    const salt = generateSalt();
    const key = await deriveKeyFromPasscode(
      '123456',
      salt,
      TEST_PARAMS.timeCost,
      TEST_PARAMS.memoryCost,
      TEST_PARAMS.parallelism
    );
    expect(key.length).toBe(32);
  });

  it('is deterministic with same inputs', async () => {
    const salt = generateSalt();
    const key1 = await deriveKeyFromPasscode(
      '123456',
      salt,
      TEST_PARAMS.timeCost,
      TEST_PARAMS.memoryCost,
      TEST_PARAMS.parallelism
    );
    const key2 = await deriveKeyFromPasscode(
      '123456',
      salt,
      TEST_PARAMS.timeCost,
      TEST_PARAMS.memoryCost,
      TEST_PARAMS.parallelism
    );
    expect(bytesToHex(key1)).toBe(bytesToHex(key2));
  });

  it('produces different keys for different passcodes', async () => {
    const salt = generateSalt();
    const key1 = await deriveKeyFromPasscode(
      '123456',
      salt,
      TEST_PARAMS.timeCost,
      TEST_PARAMS.memoryCost,
      TEST_PARAMS.parallelism
    );
    const key2 = await deriveKeyFromPasscode(
      '654321',
      salt,
      TEST_PARAMS.timeCost,
      TEST_PARAMS.memoryCost,
      TEST_PARAMS.parallelism
    );
    expect(bytesToHex(key1)).not.toBe(bytesToHex(key2));
  });

  it('produces different keys for different salts', async () => {
    const key1 = await deriveKeyFromPasscode(
      '123456',
      generateSalt(),
      TEST_PARAMS.timeCost,
      TEST_PARAMS.memoryCost,
      TEST_PARAMS.parallelism
    );
    const key2 = await deriveKeyFromPasscode(
      '123456',
      generateSalt(),
      TEST_PARAMS.timeCost,
      TEST_PARAMS.memoryCost,
      TEST_PARAMS.parallelism
    );
    expect(bytesToHex(key1)).not.toBe(bytesToHex(key2));
  });

  it('rejects empty passcode', async () => {
    await expect(
      deriveKeyFromPasscode(
        '',
        generateSalt(),
        TEST_PARAMS.timeCost,
        TEST_PARAMS.memoryCost,
        TEST_PARAMS.parallelism
      )
    ).rejects.toThrow('Passcode cannot be empty');
  });

  it('rejects wrong salt length', async () => {
    await expect(
      deriveKeyFromPasscode(
        '123456',
        new Uint8Array(16),
        TEST_PARAMS.timeCost,
        TEST_PARAMS.memoryCost,
        TEST_PARAMS.parallelism
      )
    ).rejects.toThrow('Salt must be 32 bytes');
  });
});

// =============================================================================
// ECDH Derivation Tests
// =============================================================================

describe('ECDH Derivation', () => {
  it('derives 32-byte key', () => {
    const alice = generateX25519Keypair();
    const bob = generateX25519Keypair();
    const { derivedKey, salt } = deriveKeyFromEcdh(
      alice.privateKey,
      bob.publicKey,
      'test-context'
    );
    expect(derivedKey.length).toBe(32);
    expect(salt.length).toBe(32);
  });

  it('is symmetric (both parties get same key)', () => {
    const alice = generateX25519Keypair();
    const bob = generateX25519Keypair();

    const { derivedKey: key1, salt } = deriveKeyFromEcdh(
      alice.privateKey,
      bob.publicKey,
      'test-context'
    );
    const { derivedKey: key2 } = deriveKeyFromEcdh(
      bob.privateKey,
      alice.publicKey,
      'test-context',
      salt
    );

    expect(bytesToHex(key1)).toBe(bytesToHex(key2));
  });

  it('produces different keys for different contexts', () => {
    const alice = generateX25519Keypair();
    const bob = generateX25519Keypair();
    const salt = generateSalt();

    const { derivedKey: key1 } = deriveKeyFromEcdh(
      alice.privateKey,
      bob.publicKey,
      'context-a',
      salt
    );
    const { derivedKey: key2 } = deriveKeyFromEcdh(
      alice.privateKey,
      bob.publicKey,
      'context-b',
      salt
    );

    expect(bytesToHex(key1)).not.toBe(bytesToHex(key2));
  });

  it('produces different keys for different salts', () => {
    const alice = generateX25519Keypair();
    const bob = generateX25519Keypair();

    const { derivedKey: key1 } = deriveKeyFromEcdh(
      alice.privateKey,
      bob.publicKey,
      'test',
      generateSalt()
    );
    const { derivedKey: key2 } = deriveKeyFromEcdh(
      alice.privateKey,
      bob.publicKey,
      'test',
      generateSalt()
    );

    expect(bytesToHex(key1)).not.toBe(bytesToHex(key2));
  });

  it('generates random salt if not provided', () => {
    const alice = generateX25519Keypair();
    const bob = generateX25519Keypair();

    const { salt: salt1 } = deriveKeyFromEcdh(alice.privateKey, bob.publicKey, 'test');
    const { salt: salt2 } = deriveKeyFromEcdh(alice.privateKey, bob.publicKey, 'test');

    expect(bytesToHex(salt1)).not.toBe(bytesToHex(salt2));
  });

  it('rejects wrong key lengths', () => {
    expect(() =>
      deriveKeyFromEcdh(new Uint8Array(31), new Uint8Array(32), 'test')
    ).toThrow('Private key must be 32 bytes');

    expect(() =>
      deriveKeyFromEcdh(new Uint8Array(32), new Uint8Array(31), 'test')
    ).toThrow('Public key must be 32 bytes');
  });

  it('rejects wrong salt length', () => {
    const alice = generateX25519Keypair();
    const bob = generateX25519Keypair();

    expect(() =>
      deriveKeyFromEcdh(alice.privateKey, bob.publicKey, 'test', new Uint8Array(16))
    ).toThrow('Salt must be 32 bytes');
  });
});

// =============================================================================
// AES-GCM Tests
// =============================================================================

describe('AES-GCM', () => {
  const key = generateSalt(32);

  it('encrypts and decrypts correctly', () => {
    const plaintext = new TextEncoder().encode('Hello, World!');
    const { iv, ciphertext, authTag } = encryptAesGcm(key, plaintext);
    const result = decryptAesGcm(key, iv, ciphertext, authTag);
    expect(new TextDecoder().decode(result)).toBe('Hello, World!');
  });

  it('produces unique IV each time', () => {
    const plaintext = new TextEncoder().encode('test');
    const ivs = new Set(
      Array.from({ length: 100 }, () => bytesToHex(encryptAesGcm(key, plaintext).iv))
    );
    expect(ivs.size).toBe(100);
  });

  it('produces ciphertext same length as plaintext', () => {
    const plaintext = new Uint8Array(100).fill(0x78);
    const { ciphertext } = encryptAesGcm(key, plaintext);
    expect(ciphertext.length).toBe(plaintext.length);
  });

  it('produces 16-byte IV', () => {
    const { iv } = encryptAesGcm(key, new TextEncoder().encode('test'));
    expect(iv.length).toBe(16);
  });

  it('produces 16-byte auth tag', () => {
    const { authTag } = encryptAesGcm(key, new TextEncoder().encode('test'));
    expect(authTag.length).toBe(16);
  });

  it('fails with wrong key', () => {
    const plaintext = new TextEncoder().encode('secret');
    const { iv, ciphertext, authTag } = encryptAesGcm(key, plaintext);
    const wrongKey = generateSalt(32);

    expect(() => decryptAesGcm(wrongKey, iv, ciphertext, authTag)).toThrow();
  });

  it('fails with tampered ciphertext', () => {
    const plaintext = new TextEncoder().encode('secret');
    const { iv, ciphertext, authTag } = encryptAesGcm(key, plaintext);
    const tampered = new Uint8Array(ciphertext);
    tampered[0] ^= 1;

    expect(() => decryptAesGcm(key, iv, tampered, authTag)).toThrow();
  });

  it('fails with tampered auth tag', () => {
    const plaintext = new TextEncoder().encode('secret');
    const { iv, ciphertext, authTag } = encryptAesGcm(key, plaintext);
    const tamperedTag = new Uint8Array(authTag);
    tamperedTag[0] ^= 1;

    expect(() => decryptAesGcm(key, iv, ciphertext, tamperedTag)).toThrow();
  });

  it('authenticates associated data', () => {
    const plaintext = new TextEncoder().encode('message');
    const aad = new TextEncoder().encode('metadata');

    const { iv, ciphertext, authTag } = encryptAesGcm(key, plaintext, aad);
    const result = decryptAesGcm(key, iv, ciphertext, authTag, aad);
    expect(new TextDecoder().decode(result)).toBe('message');
  });

  it('fails with wrong associated data', () => {
    const plaintext = new TextEncoder().encode('message');
    const aad = new TextEncoder().encode('metadata');

    const { iv, ciphertext, authTag } = encryptAesGcm(key, plaintext, aad);
    const wrongAad = new TextEncoder().encode('wrong');

    expect(() => decryptAesGcm(key, iv, ciphertext, authTag, wrongAad)).toThrow();
  });

  it('fails with missing associated data when required', () => {
    const plaintext = new TextEncoder().encode('message');
    const aad = new TextEncoder().encode('metadata');

    const { iv, ciphertext, authTag } = encryptAesGcm(key, plaintext, aad);

    expect(() => decryptAesGcm(key, iv, ciphertext, authTag)).toThrow();
  });

  it('rejects wrong key length', () => {
    expect(() => encryptAesGcm(new Uint8Array(16), new Uint8Array(10))).toThrow(
      'Key must be 32 bytes'
    );
  });

  it('rejects wrong IV length on decrypt', () => {
    expect(() =>
      decryptAesGcm(key, new Uint8Array(15), new Uint8Array(10), new Uint8Array(16))
    ).toThrow('IV must be 16 bytes');
  });

  it('rejects wrong auth tag length on decrypt', () => {
    expect(() =>
      decryptAesGcm(key, new Uint8Array(16), new Uint8Array(10), new Uint8Array(15))
    ).toThrow('Auth tag must be 16 bytes');
  });
});

// =============================================================================
// Public Key Encryption Tests
// =============================================================================

describe('Public Key Encryption', () => {
  it('encrypts and decrypts correctly', () => {
    const recipient = generateX25519Keypair();
    const plaintext = new TextEncoder().encode('Hello, recipient!');
    const context = 'test-context';

    const payload = encryptToPublicKey(recipient.publicKey, plaintext, context);
    const result = decryptWithPrivateKey(recipient.privateKey, payload, context);

    expect(new TextDecoder().decode(result)).toBe('Hello, recipient!');
  });

  it('uses unique ephemeral key each time', () => {
    const recipient = generateX25519Keypair();
    const plaintext = new TextEncoder().encode('test');

    const payloads = Array.from({ length: 100 }, () =>
      encryptToPublicKey(recipient.publicKey, plaintext, 'test')
    );
    const ephemeralKeys = new Set(
      payloads.map((p) => bytesToHex(p.ephemeralPublicKey))
    );

    expect(ephemeralKeys.size).toBe(100);
  });

  it('payload has correct field lengths', () => {
    const recipient = generateX25519Keypair();
    const payload = encryptToPublicKey(
      recipient.publicKey,
      new TextEncoder().encode('test'),
      'ctx'
    );

    expect(payload.ephemeralPublicKey.length).toBe(32);
    expect(payload.iv.length).toBe(16);
    expect(payload.authTag.length).toBe(16);
    expect(payload.hkdfSalt.length).toBe(32);
  });

  it('fails with wrong private key', () => {
    const recipient = generateX25519Keypair();
    const attacker = generateX25519Keypair();

    const payload = encryptToPublicKey(
      recipient.publicKey,
      new TextEncoder().encode('secret'),
      'ctx'
    );

    expect(() => decryptWithPrivateKey(attacker.privateKey, payload, 'ctx')).toThrow();
  });

  it('fails with wrong context', () => {
    const recipient = generateX25519Keypair();

    const payload = encryptToPublicKey(
      recipient.publicKey,
      new TextEncoder().encode('secret'),
      'context-a'
    );

    expect(() =>
      decryptWithPrivateKey(recipient.privateKey, payload, 'context-b')
    ).toThrow();
  });

  it('handles large messages', () => {
    const recipient = generateX25519Keypair();
    const plaintext = new Uint8Array(1_000_000).fill(0x78); // 1 MB

    const payload = encryptToPublicKey(recipient.publicKey, plaintext, 'large');
    const result = decryptWithPrivateKey(recipient.privateKey, payload, 'large');

    expect(result.length).toBe(plaintext.length);
    expect(bytesToHex(result)).toBe(bytesToHex(plaintext));
  });

  it('handles empty message', () => {
    const recipient = generateX25519Keypair();

    const payload = encryptToPublicKey(recipient.publicKey, new Uint8Array(0), 'empty');
    const result = decryptWithPrivateKey(recipient.privateKey, payload, 'empty');

    expect(result.length).toBe(0);
  });

  it('rejects wrong public key length', () => {
    expect(() =>
      encryptToPublicKey(
        new Uint8Array(31),
        new TextEncoder().encode('test'),
        'ctx'
      )
    ).toThrow('Recipient public key must be 32 bytes');
  });

  it('rejects wrong private key length on decrypt', () => {
    const recipient = generateX25519Keypair();
    const payload = encryptToPublicKey(
      recipient.publicKey,
      new TextEncoder().encode('test'),
      'ctx'
    );

    expect(() =>
      decryptWithPrivateKey(new Uint8Array(31), payload, 'ctx')
    ).toThrow('Private key must be 32 bytes');
  });
});

// =============================================================================
// Utility Tests
// =============================================================================

describe('Utilities', () => {
  describe('secureCompare', () => {
    it('returns true for equal arrays', () => {
      const a = new TextEncoder().encode('hello');
      expect(secureCompare(a, a)).toBe(true);
      expect(
        secureCompare(new TextEncoder().encode('test'), new TextEncoder().encode('test'))
      ).toBe(true);
    });

    it('returns false for different arrays', () => {
      expect(
        secureCompare(new TextEncoder().encode('hello'), new TextEncoder().encode('world'))
      ).toBe(false);
    });

    it('returns false for different lengths', () => {
      expect(
        secureCompare(new TextEncoder().encode('short'), new TextEncoder().encode('longer'))
      ).toBe(false);
    });
  });

  describe('hex conversion', () => {
    it('converts bytes to hex', () => {
      expect(bytesToHex(new Uint8Array([0x00, 0xff, 0x10]))).toBe('00ff10');
    });

    it('converts hex to bytes', () => {
      const bytes = hexToBytes('00ff10');
      expect(bytes[0]).toBe(0x00);
      expect(bytes[1]).toBe(0xff);
      expect(bytes[2]).toBe(0x10);
    });

    it('roundtrips correctly', () => {
      const original = generateSalt(32);
      const hex = bytesToHex(original);
      const recovered = hexToBytes(hex);
      expect(bytesToHex(recovered)).toBe(bytesToHex(original));
    });

    it('rejects odd-length hex', () => {
      expect(() => hexToBytes('abc')).toThrow('Hex string must have even length');
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  it('user key encryption flow', async () => {
    // Use fast parameters for test
    const params = { timeCost: 1, memoryCost: 16384, parallelism: 1 };

    // 1. Generate user keypair
    const user = generateX25519Keypair();
    const passcode = '123456';
    const salt = generateSalt();

    // 2. Encrypt private key with passcode
    const passcodeKey = await deriveKeyFromPasscode(
      passcode,
      salt,
      params.timeCost,
      params.memoryCost,
      params.parallelism
    );
    const { iv, ciphertext, authTag } = encryptAesGcm(passcodeKey, user.privateKey);

    // 3. "Store" in database
    const stored = {
      publicKey: user.publicKey,
      encryptedPrivateKey: ciphertext,
      iv,
      tag: authTag,
      salt,
    };

    // 4-5. Later: unlock with passcode
    const derivedKey = await deriveKeyFromPasscode(
      passcode,
      stored.salt,
      params.timeCost,
      params.memoryCost,
      params.parallelism
    );
    const recoveredPrivate = decryptAesGcm(
      derivedKey,
      stored.iv,
      stored.encryptedPrivateKey,
      stored.tag
    );

    expect(bytesToHex(recoveredPrivate)).toBe(bytesToHex(user.privateKey));

    // 6. Use to decrypt a message
    const message = new TextEncoder().encode('Secret message for user');
    const payload = encryptToPublicKey(stored.publicKey, message, 'test');
    const decrypted = decryptWithPrivateKey(recoveredPrivate, payload, 'test');

    expect(new TextDecoder().decode(decrypted)).toBe('Secret message for user');
  });

  it('org key distribution flow', async () => {
    const params = { timeCost: 1, memoryCost: 16384, parallelism: 1 };

    // 1. Create org keypair
    const org = generateX25519Keypair();
    const orgPasscode = 'admin123';
    const orgSalt = generateSalt();

    // 2. Encrypt org private key with org passcode
    const passcodeKey = await deriveKeyFromPasscode(
      orgPasscode,
      orgSalt,
      params.timeCost,
      params.memoryCost,
      params.parallelism
    );
    encryptAesGcm(passcodeKey, org.privateKey);

    // 3. New member has their own keypair
    const member = generateX25519Keypair();

    // 4. Admin distributes org key to member
    const memberOrgKeyPayload = encryptToPublicKey(
      member.publicKey,
      org.privateKey,
      'org-key-distribution'
    );

    // 5. Member decrypts org key with their private key
    const recoveredOrgPrivate = decryptWithPrivateKey(
      member.privateKey,
      memberOrgKeyPayload,
      'org-key-distribution'
    );

    expect(bytesToHex(recoveredOrgPrivate)).toBe(bytesToHex(org.privateKey));

    // 6. Member can now decrypt org messages
    const orgMessage = new TextEncoder().encode('Confidential org data');
    const payload = encryptToPublicKey(org.publicKey, orgMessage, 'org-storage');
    const decrypted = decryptWithPrivateKey(recoveredOrgPrivate, payload, 'org-storage');

    expect(new TextDecoder().decode(decrypted)).toBe('Confidential org data');
  });

  it('recovery code flow', async () => {
    const params = { timeCost: 1, memoryCost: 16384, parallelism: 1 };

    // 1. Generate keypair and recovery code
    const user = generateX25519Keypair();
    const passcode = '123456';
    const recoveryCode = generateRecoveryCode();

    // 2. Encrypt with both passcode and recovery code
    const passcodeSalt = generateSalt();
    const recoverySalt = generateSalt();

    const passcodeKey = await deriveKeyFromPasscode(
      passcode,
      passcodeSalt,
      params.timeCost,
      params.memoryCost,
      params.parallelism
    );
    const recoveryKey = await deriveKeyFromPasscode(
      recoveryCode,
      recoverySalt,
      params.timeCost,
      params.memoryCost,
      params.parallelism
    );

    // Encrypt with passcode (primary)
    encryptAesGcm(passcodeKey, user.privateKey);

    // Encrypt with recovery code (backup)
    const { iv: rIv, ciphertext: rEncrypted, authTag: rTag } = encryptAesGcm(
      recoveryKey,
      user.privateKey
    );

    // 3. User forgets passcode, uses recovery code
    // 4. Recover private key
    const derivedRecoveryKey = await deriveKeyFromPasscode(
      recoveryCode,
      recoverySalt,
      params.timeCost,
      params.memoryCost,
      params.parallelism
    );
    const recoveredPrivate = decryptAesGcm(derivedRecoveryKey, rIv, rEncrypted, rTag);

    expect(bytesToHex(recoveredPrivate)).toBe(bytesToHex(user.privateKey));
  });

  it('multi-recipient encryption', () => {
    // Create multiple recipients
    const recipients = Array.from({ length: 5 }, () => generateX25519Keypair());
    const message = new TextEncoder().encode('Announcement for all users');

    // Encrypt to each recipient
    const payloads = recipients.map((r) =>
      encryptToPublicKey(r.publicKey, message, 'announcement')
    );

    // Each recipient can decrypt
    recipients.forEach((recipient, i) => {
      const decrypted = decryptWithPrivateKey(
        recipient.privateKey,
        payloads[i],
        'announcement'
      );
      expect(new TextDecoder().decode(decrypted)).toBe('Announcement for all users');
    });

    // Payloads are all different (different ephemeral keys)
    const ephemeralKeys = new Set(payloads.map((p) => bytesToHex(p.ephemeralPublicKey)));
    expect(ephemeralKeys.size).toBe(5);
  });
});
