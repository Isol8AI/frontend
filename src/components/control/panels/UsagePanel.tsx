"use client";

import { useState, useMemo } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useGatewayRpc } from "@/hooks/useGatewayRpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface UsageData {
  total_tokens?: number;
  total_cost?: number;
  sessions?: Array<{
    id: string;
    agent?: string;
    tokens?: number;
    cost?: number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

type DateRange = "7d" | "30d" | "90d";

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function getDateRange(range: DateRange): { startDate: string; endDate: string } {
  const end = new Date();
  const start = new Date();
  switch (range) {
    case "7d":
      start.setDate(start.getDate() - 7);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    case "90d":
      start.setDate(start.getDate() - 90);
      break;
  }
  return { startDate: formatDate(start), endDate: formatDate(end) };
}

const RANGE_OPTIONS: { id: DateRange; label: string }[] = [
  { id: "7d", label: "Last 7d" },
  { id: "30d", label: "Last 30d" },
  { id: "90d", label: "Last 90d" },
];

export function UsagePanel() {
  const [range, setRange] = useState<DateRange>("30d");
  const dateRange = useMemo(() => getDateRange(range), [range]);
  const { data, error, isLoading, mutate } = useGatewayRpc<UsageData>(
    "usage.cost",
    { startDate: dateRange.startDate, endDate: dateRange.endDate },
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

  if (!data) {
    return <div className="p-6 text-sm text-muted-foreground">No usage data available.</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Usage</h2>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Date range selector */}
      <div className="flex gap-1">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            className={cn(
              "px-3 py-1 text-xs rounded-md transition-colors",
              range === opt.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
            onClick={() => setRange(opt.id)}
          >
            {opt.label}
          </button>
        ))}
        <span className="text-xs text-muted-foreground/50 self-center ml-2">
          {dateRange.startDate} — {dateRange.endDate}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-border p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Total Tokens</div>
          <div className="text-lg font-semibold">{(data.total_tokens ?? 0).toLocaleString()}</div>
        </div>
        <div className="rounded-lg border border-border p-3">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-1">Total Cost</div>
          <div className="text-lg font-semibold">${(data.total_cost ?? 0).toFixed(4)}</div>
        </div>
      </div>

      {data.sessions && data.sessions.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">By Session</h3>
          {data.sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-lg border border-border p-3">
              <div className="text-sm">{s.agent || s.id}</div>
              <div className="text-xs text-muted-foreground">
                {(s.tokens ?? 0).toLocaleString()} tokens · ${(s.cost ?? 0).toFixed(4)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
