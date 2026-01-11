import { useAuth } from "@clerk/nextjs";

const BACKEND_URL = "http://localhost:8000/api/v1";

interface ApiMethods {
  syncUser: () => Promise<unknown>;
  get: (endpoint: string) => Promise<unknown>;
  post: (endpoint: string, body: unknown) => Promise<unknown>;
}

export function useApi(): ApiMethods {
  const { getToken } = useAuth();

  async function authenticatedFetch(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<unknown> {
    const token = await getToken();

    if (!token) {
      throw new Error("No authentication token available");
    }

    const headers = {
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
  }

  return {
    syncUser: () => authenticatedFetch("/users/sync", { method: "POST" }),
    get: (endpoint: string) => authenticatedFetch(endpoint, { method: "GET" }),
    post: (endpoint: string, body: unknown) =>
      authenticatedFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  };
}
