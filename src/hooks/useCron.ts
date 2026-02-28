"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
  last_run?: string;
  next_run?: string;
}

interface CronResponse {
  jobs: CronJob[];
}

interface CreateCronJobData {
  name: string;
  schedule: string;
  command: string;
}

export function useCron() {
  const { getToken } = useAuth();

  const fetcher = useCallback(async (url: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch cron jobs");
    return res.json();
  }, [getToken]);

  const { data, error, isLoading, mutate } = useSWR<CronResponse>(
    "/cron",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      dedupingInterval: 10000,
    }
  );

  const createJob = useCallback(async (jobData: CreateCronJobData) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}/cron`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(jobData),
    });

    if (!res.ok) throw new Error("Failed to create cron job");

    const created = await res.json();

    mutate(
      (current) => current ? {
        ...current,
        jobs: [...current.jobs, created],
      } : current,
      { revalidate: true }
    );

    return created;
  }, [getToken, mutate]);

  const deleteJob = useCallback(async (id: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}/cron/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to delete cron job");

    mutate(
      (current) => current ? {
        ...current,
        jobs: current.jobs.filter(j => j.id !== id),
      } : current,
      { revalidate: false }
    );
  }, [getToken, mutate]);

  const runJob = useCallback(async (id: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}/cron/${id}/run`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to run cron job");

    mutate(undefined, { revalidate: true });
    return res.json();
  }, [getToken, mutate]);

  return {
    jobs: data?.jobs ?? [],
    isLoading,
    error,
    refresh: () => mutate(),
    createJob,
    deleteJob,
    runJob,
  };
}
