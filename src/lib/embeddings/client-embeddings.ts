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

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize the embedding pipeline.
 *
 * This function is idempotent - calling it multiple times is safe.
 * The model is loaded lazily on first call.
 *
 * @throws Error if model loading fails
 */
export async function initEmbeddings(): Promise<void> {
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
 */
export function isEmbeddingsReady(): boolean {
  return extractorPipeline !== null;
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
 * Generate an embedding vector for the given text.
 *
 * The embedding is normalized for cosine similarity search.
 * This function will lazily initialize the model if needed.
 *
 * @param text - Text to generate embedding for
 * @returns 384-dimensional embedding vector
 * @throws Error if text is empty or model loading fails
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error('Cannot generate embedding for empty text');
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
