"use client";

import { useState } from "react";
import {
  Loader2,
  RefreshCw,
  Radio,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useGatewayRpc, useGatewayRpcMutation } from "@/hooks/useGatewayRpc";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelStatus {
  name: string;
  label?: string;
  description?: string;
  configured?: boolean;
  enabled?: boolean;
  linked?: boolean;
  running?: boolean;
  connected?: boolean;
  mode?: string;
  lastConnect?: string;
  lastMessage?: string;
  lastStart?: string;
  lastProbe?: string;
  authAge?: string;
  publicKey?: string;
  credential?: string;
  audience?: string;
  baseUrl?: string;
  type?: string;
  [key: string]: unknown;
}

interface HealthResponse {
  type?: string;
  event?: string;
  payload?: { channels?: Record<string, unknown>; [key: string]: unknown };
  channels?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ChannelMeta {
  label: string;
  description: string;
  statusFields: string[];
  actions: Array<{ label: string; rpcMethod: string }>;
}

// ---------------------------------------------------------------------------
// Channel metadata map
// ---------------------------------------------------------------------------

const CHANNEL_META: Record<string, ChannelMeta> = {
  whatsapp: {
    label: "WhatsApp",
    description: "Link WhatsApp Web and monitor connection health.",
    statusFields: ["configured", "linked", "running", "connected", "lastConnect", "lastMessage", "authAge"],
    actions: [
      { label: "Show QR", rpcMethod: "channels.whatsapp.qr" },
      { label: "Relink", rpcMethod: "channels.whatsapp.relink" },
      { label: "Wait for scan", rpcMethod: "channels.whatsapp.waitForScan" },
      { label: "Logout", rpcMethod: "channels.whatsapp.logout" },
    ],
  },
  telegram: {
    label: "Telegram",
    description: "Bot status and channel configuration.",
    statusFields: ["configured", "running", "mode", "lastStart", "lastProbe"],
    actions: [{ label: "Probe", rpcMethod: "channels.telegram.probe" }],
  },
  discord: {
    label: "Discord",
    description: "Bot status and channel configuration.",
    statusFields: ["configured", "running", "lastStart", "lastProbe"],
    actions: [{ label: "Probe", rpcMethod: "channels.discord.probe" }],
  },
  googlechat: {
    label: "Google Chat",
    description: "Chat API webhook status and channel configuration.",
    statusFields: ["configured", "running", "credential", "audience", "lastStart", "lastProbe"],
    actions: [{ label: "Probe", rpcMethod: "channels.googlechat.probe" }],
  },
  slack: {
    label: "Slack",
    description: "Socket mode status and channel configuration.",
    statusFields: ["configured", "running", "lastStart", "lastProbe"],
    actions: [{ label: "Probe", rpcMethod: "channels.slack.probe" }],
  },
  signal: {
    label: "Signal",
    description: "signal-cli status and channel configuration.",
    statusFields: ["configured", "running", "baseUrl", "lastStart", "lastProbe"],
    actions: [{ label: "Probe", rpcMethod: "channels.signal.probe" }],
  },
  imessage: {
    label: "iMessage",
    description: "macOS bridge status and channel configuration.",
    statusFields: ["configured", "running", "lastStart", "lastProbe"],
    actions: [{ label: "Probe", rpcMethod: "channels.imessage.probe" }],
  },
  nostr: {
    label: "Nostr",
    description: "Decentralized DMs via Nostr relays (NIP-04).",
    statusFields: ["configured", "running", "publicKey", "lastStart"],
    actions: [{ label: "Refresh", rpcMethod: "channels.nostr.refresh" }],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  configured: "Configured",
  linked: "Linked",
  running: "Running",
  connected: "Connected",
  mode: "Mode",
  lastConnect: "Last connect",
  lastMessage: "Last message",
  lastStart: "Last start",
  lastProbe: "Last probe",
  authAge: "Auth age",
  publicKey: "Public key",
  credential: "Credential",
  audience: "Audience",
  baseUrl: "Base URL",
};

function formatStatusValue(key: string, value: unknown): { text: string; variant: "yes" | "no" | "muted" | "text" } {
  if (value === true) return { text: "Yes", variant: "yes" };
  if (value === false) return { text: "No", variant: "no" };
  if (value === null || value === undefined || value === "") return { text: "n/a", variant: "muted" };
  return { text: String(value), variant: "text" };
}

function getMetaForChannel(ch: ChannelStatus): ChannelMeta {
  const key = ch.name.toLowerCase().replace(/[^a-z]/g, "");
  if (CHANNEL_META[key]) return CHANNEL_META[key];
  // Generic fallback for unknown channel types
  const knownBoolFields = ["configured", "running", "enabled"];
  const extraFields = Object.keys(ch).filter(
    (k) => !["name", "label", "description", "type", "enabled"].includes(k) && ch[k] !== undefined,
  );
  return {
    label: ch.label || ch.name,
    description: ch.description || `${ch.type || ch.name} channel.`,
    statusFields: [...knownBoolFields.filter((f) => f in ch), ...extraFields.filter((f) => !knownBoolFields.includes(f))],
    actions: [{ label: "Probe", rpcMethod: `channels.${ch.name}.probe` }],
  };
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ChannelsPanel() {
  const { data, error, isLoading, mutate } = useGatewayRpc<ChannelStatus[]>("channels.status");
  const { data: healthData } = useGatewayRpc<HealthResponse>("health", undefined, { refreshInterval: 10000 });

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

  const rpcChannels: ChannelStatus[] = Array.isArray(data) ? data : [];

  // Build a map of RPC channel data keyed by normalized name
  const rpcMap = new Map<string, ChannelStatus>();
  for (const ch of rpcChannels) {
    rpcMap.set(ch.name.toLowerCase().replace(/[^a-z]/g, ""), ch);
  }

  // Always show all channels from CHANNEL_META, merging in RPC data if available.
  // Then append any extra channels from RPC that aren't in the meta map.
  const channels: ChannelStatus[] = [
    ...Object.entries(CHANNEL_META).map(([key, meta]) => {
      const rpc = rpcMap.get(key);
      return rpc
        ? rpc
        : { name: key, configured: false, enabled: false, running: false };
    }),
    ...rpcChannels.filter(
      (ch) => !CHANNEL_META[ch.name.toLowerCase().replace(/[^a-z]/g, "")],
    ),
  ];

  // Extract channel health from the health RPC
  const channelHealth = (() => {
    if (!healthData) return null;
    if (healthData.type === "event" && healthData.payload?.channels) {
      return healthData.payload.channels;
    }
    return healthData.channels ?? null;
  })();

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Channels</h2>
          <p className="text-xs text-muted-foreground">Manage channels and settings.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Channel cards */}
      <div className="space-y-4">
        {channels.map((ch) => (
          <ChannelCard key={ch.name} channel={ch} onRefresh={mutate} />
        ))}
      </div>

      {/* Channel Health */}
      {channelHealth && <ChannelHealthSection data={channelHealth} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel card
// ---------------------------------------------------------------------------

function ChannelCard({
  channel,
  onRefresh,
}: {
  channel: ChannelStatus;
  onRefresh: () => void;
}) {
  const callRpc = useGatewayRpcMutation();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const meta = getMetaForChannel(channel);

  const handleAction = async (rpcMethod: string) => {
    setLoadingAction(rpcMethod);
    try {
      await callRpc(rpcMethod);
      onRefresh();
    } catch (err) {
      console.error(`Action ${rpcMethod} failed:`, err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleToggle = async () => {
    const method = channel.enabled ? "channels.disable" : "channels.enable";
    setLoadingAction(method);
    try {
      await callRpc(method, { name: channel.name });
      onRefresh();
    } catch (err) {
      console.error("Failed to toggle channel:", err);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Channel header */}
      <div className="flex items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-2">
          <Radio className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">{meta.label}</h3>
            <p className="text-xs text-muted-foreground">{meta.description}</p>
          </div>
        </div>
        <Button
          variant={channel.enabled ? "outline" : "default"}
          size="sm"
          onClick={handleToggle}
          disabled={loadingAction !== null}
        >
          {loadingAction === "channels.enable" || loadingAction === "channels.disable" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : channel.enabled ? (
            "Disable"
          ) : (
            "Enable"
          )}
        </Button>
      </div>

      {/* Status grid */}
      <div className="px-4 pb-3">
        <div className="rounded-md border border-border/60 bg-muted/10 p-3">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1.5">
            {meta.statusFields.map((field) => {
              const { text, variant } = formatStatusValue(field, channel[field]);
              return (
                <div key={field} className="flex items-center gap-1.5 text-xs">
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

      {/* Action buttons */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-4">
        {meta.actions.map((action) => (
          <Button
            key={action.rpcMethod}
            variant="outline"
            size="sm"
            onClick={() => handleAction(action.rpcMethod)}
            disabled={loadingAction !== null}
          >
            {loadingAction === action.rpcMethod ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : null}
            {action.label}
          </Button>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={loadingAction !== null}
        >
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ text, variant }: { text: string; variant: "yes" | "no" | "muted" | "text" }) {
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

// ---------------------------------------------------------------------------
// Channel health section
// ---------------------------------------------------------------------------

function ChannelHealthSection({ data }: { data: Record<string, unknown> }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full p-3 text-left hover:bg-muted/20 transition-colors"
      >
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Channel health
        </span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>
      {open && (
        <pre className="px-3 pb-3 text-xs bg-muted/10 overflow-auto max-h-64">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}
