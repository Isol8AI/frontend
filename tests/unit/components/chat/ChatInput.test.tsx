import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatInput } from '@/components/chat/ChatInput';

describe('ChatInput', () => {
  const mockOnSend = vi.fn();

  beforeEach(() => {
    mockOnSend.mockClear();
  });

  it('renders textarea and send button', () => {
    render(<ChatInput onSend={mockOnSend} />);

    expect(screen.getByPlaceholderText('Type a message...')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('calls onSend with input value on button click', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, 'Hello world');
    await user.click(screen.getByRole('button'));

    expect(mockOnSend).toHaveBeenCalledWith('Hello world');
  });

  it('clears input after send', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, 'Test message');
    await user.click(screen.getByRole('button'));

    expect(textarea).toHaveValue('');
  });

  it('calls onSend on Enter key (not Shift+Enter)', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, 'Enter test');
    await user.keyboard('{Enter}');

    expect(mockOnSend).toHaveBeenCalledWith('Enter test');
  });

  it('does not call onSend on Shift+Enter', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, 'Shift enter test');
    await user.keyboard('{Shift>}{Enter}{/Shift}');

    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it('does not call onSend when input is empty', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={mockOnSend} />);

    await user.click(screen.getByRole('button'));

    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it('does not call onSend when input is only whitespace', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, '   ');
    await user.click(screen.getByRole('button'));

    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it('disables textarea when disabled prop is true', () => {
    render(<ChatInput onSend={mockOnSend} disabled />);

    expect(screen.getByPlaceholderText('Type a message...')).toBeDisabled();
  });

  it('disables send button when disabled prop is true', () => {
    render(<ChatInput onSend={mockOnSend} disabled />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('disables send button when input is empty', () => {
    render(<ChatInput onSend={mockOnSend} />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('enables send button when input has content', async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={mockOnSend} />);

    const textarea = screen.getByPlaceholderText('Type a message...');
    await user.type(textarea, 'Test');

    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('applies border-t class when not centered', () => {
    const { container } = render(<ChatInput onSend={mockOnSend} />);

    const wrapper = container.firstChild;
    expect(wrapper).toHaveClass('border-t');
  });

  it('does not apply border-t class when centered', () => {
    const { container } = render(<ChatInput onSend={mockOnSend} centered />);

    const wrapper = container.firstChild;
    expect(wrapper).not.toHaveClass('border-t');
  });
});
