"use client";

import { useCallback } from "react";
import useSWR from "swr";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";

interface FileEntry {
  path: string;
  size: number;
  modified: string;
  type: "file" | "directory";
}

interface FilesResponse {
  files: FileEntry[];
}

export function useFiles() {
  const { getToken } = useAuth();

  const fetcher = useCallback(async (url: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch files");
    return res.json();
  }, [getToken]);

  const { data, error, isLoading, mutate } = useSWR<FilesResponse>(
    "/files",
    fetcher,
    {
      revalidateOnFocus: false,
      revalidateOnMount: true,
      dedupingInterval: 10000,
    }
  );

  const uploadFile = useCallback(async (path: string, content: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}/files`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ path, content }),
    });

    if (!res.ok) throw new Error("Failed to upload file");

    const uploaded = await res.json();
    mutate(undefined, { revalidate: true });
    return uploaded;
  }, [getToken, mutate]);

  const deleteFile = useCallback(async (path: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}/files/${encodeURIComponent(path)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to delete file");

    mutate(
      (current) => current ? {
        ...current,
        files: current.files.filter(f => f.path !== path),
      } : current,
      { revalidate: false }
    );
  }, [getToken, mutate]);

  const downloadFile = useCallback(async (path: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");

    const res = await fetch(`${BACKEND_URL}/files/${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error("Failed to download file");
    return res.json();
  }, [getToken]);

  return {
    files: data?.files ?? [],
    isLoading,
    error,
    refresh: () => mutate(),
    uploadFile,
    deleteFile,
    downloadFile,
  };
}
