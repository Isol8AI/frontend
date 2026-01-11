import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MessageList } from '@/components/chat/MessageList';

const mockMessages = [
  { id: '1', role: 'user' as const, content: 'Hello there!' },
  { id: '2', role: 'assistant' as const, content: 'Hi! How can I help you?' },
  { id: '3', role: 'user' as const, content: 'What is the weather?' },
];

describe('MessageList', () => {
  // Mock scrollIntoView
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders all messages', () => {
    render(<MessageList messages={mockMessages} />);

    expect(screen.getByText('Hello there!')).toBeInTheDocument();
    expect(screen.getByText('Hi! How can I help you?')).toBeInTheDocument();
    expect(screen.getByText('What is the weather?')).toBeInTheDocument();
  });

  it('renders empty when no messages', () => {
    const { container } = render(<MessageList messages={[]} />);

    // Should still render the container
    expect(container.querySelector('.space-y-6')).toBeInTheDocument();
  });

  it('aligns user messages to the right', () => {
    render(<MessageList messages={[{ id: '1', role: 'user', content: 'User message' }]} />);

    const messageWrapper = screen.getByText('User message').closest('.flex');
    expect(messageWrapper).toHaveClass('justify-end');
  });

  it('aligns assistant messages to the left', () => {
    render(<MessageList messages={[{ id: '1', role: 'assistant', content: 'Assistant message' }]} />);

    const messageWrapper = screen.getByText('Assistant message').closest('.flex');
    expect(messageWrapper).toHaveClass('justify-start');
  });

  it('applies primary style to user messages', () => {
    render(<MessageList messages={[{ id: '1', role: 'user', content: 'User message' }]} />);

    const messageBubble = screen.getByText('User message').closest('.rounded-lg');
    expect(messageBubble).toHaveClass('bg-primary');
  });

  it('applies muted style to assistant messages', () => {
    render(<MessageList messages={[{ id: '1', role: 'assistant', content: 'Assistant message' }]} />);

    const messageBubble = screen.getByText('Assistant message').closest('.rounded-lg');
    expect(messageBubble).toHaveClass('bg-muted');
  });

  it('shows typing indicator for empty assistant message when isTyping', () => {
    render(
      <MessageList
        messages={[{ id: '1', role: 'assistant', content: '' }]}
        isTyping={true}
      />
    );

    // Should show animated dots
    const dots = document.querySelectorAll('.animate-pulse');
    expect(dots.length).toBe(3);
  });

  it('does not show typing indicator when not typing', () => {
    render(
      <MessageList
        messages={[{ id: '1', role: 'assistant', content: '' }]}
        isTyping={false}
      />
    );

    const dots = document.querySelectorAll('.animate-pulse');
    expect(dots.length).toBe(0);
  });

  it('does not show typing indicator for user messages', () => {
    render(
      <MessageList
        messages={[{ id: '1', role: 'user', content: '' }]}
        isTyping={true}
      />
    );

    const dots = document.querySelectorAll('.animate-pulse');
    expect(dots.length).toBe(0);
  });

  it('preserves whitespace in messages', () => {
    const multilineContent = 'Line 1\nLine 2\nLine 3';
    const { container } = render(
      <MessageList
        messages={[{ id: '1', role: 'user', content: multilineContent }]}
      />
    );

    // Query by class since getByText normalizes whitespace
    const messageElement = container.querySelector('.whitespace-pre-wrap');
    expect(messageElement).toBeInTheDocument();
    expect(messageElement).toHaveTextContent('Line 1');
    expect(messageElement).toHaveTextContent('Line 2');
    expect(messageElement).toHaveTextContent('Line 3');
  });

  it('calls scrollIntoView when messages change', () => {
    const { rerender } = render(<MessageList messages={[]} />);

    const scrollSpy = vi.spyOn(Element.prototype, 'scrollIntoView');

    rerender(
      <MessageList messages={[{ id: '1', role: 'user', content: 'New message' }]} />
    );

    expect(scrollSpy).toHaveBeenCalled();
  });
});
