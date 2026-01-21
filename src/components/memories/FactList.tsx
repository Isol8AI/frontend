/**
 * List component for displaying and managing temporal facts.
 *
 * Features:
 * - Lists all client-side temporal facts (stored in IndexedDB)
 * - Toggle to show historical (invalidated) facts
 * - Delete individual facts or clear all
 * - Invalidate active facts
 * - Loading and empty states
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, RefreshCw, AlertCircle, Lightbulb, History } from 'lucide-react';
import { FactCard } from './FactCard';
import { useTemporalFacts } from '@/hooks/useTemporalFacts';
import type { TemporalFact } from '@/lib/temporal-facts';

export function FactList() {
  const {
    isLoading,
    error,
    stats,
    getAllFacts,
    invalidateFactById,
    deleteFactById,
    clearAll,
  } = useTemporalFacts();

  const [facts, setFacts] = useState<TemporalFact[]>([]);
  const [showHistorical, setShowHistorical] = useState(false);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  /**
   * Fetch facts from IndexedDB.
   */
  const fetchFacts = useCallback(async () => {
    setFetchError(null);
    try {
      const result = await getAllFacts(showHistorical);
      setFacts(result);
      setInitialLoadDone(true);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load facts');
      setInitialLoadDone(true);
    }
  }, [getAllFacts, showHistorical]);

  // Fetch facts on mount and when historical toggle changes
  useEffect(() => {
    fetchFacts();
  }, [fetchFacts]);

  /**
   * Handle invalidating a fact.
   */
  const handleInvalidate = async (factId: string) => {
    await invalidateFactById(factId);
    // Refresh to get updated state
    await fetchFacts();
  };

  /**
   * Handle deleting a single fact.
   */
  const handleDelete = async (factId: string) => {
    await deleteFactById(factId);
    // Remove from local state
    setFacts((prev) => prev.filter((f) => f.id !== factId));
  };

  /**
   * Handle deleting all facts.
   */
  const handleDeleteAll = async () => {
    setIsDeletingAll(true);
    try {
      await clearAll();
      setFacts([]);
    } finally {
      setIsDeletingAll(false);
      setShowDeleteAllConfirm(false);
    }
  };

  // Split facts into active and historical
  const activeFacts = facts.filter((f) => f.validTo === null);
  const historicalFacts = facts.filter((f) => f.validTo !== null);
  const displayFacts = showHistorical ? facts : activeFacts;

  // Error state
  const displayError = error || fetchError;

  return (
    <div className="space-y-4" data-testid="fact-list">
      {/* Header with toggle and actions */}
      <div className="flex items-center justify-between">
        {/* Historical toggle */}
        <div className="flex items-center gap-2">
          <Button
            variant={showHistorical ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setShowHistorical(!showHistorical)}
            className="gap-1"
            data-testid="fact-history-toggle"
          >
            <History className="h-4 w-4" />
            {showHistorical ? 'Showing All' : 'Show History'}
          </Button>
          {stats && (
            <span className="text-xs text-muted-foreground">
              {activeFacts.length} active
              {historicalFacts.length > 0 && ` / ${historicalFacts.length} historical`}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchFacts}
            disabled={isLoading}
            data-testid="fact-refresh-button"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>

          {displayFacts.length > 0 && (
            showDeleteAllConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Delete all facts?
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteAllConfirm(false)}
                  disabled={isDeletingAll}
                  data-testid="fact-cancel-delete-all"
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDeleteAll}
                  disabled={isDeletingAll}
                  data-testid="fact-confirm-delete-all"
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
                data-testid="fact-delete-all-button"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Clear All
              </Button>
            )
          )}
        </div>
      </div>

      {/* Error state */}
      {displayError && (
        <div
          className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm"
          data-testid="fact-error"
        >
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{displayError}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchFacts}
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
          data-testid="fact-loading"
        >
          <RefreshCw className="h-8 w-8 animate-spin mb-2" />
          <span>Loading facts...</span>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && initialLoadDone && displayFacts.length === 0 && !displayError && (
        <div
          className="flex flex-col items-center justify-center py-12 text-muted-foreground"
          data-testid="fact-empty"
        >
          <Lightbulb className="h-12 w-12 mb-4 opacity-50" />
          <h3 className="text-lg font-medium mb-1">No facts extracted yet</h3>
          <p className="text-sm text-center max-w-md">
            {showHistorical
              ? "No facts have been extracted from your conversations yet. Facts are extracted automatically as you chat."
              : "No active facts found. Facts are extracted automatically from your conversations and stored locally in your browser."}
          </p>
        </div>
      )}

      {/* Fact list */}
      {displayFacts.length > 0 && (
        <div className="space-y-3" data-testid="fact-cards">
          {displayFacts.map((fact) => (
            <FactCard
              key={fact.id}
              fact={fact}
              onInvalidate={fact.validTo === null ? handleInvalidate : undefined}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Info about local storage */}
      {initialLoadDone && (
        <div className="text-xs text-muted-foreground text-center py-4 border-t">
          Facts are stored locally in your browser and never sent to the server.
        </div>
      )}
    </div>
  );
}
