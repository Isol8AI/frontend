"use client";

import { Loader2, RefreshCw, Radio } from "lucide-react";
import { useContainerRpc, useContainerRpcMutation } from "@/hooks/useContainerRpc";
import { Button } from "@/components/ui/button";

interface Channel {
  name: string;
  enabled?: boolean;
  running?: boolean;
  type?: string;
  [key: string]: unknown;
}

export function ChannelsPanel() {
  const { data, error, isLoading, mutate } = useContainerRpc<Channel[]>("channels.status");
  const callRpc = useContainerRpcMutation();

  const handleToggle = async (name: string, currentlyEnabled: boolean) => {
    const method = currentlyEnabled ? "channels.disable" : "channels.enable";
    try {
      await callRpc(method, { name });
      mutate();
    } catch (err) {
      console.error("Failed to toggle channel:", err);
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

  const channels = Array.isArray(data) ? data : [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Channels</h2>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {channels.length === 0 ? (
        <p className="text-sm text-muted-foreground">No channels configured.</p>
      ) : (
        <div className="space-y-2">
          {channels.map((ch) => (
            <div key={ch.name} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="flex items-center gap-2">
                <Radio className="h-3.5 w-3.5 opacity-50" />
                <div>
                  <div className="text-sm font-medium">{ch.name}</div>
                  <div className="text-xs text-muted-foreground">{ch.type || "—"}</div>
                </div>
              </div>
              <Button
                variant={ch.enabled ? "outline" : "default"}
                size="sm"
                onClick={() => handleToggle(ch.name, !!ch.enabled)}
              >
                {ch.enabled ? "Disable" : "Enable"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
