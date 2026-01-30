"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";

interface Session {
  id: string;
  name: string;
}

interface SessionsResponse {
  sessions: Session[];
  total: number;
  limit: number;
  offset: number;
}

export function useSessions() {
  const { getToken } = useAuth();

  const fetcher = useCallback(async (url: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch sessions");
    return res.json();
  }, [getToken]);

  const { data, error, isLoading, mutate } = useSWR<SessionsResponse>(
    "/chat/sessions",
    fetcher,
    {
      revalidateOnFocus: true,
      revalidateOnMount: true,
      dedupingInterval: 2000,
    }
  );

  return {
    sessions: data?.sessions ?? [],
    isLoading,
    error,
    refresh: () => mutate(),
  };
}
