"use client";

import { Loader2, Power, PowerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useChannels } from "@/hooks/useChannels";

export function ChannelsPanel() {
  const { channels, isLoading, error, enableChannel, disableChannel } = useChannels();

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="p-4 text-destructive text-sm">Failed to load channels.</div>;

  return (
    <div className="p-4 max-w-3xl">
      <h2 className="text-sm font-medium mb-4">Channels</h2>
      {(!channels || channels.length === 0) ? (
        <p className="text-sm text-muted-foreground">No channels configured.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {channels.map((ch) => (
            <div key={ch.name} className="p-3 rounded-md border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium capitalize">{ch.name}</span>
                {ch.enabled ? (
                  <span className="text-xs text-green-500">Enabled</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Disabled</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{ch.type}</p>
              <div className="flex gap-2">
                {ch.enabled ? (
                  <Button size="sm" variant="ghost" onClick={() => disableChannel(ch.name)}><PowerOff className="h-4 w-4 mr-1" />Disable</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => enableChannel(ch.name)}><Power className="h-4 w-4 mr-1" />Enable</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
