/**
 * Card component for displaying a single temporal fact.
 *
 * Shows:
 * - Subject-predicate-object triple
 * - Confidence score
 * - Valid from/to dates
 * - Actions (invalidate, delete)
 */

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Clock, XCircle, CheckCircle2 } from 'lucide-react';
import type { TemporalFact } from '@/lib/temporal-facts';

interface FactCardProps {
  fact: TemporalFact;
  onInvalidate?: (id: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
}

/**
 * Format a timestamp for display.
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/**
 * Format a predicate for display (replace underscores, capitalize).
 */
function formatPredicate(predicate: string): string {
  return predicate
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Get color classes for confidence level.
 */
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-600 bg-green-50';
  if (confidence >= 0.6) return 'text-yellow-600 bg-yellow-50';
  return 'text-orange-600 bg-orange-50';
}

export function FactCard({ fact, onInvalidate, onDelete }: FactCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isInvalidating, setIsInvalidating] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const isActive = fact.validTo === null;
  const confidencePercent = Math.round(fact.confidence * 100);

  const handleInvalidate = async () => {
    if (!onInvalidate) return;
    setIsInvalidating(true);
    try {
      await onInvalidate(fact.id);
    } finally {
      setIsInvalidating(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setIsDeleting(true);
    try {
      await onDelete(fact.id);
    } finally {
      setIsDeleting(false);
      setShowConfirmDelete(false);
    }
  };

  return (
    <div
      className={`p-4 rounded-lg border transition-all ${
        isActive
          ? 'bg-card border-border'
          : 'bg-muted/30 border-border/50 opacity-75'
      }`}
      data-testid={`fact-card-${fact.id}`}
    >
      {/* Main content */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Fact triple */}
          <div className="flex flex-wrap items-baseline gap-1 mb-2">
            <span className="text-muted-foreground text-sm">
              {fact.subject}
            </span>
            <span className="text-primary font-medium">
              {formatPredicate(fact.predicate)}
            </span>
            <span className="text-foreground font-semibold break-all">
              {fact.object}
            </span>
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {/* Confidence */}
            <span
              className={`px-2 py-0.5 rounded-full ${getConfidenceColor(fact.confidence)}`}
            >
              {confidencePercent}% confidence
            </span>

            {/* Status */}
            <span className="flex items-center gap-1">
              {isActive ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  Active
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 text-muted-foreground" />
                  Invalidated
                </>
              )}
            </span>

            {/* Date range */}
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {formatDate(fact.validFrom)}
              {fact.validTo && (
                <> &rarr; {formatDate(fact.validTo)}</>
              )}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Invalidate button (only for active facts) */}
          {isActive && onInvalidate && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleInvalidate}
              disabled={isInvalidating}
              className="text-muted-foreground hover:text-yellow-600"
              title="Mark as no longer valid"
            >
              <XCircle className={`h-4 w-4 ${isInvalidating ? 'animate-pulse' : ''}`} />
            </Button>
          )}

          {/* Delete button */}
          {showConfirmDelete ? (
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowConfirmDelete(false)}
                disabled={isDeleting}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowConfirmDelete(true)}
              className="text-muted-foreground hover:text-destructive"
              title="Delete this fact"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Source info (if available) */}
      {fact.sourceId && (
        <div className="mt-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
          Source: {fact.sourceId}
        </div>
      )}
    </div>
  );
}
