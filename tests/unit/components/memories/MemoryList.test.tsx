import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryList } from '@/components/memories/MemoryList';
import { useMemories, type DecryptedMemory } from '@/hooks/useMemories';
import { useOrganization } from '@clerk/nextjs';

// Mock the hooks
vi.mock('@/hooks/useMemories');
vi.mock('@clerk/nextjs', () => ({
  useOrganization: vi.fn(),
}));

const mockMemories: DecryptedMemory[] = [
  {
    id: 'mem-1',
    text: 'User prefers dark mode',
    primary_sector: 'semantic',
    tags: ['preferences'],
    score: 0.9,
    salience: 0.8,
    created_at: '2024-01-15T10:30:00Z',
    is_org_memory: false,
    encryptedPayload: {
      ephemeral_public_key: 'key',
      iv: 'iv',
      ciphertext: 'cipher',
      auth_tag: 'tag',
      hkdf_salt: 'salt',
    },
  },
  {
    id: 'mem-2',
    text: 'Team uses TypeScript',
    primary_sector: 'procedural',
    tags: ['coding', 'team'],
    score: 0.85,
    salience: 0.7,
    created_at: '2024-01-14T09:00:00Z',
    is_org_memory: true,
    encryptedPayload: {
      ephemeral_public_key: 'key2',
      iv: 'iv2',
      ciphertext: 'cipher2',
      auth_tag: 'tag2',
      hkdf_salt: 'salt2',
    },
  },
];

describe('MemoryList', () => {
  const mockListMemories = vi.fn();
  const mockDeleteMemory = vi.fn();
  const mockDeleteAllMemories = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default useMemories mock
    (useMemories as Mock).mockReturnValue({
      isLoading: false,
      error: null,
      listMemories: mockListMemories,
      deleteMemory: mockDeleteMemory,
      deleteAllMemories: mockDeleteAllMemories,
    });

    // Default useOrganization mock (no org)
    (useOrganization as Mock).mockReturnValue({
      organization: null,
    });

    mockListMemories.mockResolvedValue(mockMemories);
    mockDeleteMemory.mockResolvedValue(undefined);
    mockDeleteAllMemories.mockResolvedValue(2);
  });

  describe('rendering', () => {
    it('renders memory list', async () => {
      render(<MemoryList />);

      await waitFor(() => {
        expect(screen.getByTestId('memory-list')).toBeInTheDocument();
      });
    });

    it('fetches memories on mount', async () => {
      render(<MemoryList />);

      await waitFor(() => {
        expect(mockListMemories).toHaveBeenCalledWith(100, 0);
      });
    });

    it('renders only personal memory cards when in personal context', async () => {
      render(<MemoryList />);

      await waitFor(() => {
        // In personal context, only personal memories should be shown
        expect(screen.getByText('User prefers dark mode')).toBeInTheDocument();
        // Org memory should not be visible in personal context
        expect(screen.queryByText('Team uses TypeScript')).not.toBeInTheDocument();
      });
    });

    it('shows personal context label when not in org', async () => {
      render(<MemoryList />);

      await waitFor(() => {
        expect(screen.getByText('Personal Memories')).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    it('shows loading spinner when loading', async () => {
      (useMemories as Mock).mockReturnValue({
        isLoading: true,
        error: null,
        listMemories: mockListMemories,
        deleteMemory: mockDeleteMemory,
        deleteAllMemories: mockDeleteAllMemories,
      });

      // Mock listMemories to never resolve for this test
      mockListMemories.mockImplementation(() => new Promise(() => {}));

      render(<MemoryList />);

      expect(screen.getByTestId('memory-loading')).toBeInTheDocument();
      expect(screen.getByText('Loading memories...')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no memories', async () => {
      mockListMemories.mockResolvedValue([]);

      render(<MemoryList />);

      await waitFor(() => {
        expect(screen.getByTestId('memory-empty')).toBeInTheDocument();
        expect(screen.getByText('No memories yet')).toBeInTheDocument();
      });
    });
  });

  describe('error state', () => {
    it('shows error message when fetch fails', async () => {
      mockListMemories.mockRejectedValue(new Error('Failed to fetch'));

      render(<MemoryList />);

      await waitFor(() => {
        expect(screen.getByTestId('memory-error')).toBeInTheDocument();
        expect(screen.getByText('Failed to fetch')).toBeInTheDocument();
      });
    });

    it('shows retry button on error', async () => {
      mockListMemories.mockRejectedValue(new Error('Failed'));

      render(<MemoryList />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      });
    });
  });

  describe('refresh', () => {
    it('refetches memories on refresh button click', async () => {
      render(<MemoryList />);

      await waitFor(() => {
        expect(mockListMemories).toHaveBeenCalledTimes(1);
      });

      fireEvent.click(screen.getByTestId('memory-refresh-button'));

      await waitFor(() => {
        expect(mockListMemories).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('delete single memory', () => {
    it('removes memory from list after delete', async () => {
      render(<MemoryList />);

      await waitFor(() => {
        expect(screen.getByText('User prefers dark mode')).toBeInTheDocument();
      });

      // Find and click the delete button for first memory
      const deleteButtons = screen.getAllByTestId('memory-delete-button');
      fireEvent.click(deleteButtons[0]);

      // Confirm deletion
      await waitFor(() => {
        fireEvent.click(screen.getByTestId('memory-confirm-delete'));
      });

      await waitFor(() => {
        expect(mockDeleteMemory).toHaveBeenCalledWith('mem-1');
      });
    });
  });

  describe('delete all memories', () => {
    it('shows delete all button when memories exist', async () => {
      render(<MemoryList />);

      await waitFor(() => {
        expect(screen.getByTestId('memory-delete-all-button')).toBeInTheDocument();
      });
    });

    it('shows confirmation when delete all clicked', async () => {
      render(<MemoryList />);

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('memory-delete-all-button'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('memory-confirm-delete-all')).toBeInTheDocument();
        expect(screen.getByTestId('memory-cancel-delete-all')).toBeInTheDocument();
      });
    });

    it('deletes all memories when confirmed', async () => {
      render(<MemoryList />);

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('memory-delete-all-button'));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('memory-confirm-delete-all'));
      });

      await waitFor(() => {
        expect(mockDeleteAllMemories).toHaveBeenCalled();
      });
    });

    it('cancels delete all when cancel clicked', async () => {
      render(<MemoryList />);

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('memory-delete-all-button'));
      });

      await waitFor(() => {
        fireEvent.click(screen.getByTestId('memory-cancel-delete-all'));
      });

      await waitFor(() => {
        expect(screen.getByTestId('memory-delete-all-button')).toBeInTheDocument();
      });

      expect(mockDeleteAllMemories).not.toHaveBeenCalled();
    });
  });

  describe('organization context', () => {
    beforeEach(() => {
      (useOrganization as Mock).mockReturnValue({
        organization: { id: 'org-123', name: 'Test Org' },
      });
    });

    it('shows filter tabs in org context', async () => {
      render(<MemoryList />);

      await waitFor(() => {
        expect(screen.getByTestId('memory-filter-all')).toBeInTheDocument();
        expect(screen.getByTestId('memory-filter-personal')).toBeInTheDocument();
        expect(screen.getByTestId('memory-filter-organization')).toBeInTheDocument();
      });
    });

    it('filters by personal memories', async () => {
      render(<MemoryList />);

      await waitFor(() => {
        expect(screen.getByText('User prefers dark mode')).toBeInTheDocument();
        expect(screen.getByText('Team uses TypeScript')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('memory-filter-personal'));

      await waitFor(() => {
        expect(screen.getByText('User prefers dark mode')).toBeInTheDocument();
        expect(screen.queryByText('Team uses TypeScript')).not.toBeInTheDocument();
      });
    });

    it('filters by org memories', async () => {
      render(<MemoryList />);

      await waitFor(() => {
        expect(screen.getByText('User prefers dark mode')).toBeInTheDocument();
        expect(screen.getByText('Team uses TypeScript')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('memory-filter-organization'));

      await waitFor(() => {
        expect(screen.queryByText('User prefers dark mode')).not.toBeInTheDocument();
        expect(screen.getByText('Team uses TypeScript')).toBeInTheDocument();
      });
    });

    it('shows all memories by default in org context', async () => {
      render(<MemoryList />);

      await waitFor(() => {
        expect(screen.getByText('User prefers dark mode')).toBeInTheDocument();
        expect(screen.getByText('Team uses TypeScript')).toBeInTheDocument();
      });
    });
  });

  describe('with orgId prop', () => {
    it('uses orgId prop over organization context', async () => {
      (useOrganization as Mock).mockReturnValue({
        organization: { id: 'org-from-context', name: 'Context Org' },
      });

      render(<MemoryList orgId="org-from-prop" />);

      await waitFor(() => {
        expect(useMemories).toHaveBeenCalledWith({ orgId: 'org-from-prop' });
      });
    });
  });
});
