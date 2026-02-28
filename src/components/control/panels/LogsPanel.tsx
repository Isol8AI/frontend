"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useContainerRpc } from "@/hooks/useContainerRpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

export function LogsPanel() {
  const [level, setLevel] = useState<string>("info");
  const { data, error, isLoading, mutate } = useContainerRpc<unknown>(
    "logs.tail",
    { level, limit: 200 },
    { refreshInterval: 5000 },
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
        <p className="text-sm text-destructive">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  const logs = Array.isArray(data) ? data : typeof data === "string" ? data.split("\n") : [];

  return (
    <div className="p-6 space-y-4 flex flex-col h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Logs</h2>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex gap-1 flex-wrap">
        {LEVELS.map((l) => (
          <button
            key={l}
            className={cn(
              "px-2 py-0.5 text-xs rounded-md transition-colors",
              level === l
                ? "bg-primary text-primary-foreground"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            )}
            onClick={() => setLevel(l)}
          >
            {l}
          </button>
        ))}
      </div>

      <pre className="flex-1 text-xs bg-muted/30 rounded-lg p-3 overflow-auto font-mono leading-relaxed min-h-0">
        {logs.length > 0 ? (
          logs.map((line, i) => (
            <div key={i} className="hover:bg-muted/20">
              {typeof line === "string" ? line : JSON.stringify(line)}
            </div>
          ))
        ) : (
          <span className="text-muted-foreground">No logs available.</span>
        )}
      </pre>
    </div>
  );
}
