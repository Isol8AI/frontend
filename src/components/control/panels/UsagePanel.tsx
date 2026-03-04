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

// Gateway sessions.list types
interface GatewaySession {
  key: string;
  agentId?: string;
  model?: string;
  label?: string;
  displayName?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  updatedAt?: number | null;
  [key: string]: unknown;
}

interface SessionsListResponse {
  sessions?: GatewaySession[];
  count?: number;
  [key: string]: unknown;
}

// =============================================================================
// Helpers
// =============================================================================

/** Shorten a model ID like "us.anthropic.claude-3-5-sonnet-20241022-v2:0" → "claude-3.5-sonnet" */
function shortModelName(model: string): string {
  const parts = model.split(".");
  const last = parts[parts.length - 1] || model;
  return last.replace(/-\d{8}.*$/, "").replace(/:.*$/, "");
}

function formatDollars(amount: number, decimals = 2): string {
  return `$${amount.toFixed(decimals)}`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

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

  // --- Gateway session data (real token counts from OpenClaw) ---
  const {
    data: sessionsData,
    error: sessionsError,
    isLoading: sessionsLoading,
    mutate: mutateSessions,
  } = useGatewayRpc<SessionsListResponse>("sessions.list");

  // Aggregate session token data
  const sessionStats = useMemo(() => {
    const sessions = sessionsData?.sessions ?? [];
    let totalInput = 0;
    let totalOutput = 0;
    let totalTokens = 0;
    const byAgent: Record<string, { input: number; output: number; total: number; sessions: number }> = {};

    for (const s of sessions) {
      const inp = s.inputTokens ?? 0;
      const out = s.outputTokens ?? 0;
      const tot = s.totalTokens ?? (inp + out);
      totalInput += inp;
      totalOutput += out;
      totalTokens += tot;

      const agentKey = s.agentId || s.displayName || s.label || s.key;
      if (!byAgent[agentKey]) {
        byAgent[agentKey] = { input: 0, output: 0, total: 0, sessions: 0 };
      }
      byAgent[agentKey].input += inp;
      byAgent[agentKey].output += out;
      byAgent[agentKey].total += tot;
      byAgent[agentKey].sessions += 1;
    }

    return {
      totalInput,
      totalOutput,
      totalTokens,
      sessionCount: sessions.length,
      byAgent: Object.entries(byAgent)
        .sort(([, a], [, b]) => b.total - a.total),
    };
  }, [sessionsData]);

  // --- Derived values ---
  const period = account?.current_period;
  const totalBillable = usage?.total_cost ?? 0;
  const rawCost = totalBillable / MARKUP;
  const platformFee = totalBillable - rawCost;
  const budgetPercent = period?.percent_used ?? 0;

  const handleRefresh = useCallback(() => {
    fetchBilling();
    mutateSessions();
  }, [fetchBilling, mutateSessions]);

  // --- Loading state ---
  if (billingLoading && sessionsLoading) {
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

      {/* Cost Breakdown (from REST billing API) */}
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
          {totalBillable === 0 && (
            <div className="text-xs text-yellow-600 bg-yellow-500/10 px-2 py-1.5 rounded">
              No billing data recorded yet. Token counts from the gateway may not be reaching the billing pipeline.
            </div>
          )}
          <div className="text-xs text-muted-foreground/60 pt-1">
            {usage.total_requests.toLocaleString()} total requests
          </div>
        </div>
      )}

      {/* Gateway Token Usage (from sessions.list) */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-medium">Gateway Token Usage</h3>

        {sessionsLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}

        {sessionsError && (
          <p className="text-xs text-destructive">{sessionsError.message}</p>
        )}

        {!sessionsLoading && !sessionsError && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Input</div>
                <div className="text-lg font-semibold">{formatTokens(sessionStats.totalInput)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Output</div>
                <div className="text-lg font-semibold">{formatTokens(sessionStats.totalOutput)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">Total</div>
                <div className="text-lg font-semibold">{formatTokens(sessionStats.totalTokens)}</div>
              </div>
            </div>

            <div className="text-[10px] text-muted-foreground/50">
              {sessionStats.sessionCount} sessions
            </div>

            {sessionStats.byAgent.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground font-medium">By Agent</div>
                {sessionStats.byAgent.map(([agent, stats]) => (
                  <div
                    key={agent}
                    className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-accent/50 text-xs"
                  >
                    <span className="truncate">{agent}</span>
                    <span className="text-muted-foreground flex-shrink-0 ml-2">
                      {formatTokens(stats.total)} tokens · {stats.sessions} sessions
                    </span>
                  </div>
                ))}
              </div>
            )}

            {sessionStats.totalTokens === 0 && sessionStats.sessionCount === 0 && (
              <div className="text-xs text-muted-foreground/60">
                No session data. Start a conversation to see token usage.
              </div>
            )}
          </>
        )}
      </div>

      {/* By Model table (from REST billing API) */}
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
          Raw data
        </summary>
        <pre className="mt-2 text-xs bg-muted/30 rounded-lg p-3 overflow-auto max-h-48">
          {JSON.stringify({ account, usage, sessionsData }, null, 2)}
        </pre>
      </details>
    </div>
  );
}
