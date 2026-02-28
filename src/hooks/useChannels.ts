"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";

interface Channel {
  name: string;
  type: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

interface ChannelsResponse {
  channels: Channel[];
}

export function useChannels() {
  const { getToken } = useAuth();

  const fetcher = useCallback(async (url: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch channels");
    return res.json();
  }, [getToken]);

  const { data, error, isLoading, mutate } = useSWR<ChannelsResponse>(
    "/channels",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      dedupingInterval: 10000,
    }
  );

  const configureChannel = useCallback(async (name: string, config: Record<string, unknown>) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}/channels/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ config }),
    });

    if (!res.ok) throw new Error("Failed to configure channel");

    mutate(
      (current) => current ? {
        ...current,
        channels: current.channels.map(c =>
          c.name === name ? { ...c, config } : c
        ),
      } : current,
      { revalidate: true }
    );
  }, [getToken, mutate]);

  const enableChannel = useCallback(async (name: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}/channels/${encodeURIComponent(name)}/enable`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to enable channel");

    mutate(
      (current) => current ? {
        ...current,
        channels: current.channels.map(c =>
          c.name === name ? { ...c, enabled: true } : c
        ),
      } : current,
      { revalidate: true }
    );
  }, [getToken, mutate]);

  const disableChannel = useCallback(async (name: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}/channels/${encodeURIComponent(name)}/disable`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to disable channel");

    mutate(
      (current) => current ? {
        ...current,
        channels: current.channels.map(c =>
          c.name === name ? { ...c, enabled: false } : c
        ),
      } : current,
      { revalidate: true }
    );
  }, [getToken, mutate]);

  return {
    channels: data?.channels ?? [],
    isLoading,
    error,
    refresh: () => mutate(),
    configureChannel,
    enableChannel,
    disableChannel,
  };
}
