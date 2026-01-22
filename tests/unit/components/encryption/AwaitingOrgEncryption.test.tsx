import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AwaitingOrgEncryption } from '@/components/encryption/AwaitingOrgEncryption';

describe('AwaitingOrgEncryption', () => {
  it('renders the awaiting encryption message', () => {
    render(<AwaitingOrgEncryption />);

    expect(screen.getByTestId('awaiting-org-encryption')).toBeInTheDocument();
  });

  it('displays the correct title', () => {
    render(<AwaitingOrgEncryption />);

    expect(screen.getByText('Organization Encryption Not Set Up')).toBeInTheDocument();
  });

  it('explains that admin needs to set up encryption', () => {
    render(<AwaitingOrgEncryption />);

    expect(
      screen.getByText(/Your organization administrator needs to set up encryption/i)
    ).toBeInTheDocument();
  });

  it('tells user to contact admin', () => {
    render(<AwaitingOrgEncryption />);

    expect(
      screen.getByText(/Please contact your organization administrator/i)
    ).toBeInTheDocument();
  });

  it('displays Lock icon', () => {
    const { container } = render(<AwaitingOrgEncryption />);

    // The Lock icon from lucide-react renders as an SVG
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThan(0);
  });
});
