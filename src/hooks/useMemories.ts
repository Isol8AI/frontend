/**
 * Hook for memory management operations (settings page).
 * Memory features temporarily disabled during migration to mem0.
 *
 * Note: Memory context for chat is now handled automatically by the enclave.
 * This hook is only used for viewing/deleting memories in the settings page.
 */

'use client';

import { useCallback } from 'react';

export interface DecryptedMemory {
  id: string;
  text: string;
  primary_sector: string;
  tags: string[];
  score?: number;
  salience: number;
  created_at?: string;
  is_org_memory: boolean;
}

export interface UseMemoriesOptions {
  orgId?: string | null;
}

export interface UseMemoriesReturn {
  isLoading: boolean;
  error: string | null;
  listMemories: (limit?: number, offset?: number) => Promise<DecryptedMemory[]>;
  deleteMemory: (memoryId: string) => Promise<void>;
  deleteAllMemories: () => Promise<number>;
}

export function useMemories(_options: UseMemoriesOptions = {}): UseMemoriesReturn {
  // Stub implementations - memory features disabled during migration to mem0
  // Plan 2 will implement real backend API calls

  const listMemories = useCallback(async (): Promise<DecryptedMemory[]> => {
    console.log('[useMemories] Memory listing disabled during migration');
    return [];
  }, []);

  const deleteMemory = useCallback(async (_memoryId: string): Promise<void> => {
    console.log('[useMemories] Memory deletion disabled during migration');
  }, []);

  const deleteAllMemories = useCallback(async (): Promise<number> => {
    console.log('[useMemories] Memory deletion disabled during migration');
    return 0;
  }, []);

  return {
    isLoading: false,
    error: null,
    listMemories,
    deleteMemory,
    deleteAllMemories,
  };
}
