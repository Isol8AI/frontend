"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";

interface SettingsConfig {
  [key: string]: unknown;
}

export function useSettings() {
  const { getToken } = useAuth();

  const fetcher = useCallback(async (url: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch settings");
    return res.json();
  }, [getToken]);

  const { data, error, isLoading, mutate } = useSWR<SettingsConfig>(
    "/settings/config",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      dedupingInterval: 10000,
    }
  );

  const updateConfig = useCallback(async (updates: Partial<SettingsConfig>) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}/settings/config`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    });

    if (!res.ok) throw new Error("Failed to update settings");

    const updated = await res.json();

    mutate(
      (current) => current ? { ...current, ...updated } : updated,
      { revalidate: true }
    );

    return updated;
  }, [getToken, mutate]);

  return {
    config: data ?? null,
    isLoading,
    error,
    refresh: () => mutate(),
    updateConfig,
  };
}
