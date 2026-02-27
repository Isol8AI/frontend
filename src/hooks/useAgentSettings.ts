/**
 * Hook for agent settings (file browser).
 *
 * TODO: Implement plaintext file browsing via new REST endpoints
 * that read/write agent workspace files on disk.
 */

"use client";

import { useState, useCallback } from "react";

export interface AgentFile {
  path: string;
  content: string;
  originalContent: string;
  size: number;
}

interface UseAgentSettingsReturn {
  files: AgentFile[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  isDirty: boolean;
  selectedPath: string | null;
  selectFile: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;
  loadFiles: (agentName: string) => Promise<void>;
  save: (agentName: string) => Promise<void>;
  reset: () => void;
}

export function useAgentSettings(): UseAgentSettingsReturn {
  const [files, setFiles] = useState<AgentFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const isDirty = files.some((f) => f.content !== f.originalContent);

  const selectFile = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  const updateFileContent = useCallback((path: string, content: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.path === path
          ? { ...f, content, size: new TextEncoder().encode(content).length }
          : f,
      ),
    );
  }, []);

  const loadFiles = useCallback(async (_agentName: string): Promise<void> => {
    setLoading(true);
    setError(null);
    setFiles([]);
    setSelectedPath(null);

    // TODO: Implement plaintext file loading from new REST endpoint
    setError("Agent file browser not yet available in this version.");
    setLoading(false);
  }, []);

  const save = useCallback(async (_agentName: string): Promise<void> => {
    setSaving(true);
    setError("Saving not yet available in this version.");
    setSaving(false);
  }, []);

  const reset = useCallback(() => {
    setFiles([]);
    setSelectedPath(null);
    setError(null);
  }, []);

  return {
    files,
    loading,
    saving,
    error,
    isDirty,
    selectedPath,
    selectFile,
    updateFileContent,
    loadFiles,
    save,
    reset,
  };
}
