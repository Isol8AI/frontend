"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useContainerRpc } from "@/hooks/useContainerRpc";
import { Button } from "@/components/ui/button";

interface UsageData {
  total_tokens?: number;
  total_cost?: number;
  sessions?: Array<{
    id: string;
    agent?: string;
    tokens?: number;
    cost?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export function UsagePanel() {
  const { data, error, isLoading, mutate } = useContainerRpc<UsageData>("usage.cost");

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

  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">No usage data available.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Usage</h2>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Total Tokens</div>
          <div className="text-lg font-semibold">{(data.total_tokens ?? 0).toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Total Cost</div>
          <div className="text-lg font-semibold">${(data.total_cost ?? 0).toFixed(4)}</div>
        </div>
      </div>

      {data.sessions && data.sessions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">By Session</h3>
          {data.sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="text-sm">{s.agent || s.id}</div>
              <div className="text-xs text-muted-foreground">
                {(s.tokens ?? 0).toLocaleString()} tokens · ${(s.cost ?? 0).toFixed(4)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
