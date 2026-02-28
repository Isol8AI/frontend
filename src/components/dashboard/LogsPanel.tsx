"use client";

import { useEffect, useRef } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLogs } from "@/hooks/useLogs";

export function LogsPanel() {
  const { logs, lines, isLoading, error, refresh } = useLogs();
  const scrollRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="p-4 text-destructive text-sm">Failed to load logs.</div>;

  return (
    <div className="p-4 space-y-3 h-full flex flex-col">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-medium">Container Logs <span className="text-muted-foreground font-normal">({lines ?? 0} lines)</span></h2>
        <Button size="sm" variant="ghost" onClick={refresh}><RefreshCw className="h-4 w-4" /></Button>
      </div>
      <pre
        ref={scrollRef}
        className="flex-1 rounded-md border border-border bg-black/50 text-green-400 p-3 text-xs font-mono overflow-auto whitespace-pre-wrap"
      >
        {logs.length > 0
          ? logs.map((entry) => `${entry.timestamp} [${entry.level}] ${entry.message}`).join("\n")
          : "No logs available."}
      </pre>
    </div>
  );
}
