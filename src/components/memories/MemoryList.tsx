/**
 * List component for displaying and managing memories.
 *
 * Features:
 * - Lists all memories with pagination
 * - Filter by context (all, personal, org)
 * - Delete individual or all memories
 * - Loading and empty states
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Trash2, RefreshCw, AlertCircle, Brain } from 'lucide-react';
import { MemoryCard } from './MemoryCard';
import { useMemories, type DecryptedMemory } from '@/hooks/useMemories';

type FilterType = 'all' | 'personal' | 'org';

interface MemoryListProps {
  /** Optional organization ID override */
  orgId?: string | null;
}

export function MemoryList({ orgId: propOrgId }: MemoryListProps) {
  const { organization } = useOrganization();
  const orgId = propOrgId ?? organization?.id ?? null;
  const isOrgContext = !!orgId;

  const {
    isLoading,
    error,
    listMemories,
    deleteMemory,
    deleteAllMemories,
  } = useMemories({ orgId });

  const [memories, setMemories] = useState<DecryptedMemory[]>([]);
  const [filter, setFilter] = useState<FilterType>(isOrgContext ? 'all' : 'personal');
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  /**
   * Fetch memories from the API.
   */
  const fetchMemories = useCallback(async () => {
    setFetchError(null);
    try {
      const result = await listMemories(100, 0);
      setMemories(result);
      setInitialLoadDone(true);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load memories');
      setInitialLoadDone(true);
    }
  }, [listMemories]);

  // Fetch memories on mount and when context changes
  useEffect(() => {
    fetchMemories();
  }, [fetchMemories]);

  /**
   * Handle deleting a single memory.
   */
  const handleDelete = async (memoryId: string) => {
    await deleteMemory(memoryId);
    // Remove from local state
    setMemories((prev) => prev.filter((m) => m.id !== memoryId));
  };

  /**
   * Handle deleting all memories.
   */
  const handleDeleteAll = async () => {
    setIsDeletingAll(true);
    try {
      await deleteAllMemories();
      // Clear memories based on filter
      if (filter === 'all') {
        setMemories([]);
      } else if (filter === 'personal') {
        setMemories((prev) => prev.filter((m) => m.is_org_memory));
      } else {
        setMemories((prev) => prev.filter((m) => !m.is_org_memory));
      }
    } finally {
      setIsDeletingAll(false);
      setShowDeleteAllConfirm(false);
    }
  };

  // Filter memories based on current filter
  const filteredMemories = memories.filter((memory) => {
    if (filter === 'all') return true;
    if (filter === 'personal') return !memory.is_org_memory;
    if (filter === 'org') return memory.is_org_memory;
    return true;
  });

  // Error state
  const displayError = error || fetchError;

  return (
    <div className="space-y-4" data-testid="memory-list">
      {/* Header with filters and actions */}
      <div className="flex items-center justify-between">
        {/* Filter tabs - only show if in org context */}
        {isOrgContext ? (
          <div className="flex gap-1 p-1 bg-muted rounded-lg">
            <FilterButton
              active={filter === 'all'}
              onClick={() => setFilter('all')}
            >
              All
            </FilterButton>
            <FilterButton
              active={filter === 'personal'}
              onClick={() => setFilter('personal')}
            >
              Personal
            </FilterButton>
            <FilterButton
              active={filter === 'org'}
              onClick={() => setFilter('org')}
            >
              Organization
            </FilterButton>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">
            Personal Memories
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchMemories}
            disabled={isLoading}
            data-testid="memory-refresh-button"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          {filteredMemories.length > 0 && (
            showDeleteAllConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Delete all {filter === 'all' ? '' : filter} memories?
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteAllConfirm(false)}
                  disabled={isDeletingAll}
                  data-testid="memory-cancel-delete-all"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAll}
                  disabled={isDeletingAll}
                  data-testid="memory-confirm-delete-all"
                >
                  {isDeletingAll ? 'Deleting...' : 'Delete All'}
                </Button>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDeleteAllConfirm(true)}
                className="text-muted-foreground hover:text-destructive"
                data-testid="memory-delete-all-button"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete All
              </Button>
            )
          )}
        </div>
      </div>

      {/* Error state */}
      {displayError && (
        <div
          className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm"
          data-testid="memory-error"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{displayError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchMemories}
            className="ml-auto"
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading state */}
      {isLoading && !initialLoadDone && (
        <div
          className="flex flex-col items-center justify-center py-12 text-muted-foreground"
          data-testid="memory-loading"
        >
          <RefreshCw className="h-8 w-8 animate-spin mb-2" />
          <span>Loading memories...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && initialLoadDone && filteredMemories.length === 0 && !displayError && (
        <div
          className="flex flex-col items-center justify-center py-12 text-muted-foreground"
          data-testid="memory-empty"
        >
          <Brain className="h-12 w-12 mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-1">No memories yet</h3>
          <p className="text-sm text-center max-w-md">
            {filter === 'personal'
              ? "Your personal memories will appear here as you chat. The AI learns from your conversations."
              : filter === 'org'
              ? "Organization memories will appear here. These are shared facts learned from team conversations."
              : "Memories will appear here as you chat. The AI learns facts and preferences from your conversations."}
          </p>
        </div>
      )}

      {/* Memory list */}
      {filteredMemories.length > 0 && (
        <div className="space-y-3" data-testid="memory-cards">
          {filteredMemories.map((memory) => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Load more (future enhancement) */}
      {filteredMemories.length >= 100 && (
        <div className="text-center text-sm text-muted-foreground py-4">
          Showing first 100 memories
        </div>
      )}
    </div>
  );
}

/**
 * Filter button component for the tabs.
 */
function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 text-sm rounded transition-colors ${
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
      data-testid={`memory-filter-${children?.toString().toLowerCase()}`}
    >
      {children}
    </button>
  );
}
