"use client";

import { useState, useCallback } from "react";
import {
  Loader2,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  QrCode,
  Scan,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGatewayRpc, useGatewayRpcMutation } from "@/hooks/useGatewayRpc";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChannelDef {
  id: string;
  label: string;
  fields: { key: string; label: string; placeholder: string; sensitive: boolean; help: string }[];
}

interface ConfigSnapshot {
  path: string;
  exists: boolean;
  raw: string | null;
  config: Record<string, unknown>;
  hash?: string;
  valid: boolean;
}

interface WebLoginResult {
  message?: string;
  qrDataUrl?: string;
  connected?: boolean;
}

// ---------------------------------------------------------------------------
// Channel definitions — only Telegram, Discord, WhatsApp
// ---------------------------------------------------------------------------

const CHANNELS: ChannelDef[] = [
  {
    id: "telegram",
    label: "Telegram",
    fields: [
      {
        key: "botToken",
        label: "Bot Token",
        placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
        sensitive: true,
        help: "Get from @BotFather on Telegram",
      },
    ],
  },
  {
    id: "discord",
    label: "Discord",
    fields: [
      {
        key: "token",
        label: "Bot Token",
        placeholder: "your-discord-bot-token",
        sensitive: true,
        help: "From Discord Developer Portal \u2192 Bot \u2192 Token",
      },
    ],
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    fields: [], // WhatsApp uses QR pairing, no credential fields
  },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ChannelSetupStep({ onComplete }: { onComplete: () => void }) {
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);
  const [connectedChannels, setConnectedChannels] = useState<Set<string>>(new Set());
  const [fieldValues, setFieldValues] = useState<Record<string, Record<string, string>>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  // WhatsApp state
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [waMessage, setWaMessage] = useState<string | null>(null);
  const [waBusy, setWaBusy] = useState<string | null>(null);

  const { data: configData } = useGatewayRpc<ConfigSnapshot>("config.get");
  const callRpc = useGatewayRpcMutation();

  const hasConnected = connectedChannels.size > 0;

  // ---- Toggle accordion ----
  const toggleChannel = (id: string) => {
    setExpandedChannel((prev) => (prev === id ? null : id));
  };

  // ---- Field value helpers ----
  const getFieldValue = useCallback((channelId: string, fieldKey: string): string => {
    return fieldValues[channelId]?.[fieldKey] ?? "";
  }, [fieldValues]);

  const setFieldValue = (channelId: string, fieldKey: string, value: string) => {
    setFieldValues((prev) => ({
      ...prev,
      [channelId]: { ...prev[channelId], [fieldKey]: value },
    }));
    // Clear error on edit
    setErrors((prev) => {
      const next = { ...prev };
      delete next[channelId];
      return next;
    });
  };

  // ---- Connect channel (Telegram/Discord) ----
  const handleConnect = useCallback(
    async (channel: ChannelDef) => {
      const snapshot = configData as ConfigSnapshot | undefined;
      if (!snapshot?.hash) {
        setErrors((prev) => ({ ...prev, [channel.id]: "Config not loaded yet. Please wait." }));
        return;
      }

      // Validate all fields are filled
      for (const field of channel.fields) {
        const val = getFieldValue(channel.id, field.key);
        if (!val.trim()) {
          setErrors((prev) => ({ ...prev, [channel.id]: `${field.label} is required` }));
          return;
        }
      }

      setSaving(channel.id);
      setErrors((prev) => {
        const next = { ...prev };
        delete next[channel.id];
        return next;
      });

      try {
        // Build channel config patch
        const channelPatch: Record<string, string> = {};
        for (const field of channel.fields) {
          channelPatch[field.key] = getFieldValue(channel.id, field.key);
        }

        await callRpc("config.patch", {
          raw: JSON.stringify({ channels: { [channel.id]: channelPatch } }),
          baseHash: snapshot.hash,
        });

        // Wait for gateway restart, then probe
        await new Promise((r) => setTimeout(r, 3000));
        const status = await callRpc<{
          channelAccounts: Record<string, { connected?: boolean }[]>;
        }>("channels.status", { probe: true, timeoutMs: 8000 });

        const accounts = status?.channelAccounts?.[channel.id];
        const isConnected = accounts?.[0]?.connected === true;

        if (isConnected) {
          setConnectedChannels((prev) => new Set([...prev, channel.id]));
          setExpandedChannel(null); // auto-collapse
        } else {
          setErrors((prev) => ({
            ...prev,
            [channel.id]: "Could not verify connection. Check your token and try again.",
          }));
        }
      } catch (err) {
        setErrors((prev) => ({
          ...prev,
          [channel.id]: err instanceof Error ? err.message : String(err),
        }));
      } finally {
        setSaving(null);
      }
    },
    [callRpc, configData, getFieldValue],
  );

  // ---- WhatsApp QR flow ----
  const handleWhatsAppQr = async () => {
    setWaBusy("qr");
    setErrors((prev) => {
      const next = { ...prev };
      delete next["whatsapp"];
      return next;
    });
    try {
      const res = await callRpc<WebLoginResult>("web.login.start", {
        force: false,
        timeoutMs: 30000,
      });
      setQrDataUrl(res.qrDataUrl ?? null);
      setWaMessage(res.message ?? null);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        whatsapp: err instanceof Error ? err.message : String(err),
      }));
      setQrDataUrl(null);
    } finally {
      setWaBusy(null);
    }
  };

  const handleWhatsAppWait = async () => {
    setWaBusy("wait");
    setErrors((prev) => {
      const next = { ...prev };
      delete next["whatsapp"];
      return next;
    });
    try {
      const res = await callRpc<WebLoginResult>("web.login.wait", {
        timeoutMs: 120000,
      });
      if (res.connected) {
        setQrDataUrl(null);
        setWaMessage(null);
        setConnectedChannels((prev) => new Set([...prev, "whatsapp"]));
        setExpandedChannel(null); // auto-collapse
      } else {
        setWaMessage(res.message ?? "Waiting timed out. Try again.");
      }
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        whatsapp: err instanceof Error ? err.message : String(err),
      }));
    } finally {
      setWaBusy(null);
    }
  };

  // ---- Render ----
  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <h2 className="text-lg font-semibold">Connect your channels</h2>
        <p className="text-sm text-muted-foreground">
          Optionally connect messaging platforms to your agent.
        </p>
      </div>

      {/* Accordion list */}
      <div className="space-y-2">
        {CHANNELS.map((channel) => {
          const isExpanded = expandedChannel === channel.id;
          const isConnected = connectedChannels.has(channel.id);
          const isSaving = saving === channel.id;
          const error = errors[channel.id];
          const isWhatsApp = channel.id === "whatsapp";

          return (
            <div
              key={channel.id}
              className="rounded-lg border border-border overflow-hidden"
            >
              {/* Accordion header */}
              <button
                type="button"
                onClick={() => !isConnected && toggleChannel(channel.id)}
                disabled={isConnected}
                className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors disabled:cursor-default"
              >
                <span className="text-sm font-medium">{channel.label}</span>
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-green-600 font-medium">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Connected
                    </span>
                  ) : isExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
              </button>

              {/* Accordion body */}
              {isExpanded && !isConnected && (
                <div className="px-4 pb-4 space-y-3">
                  {/* Credential fields (Telegram/Discord) */}
                  {channel.fields.map((field) => (
                    <div key={field.key} className="space-y-1">
                      <label className="text-xs font-medium">{field.label}</label>
                      <div className="relative">
                        <input
                          type={field.sensitive && !showSecrets[`${channel.id}.${field.key}`] ? "password" : "text"}
                          value={getFieldValue(channel.id, field.key)}
                          placeholder={field.placeholder}
                          onChange={(e) => setFieldValue(channel.id, field.key, e.target.value)}
                          disabled={isSaving}
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-xs font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                        />
                        {field.sensitive && (
                          <button
                            type="button"
                            onClick={() =>
                              setShowSecrets((prev) => ({
                                ...prev,
                                [`${channel.id}.${field.key}`]: !prev[`${channel.id}.${field.key}`],
                              }))
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showSecrets[`${channel.id}.${field.key}`] ? (
                              <EyeOff className="h-3 w-3" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                          </button>
                        )}
                      </div>
                      {field.help && (
                        <p className="text-[10px] text-muted-foreground">{field.help}</p>
                      )}
                    </div>
                  ))}

                  {/* WhatsApp QR flow */}
                  {isWhatsApp && (
                    <div className="space-y-3">
                      <p className="text-xs text-muted-foreground">
                        Scan a QR code with WhatsApp on your phone to pair.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleWhatsAppQr}
                          disabled={waBusy !== null}
                        >
                          {waBusy === "qr" ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <QrCode className="h-3 w-3 mr-1" />
                          )}
                          Show QR Code
                        </Button>
                        {qrDataUrl && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleWhatsAppWait}
                            disabled={waBusy !== null}
                          >
                            {waBusy === "wait" ? (
                              <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            ) : (
                              <Scan className="h-3 w-3 mr-1" />
                            )}
                            I scanned it
                          </Button>
                        )}
                      </div>
                      {qrDataUrl && (
                        <div className="flex justify-center">
                          <img
                            src={qrDataUrl}
                            alt="WhatsApp QR Code"
                            className="w-48 h-48 rounded border border-border"
                          />
                        </div>
                      )}
                      {waMessage && (
                        <p className="text-xs text-muted-foreground bg-muted/20 rounded p-2">
                          {waMessage}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Error */}
                  {error && (
                    <p className="text-xs text-red-500">{error}</p>
                  )}

                  {/* Connect button (Telegram/Discord only) */}
                  {!isWhatsApp && (
                    <Button
                      size="sm"
                      onClick={() => handleConnect(channel)}
                      disabled={isSaving}
                    >
                      {isSaving ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : null}
                      Connect
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Skip / Continue */}
      <div className="flex items-center justify-between pt-2">
        <button
          type="button"
          onClick={onComplete}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Skip
        </button>
        <Button onClick={onComplete} disabled={!hasConnected}>
          Continue
        </Button>
      </div>
    </div>
  );
}
