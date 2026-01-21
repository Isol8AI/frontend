import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useApi } from '@/lib/api';

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

describe('useApi hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    it('fetches models from /chat/models', async () => {
      const { result } = renderHook(() => useApi());
      const response = await result.current.get('/chat/models') as unknown[];

      expect(response).toBeInstanceOf(Array);
      expect(response.length).toBeGreaterThan(0);
    });

    it('fetches sessions from /chat/sessions', async () => {
      const { result } = renderHook(() => useApi());
      const response = await result.current.get('/chat/sessions') as {
        sessions: Array<{ id: string; name: string }>;
        total: number;
        limit: number;
        offset: number;
      };

      // Backend returns paginated response: { sessions: [...], total, limit, offset }
      expect(response).toHaveProperty('sessions');
      expect(response).toHaveProperty('total');
      expect(response).toHaveProperty('limit');
      expect(response).toHaveProperty('offset');
      expect(response.sessions).toBeInstanceOf(Array);
      expect(response.sessions[0]).toHaveProperty('id');
      expect(response.sessions[0]).toHaveProperty('name');
    });
  });

  describe('post', () => {
    it('sends POST request with body', async () => {
      const { result } = renderHook(() => useApi());
      const response = await result.current.post('/users/sync', {});

      expect(response).toHaveProperty('status');
    });
  });

  describe('error handling', () => {
    it('throws error when no token available', async () => {
      mockGetToken.mockImplementation(() => Promise.resolve(null));
      const { result } = renderHook(() => useApi());

      await expect(result.current.syncUser()).rejects.toThrow('No authentication token available');
    });
  });
});
