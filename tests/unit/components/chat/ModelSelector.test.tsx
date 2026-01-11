import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ModelSelector } from '@/components/chat/ModelSelector';

const mockModels = [
  { id: 'model-1', name: 'Test Model 1' },
  { id: 'model-2', name: 'Test Model 2' },
  { id: 'model-3', name: 'Test Model 3' },
];

describe('ModelSelector', () => {
  const mockOnModelChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function renderSelector(props: Partial<Parameters<typeof ModelSelector>[0]> = {}): void {
    render(
      <ModelSelector
        models={mockModels}
        selectedModel="model-1"
        onModelChange={mockOnModelChange}
        {...props}
      />
    );
  }

  describe('rendering', () => {
    it('renders selected model name', () => {
      renderSelector();
      expect(screen.getByText('Test Model 1')).toBeInTheDocument();
    });

    it('shows placeholder when no match found', () => {
      renderSelector({ selectedModel: 'nonexistent' });
      expect(screen.getByText('Select Model')).toBeInTheDocument();
    });

    it('shows placeholder when models array is empty', () => {
      renderSelector({ models: [], selectedModel: '' });
      expect(screen.getByText('Select Model')).toBeInTheDocument();
    });

    it('disables button when disabled prop is true', () => {
      renderSelector({ disabled: true });
      expect(screen.getByRole('button')).toBeDisabled();
    });
  });

  describe('dropdown behavior', () => {
    it('opens dropdown on click', async () => {
      const user = userEvent.setup();
      renderSelector();

      await user.click(screen.getByRole('button'));

      expect(screen.getByText('Test Model 2')).toBeInTheDocument();
      expect(screen.getByText('Test Model 3')).toBeInTheDocument();
    });

    it('renders all models in dropdown', async () => {
      const user = userEvent.setup();
      renderSelector();

      await user.click(screen.getByRole('button'));

      const menuItems = screen.getAllByRole('menuitem');
      expect(menuItems).toHaveLength(mockModels.length);

      for (const model of mockModels) {
        expect(menuItems.find(item => item.textContent === model.name)).toBeTruthy();
      }
    });

    it('calls onModelChange when item selected', async () => {
      const user = userEvent.setup();
      renderSelector();

      await user.click(screen.getByRole('button'));
      await user.click(screen.getByText('Test Model 2'));

      expect(mockOnModelChange).toHaveBeenCalledWith('model-2');
    });
  });
});
