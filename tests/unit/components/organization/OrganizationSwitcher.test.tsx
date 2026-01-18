import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrganizationSwitcher } from '@/components/organization/OrganizationSwitcher';

interface MockSwitcherProps {
  afterCreateOrganizationUrl?: string;
  afterLeaveOrganizationUrl?: string;
  hidePersonal?: boolean;
}

vi.mock('@clerk/nextjs', async (importOriginal) => {
  const original = await importOriginal<typeof import('@clerk/nextjs')>();
  return {
    ...original,
    OrganizationSwitcher: ({ afterCreateOrganizationUrl, afterLeaveOrganizationUrl }: MockSwitcherProps) => (
      <div data-testid="clerk-org-switcher">
        <span data-testid="create-url">{afterCreateOrganizationUrl}</span>
        <span data-testid="leave-url">{afterLeaveOrganizationUrl}</span>
        Mock Organization Switcher
      </div>
    ),
    useOrganization: () => ({
      organization: null,
      isLoaded: true,
    }),
  };
});

describe('OrganizationSwitcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Clerk OrganizationSwitcher', () => {
    render(<OrganizationSwitcher />);

    expect(screen.getByTestId('clerk-org-switcher')).toBeInTheDocument();
    expect(screen.getByText('Mock Organization Switcher')).toBeInTheDocument();
  });

  it('passes correct redirect URLs', () => {
    render(<OrganizationSwitcher />);

    expect(screen.getByTestId('create-url')).toHaveTextContent('/');
    expect(screen.getByTestId('leave-url')).toHaveTextContent('/');
  });
});
