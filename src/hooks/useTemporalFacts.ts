/**
 * Hook for managing client-side temporal facts.
 *
 * This hook provides:
 * - Fact storage in encrypted IndexedDB
 * - Fact extraction from conversations using Transformers.js
 * - Querying and management of temporal facts
 *
 * Security Model:
 * - All facts are stored locally (never sent to server)
 * - Fact objects are encrypted with user's private key
 * - Subject and predicate are stored in plaintext for querying
 */

'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useEncryption } from './useEncryption';
import {
  type TemporalFact,
  type TemporalQuery,
  type FactStoreStats,
  type ExtractedFactCandidate,
  type RankedCandidate,
  type FactType,
  type FactSource,
  type FactScope,
  FACT_TYPE_HALF_LIVES,
  upsertFact,
  insertFact,
  updateFact,
  invalidateFact,
  deleteFact,
  getFact,
  getCurrentFact,
  queryFacts,
  getFactsBySubject,
  getStats,
  clearAllFacts,
  closeDB,
  initExtraction,
  isExtractionReady,
  extractFactsWithFallback,
  disposeExtraction,
  // Scoring functions
  rankFacts,
  getRelevantContext,
  formatForLLM,
  type Memory,
} from '@/lib/temporal-facts';
import { generateEmbedding, generateEmbeddings } from '@/lib/embeddings/client-embeddings';

// =============================================================================
// Types
// =============================================================================

export interface UseTemporalFactsReturn {
  /** Whether the extraction model is loaded and ready */
  isExtractionReady: boolean;
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Current error message if any */
  error: string | null;
  /** Store statistics */
  stats: FactStoreStats | null;

  /** Initialize the extraction model (optional - called automatically on first extract) */
  initializeExtraction: () => Promise<void>;

  /** Extract facts from a conversation turn and store them */
  extractAndStoreFacts: (
    userMessage: string,
    assistantResponse: string,
    sourceId?: string
  ) => Promise<TemporalFact[]>;

  /** Search for relevant facts for a query using semantic similarity */
  searchRelevantFacts: (
    query: string,
    limit?: number
  ) => Promise<Array<[TemporalFact, number]>>;

  /** Get relevant context (facts + optional memories) for LLM */
  getRelevantContextForLLM: (
    query: string,
    memories?: Memory[],
    limit?: number
  ) => Promise<{
    candidates: RankedCandidate[];
    formatted: string;
  }>;

  /** Add a fact manually or from server extraction */
  addFact: (fact: {
    subject: string;
    predicate: string;
    object: string;
    confidence?: number;
    type?: FactType;
    source?: FactSource;
    scope?: FactScope;
    entities?: string[];
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<string>;

  /** Update a fact's confidence or metadata */
  updateFactById: (
    id: string,
    updates: { confidence?: number; metadata?: Record<string, unknown> }
  ) => Promise<void>;

  /** Invalidate a fact (mark as no longer valid) */
  invalidateFactById: (id: string) => Promise<void>;

  /** Delete a fact permanently */
  deleteFactById: (id: string) => Promise<void>;

  /** Get a fact by ID */
  getFactById: (id: string) => Promise<TemporalFact | null>;

  /** Get the current value for a subject-predicate pair */
  getCurrentValue: (subject: string, predicate: string) => Promise<TemporalFact | null>;

  /** Query facts with filters */
  query: (query: TemporalQuery) => Promise<TemporalFact[]>;

  /** Get all facts for a subject (default: "user") */
  getAllFacts: (includeHistorical?: boolean) => Promise<TemporalFact[]>;

  /** Clear all facts */
  clearAll: () => Promise<number>;

  /** Refresh stats */
  refreshStats: () => Promise<void>;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useTemporalFacts(): UseTemporalFactsReturn {
  const encryption = useEncryption();

  const [isReady, setIsReady] = useState(isExtractionReady());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<FactStoreStats | null>(null);

  // Track initialization
  const initPromiseRef = useRef<Promise<void> | null>(null);

  // Get private key for encryption
  const getPrivateKey = useCallback((): string => {
    const key = encryption.getPrivateKey();
    if (!key) {
      throw new Error('Encryption keys not unlocked');
    }
    return key;
  }, [encryption]);

  // Check if keys are available
  const hasKeys = encryption.state.isUnlocked;

  // Load stats on mount
  useEffect(() => {
    if (hasKeys) {
      getStats().then(setStats).catch(console.error);
    }
  }, [hasKeys]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeDB();
    };
  }, []);

  /**
   * Initialize the extraction model.
   */
  const initializeExtraction = useCallback(async (): Promise<void> => {
    if (isExtractionReady()) {
      setIsReady(true);
      return;
    }

    if (initPromiseRef.current) {
      await initPromiseRef.current;
      return;
    }

    setError(null);
    initPromiseRef.current = (async () => {
      try {
        await initExtraction();
        setIsReady(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load extraction model';
        setError(message);
        // Don't throw - we can fall back to simple extraction
        console.warn('[useTemporalFacts] Extraction model load failed, will use simple extraction');
      } finally {
        initPromiseRef.current = null;
      }
    })();

    await initPromiseRef.current;
  }, []);

  /**
   * Refresh store statistics.
   */
  const refreshStats = useCallback(async (): Promise<void> => {
    try {
      const newStats = await getStats();
      setStats(newStats);
    } catch (err) {
      console.error('[useTemporalFacts] Failed to refresh stats:', err);
    }
  }, []);

  /**
   * Extract facts from a conversation and store them.
   */
  const extractAndStoreFacts = useCallback(async (
    userMessage: string,
    assistantResponse: string,
    sourceId?: string
  ): Promise<TemporalFact[]> => {
    if (!hasKeys) {
      throw new Error('Encryption keys not unlocked');
    }

    setIsLoading(true);
    setError(null);

    try {
      const privateKey = getPrivateKey();

      // Extract facts (with fallback to simple extraction)
      const candidates = await extractFactsWithFallback(userMessage, assistantResponse);

      if (candidates.length === 0) {
        console.log('[useTemporalFacts] No facts extracted');
        return [];
      }

      console.log(`[useTemporalFacts] Extracted ${candidates.length} fact candidates`);

      // Store each fact with deduplication
      const storedFacts: TemporalFact[] = [];
      const now = Date.now();
      let createdCount = 0;
      let deduplicatedCount = 0;

      for (const candidate of candidates) {
        try {
          // Get default decay half-life for the inferred type
          const decayHalfLife = FACT_TYPE_HALF_LIVES[candidate.type];

          // Use upsertFact for automatic deduplication
          const { id, created } = await upsertFact(privateKey, {
            subject: candidate.subject,
            predicate: candidate.predicate,
            object: candidate.object,
            validFrom: now,
            validTo: null,
            lastConfirmedAt: now,
            confidence: candidate.confidence,
            // New classification fields
            type: candidate.type,
            source: candidate.source,
            scope: 'session',  // Extracted facts are session-scoped by default
            // Decay settings
            ttlSeconds: null,  // No hard expiry, use soft decay
            decayHalfLife,
            // Entity extraction
            entities: candidate.entities,
            // Source reference
            sourceId,
          });

          if (created) {
            createdCount++;
          } else {
            deduplicatedCount++;
          }

          const stored = await getFact(privateKey, id);
          if (stored) {
            storedFacts.push(stored);
          }
        } catch (storeErr) {
          console.warn('[useTemporalFacts] Failed to store fact:', storeErr);
        }
      }

      console.log(`[useTemporalFacts] Facts: ${createdCount} created, ${deduplicatedCount} deduplicated`);

      // Refresh stats
      await refreshStats();

      return storedFacts;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to extract facts';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [hasKeys, getPrivateKey, refreshStats]);

  /**
   * Compute cosine similarity between two vectors.
   */
  const cosineSimilarity = useCallback((a: number[], b: number[]): number => {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10);
  }, []);

  /**
   * Search for relevant facts using semantic similarity and scoring.
   */
  const searchRelevantFacts = useCallback(async (
    query: string,
    limit: number = 10
  ): Promise<Array<[TemporalFact, number]>> => {
    if (!hasKeys) {
      throw new Error('Encryption keys not unlocked');
    }

    try {
      const privateKey = getPrivateKey();

      // Get all active facts
      const facts = await getFactsBySubject(privateKey, 'user', false);
      if (facts.length === 0) {
        return [];
      }

      // Generate embeddings for query and all facts
      const queryEmbedding = await generateEmbedding(query);
      const factTexts = facts.map(f => `${f.subject} ${f.predicate} ${f.object}`);
      const factEmbeddings = await generateEmbeddings(factTexts);

      // Compute similarities
      const similarities = factEmbeddings.map(emb => cosineSimilarity(queryEmbedding, emb));

      // Rank facts using the scoring system
      const ranked = rankFacts(facts, similarities, query);

      return ranked.slice(0, limit);
    } catch (err) {
      console.error('[useTemporalFacts] Search failed:', err);
      throw err;
    }
  }, [hasKeys, getPrivateKey, cosineSimilarity]);

  /**
   * Get relevant context (facts + optional memories) formatted for LLM.
   */
  const getRelevantContextForLLM = useCallback(async (
    query: string,
    memories: Memory[] = [],
    limit: number = 10
  ): Promise<{ candidates: RankedCandidate[]; formatted: string }> => {
    if (!hasKeys) {
      throw new Error('Encryption keys not unlocked');
    }

    try {
      // Get scored facts
      const scoredFacts = await searchRelevantFacts(query, limit);

      // If we have memories, score them too (simplified - use their salience)
      const queryEmbedding = await generateEmbedding(query);
      const scoredMemories: Array<[Memory, number]> = [];

      if (memories.length > 0) {
        const memoryTexts = memories.map(m => m.content);
        const memoryEmbeddings = await generateEmbeddings(memoryTexts);

        for (let i = 0; i < memories.length; i++) {
          const similarity = cosineSimilarity(queryEmbedding, memoryEmbeddings[i]);
          // Simple memory score: similarity * salience * recency
          const age = (Date.now() - memories[i].lastSeenAt) / 1000;
          const recencyBoost = Math.exp(-Math.LN2 * age / (7 * 24 * 3600)); // 7-day half-life
          const score = similarity * 0.5 + memories[i].salience * 0.3 + recencyBoost * 0.2;
          scoredMemories.push([memories[i], score]);
        }
      }

      // Get merged context with conflict resolution
      const candidates = getRelevantContext(scoredFacts, scoredMemories, query, limit);

      // Format for LLM
      const formatted = formatForLLM(candidates);

      return { candidates, formatted };
    } catch (err) {
      console.error('[useTemporalFacts] Context generation failed:', err);
      throw err;
    }
  }, [hasKeys, searchRelevantFacts, cosineSimilarity]);

  /**
   * Add a fact manually or from server extraction.
   * When called with just subject/predicate/object, uses defaults for manual facts.
   * When called with type/source/entities, preserves server-extracted values.
   */
  const addFact = useCallback(async (fact: {
    subject: string;
    predicate: string;
    object: string;
    confidence?: number;
    // Optional fields for server-extracted facts (matches FactType, FactSource, FactScope)
    type?: 'preference' | 'plan' | 'state' | 'observation' | 'error' | 'decision' | 'identity';
    source?: 'user' | 'system' | 'tool';
    scope?: 'session' | 'device' | 'account';
    entities?: string[];
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> => {
    if (!hasKeys) {
      throw new Error('Encryption keys not unlocked');
    }

    setIsLoading(true);
    setError(null);

    try {
      const privateKey = getPrivateKey();
      const now = Date.now();

      // Use provided values or defaults for manual facts
      const factType = fact.type ?? 'preference';
      const factSource = fact.source ?? 'user';
      const factScope = fact.scope ?? 'account';
      const factEntities = fact.entities ?? fact.object.toLowerCase().split(/\s+/).filter(w => w.length > 2);

      const id = await insertFact(privateKey, {
        subject: fact.subject,
        predicate: fact.predicate,
        object: fact.object,
        validFrom: now,
        validTo: null,
        lastConfirmedAt: now,
        confidence: fact.confidence ?? 1.0,
        // Classification
        type: factType,
        source: factSource,
        scope: factScope,
        // Decay settings
        ttlSeconds: null,
        decayHalfLife: FACT_TYPE_HALF_LIVES[factType],
        // Entities
        entities: factEntities,
        metadata: fact.sessionId ? { ...fact.metadata, sessionId: fact.sessionId } : fact.metadata,
      });

      await refreshStats();
      return id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add fact';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [hasKeys, getPrivateKey, refreshStats]);

  /**
   * Update a fact.
   */
  const updateFactById = useCallback(async (
    id: string,
    updates: { confidence?: number; metadata?: Record<string, unknown> }
  ): Promise<void> => {
    if (!hasKeys) {
      throw new Error('Encryption keys not unlocked');
    }

    setIsLoading(true);
    setError(null);

    try {
      const privateKey = getPrivateKey();
      await updateFact(privateKey, id, updates);
      await refreshStats();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update fact';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [hasKeys, getPrivateKey, refreshStats]);

  /**
   * Invalidate a fact.
   */
  const invalidateFactById = useCallback(async (id: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await invalidateFact(id);
      await refreshStats();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to invalidate fact';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [refreshStats]);

  /**
   * Delete a fact.
   */
  const deleteFactById = useCallback(async (id: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await deleteFact(id);
      await refreshStats();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete fact';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [refreshStats]);

  /**
   * Get a fact by ID.
   */
  const getFactById = useCallback(async (id: string): Promise<TemporalFact | null> => {
    if (!hasKeys) {
      throw new Error('Encryption keys not unlocked');
    }

    try {
      const privateKey = getPrivateKey();
      return await getFact(privateKey, id);
    } catch (err) {
      console.error('[useTemporalFacts] Failed to get fact:', err);
      return null;
    }
  }, [hasKeys, getPrivateKey]);

  /**
   * Get current value for a subject-predicate.
   */
  const getCurrentValue = useCallback(async (
    subject: string,
    predicate: string
  ): Promise<TemporalFact | null> => {
    if (!hasKeys) {
      throw new Error('Encryption keys not unlocked');
    }

    try {
      const privateKey = getPrivateKey();
      return await getCurrentFact(privateKey, subject, predicate);
    } catch (err) {
      console.error('[useTemporalFacts] Failed to get current fact:', err);
      return null;
    }
  }, [hasKeys, getPrivateKey]);

  /**
   * Query facts.
   */
  const query = useCallback(async (q: TemporalQuery): Promise<TemporalFact[]> => {
    if (!hasKeys) {
      throw new Error('Encryption keys not unlocked');
    }

    setIsLoading(true);
    setError(null);

    try {
      const privateKey = getPrivateKey();
      return await queryFacts(privateKey, q);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to query facts';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [hasKeys, getPrivateKey]);

  /**
   * Get all facts for the user.
   */
  const getAllFacts = useCallback(async (includeHistorical = false): Promise<TemporalFact[]> => {
    if (!hasKeys) {
      throw new Error('Encryption keys not unlocked');
    }

    setIsLoading(true);
    setError(null);

    try {
      const privateKey = getPrivateKey();
      return await getFactsBySubject(privateKey, 'user', includeHistorical);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to get facts';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [hasKeys, getPrivateKey]);

  /**
   * Clear all facts.
   */
  const clearAll = useCallback(async (): Promise<number> => {
    setIsLoading(true);
    setError(null);

    try {
      const count = await clearAllFacts();
      await refreshStats();
      return count;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to clear facts';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [refreshStats]);

  return {
    isExtractionReady: isReady,
    isLoading,
    error,
    stats,
    initializeExtraction,
    extractAndStoreFacts,
    searchRelevantFacts,
    getRelevantContextForLLM,
    addFact,
    updateFactById,
    invalidateFactById,
    deleteFactById,
    getFactById,
    getCurrentValue,
    query,
    getAllFacts,
    clearAll,
    refreshStats,
  };
}
