"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";

interface GatewayStatus {
  status?: string;
  uptime?: string;
  [key: string]: unknown;
}

interface DebugStatus {
  gateway_running: boolean;
  uptime_seconds?: number;
  active_agents: number;
  gateway?: GatewayStatus;
  healthy?: boolean;
  [key: string]: unknown;
}

interface HealthStatus {
  status: string;
  database: string;
  gateway: string;
  [key: string]: unknown;
}

interface DebugModel {
  model_id: string;
  name: string;
  provider: string;
  [key: string]: unknown;
}

interface DebugEvent {
  id: string;
  event_type: string;
  timestamp: string;
  details?: string;
  [key: string]: unknown;
}

export function useDebug() {
  const { getToken } = useAuth();

  const fetcher = useCallback(async (url: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    return res.json();
  }, [getToken]);

  const {
    data: status,
    error: statusError,
    isLoading: statusLoading,
    mutate: mutateStatus,
  } = useSWR<DebugStatus>(
    "/debug/status",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      dedupingInterval: 5000,
    }
  );

  const {
    data: health,
    error: healthError,
    isLoading: healthLoading,
    mutate: mutateHealth,
  } = useSWR<HealthStatus>(
    "/debug/health",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      dedupingInterval: 5000,
    }
  );

  const {
    data: modelsData,
    error: modelsError,
    isLoading: modelsLoading,
    mutate: mutateModels,
  } = useSWR<{ models: DebugModel[] }>(
    "/debug/models",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      dedupingInterval: 30000,
    }
  );

  const {
    data: eventsData,
    error: eventsError,
    isLoading: eventsLoading,
    mutate: mutateEvents,
  } = useSWR<{ events: DebugEvent[] }>(
    "/debug/events",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      dedupingInterval: 5000,
    }
  );

  const refresh = useCallback(() => {
    mutateStatus();
    mutateHealth();
    mutateModels();
    mutateEvents();
  }, [mutateStatus, mutateHealth, mutateModels, mutateEvents]);

  return {
    status: status ?? null,
    health: health ?? null,
    models: modelsData?.models ?? [],
    events: eventsData?.events ?? [],
    isLoading: statusLoading || healthLoading || modelsLoading || eventsLoading,
    error: statusError || healthError || modelsError || eventsError,
    refresh,
  };
}
