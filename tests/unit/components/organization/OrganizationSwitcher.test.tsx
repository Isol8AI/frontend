import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrganizationSwitcher } from '@/components/organization/OrganizationSwitcher';

interface MockSwitcherProps {
  afterSelectOrganizationUrl?: string;
  afterSelectPersonalUrl?: string;
}

vi.mock('@clerk/nextjs', async (importOriginal) => {
  const original = await importOriginal<typeof import('@clerk/nextjs')>();
  return {
    ...original,
    OrganizationSwitcher: ({ afterSelectOrganizationUrl, afterSelectPersonalUrl }: MockSwitcherProps) => (
      <div data-testid="clerk-org-switcher">
        <span data-testid="org-url">{afterSelectOrganizationUrl}</span>
        <span data-testid="personal-url">{afterSelectPersonalUrl}</span>
        Mock Organization Switcher
      </div>
    ),
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

    expect(screen.getByTestId('org-url')).toHaveTextContent('/');
    expect(screen.getByTestId('personal-url')).toHaveTextContent('/');
  });
});
