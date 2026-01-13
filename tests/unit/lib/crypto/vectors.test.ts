/**
 * Cross-platform crypto test vectors.
 * These tests verify that TypeScript produces identical outputs to Python.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  deriveKeyFromPasscode,
  deriveKeyFromEcdh,
  decryptAesGcm,
  hexToBytes,
  bytesToHex,
} from '@/lib/crypto/primitives';

interface PasscodeVector {
  description: string;
  passcode: string;
  salt_hex: string;
  time_cost: number;
  memory_cost: number;
  parallelism: number;
  expected_key_hex: string;
}

interface ECDHVector {
  description: string;
  private_key_hex: string;
  public_key_hex: string;
  context: string;
  salt_hex: string;
  expected_key_hex: string;
}

interface AESGCMVector {
  description: string;
  key_hex: string;
  iv_hex: string;
  plaintext_hex: string;
  ciphertext_hex: string;
  auth_tag_hex: string;
  aad_hex?: string;
}

interface TestVectors {
  version: string;
  description: string;
  passcode_derivation: PasscodeVector[];
  ecdh_derivation: ECDHVector[];
  aes_gcm: AESGCMVector[];
}

// Load test vectors from JSON file
const vectorsPath = join(__dirname, '../../../fixtures/crypto_test_vectors.json');
const vectors: TestVectors = JSON.parse(readFileSync(vectorsPath, 'utf-8'));

describe('Cross-Platform Test Vectors', () => {
  describe('Passcode Derivation (Argon2id)', () => {
    it.each(vectors.passcode_derivation)(
      '$description',
      async (v: PasscodeVector) => {
        const key = await deriveKeyFromPasscode(
          v.passcode,
          hexToBytes(v.salt_hex),
          v.time_cost,
          v.memory_cost,
          v.parallelism
        );
        expect(bytesToHex(key)).toBe(v.expected_key_hex);
      }
    );
  });

  describe('ECDH Derivation (X25519 + HKDF-SHA512)', () => {
    it.each(vectors.ecdh_derivation)('$description', (v: ECDHVector) => {
      const { derivedKey } = deriveKeyFromEcdh(
        hexToBytes(v.private_key_hex),
        hexToBytes(v.public_key_hex),
        v.context,
        hexToBytes(v.salt_hex)
      );
      expect(bytesToHex(derivedKey)).toBe(v.expected_key_hex);
    });
  });

  describe('AES-256-GCM Decryption', () => {
    it.each(vectors.aes_gcm)('$description', (v: AESGCMVector) => {
      const aad = v.aad_hex ? hexToBytes(v.aad_hex) : undefined;
      const plaintext = decryptAesGcm(
        hexToBytes(v.key_hex),
        hexToBytes(v.iv_hex),
        hexToBytes(v.ciphertext_hex),
        hexToBytes(v.auth_tag_hex),
        aad
      );
      expect(bytesToHex(plaintext)).toBe(v.plaintext_hex);
    });
  });

  describe('Vector File Metadata', () => {
    it('has correct version', () => {
      expect(vectors.version).toBe('1.0');
    });

    it('has all required vector categories', () => {
      expect(vectors.passcode_derivation.length).toBeGreaterThan(0);
      expect(vectors.ecdh_derivation.length).toBeGreaterThan(0);
      expect(vectors.aes_gcm.length).toBeGreaterThan(0);
    });

    it('includes transport context vector', () => {
      const transportVector = vectors.ecdh_derivation.find(
        (v) => v.context === 'client-to-enclave-transport'
      );
      expect(transportVector).toBeDefined();
    });

    it('includes storage context vector', () => {
      const storageVector = vectors.ecdh_derivation.find(
        (v) => v.context === 'user-message-storage'
      );
      expect(storageVector).toBeDefined();
    });

    it('includes org-key-distribution context vector', () => {
      const orgVector = vectors.ecdh_derivation.find(
        (v) => v.context === 'org-key-distribution'
      );
      expect(orgVector).toBeDefined();
    });
  });
});
