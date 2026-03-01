"use client";

import { Loader2 } from "lucide-react";
import { useGatewayRpc } from "@/hooks/useGatewayRpc";

/**
 * Gates child content until the user's container gateway is healthy.
 *
 * Polls POST /container/rpc { method: "health" } every 3 seconds.
 * - 200 with data → gateway ready, render children
 * - 404 (returns undefined) → container not provisioned yet
 * - 502 or error → gateway booting
 */
export function ContainerGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data, error, isLoading } = useGatewayRpc<Record<string, unknown>>(
    "health",
    undefined,
    { refreshInterval: 3000, dedupingInterval: 2000 },
  );

  // Gateway responded with health data → ready
  if (data) {
    return <>{children}</>;
  }

  // Still loading initial request
  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Connecting to your agent...</p>
        </div>
      </div>
    );
  }

  // 404 (undefined data, no error) → container not provisioned
  // 502 or network error → gateway still booting
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
        <h2 className="text-lg font-medium">Setting up your agent</h2>
        <p className="text-sm text-muted-foreground max-w-xs mx-auto">
          Your container is starting up. This usually takes about 30 seconds.
        </p>
      </div>
    </div>
  );
}
