import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Sidebar } from '@/components/chat/Sidebar';

const mockSessions = [
  { id: 'session-1', name: 'First Conversation' },
  { id: 'session-2', name: 'Second Conversation' },
  { id: 'session-3', name: 'Third Conversation' },
];

describe('Sidebar', () => {
  const mockOnNewChat = vi.fn();
  const mockOnSelectSession = vi.fn();

  beforeEach(() => {
    mockOnNewChat.mockClear();
    mockOnSelectSession.mockClear();
  });

  it('renders New Chat button', () => {
    render(<Sidebar />);

    expect(screen.getByText('New Chat')).toBeInTheDocument();
  });

  it('renders session list', () => {
    render(<Sidebar sessions={mockSessions} />);

    mockSessions.forEach((session) => {
      expect(screen.getByText(session.name)).toBeInTheDocument();
    });
  });

  it('shows "No conversations yet" when empty', () => {
    render(<Sidebar sessions={[]} />);

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });

  it('shows "No conversations yet" when sessions not provided', () => {
    render(<Sidebar />);

    expect(screen.getByText('No conversations yet')).toBeInTheDocument();
  });

  it('calls onNewChat when New Chat button clicked', async () => {
    const user = userEvent.setup();
    render(<Sidebar onNewChat={mockOnNewChat} />);

    await user.click(screen.getByText('New Chat'));

    expect(mockOnNewChat).toHaveBeenCalledTimes(1);
  });

  it('calls onSelectSession with session id when clicked', async () => {
    const user = userEvent.setup();
    render(
      <Sidebar
        sessions={mockSessions}
        onSelectSession={mockOnSelectSession}
      />
    );

    await user.click(screen.getByText('Second Conversation'));

    expect(mockOnSelectSession).toHaveBeenCalledWith('session-2');
  });

  it('highlights current session', () => {
    render(
      <Sidebar
        sessions={mockSessions}
        currentSessionId="session-2"
      />
    );

    // The current session button should have secondary variant
    const currentButton = screen.getByText('Second Conversation').closest('button');
    expect(currentButton).toHaveClass('bg-secondary');
  });

  it('does not highlight non-current sessions', () => {
    render(
      <Sidebar
        sessions={mockSessions}
        currentSessionId="session-2"
      />
    );

    // Other session buttons should have ghost variant (no bg-secondary)
    const otherButton = screen.getByText('First Conversation').closest('button');
    expect(otherButton).not.toHaveClass('bg-secondary');
  });

  it('renders version footer', () => {
    render(<Sidebar />);

    expect(screen.getByText('Freebird v0.1')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(<Sidebar className="custom-class" />);

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('handles session selection when onSelectSession not provided', async () => {
    const user = userEvent.setup();
    render(<Sidebar sessions={mockSessions} />);

    // Should not throw error
    await user.click(screen.getByText('First Conversation'));
  });
});
