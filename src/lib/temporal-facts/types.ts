/**
 * Type definitions for client-side temporal facts.
 *
 * Based on OpenMemory's temporal graph types, adapted for client-side
 * IndexedDB storage with encryption support.
 *
 * Temporal facts are subject-predicate-object triples with time validity,
 * allowing the system to track how facts change over time.
 */

// =============================================================================
// Fact Classification Types
// =============================================================================

/**
 * Fact types for scoring and conflict resolution.
 *
 * Ephemeral types (error, state, plan, decision) have high recency weight.
 * Stable types (preference, identity) behave more like memories.
 */
export type FactType =
  | 'preference'    // "I like/prefer X" - stable, memory-like
  | 'plan'          // "I'm going to X" - time-bounded intent
  | 'state'         // "Currently doing X" - ephemeral
  | 'observation'   // "X happened" - episodic
  | 'error'         // "Got error X" - very ephemeral, high recency weight
  | 'decision'      // "Let's use X" - session-scoped usually
  | 'identity';     // "I am X" - stable, memory-like

/**
 * Source of the fact.
 */
export type FactSource = 'user' | 'system' | 'tool';

/**
 * Scope of the fact's relevance.
 */
export type FactScope = 'session' | 'device' | 'account';

/**
 * Default decay half-lives by fact type (in seconds).
 */
export const FACT_TYPE_HALF_LIVES: Record<FactType, number> = {
  error: 3600,           // 1 hour
  state: 14400,          // 4 hours
  plan: 86400,           // 24 hours
  decision: 86400,       // 24 hours
  observation: 604800,   // 7 days
  preference: 2592000,   // 30 days
  identity: 7776000,     // 90 days
};

/**
 * Check if a fact type is ephemeral (high recency weight).
 */
export function isEphemeralFactType(type: FactType): boolean {
  return type === 'error' || type === 'state' || type === 'plan' || type === 'decision';
}

/**
 * Check if a fact type is stable (memory-like).
 */
export function isStableFactType(type: FactType): boolean {
  return type === 'preference' || type === 'identity';
}

// =============================================================================
// Core Fact Interface
// =============================================================================

/**
 * A temporal fact representing a piece of knowledge with time bounds.
 *
 * Examples:
 * - subject: "user", predicate: "works_at", object: "Acme Corp"
 * - subject: "user", predicate: "prefers", object: "TypeScript"
 * - subject: "user", predicate: "located_in", object: "San Francisco"
 */
export interface TemporalFact {
  /** Unique identifier */
  id: string;
  /** The subject of the fact (usually "user" for personal facts) */
  subject: string;
  /** The relationship type (e.g., "works_at", "prefers", "located_in") */
  predicate: string;
  /** The object/value of the relationship */
  object: string;

  // Temporal fields
  /** When this fact became true (timestamp) */
  validFrom: number;
  /** When this fact stopped being true (null = still valid) */
  validTo: number | null;
  /** Last time this fact was confirmed/reinforced */
  lastConfirmedAt: number;
  /** Last time this fact was updated */
  lastUpdated: number;

  // Classification
  /** Type of fact for scoring and conflict resolution */
  type: FactType;
  /** Confidence score 0.0-1.0 (explicit user statement > inferred) */
  confidence: number;
  /** Source of the fact */
  source: FactSource;
  /** Scope of relevance */
  scope: FactScope;

  // Decay settings
  /** Hard expiry in seconds (null = no hard expiry, uses soft decay) */
  ttlSeconds: number | null;
  /** Soft decay half-life in seconds */
  decayHalfLife: number;

  // Entity extraction
  /** Extracted entities/tags (e.g., ["vitest", "hash-wasm", "x25519"]) */
  entities: string[];

  // Retrieval tracking
  /** Number of times this fact has been retrieved for context */
  retrievalCount: number;
  /** Last time this fact was retrieved (null = never) */
  lastRetrievedAt: number | null;

  /** Optional additional metadata */
  metadata?: Record<string, unknown>;
  /** Source message/conversation ID that created this fact */
  sourceId?: string;
}

/**
 * Encrypted temporal fact for storage.
 *
 * The object field is encrypted since it may contain sensitive information.
 * Subject and predicate are kept in plaintext for querying.
 */
export interface EncryptedTemporalFact {
  id: string;
  subject: string;
  predicate: string;
  /** Encrypted object value */
  encryptedObject: string;
  /** IV for decryption */
  iv: string;
  /** Auth tag for decryption */
  authTag: string;

  // Temporal fields
  validFrom: number;
  validTo: number | null;
  lastConfirmedAt: number;
  lastUpdated: number;

  // Classification (plaintext for filtering)
  type: FactType;
  confidence: number;
  source: FactSource;
  scope: FactScope;

  // Decay settings
  ttlSeconds: number | null;
  decayHalfLife: number;

  // Entities (plaintext for filtering)
  entities: string[];

  // Retrieval tracking
  retrievalCount: number;
  lastRetrievedAt: number | null;

  /** Encrypted metadata (JSON string) */
  encryptedMetadata?: string;
  metadataIv?: string;
  metadataAuthTag?: string;
  sourceId?: string;
}

/**
 * A relationship edge between two facts.
 */
export interface TemporalEdge {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: string;
  validFrom: number;
  validTo: number | null;
  weight: number;
  metadata?: Record<string, unknown>;
}

/**
 * Entry in the timeline showing fact changes.
 */
export interface TimelineEntry {
  timestamp: number;
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  changeType: 'created' | 'updated' | 'invalidated';
}

/**
 * Query parameters for searching facts.
 */
export interface TemporalQuery {
  subject?: string;
  predicate?: string;
  object?: string;
  /** Query facts valid at this specific time */
  at?: number;
  /** Query facts valid from this time */
  from?: number;
  /** Query facts valid until this time */
  to?: number;
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Include historical (invalidated) facts */
  includeHistorical?: boolean;
  /** Maximum number of results */
  limit?: number;
}

/**
 * Predefined predicate types for structured extraction.
 */
export const PREDICATE_TYPES = [
  'prefers',       // User preferences (tools, languages, approaches)
  'works_at',      // Employment/organization
  'located_in',    // Location (city, country, region)
  'interested_in', // Interests and hobbies
  'has_skill',     // Skills and abilities
  'dislikes',      // Things the user dislikes
  'plans_to',      // Future intentions
  'uses',          // Tools/technologies in use
  'knows',         // People or topics they know about
  'mentioned',     // Things mentioned in conversation
] as const;

export type PredicateType = typeof PREDICATE_TYPES[number];

/**
 * Fact extraction result from Transformers.js model.
 */
export interface ExtractedFactCandidate {
  subject: string;
  predicate: string;
  object: string;
  confidence: number;
  /** Inferred fact type */
  type: FactType;
  /** Source of extraction */
  source: FactSource;
  /** Extracted entities/tags */
  entities: string[];
}

/**
 * Stats about the fact store.
 */
export interface FactStoreStats {
  totalFacts: number;
  activeFacts: number;
  historicalFacts: number;
  predicateCounts: Record<string, number>;
  oldestFact?: number;
  newestFact?: number;
}

// =============================================================================
// Scoring and Ranking Types
// =============================================================================

/**
 * Query type detection for boosting facts vs memories.
 */
export type QueryType = 'stateful' | 'preference' | 'identity' | 'general';

/**
 * A ranked candidate (fact or memory) for context injection.
 */
export interface RankedCandidate {
  type: 'fact' | 'memory';
  content: string;
  normalizedScore: number;
  metadata: {
    factType?: FactType;
    sector?: string;  // For memories
    confidence: number;
    age: number;  // Seconds since creation/confirmation
  };
}

/**
 * Conflict resolution result.
 */
export interface ConflictResolution {
  winner: RankedCandidate;
  loser: RankedCandidate;
  reason: string;
  action: 'drop_loser' | 'merge_both' | 'flag_ambiguous';
}

/**
 * Type boost matrix for scoring facts against query types.
 * Values represent how much to boost a fact type for a given query type.
 */
export const FACT_TYPE_BOOST_MATRIX: Record<FactType, Record<QueryType, number>> = {
  error:       { stateful: 1.0, preference: 0.2, identity: 0.1, general: 0.5 },
  state:       { stateful: 1.0, preference: 0.3, identity: 0.2, general: 0.6 },
  plan:        { stateful: 0.8, preference: 0.4, identity: 0.3, general: 0.5 },
  decision:    { stateful: 0.9, preference: 0.4, identity: 0.3, general: 0.5 },
  observation: { stateful: 0.6, preference: 0.5, identity: 0.4, general: 0.5 },
  preference:  { stateful: 0.3, preference: 1.0, identity: 0.6, general: 0.6 },
  identity:    { stateful: 0.2, preference: 0.7, identity: 1.0, general: 0.5 },
};

/**
 * Query type weights for merging facts and memories.
 */
export const QUERY_TYPE_WEIGHTS: Record<QueryType, { factWeight: number; memoryWeight: number }> = {
  stateful:   { factWeight: 1.2, memoryWeight: 0.8 },
  preference: { factWeight: 0.7, memoryWeight: 1.3 },
  identity:   { factWeight: 0.6, memoryWeight: 1.4 },
  general:    { factWeight: 1.0, memoryWeight: 1.0 },
};

/**
 * Scoring weights for fact relevance calculation.
 */
export const FACT_SCORING_WEIGHTS = {
  similarity: 0.4,
  recency: 0.3,
  type: 0.2,
  confidence: 0.1,
} as const;

/**
 * Source multipliers for confidence scoring.
 */
export const SOURCE_CONFIDENCE_MULTIPLIERS: Record<FactSource, number> = {
  user: 1.0,
  system: 0.8,
  tool: 0.6,
};
