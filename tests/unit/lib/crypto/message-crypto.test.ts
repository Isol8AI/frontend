/**
 * Tests for message encryption module.
 *
 * Tests cover:
 * - Encryption context strings
 * - Payload serialization/deserialization
 * - Transport encryption (client <-> enclave)
 * - Storage encryption (database)
 * - History re-encryption
 * - Organization key distribution
 */

import { describe, it, expect } from 'vitest';
import {
  EncryptionContext,
  serializePayload,
  deserializePayload,
  encryptMessageToEnclave,
  decryptMessageFromEnclave,
  decryptStoredMessage,
  decryptStoredMessages,
  reEncryptHistoryForTransport,
  decryptOrgKey,
  encryptOrgKeyForMember,
  type SerializedEncryptedPayload,
  type EncryptedMessage,
} from '@/lib/crypto/message-crypto';
import {
  generateX25519Keypair,
  encryptToPublicKey,
  bytesToHex,
  hexToBytes,
} from '@/lib/crypto/primitives';

// =============================================================================
// Context String Tests
// =============================================================================

describe('Encryption Context', () => {
  it('has all required context strings', () => {
    expect(EncryptionContext.CLIENT_TO_ENCLAVE).toBe('client-to-enclave-transport');
    expect(EncryptionContext.ENCLAVE_TO_CLIENT).toBe('enclave-to-client-transport');
    expect(EncryptionContext.USER_MESSAGE_STORAGE).toBe('user-message-storage');
    expect(EncryptionContext.ASSISTANT_MESSAGE_STORAGE).toBe('assistant-message-storage');
    expect(EncryptionContext.ORG_KEY_DISTRIBUTION).toBe('org-key-distribution');
  });

  it('all context values are strings', () => {
    // TypeScript const assertion ensures immutability at compile time
    expect(typeof EncryptionContext.CLIENT_TO_ENCLAVE).toBe('string');
    expect(typeof EncryptionContext.ENCLAVE_TO_CLIENT).toBe('string');
    expect(typeof EncryptionContext.USER_MESSAGE_STORAGE).toBe('string');
    expect(typeof EncryptionContext.ASSISTANT_MESSAGE_STORAGE).toBe('string');
    expect(typeof EncryptionContext.ORG_KEY_DISTRIBUTION).toBe('string');
  });
});

// =============================================================================
// Serialization Tests
// =============================================================================

describe('Payload Serialization', () => {
  const createTestPayload = () => {
    const recipient = generateX25519Keypair();
    return encryptToPublicKey(
      recipient.publicKey,
      new TextEncoder().encode('test message'),
      'test-context'
    );
  };

  describe('serializePayload', () => {
    it('converts binary payload to hex strings', () => {
      const payload = createTestPayload();
      const serialized = serializePayload(payload);

      expect(typeof serialized.ephemeral_public_key).toBe('string');
      expect(typeof serialized.iv).toBe('string');
      expect(typeof serialized.ciphertext).toBe('string');
      expect(typeof serialized.auth_tag).toBe('string');
      expect(typeof serialized.hkdf_salt).toBe('string');
    });

    it('produces correct field lengths', () => {
      const payload = createTestPayload();
      const serialized = serializePayload(payload);

      expect(serialized.ephemeral_public_key).toHaveLength(64); // 32 bytes
      expect(serialized.iv).toHaveLength(32); // 16 bytes
      expect(serialized.auth_tag).toHaveLength(32); // 16 bytes
      expect(serialized.hkdf_salt).toHaveLength(64); // 32 bytes
    });

    it('uses snake_case keys for API compatibility', () => {
      const payload = createTestPayload();
      const serialized = serializePayload(payload);

      expect('ephemeral_public_key' in serialized).toBe(true);
      expect('auth_tag' in serialized).toBe(true);
      expect('hkdf_salt' in serialized).toBe(true);
    });
  });

  describe('deserializePayload', () => {
    it('converts hex strings to binary payload', () => {
      const payload = createTestPayload();
      const serialized = serializePayload(payload);
      const deserialized = deserializePayload(serialized);

      expect(deserialized.ephemeralPublicKey).toBeInstanceOf(Uint8Array);
      expect(deserialized.iv).toBeInstanceOf(Uint8Array);
      expect(deserialized.ciphertext).toBeInstanceOf(Uint8Array);
      expect(deserialized.authTag).toBeInstanceOf(Uint8Array);
      expect(deserialized.hkdfSalt).toBeInstanceOf(Uint8Array);
    });

    it('produces correct field lengths', () => {
      const payload = createTestPayload();
      const serialized = serializePayload(payload);
      const deserialized = deserializePayload(serialized);

      expect(deserialized.ephemeralPublicKey).toHaveLength(32);
      expect(deserialized.iv).toHaveLength(16);
      expect(deserialized.authTag).toHaveLength(16);
      expect(deserialized.hkdfSalt).toHaveLength(32);
    });
  });

  it('roundtrip preserves data', () => {
    const payload = createTestPayload();
    const serialized = serializePayload(payload);
    const deserialized = deserializePayload(serialized);

    expect(bytesToHex(deserialized.ephemeralPublicKey)).toBe(
      bytesToHex(payload.ephemeralPublicKey)
    );
    expect(bytesToHex(deserialized.iv)).toBe(bytesToHex(payload.iv));
    expect(bytesToHex(deserialized.ciphertext)).toBe(bytesToHex(payload.ciphertext));
    expect(bytesToHex(deserialized.authTag)).toBe(bytesToHex(payload.authTag));
    expect(bytesToHex(deserialized.hkdfSalt)).toBe(bytesToHex(payload.hkdfSalt));
  });
});

// =============================================================================
// Transport Encryption Tests
// =============================================================================

describe('Transport Encryption', () => {
  describe('encryptMessageToEnclave', () => {
    it('encrypts message for enclave', () => {
      const enclave = generateX25519Keypair();
      const enclavePublicKey = bytesToHex(enclave.publicKey);

      const encrypted = encryptMessageToEnclave(enclavePublicKey, 'Hello, enclave!');

      expect(encrypted.ephemeral_public_key).toHaveLength(64);
      expect(encrypted.iv).toHaveLength(32);
      expect(encrypted.ciphertext.length).toBeGreaterThan(0);
      expect(encrypted.auth_tag).toHaveLength(32);
      expect(encrypted.hkdf_salt).toHaveLength(64);
    });

    it('produces unique ciphertext each time', () => {
      const enclave = generateX25519Keypair();
      const enclavePublicKey = bytesToHex(enclave.publicKey);

      const ciphertexts = new Set<string>();
      for (let i = 0; i < 10; i++) {
        const encrypted = encryptMessageToEnclave(enclavePublicKey, 'Same message');
        ciphertexts.add(encrypted.ciphertext);
      }
      expect(ciphertexts.size).toBe(10);
    });
  });

  describe('decryptMessageFromEnclave', () => {
    it('decrypts enclave response', () => {
      // Simulate client transport keypair
      const client = generateX25519Keypair();
      const clientPrivateKey = bytesToHex(client.privateKey);

      // Simulate enclave encrypting response to client
      const payload = encryptToPublicKey(
        client.publicKey,
        new TextEncoder().encode('Hello from enclave!'),
        EncryptionContext.ENCLAVE_TO_CLIENT
      );
      const serialized = serializePayload(payload);

      // Client decrypts
      const decrypted = decryptMessageFromEnclave(clientPrivateKey, serialized);
      expect(decrypted).toBe('Hello from enclave!');
    });

    it('fails with wrong context', () => {
      const client = generateX25519Keypair();
      const clientPrivateKey = bytesToHex(client.privateKey);

      // Encrypt with wrong context
      const payload = encryptToPublicKey(
        client.publicKey,
        new TextEncoder().encode('test'),
        EncryptionContext.CLIENT_TO_ENCLAVE // Wrong context!
      );
      const serialized = serializePayload(payload);

      expect(() =>
        decryptMessageFromEnclave(clientPrivateKey, serialized)
      ).toThrow();
    });
  });

  it('roundtrip client -> enclave -> client', () => {
    // Client and enclave keypairs
    const client = generateX25519Keypair();
    const enclave = generateX25519Keypair();

    // 1. Client encrypts message to enclave
    const encrypted = encryptMessageToEnclave(
      bytesToHex(enclave.publicKey),
      'Secret message'
    );

    // Verify encrypted payload structure
    expect(encrypted.ephemeral_public_key).toHaveLength(64);
    expect(encrypted.ciphertext.length).toBeGreaterThan(0);

    // 2. Enclave sends response back to client (using transport keypair)
    const responsePayload = encryptToPublicKey(
      client.publicKey,
      new TextEncoder().encode('Response from enclave'),
      EncryptionContext.ENCLAVE_TO_CLIENT
    );
    const serializedResponse = serializePayload(responsePayload);

    // 3. Client decrypts response
    const clientDecrypted = decryptMessageFromEnclave(
      bytesToHex(client.privateKey),
      serializedResponse
    );
    expect(clientDecrypted).toBe('Response from enclave');
  });
});

// =============================================================================
// Storage Encryption Tests
// =============================================================================

describe('Storage Encryption', () => {
  describe('decryptStoredMessage', () => {
    it('decrypts user message with correct context', () => {
      const user = generateX25519Keypair();
      const payload = encryptToPublicKey(
        user.publicKey,
        new TextEncoder().encode('User message'),
        EncryptionContext.USER_MESSAGE_STORAGE
      );
      const serialized = serializePayload(payload);

      const decrypted = decryptStoredMessage(
        bytesToHex(user.privateKey),
        serialized,
        'user'
      );
      expect(decrypted).toBe('User message');
    });

    it('decrypts assistant message with correct context', () => {
      const user = generateX25519Keypair();
      const payload = encryptToPublicKey(
        user.publicKey,
        new TextEncoder().encode('Assistant response'),
        EncryptionContext.ASSISTANT_MESSAGE_STORAGE
      );
      const serialized = serializePayload(payload);

      const decrypted = decryptStoredMessage(
        bytesToHex(user.privateKey),
        serialized,
        'assistant'
      );
      expect(decrypted).toBe('Assistant response');
    });

    it('fails with wrong role context', () => {
      const user = generateX25519Keypair();
      const payload = encryptToPublicKey(
        user.publicKey,
        new TextEncoder().encode('User message'),
        EncryptionContext.USER_MESSAGE_STORAGE
      );
      const serialized = serializePayload(payload);

      // Try to decrypt as assistant message
      expect(() =>
        decryptStoredMessage(bytesToHex(user.privateKey), serialized, 'assistant')
      ).toThrow();
    });
  });

  describe('decryptStoredMessages', () => {
    it('decrypts multiple messages', () => {
      const user = generateX25519Keypair();
      const privateKey = bytesToHex(user.privateKey);

      const messages: EncryptedMessage[] = [
        {
          role: 'user',
          encrypted_content: serializePayload(
            encryptToPublicKey(
              user.publicKey,
              new TextEncoder().encode('Message 1'),
              EncryptionContext.USER_MESSAGE_STORAGE
            )
          ),
        },
        {
          role: 'assistant',
          encrypted_content: serializePayload(
            encryptToPublicKey(
              user.publicKey,
              new TextEncoder().encode('Message 2'),
              EncryptionContext.ASSISTANT_MESSAGE_STORAGE
            )
          ),
        },
        {
          role: 'user',
          encrypted_content: serializePayload(
            encryptToPublicKey(
              user.publicKey,
              new TextEncoder().encode('Message 3'),
              EncryptionContext.USER_MESSAGE_STORAGE
            )
          ),
        },
      ];

      const decrypted = decryptStoredMessages(privateKey, messages);

      expect(decrypted).toHaveLength(3);
      expect(decrypted[0]).toBe('Message 1');
      expect(decrypted[1]).toBe('Message 2');
      expect(decrypted[2]).toBe('Message 3');
    });

    it('handles empty array', () => {
      const user = generateX25519Keypair();
      const decrypted = decryptStoredMessages(bytesToHex(user.privateKey), []);
      expect(decrypted).toHaveLength(0);
    });
  });
});

// =============================================================================
// History Re-encryption Tests
// =============================================================================

describe('History Re-encryption', () => {
  it('re-encrypts messages for transport', () => {
    const user = generateX25519Keypair();
    const enclave = generateX25519Keypair();
    const userPrivateKey = bytesToHex(user.privateKey);
    const enclavePublicKey = bytesToHex(enclave.publicKey);

    // Create stored messages
    const messages: EncryptedMessage[] = [
      {
        role: 'user',
        encrypted_content: serializePayload(
          encryptToPublicKey(
            user.publicKey,
            new TextEncoder().encode('Hello'),
            EncryptionContext.USER_MESSAGE_STORAGE
          )
        ),
      },
      {
        role: 'assistant',
        encrypted_content: serializePayload(
          encryptToPublicKey(
            user.publicKey,
            new TextEncoder().encode('Hi there!'),
            EncryptionContext.ASSISTANT_MESSAGE_STORAGE
          )
        ),
      },
    ];

    // Re-encrypt for transport
    const reEncrypted = reEncryptHistoryForTransport(
      userPrivateKey,
      enclavePublicKey,
      messages
    );

    expect(reEncrypted).toHaveLength(2);

    // Verify re-encrypted payloads have correct structure
    for (const payload of reEncrypted) {
      expect(payload.ephemeral_public_key).toHaveLength(64);
      expect(payload.iv).toHaveLength(32);
      expect(payload.auth_tag).toHaveLength(32);
      expect(payload.hkdf_salt).toHaveLength(64);
      expect(payload.ciphertext.length).toBeGreaterThan(0);
    }
  });

  it('handles empty history', () => {
    const user = generateX25519Keypair();
    const enclave = generateX25519Keypair();

    const reEncrypted = reEncryptHistoryForTransport(
      bytesToHex(user.privateKey),
      bytesToHex(enclave.publicKey),
      []
    );

    expect(reEncrypted).toHaveLength(0);
  });
});

// =============================================================================
// Organization Key Distribution Tests
// =============================================================================

describe('Organization Key Distribution', () => {
  describe('encryptOrgKeyForMember', () => {
    it('encrypts org key for member', () => {
      const org = generateX25519Keypair();
      const member = generateX25519Keypair();

      const encrypted = encryptOrgKeyForMember(
        bytesToHex(org.privateKey),
        bytesToHex(member.publicKey)
      );

      expect(encrypted.ephemeral_public_key).toHaveLength(64);
      expect(encrypted.ciphertext).toHaveLength(64); // 32 bytes hex
    });
  });

  describe('decryptOrgKey', () => {
    it('member can decrypt org key', () => {
      const org = generateX25519Keypair();
      const member = generateX25519Keypair();

      const encrypted = encryptOrgKeyForMember(
        bytesToHex(org.privateKey),
        bytesToHex(member.publicKey)
      );

      const decrypted = decryptOrgKey(bytesToHex(member.privateKey), encrypted);
      expect(decrypted).toBe(bytesToHex(org.privateKey));
    });

    it('wrong member cannot decrypt', () => {
      const org = generateX25519Keypair();
      const member = generateX25519Keypair();
      const attacker = generateX25519Keypair();

      const encrypted = encryptOrgKeyForMember(
        bytesToHex(org.privateKey),
        bytesToHex(member.publicKey)
      );

      expect(() =>
        decryptOrgKey(bytesToHex(attacker.privateKey), encrypted)
      ).toThrow();
    });
  });

  it('full org key distribution flow', () => {
    // 1. Admin creates org with keypair
    const org = generateX25519Keypair();

    // 2. Multiple members join
    const members = [generateX25519Keypair(), generateX25519Keypair(), generateX25519Keypair()];

    // 3. Admin distributes org key to each member
    const distributions = members.map((member) =>
      encryptOrgKeyForMember(bytesToHex(org.privateKey), bytesToHex(member.publicKey))
    );

    // 4. Each member can decrypt org key and it matches the original
    members.forEach((member, i) => {
      const decrypted = decryptOrgKey(bytesToHex(member.privateKey), distributions[i]);
      expect(decrypted).toBe(bytesToHex(org.privateKey));
    });

    // 5. All members get the same org key
    const decryptedKeys = members.map((member, i) =>
      decryptOrgKey(bytesToHex(member.privateKey), distributions[i])
    );
    expect(new Set(decryptedKeys).size).toBe(1); // All keys are identical

    // 6. Verify the decrypted org key matches original
    expect(decryptedKeys[0]).toBe(bytesToHex(org.privateKey));
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  it('complete message flow', () => {
    // Setup keys
    const user = generateX25519Keypair();
    const enclave = generateX25519Keypair();
    const transport = generateX25519Keypair();

    const userPrivateKey = bytesToHex(user.privateKey);
    const enclavePublicKey = bytesToHex(enclave.publicKey);
    const transportPrivateKey = bytesToHex(transport.privateKey);

    // 1. Client sends message to enclave
    const outgoing = encryptMessageToEnclave(enclavePublicKey, 'What is 2+2?');

    // 2. Enclave processes and sends response (simulated)
    const responsePayload = encryptToPublicKey(
      transport.publicKey,
      new TextEncoder().encode('4'),
      EncryptionContext.ENCLAVE_TO_CLIENT
    );

    // 3. Client decrypts response
    const response = decryptMessageFromEnclave(
      transportPrivateKey,
      serializePayload(responsePayload)
    );
    expect(response).toBe('4');

    // 4. Messages are stored (simulated enclave storing)
    const storedMessages: EncryptedMessage[] = [
      {
        role: 'user',
        encrypted_content: serializePayload(
          encryptToPublicKey(
            user.publicKey,
            new TextEncoder().encode('What is 2+2?'),
            EncryptionContext.USER_MESSAGE_STORAGE
          )
        ),
      },
      {
        role: 'assistant',
        encrypted_content: serializePayload(
          encryptToPublicKey(
            user.publicKey,
            new TextEncoder().encode('4'),
            EncryptionContext.ASSISTANT_MESSAGE_STORAGE
          )
        ),
      },
    ];

    // 5. Later: client loads history
    const history = decryptStoredMessages(userPrivateKey, storedMessages);
    expect(history).toEqual(['What is 2+2?', '4']);

    // 6. Client sends new message with history
    const newEnclave = generateX25519Keypair();
    const reEncryptedHistory = reEncryptHistoryForTransport(
      userPrivateKey,
      bytesToHex(newEnclave.publicKey),
      storedMessages
    );

    expect(reEncryptedHistory).toHaveLength(2);
  });
});
