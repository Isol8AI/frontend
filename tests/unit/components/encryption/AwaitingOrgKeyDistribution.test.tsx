import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AwaitingOrgKeyDistribution } from '@/components/encryption/AwaitingOrgKeyDistribution';

describe('AwaitingOrgKeyDistribution', () => {
  it('renders the awaiting key distribution message', () => {
    render(<AwaitingOrgKeyDistribution />);

    expect(screen.getByTestId('awaiting-org-key-distribution')).toBeInTheDocument();
  });

  it('displays the correct title', () => {
    render(<AwaitingOrgKeyDistribution />);

    expect(screen.getByText('Awaiting Access')).toBeInTheDocument();
  });

  it('explains that user has not been granted access yet', () => {
    render(<AwaitingOrgKeyDistribution />);

    expect(
      screen.getByText(/Your organization uses encrypted chat, but you haven't been granted access yet/i)
    ).toBeInTheDocument();
  });

  it('tells user to contact admin for access', () => {
    render(<AwaitingOrgKeyDistribution />);

    expect(
      screen.getByText(/Please contact your organization administrator to receive access/i)
    ).toBeInTheDocument();
  });

  it('displays Clock and KeyRound icons', () => {
    const { container } = render(<AwaitingOrgKeyDistribution />);

    // The icons from lucide-react render as SVGs
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(2);
  });
});
