import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { server } from './mocks/server.js';

// Using real hash-wasm argon2id - the memory leak was in useOrgSession, not Argon2
// If tests still crash, we may need to reduce memory cost for unit tests only

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  // Clean up React Testing Library
  cleanup();
  // Reset MSW handlers
  server.resetHandlers();
  // Clear all mocks to prevent memory accumulation
  vi.clearAllMocks();
  // Restore any spied functions
  vi.restoreAllMocks();
  // Force garbage collection hint (V8 may or may not honor this)
  if (global.gc) {
    global.gc();
  }
});
afterAll(() => server.close());

// Mock ResizeObserver for jsdom (not available in jsdom)
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const { mockGetToken } = vi.hoisted(() => ({
  mockGetToken: vi.fn(() => Promise.resolve('mock-jwt-token')),
}));

vi.mock('@clerk/nextjs', () => ({
  useAuth: () => ({
    isSignedIn: true,
    isLoaded: true,
    userId: 'user_test_123',
    getToken: mockGetToken,
  }),
  useUser: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: {
      id: 'user_test_123',
      primaryEmailAddress: { emailAddress: 'test@example.com' },
      firstName: 'Test',
      lastName: 'User',
    },
  }),
  useOrganization: () => ({
    organization: null,
    isLoaded: true,
  }),
  useOrganizationList: () => ({
    setActive: vi.fn(),
    userMemberships: { data: [], isLoading: false },
    isLoaded: true,
  }),
  OrganizationSwitcher: () => null,
  UserButton: () => null,
  SignedIn: ({ children }: { children: React.ReactNode }) => children,
  SignedOut: () => null,
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
}));
