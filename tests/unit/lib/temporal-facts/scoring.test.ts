import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectQueryType,
  calculateRecencyBoost,
  calculateTypeBoost,
  scoreFact,
  isFactExpired,
  isFactInvalidated,
  isFactValid,
  scoreMemory,
  factToCandidate,
  memoryToCandidate,
  mergeAndRank,
  detectConflict,
  resolveConflict,
  resolveConflicts,
  rankFacts,
  getRelevantContext,
  formatForLLM,
  type Memory,
} from '@/lib/temporal-facts/scoring';
import type { TemporalFact, RankedCandidate, QueryType } from '@/lib/temporal-facts/types';
import { FACT_TYPE_BOOST_MATRIX, FACT_SCORING_WEIGHTS } from '@/lib/temporal-facts/types';

// =============================================================================
// Test Fixtures
// =============================================================================

function createMockFact(overrides: Partial<TemporalFact> = {}): TemporalFact {
  const now = Date.now();
  return {
    id: 'fact-1',
    subject: 'user',
    predicate: 'prefers',
    object: 'TypeScript',
    validFrom: now - 3600000, // 1 hour ago
    validTo: null,
    lastConfirmedAt: now - 1800000, // 30 min ago
    lastUpdated: now - 1800000,
    type: 'preference',
    confidence: 0.8,
    source: 'user',
    scope: 'account',
    ttlSeconds: null,
    decayHalfLife: 2592000, // 30 days
    entities: ['typescript'],
    retrievalCount: 0,
    lastRetrievedAt: null,
    ...overrides,
  };
}

function createMockMemory(overrides: Partial<Memory> = {}): Memory {
  const now = Date.now();
  return {
    id: 'mem-1',
    content: 'User prefers TypeScript for frontend development',
    sector: 'semantic',
    confidence: 0.9,
    createdAt: now - 86400000, // 1 day ago
    lastSeenAt: now - 3600000, // 1 hour ago
    salience: 0.8,
    ...overrides,
  };
}

function createMockCandidate(overrides: Partial<RankedCandidate> = {}): RankedCandidate {
  return {
    type: 'fact',
    content: 'user prefers TypeScript',
    normalizedScore: 0.8,
    metadata: {
      factType: 'preference',
      confidence: 0.8,
      age: 1800,
    },
    ...overrides,
  };
}

// =============================================================================
// Query Type Detection Tests
// =============================================================================

describe('detectQueryType', () => {
  describe('stateful queries', () => {
    it('detects "currently" pattern', () => {
      expect(detectQueryType('What am I currently working on?')).toBe('stateful');
      expect(detectQueryType('Currently debugging an issue')).toBe('stateful');
    });

    it('detects "right now" pattern', () => {
      expect(detectQueryType('What is the status right now?')).toBe('stateful');
    });

    it('detects "current" pattern', () => {
      expect(detectQueryType("What's the current error?")).toBe('stateful');
      expect(detectQueryType('What is the latest version?')).toBe('stateful');
    });

    it('detects "working on" pattern', () => {
      expect(detectQueryType('What was I working on before?')).toBe('stateful');
    });

    it('detects error-related patterns', () => {
      expect(detectQueryType('I got an error')).toBe('stateful');
      expect(detectQueryType('The test failed')).toBe('stateful');
      expect(detectQueryType('Found a bug')).toBe('stateful');
      expect(detectQueryType('There is an issue')).toBe('stateful');
    });

    it('detects status patterns', () => {
      expect(detectQueryType('What is the status?')).toBe('stateful');
      expect(detectQueryType('I am blocked on this')).toBe('stateful');
    });

    it('detects problem patterns', () => {
      expect(detectQueryType('I have a problem')).toBe('stateful');
      expect(detectQueryType('Trying to fix this')).toBe('stateful');
    });
  });

  describe('preference queries', () => {
    it('detects "prefer" pattern', () => {
      expect(detectQueryType('Which framework do you prefer?')).toBe('preference');
    });

    it('detects "favorite" pattern', () => {
      expect(detectQueryType('What is your favorite language?')).toBe('preference');
    });

    it('detects "like/dislike" patterns', () => {
      expect(detectQueryType('Do you like React?')).toBe('preference');
      expect(detectQueryType('I hate boilerplate code')).toBe('preference');
      expect(detectQueryType('I dislike verbose syntax')).toBe('preference');
    });

    it('detects "want" pattern', () => {
      expect(detectQueryType('I want a simple solution')).toBe('preference');
    });

    it('detects "use" pattern', () => {
      expect(detectQueryType('What do you use for testing?')).toBe('preference');
    });

    it('detects comparison patterns', () => {
      expect(detectQueryType('Is React better than Vue?')).toBe('preference');
      expect(detectQueryType('Which is worse?')).toBe('preference');
    });

    it('detects recommendation patterns', () => {
      expect(detectQueryType('Should I use TypeScript?')).toBe('preference');
      expect(detectQueryType('What do you recommend?')).toBe('preference');
    });
  });

  describe('identity queries', () => {
    it('detects "who am I" pattern', () => {
      expect(detectQueryType('Who am I?')).toBe('identity');
    });

    it('detects "what do I do" pattern', () => {
      expect(detectQueryType('What do I do for work?')).toBe('identity');
      expect(detectQueryType('What did I work on?')).toBe('identity');
    });

    it('detects personal attribute patterns', () => {
      expect(detectQueryType('What is my name?')).toBe('identity');
      expect(detectQueryType('My job is engineering')).toBe('identity');
      expect(detectQueryType('My role in the team')).toBe('identity');
    });

    it('detects "I am" pattern', () => {
      expect(detectQueryType("I'm a developer")).toBe('identity');
      expect(detectQueryType('I am learning Rust')).toBe('identity');
    });

    it('detects "about me" pattern', () => {
      expect(detectQueryType('Tell me about myself')).toBe('identity');
    });

    it('detects location patterns', () => {
      expect(detectQueryType('Where do I live?')).toBe('identity');
      expect(detectQueryType('Where did I work before?')).toBe('identity');
    });

    it('detects memory patterns', () => {
      expect(detectQueryType('Do you remember me?')).toBe('identity');
      expect(detectQueryType('My background is in finance')).toBe('identity');
    });
  });

  describe('general queries', () => {
    it('returns general for non-specific queries', () => {
      expect(detectQueryType('How do I write a function?')).toBe('general');
      expect(detectQueryType('Explain async/await')).toBe('general');
      expect(detectQueryType('What is a closure?')).toBe('general');
    });

    it('returns general for empty or simple queries', () => {
      expect(detectQueryType('')).toBe('general');
      expect(detectQueryType('Hello')).toBe('general');
    });
  });

  describe('priority ordering', () => {
    it('stateful takes priority over preference', () => {
      // "currently" is stateful, "prefer" is preference
      expect(detectQueryType('What do I currently prefer?')).toBe('stateful');
    });

    it('stateful takes priority over identity', () => {
      expect(detectQueryType("What am I currently doing?")).toBe('stateful');
    });

    it('preference takes priority over identity when no stateful', () => {
      // "like" is preference, "I am" is identity
      // Note: "doing" would trigger stateful, so use a different example
      expect(detectQueryType('Do I like the company I am at?')).toBe('preference');
    });
  });
});

// =============================================================================
// Recency Boost Tests
// =============================================================================

describe('calculateRecencyBoost', () => {
  it('returns 1.0 for age 0', () => {
    expect(calculateRecencyBoost(0, 3600)).toBeCloseTo(1.0, 5);
  });

  it('returns 0.5 at half-life', () => {
    const halfLife = 3600; // 1 hour
    expect(calculateRecencyBoost(halfLife, halfLife)).toBeCloseTo(0.5, 5);
  });

  it('returns 0.25 at 2x half-life', () => {
    const halfLife = 3600;
    expect(calculateRecencyBoost(halfLife * 2, halfLife)).toBeCloseTo(0.25, 5);
  });

  it('returns 0.125 at 3x half-life', () => {
    const halfLife = 3600;
    expect(calculateRecencyBoost(halfLife * 3, halfLife)).toBeCloseTo(0.125, 5);
  });

  it('approaches 0 for very old facts', () => {
    const halfLife = 3600;
    const veryOld = halfLife * 20; // 20 half-lives
    expect(calculateRecencyBoost(veryOld, halfLife)).toBeLessThan(0.001);
  });

  it('handles different half-lives correctly', () => {
    // 1 hour half-life
    expect(calculateRecencyBoost(3600, 3600)).toBeCloseTo(0.5, 5);
    // 1 day half-life
    expect(calculateRecencyBoost(86400, 86400)).toBeCloseTo(0.5, 5);
    // 30 day half-life
    expect(calculateRecencyBoost(2592000, 2592000)).toBeCloseTo(0.5, 5);
  });
});

// =============================================================================
// Type Boost Tests
// =============================================================================

describe('calculateTypeBoost', () => {
  it('returns correct boost for error facts in stateful queries', () => {
    expect(calculateTypeBoost('error', 'stateful')).toBe(1.0);
  });

  it('returns correct boost for preference facts in preference queries', () => {
    expect(calculateTypeBoost('preference', 'preference')).toBe(1.0);
  });

  it('returns correct boost for identity facts in identity queries', () => {
    expect(calculateTypeBoost('identity', 'identity')).toBe(1.0);
  });

  it('returns lower boost for mismatched types', () => {
    // Error fact in preference query
    expect(calculateTypeBoost('error', 'preference')).toBe(0.2);
    // Preference fact in stateful query
    expect(calculateTypeBoost('preference', 'stateful')).toBe(0.3);
    // Identity fact in stateful query
    expect(calculateTypeBoost('identity', 'stateful')).toBe(0.2);
  });

  it('returns moderate boost for general queries', () => {
    expect(calculateTypeBoost('error', 'general')).toBe(0.5);
    expect(calculateTypeBoost('preference', 'general')).toBe(0.6);
    expect(calculateTypeBoost('identity', 'general')).toBe(0.5);
  });

  it('matches FACT_TYPE_BOOST_MATRIX values', () => {
    for (const factType of Object.keys(FACT_TYPE_BOOST_MATRIX) as Array<keyof typeof FACT_TYPE_BOOST_MATRIX>) {
      for (const queryType of ['stateful', 'preference', 'identity', 'general'] as QueryType[]) {
        expect(calculateTypeBoost(factType, queryType)).toBe(
          FACT_TYPE_BOOST_MATRIX[factType][queryType]
        );
      }
    }
  });
});

// =============================================================================
// Fact Scoring Tests
// =============================================================================

describe('scoreFact', () => {
  it('calculates correct score with high similarity and recency', () => {
    const now = Date.now();
    const fact = createMockFact({ lastConfirmedAt: now }); // Just now
    const similarity = 1.0;

    const score = scoreFact(fact, similarity, 'general', now);

    // Should have high score: sim=1.0, recency=1.0, type=0.6 (preference/general), conf=0.8
    // 1.0 * 0.4 + 1.0 * 0.3 + 0.6 * 0.2 + 0.8 * 0.1 = 0.4 + 0.3 + 0.12 + 0.08 = 0.9
    expect(score).toBeCloseTo(0.9, 2);
  });

  it('calculates correct score with low similarity', () => {
    const now = Date.now();
    const fact = createMockFact({ lastConfirmedAt: now, confidence: 1.0 });
    const similarity = 0.0;

    const score = scoreFact(fact, similarity, 'general', now);

    // 0.0 * 0.4 + 1.0 * 0.3 + 0.6 * 0.2 + 1.0 * 0.1 = 0 + 0.3 + 0.12 + 0.1 = 0.52
    expect(score).toBeCloseTo(0.52, 2);
  });

  it('applies type boost correctly for matching query type', () => {
    const now = Date.now();
    const fact = createMockFact({
      type: 'preference',
      lastConfirmedAt: now,
      confidence: 0.8,
    });

    const preferenceScore = scoreFact(fact, 0.5, 'preference', now);
    const generalScore = scoreFact(fact, 0.5, 'general', now);

    // Preference query should give higher score due to type boost
    expect(preferenceScore).toBeGreaterThan(generalScore);
  });

  it('applies recency decay for old facts', () => {
    const now = Date.now();
    const recentFact = createMockFact({ lastConfirmedAt: now });
    const oldFact = createMockFact({
      lastConfirmedAt: now - 30 * 24 * 3600 * 1000, // 30 days ago (1 half-life for preference)
    });

    const recentScore = scoreFact(recentFact, 0.8, 'general', now);
    const oldScore = scoreFact(oldFact, 0.8, 'general', now);

    expect(recentScore).toBeGreaterThan(oldScore);
    // Old fact should have about half the recency contribution
    expect(oldScore).toBeLessThan(recentScore);
  });

  it('confidence affects score proportionally', () => {
    const now = Date.now();
    const highConfFact = createMockFact({ confidence: 1.0, lastConfirmedAt: now });
    const lowConfFact = createMockFact({ confidence: 0.2, lastConfirmedAt: now });

    const highScore = scoreFact(highConfFact, 0.5, 'general', now);
    const lowScore = scoreFact(lowConfFact, 0.5, 'general', now);

    expect(highScore).toBeGreaterThan(lowScore);
    // Difference should be confidence_weight * (1.0 - 0.2) = 0.1 * 0.8 = 0.08
    expect(highScore - lowScore).toBeCloseTo(0.08, 2);
  });
});

// =============================================================================
// Fact Validity Tests
// =============================================================================

describe('isFactExpired', () => {
  it('returns false for facts without TTL', () => {
    const fact = createMockFact({ ttlSeconds: null });
    expect(isFactExpired(fact)).toBe(false);
  });

  it('returns false for facts within TTL', () => {
    const now = Date.now();
    const fact = createMockFact({
      validFrom: now - 1000,
      ttlSeconds: 3600, // 1 hour TTL
    });
    expect(isFactExpired(fact, now)).toBe(false);
  });

  it('returns true for facts past TTL', () => {
    const now = Date.now();
    const fact = createMockFact({
      validFrom: now - 7200000, // 2 hours ago
      ttlSeconds: 3600, // 1 hour TTL
    });
    expect(isFactExpired(fact, now)).toBe(true);
  });

  it('returns true exactly at TTL boundary', () => {
    const now = Date.now();
    const fact = createMockFact({
      validFrom: now - 3600000, // Exactly 1 hour ago
      ttlSeconds: 3600,
    });
    expect(isFactExpired(fact, now)).toBe(true);
  });
});

describe('isFactInvalidated', () => {
  it('returns false for facts with null validTo', () => {
    const fact = createMockFact({ validTo: null });
    expect(isFactInvalidated(fact)).toBe(false);
  });

  it('returns false for facts invalidated in the future', () => {
    const now = Date.now();
    const fact = createMockFact({ validTo: now + 3600000 });
    expect(isFactInvalidated(fact, now)).toBe(false);
  });

  it('returns true for facts invalidated in the past', () => {
    const now = Date.now();
    const fact = createMockFact({ validTo: now - 1000 });
    expect(isFactInvalidated(fact, now)).toBe(true);
  });
});

describe('isFactValid', () => {
  it('returns true for active facts', () => {
    const now = Date.now();
    const fact = createMockFact({
      validTo: null,
      ttlSeconds: null,
    });
    expect(isFactValid(fact, now)).toBe(true);
  });

  it('returns false for expired facts', () => {
    const now = Date.now();
    const fact = createMockFact({
      validFrom: now - 7200000,
      ttlSeconds: 3600,
      validTo: null,
    });
    expect(isFactValid(fact, now)).toBe(false);
  });

  it('returns false for invalidated facts', () => {
    const now = Date.now();
    const fact = createMockFact({
      validTo: now - 1000,
      ttlSeconds: null,
    });
    expect(isFactValid(fact, now)).toBe(false);
  });

  it('returns false for both expired and invalidated facts', () => {
    const now = Date.now();
    const fact = createMockFact({
      validFrom: now - 7200000,
      ttlSeconds: 3600,
      validTo: now - 1000,
    });
    expect(isFactValid(fact, now)).toBe(false);
  });
});

// =============================================================================
// Memory Scoring Tests
// =============================================================================

describe('scoreMemory', () => {
  it('calculates correct score with high similarity and salience', () => {
    const now = Date.now();
    const memory = createMockMemory({
      lastSeenAt: now,
      salience: 1.0,
    });
    const similarity = 1.0;

    const score = scoreMemory(memory, similarity, now);

    // 1.0 * 0.5 + 1.0 * 0.3 + 1.0 * 0.2 = 0.5 + 0.3 + 0.2 = 1.0
    expect(score).toBeCloseTo(1.0, 2);
  });

  it('applies recency decay for old memories', () => {
    const now = Date.now();
    const recentMemory = createMockMemory({ lastSeenAt: now });
    const oldMemory = createMockMemory({
      lastSeenAt: now - 7 * 24 * 3600 * 1000, // 7 days ago (1 half-life)
    });

    const recentScore = scoreMemory(recentMemory, 0.8, now);
    const oldScore = scoreMemory(oldMemory, 0.8, now);

    expect(recentScore).toBeGreaterThan(oldScore);
  });

  it('salience affects score proportionally', () => {
    const now = Date.now();
    const highSalience = createMockMemory({ salience: 1.0, lastSeenAt: now });
    const lowSalience = createMockMemory({ salience: 0.2, lastSeenAt: now });

    const highScore = scoreMemory(highSalience, 0.5, now);
    const lowScore = scoreMemory(lowSalience, 0.5, now);

    expect(highScore).toBeGreaterThan(lowScore);
    // Difference should be salience_weight * (1.0 - 0.2) = 0.3 * 0.8 = 0.24
    expect(highScore - lowScore).toBeCloseTo(0.24, 2);
  });
});

// =============================================================================
// Candidate Conversion Tests
// =============================================================================

describe('factToCandidate', () => {
  it('creates correct candidate structure', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const fact = createMockFact({
      subject: 'user',
      predicate: 'prefers',
      object: 'TypeScript',
      type: 'preference',
      confidence: 0.8,
      lastConfirmedAt: now - 1800000,
    });

    const candidate = factToCandidate(fact, 0.75);

    expect(candidate).toEqual({
      type: 'fact',
      content: 'user prefers TypeScript',
      normalizedScore: 0.75,
      metadata: {
        factType: 'preference',
        confidence: 0.8,
        age: 1800, // 30 minutes
      },
    });

    vi.restoreAllMocks();
  });
});

describe('memoryToCandidate', () => {
  it('creates correct candidate structure', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const memory = createMockMemory({
      content: 'User likes TypeScript',
      sector: 'semantic',
      salience: 0.9,
      lastSeenAt: now - 3600000,
    });

    const candidate = memoryToCandidate(memory, 0.65);

    expect(candidate).toEqual({
      type: 'memory',
      content: 'User likes TypeScript',
      normalizedScore: 0.65,
      metadata: {
        sector: 'semantic',
        confidence: 0.9,
        age: 3600, // 1 hour
      },
    });

    vi.restoreAllMocks();
  });
});

// =============================================================================
// Merge and Rank Tests
// =============================================================================

describe('mergeAndRank', () => {
  it('merges and sorts candidates by normalized score', () => {
    const now = Date.now();
    const facts: Array<[TemporalFact, number]> = [
      [createMockFact({ id: 'f1' }), 0.8],
      [createMockFact({ id: 'f2' }), 0.6],
    ];
    const memories: Array<[Memory, number]> = [
      [createMockMemory({ id: 'm1' }), 0.9],
      [createMockMemory({ id: 'm2' }), 0.5],
    ];

    const result = mergeAndRank(facts, memories, 'general', 10);

    // Should be sorted by normalized score (with weights applied)
    expect(result.length).toBe(4);
    // For general query, factWeight = memoryWeight = 1.0
    // Scores are normalized within each group
  });

  it('respects limit parameter', () => {
    const facts: Array<[TemporalFact, number]> = [
      [createMockFact({ id: 'f1' }), 0.8],
      [createMockFact({ id: 'f2' }), 0.6],
      [createMockFact({ id: 'f3' }), 0.4],
    ];
    const memories: Array<[Memory, number]> = [
      [createMockMemory({ id: 'm1' }), 0.9],
      [createMockMemory({ id: 'm2' }), 0.5],
    ];

    const result = mergeAndRank(facts, memories, 'general', 2);

    expect(result.length).toBe(2);
  });

  it('applies query type weights for stateful queries', () => {
    const facts: Array<[TemporalFact, number]> = [[createMockFact(), 0.5]];
    const memories: Array<[Memory, number]> = [[createMockMemory(), 0.5]];

    const result = mergeAndRank(facts, memories, 'stateful', 10);

    // For stateful: factWeight=1.2, memoryWeight=0.8
    // Facts should rank higher
    const factCandidate = result.find((c) => c.type === 'fact');
    const memoryCandidate = result.find((c) => c.type === 'memory');

    expect(factCandidate!.normalizedScore).toBeGreaterThan(memoryCandidate!.normalizedScore);
  });

  it('applies query type weights for preference queries', () => {
    const facts: Array<[TemporalFact, number]> = [[createMockFact(), 0.5]];
    const memories: Array<[Memory, number]> = [[createMockMemory(), 0.5]];

    const result = mergeAndRank(facts, memories, 'preference', 10);

    // For preference: factWeight=0.7, memoryWeight=1.3
    // Memories should rank higher
    const factCandidate = result.find((c) => c.type === 'fact');
    const memoryCandidate = result.find((c) => c.type === 'memory');

    expect(memoryCandidate!.normalizedScore).toBeGreaterThan(factCandidate!.normalizedScore);
  });

  it('handles empty inputs', () => {
    expect(mergeAndRank([], [], 'general', 10)).toEqual([]);
    expect(mergeAndRank([[createMockFact(), 0.5]], [], 'general', 10).length).toBe(1);
    expect(mergeAndRank([], [[createMockMemory(), 0.5]], 'general', 10).length).toBe(1);
  });
});

// =============================================================================
// Conflict Detection Tests
// =============================================================================

describe('detectConflict', () => {
  it('detects conflict with high term overlap', () => {
    const a = createMockCandidate({ content: 'user prefers TypeScript over JavaScript' });
    const b = createMockCandidate({ content: 'user prefers JavaScript over TypeScript' });

    expect(detectConflict(a, b)).toBe(true);
  });

  it('does not detect conflict with low overlap', () => {
    const a = createMockCandidate({ content: 'user prefers TypeScript' });
    const b = createMockCandidate({ content: 'user works at Google' });

    expect(detectConflict(a, b)).toBe(false);
  });

  it('ignores short terms (3 chars or less)', () => {
    const a = createMockCandidate({ content: 'I am a developer' });
    const b = createMockCandidate({ content: 'I am a designer' });

    // "developer" vs "designer" have no overlap
    // Short words like "am", "a" are ignored
    expect(detectConflict(a, b)).toBe(false);
  });

  it('is case-insensitive', () => {
    const a = createMockCandidate({ content: 'User PREFERS TypeScript' });
    const b = createMockCandidate({ content: 'user prefers javascript' });

    expect(detectConflict(a, b)).toBe(true);
  });
});

// =============================================================================
// Conflict Resolution Tests
// =============================================================================

describe('resolveConflict', () => {
  describe('stateful queries', () => {
    it('prefers ephemeral facts over stable facts', () => {
      const ephemeral = createMockCandidate({
        type: 'fact',
        metadata: { factType: 'error', confidence: 0.8, age: 100 },
      });
      const stable = createMockCandidate({
        type: 'fact',
        metadata: { factType: 'preference', confidence: 0.9, age: 50 },
      });

      const result = resolveConflict(ephemeral, stable, 'stateful');

      expect(result.winner).toBe(ephemeral);
      expect(result.reason).toContain('Ephemeral');
    });

    it('prefers more recent when both ephemeral', () => {
      const recent = createMockCandidate({
        type: 'fact',
        metadata: { factType: 'error', confidence: 0.7, age: 100 },
      });
      const old = createMockCandidate({
        type: 'fact',
        metadata: { factType: 'state', confidence: 0.9, age: 1000 },
      });

      const result = resolveConflict(recent, old, 'stateful');

      expect(result.winner).toBe(recent);
      expect(result.reason).toContain('recent');
    });

    it('prefers more recent when both stable', () => {
      const recent = createMockCandidate({
        type: 'fact',
        metadata: { factType: 'preference', confidence: 0.7, age: 100 },
      });
      const old = createMockCandidate({
        type: 'fact',
        metadata: { factType: 'identity', confidence: 0.9, age: 1000 },
      });

      const result = resolveConflict(recent, old, 'stateful');

      expect(result.winner).toBe(recent);
      expect(result.reason).toContain('recent');
    });
  });

  describe('preference queries', () => {
    it('prefers memories over facts', () => {
      const memory = createMockCandidate({
        type: 'memory',
        normalizedScore: 0.7,
        metadata: { sector: 'semantic', confidence: 0.8, age: 1000 },
      });
      const fact = createMockCandidate({
        type: 'fact',
        normalizedScore: 0.9,
        metadata: { factType: 'preference', confidence: 0.9, age: 100 },
      });

      const result = resolveConflict(memory, fact, 'preference');

      expect(result.winner).toBe(memory);
      expect(result.reason).toContain('Memory');
    });

    it('prefers higher confidence when both memories', () => {
      const highConf = createMockCandidate({
        type: 'memory',
        metadata: { sector: 'semantic', confidence: 0.9, age: 1000 },
      });
      const lowConf = createMockCandidate({
        type: 'memory',
        metadata: { sector: 'semantic', confidence: 0.6, age: 100 },
      });

      const result = resolveConflict(highConf, lowConf, 'preference');

      expect(result.winner).toBe(highConf);
      expect(result.reason).toContain('confidence');
    });
  });

  describe('identity queries', () => {
    it('prefers memories over facts', () => {
      const memory = createMockCandidate({
        type: 'memory',
        normalizedScore: 0.6,
        metadata: { sector: 'semantic', confidence: 0.7, age: 2000 },
      });
      const fact = createMockCandidate({
        type: 'fact',
        normalizedScore: 0.9,
        metadata: { factType: 'identity', confidence: 0.95, age: 100 },
      });

      const result = resolveConflict(memory, fact, 'identity');

      expect(result.winner).toBe(memory);
      expect(result.reason).toContain('Memory');
    });
  });

  describe('general queries', () => {
    it('prefers higher normalized score', () => {
      const higher = createMockCandidate({ normalizedScore: 0.9 });
      const lower = createMockCandidate({ normalizedScore: 0.6 });

      const result = resolveConflict(higher, lower, 'general');

      expect(result.winner).toBe(higher);
      expect(result.reason).toContain('score');
    });
  });

  describe('ambiguous conflicts', () => {
    it('flags as ambiguous when scores are very close', () => {
      const a = createMockCandidate({ normalizedScore: 0.75 });
      const b = createMockCandidate({ normalizedScore: 0.78 });

      const result = resolveConflict(a, b, 'general');

      expect(result.action).toBe('flag_ambiguous');
    });

    it('does not flag as ambiguous when scores differ significantly', () => {
      const a = createMockCandidate({ normalizedScore: 0.5 });
      const b = createMockCandidate({ normalizedScore: 0.9 });

      const result = resolveConflict(a, b, 'general');

      expect(result.action).toBe('drop_loser');
    });
  });
});

// =============================================================================
// Resolve Conflicts Tests
// =============================================================================

describe('resolveConflicts', () => {
  it('returns empty array unchanged', () => {
    expect(resolveConflicts([], 'general')).toEqual([]);
  });

  it('returns single candidate unchanged', () => {
    const candidate = createMockCandidate();
    expect(resolveConflicts([candidate], 'general')).toEqual([candidate]);
  });

  it('removes losing candidate in conflict', () => {
    const winner = createMockCandidate({
      content: 'user prefers TypeScript over JavaScript',
      normalizedScore: 0.9,
    });
    const loser = createMockCandidate({
      content: 'user prefers JavaScript over TypeScript',
      normalizedScore: 0.5,
    });

    const result = resolveConflicts([winner, loser], 'general');

    expect(result.length).toBe(1);
    expect(result[0]).toBe(winner);
  });

  it('keeps non-conflicting candidates', () => {
    const a = createMockCandidate({ content: 'user prefers TypeScript' });
    const b = createMockCandidate({ content: 'user works at Google' });
    const c = createMockCandidate({ content: 'user lives in Seattle' });

    const result = resolveConflicts([a, b, c], 'general');

    expect(result.length).toBe(3);
  });

  it('handles multiple conflicts correctly', () => {
    const candidates = [
      createMockCandidate({
        content: 'user prefers TypeScript',
        normalizedScore: 0.9,
      }),
      createMockCandidate({
        content: 'user prefers JavaScript',
        normalizedScore: 0.5,
      }),
      createMockCandidate({
        content: 'user works at Google',
        normalizedScore: 0.8,
      }),
      createMockCandidate({
        content: 'user works at Microsoft',
        normalizedScore: 0.4,
      }),
    ];

    const result = resolveConflicts(candidates, 'general');

    // Should keep 2 winners (TypeScript preference and Google workplace)
    expect(result.length).toBe(2);
  });
});

// =============================================================================
// High-Level API Tests
// =============================================================================

describe('rankFacts', () => {
  it('filters out expired facts', () => {
    const now = Date.now();
    const valid = createMockFact({ id: 'valid', ttlSeconds: null });
    const expired = createMockFact({
      id: 'expired',
      validFrom: now - 7200000,
      ttlSeconds: 3600,
    });

    const result = rankFacts([valid, expired], [0.8, 0.9], 'general', now);

    expect(result.length).toBe(1);
    expect(result[0][0].id).toBe('valid');
  });

  it('filters out invalidated facts', () => {
    const now = Date.now();
    const valid = createMockFact({ id: 'valid', validTo: null });
    const invalidated = createMockFact({
      id: 'invalidated',
      validTo: now - 1000,
    });

    const result = rankFacts([valid, invalidated], [0.8, 0.9], 'general', now);

    expect(result.length).toBe(1);
    expect(result[0][0].id).toBe('valid');
  });

  it('sorts by score descending', () => {
    const now = Date.now();
    const lowScore = createMockFact({ id: 'low', confidence: 0.2, lastConfirmedAt: now - 86400000 });
    const highScore = createMockFact({ id: 'high', confidence: 0.9, lastConfirmedAt: now });

    const result = rankFacts([lowScore, highScore], [0.5, 0.5], 'general', now);

    expect(result[0][0].id).toBe('high');
    expect(result[1][0].id).toBe('low');
  });

  it('uses query type for scoring', () => {
    const now = Date.now();
    const errorFact = createMockFact({ id: 'error', type: 'error', lastConfirmedAt: now });
    const prefFact = createMockFact({ id: 'pref', type: 'preference', lastConfirmedAt: now });

    // For stateful query, error facts should rank higher
    const statefulResult = rankFacts([errorFact, prefFact], [0.5, 0.5], 'What is the current error?', now);
    expect(statefulResult[0][0].id).toBe('error');

    // For preference query, preference facts should rank higher
    const prefResult = rankFacts([errorFact, prefFact], [0.5, 0.5], 'What do you prefer?', now);
    expect(prefResult[0][0].id).toBe('pref');
  });
});

describe('getRelevantContext', () => {
  it('returns merged and resolved candidates', () => {
    const now = Date.now();
    const facts: Array<[TemporalFact, number]> = [
      [createMockFact({ id: 'f1' }), 0.8],
    ];
    const memories: Array<[Memory, number]> = [
      [createMockMemory({ id: 'm1' }), 0.7],
    ];

    const result = getRelevantContext(facts, memories, 'general', 10);

    expect(result.length).toBeGreaterThan(0);
  });

  it('respects limit', () => {
    const facts: Array<[TemporalFact, number]> = [
      [createMockFact({ id: 'f1' }), 0.8],
      [createMockFact({ id: 'f2' }), 0.7],
      [createMockFact({ id: 'f3' }), 0.6],
    ];
    const memories: Array<[Memory, number]> = [
      [createMockMemory({ id: 'm1' }), 0.75],
    ];

    const result = getRelevantContext(facts, memories, 'general', 2);

    expect(result.length).toBeLessThanOrEqual(2);
  });
});

describe('formatForLLM', () => {
  it('returns empty string for no candidates', () => {
    expect(formatForLLM([])).toBe('');
  });

  it('formats facts under Current Session Facts header', () => {
    const candidates: RankedCandidate[] = [
      createMockCandidate({
        type: 'fact',
        content: 'user prefers TypeScript',
      }),
    ];

    const result = formatForLLM(candidates);

    expect(result).toContain('## Current Session Facts');
    expect(result).toContain('- user prefers TypeScript');
  });

  it('formats memories under Long-term Memories header', () => {
    const candidates: RankedCandidate[] = [
      createMockCandidate({
        type: 'memory',
        content: 'User works at a tech company',
        metadata: { sector: 'semantic', confidence: 0.8, age: 1000 },
      }),
    ];

    const result = formatForLLM(candidates);

    expect(result).toContain('## Long-term Memories');
    expect(result).toContain('- User works at a tech company');
  });

  it('separates facts and memories correctly', () => {
    const candidates: RankedCandidate[] = [
      createMockCandidate({ type: 'fact', content: 'fact content' }),
      createMockCandidate({
        type: 'memory',
        content: 'memory content',
        metadata: { sector: 'semantic', confidence: 0.8, age: 1000 },
      }),
    ];

    const result = formatForLLM(candidates);

    expect(result).toContain('## Current Session Facts');
    expect(result).toContain('- fact content');
    expect(result).toContain('## Long-term Memories');
    expect(result).toContain('- memory content');
  });

  it('handles only facts', () => {
    const candidates: RankedCandidate[] = [
      createMockCandidate({ type: 'fact', content: 'fact1' }),
      createMockCandidate({ type: 'fact', content: 'fact2' }),
    ];

    const result = formatForLLM(candidates);

    expect(result).toContain('## Current Session Facts');
    expect(result).not.toContain('## Long-term Memories');
    expect(result).toContain('- fact1');
    expect(result).toContain('- fact2');
  });

  it('handles only memories', () => {
    const candidates: RankedCandidate[] = [
      createMockCandidate({
        type: 'memory',
        content: 'memory1',
        metadata: { sector: 'semantic', confidence: 0.8, age: 1000 },
      }),
    ];

    const result = formatForLLM(candidates);

    expect(result).not.toContain('## Current Session Facts');
    expect(result).toContain('## Long-term Memories');
    expect(result).toContain('- memory1');
  });
});
