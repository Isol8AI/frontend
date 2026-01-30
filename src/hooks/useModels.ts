"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";

interface Model {
  id: string;
  name: string;
}

export function useModels() {
  const { getToken } = useAuth();

  const fetcher = useCallback(async (url: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch models");
    return res.json();
  }, [getToken]);

  const { data, error, isLoading } = useSWR<Model[]>(
    "/chat/models",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      dedupingInterval: 2000,
    }
  );

  return {
    models: data ?? [],
    isLoading,
    error,
  };
}
