"use client";

import { Loader2 } from "lucide-react";
import { useGatewayRpc } from "@/hooks/useGatewayRpc";

/**
 * Gates child content until the user's container gateway is healthy.
 *
 * Uses WebSocket RPC { method: "health" } every 3 seconds.
 * - Data present → gateway ready, render children
 * - Loading → spinner
 * - Error → show error with retry prompt
 * - No data, no error → container still booting
 */
export function ContainerGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data, error, isLoading, mutate } = useGatewayRpc<Record<string, unknown>>(
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

  // Persistent error → show message with retry
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-lg font-medium">Connection error</h2>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">
            {error.message || "Failed to connect to your agent."}
          </p>
          <button
            onClick={() => mutate()}
            className="text-sm text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // No data, no error → container not provisioned or still booting
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
