"use client";

import { useState, useCallback } from "react";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";

interface UseAgentSettingsReturn {
  soulContent: string;
  originalSoulContent: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  isDirty: boolean;
  setSoulContent: (content: string) => void;
  loadAgent: (agentName: string) => Promise<void>;
  save: (agentName: string) => Promise<void>;
  reset: () => void;
}

export function useAgentSettings(): UseAgentSettingsReturn {
  const { getToken } = useAuth();
  const [soulContent, setSoulContent] = useState("");
  const [originalSoulContent, setOriginalSoulContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDirty = soulContent !== originalSoulContent;

  const loadAgent = useCallback(async (agentName: string): Promise<void> => {
    setLoading(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error("No auth token");

      const res = await fetch(`${BACKEND_URL}/agents/${agentName}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load agent");

      const agent = await res.json();
      const content = agent.soul_content ?? "";
      setSoulContent(content);
      setOriginalSoulContent(content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agent");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const save = useCallback(async (agentName: string): Promise<void> => {
    setSaving(true);
    setError(null);

    try {
      const token = await getToken();
      if (!token) throw new Error("No auth token");

      const res = await fetch(`${BACKEND_URL}/agents/${agentName}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ soul_content: soulContent || null }),
      });
      if (!res.ok) throw new Error("Failed to save agent settings");

      setOriginalSoulContent(soulContent);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }, [getToken, soulContent]);

  const reset = useCallback(() => {
    setSoulContent("");
    setOriginalSoulContent("");
    setError(null);
  }, []);

  return {
    soulContent,
    originalSoulContent,
    loading,
    saving,
    error,
    isDirty,
    setSoulContent,
    loadAgent,
    save,
    reset,
  };
}
