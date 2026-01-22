/**
 * Client-side embedding generation using Transformers.js.
 *
 * This module provides browser-side embedding generation for memory search.
 * Uses the same model as the enclave (all-MiniLM-L6-v2) to ensure
 * compatible embeddings for semantic search.
 *
 * Features:
 * - Lazy loading: Model is only loaded when first needed
 * - WebGPU acceleration with WASM fallback
 * - Normalized embeddings for cosine similarity search
 * - 384-dimensional output matching enclave embeddings
 */

'use client';

import { pipeline, env, type FeatureExtractionPipeline } from '@huggingface/transformers';

// =============================================================================
// Configuration
// =============================================================================

// Configure Transformers.js for browser use
env.allowLocalModels = false;

// Model configuration - must match enclave's embedding model
const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384;

// =============================================================================
// State
// =============================================================================

/** Singleton pipeline instance (lazy loaded) */
let extractorPipeline: FeatureExtractionPipeline | null = null;

/** Loading promise to prevent concurrent initialization */
let loadingPromise: Promise<FeatureExtractionPipeline> | null = null;

/** Initialization error if any */
let initError: Error | null = null;

/** Test mode flag - when true, uses mock embeddings instead of real model */
let testMode = false;

// Auto-detect test mode from window flag (set by E2E tests via addInitScript)
if (typeof window !== 'undefined') {
  const win = window as unknown as { __EMBEDDINGS_TEST_MODE__?: boolean };
  if (win.__EMBEDDINGS_TEST_MODE__ === true) {
    testMode = true;
    console.log('[Embeddings] Test mode auto-detected from window flag');
  }
}

/**
 * Enable test mode for embeddings.
 * In test mode, embeddings are generated as random normalized vectors
 * without loading the ML model. This is useful for E2E tests.
 */
export function enableTestMode(): void {
  testMode = true;
  console.log('[Embeddings] Test mode enabled');
}

/**
 * Check if test mode is enabled.
 */
export function isTestMode(): boolean {
  return testMode;
}

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize the embedding pipeline.
 *
 * This function is idempotent - calling it multiple times is safe.
 * The model is loaded lazily on first call.
 *
 * In test mode, this is a no-op as we use mock embeddings.
 *
 * @throws Error if model loading fails
 */
export async function initEmbeddings(): Promise<void> {
  // Test mode - no real initialization needed
  if (testMode) {
    console.log('[Embeddings] Test mode - skipping model initialization');
    return;
  }

  // Already initialized
  if (extractorPipeline) {
    return;
  }

  // Previous init failed
  if (initError) {
    throw initError;
  }

  // Currently loading - wait for it
  if (loadingPromise) {
    await loadingPromise;
    return;
  }

  // Start loading
  console.log('[Embeddings] Initializing embedding model...');

  loadingPromise = (async () => {
    try {
      // Try WebGPU first, fall back to WASM
      const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL, {
        // WebGPU provides significant speedup on supported browsers
        // Falls back to WASM automatically if unavailable
        device: 'webgpu',
      });

      console.log('[Embeddings] Model loaded successfully');
      extractorPipeline = extractor;
      return extractor;
    } catch {
      console.warn('[Embeddings] WebGPU not available, falling back to WASM...');

      try {
        // Fallback to WASM (works everywhere)
        const extractor = await pipeline('feature-extraction', EMBEDDING_MODEL);
        console.log('[Embeddings] Model loaded with WASM fallback');
        extractorPipeline = extractor;
        return extractor;
      } catch (fallbackError) {
        initError = fallbackError instanceof Error
          ? fallbackError
          : new Error('Failed to load embedding model');
        throw initError;
      }
    }
  })();

  await loadingPromise;
  loadingPromise = null;
}

/**
 * Check if embeddings are ready to use.
 * In test mode, always returns true.
 */
export function isEmbeddingsReady(): boolean {
  return testMode || extractorPipeline !== null;
}

/**
 * Check if initialization was attempted but failed.
 */
export function hasEmbeddingsError(): boolean {
  return initError !== null;
}

/**
 * Get the initialization error if any.
 */
export function getEmbeddingsError(): Error | null {
  return initError;
}

// =============================================================================
// Embedding Generation
// =============================================================================

/**
 * Generate a deterministic mock embedding for testing.
 * Uses a simple hash of the text to create reproducible embeddings.
 */
function generateMockEmbedding(text: string): number[] {
  // Simple hash for deterministic results
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  // Generate deterministic embedding based on hash
  const embedding: number[] = [];
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    // Use hash + index to generate each dimension
    const seed = hash + i * 31;
    const value = Math.sin(seed) * 2 - 1;
    embedding.push(value);
  }

  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0));
  return embedding.map(v => v / norm);
}

/**
 * Generate an embedding vector for the given text.
 *
 * The embedding is normalized for cosine similarity search.
 * This function will lazily initialize the model if needed.
 *
 * In test mode, returns a deterministic mock embedding.
 *
 * @param text - Text to generate embedding for
 * @returns 384-dimensional embedding vector
 * @throws Error if text is empty or model loading fails
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate embedding for empty text');
  }

  // Test mode - return mock embedding
  if (testMode) {
    console.log('[Embeddings] Test mode - generating mock embedding');
    return generateMockEmbedding(text);
  }

  // Ensure model is loaded
  if (!extractorPipeline) {
    await initEmbeddings();
  }

  if (!extractorPipeline) {
    throw new Error('Embedding model not initialized');
  }

  // Generate embedding with mean pooling and normalization
  // This matches the enclave's sentence-transformers configuration
  const output = await extractorPipeline(text, {
    pooling: 'mean',
    normalize: true,
  });

  // Extract the embedding array from the tensor
  // The output shape is [1, 384] for a single input
  const embedding = Array.from(output.data as Float32Array);

  // Verify dimensions match expected
  if (embedding.length !== EMBEDDING_DIM) {
    console.warn(
      `[Embeddings] Unexpected dimension: got ${embedding.length}, expected ${EMBEDDING_DIM}`
    );
  }

  return embedding;
}

/**
 * Generate embeddings for multiple texts in batch.
 *
 * More efficient than calling generateEmbedding() multiple times
 * for multiple texts.
 *
 * @param texts - Array of texts to generate embeddings for
 * @returns Array of 384-dimensional embedding vectors
 * @throws Error if any text is empty or model loading fails
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  // Validate all texts
  for (const text of texts) {
    if (!text || text.trim().length === 0) {
      throw new Error('Cannot generate embedding for empty text');
    }
  }

  // Ensure model is loaded
  if (!extractorPipeline) {
    await initEmbeddings();
  }

  if (!extractorPipeline) {
    throw new Error('Embedding model not initialized');
  }

  // Generate embeddings in batch
  const outputs = await extractorPipeline(texts, {
    pooling: 'mean',
    normalize: true,
  });

  // Extract embeddings from tensor output
  // For batch input, shape is [batch_size, 384]
  const embeddings: number[][] = [];
  const data = outputs.data as Float32Array;

  for (let i = 0; i < texts.length; i++) {
    const start = i * EMBEDDING_DIM;
    const end = start + EMBEDDING_DIM;
    embeddings.push(Array.from(data.slice(start, end)));
  }

  return embeddings;
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Dispose of the embedding model to free memory.
 *
 * Call this when embeddings are no longer needed (e.g., on page unload).
 */
export function disposeEmbeddings(): void {
  if (extractorPipeline) {
    // The pipeline doesn't have a dispose method, but we can clear the reference
    extractorPipeline = null;
    loadingPromise = null;
    initError = null;
    console.log('[Embeddings] Model disposed');
  }
}
