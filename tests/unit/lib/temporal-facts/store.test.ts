import { describe, it, expect, beforeEach, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { webcrypto } from 'crypto';

// Polyfill Web Crypto API for jsdom
// jsdom's crypto.subtle has issues with ArrayBuffer type checking
if (!globalThis.crypto || !globalThis.crypto.subtle) {
  // @ts-expect-error - Node.js webcrypto is compatible
  globalThis.crypto = webcrypto;
}

// Reset IndexedDB before each test
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

// Dynamic imports to ensure fresh module state with clean IndexedDB
async function importStore() {
  // Clear module cache to get fresh instance
  vi.resetModules();
  return await import('@/lib/temporal-facts/store');
}

// =============================================================================
// Test Fixtures
// =============================================================================

// Use a consistent test private key (32 bytes hex)
const TEST_PRIVATE_KEY = 'a'.repeat(64); // 32 bytes in hex

function createTestFact(overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return {
    subject: 'user',
    predicate: 'prefers',
    object: 'TypeScript',
    validFrom: now - 3600000, // 1 hour ago
    validTo: null,
    lastConfirmedAt: now - 1800000, // 30 min ago
    type: 'preference' as const,
    confidence: 0.8,
    source: 'user' as const,
    scope: 'account' as const,
    ttlSeconds: null,
    decayHalfLife: 2592000, // 30 days
    entities: ['typescript'],
    ...overrides,
  };
}

// =============================================================================
// Store Operations Tests
// =============================================================================

describe('Store Operations', () => {
  describe('insertFact', () => {
    it('inserts a fact and returns an ID', async () => {
      const { insertFact } = await importStore();
      const fact = createTestFact();

      const id = await insertFact(TEST_PRIVATE_KEY, fact);

      expect(id).toBeDefined();
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('encrypts the object value', async () => {
      const { insertFact, getFact } = await importStore();
      const fact = createTestFact({ object: 'Secret Value' });

      const id = await insertFact(TEST_PRIVATE_KEY, fact);
      const retrieved = await getFact(TEST_PRIVATE_KEY, id);

      expect(retrieved).not.toBeNull();
      expect(retrieved!.object).toBe('Secret Value');
    });

    it('invalidates existing facts with same subject-predicate', async () => {
      const { insertFact, queryFacts } = await importStore();
      const now = Date.now();

      // Insert first fact
      const fact1 = createTestFact({
        object: 'JavaScript',
        validFrom: now - 7200000,
      });
      await insertFact(TEST_PRIVATE_KEY, fact1);

      // Insert second fact with same subject-predicate
      const fact2 = createTestFact({
        object: 'TypeScript',
        validFrom: now - 3600000,
      });
      await insertFact(TEST_PRIVATE_KEY, fact2);

      // Query all including historical
      const all = await queryFacts(TEST_PRIVATE_KEY, {
        subject: 'user',
        predicate: 'prefers',
        includeHistorical: true,
      });

      expect(all.length).toBe(2);

      // Only the newer one should be active
      const active = all.filter((f) => f.validTo === null);
      expect(active.length).toBe(1);
      expect(active[0].object).toBe('TypeScript');
    });

    it('assigns default decay half-life based on type', async () => {
      const { insertFact, getFact } = await importStore();

      // Test error type
      const errorFact = createTestFact({
        type: 'error',
        decayHalfLife: undefined,
      });
      const errorId = await insertFact(TEST_PRIVATE_KEY, errorFact);
      const retrievedError = await getFact(TEST_PRIVATE_KEY, errorId);
      expect(retrievedError!.decayHalfLife).toBe(3600); // 1 hour for errors

      // Test preference type
      const prefFact = createTestFact({
        type: 'preference',
        decayHalfLife: undefined,
      });
      const prefId = await insertFact(TEST_PRIVATE_KEY, prefFact);
      const retrievedPref = await getFact(TEST_PRIVATE_KEY, prefId);
      expect(retrievedPref!.decayHalfLife).toBe(2592000); // 30 days for preferences
    });

    it('encrypts metadata if provided', async () => {
      const { insertFact, getFact } = await importStore();
      const fact = createTestFact({
        metadata: { sessionId: 'test-session', extra: 'data' },
      });

      const id = await insertFact(TEST_PRIVATE_KEY, fact);
      const retrieved = await getFact(TEST_PRIVATE_KEY, id);

      expect(retrieved!.metadata).toEqual({
        sessionId: 'test-session',
        extra: 'data',
      });
    });
  });

  describe('upsertFact', () => {
    it('creates new fact when none exists', async () => {
      const { upsertFact, getFact } = await importStore();
      const fact = createTestFact({ object: 'Rust' });

      const { id, created } = await upsertFact(TEST_PRIVATE_KEY, fact);

      expect(created).toBe(true);
      const retrieved = await getFact(TEST_PRIVATE_KEY, id);
      expect(retrieved!.object).toBe('Rust');
    });

    it('updates existing fact with same SPO triple', async () => {
      const { upsertFact, getFact } = await importStore();
      const now = Date.now();

      // Insert initial fact
      const fact = createTestFact({
        object: 'Python',
        confidence: 0.7,
        lastConfirmedAt: now - 3600000,
      });
      const { id: id1, created: created1 } = await upsertFact(TEST_PRIVATE_KEY, fact);
      expect(created1).toBe(true);

      // Upsert same SPO triple
      const sameFact = createTestFact({
        object: 'Python', // Same object
        confidence: 0.7,
        lastConfirmedAt: now,
      });
      const { id: id2, created: created2 } = await upsertFact(TEST_PRIVATE_KEY, sameFact);

      expect(created2).toBe(false);
      expect(id2).toBe(id1); // Should return same ID

      // Check confidence was boosted
      const retrieved = await getFact(TEST_PRIVATE_KEY, id1);
      expect(retrieved!.confidence).toBeGreaterThan(0.7);
      expect(retrieved!.confidence).toBeLessThanOrEqual(1.0);
    });

    it('creates new fact when object differs', async () => {
      const { upsertFact, queryFacts } = await importStore();

      // Insert initial fact
      const fact1 = createTestFact({ object: 'Python' });
      const { id: id1, created: created1 } = await upsertFact(TEST_PRIVATE_KEY, fact1);
      expect(created1).toBe(true);

      // Upsert with different object
      const fact2 = createTestFact({ object: 'Rust' }); // Different object
      const { id: id2, created: created2 } = await upsertFact(TEST_PRIVATE_KEY, fact2);

      expect(created2).toBe(true);
      expect(id2).not.toBe(id1); // Should be new ID

      // Query all - old one should be invalidated
      const all = await queryFacts(TEST_PRIVATE_KEY, {
        subject: 'user',
        predicate: 'prefers',
        includeHistorical: true,
      });
      const active = all.filter((f) => f.validTo === null);
      expect(active.length).toBe(1);
      expect(active[0].object).toBe('Rust');
    });

    it('boosts confidence by 0.05 on deduplication', async () => {
      const { upsertFact, getFact } = await importStore();

      // Insert with confidence 0.9
      const fact = createTestFact({ object: 'Go', confidence: 0.9 });
      const { id } = await upsertFact(TEST_PRIVATE_KEY, fact);

      // Upsert same - should boost to 0.95
      await upsertFact(TEST_PRIVATE_KEY, { ...fact });
      let retrieved = await getFact(TEST_PRIVATE_KEY, id);
      expect(retrieved!.confidence).toBeCloseTo(0.95, 2);

      // Upsert again - should boost to 1.0 (capped)
      await upsertFact(TEST_PRIVATE_KEY, { ...fact });
      retrieved = await getFact(TEST_PRIVATE_KEY, id);
      expect(retrieved!.confidence).toBe(1.0);
    });
  });

  describe('updateFact', () => {
    it('updates confidence', async () => {
      const { insertFact, updateFact, getFact } = await importStore();
      const fact = createTestFact({ confidence: 0.6 });
      const id = await insertFact(TEST_PRIVATE_KEY, fact);

      await updateFact(TEST_PRIVATE_KEY, id, { confidence: 0.9 });

      const retrieved = await getFact(TEST_PRIVATE_KEY, id);
      expect(retrieved!.confidence).toBe(0.9);
    });

    it('updates metadata', async () => {
      const { insertFact, updateFact, getFact } = await importStore();
      const fact = createTestFact({ metadata: { old: 'value' } });
      const id = await insertFact(TEST_PRIVATE_KEY, fact);

      await updateFact(TEST_PRIVATE_KEY, id, {
        metadata: { new: 'data', count: 42 },
      });

      const retrieved = await getFact(TEST_PRIVATE_KEY, id);
      expect(retrieved!.metadata).toEqual({ new: 'data', count: 42 });
    });

    it('throws error for non-existent fact', async () => {
      const { updateFact } = await importStore();

      await expect(
        updateFact(TEST_PRIVATE_KEY, 'non-existent-id', { confidence: 0.5 })
      ).rejects.toThrow('Fact not found');
    });

    it('updates lastUpdated timestamp', async () => {
      const { insertFact, updateFact, getFact } = await importStore();
      const fact = createTestFact();
      const id = await insertFact(TEST_PRIVATE_KEY, fact);

      const beforeUpdate = await getFact(TEST_PRIVATE_KEY, id);
      const beforeTimestamp = beforeUpdate!.lastUpdated;

      // Small delay to ensure timestamp changes
      await new Promise((r) => setTimeout(r, 10));

      await updateFact(TEST_PRIVATE_KEY, id, { confidence: 0.5 });

      const afterUpdate = await getFact(TEST_PRIVATE_KEY, id);
      expect(afterUpdate!.lastUpdated).toBeGreaterThan(beforeTimestamp);
    });
  });

  describe('invalidateFact', () => {
    it('sets validTo to current time', async () => {
      const { insertFact, invalidateFact, getFact } = await importStore();
      const fact = createTestFact();
      const id = await insertFact(TEST_PRIVATE_KEY, fact);

      const beforeInvalidate = Date.now();
      await invalidateFact(id);
      const afterInvalidate = Date.now();

      const retrieved = await getFact(TEST_PRIVATE_KEY, id);
      expect(retrieved!.validTo).not.toBeNull();
      expect(retrieved!.validTo).toBeGreaterThanOrEqual(beforeInvalidate);
      expect(retrieved!.validTo).toBeLessThanOrEqual(afterInvalidate);
    });

    it('sets validTo to custom timestamp', async () => {
      const { insertFact, invalidateFact, getFact } = await importStore();
      const fact = createTestFact();
      const id = await insertFact(TEST_PRIVATE_KEY, fact);

      const customTime = Date.now() - 1000000;
      await invalidateFact(id, customTime);

      const retrieved = await getFact(TEST_PRIVATE_KEY, id);
      expect(retrieved!.validTo).toBe(customTime);
    });

    it('throws error for non-existent fact', async () => {
      const { invalidateFact } = await importStore();

      await expect(invalidateFact('non-existent-id')).rejects.toThrow(
        'Fact not found'
      );
    });
  });

  describe('deleteFact', () => {
    it('permanently removes fact', async () => {
      const { insertFact, deleteFact, getFact } = await importStore();
      const fact = createTestFact();
      const id = await insertFact(TEST_PRIVATE_KEY, fact);

      await deleteFact(id);

      const retrieved = await getFact(TEST_PRIVATE_KEY, id);
      expect(retrieved).toBeNull();
    });

    it('does not throw for non-existent fact', async () => {
      const { deleteFact } = await importStore();

      // Should not throw
      await expect(deleteFact('non-existent-id')).resolves.toBeUndefined();
    });
  });

  describe('getFact', () => {
    it('returns null for non-existent fact', async () => {
      const { getFact } = await importStore();

      const result = await getFact(TEST_PRIVATE_KEY, 'non-existent-id');

      expect(result).toBeNull();
    });

    it('decrypts and returns complete fact', async () => {
      const { insertFact, getFact } = await importStore();
      const now = Date.now();
      const fact = createTestFact({
        object: 'Complete Test',
        validFrom: now - 5000,
        lastConfirmedAt: now - 1000,
        type: 'identity',
        confidence: 0.95,
        source: 'system',
        scope: 'session',
        ttlSeconds: 3600,
        entities: ['test', 'complete'],
        metadata: { key: 'value' },
        sourceId: 'msg-123',
      });

      const id = await insertFact(TEST_PRIVATE_KEY, fact);
      const retrieved = await getFact(TEST_PRIVATE_KEY, id);

      expect(retrieved).toMatchObject({
        subject: 'user',
        predicate: 'prefers',
        object: 'Complete Test',
        type: 'identity',
        confidence: 0.95,
        source: 'system',
        scope: 'session',
        ttlSeconds: 3600,
        entities: ['test', 'complete'],
        metadata: { key: 'value' },
        sourceId: 'msg-123',
      });
    });
  });

  describe('getCurrentFact', () => {
    it('returns null when no fact exists', async () => {
      const { getCurrentFact } = await importStore();

      const result = await getCurrentFact(TEST_PRIVATE_KEY, 'user', 'unknown');

      expect(result).toBeNull();
    });

    it('returns active fact for subject-predicate', async () => {
      const { insertFact, getCurrentFact } = await importStore();
      const fact = createTestFact({ object: 'Active Value' });

      await insertFact(TEST_PRIVATE_KEY, fact);
      const current = await getCurrentFact(TEST_PRIVATE_KEY, 'user', 'prefers');

      expect(current).not.toBeNull();
      expect(current!.object).toBe('Active Value');
    });

    it('returns null when all facts are invalidated', async () => {
      const { insertFact, invalidateFact, getCurrentFact } = await importStore();
      const fact = createTestFact();

      const id = await insertFact(TEST_PRIVATE_KEY, fact);
      await invalidateFact(id);

      const current = await getCurrentFact(TEST_PRIVATE_KEY, 'user', 'prefers');

      expect(current).toBeNull();
    });
  });
});

// =============================================================================
// Query Tests
// =============================================================================

describe('queryFacts', () => {
  describe('filtering', () => {
    it('filters by subject', async () => {
      const { insertFact, queryFacts } = await importStore();

      await insertFact(TEST_PRIVATE_KEY, createTestFact({ subject: 'user', object: 'A' }));
      await insertFact(TEST_PRIVATE_KEY, createTestFact({ subject: 'org', object: 'B' }));

      const results = await queryFacts(TEST_PRIVATE_KEY, { subject: 'user' });

      expect(results.length).toBe(1);
      expect(results[0].subject).toBe('user');
    });

    it('filters by predicate', async () => {
      const { insertFact, queryFacts } = await importStore();

      await insertFact(TEST_PRIVATE_KEY, createTestFact({ predicate: 'prefers', object: 'A' }));
      await insertFact(TEST_PRIVATE_KEY, createTestFact({ predicate: 'works_at', object: 'B' }));

      const results = await queryFacts(TEST_PRIVATE_KEY, { predicate: 'works_at' });

      expect(results.length).toBe(1);
      expect(results[0].predicate).toBe('works_at');
    });

    it('filters by subject and predicate together', async () => {
      const { insertFact, queryFacts } = await importStore();

      await insertFact(TEST_PRIVATE_KEY, createTestFact({ subject: 'user', predicate: 'prefers', object: 'A' }));
      await insertFact(TEST_PRIVATE_KEY, createTestFact({ subject: 'user', predicate: 'works_at', object: 'B' }));
      await insertFact(TEST_PRIVATE_KEY, createTestFact({ subject: 'org', predicate: 'prefers', object: 'C' }));

      const results = await queryFacts(TEST_PRIVATE_KEY, {
        subject: 'user',
        predicate: 'prefers',
      });

      expect(results.length).toBe(1);
      expect(results[0].object).toBe('A');
    });

    it('filters by object (requires decryption)', async () => {
      const { insertFact, queryFacts } = await importStore();

      await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: 'TypeScript' }));
      await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: 'JavaScript', predicate: 'uses' }));

      const results = await queryFacts(TEST_PRIVATE_KEY, { object: 'TypeScript' });

      expect(results.length).toBe(1);
      expect(results[0].object).toBe('TypeScript');
    });

    it('filters by minimum confidence', async () => {
      const { insertFact, queryFacts } = await importStore();

      await insertFact(TEST_PRIVATE_KEY, createTestFact({ confidence: 0.9, object: 'High', predicate: 'p1' }));
      await insertFact(TEST_PRIVATE_KEY, createTestFact({ confidence: 0.5, object: 'Low', predicate: 'p2' }));

      const results = await queryFacts(TEST_PRIVATE_KEY, { minConfidence: 0.7 });

      expect(results.length).toBe(1);
      expect(results[0].confidence).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('temporal filtering', () => {
    it('excludes invalidated facts by default', async () => {
      const { insertFact, invalidateFact, queryFacts } = await importStore();

      const id = await insertFact(TEST_PRIVATE_KEY, createTestFact());
      await invalidateFact(id);

      const results = await queryFacts(TEST_PRIVATE_KEY, { subject: 'user' });

      expect(results.length).toBe(0);
    });

    it('includes invalidated facts when requested', async () => {
      const { insertFact, invalidateFact, queryFacts } = await importStore();

      const id = await insertFact(TEST_PRIVATE_KEY, createTestFact());
      await invalidateFact(id);

      const results = await queryFacts(TEST_PRIVATE_KEY, {
        subject: 'user',
        includeHistorical: true,
      });

      expect(results.length).toBe(1);
    });

    it('filters by time range (from)', async () => {
      const { insertFact, queryFacts } = await importStore();
      const now = Date.now();

      await insertFact(TEST_PRIVATE_KEY, createTestFact({
        validFrom: now - 10000,
        object: 'Recent',
        predicate: 'p1',
      }));
      await insertFact(TEST_PRIVATE_KEY, createTestFact({
        validFrom: now - 100000,
        object: 'Old',
        predicate: 'p2',
      }));

      const results = await queryFacts(TEST_PRIVATE_KEY, {
        from: now - 50000,
      });

      expect(results.length).toBe(1);
      expect(results[0].object).toBe('Recent');
    });

    it('filters by time range (to)', async () => {
      const { insertFact, queryFacts } = await importStore();
      const now = Date.now();

      await insertFact(TEST_PRIVATE_KEY, createTestFact({
        validFrom: now - 10000,
        object: 'Recent',
        predicate: 'p1',
      }));
      await insertFact(TEST_PRIVATE_KEY, createTestFact({
        validFrom: now - 100000,
        object: 'Old',
        predicate: 'p2',
      }));

      const results = await queryFacts(TEST_PRIVATE_KEY, {
        to: now - 50000,
      });

      expect(results.length).toBe(1);
      expect(results[0].object).toBe('Old');
    });
  });

  describe('sorting and limiting', () => {
    it('sorts by confidence descending', async () => {
      const { insertFact, queryFacts } = await importStore();

      await insertFact(TEST_PRIVATE_KEY, createTestFact({ confidence: 0.5, object: 'Low', predicate: 'p1' }));
      await insertFact(TEST_PRIVATE_KEY, createTestFact({ confidence: 0.9, object: 'High', predicate: 'p2' }));
      await insertFact(TEST_PRIVATE_KEY, createTestFact({ confidence: 0.7, object: 'Mid', predicate: 'p3' }));

      const results = await queryFacts(TEST_PRIVATE_KEY, {});

      expect(results[0].confidence).toBe(0.9);
      expect(results[1].confidence).toBe(0.7);
      expect(results[2].confidence).toBe(0.5);
    });

    it('respects limit parameter', async () => {
      const { insertFact, queryFacts } = await importStore();

      await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: '1', predicate: 'p1' }));
      await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: '2', predicate: 'p2' }));
      await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: '3', predicate: 'p3' }));

      const results = await queryFacts(TEST_PRIVATE_KEY, { limit: 2 });

      expect(results.length).toBe(2);
    });
  });

  describe('getAll behavior', () => {
    it('returns all facts when no filters specified', async () => {
      const { insertFact, queryFacts } = await importStore();

      await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: '1', predicate: 'p1' }));
      await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: '2', predicate: 'p2' }));

      const results = await queryFacts(TEST_PRIVATE_KEY, {});

      expect(results.length).toBe(2);
    });
  });
});

describe('getFactsBySubject', () => {
  it('returns all active facts for subject', async () => {
    const { insertFact, getFactsBySubject } = await importStore();

    await insertFact(TEST_PRIVATE_KEY, createTestFact({ subject: 'user', object: '1', predicate: 'p1' }));
    await insertFact(TEST_PRIVATE_KEY, createTestFact({ subject: 'user', object: '2', predicate: 'p2' }));
    await insertFact(TEST_PRIVATE_KEY, createTestFact({ subject: 'org', object: '3', predicate: 'p3' }));

    const results = await getFactsBySubject(TEST_PRIVATE_KEY, 'user');

    expect(results.length).toBe(2);
    expect(results.every((f) => f.subject === 'user')).toBe(true);
  });

  it('excludes historical facts by default', async () => {
    const { insertFact, invalidateFact, getFactsBySubject } = await importStore();

    const id1 = await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: '1', predicate: 'p1' }));
    await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: '2', predicate: 'p2' }));
    await invalidateFact(id1);

    const results = await getFactsBySubject(TEST_PRIVATE_KEY, 'user');

    expect(results.length).toBe(1);
    expect(results[0].object).toBe('2');
  });

  it('includes historical facts when requested', async () => {
    const { insertFact, invalidateFact, getFactsBySubject } = await importStore();

    const id1 = await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: '1', predicate: 'p1' }));
    await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: '2', predicate: 'p2' }));
    await invalidateFact(id1);

    const results = await getFactsBySubject(TEST_PRIVATE_KEY, 'user', true);

    expect(results.length).toBe(2);
  });
});

// =============================================================================
// Statistics Tests
// =============================================================================

describe('getStats', () => {
  it('returns correct stats for empty store', async () => {
    const { getStats } = await importStore();

    const stats = await getStats();

    expect(stats).toEqual({
      totalFacts: 0,
      activeFacts: 0,
      historicalFacts: 0,
      predicateCounts: {},
      oldestFact: undefined,
      newestFact: undefined,
    });
  });

  it('counts active and historical facts correctly', async () => {
    const { insertFact, invalidateFact, getStats } = await importStore();

    const id1 = await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: '1', predicate: 'p1' }));
    await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: '2', predicate: 'p2' }));
    await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: '3', predicate: 'p3' }));
    await invalidateFact(id1);

    const stats = await getStats();

    expect(stats.totalFacts).toBe(3);
    expect(stats.activeFacts).toBe(2);
    expect(stats.historicalFacts).toBe(1);
  });

  it('counts predicates correctly', async () => {
    const { insertFact, getStats } = await importStore();

    await insertFact(TEST_PRIVATE_KEY, createTestFact({ predicate: 'prefers', object: '1' }));
    await insertFact(TEST_PRIVATE_KEY, createTestFact({ predicate: 'prefers', object: '2' }));
    await insertFact(TEST_PRIVATE_KEY, createTestFact({ predicate: 'works_at', object: '3' }));

    const stats = await getStats();

    expect(stats.predicateCounts).toEqual({
      prefers: 2,
      works_at: 1,
    });
  });

  it('tracks oldest and newest facts', async () => {
    const { insertFact, getStats } = await importStore();
    const now = Date.now();

    await insertFact(TEST_PRIVATE_KEY, createTestFact({
      validFrom: now - 100000,
      object: '1',
      predicate: 'p1',
    }));
    await insertFact(TEST_PRIVATE_KEY, createTestFact({
      validFrom: now - 50000,
      object: '2',
      predicate: 'p2',
    }));
    await insertFact(TEST_PRIVATE_KEY, createTestFact({
      validFrom: now - 10000,
      object: '3',
      predicate: 'p3',
    }));

    const stats = await getStats();

    expect(stats.oldestFact).toBe(now - 100000);
    expect(stats.newestFact).toBe(now - 10000);
  });
});

// =============================================================================
// Clear All Tests
// =============================================================================

describe('clearAllFacts', () => {
  it('removes all facts and returns count', async () => {
    const { insertFact, clearAllFacts, getStats } = await importStore();

    await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: '1', predicate: 'p1' }));
    await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: '2', predicate: 'p2' }));
    await insertFact(TEST_PRIVATE_KEY, createTestFact({ object: '3', predicate: 'p3' }));

    const count = await clearAllFacts();

    expect(count).toBe(3);

    const stats = await getStats();
    expect(stats.totalFacts).toBe(0);
  });

  it('returns 0 for empty store', async () => {
    const { clearAllFacts } = await importStore();

    const count = await clearAllFacts();

    expect(count).toBe(0);
  });
});

// =============================================================================
// Encryption Edge Cases
// =============================================================================

describe('Encryption', () => {
  it('handles special characters in object', async () => {
    const { insertFact, getFact } = await importStore();
    const specialChars = 'Test with émojis 🎉 and "quotes" and \\backslash';
    const fact = createTestFact({ object: specialChars });

    const id = await insertFact(TEST_PRIVATE_KEY, fact);
    const retrieved = await getFact(TEST_PRIVATE_KEY, id);

    expect(retrieved!.object).toBe(specialChars);
  });

  it('handles long object values', async () => {
    const { insertFact, getFact } = await importStore();
    const longValue = 'A'.repeat(10000);
    const fact = createTestFact({ object: longValue });

    const id = await insertFact(TEST_PRIVATE_KEY, fact);
    const retrieved = await getFact(TEST_PRIVATE_KEY, id);

    expect(retrieved!.object).toBe(longValue);
    expect(retrieved!.object.length).toBe(10000);
  });

  it('handles empty object value', async () => {
    const { insertFact, getFact } = await importStore();
    const fact = createTestFact({ object: '' });

    const id = await insertFact(TEST_PRIVATE_KEY, fact);
    const retrieved = await getFact(TEST_PRIVATE_KEY, id);

    expect(retrieved!.object).toBe('');
  });

  it('different private keys cannot decrypt each others data', async () => {
    const { insertFact, getFact } = await importStore();
    const fact = createTestFact({ object: 'Secret' });

    const key1 = 'a'.repeat(64);
    const key2 = 'b'.repeat(64);

    const id = await insertFact(key1, fact);

    // Decrypting with different key should fail
    await expect(getFact(key2, id)).rejects.toThrow();
  });
});

// =============================================================================
// Server-Extracted Facts Tests
// =============================================================================

describe('Server-Extracted Facts', () => {
  it('inserts fact with identity type from server', async () => {
    const { insertFact, getFact } = await importStore();
    const fact = createTestFact({
      object: 'Anthropic',
      type: 'identity',
      source: 'system',
      entities: ['anthropic', 'company'],
    });

    const id = await insertFact(TEST_PRIVATE_KEY, fact);
    const retrieved = await getFact(TEST_PRIVATE_KEY, id);

    expect(retrieved!.type).toBe('identity');
    expect(retrieved!.source).toBe('system');
    expect(retrieved!.entities).toEqual(['anthropic', 'company']);
  });

  it('inserts fact with observation type from server', async () => {
    const { insertFact, getFact } = await importStore();
    const fact = createTestFact({
      predicate: 'mentioned',
      object: 'AI safety',
      type: 'observation',
      source: 'system',
    });

    const id = await insertFact(TEST_PRIVATE_KEY, fact);
    const retrieved = await getFact(TEST_PRIVATE_KEY, id);

    expect(retrieved!.type).toBe('observation');
    expect(retrieved!.source).toBe('system');
    expect(retrieved!.predicate).toBe('mentioned');
  });

  it('inserts fact with plan type from server', async () => {
    const { insertFact, getFact } = await importStore();
    const fact = createTestFact({
      predicate: 'plans_to',
      object: 'learn Rust',
      type: 'plan',
      source: 'system',
      confidence: 0.85,
    });

    const id = await insertFact(TEST_PRIVATE_KEY, fact);
    const retrieved = await getFact(TEST_PRIVATE_KEY, id);

    expect(retrieved!.type).toBe('plan');
    expect(retrieved!.predicate).toBe('plans_to');
    expect(retrieved!.confidence).toBe(0.85);
  });

  it('stores all server-extracted predicates', async () => {
    const { insertFact, getFact } = await importStore();

    const predicates = [
      'prefers', 'works_at', 'located_in', 'interested_in',
      'has_skill', 'dislikes', 'plans_to', 'uses', 'knows', 'mentioned'
    ];

    for (const predicate of predicates) {
      const fact = createTestFact({
        predicate,
        object: `test-${predicate}`,
        source: 'system',
      });

      const id = await insertFact(TEST_PRIVATE_KEY, fact);
      const retrieved = await getFact(TEST_PRIVATE_KEY, id);

      expect(retrieved!.predicate).toBe(predicate);
      expect(retrieved!.source).toBe('system');
    }
  });

  it('handles tool source type', async () => {
    const { insertFact, getFact } = await importStore();
    const fact = createTestFact({
      object: 'test tool fact',
      source: 'tool',
    });

    const id = await insertFact(TEST_PRIVATE_KEY, fact);
    const retrieved = await getFact(TEST_PRIVATE_KEY, id);

    expect(retrieved!.source).toBe('tool');
  });

  it('handles device scope', async () => {
    const { insertFact, getFact } = await importStore();
    const fact = createTestFact({
      object: 'device-specific setting',
      scope: 'device',
    });

    const id = await insertFact(TEST_PRIVATE_KEY, fact);
    const retrieved = await getFact(TEST_PRIVATE_KEY, id);

    expect(retrieved!.scope).toBe('device');
  });
});
