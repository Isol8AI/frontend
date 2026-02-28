"use client";

import { Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useContainerRpc } from "@/hooks/useContainerRpc";
import { Button } from "@/components/ui/button";

export function OverviewPanel() {
  const { data, error, isLoading, mutate } = useContainerRpc<Record<string, unknown>>(
    "health",
    undefined,
    { refreshInterval: 10000 },
  );

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
        <p className="text-sm text-destructive">Failed to fetch status: {error.message}</p>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No container available. Subscribe to access the control panel.
      </div>
    );
  }

  const status = data.status as string | undefined;
  const isOnline = status === "ok" || status === "running";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Overview</h2>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex items-center gap-2">
        {isOnline ? (
          <Wifi className="h-4 w-4 text-green-500" />
        ) : (
          <WifiOff className="h-4 w-4 text-red-500" />
        )}
        <span className="text-sm font-medium">{isOnline ? "Online" : "Offline"}</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {Object.entries(data).map(([key, value]) => (
          <div key={key} className="rounded-lg border border-border p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">
              {key.replace(/([A-Z])/g, " $1").replace(/_/g, " ")}
            </div>
            <div className="text-sm font-medium truncate">
              {typeof value === "object" ? JSON.stringify(value) : String(value ?? "—")}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
