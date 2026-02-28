"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
  source?: string;
}

interface LogsResponse {
  logs: LogEntry[];
  lines: number;
}

export function useLogs() {
  const { getToken } = useAuth();

  const fetcher = useCallback(async (url: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch logs");
    return res.json();
  }, [getToken]);

  const { data, error, isLoading, mutate } = useSWR<LogsResponse>(
    "/logs",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      dedupingInterval: 5000,
    }
  );

  return {
    logs: data?.logs ?? [],
    lines: data?.lines ?? 0,
    isLoading,
    error,
    refresh: () => mutate(),
  };
}
