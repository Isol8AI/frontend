"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";

interface Agent {
  agent_name: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  tarball_size_bytes: number | null;
}

interface AgentsResponse {
  agents: Agent[];
}

export function useAgents() {
  const { getToken } = useAuth();

  const fetcher = useCallback(async (url: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch agents");
    return res.json();
  }, [getToken]);

  const { data, error, isLoading, mutate } = useSWR<AgentsResponse>(
    "/agents",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      dedupingInterval: 10000,
    }
  );

  const createAgent = useCallback(async (name: string, soulContent?: string, model?: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const body: { agent_name: string; soul_content?: string; model?: string } = {
      agent_name: name,
    };
    if (soulContent !== undefined) body.soul_content = soulContent;
    if (model !== undefined) body.model = model;

    const res = await fetch(`${BACKEND_URL}/agents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error("Failed to create agent");

    const created = await res.json();

    mutate(
      (current) => current ? {
        ...current,
        agents: [...current.agents, created],
      } : current,
      { revalidate: true }
    );

    return created;
  }, [getToken, mutate]);

  const deleteAgent = useCallback(async (agentName: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}/agents/${agentName}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to delete agent");

    // Optimistically remove from local cache
    mutate(
      (current) => current ? {
        ...current,
        agents: current.agents.filter(a => a.agent_name !== agentName),
      } : current,
      { revalidate: false }
    );
  }, [getToken, mutate]);

  return {
    agents: data?.agents ?? [],
    isLoading,
    error,
    refresh: () => mutate(),
    createAgent,
    deleteAgent,
  };
}
