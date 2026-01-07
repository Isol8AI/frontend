import { useAuth } from "@clerk/nextjs";

const BACKEND_URL = "http://localhost:8000/api/v1";

export const useApi = () => {
  const { getToken } = useAuth();

  const authenticatedFetch = async (endpoint: string, options: RequestInit = {}) => {
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
  };

  return {
    syncUser: () => authenticatedFetch("/users/sync", { method: "POST" }),
    // Add other API methods here
    get: (endpoint: string) => authenticatedFetch(endpoint, { method: "GET" }),
    post: (endpoint: string, body: any) => authenticatedFetch(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
    }),
  };
};
