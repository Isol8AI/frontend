/**
 * Tests for useOrgSession hook.
 *
 * Tests cover:
 * - Initial state and loading
 * - Switching between personal and org contexts
 * - Fetching memberships
 * - Org encryption unlocking
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useOrgSession } from '@/hooks/useOrgSession';

// =============================================================================
// Mocks
// =============================================================================

const mockGetToken = vi.fn(() => Promise.resolve('mock-jwt-token'));
const mockSetActive = vi.fn(() => Promise.resolve());
const mockUnlockOrgKey = vi.fn();
const mockLockOrgKey = vi.fn();

// Mock Clerk hooks
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    userId: 'user_test_123',
    getToken: mockGetToken,
  }),
  useOrganization: () => ({
    organization: null,
  }),
  useOrganizationList: () => ({
    setActive: mockSetActive,
    userMemberships: {
      data: [
        {
          id: 'mem_1',
          organization: { id: 'org_1', name: 'Test Org' },
          role: 'org:member',
          createdAt: new Date('2024-01-01'),
        },
      ],
    },
  }),
}));

// Mock useEncryption hook
vi.mock('@/hooks/useEncryption', () => ({
  useEncryption: () => ({
    state: {
      isSetup: true,
      isUnlocked: true,
      publicKey: 'abc123',
      enclavePublicKey: 'xyz789',
      isLoading: false,
      error: null,
    },
    isOrgUnlocked: false,
    unlockOrgKey: mockUnlockOrgKey,
    lockOrgKey: mockLockOrgKey,
  }),
}));

// Mock fetch for API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// =============================================================================
// Test Suite
// =============================================================================

describe('useOrgSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
  });

  describe('Initial State', () => {
    it('starts in personal mode', () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ memberships: [] }),
      });

      const { result } = renderHook(() => useOrgSession());

      expect(result.current.state.isPersonalMode).toBe(true);
      expect(result.current.state.currentOrgId).toBeNull();
    });

    it('initially loads memberships', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            memberships: [
              {
                id: 'mem_1',
                org_id: 'org_1',
                org_name: 'Test Org',
                role: 'org:member',
                has_org_key: true,
                key_distributed_at: '2024-01-01T00:00:00Z',
                joined_at: '2024-01-01T00:00:00Z',
              },
            ],
          }),
      });

      const { result } = renderHook(() => useOrgSession());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      expect(result.current.state.memberships).toHaveLength(1);
      expect(result.current.state.memberships[0].org_name).toBe('Test Org');
    });

    it('falls back to Clerk data when backend returns 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const { result } = renderHook(() => useOrgSession());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      // Should have memberships from Clerk mock
      expect(result.current.state.memberships).toHaveLength(1);
    });
  });

  describe('Context Switching', () => {
    it('switches to organization', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            memberships: [
              {
                id: 'mem_1',
                org_id: 'org_1',
                org_name: 'Test Org',
                role: 'org:admin',
                has_org_key: true,
                key_distributed_at: null,
                joined_at: null,
              },
            ],
          }),
      });

      const { result } = renderHook(() => useOrgSession());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.switchToOrg('org_1');
      });

      expect(mockSetActive).toHaveBeenCalledWith({ organization: 'org_1' });
      expect(mockLockOrgKey).toHaveBeenCalled();
    });

    it('switches to personal mode', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ memberships: [] }),
      });

      const { result } = renderHook(() => useOrgSession());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      act(() => {
        result.current.switchToPersonal();
      });

      expect(mockSetActive).toHaveBeenCalledWith({ organization: null });
      expect(mockLockOrgKey).toHaveBeenCalled();
      expect(result.current.state.isPersonalMode).toBe(true);
    });

    it('locks org key when switching contexts', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            memberships: [
              {
                id: 'mem_1',
                org_id: 'org_1',
                org_name: 'Test Org',
                role: 'org:member',
                has_org_key: true,
                key_distributed_at: null,
                joined_at: null,
              },
            ],
          }),
      });

      const { result } = renderHook(() => useOrgSession());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      // Switch to org
      await act(async () => {
        await result.current.switchToOrg('org_1');
      });

      expect(mockLockOrgKey).toHaveBeenCalled();

      // Switch to personal
      mockLockOrgKey.mockClear();
      act(() => {
        result.current.switchToPersonal();
      });

      expect(mockLockOrgKey).toHaveBeenCalled();
    });
  });

  describe('Org Encryption', () => {
    it('unlocks org encryption when key is available', async () => {
      // First call for memberships
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            memberships: [
              {
                id: 'mem_1',
                org_id: 'org_1',
                org_name: 'Test Org',
                role: 'org:member',
                has_org_key: true,
                key_distributed_at: '2024-01-01T00:00:00Z',
                joined_at: '2024-01-01T00:00:00Z',
              },
            ],
          }),
      });

      // Second call for membership with encrypted key
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'mem_1',
            org_id: 'org_1',
            role: 'org:member',
            has_org_key: true,
            encrypted_org_key: {
              ephemeral_public_key: 'abc123',
              iv: '1234567890abcdef',
              ciphertext: 'encrypted_data',
              auth_tag: '1234567890abcdef',
              hkdf_salt: 'salt12345678901234567890123456789012',
            },
          }),
      });

      const { result } = renderHook(() => useOrgSession());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      // Set current org (simulating the org being selected)
      await act(async () => {
        await result.current.switchToOrg('org_1');
      });

      // Now unlock org encryption
      await act(async () => {
        await result.current.unlockOrgEncryption();
      });

      expect(mockUnlockOrgKey).toHaveBeenCalled();
    });

    it('throws error when org key not distributed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            memberships: [
              {
                id: 'mem_1',
                org_id: 'org_1',
                org_name: 'Test Org',
                role: 'org:member',
                has_org_key: false,
                key_distributed_at: null,
                joined_at: null,
              },
            ],
          }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'mem_1',
            org_id: 'org_1',
            role: 'org:member',
            has_org_key: false,
            encrypted_org_key: null,
          }),
      });

      const { result } = renderHook(() => useOrgSession());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.switchToOrg('org_1');
      });

      await expect(
        act(async () => {
          await result.current.unlockOrgEncryption();
        })
      ).rejects.toThrow('Organization key not distributed to you yet');
    });

    it('throws error when no org selected', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ memberships: [] }),
      });

      const { result } = renderHook(() => useOrgSession());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      await expect(
        act(async () => {
          await result.current.unlockOrgEncryption();
        })
      ).rejects.toThrow('No organization selected');
    });

    it('locks org encryption', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ memberships: [] }),
      });

      const { result } = renderHook(() => useOrgSession());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      act(() => {
        result.current.lockOrgEncryption();
      });

      expect(mockLockOrgKey).toHaveBeenCalled();
    });
  });

  describe('Encryption Status', () => {
    it('fetches org encryption status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ memberships: [] }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            has_encryption_keys: true,
            org_public_key: 'org_public_key_hex',
          }),
      });

      const { result } = renderHook(() => useOrgSession());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      const status = await act(async () => {
        return await result.current.getOrgEncryptionStatus('org_1');
      });

      expect(status.has_encryption_keys).toBe(true);
      expect(status.org_public_key).toBe('org_public_key_hex');
    });
  });

  describe('Admin Detection', () => {
    it('detects admin role', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            memberships: [
              {
                id: 'mem_1',
                org_id: 'org_1',
                org_name: 'Test Org',
                role: 'org:admin',
                has_org_key: true,
                key_distributed_at: null,
                joined_at: null,
              },
            ],
          }),
      });

      const { result } = renderHook(() => useOrgSession());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.switchToOrg('org_1');
      });

      expect(result.current.state.isAdmin).toBe(true);
    });

    it('detects member role', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            memberships: [
              {
                id: 'mem_1',
                org_id: 'org_1',
                org_name: 'Test Org',
                role: 'org:member',
                has_org_key: true,
                key_distributed_at: null,
                joined_at: null,
              },
            ],
          }),
      });

      const { result } = renderHook(() => useOrgSession());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.switchToOrg('org_1');
      });

      expect(result.current.state.isAdmin).toBe(false);
    });
  });

  describe('Refresh Memberships', () => {
    it('refreshes memberships from server', async () => {
      // Initial load
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            memberships: [],
          }),
      });

      const { result } = renderHook(() => useOrgSession());

      await waitFor(() => {
        expect(result.current.state.isLoading).toBe(false);
      });

      expect(result.current.state.memberships).toHaveLength(0);

      // Refresh with new data
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            memberships: [
              {
                id: 'mem_1',
                org_id: 'org_1',
                org_name: 'New Org',
                role: 'org:member',
                has_org_key: false,
                key_distributed_at: null,
                joined_at: null,
              },
            ],
          }),
      });

      await act(async () => {
        await result.current.refreshMemberships();
      });

      expect(result.current.state.memberships).toHaveLength(1);
      expect(result.current.state.memberships[0].org_name).toBe('New Org');
    });
  });
});
