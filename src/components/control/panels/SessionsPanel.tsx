"use client";

import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useContainerRpc, useContainerRpcMutation } from "@/hooks/useContainerRpc";
import { Button } from "@/components/ui/button";

interface Session {
  id: string;
  agent?: string;
  model?: string;
  tokens?: { input?: number; output?: number; total?: number };
  updated?: string;
  [key: string]: unknown;
}

export function SessionsPanel() {
  const { data, error, isLoading, mutate } = useContainerRpc<Session[]>("sessions.list");
  const callRpc = useContainerRpcMutation();

  const handleDelete = async (id: string) => {
    try {
      await callRpc("sessions.delete", { id });
      mutate();
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-destructive">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  const sessions = Array.isArray(data) ? data : [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Sessions</h2>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active sessions.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{s.agent || "unknown"}</div>
                <div className="text-xs text-muted-foreground">
                  {s.model || "—"} · {s.tokens?.total ?? 0} tokens
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)}>
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
