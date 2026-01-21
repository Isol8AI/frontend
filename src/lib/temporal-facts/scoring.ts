/**
 * Scoring and ranking functions for temporal facts.
 *
 * This module provides:
 * - Fact scoring based on similarity, recency, type, and confidence
 * - Query type detection heuristics
 * - Merged ranking of facts and memories
 * - Conflict resolution for contradictory information
 */

import type {
  TemporalFact,
  FactType,
  QueryType,
  RankedCandidate,
  ConflictResolution,
} from './types';
import {
  FACT_TYPE_BOOST_MATRIX,
  QUERY_TYPE_WEIGHTS,
  FACT_SCORING_WEIGHTS,
  isEphemeralFactType,
} from './types';

// =============================================================================
// Query Type Detection
// =============================================================================

/**
 * Patterns for detecting query type from user message.
 */
const QUERY_TYPE_PATTERNS: Record<QueryType, RegExp[]> = {
  stateful: [
    /\bcurrently?\b/i,
    /\bright now\b/i,
    /\bwhat('?s| is)? (the )?(current|latest)\b/i,
    /\bworking on\b/i,
    /\bdoing\b/i,
    /\berror\b/i,
    /\bfailed?\b/i,
    /\bbug\b/i,
    /\bissue\b/i,
    /\bstatus\b/i,
    /\bblocked\b/i,
    /\btrying to\b/i,
    /\bproblem\b/i,
  ],
  preference: [
    /\bprefer\b/i,
    /\bfavorite\b/i,
    /\blike\b/i,
    /\bhate\b/i,
    /\bdislike\b/i,
    /\bwant\b/i,
    /\blove\b/i,
    /\buse\b/i,
    /\bchoose\b/i,
    /\bbetter\b/i,
    /\bworse\b/i,
    /\bshould (I|we)\b/i,
    /\brecommend\b/i,
  ],
  identity: [
    /\bwho am I\b/i,
    /\bwhat (do|did) I (do|work)\b/i,
    /\bmy (name|job|role|team)\b/i,
    /\bI('?m| am)\b/i,
    /\babout (me|myself)\b/i,
    /\bwhere (do|did) I\b/i,
    /\bremember me\b/i,
    /\bmy (background|history)\b/i,
  ],
  general: [], // Fallback - no specific patterns
};

/**
 * Detect the query type from user message.
 * Uses pattern matching with priority ordering.
 */
export function detectQueryType(query: string): QueryType {
  // Check patterns in priority order
  const priorities: QueryType[] = ['stateful', 'preference', 'identity'];

  for (const type of priorities) {
    const patterns = QUERY_TYPE_PATTERNS[type];
    for (const pattern of patterns) {
      if (pattern.test(query)) {
        return type;
      }
    }
  }

  return 'general';
}

// =============================================================================
// Fact Scoring
// =============================================================================

/**
 * Calculate recency boost using exponential decay.
 * Returns a value between 0 and 1.
 *
 * @param ageSeconds - Age of the fact in seconds
 * @param halfLifeSeconds - Half-life for decay (from fact's decayHalfLife)
 */
export function calculateRecencyBoost(
  ageSeconds: number,
  halfLifeSeconds: number
): number {
  // Exponential decay: score = e^(-lambda * age)
  // lambda = ln(2) / halfLife
  const lambda = Math.LN2 / halfLifeSeconds;
  return Math.exp(-lambda * ageSeconds);
}

/**
 * Calculate the type boost for a fact given the query type.
 */
export function calculateTypeBoost(
  factType: FactType,
  queryType: QueryType
): number {
  return FACT_TYPE_BOOST_MATRIX[factType][queryType];
}

/**
 * Calculate the overall score for a fact.
 *
 * Formula: fact_score = sim * w_sim + recency * w_time + type_boost * w_type + confidence * w_conf
 *
 * @param fact - The temporal fact to score
 * @param similarity - Semantic similarity to query (0-1)
 * @param queryType - Detected query type
 * @param now - Current timestamp (defaults to Date.now())
 */
export function scoreFact(
  fact: TemporalFact,
  similarity: number,
  queryType: QueryType,
  now: number = Date.now()
): number {
  const ageSeconds = (now - fact.lastConfirmedAt) / 1000;

  const recencyBoost = calculateRecencyBoost(ageSeconds, fact.decayHalfLife);
  const typeBoost = calculateTypeBoost(fact.type, queryType);

  const score =
    similarity * FACT_SCORING_WEIGHTS.similarity +
    recencyBoost * FACT_SCORING_WEIGHTS.recency +
    typeBoost * FACT_SCORING_WEIGHTS.type +
    fact.confidence * FACT_SCORING_WEIGHTS.confidence;

  return score;
}

/**
 * Check if a fact has expired (past TTL).
 */
export function isFactExpired(fact: TemporalFact, now: number = Date.now()): boolean {
  if (fact.ttlSeconds === null) {
    return false; // No hard expiry
  }

  const expiryTime = fact.validFrom + fact.ttlSeconds * 1000;
  return now >= expiryTime;
}

/**
 * Check if a fact has been invalidated.
 */
export function isFactInvalidated(fact: TemporalFact, now: number = Date.now()): boolean {
  return fact.validTo !== null && fact.validTo < now;
}

/**
 * Check if a fact is currently valid (not expired and not invalidated).
 */
export function isFactValid(fact: TemporalFact, now: number = Date.now()): boolean {
  return !isFactExpired(fact, now) && !isFactInvalidated(fact, now);
}

// =============================================================================
// Memory Scoring (for server-side memories)
// =============================================================================

/**
 * Memory data structure from server (OpenMemory).
 */
export interface Memory {
  id: string;
  content: string;
  sector: string;
  confidence: number;
  createdAt: number;
  lastSeenAt: number;
  salience: number;
}

/**
 * Calculate the score for a memory.
 * Simpler than facts - just similarity * salience * recency.
 */
export function scoreMemory(
  memory: Memory,
  similarity: number,
  now: number = Date.now()
): number {
  // Memory recency uses a fixed 7-day half-life
  const ageSeconds = (now - memory.lastSeenAt) / 1000;
  const recencyBoost = calculateRecencyBoost(ageSeconds, 7 * 24 * 3600);

  // Combine similarity, salience, and recency
  return similarity * 0.5 + memory.salience * 0.3 + recencyBoost * 0.2;
}

// =============================================================================
// Merged Ranking
// =============================================================================

/**
 * Normalize scores to 0-1 range using min-max normalization.
 */
function normalizeScores(scores: number[]): number[] {
  if (scores.length === 0) return [];

  const min = Math.min(...scores);
  const max = Math.max(...scores);

  if (max === min) {
    // All scores are the same - return 0.5 for all
    return scores.map(() => 0.5);
  }

  return scores.map((s) => (s - min) / (max - min));
}

/**
 * Convert a fact to a ranked candidate.
 */
export function factToCandidate(
  fact: TemporalFact,
  normalizedScore: number
): RankedCandidate {
  const now = Date.now();
  return {
    type: 'fact',
    content: `${fact.subject} ${fact.predicate} ${fact.object}`,
    normalizedScore,
    metadata: {
      factType: fact.type,
      confidence: fact.confidence,
      age: (now - fact.lastConfirmedAt) / 1000,
    },
  };
}

/**
 * Convert a memory to a ranked candidate.
 */
export function memoryToCandidate(
  memory: Memory,
  normalizedScore: number
): RankedCandidate {
  const now = Date.now();
  return {
    type: 'memory',
    content: memory.content,
    normalizedScore,
    metadata: {
      sector: memory.sector,
      confidence: memory.salience,
      age: (now - memory.lastSeenAt) / 1000,
    },
  };
}

/**
 * Merge and rank facts and memories into a single list.
 *
 * @param scoredFacts - Array of [fact, rawScore] pairs
 * @param scoredMemories - Array of [memory, rawScore] pairs
 * @param queryType - The detected query type
 * @param limit - Maximum number of candidates to return
 */
export function mergeAndRank(
  scoredFacts: Array<[TemporalFact, number]>,
  scoredMemories: Array<[Memory, number]>,
  queryType: QueryType,
  limit: number = 10
): RankedCandidate[] {
  // Normalize scores within each group
  const factScores = normalizeScores(scoredFacts.map(([, s]) => s));
  const memoryScores = normalizeScores(scoredMemories.map(([, s]) => s));

  // Apply query type weights
  const weights = QUERY_TYPE_WEIGHTS[queryType];

  // Convert to candidates with adjusted scores
  const factCandidates = scoredFacts.map(([fact], i) =>
    factToCandidate(fact, factScores[i] * weights.factWeight)
  );

  const memoryCandidates = scoredMemories.map(([memory], i) =>
    memoryToCandidate(memory, memoryScores[i] * weights.memoryWeight)
  );

  // Merge and sort by normalized score
  const allCandidates = [...factCandidates, ...memoryCandidates];
  allCandidates.sort((a, b) => b.normalizedScore - a.normalizedScore);

  return allCandidates.slice(0, limit);
}

// =============================================================================
// Conflict Resolution
// =============================================================================

/**
 * Detect if two candidates are about the same topic and conflict.
 * This is a heuristic check based on content overlap.
 */
export function detectConflict(
  a: RankedCandidate,
  b: RankedCandidate
): boolean {
  // Extract key terms from each candidate
  const aTerms = new Set(
    a.content
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 3)
  );
  const bTerms = new Set(
    b.content
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 3)
  );

  // Calculate Jaccard similarity
  const intersection = [...aTerms].filter((t) => bTerms.has(t)).length;
  const union = new Set([...aTerms, ...bTerms]).size;
  const similarity = union > 0 ? intersection / union : 0;

  // If significant overlap (>30%), consider potential conflict
  return similarity > 0.3;
}

/**
 * Resolve a conflict between two candidates.
 *
 * Priority rules:
 * 1. For stateful queries: ephemeral facts win over stable facts/memories
 * 2. For preference/identity queries: memories win over ephemeral facts
 * 3. Higher confidence wins when types are similar
 * 4. More recent wins when confidence is similar
 */
export function resolveConflict(
  a: RankedCandidate,
  b: RankedCandidate,
  queryType: QueryType
): ConflictResolution {
  let winner: RankedCandidate;
  let loser: RankedCandidate;
  let reason: string;
  let action: ConflictResolution['action'] = 'drop_loser';

  // Determine winner based on query type and candidate properties
  if (queryType === 'stateful') {
    // For stateful queries, ephemeral facts are more relevant
    const aIsEphemeral =
      a.type === 'fact' && a.metadata.factType && isEphemeralFactType(a.metadata.factType);
    const bIsEphemeral =
      b.type === 'fact' && b.metadata.factType && isEphemeralFactType(b.metadata.factType);

    if (aIsEphemeral && !bIsEphemeral) {
      winner = a;
      loser = b;
      reason = 'Ephemeral fact preferred for stateful query';
    } else if (!aIsEphemeral && bIsEphemeral) {
      winner = b;
      loser = a;
      reason = 'Ephemeral fact preferred for stateful query';
    } else {
      // Both ephemeral or both not - prefer more recent
      if (a.metadata.age < b.metadata.age) {
        winner = a;
        loser = b;
        reason = 'More recent candidate preferred';
      } else {
        winner = b;
        loser = a;
        reason = 'More recent candidate preferred';
      }
    }
  } else if (queryType === 'preference' || queryType === 'identity') {
    // For preference/identity queries, memories are more comprehensive
    if (a.type === 'memory' && b.type !== 'memory') {
      winner = a;
      loser = b;
      reason = 'Memory preferred for preference/identity query';
    } else if (a.type !== 'memory' && b.type === 'memory') {
      winner = b;
      loser = a;
      reason = 'Memory preferred for preference/identity query';
    } else {
      // Both same type - prefer higher confidence
      if (a.metadata.confidence > b.metadata.confidence) {
        winner = a;
        loser = b;
        reason = 'Higher confidence preferred';
      } else {
        winner = b;
        loser = a;
        reason = 'Higher confidence preferred';
      }
    }
  } else {
    // General query - prefer higher normalized score
    if (a.normalizedScore > b.normalizedScore) {
      winner = a;
      loser = b;
      reason = 'Higher score preferred';
    } else {
      winner = b;
      loser = a;
      reason = 'Higher score preferred';
    }
  }

  // Check if we should merge or flag as ambiguous
  const scoreDiff = Math.abs(a.normalizedScore - b.normalizedScore);
  if (scoreDiff < 0.1) {
    // Very close scores - might be ambiguous
    action = 'flag_ambiguous';
  }

  return { winner, loser, reason, action };
}

/**
 * Process ranked candidates and resolve conflicts.
 * Returns a list with conflicts resolved.
 */
export function resolveConflicts(
  candidates: RankedCandidate[],
  queryType: QueryType
): RankedCandidate[] {
  if (candidates.length <= 1) {
    return candidates;
  }

  const resolved: RankedCandidate[] = [];
  const dropped = new Set<number>();

  for (let i = 0; i < candidates.length; i++) {
    if (dropped.has(i)) continue;

    const current = candidates[i];
    let shouldAdd = true;

    // Check for conflicts with remaining candidates
    for (let j = i + 1; j < candidates.length; j++) {
      if (dropped.has(j)) continue;

      const other = candidates[j];
      if (detectConflict(current, other)) {
        const resolution = resolveConflict(current, other, queryType);

        if (resolution.action === 'drop_loser') {
          // Drop the loser
          const loserIndex = resolution.loser === current ? i : j;
          dropped.add(loserIndex);
          if (loserIndex === i) {
            shouldAdd = false;
          }
        } else if (resolution.action === 'flag_ambiguous') {
          // Keep both but add a note (could be used for UI indication)
          console.log(
            `[Scoring] Ambiguous conflict: "${current.content}" vs "${other.content}"`
          );
        }
        // merge_both: keep both (no action needed)
      }
    }

    if (shouldAdd) {
      resolved.push(current);
    }
  }

  return resolved;
}

// =============================================================================
// High-Level API
// =============================================================================

/**
 * Score and rank facts for a given query.
 *
 * @param facts - Array of temporal facts to score
 * @param similarities - Array of similarity scores (same order as facts)
 * @param query - The user query string
 * @param now - Current timestamp
 */
export function rankFacts(
  facts: TemporalFact[],
  similarities: number[],
  query: string,
  now: number = Date.now()
): Array<[TemporalFact, number]> {
  const queryType = detectQueryType(query);

  // Filter out expired/invalidated facts
  const validFacts = facts.filter((f) => isFactValid(f, now));

  // Score each valid fact
  const scored: Array<[TemporalFact, number]> = validFacts.map((fact, i) => {
    const similarity = similarities[i] ?? 0;
    const score = scoreFact(fact, similarity, queryType, now);
    return [fact, score];
  });

  // Sort by score descending
  scored.sort(([, a], [, b]) => b - a);

  return scored;
}

/**
 * Get the top relevant facts and memories for a query, with conflict resolution.
 *
 * @param facts - Scored facts from rankFacts
 * @param memories - Scored memories from server
 * @param query - The user query
 * @param limit - Maximum candidates to return
 */
export function getRelevantContext(
  scoredFacts: Array<[TemporalFact, number]>,
  scoredMemories: Array<[Memory, number]>,
  query: string,
  limit: number = 10
): RankedCandidate[] {
  const queryType = detectQueryType(query);

  // Merge and rank
  const merged = mergeAndRank(scoredFacts, scoredMemories, queryType, limit * 2);

  // Resolve conflicts
  const resolved = resolveConflicts(merged, queryType);

  // Return top-k
  return resolved.slice(0, limit);
}

/**
 * Format ranked candidates for LLM context injection.
 */
export function formatForLLM(candidates: RankedCandidate[]): string {
  if (candidates.length === 0) {
    return '';
  }

  const factLines: string[] = [];
  const memoryLines: string[] = [];

  for (const candidate of candidates) {
    if (candidate.type === 'fact') {
      factLines.push(`- ${candidate.content}`);
    } else {
      memoryLines.push(`- ${candidate.content}`);
    }
  }

  let result = '';

  if (factLines.length > 0) {
    result += '## Current Session Facts\n';
    result += factLines.join('\n');
    result += '\n\n';
  }

  if (memoryLines.length > 0) {
    result += '## Long-term Memories\n';
    result += memoryLines.join('\n');
  }

  return result.trim();
}
