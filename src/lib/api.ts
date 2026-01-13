import { useCallback, useMemo } from "react";
import { useAuth } from "@clerk/nextjs";

// Use environment variable for production, fallback to localhost for development
export const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

interface CurrentOrg {
  org_id: string | null;
  org_name: string | null;
  org_slug: string | null;
  org_role: string | null;
  is_personal_context: boolean;
  is_org_admin: boolean;
}

interface ApiMethods {
  syncUser: () => Promise<unknown>;
  getCurrentOrg: () => Promise<CurrentOrg>;
  get: (endpoint: string) => Promise<unknown>;
  post: (endpoint: string, body: unknown) => Promise<unknown>;
  put: (endpoint: string, body: unknown) => Promise<unknown>;
}

export function useApi(): ApiMethods {
  const { getToken } = useAuth();

  const authenticatedFetch = useCallback(
    async function (endpoint: string, options: RequestInit = {}): Promise<unknown> {
      const token = await getToken();

      if (!token) {
        throw new Error("No authentication token available");
      }

      const headers: HeadersInit = {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      const response = await fetch(`${BACKEND_URL}${endpoint}`, {
        ...options,
        headers,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "API request failed");
      }

      return response.json();
    },
    [getToken]
  );

  return useMemo(
    () => ({
      syncUser(): Promise<unknown> {
        return authenticatedFetch("/users/sync", { method: "POST" });
      },
      getCurrentOrg(): Promise<CurrentOrg> {
        return authenticatedFetch("/organizations/current", { method: "GET" }) as Promise<CurrentOrg>;
      },
      get(endpoint: string): Promise<unknown> {
        return authenticatedFetch(endpoint, { method: "GET" });
      },
      post(endpoint: string, body: unknown): Promise<unknown> {
        return authenticatedFetch(endpoint, {
          method: "POST",
          body: JSON.stringify(body),
        });
      },
      put(endpoint: string, body: unknown): Promise<unknown> {
        return authenticatedFetch(endpoint, {
          method: "PUT",
          body: JSON.stringify(body),
        });
      },
    }),
    [authenticatedFetch]
  );
}
