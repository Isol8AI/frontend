import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useApi } from '@/lib/api';

// Use vi.hoisted for mocks that need to be referenced in vi.mock
const { mockGetToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn((): Promise<string | null> => Promise.resolve('mock-jwt-token')),
}));

// Mock Clerk's useAuth hook for this test file
vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    userId: 'user_test_123',
    getToken: mockGetToken,
  }),
}));

describe('useApi hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the mock to return a valid token by default
    mockGetToken.mockImplementation(() => Promise.resolve('mock-jwt-token'));
  });

  describe('syncUser', () => {
    it('calls POST /users/sync', async () => {
      const { result } = renderHook(() => useApi());

      const response = await result.current.syncUser();

      expect(response).toEqual({
        status: 'exists',
        user_id: 'user_test_123',
      });
    });
  });

  describe('get', () => {
    it('calls GET with correct endpoint', async () => {
      const { result } = renderHook(() => useApi());

      const response = await result.current.get('/chat/models');

      expect(response).toBeInstanceOf(Array);
      expect(response.length).toBeGreaterThan(0);
    });

    it('returns session list', async () => {
      const { result } = renderHook(() => useApi());

      const sessions = await result.current.get('/chat/sessions');

      expect(sessions).toBeInstanceOf(Array);
      expect(sessions[0]).toHaveProperty('id');
      expect(sessions[0]).toHaveProperty('name');
    });
  });

  describe('post', () => {
    it('calls POST with body', async () => {
      const { result } = renderHook(() => useApi());

      // The MSW handler returns the sync response for any POST to /users/sync
      const response = await result.current.post('/users/sync', {});

      expect(response).toHaveProperty('status');
    });
  });

  describe('error handling', () => {
    it('throws error when no token available', async () => {
      // Override the mock to return null token
      mockGetToken.mockImplementation(() => Promise.resolve(null));

      const { result } = renderHook(() => useApi());

      // Calling syncUser should throw an error
      await expect(result.current.syncUser()).rejects.toThrow('No authentication token available');
    });
  });
});
