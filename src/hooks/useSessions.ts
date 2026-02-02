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
      revalidateOnFocus: false,  // Prevents refetch on tab focus (reduces API calls)
      revalidateOnMount: true,
      dedupingInterval: 10000,   // 10s deduping prevents rapid-fire fetches during session switching
    }
  );

  const deleteSession = useCallback(async (sessionId: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}/chat/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to delete session");

    // Optimistically remove from local cache
    mutate(
      (current) => current ? {
        ...current,
        sessions: current.sessions.filter(s => s.id !== sessionId),
        total: current.total - 1,
      } : current,
      { revalidate: false }
    );
  }, [getToken, mutate]);

  return {
    sessions: data?.sessions ?? [],
    isLoading,
    error,
    refresh: () => mutate(),
    deleteSession,
  };
}
