import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FactList } from '@/components/memories/FactList';
import { useTemporalFacts } from '@/hooks/useTemporalFacts';
import type { TemporalFact } from '@/lib/temporal-facts';

// Mock the hook
vi.mock('@/hooks/useTemporalFacts');

const mockActiveFact: TemporalFact = {
  id: 'fact-1',
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
};

const mockInvalidatedFact: TemporalFact = {
  id: 'fact-2',
  subject: 'user',
  predicate: 'works_at',
  object: 'Old Company',
  validFrom: new Date('2024-01-10T09:00:00Z').getTime(),
  validTo: new Date('2024-01-14T10:00:00Z').getTime(),
  lastConfirmedAt: new Date('2024-01-10T09:00:00Z').getTime(),
  lastUpdated: new Date('2024-01-14T10:00:00Z').getTime(),
  type: 'identity',
  confidence: 0.7,
  source: 'user',
  scope: 'account',
  ttlSeconds: null,
  decayHalfLife: 7776000,
  entities: ['old', 'company'],
  retrievalCount: 0,
  lastRetrievedAt: null,
};

const mockFacts: TemporalFact[] = [mockActiveFact, mockInvalidatedFact];

describe('FactList', () => {
  const mockGetAllFacts = vi.fn();
  const mockInvalidateFactById = vi.fn();
  const mockDeleteFactById = vi.fn();
  const mockClearAll = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default useTemporalFacts mock
    (useTemporalFacts as Mock).mockReturnValue({
      isLoading: false,
      error: null,
      stats: { totalFacts: 2, activeFacts: 1, averageConfidence: 0.775 },
      getAllFacts: mockGetAllFacts,
      invalidateFactById: mockInvalidateFactById,
      deleteFactById: mockDeleteFactById,
      clearAll: mockClearAll,
    });

    mockGetAllFacts.mockResolvedValue(mockFacts);
    mockInvalidateFactById.mockResolvedValue(undefined);
    mockDeleteFactById.mockResolvedValue(undefined);
    mockClearAll.mockResolvedValue(2);
  });

  describe('rendering', () => {
    it('renders fact list container', async () => {
      render(<FactList />);

      await waitFor(() => {
        expect(screen.getByTestId('fact-list')).toBeInTheDocument();
      });
    });

    it('fetches facts on mount', async () => {
      render(<FactList />);

      await waitFor(() => {
        expect(mockGetAllFacts).toHaveBeenCalledWith(false); // Not including historical by default
      });
    });

    it('renders active fact cards by default', async () => {
      render(<FactList />);

      await waitFor(() => {
        expect(screen.getByText('TypeScript')).toBeInTheDocument();
      });
    });

    it('hides invalidated facts by default', async () => {
      render(<FactList />);

      await waitFor(() => {
        // Active fact should be visible
        expect(screen.getByText('TypeScript')).toBeInTheDocument();
        // Invalidated fact should NOT be visible (since showHistorical is false by default)
        expect(screen.queryByText('Old Company')).not.toBeInTheDocument();
      });
    });

    it('shows fact count statistics', async () => {
      render(<FactList />);

      await waitFor(() => {
        expect(screen.getByText(/1 active/)).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    it('shows loading spinner when loading', async () => {
      (useTemporalFacts as Mock).mockReturnValue({
        isLoading: true,
        error: null,
        stats: null,
        getAllFacts: mockGetAllFacts,
        invalidateFactById: mockInvalidateFactById,
        deleteFactById: mockDeleteFactById,
        clearAll: mockClearAll,
      });

      // Mock getAllFacts to never resolve for this test
      mockGetAllFacts.mockImplementation(() => new Promise(() => {}));

      render(<FactList />);

      expect(screen.getByTestId('fact-loading')).toBeInTheDocument();
      expect(screen.getByText('Loading facts...')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no facts', async () => {
      mockGetAllFacts.mockResolvedValue([]);

      render(<FactList />);

      await waitFor(() => {
        expect(screen.getByTestId('fact-empty')).toBeInTheDocument();
        expect(screen.getByText('No facts extracted yet')).toBeInTheDocument();
      });
    });
  });

  describe('error state', () => {
    it('shows error message when fetch fails', async () => {
      mockGetAllFacts.mockRejectedValue(new Error('Failed to load'));

      render(<FactList />);

      await waitFor(() => {
        expect(screen.getByTestId('fact-error')).toBeInTheDocument();
        expect(screen.getByText('Failed to load')).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      mockGetAllFacts.mockRejectedValue(new Error('Failed'));

      render(<FactList />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      });
    });

    it('shows hook error if present', async () => {
      (useTemporalFacts as Mock).mockReturnValue({
        isLoading: false,
        error: 'Encryption keys not unlocked',
        stats: null,
        getAllFacts: mockGetAllFacts,
        invalidateFactById: mockInvalidateFactById,
        deleteFactById: mockDeleteFactById,
        clearAll: mockClearAll,
      });

      mockGetAllFacts.mockResolvedValue([]);

      render(<FactList />);

      await waitFor(() => {
        expect(screen.getByText('Encryption keys not unlocked')).toBeInTheDocument();
      });
    });
  });

  describe('historical toggle', () => {
    it('shows history toggle button', async () => {
      render(<FactList />);

      await waitFor(() => {
        expect(screen.getByTestId('fact-history-toggle')).toBeInTheDocument();
        expect(screen.getByText('Show History')).toBeInTheDocument();
      });
    });

    it('fetches with historical flag when toggled', async () => {
      render(<FactList />);

      await waitFor(() => {
        expect(mockGetAllFacts).toHaveBeenCalledWith(false);
      });

      fireEvent.click(screen.getByTestId('fact-history-toggle'));

      await waitFor(() => {
        expect(mockGetAllFacts).toHaveBeenCalledWith(true);
      });
    });

    it('changes button text when showing history', async () => {
      render(<FactList />);

      await waitFor(() => {
        expect(screen.getByText('Show History')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('fact-history-toggle'));

      await waitFor(() => {
        expect(screen.getByText('Showing All')).toBeInTheDocument();
      });
    });
  });

  describe('refresh', () => {
    it('refetches facts on refresh button click', async () => {
      render(<FactList />);

      await waitFor(() => {
        expect(mockGetAllFacts).toHaveBeenCalledTimes(1);
      });

      fireEvent.click(screen.getByTestId('fact-refresh-button'));

      await waitFor(() => {
        expect(mockGetAllFacts).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('invalidate fact', () => {
    it('calls invalidateFactById and refreshes list', async () => {
      render(<FactList />);

      await waitFor(() => {
        expect(screen.getByText('TypeScript')).toBeInTheDocument();
      });

      // Find and click the invalidate button
      const invalidateButton = screen.getByTitle('Mark as no longer valid');
      fireEvent.click(invalidateButton);

      await waitFor(() => {
        expect(mockInvalidateFactById).toHaveBeenCalledWith('fact-1');
      });

      // Should refresh the list after invalidation
      await waitFor(() => {
        expect(mockGetAllFacts).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('delete single fact', () => {
    it('removes fact from list after delete', async () => {
      render(<FactList />);

      await waitFor(() => {
        expect(screen.getByText('TypeScript')).toBeInTheDocument();
      });

      // Find and click the delete button
      const deleteButton = screen.getByTitle('Delete this fact');
      fireEvent.click(deleteButton);

      // Confirm deletion
      await waitFor(() => {
        const confirmButton = screen.getByRole('button', { name: 'Delete' });
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(mockDeleteFactById).toHaveBeenCalledWith('fact-1');
      });
    });
  });

  describe('delete all facts', () => {
    it('shows clear all button when facts exist', async () => {
      render(<FactList />);

      await waitFor(() => {
        expect(screen.getByTestId('fact-delete-all-button')).toBeInTheDocument();
      });
    });

    it('shows confirmation when clear all clicked', async () => {
      render(<FactList />);

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('fact-delete-all-button'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('fact-confirm-delete-all')).toBeInTheDocument();
        expect(screen.getByTestId('fact-cancel-delete-all')).toBeInTheDocument();
      });
    });

    it('clears all facts when confirmed', async () => {
      render(<FactList />);

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('fact-delete-all-button'));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('fact-confirm-delete-all'));
      });

      await waitFor(() => {
        expect(mockClearAll).toHaveBeenCalled();
      });
    });

    it('cancels clear all when cancel clicked', async () => {
      render(<FactList />);

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('fact-delete-all-button'));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('fact-cancel-delete-all'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('fact-delete-all-button')).toBeInTheDocument();
      });

      expect(mockClearAll).not.toHaveBeenCalled();
    });
  });

  describe('local storage info', () => {
    it('shows info about local storage after loading', async () => {
      render(<FactList />);

      await waitFor(() => {
        expect(
          screen.getByText(/Facts are stored locally in your browser/)
        ).toBeInTheDocument();
      });
    });
  });
});
