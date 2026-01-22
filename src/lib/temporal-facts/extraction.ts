/**
 * Fact extraction using Transformers.js.
 *
 * This module extracts temporal facts from conversation turns using
 * a small language model running entirely in the browser.
 *
 * Uses the same model loading pattern as client-embeddings.ts for
 * efficient resource sharing.
 */

'use client';

import { pipeline, env, type TextGenerationPipeline } from '@huggingface/transformers';
import type { ExtractedFactCandidate, PredicateType, FactType, FactSource } from './types';

// =============================================================================
// Configuration
// =============================================================================

// Configure Transformers.js for browser use
env.allowLocalModels = false;

// Set HuggingFace access token for gated models (Gemma)
// Next.js inlines NEXT_PUBLIC_* at build time
const HF_TOKEN = process.env.NEXT_PUBLIC_HUGGINGFACE_TOKEN;
if (HF_TOKEN) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (env as any).accessToken = HF_TOKEN;
  console.log('[FactExtraction] HuggingFace token configured');
} else {
  console.warn('[FactExtraction] No HuggingFace token found - gated models will fail');
}

// Model for fact extraction - TinyLlama 1.1B is small enough for browser
// and is instruction-tuned for chat/extraction tasks
const EXTRACTION_MODEL = 'Xenova/TinyLlama-1.1B-Chat-v1.0';

// Fallback: Skip LLM entirely and use simple pattern extraction
// This avoids browser hangs from large models
const FALLBACK_MODEL = null; // Use extractFactsSimple instead

// =============================================================================
// State
// =============================================================================

let extractorPipeline: TextGenerationPipeline | null = null;
let loadingPromise: Promise<TextGenerationPipeline> | null = null;
let initError: Error | null = null;
let modelUsed: string | null = null;

// =============================================================================
// Initialization
// =============================================================================

/**
 * Initialize the extraction model.
 *
 * This loads a small LLM for fact extraction. The model is loaded
 * lazily on first use.
 */
export async function initExtraction(): Promise<void> {
  if (extractorPipeline) {
    return;
  }

  if (initError) {
    throw initError;
  }

  if (loadingPromise) {
    await loadingPromise;
    return;
  }

  console.log('[FactExtraction] Initializing extraction model...');

  loadingPromise = (async () => {
    // Try primary model first with WebGPU
    console.log(`[FactExtraction] Attempting WebGPU load of ${EXTRACTION_MODEL}...`);
    try {
      const extractor = await pipeline('text-generation', EXTRACTION_MODEL, {
        device: 'webgpu',
      });
      console.log(`[FactExtraction] ✓ Model loaded with WebGPU: ${EXTRACTION_MODEL}`);
      extractorPipeline = extractor;
      modelUsed = EXTRACTION_MODEL;
      return extractor;
    } catch (primaryError) {
      console.warn(`[FactExtraction] ✗ WebGPU load failed for ${EXTRACTION_MODEL}:`, primaryError);
      console.log('[FactExtraction] Error details:', {
        message: (primaryError as Error)?.message,
        name: (primaryError as Error)?.name,
      });
    }

    // Try with WASM fallback
    console.log(`[FactExtraction] Attempting WASM load of ${EXTRACTION_MODEL}...`);
    try {
      const extractor = await pipeline('text-generation', EXTRACTION_MODEL);
      console.log(`[FactExtraction] ✓ Model loaded with WASM: ${EXTRACTION_MODEL}`);
      extractorPipeline = extractor;
      modelUsed = EXTRACTION_MODEL;
      return extractor;
    } catch (wasmError) {
      console.warn(`[FactExtraction] ✗ WASM load failed for ${EXTRACTION_MODEL}:`, wasmError);
      console.log('[FactExtraction] Error details:', {
        message: (wasmError as Error)?.message,
        name: (wasmError as Error)?.name,
      });
    }

    // No fallback model configured - use simple extraction instead
    if (!FALLBACK_MODEL) {
      console.log('[FactExtraction] No fallback model configured, will use simple extraction');
      initError = new Error('Primary model failed, using simple extraction');
      throw initError;
    }

    // Try fallback model if configured
    console.log(`[FactExtraction] Attempting fallback model load: ${FALLBACK_MODEL}...`);
    try {
      const extractor = await pipeline('text-generation', FALLBACK_MODEL);
      console.log(`[FactExtraction] ✓ Fallback model loaded: ${FALLBACK_MODEL}`);
      extractorPipeline = extractor;
      modelUsed = FALLBACK_MODEL;
      return extractor;
    } catch (fallbackError) {
      console.error(`[FactExtraction] ✗ All model loads failed. Final error:`, fallbackError);
      initError = fallbackError instanceof Error
        ? fallbackError
        : new Error('Failed to load extraction model');
      throw initError;
    }
  })();

  await loadingPromise;
  loadingPromise = null;
}

/**
 * Check if extraction is ready.
 */
export function isExtractionReady(): boolean {
  return extractorPipeline !== null;
}

/**
 * Get the model being used for extraction.
 */
export function getExtractionModel(): string | null {
  return modelUsed;
}

// =============================================================================
// Type Inference
// =============================================================================

/**
 * Map from predicate to inferred fact type.
 */
const PREDICATE_TO_FACT_TYPE: Record<string, FactType> = {
  prefers: 'preference',
  works_at: 'identity',
  located_in: 'identity',
  interested_in: 'preference',
  has_skill: 'identity',
  dislikes: 'preference',
  plans_to: 'plan',
  uses: 'preference',
  knows: 'observation',
  mentioned: 'observation',
};

/**
 * Infer the fact type from the predicate.
 */
function inferFactType(predicate: string): FactType {
  return PREDICATE_TO_FACT_TYPE[predicate] ?? 'observation';
}

/**
 * Extract entity tags from the object and context.
 * Returns simple keyword entities for filtering.
 */
function extractEntities(object: string, predicate: string): string[] {
  const entities: string[] = [];

  // Add the object as an entity (normalized)
  const normalizedObject = object.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  if (normalizedObject.length > 2) {
    entities.push(normalizedObject);
  }

  // Add predicate as a category tag
  entities.push(predicate);

  // Split multi-word objects into individual terms
  const words = normalizedObject.split(/\s+/).filter(w => w.length > 3);
  for (const word of words) {
    if (!entities.includes(word)) {
      entities.push(word);
    }
  }

  return entities;
}

// =============================================================================
// Extraction
// =============================================================================

/**
 * Build the prompt for fact extraction.
 */
function buildExtractionPrompt(
  userMessage: string,
  assistantResponse: string
): string {
  return `Extract facts from this conversation as JSON. Only extract facts worth remembering long-term.

Valid predicates: prefers, works_at, located_in, interested_in, has_skill, dislikes, plans_to, uses, knows, mentioned

Conversation:
User: ${userMessage}
Assistant: ${assistantResponse}

Output ONLY a valid JSON array with this format (no other text):
[{"subject": "user", "predicate": "prefers", "object": "TypeScript", "confidence": 0.9}]

If no facts worth extracting, output: []`;
}

/**
 * Parse the model output to extract facts.
 */
function parseExtractionOutput(output: string): ExtractedFactCandidate[] {
  try {
    // Try to find JSON array in the output
    const jsonMatch = output.match(/\[[\s\S]*?\]/);
    if (!jsonMatch) {
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) {
      return [];
    }

    // Validate and normalize each fact
    const validPredicates = new Set<string>([
      'prefers', 'works_at', 'located_in', 'interested_in',
      'has_skill', 'dislikes', 'plans_to', 'uses', 'knows', 'mentioned',
    ]);

    const facts: ExtractedFactCandidate[] = [];

    for (const item of parsed) {
      if (
        typeof item.subject !== 'string' ||
        typeof item.predicate !== 'string' ||
        typeof item.object !== 'string'
      ) {
        continue;
      }

      const predicate = item.predicate.toLowerCase().trim();
      if (!validPredicates.has(predicate)) {
        continue;
      }

      const confidence = typeof item.confidence === 'number'
        ? Math.max(0, Math.min(1, item.confidence))
        : 0.7;

      // Skip low-confidence extractions
      if (confidence < 0.5) {
        continue;
      }

      const objectTrimmed = item.object.trim();
      facts.push({
        subject: item.subject.toLowerCase().trim(),
        predicate: predicate as PredicateType,
        object: objectTrimmed,
        confidence,
        type: inferFactType(predicate),
        source: 'system' as FactSource,  // Extracted by system
        entities: extractEntities(objectTrimmed, predicate),
      });
    }

    return facts;
  } catch (err) {
    console.warn('[FactExtraction] Failed to parse output:', err);
    return [];
  }
}

/**
 * Extract facts from a conversation turn using the LLM.
 *
 * @param userMessage - The user's message
 * @param assistantResponse - The assistant's response
 * @returns Array of extracted fact candidates
 */
export async function extractFacts(
  userMessage: string,
  assistantResponse: string
): Promise<ExtractedFactCandidate[]> {
  // Ensure model is loaded
  if (!extractorPipeline) {
    await initExtraction();
  }

  if (!extractorPipeline) {
    throw new Error('Extraction model not initialized');
  }

  const prompt = buildExtractionPrompt(userMessage, assistantResponse);

  try {
    // Generate extraction
    const outputs = await extractorPipeline(prompt, {
      max_new_tokens: 256,
      temperature: 0.3, // Low temp for structured output
      do_sample: true,
      top_p: 0.9,
    });

    // Extract text from output
    let outputText = '';
    if (Array.isArray(outputs) && outputs.length > 0) {
      const first = outputs[0];
      if (typeof first === 'object' && 'generated_text' in first) {
        outputText = first.generated_text as string;
        // Remove the prompt from the output
        if (outputText.startsWith(prompt)) {
          outputText = outputText.slice(prompt.length);
        }
      }
    }

    const facts = parseExtractionOutput(outputText);
    console.log(`[FactExtraction] Extracted ${facts.length} facts`);

    return facts;
  } catch (err) {
    console.error('[FactExtraction] Extraction failed:', err);
    return [];
  }
}

/**
 * Extract facts using simple pattern matching.
 *
 * This is a fallback for when the LLM model can't be loaded.
 * It uses heuristics to identify common patterns.
 */
export function extractFactsSimple(
  userMessage: string,
  assistantResponse: string
): ExtractedFactCandidate[] {
  const facts: ExtractedFactCandidate[] = [];
  const text = `${userMessage} ${assistantResponse}`.toLowerCase();

  // Pattern: "I prefer X" or "I like X"
  const preferPatterns = [
    /i (?:prefer|like|love|enjoy|use) (\w+(?:\s+\w+)?)/gi,
    /my favorite (?:\w+\s+)?is (\w+(?:\s+\w+)?)/gi,
  ];

  for (const pattern of preferPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const objectTrimmed = match[1].trim();
      facts.push({
        subject: 'user',
        predicate: 'prefers',
        object: objectTrimmed,
        confidence: 0.6,
        type: 'preference',
        source: 'system',
        entities: extractEntities(objectTrimmed, 'prefers'),
      });
    }
  }

  // Pattern: "I work at X" or "I'm at X"
  const workPatterns = [
    /i (?:work|am|work at|work for) (?:at |for )?(\w+(?:\s+\w+)?(?:\s+\w+)?)/gi,
  ];

  for (const pattern of workPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const company = match[1].trim();
      if (company.length > 2 && !['a', 'the', 'an', 'am'].includes(company)) {
        facts.push({
          subject: 'user',
          predicate: 'works_at',
          object: company,
          confidence: 0.5,
          type: 'identity',
          source: 'system',
          entities: extractEntities(company, 'works_at'),
        });
      }
    }
  }

  // Pattern: "I live in X" or "I'm from X" or "I'm in X"
  const locationPatterns = [
    /i (?:live|am|come|located) (?:in|from|at) (\w+(?:\s+\w+)?)/gi,
    /i'm (?:in|from|at) (\w+(?:\s+\w+)?)/gi,
  ];

  for (const pattern of locationPatterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const location = match[1].trim();
      facts.push({
        subject: 'user',
        predicate: 'located_in',
        object: location,
        confidence: 0.5,
        type: 'identity',
        source: 'system',
        entities: extractEntities(location, 'located_in'),
      });
    }
  }

  // Deduplicate facts
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.subject}:${fact.predicate}:${fact.object}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Extract facts with automatic fallback to simple extraction.
 */
export async function extractFactsWithFallback(
  userMessage: string,
  assistantResponse: string
): Promise<ExtractedFactCandidate[]> {
  console.log('[FactExtraction] extractFactsWithFallback called');
  console.log('[FactExtraction] isExtractionReady:', isExtractionReady());
  console.log('[FactExtraction] extractorPipeline:', extractorPipeline ? 'loaded' : 'null');
  console.log('[FactExtraction] modelUsed:', modelUsed);
  console.log('[FactExtraction] initError:', initError);

  try {
    // Try LLM extraction first
    console.log('[FactExtraction] Attempting LLM extraction...');
    const facts = await extractFacts(userMessage, assistantResponse);
    console.log('[FactExtraction] LLM extraction succeeded, facts:', facts.length);
    return facts;
  } catch (err) {
    console.warn('[FactExtraction] LLM extraction failed, using simple extraction:', err);
    const simpleFacts = extractFactsSimple(userMessage, assistantResponse);
    console.log('[FactExtraction] Simple extraction returned', simpleFacts.length, 'facts');
    return simpleFacts;
  }
}

// =============================================================================
// Cleanup
// =============================================================================

/**
 * Dispose of the extraction model to free memory.
 */
export function disposeExtraction(): void {
  if (extractorPipeline) {
    extractorPipeline = null;
    loadingPromise = null;
    initError = null;
    modelUsed = null;
    console.log('[FactExtraction] Model disposed');
  }
}
