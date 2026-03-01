"use client";

import { Loader2, RefreshCw, Wifi, WifiOff, Clock, Cpu, MessageSquare, Users } from "lucide-react";
import { useContainerRpc } from "@/hooks/useContainerRpc";
import { Button } from "@/components/ui/button";

interface HealthAgent {
  agentId?: string;
  isDefault?: boolean;
  sessions?: { count?: number; recent?: unknown[] };
  [key: string]: unknown;
}

interface HealthPayload {
  ok?: boolean;
  ts?: number;
  durationMs?: number;
  channels?: Record<string, unknown>;
  heartbeatSeconds?: number;
  defaultAgentId?: string;
  agents?: HealthAgent[];
  sessions?: { count?: number; recent?: unknown[] };
  [key: string]: unknown;
}

// The RPC response may be wrapped: { type: "event", event: "health", payload: {...} }
// or it may be the payload directly.
interface HealthResponse {
  type?: string;
  event?: string;
  payload?: HealthPayload;
  [key: string]: unknown;
}

function extractHealth(data: HealthResponse): HealthPayload {
  if (data.type === "event" && data.payload) {
    return data.payload;
  }
  return data as HealthPayload;
}

function formatUptime(ts: number | undefined): string {
  if (!ts) return "\u2014";
  const now = Date.now();
  const uptimeMs = now - ts;
  if (uptimeMs < 0) return "\u2014";
  const seconds = Math.floor(uptimeMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function OverviewPanel() {
  const { data: rawData, error, isLoading, mutate } = useContainerRpc<HealthResponse>(
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

  if (!rawData) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        No container available.
      </div>
    );
  }

  const health = extractHealth(rawData);
  const isOnline = health.ok === true;
  const sessionCount = health.sessions?.count;
  const agentCount = health.agents?.length;
  const defaultAgent = health.defaultAgentId;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Overview</h2>
          <p className="text-xs text-muted-foreground">Gateway status and health snapshot.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Status Banner */}
      <div className="flex items-center gap-3 rounded-lg border border-border p-4 bg-muted/20">
        {isOnline ? (
          <Wifi className="h-5 w-5 text-green-500" />
        ) : (
          <WifiOff className="h-5 w-5 text-red-500" />
        )}
        <div>
          <div className="text-sm font-semibold">{isOnline ? "Online" : "Offline"}</div>
          <div className="text-xs text-muted-foreground">
            {defaultAgent ? `Default agent: ${defaultAgent}` : ""}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={Clock}
          label="Uptime"
          value={formatUptime(health.ts)}
        />
        <MetricCard
          icon={Cpu}
          label="Status"
          value={isOnline ? "healthy" : "unknown"}
        />
        <MetricCard
          icon={MessageSquare}
          label="Sessions"
          value={sessionCount !== undefined ? String(sessionCount) : "\u2014"}
        />
        <MetricCard
          icon={Users}
          label="Agents"
          value={agentCount !== undefined ? String(agentCount) : "\u2014"}
        />
      </div>

      {/* Raw Data (collapsed) */}
      <details className="group">
        <summary className="text-xs text-muted-foreground/60 cursor-pointer hover:text-muted-foreground">
          Raw health data
        </summary>
        <pre className="mt-2 text-xs bg-muted/30 rounded-lg p-3 overflow-auto max-h-64">
          {JSON.stringify(rawData, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3 w-3 text-muted-foreground/60" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{label}</span>
      </div>
      <div className="text-sm font-medium">{value}</div>
    </div>
  );
}
