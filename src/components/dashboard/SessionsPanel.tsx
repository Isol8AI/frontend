"use client";

import { useCallback } from "react";
import { Loader2, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import useSWR from "swr";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";

export function SessionsPanel() {
  const { getToken } = useAuth();

  const fetcher = useCallback(async (url: string) => {
    const token = await getToken();
    if (!token) throw new Error("No auth token");
    const res = await fetch(`${BACKEND_URL}${url}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  }, [getToken]);

  const { data, error, isLoading, mutate } = useSWR("/settings/sessions", fetcher, {
    revalidateOnFocus: false,
  });

  const deleteSession = useCallback(async (sessionId: string) => {
    const token = await getToken();
    if (!token) return;
    await fetch(`${BACKEND_URL}/settings/sessions/${sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    mutate();
  }, [getToken, mutate]);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="p-4 text-destructive text-sm">Failed to load sessions.</div>;

  const sessions = data?.sessions ?? [];

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <h2 className="text-sm font-medium flex items-center gap-1"><Clock className="h-4 w-4" />Sessions</h2>
      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active sessions.</p>
      ) : (
        <div className="space-y-1">
          {sessions.map((s: any) => (
            <div key={s.id} className="flex items-center justify-between p-2 rounded-md border border-border">
              <div>
                <span className="text-sm font-mono">{s.id}</span>
                {s.agent && <span className="text-xs text-muted-foreground ml-2">{s.agent}</span>}
                {s.created_at && <span className="text-xs text-muted-foreground ml-2">{s.created_at}</span>}
              </div>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteSession(s.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
