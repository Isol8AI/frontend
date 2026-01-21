/**
 * Client-side IndexedDB store for temporal facts with encryption.
 *
 * This module provides:
 * - Encrypted storage of temporal facts in IndexedDB
 * - CRUD operations for facts
 * - Query capabilities by subject, predicate, time range
 * - Automatic fact invalidation when values change
 *
 * Security Model:
 * - Object values are encrypted with user's private key
 * - Subject and predicate are stored in plaintext for querying
 * - All data is stored locally, never sent to server
 */

'use client';

import { openDB, type IDBPDatabase } from 'idb';
import type {
  TemporalFact,
  EncryptedTemporalFact,
  TemporalQuery,
  FactStoreStats,
  FactType,
  FactSource,
  FactScope,
} from './types';
import { FACT_TYPE_HALF_LIVES } from './types';

// =============================================================================
// Configuration
// =============================================================================

const DB_NAME = 'freebird-temporal-facts';
const DB_VERSION = 2;  // Incremented for new schema
const FACTS_STORE = 'facts';

// =============================================================================
// Database Schema
// =============================================================================

interface FactsDB {
  [FACTS_STORE]: {
    key: string;
    value: EncryptedTemporalFact;
    indexes: {
      'by-subject': string;
      'by-predicate': string;
      'by-subject-predicate': [string, string];
      'by-validity': [number, number | null];
      'by-updated': number;
      'by-type': FactType;
      'by-scope': FactScope;
      'by-confirmed': number;
    };
  };
}

// =============================================================================
// Database Initialization
// =============================================================================

let dbInstance: IDBPDatabase<FactsDB> | null = null;

/**
 * Get or create the IndexedDB database instance.
 */
async function getDB(): Promise<IDBPDatabase<FactsDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<FactsDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Always start fresh - delete existing store if present
      if (db.objectStoreNames.contains(FACTS_STORE)) {
        db.deleteObjectStore(FACTS_STORE);
      }

      // Create facts store with all indexes
      const store = db.createObjectStore(FACTS_STORE, { keyPath: 'id' });

      // Indexes for efficient querying
      store.createIndex('by-subject', 'subject');
      store.createIndex('by-predicate', 'predicate');
      store.createIndex('by-subject-predicate', ['subject', 'predicate']);
      store.createIndex('by-validity', ['validFrom', 'validTo']);
      store.createIndex('by-updated', 'lastUpdated');
      store.createIndex('by-type', 'type');
      store.createIndex('by-scope', 'scope');
      store.createIndex('by-confirmed', 'lastConfirmedAt');
    },
    blocked() {
      console.warn('[TemporalFacts] Database upgrade blocked by other tabs');
    },
    blocking() {
      // Close the database to allow upgrade in other tab
      dbInstance?.close();
      dbInstance = null;
    },
  });

  return dbInstance;
}

// =============================================================================
// Encryption Helpers
// =============================================================================

/**
 * Simple AES-GCM encryption using Web Crypto API.
 * Uses the user's private key as the encryption key.
 *
 * Note: We pass Uint8Array directly to Web Crypto APIs since they accept
 * BufferSource (ArrayBuffer | ArrayBufferView). This avoids realm mismatch
 * issues in jsdom where ArrayBuffer created in one context isn't recognized
 * by Node.js's webcrypto polyfill.
 */
async function encryptValue(
  privateKeyHex: string,
  plaintext: string
): Promise<{ ciphertext: string; iv: string; authTag: string }> {
  // Derive encryption key from private key
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    privateKeyBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const encKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('temporal-facts-encryption'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  // Encrypt
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const cipherBytes = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    encKey,
    plaintextBytes
  );

  // Extract auth tag (last 16 bytes)
  const cipherArray = new Uint8Array(cipherBytes);
  const ciphertext = cipherArray.slice(0, -16);
  const authTag = cipherArray.slice(-16);

  return {
    ciphertext: bytesToHex(ciphertext),
    iv: bytesToHex(iv),
    authTag: bytesToHex(authTag),
  };
}

/**
 * Decrypt a value encrypted with encryptValue.
 */
async function decryptValue(
  privateKeyHex: string,
  ciphertext: string,
  iv: string,
  authTag: string
): Promise<string> {
  // Derive encryption key from private key
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    privateKeyBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveBits', 'deriveKey']
  );

  const encKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('temporal-facts-encryption'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  // Combine ciphertext and auth tag
  const cipherBytes = hexToBytes(ciphertext);
  const authTagBytes = hexToBytes(authTag);
  const combined = new Uint8Array(cipherBytes.length + authTagBytes.length);
  combined.set(cipherBytes);
  combined.set(authTagBytes, cipherBytes.length);

  // Decrypt
  const ivBytes = hexToBytes(iv);
  const plaintextBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    encKey,
    combined
  );

  return new TextDecoder().decode(plaintextBytes);
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// =============================================================================
// Store Operations
// =============================================================================

/**
 * Upsert a temporal fact with deduplication.
 *
 * Behavior:
 * - If an active fact with the same subject-predicate-object exists:
 *   Update lastConfirmedAt and boost confidence (no new record)
 * - If an active fact with the same subject-predicate but different object exists:
 *   Invalidate the old fact and create a new one
 * - If no active fact exists for this subject-predicate:
 *   Create a new fact
 *
 * Returns the fact ID (existing or new) and whether it was created.
 */
export async function upsertFact(
  privateKeyHex: string,
  fact: Omit<TemporalFact, 'id' | 'lastUpdated' | 'retrievalCount' | 'lastRetrievedAt'> & {
    retrievalCount?: number;
    lastRetrievedAt?: number | null;
  }
): Promise<{ id: string; created: boolean }> {
  const db = await getDB();
  const now = Date.now();

  // Check for existing active facts with same subject-predicate
  const existing = await db.getAllFromIndex(
    FACTS_STORE,
    'by-subject-predicate',
    [fact.subject, fact.predicate]
  );

  // Find active facts (validTo is null)
  const activeFacts = existing.filter((f) => f.validTo === null);

  // Check if any active fact has the same object (needs decryption)
  for (const active of activeFacts) {
    try {
      const decryptedObject = await decryptValue(
        privateKeyHex,
        active.encryptedObject,
        active.iv,
        active.authTag
      );

      if (decryptedObject === fact.object) {
        // Same SPO triple - just update lastConfirmedAt and boost confidence
        const boostAmount = 0.05; // Small confidence boost on re-confirmation
        const newConfidence = Math.min(1.0, active.confidence + boostAmount);

        await db.put(FACTS_STORE, {
          ...active,
          lastConfirmedAt: now,
          lastUpdated: now,
          confidence: newConfidence,
        });

        console.log(
          `[TemporalFacts] Deduplicated: ${fact.subject} ${fact.predicate} *** - updated existing (confidence: ${active.confidence.toFixed(2)} → ${newConfidence.toFixed(2)})`
        );

        return { id: active.id, created: false };
      }
    } catch (err) {
      console.warn(`[TemporalFacts] Failed to decrypt for dedup check:`, err);
      // Continue checking other active facts
    }
  }

  // No matching SPO found - create new fact (which will invalidate old ones)
  const id = await insertFact(privateKeyHex, fact);
  return { id, created: true };
}

/**
 * Insert a new temporal fact.
 * If a fact with the same subject-predicate already exists and is active,
 * it will be invalidated first.
 *
 * Note: Consider using upsertFact instead for automatic deduplication.
 */
export async function insertFact(
  privateKeyHex: string,
  fact: Omit<TemporalFact, 'id' | 'lastUpdated' | 'retrievalCount' | 'lastRetrievedAt'> & {
    retrievalCount?: number;
    lastRetrievedAt?: number | null;
  }
): Promise<string> {
  const db = await getDB();
  const now = Date.now();
  const id = crypto.randomUUID();

  // Check for existing active facts with same subject-predicate
  const existing = await db.getAllFromIndex(
    FACTS_STORE,
    'by-subject-predicate',
    [fact.subject, fact.predicate]
  );

  // Do all encryption BEFORE opening the transaction
  // (IndexedDB transactions auto-commit when they go idle during async operations)
  const encrypted = await encryptValue(privateKeyHex, fact.object);

  // Encrypt metadata if present
  let encryptedMetadata: string | undefined;
  let metadataIv: string | undefined;
  let metadataAuthTag: string | undefined;

  if (fact.metadata) {
    const metaEncrypted = await encryptValue(
      privateKeyHex,
      JSON.stringify(fact.metadata)
    );
    encryptedMetadata = metaEncrypted.ciphertext;
    metadataIv = metaEncrypted.iv;
    metadataAuthTag = metaEncrypted.authTag;
  }

  // Use default decay half-life based on fact type if not provided
  const decayHalfLife = fact.decayHalfLife ?? FACT_TYPE_HALF_LIVES[fact.type];

  // Prepare the encrypted fact object
  const encryptedFact: EncryptedTemporalFact = {
    id,
    subject: fact.subject,
    predicate: fact.predicate,
    encryptedObject: encrypted.ciphertext,
    iv: encrypted.iv,
    authTag: encrypted.authTag,
    validFrom: fact.validFrom,
    validTo: fact.validTo,
    lastConfirmedAt: fact.lastConfirmedAt,
    lastUpdated: now,
    // Classification fields
    type: fact.type,
    confidence: fact.confidence,
    source: fact.source,
    scope: fact.scope,
    // Decay settings
    ttlSeconds: fact.ttlSeconds,
    decayHalfLife,
    // Entity extraction
    entities: fact.entities,
    // Retrieval tracking
    retrievalCount: fact.retrievalCount ?? 0,
    lastRetrievedAt: fact.lastRetrievedAt ?? null,
    // Encrypted fields
    encryptedMetadata,
    metadataIv,
    metadataAuthTag,
    sourceId: fact.sourceId,
  };

  // Now do all IndexedDB operations in a single transaction
  const tx = db.transaction(FACTS_STORE, 'readwrite');

  // Invalidate existing active facts
  for (const old of existing) {
    if (old.validTo === null && old.validFrom < fact.validFrom) {
      await tx.store.put({
        ...old,
        validTo: fact.validFrom - 1,
        lastUpdated: now,
      });
    }
  }

  // Insert the new fact
  await tx.store.add(encryptedFact);
  await tx.done;

  console.log(`[TemporalFacts] Inserted fact: ${fact.subject} ${fact.predicate} [${fact.type}] *** (encrypted)`);
  return id;
}

/**
 * Update an existing fact's confidence or metadata.
 */
export async function updateFact(
  privateKeyHex: string,
  id: string,
  updates: { confidence?: number; metadata?: Record<string, unknown> }
): Promise<void> {
  const db = await getDB();
  const existing = await db.get(FACTS_STORE, id);

  if (!existing) {
    throw new Error(`Fact not found: ${id}`);
  }

  const now = Date.now();
  const updated: EncryptedTemporalFact = {
    ...existing,
    lastUpdated: now,
  };

  if (updates.confidence !== undefined) {
    updated.confidence = updates.confidence;
  }

  if (updates.metadata !== undefined) {
    const metaEncrypted = await encryptValue(
      privateKeyHex,
      JSON.stringify(updates.metadata)
    );
    updated.encryptedMetadata = metaEncrypted.ciphertext;
    updated.metadataIv = metaEncrypted.iv;
    updated.metadataAuthTag = metaEncrypted.authTag;
  }

  await db.put(FACTS_STORE, updated);
  console.log(`[TemporalFacts] Updated fact ${id}`);
}

/**
 * Invalidate a fact (set validTo to current time).
 */
export async function invalidateFact(
  id: string,
  validTo: number = Date.now()
): Promise<void> {
  const db = await getDB();
  const existing = await db.get(FACTS_STORE, id);

  if (!existing) {
    throw new Error(`Fact not found: ${id}`);
  }

  await db.put(FACTS_STORE, {
    ...existing,
    validTo,
    lastUpdated: Date.now(),
  });

  console.log(`[TemporalFacts] Invalidated fact ${id}`);
}

/**
 * Permanently delete a fact.
 */
export async function deleteFact(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(FACTS_STORE, id);
  console.log(`[TemporalFacts] Deleted fact ${id}`);
}

/**
 * Get a fact by ID and decrypt it.
 */
export async function getFact(
  privateKeyHex: string,
  id: string
): Promise<TemporalFact | null> {
  const db = await getDB();
  const encrypted = await db.get(FACTS_STORE, id);

  if (!encrypted) {
    return null;
  }

  return decryptFact(privateKeyHex, encrypted);
}

/**
 * Get the current (active) fact for a subject-predicate pair.
 */
export async function getCurrentFact(
  privateKeyHex: string,
  subject: string,
  predicate: string
): Promise<TemporalFact | null> {
  const db = await getDB();
  const facts = await db.getAllFromIndex(
    FACTS_STORE,
    'by-subject-predicate',
    [subject, predicate]
  );

  // Find the active one (validTo is null)
  const active = facts.find((f) => f.validTo === null);
  if (!active) {
    return null;
  }

  return decryptFact(privateKeyHex, active);
}

/**
 * Query facts with various filters.
 */
export async function queryFacts(
  privateKeyHex: string,
  query: TemporalQuery
): Promise<TemporalFact[]> {
  const db = await getDB();
  let facts: EncryptedTemporalFact[];

  // Use appropriate index based on query
  if (query.subject && query.predicate) {
    facts = await db.getAllFromIndex(
      FACTS_STORE,
      'by-subject-predicate',
      [query.subject, query.predicate]
    );
  } else if (query.subject) {
    facts = await db.getAllFromIndex(FACTS_STORE, 'by-subject', query.subject);
  } else if (query.predicate) {
    facts = await db.getAllFromIndex(FACTS_STORE, 'by-predicate', query.predicate);
  } else {
    facts = await db.getAll(FACTS_STORE);
  }

  // Filter by time
  const at = query.at ?? Date.now();
  facts = facts.filter((f) => {
    // Check temporal validity
    if (!query.includeHistorical) {
      if (f.validTo !== null && f.validTo <= at) {
        return false; // Fact has expired (validTo is exclusive - fact is invalid AT validTo)
      }
      if (f.validFrom > at) {
        return false; // Fact not yet valid
      }
    }

    // Check time range
    if (query.from && f.validFrom < query.from) {
      return false;
    }
    if (query.to && f.validFrom > query.to) {
      return false;
    }

    // Check confidence
    if (query.minConfidence && f.confidence < query.minConfidence) {
      return false;
    }

    return true;
  });

  // Sort by confidence descending
  facts.sort((a, b) => b.confidence - a.confidence);

  // Apply limit
  if (query.limit) {
    facts = facts.slice(0, query.limit);
  }

  // Decrypt all facts
  const decrypted: TemporalFact[] = [];
  for (const encrypted of facts) {
    try {
      const fact = await decryptFact(privateKeyHex, encrypted);

      // Filter by object if specified (requires decryption first)
      if (query.object && fact.object !== query.object) {
        continue;
      }

      decrypted.push(fact);
    } catch (err) {
      console.warn(`[TemporalFacts] Failed to decrypt fact ${encrypted.id}:`, err);
    }
  }

  return decrypted;
}

/**
 * Get all facts for a subject (e.g., "user").
 */
export async function getFactsBySubject(
  privateKeyHex: string,
  subject: string,
  includeHistorical = false
): Promise<TemporalFact[]> {
  return queryFacts(privateKeyHex, { subject, includeHistorical });
}

/**
 * Get store statistics.
 */
export async function getStats(): Promise<FactStoreStats> {
  const db = await getDB();
  const facts = await db.getAll(FACTS_STORE);

  const now = Date.now();
  let activeFacts = 0;
  let historicalFacts = 0;
  const predicateCounts: Record<string, number> = {};
  let oldestFact: number | undefined;
  let newestFact: number | undefined;

  for (const fact of facts) {
    // Count active vs historical
    // validTo is exclusive - a fact with validTo set is invalid AT that time
    if (fact.validTo === null || fact.validTo > now) {
      activeFacts++;
    } else {
      historicalFacts++;
    }

    // Count by predicate
    predicateCounts[fact.predicate] = (predicateCounts[fact.predicate] || 0) + 1;

    // Track oldest/newest
    if (!oldestFact || fact.validFrom < oldestFact) {
      oldestFact = fact.validFrom;
    }
    if (!newestFact || fact.validFrom > newestFact) {
      newestFact = fact.validFrom;
    }
  }

  return {
    totalFacts: facts.length,
    activeFacts,
    historicalFacts,
    predicateCounts,
    oldestFact,
    newestFact,
  };
}

/**
 * Clear all facts from the store.
 */
export async function clearAllFacts(): Promise<number> {
  const db = await getDB();
  const count = await db.count(FACTS_STORE);
  await db.clear(FACTS_STORE);
  console.log(`[TemporalFacts] Cleared ${count} facts`);
  return count;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Decrypt an encrypted fact.
 */
async function decryptFact(
  privateKeyHex: string,
  encrypted: EncryptedTemporalFact
): Promise<TemporalFact> {
  // Decrypt object
  const object = await decryptValue(
    privateKeyHex,
    encrypted.encryptedObject,
    encrypted.iv,
    encrypted.authTag
  );

  // Decrypt metadata if present
  let metadata: Record<string, unknown> | undefined;
  if (encrypted.encryptedMetadata && encrypted.metadataIv && encrypted.metadataAuthTag) {
    const metaJson = await decryptValue(
      privateKeyHex,
      encrypted.encryptedMetadata,
      encrypted.metadataIv,
      encrypted.metadataAuthTag
    );
    metadata = JSON.parse(metaJson);
  }

  return {
    id: encrypted.id,
    subject: encrypted.subject,
    predicate: encrypted.predicate,
    object,
    // Temporal fields
    validFrom: encrypted.validFrom,
    validTo: encrypted.validTo,
    lastConfirmedAt: encrypted.lastConfirmedAt,
    lastUpdated: encrypted.lastUpdated,
    // Classification fields
    type: encrypted.type,
    confidence: encrypted.confidence,
    source: encrypted.source,
    scope: encrypted.scope,
    // Decay settings
    ttlSeconds: encrypted.ttlSeconds,
    decayHalfLife: encrypted.decayHalfLife,
    // Entity extraction
    entities: encrypted.entities,
    // Retrieval tracking
    retrievalCount: encrypted.retrievalCount,
    lastRetrievedAt: encrypted.lastRetrievedAt,
    // Optional fields
    metadata,
    sourceId: encrypted.sourceId,
  };
}

/**
 * Close the database connection (call on page unload).
 */
export function closeDB(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
    console.log('[TemporalFacts] Database closed');
  }
}
