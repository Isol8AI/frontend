import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryCard } from '@/components/memories/MemoryCard';
import type { DecryptedMemory } from '@/hooks/useMemories';

const mockMemory: DecryptedMemory = {
  id: 'mem-123',
  text: 'User prefers TypeScript over JavaScript',
  primary_sector: 'semantic',
  tags: ['programming', 'preferences'],
  score: 0.95,
  salience: 0.8,
  created_at: '2024-01-15T10:30:00Z',
  is_org_memory: false,
  encryptedPayload: {
    ephemeral_public_key: 'test-key',
    iv: 'test-iv',
    ciphertext: 'test-ciphertext',
    auth_tag: 'test-tag',
    hkdf_salt: 'test-salt',
  },
};

describe('MemoryCard', () => {
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders memory content', () => {
      render(<MemoryCard memory={mockMemory} onDelete={mockOnDelete} />);

      expect(screen.getByTestId('memory-content')).toHaveTextContent(
        'User prefers TypeScript over JavaScript'
      );
    });

    it('renders sector badge with correct label', () => {
      render(<MemoryCard memory={mockMemory} onDelete={mockOnDelete} />);

      const badge = screen.getByTestId('memory-sector-badge');
      expect(badge).toHaveTextContent('Fact'); // semantic → Fact
    });

    it('renders tags when present', () => {
      render(<MemoryCard memory={mockMemory} onDelete={mockOnDelete} />);

      const tags = screen.getAllByTestId('memory-tag');
      expect(tags).toHaveLength(2);
      expect(tags[0]).toHaveTextContent('programming');
      expect(tags[1]).toHaveTextContent('preferences');
    });

    it('renders creation date when present', () => {
      render(<MemoryCard memory={mockMemory} onDelete={mockOnDelete} />);

      expect(screen.getByText('Jan 15, 2024')).toBeInTheDocument();
    });

    it('shows personal indicator for personal memories', () => {
      render(<MemoryCard memory={mockMemory} onDelete={mockOnDelete} />);

      expect(screen.getByTestId('memory-personal-indicator')).toBeInTheDocument();
      expect(screen.getByText('Personal')).toBeInTheDocument();
    });

    it('shows org indicator for org memories', () => {
      const orgMemory = { ...mockMemory, is_org_memory: true };
      render(<MemoryCard memory={orgMemory} onDelete={mockOnDelete} />);

      expect(screen.getByTestId('memory-org-indicator')).toBeInTheDocument();
      expect(screen.getByText('Org')).toBeInTheDocument();
    });

    it('does not render tags section when no tags', () => {
      const memoryWithoutTags = { ...mockMemory, tags: [] };
      render(<MemoryCard memory={memoryWithoutTags} onDelete={mockOnDelete} />);

      expect(screen.queryByTestId('memory-tag')).not.toBeInTheDocument();
    });
  });

  describe('sector colors', () => {
    it.each([
      ['semantic', 'Fact'],
      ['episodic', 'Event'],
      ['procedural', 'How-to'],
      ['emotional', 'Feeling'],
      ['reflective', 'Insight'],
    ])('renders %s sector as "%s"', (sector, label) => {
      const memory = { ...mockMemory, primary_sector: sector };
      render(<MemoryCard memory={memory} onDelete={mockOnDelete} />);

      const badge = screen.getByTestId('memory-sector-badge');
      expect(badge).toHaveTextContent(label);
    });

    it('uses sector name for unknown sectors', () => {
      const memory = { ...mockMemory, primary_sector: 'unknown' };
      render(<MemoryCard memory={memory} onDelete={mockOnDelete} />);

      const badge = screen.getByTestId('memory-sector-badge');
      expect(badge).toHaveTextContent('unknown');
    });
  });

  describe('delete functionality', () => {
    it('shows delete button initially', () => {
      render(<MemoryCard memory={mockMemory} onDelete={mockOnDelete} />);

      expect(screen.getByTestId('memory-delete-button')).toBeInTheDocument();
    });

    it('shows confirmation on first delete click', async () => {
      render(<MemoryCard memory={mockMemory} onDelete={mockOnDelete} />);

      fireEvent.click(screen.getByTestId('memory-delete-button'));

      await waitFor(() => {
        expect(screen.getByText('Delete this memory?')).toBeInTheDocument();
        expect(screen.getByTestId('memory-confirm-delete')).toBeInTheDocument();
        expect(screen.getByTestId('memory-cancel-delete')).toBeInTheDocument();
      });
    });

    it('calls onDelete when confirmed', async () => {
      mockOnDelete.mockResolvedValue(undefined);
      render(<MemoryCard memory={mockMemory} onDelete={mockOnDelete} />);

      fireEvent.click(screen.getByTestId('memory-delete-button'));
      await waitFor(() => {
        expect(screen.getByTestId('memory-confirm-delete')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('memory-confirm-delete'));

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalledWith('mem-123');
      });
    });

    it('cancels delete when cancel is clicked', async () => {
      render(<MemoryCard memory={mockMemory} onDelete={mockOnDelete} />);

      fireEvent.click(screen.getByTestId('memory-delete-button'));
      await waitFor(() => {
        expect(screen.getByTestId('memory-cancel-delete')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('memory-cancel-delete'));

      await waitFor(() => {
        expect(screen.queryByText('Delete this memory?')).not.toBeInTheDocument();
        expect(screen.getByTestId('memory-delete-button')).toBeInTheDocument();
      });

      expect(mockOnDelete).not.toHaveBeenCalled();
    });

    it('shows loading state during deletion', async () => {
      mockOnDelete.mockImplementation(() => new Promise(() => {})); // Never resolves
      render(<MemoryCard memory={mockMemory} onDelete={mockOnDelete} />);

      fireEvent.click(screen.getByTestId('memory-delete-button'));
      await waitFor(() => {
        fireEvent.click(screen.getByTestId('memory-confirm-delete'));
      });

      await waitFor(() => {
        expect(screen.getByText('Deleting...')).toBeInTheDocument();
      });
    });
  });
});
