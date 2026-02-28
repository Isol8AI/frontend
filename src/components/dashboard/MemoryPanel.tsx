"use client";

import { useState, useCallback } from "react";
import { Loader2, Search, Trash2, Brain } from "lucide-react";
import { Button } from "@/components/ui/button";
import useSWR from "swr";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";

export function MemoryPanel() {
  const { getToken } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");

  const fetcher = useCallback(async (url: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");
    const res = await fetch(`${BACKEND_URL}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  }, [getToken]);

  const { data, error, isLoading, mutate } = useSWR("/settings/memory", fetcher, {
    revalidateOnFocus: false,
  });

  const deleteMemory = useCallback(async (memoryId: string) => {
    const token = await getToken();
    if (!token) return;
    await fetch(`${BACKEND_URL}/settings/memory/${memoryId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    mutate();
  }, [getToken, mutate]);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="p-4 text-destructive text-sm">Failed to load memory.</div>;

  const memories = data?.memories ?? [];
  const filtered = searchQuery
    ? memories.filter((m: { id: string; content: string; created_at?: string }) => JSON.stringify(m).toLowerCase().includes(searchQuery.toLowerCase()))
    : memories;

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-medium flex items-center gap-1"><Brain className="h-4 w-4" />Memory</h2>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <input
          className="w-full rounded-md border border-border bg-background pl-9 pr-3 py-2 text-sm"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search memories..."
        />
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{searchQuery ? "No matches found." : "No memories stored."}</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((m: { id: string; content: string; created_at?: string }) => (
            <div key={m.id} className="p-3 rounded-md border border-border">
              <div className="flex justify-between items-start">
                <p className="text-sm flex-1">{typeof m.content === "string" ? m.content : JSON.stringify(m.content)}</p>
                <Button size="sm" variant="ghost" className="text-destructive ml-2 shrink-0" onClick={() => deleteMemory(m.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>
              {m.created_at && <p className="text-xs text-muted-foreground mt-1">{m.created_at}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
