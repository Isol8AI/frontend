import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrganizationProvider, useOrgContext } from '@/components/providers/OrganizationProvider';

function TestConsumer(): React.ReactElement {
  const context = useOrgContext();
  return (
    <div>
      <span data-testid="org-id">{context.orgId || 'null'}</span>
      <span data-testid="org-name">{context.orgName || 'null'}</span>
      <span data-testid="is-org-context">{String(context.isOrgContext)}</span>
      <span data-testid="is-personal-context">{String(context.isPersonalContext)}</span>
    </div>
  );
}

describe('OrganizationProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders children', () => {
    render(
      <OrganizationProvider>
        <div>Test Content</div>
      </OrganizationProvider>
    );

    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('provides default context values when no organization (personal context is default)', () => {
    render(
      <OrganizationProvider>
        <TestConsumer />
      </OrganizationProvider>
    );

    expect(screen.getByTestId('org-id')).toHaveTextContent('null');
    expect(screen.getByTestId('org-name')).toHaveTextContent('null');
    expect(screen.getByTestId('is-org-context')).toHaveTextContent('false');
    expect(screen.getByTestId('is-personal-context')).toHaveTextContent('true');
  });
});

describe('useOrgContext', () => {
  it('returns default values outside provider', () => {
    render(<TestConsumer />);

    expect(screen.getByTestId('org-id')).toHaveTextContent('null');
    expect(screen.getByTestId('is-personal-context')).toHaveTextContent('true');
  });

  it('exposes isOrgContext and isPersonalContext as mutually exclusive', () => {
    render(
      <OrganizationProvider>
        <TestConsumer />
      </OrganizationProvider>
    );

    const isOrgContext = screen.getByTestId('is-org-context').textContent;
    const isPersonalContext = screen.getByTestId('is-personal-context').textContent;

    expect(isOrgContext !== isPersonalContext).toBe(true);
  });
});
