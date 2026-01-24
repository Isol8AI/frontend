/**
 * Hook for memory operations - search, fetch, and manage encrypted memories.
 *
 * This hook provides:
 * - Client-side embedding generation for memory search
 * - Memory search via the backend API
 * - Decryption of encrypted memory content
 * - Re-encryption of memories for transport to enclave
 * - Memory listing and deletion
 *
 * Security Model:
 * - Embeddings are generated client-side from plaintext queries
 * - Memory content is decrypted client-side using user/org private keys
 * - Backend only sees encrypted blobs and embeddings
 * - Memories are re-encrypted to enclave public key for transport
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { BACKEND_URL } from '@/lib/api';
import { useEncryption } from './useEncryption';
// Dynamic import to prevent bundling heavy ML packages in serverless functions
// These packages (onnxruntime-node ~400MB) exceed Vercel's 250MB limit
type EmbeddingsModule = typeof import('@/lib/embeddings/client-embeddings');
let embeddingsModule: EmbeddingsModule | null = null;

async function getEmbeddingsModule(): Promise<EmbeddingsModule> {
  if (!embeddingsModule) {
    embeddingsModule = await import('@/lib/embeddings/client-embeddings');
  }
  return embeddingsModule;
}

import {
  decryptStoredMemory,
  reEncryptMemoryForTransport,
  type SerializedEncryptedPayload,
} from '@/lib/crypto/message-crypto';

// =============================================================================
// Types
// =============================================================================

/** Memory item as returned by the API (encrypted) */
export interface EncryptedMemory {
  id: string;
  /** Encrypted ciphertext */
  content: string;
  primary_sector: string;
  tags: string[];
  /** Contains iv, auth_tag, ephemeral_public_key, hkdf_salt for decryption */
  metadata: SerializedEncryptedPayload & Record<string, unknown>;
  score?: number;
  salience: number;
  created_at?: string;
  last_accessed_at?: string;
  /** Whether this is an org memory (vs personal) */
  is_org_memory: boolean;
}

/** Decrypted memory with plaintext content */
export interface DecryptedMemory {
  id: string;
  /** Plaintext content */
  text: string;
  primary_sector: string;
  tags: string[];
  score?: number;
  salience: number;
  created_at?: string;
  is_org_memory: boolean;
  /** Original encrypted payload (for re-encryption) */
  encryptedPayload: SerializedEncryptedPayload;
}

/** Memory prepared for transport to enclave */
export interface TransportMemory {
  text: string;
  sector: string;
  encryptedPayload: SerializedEncryptedPayload;
}

export interface UseMemoriesOptions {
  /** Organization ID for org context (null = personal) */
  orgId?: string | null;
}

export interface UseMemoriesReturn {
  /** Whether the embedding model is loaded and ready */
  isReady: boolean;
  /** Whether an operation is in progress */
  isLoading: boolean;
  /** Current error message if any */
  error: string | null;
  /** Initialize the embedding model (called automatically on first search) */
  initializeEmbeddings: () => Promise<void>;
  /** Search memories by semantic similarity */
  searchMemories: (query: string, limit?: number) => Promise<DecryptedMemory[]>;
  /** Search and prepare memories for transport to enclave */
  searchAndPrepareForTransport: (query: string, limit?: number) => Promise<TransportMemory[]>;
  /** List all memories (for settings UI) */
  listMemories: (limit?: number, offset?: number) => Promise<DecryptedMemory[]>;
  /** Delete a specific memory */
  deleteMemory: (memoryId: string) => Promise<void>;
  /** Delete all memories for current context */
  deleteAllMemories: () => Promise<number>;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useMemories(options: UseMemoriesOptions = {}): UseMemoriesReturn {
  const { orgId } = options;
  const { getToken } = useAuth();
  const encryption = useEncryption();
  const isOrgContext = !!orgId;

  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track initialization
  const initPromiseRef = useRef<Promise<void> | null>(null);

  // Check readiness on mount (async)
  useEffect(() => {
    getEmbeddingsModule().then((mod) => {
      setIsReady(mod.isEmbeddingsReady());
    });
  }, []);

  /**
   * Initialize the embedding model.
   * This is called automatically on first search, but can be called
   * early for better UX (e.g., on page load).
   */
  const initializeEmbeddings = useCallback(async (): Promise<void> => {
    const mod = await getEmbeddingsModule();

    if (mod.isEmbeddingsReady()) {
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
        await mod.initEmbeddings();
        setIsReady(true);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load embedding model';
        setError(message);
        throw err;
      } finally {
        initPromiseRef.current = null;
      }
    })();

    await initPromiseRef.current;
  }, []);

  /**
   * Decrypt an encrypted memory.
   */
  const decryptMemory = useCallback((encrypted: EncryptedMemory): DecryptedMemory => {
    // For org memories in org context, use org key
    // For personal memories (even in org context), use personal key
    const useOrgKey = encrypted.is_org_memory && isOrgContext;

    let privateKey: string;
    if (useOrgKey) {
      const orgKey = encryption.getOrgPrivateKey();
      if (!orgKey) {
        throw new Error('Organization encryption keys not unlocked');
      }
      privateKey = orgKey;
    } else {
      const personalKey = encryption.getPrivateKey();
      if (!personalKey) {
        throw new Error('Personal encryption keys not unlocked');
      }
      privateKey = personalKey;
    }

    // Build the encrypted payload from metadata
    // The metadata contains the encryption details
    const encryptedPayload: SerializedEncryptedPayload = {
      ephemeral_public_key: encrypted.metadata.ephemeral_public_key || '',
      iv: encrypted.metadata.iv || '',
      ciphertext: encrypted.content, // The encrypted content is stored in content field
      auth_tag: encrypted.metadata.auth_tag || '',
      hkdf_salt: encrypted.metadata.hkdf_salt || '',
    };

    const text = decryptStoredMemory(privateKey, encryptedPayload);

    return {
      id: encrypted.id,
      text,
      primary_sector: encrypted.primary_sector,
      tags: encrypted.tags,
      score: encrypted.score,
      salience: encrypted.salience,
      created_at: encrypted.created_at,
      is_org_memory: encrypted.is_org_memory,
      encryptedPayload,
    };
  }, [encryption, isOrgContext]);

  /**
   * Search memories by semantic similarity.
   */
  const searchMemories = useCallback(async (
    query: string,
    limit: number = 10
  ): Promise<DecryptedMemory[]> => {
    // Ensure we have the right keys unlocked
    if (isOrgContext && !encryption.isOrgUnlocked) {
      throw new Error('Organization encryption keys not unlocked');
    }
    if (!encryption.state.isUnlocked) {
      throw new Error('Personal encryption keys not unlocked');
    }

    setIsLoading(true);
    setError(null);

    try {
      const mod = await getEmbeddingsModule();

      // Initialize embeddings if needed
      if (!mod.isEmbeddingsReady()) {
        await initializeEmbeddings();
      }

      // Generate embedding from query
      const embedding = await mod.generateEmbedding(query);

      // Get auth token
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Call search API
      const res = await fetch(`${BACKEND_URL}/memories/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          query_text: query,
          embedding,
          limit,
          org_id: orgId || undefined,
          include_personal: false, // Never cross personal/org memory boundaries
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to search memories');
      }

      const data = await res.json();
      const encryptedMemories: EncryptedMemory[] = data.memories || [];

      // Decrypt each memory
      const decryptedMemories: DecryptedMemory[] = [];
      for (const encrypted of encryptedMemories) {
        try {
          const decrypted = decryptMemory(encrypted);
          decryptedMemories.push(decrypted);
        } catch (decryptError) {
          // Log but continue - some memories might have different keys
          console.warn(`Failed to decrypt memory ${encrypted.id}:`, decryptError);
        }
      }

      return decryptedMemories;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to search memories';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [encryption, isOrgContext, orgId, getToken, initializeEmbeddings, decryptMemory]);

  /**
   * Search memories and prepare them for transport to enclave.
   * This decrypts the memories and re-encrypts them to the enclave's public key.
   */
  const searchAndPrepareForTransport = useCallback(async (
    query: string,
    limit: number = 10
  ): Promise<TransportMemory[]> => {
    if (!encryption.state.enclavePublicKey) {
      throw new Error('Enclave public key not available');
    }

    // Search and decrypt memories
    const memories = await searchMemories(query, limit);

    // Re-encrypt each memory for transport to enclave
    const transportMemories: TransportMemory[] = memories.map((memory) => {
      // Get the correct private key based on memory ownership
      let privateKey: string;
      if (memory.is_org_memory && isOrgContext) {
        const orgKey = encryption.getOrgPrivateKey();
        if (!orgKey) {
          throw new Error('Organization encryption keys not unlocked');
        }
        privateKey = orgKey;
      } else {
        const personalKey = encryption.getPrivateKey();
        if (!personalKey) {
          throw new Error('Personal encryption keys not unlocked');
        }
        privateKey = personalKey;
      }

      // Re-encrypt for transport to enclave
      const encryptedPayload = reEncryptMemoryForTransport(
        privateKey,
        encryption.state.enclavePublicKey!,
        memory.encryptedPayload
      );

      return {
        text: memory.text, // Keep plaintext for logging/debugging (not sent to server)
        sector: memory.primary_sector,
        encryptedPayload,
      };
    });

    return transportMemories;
  }, [encryption, isOrgContext, searchMemories]);

  /**
   * List all memories for the current context (settings UI).
   */
  const listMemories = useCallback(async (
    limit: number = 50,
    offset: number = 0
  ): Promise<DecryptedMemory[]> => {
    // Ensure we have the right keys unlocked
    if (isOrgContext && !encryption.isOrgUnlocked) {
      throw new Error('Organization encryption keys not unlocked');
    }
    if (!encryption.state.isUnlocked) {
      throw new Error('Personal encryption keys not unlocked');
    }

    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      // Build query params
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
      });
      if (orgId) {
        params.set('org_id', orgId);
        params.set('include_personal', 'false'); // Never cross personal/org memory boundaries
      }

      const res = await fetch(`${BACKEND_URL}/memories?${params}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to list memories');
      }

      const data = await res.json();
      const encryptedMemories: EncryptedMemory[] = data.memories || [];

      // Decrypt each memory
      const decryptedMemories: DecryptedMemory[] = [];
      for (const encrypted of encryptedMemories) {
        try {
          const decrypted = decryptMemory(encrypted);
          decryptedMemories.push(decrypted);
        } catch (decryptError) {
          console.warn(`Failed to decrypt memory ${encrypted.id}:`, decryptError);
        }
      }

      return decryptedMemories;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list memories';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [encryption, isOrgContext, orgId, getToken, decryptMemory]);

  /**
   * Delete a specific memory.
   */
  const deleteMemory = useCallback(async (memoryId: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const params = new URLSearchParams();
      if (orgId) {
        params.set('org_id', orgId);
      }

      const url = `${BACKEND_URL}/memories/${memoryId}${params.toString() ? `?${params}` : ''}`;
      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok && res.status !== 204) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to delete memory');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete memory';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [getToken, orgId]);

  /**
   * Delete all memories for the current context.
   */
  const deleteAllMemories = useCallback(async (): Promise<number> => {
    setIsLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const res = await fetch(`${BACKEND_URL}/memories`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          context: isOrgContext ? 'org' : 'personal',
          org_id: orgId || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to delete memories');
      }

      const data = await res.json();
      return data.deleted || 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete memories';
      setError(message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [getToken, isOrgContext, orgId]);

  return {
    isReady,
    isLoading,
    error,
    initializeEmbeddings,
    searchMemories,
    searchAndPrepareForTransport,
    listMemories,
    deleteMemory,
    deleteAllMemories,
  };
}
