"use client";

import { useCallback } from "react";
import useSWR, { SWRConfiguration } from "swr";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";

interface RpcResult<T = unknown> {
  data: T | undefined;
  error: Error | undefined;
  isLoading: boolean;
  mutate: () => void;
}

/**
 * Hook for read-only RPC calls (auto-fetched via SWR).
 *
 * Usage:
 *   const { data, isLoading } = useContainerRpc<HealthData>("health");
 *   const { data } = useContainerRpc<AgentList>("agents.list");
 */
export function useContainerRpc<T = unknown>(
  method: string | null,
  params?: Record<string, unknown>,
  config?: SWRConfiguration,
): RpcResult<T> {
  const { getToken, isSignedIn } = useAuth();

  const fetcher = useCallback(
    async (key: string) => {
      const token = await getToken();
      if (!token) throw new Error("No auth token");

      const [, m, paramStr] = key.split("|");
      const parsedParams = paramStr ? JSON.parse(paramStr) : undefined;

      const res = await fetch(`${BACKEND_URL}/container/rpc`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ method: m, params: parsedParams }),
      });

      if (res.status === 404) return undefined;
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "RPC call failed");
      }

      const { result } = await res.json();
      return result as T;
    },
    [getToken],
  );

  // SWR key encodes method + params for cache deduplication
  const swrKey =
    isSignedIn && method
      ? `rpc|${method}|${params ? JSON.stringify(params) : ""}`
      : null;

  const { data, error, isLoading, mutate } = useSWR<T | undefined>(
    swrKey as string | null,
    fetcher as (key: string) => Promise<T | undefined>,
    {
      revalidateOnFocus: false,
      dedupingInterval: 10000,
      ...config,
    },
  );

  return {
    data,
    error: error as Error | undefined,
    isLoading,
    mutate: () => {
      mutate();
    },
  };
}

/**
 * Hook for write RPC calls (imperative, not auto-fetched).
 *
 * Usage:
 *   const callRpc = useContainerRpcMutation();
 *   await callRpc("config.set", { key: "value" });
 */
export function useContainerRpcMutation() {
  const { getToken } = useAuth();

  return useCallback(
    async <T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> => {
      const token = await getToken();
      if (!token) throw new Error("No auth token");

      const res = await fetch(`${BACKEND_URL}/container/rpc`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ method, params }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "RPC call failed");
      }

      const { result } = await res.json();
      return result as T;
    },
    [getToken],
  );
}
