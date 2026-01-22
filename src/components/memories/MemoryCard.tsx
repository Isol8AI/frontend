/**
 * Card component for displaying a single memory.
 *
 * Shows:
 * - Decrypted memory text
 * - Sector badge (semantic, episodic, etc.)
 * - Tags
 * - Creation date
 * - Delete button
 */

'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Trash2, Brain, Calendar, Tag, Building2, User } from 'lucide-react';
import type { DecryptedMemory } from '@/hooks/useMemories';

interface MemoryCardProps {
  memory: DecryptedMemory;
  onDelete: (memoryId: string) => Promise<void>;
}

const SECTOR_COLORS: Record<string, string> = {
  semantic: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  episodic: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  procedural: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  emotional: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300',
  reflective: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
};

const SECTOR_LABELS: Record<string, string> = {
  semantic: 'Fact',
  episodic: 'Event',
  procedural: 'How-to',
  emotional: 'Feeling',
  reflective: 'Insight',
};

export function MemoryCard({ memory, onDelete }: MemoryCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = async () => {
    if (!showConfirm) {
      setShowConfirm(true);
      return;
    }

    setIsDeleting(true);
    try {
      await onDelete(memory.id);
    } catch (error) {
      console.error('Failed to delete memory:', error);
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  const handleCancelDelete = () => {
    setShowConfirm(false);
  };

  const sectorColor = SECTOR_COLORS[memory.primary_sector] || SECTOR_COLORS.semantic;
  const sectorLabel = SECTOR_LABELS[memory.primary_sector] || memory.primary_sector;

  const formattedDate = memory.created_at
    ? new Date(memory.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null;

  return (
    <div
      className="p-4 bg-card border rounded-lg hover:shadow-sm transition-shadow"
      data-testid="memory-card"
    >
      {/* Header: Sector badge and context indicator */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${sectorColor}`}
            data-testid="memory-sector-badge"
          >
            {sectorLabel}
          </span>
          {memory.is_org_memory ? (
            <span
              className="flex items-center gap-1 text-xs text-muted-foreground"
              data-testid="memory-org-indicator"
            >
              <Building2 className="h-3 w-3" />
              Org
            </span>
          ) : (
            <span
              className="flex items-center gap-1 text-xs text-muted-foreground"
              data-testid="memory-personal-indicator"
            >
              <User className="h-3 w-3" />
              Personal
            </span>
          )}
        </div>

        {formattedDate && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            {formattedDate}
          </span>
        )}
      </div>

      {/* Memory content */}
      <div className="flex items-start gap-3 mb-3">
        <Brain className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
        <p
          className="text-sm text-foreground leading-relaxed"
          data-testid="memory-content"
        >
          {memory.text}
        </p>
      </div>

      {/* Tags */}
      {memory.tags && memory.tags.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <Tag className="h-3 w-3 text-muted-foreground" />
          {memory.tags.map((tag, index) => (
            <span
              key={index}
              className="px-2 py-0.5 bg-muted text-muted-foreground text-xs rounded"
              data-testid="memory-tag"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Delete action */}
      <div className="flex justify-end">
        {showConfirm ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Delete this memory?</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCancelDelete}
              disabled={isDeleting}
              data-testid="memory-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
              data-testid="memory-confirm-delete"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            className="text-muted-foreground hover:text-destructive"
            data-testid="memory-delete-button"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
