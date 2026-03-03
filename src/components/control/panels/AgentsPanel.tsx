"use client";

import { useState, useCallback } from "react";
import {
  Loader2,
  RefreshCw,
  Bot,
  FileText,
  Wrench,
  Sparkles,
  User,
  Save,
  AlertCircle,
  FileWarning,
} from "lucide-react";
import { useGatewayRpc, useGatewayRpcMutation } from "@/hooks/useGatewayRpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SkillsPanel } from "./SkillsPanel";

type AgentTab = "overview" | "files" | "tools" | "skills";

interface AgentIdentity {
  name?: string;
  theme?: string;
  emoji?: string;
  avatar?: string;
}

interface AgentEntry {
  id: string;
  name?: string;
  identity?: AgentIdentity;
  model?: string;
}

interface ModelCatalogEntry {
  alias?: string;
}

interface ConfigSnapshot {
  path: string;
  exists: boolean;
  raw: string | null;
  config: ConfigInner;
  hash?: string;
  valid: boolean;
}

interface AgentConfigEntry {
  id: string;
  model?: string | { primary?: string; fallbacks?: string[] };
  [key: string]: unknown;
}

interface ConfigInner {
  agents?: {
    defaults?: {
      models?: Record<string, ModelCatalogEntry>;
      model?: string | { primary?: string };
    };
    list?: AgentConfigEntry[];
  };
  [key: string]: unknown;
}

interface AgentsListResponse {
  defaultId?: string;
  mainKey?: string;
  scope?: string;
  agents?: AgentEntry[];
}

// --- File browser types ---

interface AgentFileEntry {
  name: string;
  path: string;
  missing: boolean;
  size?: number;
  updatedAtMs?: number;
}

interface AgentFilesResponse {
  agentId: string;
  workspace: string;
  files: AgentFileEntry[];
}

interface AgentFileContent {
  agentId: string;
  file: AgentFileEntry & { content?: string };
}

// --- Tools catalog types ---

interface ToolEntry {
  name: string;
  description?: string;
  profile?: string;
  category?: string;
  [key: string]: unknown;
}

interface ToolsCatalogResponse {
  tools?: ToolEntry[];
  profiles?: Record<string, unknown>;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------

export function AgentsPanel() {
  const { data: rawData, error, isLoading, mutate } = useGatewayRpc<AgentsListResponse>("agents.list");
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<AgentTab>("overview");

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

  // Handle both array and object response formats
  const data = rawData as AgentsListResponse | AgentEntry[] | undefined;
  const agents: AgentEntry[] = Array.isArray(data)
    ? data
    : (data as AgentsListResponse)?.agents ?? [];
  const defaultId = !Array.isArray(data) ? (data as AgentsListResponse)?.defaultId : undefined;

  const current = selectedAgent || agents[0]?.id;

  const TABS: { id: AgentTab; label: string; icon: typeof Bot }[] = [
    { id: "overview", label: "Overview", icon: User },
    { id: "files", label: "Files", icon: FileText },
    { id: "tools", label: "Tools", icon: Wrench },
    { id: "skills", label: "Skills", icon: Sparkles },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Agents</h2>
          <p className="text-xs text-muted-foreground">{agents.length} configured.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Agent selector */}
      <div className="flex gap-1 flex-wrap">
        {agents.map((a) => (
          <Button
            key={a.id}
            variant={current === a.id ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedAgent(a.id)}
          >
            {a.identity?.emoji ? (
              <span className="mr-1">{a.identity.emoji}</span>
            ) : (
              <Bot className="h-3.5 w-3.5 mr-1" />
            )}
            {a.identity?.name || a.name || a.id}
            {a.id === defaultId && (
              <span className="ml-1.5 text-[10px] opacity-60">default</span>
            )}
          </Button>
        ))}
      </div>

      {current && (
        <>
          {/* Sub-tabs */}
          <div className="flex gap-1 border-b border-border">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                className={cn(
                  "flex items-center gap-1 px-3 py-1.5 text-xs font-medium transition-colors",
                  activeTab === tab.id
                    ? "text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.icon className="h-3 w-3" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <AgentTabContent agentId={current} agent={agents.find(a => a.id === current)} tab={activeTab} onAgentUpdated={() => mutate()} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab router
// ---------------------------------------------------------------------------

function AgentTabContent({ agentId, agent, tab, onAgentUpdated }: { agentId: string; agent?: AgentEntry; tab: AgentTab; onAgentUpdated?: () => void }) {
  if (tab === "overview") {
    return <AgentOverviewTab agentId={agentId} agent={agent} onAgentUpdated={onAgentUpdated} />;
  }
  if (tab === "files") {
    return <AgentFilesTab agentId={agentId} />;
  }
  if (tab === "tools") {
    return <AgentToolsTab agentId={agentId} />;
  }
  if (tab === "skills") {
    return <SkillsPanel agentId={agentId} />;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Overview tab — reads model from config (matching OpenClaw reference pattern)
// ---------------------------------------------------------------------------

/** Resolve the primary model string from a model value (string or {primary, fallbacks}). */
function resolveModelPrimary(model?: string | { primary?: string; fallbacks?: string[] }): string | undefined {
  if (typeof model === "string") return model.trim() || undefined;
  if (typeof model === "object" && model) return model.primary?.trim() || undefined;
  return undefined;
}

function AgentOverviewTab({ agentId, agent, onAgentUpdated }: { agentId: string; agent?: AgentEntry; onAgentUpdated?: () => void }) {
  const { data } = useGatewayRpc<Record<string, unknown>>(
    "agent.identity.get",
    { agentId },
  );
  const { data: configSnapshot, mutate: mutateConfig } = useGatewayRpc<ConfigSnapshot>("config.get");
  const callRpc = useGatewayRpcMutation();
  const [updatingModel, setUpdatingModel] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);

  const identity = data || agent?.identity;

  // config.get returns a ConfigSnapshot wrapper; actual config is under .config
  const configInner = configSnapshot?.config;

  // Model catalog: agents.defaults.models (dict of modelId -> { alias? })
  const modelsCatalog = configInner?.agents?.defaults?.models ?? {};

  // Default model: agents.defaults.model (string or { primary })
  const defaultModelPrimary = resolveModelPrimary(configInner?.agents?.defaults?.model);

  // Per-agent model: agents.list[].model where id matches (reference pattern)
  const agentConfigEntry = configInner?.agents?.list?.find(a => a?.id === agentId);
  const agentModelPrimary = resolveModelPrimary(agentConfigEntry?.model);

  // Effective model: per-agent overrides default
  const currentModel = agentModelPrimary || defaultModelPrimary || "";

  // Save model via config.set with full config (matching OpenClaw reference).
  // Modifies agents.list[].model for the specific agent, then sends the
  // entire config as raw JSON — the proven approach from the reference UI.
  const handleModelChange = useCallback(async (newModel: string) => {
    if (!configSnapshot?.config || !configSnapshot.hash) {
      setModelError("Config not loaded yet. Please wait and try again.");
      return;
    }
    setUpdatingModel(true);
    setModelError(null);
    try {
      // Deep-clone the config object
      const fullConfig = JSON.parse(JSON.stringify(configSnapshot.config));

      // Ensure agents.list exists
      if (!fullConfig.agents) fullConfig.agents = {};
      if (!Array.isArray(fullConfig.agents.list)) fullConfig.agents.list = [];

      // Find agent in list
      const agentEntry = fullConfig.agents.list.find(
        (a: AgentConfigEntry) => a?.id === agentId,
      );

      if (agentEntry) {
        // Preserve existing fallbacks if model was an object
        const existing = agentEntry.model;
        if (existing && typeof existing === "object" && !Array.isArray(existing)) {
          const fallbacks = (existing as { fallbacks?: string[] }).fallbacks;
          agentEntry.model = {
            primary: newModel,
            ...(Array.isArray(fallbacks) ? { fallbacks } : {}),
          };
        } else {
          agentEntry.model = newModel;
        }
      } else {
        // Agent not in list — add it
        fullConfig.agents.list.push({ id: agentId, model: newModel });
      }

      // Send full config via config.set (same approach as reference UI)
      await callRpc("config.set", {
        raw: JSON.stringify(fullConfig, null, 2),
        baseHash: configSnapshot.hash,
      });

      // Refresh config and agent list after save
      mutateConfig();
      onAgentUpdated?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to update model:", msg);
      setModelError(msg);
    } finally {
      setUpdatingModel(false);
    }
  }, [callRpc, agentId, configSnapshot, onAgentUpdated, mutateConfig]);

  // Build options list — catalog models + current model if not in catalog
  const modelOptions: { id: string; label: string }[] = Object.entries(modelsCatalog).map(
    ([id, entry]) => ({ id, label: entry.alias || id.split("/").pop() || id })
  );
  if (currentModel && !modelsCatalog[currentModel]) {
    modelOptions.unshift({ id: currentModel, label: `Current (${currentModel.split("/").pop()})` });
  }

  // Is this the default agent? (no per-agent override = inherits default)
  const isDefault = !agentModelPrimary;

  return (
    <div className="space-y-4 mt-2">
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-medium">Identity</h3>
        <div className="grid grid-cols-2 gap-3">
          <InfoRow label="Agent ID" value={agentId} />
          <InfoRow label="Name" value={(identity as Record<string, unknown>)?.name as string || agent?.name || "\u2014"} />
          <InfoRow label="Emoji" value={(identity as Record<string, unknown>)?.emoji as string || "\u2014"} />
          <InfoRow label="Theme" value={(identity as Record<string, unknown>)?.theme as string || "\u2014"} />
        </div>
      </div>

      {/* Model selector */}
      <div className="rounded-lg border border-border p-4 space-y-3">
        <h3 className="text-sm font-medium">Model</h3>
        {modelOptions.length > 0 || defaultModelPrimary ? (
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={isDefault ? "" : currentModel}
            onChange={(e) => handleModelChange(e.target.value)}
            disabled={updatingModel || !configSnapshot?.hash}
          >
            {!isDefault && (
              <option value="">
                {defaultModelPrimary
                  ? `Inherit default (${defaultModelPrimary.split("/").pop()})`
                  : "Inherit default"}
              </option>
            )}
            {modelOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}{opt.id === defaultModelPrimary ? " (default)" : ""}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-muted-foreground">
            {currentModel ? currentModel.split("/").pop() : "No models configured in gateway"}
          </p>
        )}
        {updatingModel && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        {modelError && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" /> {modelError}
          </p>
        )}
      </div>

      {/* Raw data */}
      {data && (
        <details className="group">
          <summary className="text-xs text-muted-foreground/60 cursor-pointer hover:text-muted-foreground">
            Raw identity data
          </summary>
          <pre className="mt-2 text-xs bg-muted/30 rounded-lg p-3 overflow-auto max-h-48">
            {JSON.stringify(data, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Files tab — agents.files.list / get / set
// ---------------------------------------------------------------------------

const KNOWN_FILES = [
  "SOUL.md", "MEMORY.md", "TOOLS.md", "IDENTITY.md",
  "USER.md", "HEARTBEAT.md", "BOOTSTRAP.md", "AGENTS.md",
];

function AgentFilesTab({ agentId }: { agentId: string }) {
  const { data, error, isLoading, mutate } = useGatewayRpc<AgentFilesResponse>(
    "agents.files.list",
    { agentId },
  );
  const callRpc = useGatewayRpcMutation();
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [loadingFile, setLoadingFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const files = data?.files ?? [];

  const handleFileClick = useCallback(async (name: string) => {
    setSelectedFile(name);
    setLoadingFile(true);
    setSaveError(null);
    setDirty(false);
    try {
      const res = await callRpc<AgentFileContent>("agents.files.get", { agentId, name });
      setFileContent(res.file?.content ?? "");
    } catch (err) {
      setFileContent("");
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingFile(false);
    }
  }, [callRpc, agentId]);

  const handleSave = useCallback(async () => {
    if (!selectedFile) return;
    setSaving(true);
    setSaveError(null);
    try {
      await callRpc("agents.files.set", { agentId, name: selectedFile, content: fileContent });
      setDirty(false);
      mutate();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [callRpc, agentId, selectedFile, fileContent, mutate]);

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-4" />;
  }

  if (error) {
    return (
      <div className="mt-4 space-y-2">
        <p className="text-sm text-destructive">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  // Merge gateway response with known files list
  const fileMap = new Map(files.map((f) => [f.name, f]));
  const allFiles: AgentFileEntry[] = KNOWN_FILES.map((name) => {
    const existing = fileMap.get(name);
    return existing ?? { name, path: name, missing: true };
  });
  // Add any extra files from gateway not in our known list
  for (const f of files) {
    if (!KNOWN_FILES.includes(f.name)) {
      allFiles.push(f);
    }
  }

  return (
    <div className="mt-2 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{allFiles.length} files</p>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* File list */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1">
        {allFiles.map((f) => (
          <button
            key={f.name}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-left transition-colors",
              selectedFile === f.name
                ? "bg-primary/10 text-primary border border-primary/30"
                : "hover:bg-muted/50",
              f.missing && "opacity-50",
            )}
            onClick={() => handleFileClick(f.name)}
          >
            {f.missing ? (
              <FileWarning className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
            ) : (
              <FileText className="h-3 w-3 flex-shrink-0" />
            )}
            <span className="truncate">{f.name}</span>
            {f.size != null && !f.missing && (
              <span className="text-[10px] text-muted-foreground/50 ml-auto flex-shrink-0">
                {f.size > 1024 ? `${(f.size / 1024).toFixed(1)}k` : `${f.size}b`}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* File editor */}
      {selectedFile && (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/20 border-b border-border">
            <span className="text-xs font-medium">{selectedFile}</span>
            <div className="flex items-center gap-2">
              {dirty && <span className="text-[10px] text-yellow-500">unsaved</span>}
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                disabled={saving || !dirty}
              >
                {saving ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                ) : (
                  <Save className="h-3 w-3 mr-1" />
                )}
                Save
              </Button>
            </div>
          </div>

          {saveError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-destructive/5 border-b border-destructive/20">
              <AlertCircle className="h-3 w-3 text-destructive flex-shrink-0" />
              <span className="text-xs text-destructive">{saveError}</span>
            </div>
          )}

          {loadingFile ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <textarea
              className="w-full min-h-[300px] p-3 text-xs font-mono bg-background resize-y focus:outline-none"
              value={fileContent}
              onChange={(e) => {
                setFileContent(e.target.value);
                setDirty(true);
              }}
              spellCheck={false}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tools tab — tools.catalog
// ---------------------------------------------------------------------------

function AgentToolsTab({ agentId }: { agentId: string }) {
  const { data, error, isLoading, mutate } = useGatewayRpc<ToolsCatalogResponse>(
    "tools.catalog",
    { agentId, includePlugins: true },
  );

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-4" />;
  }

  if (error) {
    return (
      <div className="mt-4 space-y-2">
        <p className="text-sm text-destructive">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  const tools = data?.tools ?? [];

  // Group by profile/category
  const grouped = new Map<string, ToolEntry[]>();
  for (const tool of tools) {
    const group = tool.profile || tool.category || "default";
    const list = grouped.get(group) ?? [];
    list.push(tool);
    grouped.set(group, list);
  }

  if (tools.length === 0) {
    return <p className="text-sm text-muted-foreground mt-4">No tools available.</p>;
  }

  return (
    <div className="mt-2 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{tools.length} tools</p>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {Array.from(grouped.entries()).map(([group, groupTools]) => (
        <div key={group} className="space-y-1">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{group}</h4>
          <div className="space-y-0.5">
            {groupTools.map((tool) => (
              <div key={tool.name} className="flex items-start gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50">
                <Wrench className="h-3 w-3 mt-0.5 opacity-40 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{tool.name}</div>
                  {tool.description && (
                    <div className="text-xs text-muted-foreground/70 line-clamp-2">{tool.description}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Raw data */}
      <details className="group">
        <summary className="text-xs text-muted-foreground/60 cursor-pointer hover:text-muted-foreground">
          Raw catalog data
        </summary>
        <pre className="mt-2 text-xs bg-muted/30 rounded-lg p-3 overflow-auto max-h-48">
          {JSON.stringify(data, null, 2)}
        </pre>
      </details>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared components
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{label}</div>
      <div className="text-sm font-medium truncate">{value}</div>
    </div>
  );
}
