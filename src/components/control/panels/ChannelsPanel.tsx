"use client";

import { useState } from "react";
import {
  Loader2,
  RefreshCw,
  Radio,
  CheckCircle2,
  XCircle,
  MinusCircle,
  QrCode,
  LogOut,
  Scan,
  Link2,
  AlertCircle,
} from "lucide-react";
import { useGatewayRpc, useGatewayRpcMutation } from "@/hooks/useGatewayRpc";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types — matching OpenClaw's ChannelsStatusSnapshot
// ---------------------------------------------------------------------------

interface ChannelAccountSnapshot {
  accountId: string;
  name?: string | null;
  enabled?: boolean | null;
  configured?: boolean | null;
  linked?: boolean | null;
  running?: boolean | null;
  connected?: boolean | null;
  reconnectAttempts?: number | null;
  lastConnectedAt?: number | null;
  lastError?: string | null;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  lastProbeAt?: number | null;
  mode?: string | null;
  dmPolicy?: string | null;
  tokenSource?: string | null;
  botTokenSource?: string | null;
  webhookUrl?: string | null;
  baseUrl?: string | null;
  [key: string]: unknown;
}

interface ChannelsStatusSnapshot {
  ts: number;
  channelOrder: string[];
  channelLabels: Record<string, string>;
  channelDetailLabels?: Record<string, string>;
  channels: Record<string, unknown>;
  channelAccounts: Record<string, ChannelAccountSnapshot[]>;
  channelDefaultAccountId: Record<string, string>;
}

interface WebLoginResult {
  message?: string;
  qrDataUrl?: string;
  connected?: boolean;
}

// ---------------------------------------------------------------------------
// Status fields to show per channel (fallback if channel is unknown)
// ---------------------------------------------------------------------------

const DEFAULT_STATUS_FIELDS = [
  "configured",
  "linked",
  "running",
  "connected",
] as const;

const EXTENDED_STATUS_FIELDS = [
  ...DEFAULT_STATUS_FIELDS,
  "mode",
  "lastConnectedAt",
  "lastInboundAt",
  "lastOutboundAt",
  "lastError",
] as const;

const STATUS_LABELS: Record<string, string> = {
  configured: "Configured",
  linked: "Linked",
  running: "Running",
  connected: "Connected",
  enabled: "Enabled",
  mode: "Mode",
  dmPolicy: "DM policy",
  lastConnectedAt: "Last connected",
  lastInboundAt: "Last inbound",
  lastOutboundAt: "Last outbound",
  lastStartAt: "Last start",
  lastStopAt: "Last stop",
  lastProbeAt: "Last probe",
  lastError: "Last error",
  reconnectAttempts: "Reconnect attempts",
  tokenSource: "Token source",
  botTokenSource: "Bot token",
  webhookUrl: "Webhook URL",
  baseUrl: "Base URL",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTimestamp(ts: number | null | undefined): string {
  if (!ts) return "n/a";
  const d = new Date(ts);
  const now = Date.now();
  const diffMs = now - ts;
  if (diffMs < 60_000) return "just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return d.toLocaleDateString();
}

function formatValue(
  key: string,
  value: unknown,
): { text: string; variant: "yes" | "no" | "muted" | "text" | "error" } {
  if (value === true) return { text: "Yes", variant: "yes" };
  if (value === false) return { text: "No", variant: "no" };
  if (value === null || value === undefined || value === "")
    return { text: "n/a", variant: "muted" };
  if (key === "lastError" && typeof value === "string")
    return { text: value, variant: "error" };
  if (key.startsWith("last") && typeof value === "number")
    return { text: formatTimestamp(value), variant: "text" };
  return { text: String(value), variant: "text" };
}

/** Is this a WhatsApp-type channel (uses QR login)? */
function isWhatsAppChannel(channelId: string): boolean {
  return channelId === "whatsapp" || channelId === "web";
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ChannelsPanel() {
  const { data, error, isLoading, mutate } =
    useGatewayRpc<ChannelsStatusSnapshot>("channels.status");
  const callRpc = useGatewayRpcMutation();

  // WhatsApp QR login state
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // ---- WhatsApp actions ----

  const handleShowQr = async (force: boolean) => {
    const label = force ? "relink" : "qr";
    setActionBusy(label);
    setActionError(null);
    setLoginMessage(null);
    try {
      const res = await callRpc<WebLoginResult>("web.login.start", {
        force,
        timeoutMs: 30000,
      });
      setQrDataUrl(res.qrDataUrl ?? null);
      setLoginMessage(res.message ?? null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setQrDataUrl(null);
    } finally {
      setActionBusy(null);
    }
  };

  const handleWaitForScan = async () => {
    setActionBusy("wait");
    setActionError(null);
    try {
      const res = await callRpc<WebLoginResult>("web.login.wait", {
        timeoutMs: 120000,
      });
      setLoginMessage(res.message ?? null);
      if (res.connected) {
        setQrDataUrl(null);
        setLoginMessage("Connected!");
        mutate();
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(null);
    }
  };

  const handleLogout = async (channel: string) => {
    setActionBusy(`logout-${channel}`);
    setActionError(null);
    try {
      await callRpc("channels.logout", { channel });
      if (isWhatsAppChannel(channel)) {
        setQrDataUrl(null);
        setLoginMessage("Logged out.");
      }
      mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(null);
    }
  };

  const handleProbe = async () => {
    setActionBusy("probe");
    setActionError(null);
    try {
      await callRpc("channels.status", { probe: true, timeoutMs: 8000 });
      mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionBusy(null);
    }
  };

  // ---- Loading / Error states ----

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

  // Parse response — handle both snapshot object and possible null
  const snapshot = data as ChannelsStatusSnapshot | null | undefined;
  // Fallback to default channel list when gateway returns empty channelOrder
  // (matches OpenClaw UI behavior in resolveChannelOrder)
  const DEFAULT_CHANNELS = [
    "whatsapp",
    "telegram",
    "discord",
    "googlechat",
    "slack",
    "signal",
    "imessage",
    "nostr",
  ];
  const DEFAULT_LABELS: Record<string, string> = {
    whatsapp: "WhatsApp",
    telegram: "Telegram",
    discord: "Discord",
    googlechat: "Google Chat",
    slack: "Slack",
    signal: "Signal",
    imessage: "iMessage",
    nostr: "Nostr",
  };
  const channelOrder =
    snapshot?.channelOrder?.length
      ? snapshot.channelOrder
      : DEFAULT_CHANNELS;
  const channelLabels = {
    ...DEFAULT_LABELS,
    ...(snapshot?.channelLabels ?? {}),
  };
  const channelAccounts = snapshot?.channelAccounts ?? {};
  const channelDetailLabels = snapshot?.channelDetailLabels ?? {};

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Channels</h2>
          <p className="text-xs text-muted-foreground">
            Manage communication channels and connections.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleProbe}
            disabled={actionBusy !== null}
          >
            {actionBusy === "probe" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : null}
            Probe All
          </Button>
          <Button variant="ghost" size="sm" onClick={() => mutate()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Action feedback */}
      {actionError && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive">{actionError}</p>
          <button
            className="ml-auto text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setActionError(null)}
          >
            dismiss
          </button>
        </div>
      )}

      {/* Channel cards */}

      <div className="space-y-4">
        {channelOrder.map((channelId) => {
          const accounts = channelAccounts[channelId] ?? [];
          const account = accounts[0]; // Show primary account
          const label = channelLabels[channelId] ?? channelId;
          const detail = channelDetailLabels[channelId];
          const isWa = isWhatsAppChannel(channelId);

          return (
            <ChannelCard
              key={channelId}
              channelId={channelId}
              label={label}
              detail={detail}
              account={account}
              isWhatsApp={isWa}
              qrDataUrl={isWa ? qrDataUrl : null}
              loginMessage={isWa ? loginMessage : null}
              actionBusy={actionBusy}
              onShowQr={() => handleShowQr(false)}
              onRelink={() => handleShowQr(true)}
              onWaitForScan={handleWaitForScan}
              onLogout={() => handleLogout(channelId)}
            />
          );
        })}
      </div>

      {/* Raw snapshot for debugging */}
      {snapshot && (
        <details className="text-xs">
          <summary className="text-muted-foreground cursor-pointer hover:text-foreground">
            Raw gateway response
          </summary>
          <pre className="mt-2 p-3 rounded-md bg-muted/30 border border-border/40 overflow-auto max-h-60 text-[10px] leading-tight">
            {JSON.stringify(snapshot, null, 2)}
          </pre>
        </details>
      )}
      {!snapshot && !isLoading && !error && (
        <p className="text-xs text-muted-foreground">
          No response from gateway. WebSocket may not be connected.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel card
// ---------------------------------------------------------------------------

function ChannelCard({
  channelId,
  label,
  detail,
  account,
  isWhatsApp,
  qrDataUrl,
  loginMessage,
  actionBusy,
  onShowQr,
  onRelink,
  onWaitForScan,
  onLogout,
}: {
  channelId: string;
  label: string;
  detail?: string;
  account: ChannelAccountSnapshot | undefined;
  isWhatsApp: boolean;
  qrDataUrl: string | null;
  loginMessage: string | null;
  actionBusy: string | null;
  onShowQr: () => void;
  onRelink: () => void;
  onWaitForScan: () => void;
  onLogout: () => void;
}) {
  const busy = actionBusy !== null;

  // Pick fields to display
  const fields = account
    ? (EXTENDED_STATUS_FIELDS as readonly string[]).filter(
        (f) => account[f] !== undefined && account[f] !== null,
      )
    : [];

  // Always show core fields even if undefined
  const coreFields = (DEFAULT_STATUS_FIELDS as readonly string[]).filter(
    (f) => !fields.includes(f),
  );

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">{label}</h3>
            {detail && (
              <p className="text-xs text-muted-foreground">{detail}</p>
            )}
          </div>
        </div>
        {account?.connected && (
          <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
            <CheckCircle2 className="h-3 w-3" />
            Connected
          </span>
        )}
      </div>

      {/* Status grid */}
      {account ? (
        <div className="px-4 pb-3">
          <div className="rounded-md border border-border/60 bg-muted/10 p-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5">
              {[...coreFields, ...fields].map((field) => {
                const { text, variant } = formatValue(
                  field,
                  account[field],
                );
                return (
                  <div
                    key={field}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <span className="text-muted-foreground">
                      {STATUS_LABELS[field] || field}:
                    </span>
                    <StatusBadge text={text} variant={variant} />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <div className="px-4 pb-3">
          <p className="text-xs text-muted-foreground">
            Not configured. No account data available.
          </p>
        </div>
      )}

      {/* WhatsApp QR code display */}
      {isWhatsApp && qrDataUrl && (
        <div className="px-4 pb-3">
          <div className="rounded-md border border-border/60 bg-background p-4 flex flex-col items-center gap-3">
            <img
              src={qrDataUrl}
              alt="WhatsApp QR Code"
              className="w-48 h-48 rounded"
            />
            <p className="text-xs text-muted-foreground text-center">
              Scan this QR code with WhatsApp on your phone
            </p>
          </div>
        </div>
      )}

      {/* WhatsApp login message */}
      {isWhatsApp && loginMessage && (
        <div className="px-4 pb-3">
          <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2">
            {loginMessage}
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
        {isWhatsApp ? (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={onShowQr}
              disabled={busy}
            >
              {actionBusy === "qr" ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <QrCode className="h-3 w-3 mr-1" />
              )}
              Show QR
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onRelink}
              disabled={busy}
            >
              {actionBusy === "relink" ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Link2 className="h-3 w-3 mr-1" />
              )}
              Relink
            </Button>
            {qrDataUrl && (
              <Button
                variant="outline"
                size="sm"
                onClick={onWaitForScan}
                disabled={busy}
              >
                {actionBusy === "wait" ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Scan className="h-3 w-3 mr-1" />
                )}
                Wait for scan
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={onLogout}
              disabled={busy}
            >
              {actionBusy?.startsWith("logout") ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <LogOut className="h-3 w-3 mr-1" />
              )}
              Logout
            </Button>
          </>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            disabled={busy}
          >
            {actionBusy?.startsWith("logout") ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <LogOut className="h-3 w-3 mr-1" />
            )}
            Logout
          </Button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({
  text,
  variant,
}: {
  text: string;
  variant: "yes" | "no" | "muted" | "text" | "error";
}) {
  if (variant === "yes") {
    return (
      <span className="inline-flex items-center gap-0.5 text-green-600">
        <CheckCircle2 className="h-3 w-3" />
        <span className="font-medium">{text}</span>
      </span>
    );
  }
  if (variant === "no") {
    return (
      <span className="inline-flex items-center gap-0.5 text-red-500">
        <XCircle className="h-3 w-3" />
        <span className="font-medium">{text}</span>
      </span>
    );
  }
  if (variant === "error") {
    return (
      <span className="text-red-500 font-medium truncate max-w-[200px]">
        {text}
      </span>
    );
  }
  if (variant === "muted") {
    return (
      <span className="inline-flex items-center gap-0.5 text-muted-foreground/50">
        <MinusCircle className="h-3 w-3" />
        <span>{text}</span>
      </span>
    );
  }
  return <span className="font-medium truncate max-w-[140px]">{text}</span>;
}
