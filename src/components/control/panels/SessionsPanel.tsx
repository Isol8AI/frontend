"use client";

import { Loader2, RefreshCw, Trash2, MessageSquare } from "lucide-react";
import { useContainerRpc, useContainerRpcMutation } from "@/hooks/useContainerRpc";
import { Button } from "@/components/ui/button";

interface Session {
  key: string;
  agentId?: string;
  model?: string;
  label?: string;
  createdAt?: string;
  updatedAt?: string;
  tokenCount?: { input?: number; output?: number; total?: number };
  [key: string]: unknown;
}

interface SessionsResponse {
  sessions?: Session[];
}

export function SessionsPanel() {
  const { data: rawData, error, isLoading, mutate } = useContainerRpc<SessionsResponse | Session[]>(
    "sessions.list",
    { includeDerivedTitles: true, includeLastMessage: true },
  );
  const callRpc = useContainerRpcMutation();

  const handleDelete = async (key: string) => {
    try {
      await callRpc("sessions.delete", { key });
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

  // Handle both { sessions: [...] } and bare array
  const sessions: Session[] = Array.isArray(rawData)
    ? rawData
    : (rawData as SessionsResponse)?.sessions ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Sessions</h2>
          <p className="text-xs text-muted-foreground">{sessions.length} sessions.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {sessions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No active sessions.</p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <div key={s.key} className="rounded-lg border border-border p-3 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <MessageSquare className="h-3.5 w-3.5 opacity-50 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {s.label || s.key}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {s.agentId || "\u2014"} · {s.model || "\u2014"}
                    </div>
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(s.key)}>
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
