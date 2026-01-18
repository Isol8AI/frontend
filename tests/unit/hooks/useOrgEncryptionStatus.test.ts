import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useOrgEncryptionStatus } from '@/hooks/useOrgEncryptionStatus';

const { mockGetToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn((): Promise<string | null> => Promise.resolve('mock-jwt-token')),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    userId: 'user_test_123',
    getToken: mockGetToken,
  }),
}));

describe('useOrgEncryptionStatus hook', () => {
  const mockOrgId = 'org_test_123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetToken.mockImplementation(() => Promise.resolve('mock-jwt-token'));
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns default state when orgId is null', async () => {
    const { result } = renderHook(() => useOrgEncryptionStatus(null));

    expect(result.current.isLoading).toBe(false);
    expect(result.current.orgHasEncryption).toBe(false);
    expect(result.current.userHasOrgKey).toBe(false);
    expect(result.current.encryptedOrgKey).toBe(null);
    expect(result.current.error).toBe(null);
  });

  it('fetches org encryption status when orgId is provided', async () => {
    const mockEncryptionResponse = {
      has_encryption_keys: true,
    };
    const mockMembershipResponse = {
      has_org_key: true,
      encrypted_org_key: { test: 'encrypted_key' },
    };

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockEncryptionResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMembershipResponse),
      });

    const { result } = renderHook(() => useOrgEncryptionStatus(mockOrgId));

    // Initially loading
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.orgHasEncryption).toBe(true);
    expect(result.current.userHasOrgKey).toBe(true);
    expect(result.current.encryptedOrgKey).toEqual({ test: 'encrypted_key' });
    expect(result.current.error).toBe(null);
  });

  it('handles org without encryption', async () => {
    const mockEncryptionResponse = {
      has_encryption_keys: false,
    };
    const mockMembershipResponse = {
      has_org_key: false,
      encrypted_org_key: null,
    };

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockEncryptionResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMembershipResponse),
      });

    const { result } = renderHook(() => useOrgEncryptionStatus(mockOrgId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.orgHasEncryption).toBe(false);
    expect(result.current.userHasOrgKey).toBe(false);
    expect(result.current.encryptedOrgKey).toBe(null);
  });

  it('handles 404 membership response (user not a member yet)', async () => {
    const mockEncryptionResponse = {
      has_encryption_keys: true,
    };

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockEncryptionResponse),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

    const { result } = renderHook(() => useOrgEncryptionStatus(mockOrgId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.orgHasEncryption).toBe(true);
    expect(result.current.userHasOrgKey).toBe(false);
    expect(result.current.encryptedOrgKey).toBe(null);
  });

  it('handles encryption status fetch error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

    const { result } = renderHook(() => useOrgEncryptionStatus(mockOrgId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Failed to fetch org encryption status');
  });

  it('handles no authentication token', async () => {
    mockGetToken.mockImplementation(() => Promise.resolve(null));

    const { result } = renderHook(() => useOrgEncryptionStatus(mockOrgId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe('Not authenticated');
  });

  it('refetches status when refetch is called', async () => {
    const mockEncryptionResponse = {
      has_encryption_keys: false,
    };
    const mockMembershipResponse = {
      has_org_key: false,
    };

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockEncryptionResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockMembershipResponse),
      });

    const { result } = renderHook(() => useOrgEncryptionStatus(mockOrgId));

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.orgHasEncryption).toBe(false);

    // Update mock to return different data
    const updatedEncryptionResponse = {
      has_encryption_keys: true,
    };
    const updatedMembershipResponse = {
      has_org_key: true,
      encrypted_org_key: { updated: 'key' },
    };

    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updatedEncryptionResponse),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(updatedMembershipResponse),
      });

    // Call refetch
    await result.current.refetch();

    await waitFor(() => {
      expect(result.current.orgHasEncryption).toBe(true);
    });

    expect(result.current.userHasOrgKey).toBe(true);
  });
});
