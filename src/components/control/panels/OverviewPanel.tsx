"use client";

import { Loader2, RefreshCw, Wifi, WifiOff, Clock, Cpu, MessageSquare, Users } from "lucide-react";
import { useContainerRpc } from "@/hooks/useContainerRpc";
import { Button } from "@/components/ui/button";

interface HealthData {
  status?: string;
  uptime?: string | number;
  version?: string;
  ts?: number;
  models?: { primary?: string; fallbacks?: string[] };
  sessions?: { active?: number; total?: number };
  agents?: { count?: number; default?: string };
  cron?: { enabled?: boolean; nextRun?: string };
  [key: string]: unknown;
}

function formatUptime(uptime: string | number | undefined): string {
  if (!uptime) return "\u2014";
  if (typeof uptime === "string") return uptime;
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function OverviewPanel() {
  const { data, error, isLoading, mutate } = useContainerRpc<HealthData>(
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
        No container available.
      </div>
    );
  }

  const status = data.status as string | undefined;
  const isOnline = status === "ok" || status === "running" || status === "healthy";

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
            {data.version ? `Version ${data.version}` : ""}
          </div>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 gap-3">
        <MetricCard
          icon={Clock}
          label="Uptime"
          value={formatUptime(data.uptime)}
        />
        <MetricCard
          icon={Cpu}
          label="Status"
          value={String(status || "unknown")}
        />
        <MetricCard
          icon={MessageSquare}
          label="Sessions"
          value={data.sessions?.active !== undefined ? String(data.sessions.active) : "\u2014"}
        />
        <MetricCard
          icon={Users}
          label="Agents"
          value={data.agents?.count !== undefined ? String(data.agents.count) : "\u2014"}
        />
      </div>

      {/* Raw Data (collapsed) */}
      <details className="group">
        <summary className="text-xs text-muted-foreground/60 cursor-pointer hover:text-muted-foreground">
          Raw health data
        </summary>
        <pre className="mt-2 text-xs bg-muted/30 rounded-lg p-3 overflow-auto max-h-64">
          {JSON.stringify(data, null, 2)}
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
