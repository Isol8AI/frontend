"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";

interface Skill {
  name: string;
  description?: string;
  enabled: boolean;
  version?: string;
}

interface SkillsResponse {
  skills: Skill[];
}

export function useSkills() {
  const { getToken } = useAuth();

  const fetcher = useCallback(async (url: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch skills");
    return res.json();
  }, [getToken]);

  const { data, error, isLoading, mutate } = useSWR<SkillsResponse>(
    "/skills",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      dedupingInterval: 10000,
    }
  );

  const installSkill = useCallback(async (name: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}/skills`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) throw new Error("Failed to install skill");

    const installed = await res.json();

    mutate(
      (current) => current ? {
        ...current,
        skills: [...current.skills, installed],
      } : current,
      { revalidate: true }
    );

    return installed;
  }, [getToken, mutate]);

  const toggleSkill = useCallback(async (name: string, enabled: boolean) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}/skills/${encodeURIComponent(name)}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ enabled }),
    });

    if (!res.ok) throw new Error("Failed to toggle skill");

    mutate(
      (current) => current ? {
        ...current,
        skills: current.skills.map(s =>
          s.name === name ? { ...s, enabled } : s
        ),
      } : current,
      { revalidate: true }
    );
  }, [getToken, mutate]);

  return {
    skills: data?.skills ?? [],
    isLoading,
    error,
    refresh: () => mutate(),
    installSkill,
    toggleSkill,
  };
}
