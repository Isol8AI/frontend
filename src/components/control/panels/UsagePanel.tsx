"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { useGatewayRpc } from "@/hooks/useGatewayRpc";
import { useApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

const MARKUP = 1.4;

// REST API types (from GET /billing/account and GET /billing/usage)
interface UsagePeriod {
  start: string;
  end: string;
  included_budget: number;
  used: number;
  overage: number;
  percent_used: number;
}

interface BillingAccount {
  plan_tier: string;
  has_subscription: boolean;
  current_period: UsagePeriod;
}

interface ModelUsage {
  model: string;
  cost: number;
  requests: number;
}

interface DailyUsage {
  date: string;
  cost: number;
}

interface UsageResponse {
  period: UsagePeriod;
  total_cost: number;
  total_requests: number;
  by_model: ModelUsage[];
  by_day: DailyUsage[];
}

// Gateway RPC types (from usage.cost)
interface GatewayUsageData {
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

// =============================================================================
// Helpers
// =============================================================================

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

/** Shorten a model ID like "us.anthropic.claude-3-5-sonnet-20241022-v2:0" → "claude-3.5-sonnet" */
function shortModelName(model: string): string {
  const parts = model.split(".");
  const last = parts[parts.length - 1] || model;
  // Strip version suffixes like -20241022-v2:0
  return last.replace(/-\d{8}.*$/, "").replace(/:.*$/, "");
}

function formatDollars(amount: number, decimals = 2): string {
  return `$${amount.toFixed(decimals)}`;
}

const RANGE_OPTIONS: { id: DateRange; label: string }[] = [
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
  { id: "90d", label: "90d" },
];

// =============================================================================
// Component
// =============================================================================

export function UsagePanel() {
  const { get } = useApi();

  // --- REST API data ---
  const [account, setAccount] = useState<BillingAccount | null>(null);
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingError, setBillingError] = useState<string | null>(null);

  const fetchBilling = useCallback(async () => {
    setBillingLoading(true);
    setBillingError(null);
    try {
      const [acct, usg] = await Promise.all([
        get("/billing/account") as Promise<BillingAccount>,
        get("/billing/usage") as Promise<UsageResponse>,
      ]);
      setAccount(acct);
      setUsage(usg);
    } catch (err) {
      setBillingError(err instanceof Error ? err.message : "Failed to fetch billing data");
    } finally {
      setBillingLoading(false);
    }
  }, [get]);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  // --- Gateway RPC data ---
  const [range, setRange] = useState<DateRange>("30d");
  const dateRange = useMemo(() => getDateRange(range), [range]);
  const {
    data: gatewayData,
    error: gatewayError,
    isLoading: gatewayLoading,
    mutate: mutateGateway,
  } = useGatewayRpc<GatewayUsageData>("usage.cost", {
    startDate: dateRange.startDate,
    endDate: dateRange.endDate,
  });

  // --- Derived values ---
  const period = account?.current_period;
  const totalBillable = usage?.total_cost ?? 0;
  const rawCost = totalBillable / MARKUP;
  const platformFee = totalBillable - rawCost;
  const budgetPercent = period?.percent_used ?? 0;

  const handleRefresh = useCallback(() => {
    fetchBilling();
    mutateGateway();
  }, [fetchBilling, mutateGateway]);

  // --- Loading state ---
  if (billingLoading && gatewayLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Usage & Billing</h2>
        <Button variant="ghost" size="sm" onClick={handleRefresh}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {billingError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-destructive/5 border border-destructive/20">
          <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
          <span className="text-xs text-destructive">{billingError}</span>
          <Button variant="outline" size="sm" className="ml-auto h-6 text-xs" onClick={fetchBilling}>
            Retry
          </Button>
        </div>
      )}

      {/* Plan + Period */}
      {account && period && (
        <>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              Plan: <span className="font-medium text-foreground">{account.plan_tier}</span>
            </span>
            <span>
              Period: <span className="font-medium text-foreground">{period.start} — {period.end}</span>
            </span>
            {account.has_subscription && (
              <span className="text-emerald-600 font-medium">Active</span>
            )}
          </div>

          {/* Budget bar */}
          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Budget</span>
              <span className="text-muted-foreground">
                {formatDollars(period.used)} / {formatDollars(period.included_budget)}
                <span className="ml-2 text-xs">({budgetPercent.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-muted/30 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  budgetPercent < 75
                    ? "bg-emerald-500"
                    : budgetPercent < 90
                      ? "bg-yellow-500"
                      : "bg-red-500",
                )}
                style={{ width: `${Math.min(budgetPercent, 100)}%` }}
              />
            </div>
            {period.overage > 0 && (
              <p className="text-xs text-red-500">
                Overage: {formatDollars(period.overage)}
              </p>
            )}
          </div>
        </>
      )}

      {/* Cost Breakdown */}
      {usage && (
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h3 className="text-sm font-medium">Cost Breakdown</h3>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">LLM Cost (raw)</span>
              <span className="font-mono">{formatDollars(rawCost, 4)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Platform Fee (40%)</span>
              <span className="font-mono">{formatDollars(platformFee, 4)}</span>
            </div>
            <div className="border-t border-border my-1" />
            <div className="flex items-center justify-between text-sm font-medium">
              <span>Total Billable</span>
              <span className="font-mono">{formatDollars(totalBillable, 4)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-emerald-600">Your Revenue</span>
              <span className="font-mono text-emerald-600">{formatDollars(platformFee, 4)}</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground/60 pt-1">
            {usage.total_requests.toLocaleString()} total requests
          </div>
        </div>
      )}

      {/* Gateway Stats (OpenClaw) */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Gateway Stats (OpenClaw)</h3>
          <div className="flex gap-0.5">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                className={cn(
                  "px-2 py-0.5 text-[10px] rounded transition-colors",
                  range === opt.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/30 text-muted-foreground hover:bg-muted/50",
                )}
                onClick={() => setRange(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {gatewayLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}

        {gatewayError && (
          <p className="text-xs text-destructive">{gatewayError.message}</p>
        )}

        {gatewayData && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Total Tokens</div>
                <div className="text-lg font-semibold">{(gatewayData.total_tokens ?? 0).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Gateway Cost</div>
                <div className="text-lg font-semibold">{formatDollars(gatewayData.total_cost ?? 0, 4)}</div>
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground/50">
              {dateRange.startDate} — {dateRange.endDate}
            </div>

            {gatewayData.sessions && gatewayData.sessions.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground font-medium">Sessions</div>
                {gatewayData.sessions.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-accent/50 text-xs"
                  >
                    <span className="truncate">{s.agent || s.id}</span>
                    <span className="text-muted-foreground flex-shrink-0 ml-2">
                      {(s.tokens ?? 0).toLocaleString()} tokens · {formatDollars(s.cost ?? 0, 4)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* By Model table */}
      {usage && usage.by_model.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="px-4 py-2 bg-muted/20 border-b border-border">
            <h3 className="text-sm font-medium">By Model</h3>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Model</th>
                <th className="text-right px-4 py-2 font-medium">Reqs</th>
                <th className="text-right px-4 py-2 font-medium">Raw</th>
                <th className="text-right px-4 py-2 font-medium">Billable</th>
              </tr>
            </thead>
            <tbody>
              {[...usage.by_model]
                .sort((a, b) => b.cost - a.cost)
                .map((m) => {
                  const modelRaw = m.cost / MARKUP;
                  return (
                    <tr key={m.model} className="border-b border-border/50 hover:bg-accent/30">
                      <td className="px-4 py-2 font-mono truncate max-w-[200px]" title={m.model}>
                        {shortModelName(m.model)}
                      </td>
                      <td className="px-4 py-2 text-right text-muted-foreground">
                        {m.requests.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                        {formatDollars(modelRaw, 4)}
                      </td>
                      <td className="px-4 py-2 text-right font-mono">
                        {formatDollars(m.cost, 4)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* Raw data */}
      <details className="group">
        <summary className="text-xs text-muted-foreground/60 cursor-pointer hover:text-muted-foreground">
          Raw billing data
        </summary>
        <pre className="mt-2 text-xs bg-muted/30 rounded-lg p-3 overflow-auto max-h-48">
          {JSON.stringify({ account, usage, gatewayData }, null, 2)}
        </pre>
      </details>
    </div>
  );
}
