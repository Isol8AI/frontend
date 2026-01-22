import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FactCard } from '@/components/memories/FactCard';
import type { TemporalFact } from '@/lib/temporal-facts';

const mockActiveFact: TemporalFact = {
  id: 'fact-123',
  subject: 'user',
  predicate: 'prefers',
  object: 'TypeScript',
  validFrom: new Date('2024-01-15T10:30:00Z').getTime(),
  validTo: null,
  lastConfirmedAt: new Date('2024-01-15T10:30:00Z').getTime(),
  lastUpdated: new Date('2024-01-15T10:30:00Z').getTime(),
  type: 'preference',
  confidence: 0.85,
  source: 'user',
  scope: 'account',
  ttlSeconds: null,
  decayHalfLife: 2592000,
  entities: ['typescript'],
  retrievalCount: 0,
  lastRetrievedAt: null,
  sourceId: 'conversation-456',
};

const mockInvalidatedFact: TemporalFact = {
  id: 'fact-456',
  subject: 'user',
  predicate: 'works_at',
  object: 'Acme Corp',
  validFrom: new Date('2024-01-10T09:00:00Z').getTime(),
  validTo: new Date('2024-01-15T10:30:00Z').getTime(),
  lastConfirmedAt: new Date('2024-01-10T09:00:00Z').getTime(),
  lastUpdated: new Date('2024-01-15T10:30:00Z').getTime(),
  type: 'identity',
  confidence: 0.7,
  source: 'user',
  scope: 'account',
  ttlSeconds: null,
  decayHalfLife: 7776000,
  entities: ['acme', 'corp'],
  retrievalCount: 0,
  lastRetrievedAt: null,
};

describe('FactCard', () => {
  const mockOnInvalidate = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders fact subject', () => {
      render(
        <FactCard
          fact={mockActiveFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('user')).toBeInTheDocument();
    });

    it('renders formatted predicate', () => {
      render(
        <FactCard
          fact={mockActiveFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      // "prefers" should be formatted to "Prefers"
      expect(screen.getByText('Prefers')).toBeInTheDocument();
    });

    it('renders fact object', () => {
      render(
        <FactCard
          fact={mockActiveFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('TypeScript')).toBeInTheDocument();
    });

    it('renders confidence percentage', () => {
      render(
        <FactCard
          fact={mockActiveFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('85% confidence')).toBeInTheDocument();
    });

    it('shows Active status for active facts', () => {
      render(
        <FactCard
          fact={mockActiveFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('Active')).toBeInTheDocument();
    });

    it('shows Invalidated status for invalidated facts', () => {
      render(
        <FactCard
          fact={mockInvalidatedFact}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('Invalidated')).toBeInTheDocument();
    });

    it('renders valid from date', () => {
      render(
        <FactCard
          fact={mockActiveFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument();
    });

    it('renders date range for invalidated facts', () => {
      render(
        <FactCard
          fact={mockInvalidatedFact}
          onDelete={mockOnDelete}
        />
      );

      // Should show the validFrom date (check for a date from Jan 2024)
      // Using regex to handle timezone differences
      expect(screen.getByText(/Jan \d+, 2024/)).toBeInTheDocument();
    });

    it('renders source ID when present', () => {
      render(
        <FactCard
          fact={mockActiveFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText(/Source:/)).toBeInTheDocument();
      expect(screen.getByText(/conversation-456/)).toBeInTheDocument();
    });

    it('does not render source section when no sourceId', () => {
      const factWithoutSource = { ...mockActiveFact, sourceId: undefined };
      render(
        <FactCard
          fact={factWithoutSource}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.queryByText(/Source:/)).not.toBeInTheDocument();
    });

    it('renders with test id containing fact id', () => {
      render(
        <FactCard
          fact={mockActiveFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByTestId('fact-card-fact-123')).toBeInTheDocument();
    });
  });

  describe('confidence colors', () => {
    it('shows green for high confidence (>= 0.8)', () => {
      const highConfidenceFact = { ...mockActiveFact, confidence: 0.9 };
      render(
        <FactCard
          fact={highConfidenceFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      const confidenceBadge = screen.getByText('90% confidence');
      expect(confidenceBadge).toHaveClass('text-green-600');
    });

    it('shows yellow for medium confidence (>= 0.6)', () => {
      const mediumConfidenceFact = { ...mockActiveFact, confidence: 0.7 };
      render(
        <FactCard
          fact={mediumConfidenceFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      const confidenceBadge = screen.getByText('70% confidence');
      expect(confidenceBadge).toHaveClass('text-yellow-600');
    });

    it('shows orange for low confidence (< 0.6)', () => {
      const lowConfidenceFact = { ...mockActiveFact, confidence: 0.5 };
      render(
        <FactCard
          fact={lowConfidenceFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      const confidenceBadge = screen.getByText('50% confidence');
      expect(confidenceBadge).toHaveClass('text-orange-600');
    });
  });

  describe('predicate formatting', () => {
    it.each([
      ['prefers', 'Prefers'],
      ['works_at', 'Works At'],
      ['located_in', 'Located In'],
      ['interested_in', 'Interested In'],
      ['has_skill', 'Has Skill'],
    ])('formats predicate "%s" as "%s"', (predicate, expected) => {
      const fact = { ...mockActiveFact, predicate };
      render(
        <FactCard
          fact={fact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByText(expected)).toBeInTheDocument();
    });
  });

  describe('invalidate functionality', () => {
    it('shows invalidate button for active facts', () => {
      render(
        <FactCard
          fact={mockActiveFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      // Find button with title "Mark as no longer valid"
      const invalidateButton = screen.getByTitle('Mark as no longer valid');
      expect(invalidateButton).toBeInTheDocument();
    });

    it('does not show invalidate button for already invalidated facts', () => {
      render(
        <FactCard
          fact={mockInvalidatedFact}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.queryByTitle('Mark as no longer valid')).not.toBeInTheDocument();
    });

    it('does not show invalidate button when onInvalidate not provided', () => {
      render(
        <FactCard
          fact={mockActiveFact}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.queryByTitle('Mark as no longer valid')).not.toBeInTheDocument();
    });

    it('calls onInvalidate when invalidate button clicked', async () => {
      mockOnInvalidate.mockResolvedValue(undefined);
      render(
        <FactCard
          fact={mockActiveFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      fireEvent.click(screen.getByTitle('Mark as no longer valid'));

      await waitFor(() => {
        expect(mockOnInvalidate).toHaveBeenCalledWith('fact-123');
      });
    });
  });

  describe('delete functionality', () => {
    it('shows delete button', () => {
      render(
        <FactCard
          fact={mockActiveFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      expect(screen.getByTitle('Delete this fact')).toBeInTheDocument();
    });

    it('shows confirmation on first delete click', async () => {
      render(
        <FactCard
          fact={mockActiveFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      fireEvent.click(screen.getByTitle('Delete this fact'));

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
        expect(screen.getByText('Delete')).toBeInTheDocument();
      });
    });

    it('calls onDelete when confirmed', async () => {
      mockOnDelete.mockResolvedValue(undefined);
      render(
        <FactCard
          fact={mockActiveFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      fireEvent.click(screen.getByTitle('Delete this fact'));

      await waitFor(() => {
        expect(screen.getByText('Delete')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Delete'));

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledWith('fact-123');
      });
    });

    it('cancels delete when cancel is clicked', async () => {
      render(
        <FactCard
          fact={mockActiveFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      fireEvent.click(screen.getByTitle('Delete this fact'));

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Cancel'));

      await waitFor(() => {
        expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
        expect(screen.getByTitle('Delete this fact')).toBeInTheDocument();
      });

      expect(mockOnDelete).not.toHaveBeenCalled();
    });

    it('shows loading state during deletion', async () => {
      mockOnDelete.mockImplementation(() => new Promise(() => {})); // Never resolves
      render(
        <FactCard
          fact={mockActiveFact}
          onInvalidate={mockOnInvalidate}
          onDelete={mockOnDelete}
        />
      );

      fireEvent.click(screen.getByTitle('Delete this fact'));

      await waitFor(() => {
        fireEvent.click(screen.getByText('Delete'));
      });

      await waitFor(() => {
        expect(screen.getByText('Deleting...')).toBeInTheDocument();
      });
    });
  });
});
