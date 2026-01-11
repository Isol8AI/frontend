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
    mockOnModelChange.mockClear();
  });

  it('renders selected model name', () => {
    render(
      <ModelSelector
        models={mockModels}
        selectedModel="model-1"
        onModelChange={mockOnModelChange}
      />
    );

    expect(screen.getByText('Test Model 1')).toBeInTheDocument();
  });

  it('shows "Select Model" when no match found', () => {
    render(
      <ModelSelector
        models={mockModels}
        selectedModel="nonexistent"
        onModelChange={mockOnModelChange}
      />
    );

    expect(screen.getByText('Select Model')).toBeInTheDocument();
  });

  it('opens dropdown on click', async () => {
    const user = userEvent.setup();
    render(
      <ModelSelector
        models={mockModels}
        selectedModel="model-1"
        onModelChange={mockOnModelChange}
      />
    );

    await user.click(screen.getByRole('button'));

    // All model names should be visible in dropdown
    expect(screen.getByText('Test Model 2')).toBeInTheDocument();
    expect(screen.getByText('Test Model 3')).toBeInTheDocument();
  });

  it('calls onModelChange when item selected', async () => {
    const user = userEvent.setup();
    render(
      <ModelSelector
        models={mockModels}
        selectedModel="model-1"
        onModelChange={mockOnModelChange}
      />
    );

    await user.click(screen.getByRole('button'));
    await user.click(screen.getByText('Test Model 2'));

    expect(mockOnModelChange).toHaveBeenCalledWith('model-2');
  });

  it('renders with disabled state', () => {
    render(
      <ModelSelector
        models={mockModels}
        selectedModel="model-1"
        onModelChange={mockOnModelChange}
        disabled
      />
    );

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('renders all models in dropdown', async () => {
    const user = userEvent.setup();
    render(
      <ModelSelector
        models={mockModels}
        selectedModel="model-1"
        onModelChange={mockOnModelChange}
      />
    );

    await user.click(screen.getByRole('button'));

    // Use getAllByRole to find menu items specifically (avoids matching the trigger button)
    const menuItems = screen.getAllByRole('menuitem');
    expect(menuItems).toHaveLength(mockModels.length);

    // Verify each model name appears in the menu items
    mockModels.forEach((model) => {
      expect(menuItems.find(item => item.textContent === model.name)).toBeTruthy();
    });
  });

  it('handles empty models array', () => {
    render(
      <ModelSelector
        models={[]}
        selectedModel=""
        onModelChange={mockOnModelChange}
      />
    );

    expect(screen.getByText('Select Model')).toBeInTheDocument();
  });
});
