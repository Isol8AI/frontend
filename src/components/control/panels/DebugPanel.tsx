"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useGatewayRpc } from "@/hooks/useGatewayRpc";
import { Button } from "@/components/ui/button";

export function DebugPanel() {
  const { data, error, isLoading, mutate } = useGatewayRpc<unknown>("status");

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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Debug</h2>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <pre className="text-xs bg-muted/30 rounded-lg p-3 overflow-auto max-h-[calc(100vh-200px)]">
        {data ? JSON.stringify(data, null, 2) : "No debug data."}
      </pre>
    </div>
  );
}
