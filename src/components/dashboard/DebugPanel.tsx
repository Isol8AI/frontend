"use client";

import { Loader2, RefreshCw, Heart, Server, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDebug } from "@/hooks/useDebug";

export function DebugPanel() {
  const { status, health, models, events, isLoading, error, refresh } = useDebug();

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="p-4 text-destructive text-sm">Failed to load debug info.</div>;

  return (
    <div className="p-4 space-y-6 max-w-3xl">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-medium">Debug & Diagnostics</h2>
        <Button size="sm" variant="ghost" onClick={refresh}><RefreshCw className="h-4 w-4" /></Button>
      </div>

      {/* Health + Status */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-md border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Heart className="h-4 w-4" />
            <span className="text-xs font-medium">Health</span>
          </div>
          <span className={`text-sm font-medium ${health?.healthy ? "text-green-500" : "text-destructive"}`}>
            {health?.healthy ? "Healthy" : "Unhealthy"}
          </span>
        </div>
        <div className="p-3 rounded-md border border-border">
          <div className="flex items-center gap-2 mb-2">
            <Server className="h-4 w-4" />
            <span className="text-xs font-medium">Gateway</span>
          </div>
          <span className="text-sm">{status?.gateway?.status ?? "Unknown"}</span>
          {status?.gateway?.uptime && <p className="text-xs text-muted-foreground">{status.gateway.uptime}</p>}
        </div>
      </div>

      {/* Models */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1"><Cpu className="h-3 w-3" />Models</h3>
        {models && models.length > 0 ? (
          <div className="space-y-1">
            {models.map((m, i) => (
              <div key={i} className="text-sm flex items-center justify-between p-2 rounded border border-border">
                <span className="font-mono text-xs">{m.model_id}</span>
                <span className="text-xs text-muted-foreground">{m.provider}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">No models found.</p>}
      </div>

      {/* Events */}
      <div>
        <h3 className="text-xs font-medium text-muted-foreground mb-2">Recent Events</h3>
        {events && events.length > 0 ? (
          <div className="space-y-1 max-h-64 overflow-auto">
            {events.map((e, i) => (
              <div key={i} className="text-xs p-2 rounded border border-border flex justify-between">
                <span className="font-mono">{e.event_type}</span>
                <span className="text-muted-foreground">{e.timestamp}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">No recent events.</p>}
      </div>
    </div>
  );
}
