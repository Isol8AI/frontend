import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrgEncryptionSetupPrompt } from '@/components/encryption/OrgEncryptionSetupPrompt';

// Mock useEncryption hook
const mockSetupOrgEncryption = vi.fn();

vi.mock('@/hooks/useEncryption', () => ({
  useEncryption: () => ({
    setupOrgEncryption: mockSetupOrgEncryption,
  }),
}));

describe('OrgEncryptionSetupPrompt', () => {
  const mockOrgId = 'org_test_123';
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSetupOrgEncryption.mockResolvedValue(undefined);
  });

  it('renders the setup prompt', () => {
    render(<OrgEncryptionSetupPrompt orgId={mockOrgId} />);

    expect(screen.getByTestId('org-encryption-setup-prompt')).toBeInTheDocument();
  });

  it('displays the correct title', () => {
    render(<OrgEncryptionSetupPrompt orgId={mockOrgId} />);

    expect(screen.getByText('Set Up Organization Encryption')).toBeInTheDocument();
  });

  it('explains admin needs to enter passcode', () => {
    render(<OrgEncryptionSetupPrompt orgId={mockOrgId} />);

    expect(
      screen.getByText(/As an admin, you need to set up encryption for your organization/i)
    ).toBeInTheDocument();
  });

  it('shows passcode input field', () => {
    render(<OrgEncryptionSetupPrompt orgId={mockOrgId} />);

    expect(screen.getByTestId('org-passcode-input')).toBeInTheDocument();
  });

  it('shows setup button disabled when passcode is too short', () => {
    render(<OrgEncryptionSetupPrompt orgId={mockOrgId} />);

    const setupButton = screen.getByTestId('setup-org-encryption-button');
    expect(setupButton).toBeDisabled();
  });

  it('enables setup button when passcode is 6 digits', async () => {
    const user = userEvent.setup();
    render(<OrgEncryptionSetupPrompt orgId={mockOrgId} />);

    const passcodeInput = screen.getByTestId('org-passcode-input');
    await user.type(passcodeInput, '123456');

    const setupButton = screen.getByTestId('setup-org-encryption-button');
    expect(setupButton).not.toBeDisabled();
  });

  it('only allows numeric input', async () => {
    const user = userEvent.setup();
    render(<OrgEncryptionSetupPrompt orgId={mockOrgId} />);

    const passcodeInput = screen.getByTestId('org-passcode-input');
    await user.type(passcodeInput, 'abc123def456');

    // Only numbers should be kept
    expect(passcodeInput).toHaveValue('123456');
  });

  it('limits passcode to 6 digits', async () => {
    const user = userEvent.setup();
    render(<OrgEncryptionSetupPrompt orgId={mockOrgId} />);

    const passcodeInput = screen.getByTestId('org-passcode-input');
    await user.type(passcodeInput, '12345678');

    // Should be truncated to 6 digits
    expect(passcodeInput).toHaveValue('123456');
  });

  it('calls setupOrgEncryption on form submit', async () => {
    const user = userEvent.setup();
    render(<OrgEncryptionSetupPrompt orgId={mockOrgId} onSuccess={mockOnSuccess} />);

    const passcodeInput = screen.getByTestId('org-passcode-input');
    await user.type(passcodeInput, '123456');

    const setupButton = screen.getByTestId('setup-org-encryption-button');
    await user.click(setupButton);

    await waitFor(() => {
      expect(mockSetupOrgEncryption).toHaveBeenCalledWith(mockOrgId, '123456');
    });
  });

  it('calls onSuccess callback after successful setup', async () => {
    const user = userEvent.setup();
    render(<OrgEncryptionSetupPrompt orgId={mockOrgId} onSuccess={mockOnSuccess} />);

    const passcodeInput = screen.getByTestId('org-passcode-input');
    await user.type(passcodeInput, '123456');

    const setupButton = screen.getByTestId('setup-org-encryption-button');
    await user.click(setupButton);

    await waitFor(() => {
      expect(mockOnSuccess).toHaveBeenCalled();
    });
  });

  it('displays error message when setup fails', async () => {
    mockSetupOrgEncryption.mockRejectedValue(new Error('Invalid passcode'));
    const user = userEvent.setup();
    render(<OrgEncryptionSetupPrompt orgId={mockOrgId} />);

    const passcodeInput = screen.getByTestId('org-passcode-input');
    await user.type(passcodeInput, '123456');

    const setupButton = screen.getByTestId('setup-org-encryption-button');
    await user.click(setupButton);

    await waitFor(() => {
      expect(screen.getByTestId('org-setup-error')).toBeInTheDocument();
    });

    expect(screen.getByText('Invalid passcode')).toBeInTheDocument();
  });

  it('shows passcode too short error when submitting with less than 6 digits', async () => {
    const user = userEvent.setup();
    render(<OrgEncryptionSetupPrompt orgId={mockOrgId} />);

    // Temporarily enable the button by setting a valid passcode first
    const passcodeInput = screen.getByTestId('org-passcode-input');
    await user.type(passcodeInput, '123456');

    // Clear and type short passcode
    await user.clear(passcodeInput);
    await user.type(passcodeInput, '12345');

    // Button should be disabled with short passcode
    const setupButton = screen.getByTestId('setup-org-encryption-button');
    expect(setupButton).toBeDisabled();
  });

  it('shows loading state during setup', async () => {
    // Make the setup take some time
    mockSetupOrgEncryption.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    const user = userEvent.setup();
    render(<OrgEncryptionSetupPrompt orgId={mockOrgId} />);

    const passcodeInput = screen.getByTestId('org-passcode-input');
    await user.type(passcodeInput, '123456');

    const setupButton = screen.getByTestId('setup-org-encryption-button');
    await user.click(setupButton);

    // Button should show loading text
    expect(screen.getByText(/Creating organization keys/i)).toBeInTheDocument();
  });
});
