"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Bot, FileText, Wrench, Sparkles, User } from "lucide-react";
import { useContainerRpc } from "@/hooks/useContainerRpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
}

interface AgentsListResponse {
  defaultId?: string;
  mainKey?: string;
  scope?: string;
  agents?: AgentEntry[];
}

export function AgentsPanel() {
  const { data: rawData, error, isLoading, mutate } = useContainerRpc<AgentsListResponse>("agents.list");
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
          <AgentTabContent agentId={current} agent={agents.find(a => a.id === current)} tab={activeTab} />
        </>
      )}
    </div>
  );
}

function AgentTabContent({ agentId, agent, tab }: { agentId: string; agent?: AgentEntry; tab: AgentTab }) {
  if (tab === "overview") {
    return <AgentOverviewTab agentId={agentId} agent={agent} />;
  }

  // For files, tools, skills — use agent.identity.get or show raw data
  const methodMap: Record<string, string> = {
    files: "agent.identity.get",
    tools: "skills.status",
    skills: "skills.status",
  };

  const method = methodMap[tab];
  const params = tab === "files" ? { agentId } : undefined;

  return <AgentDataTab method={method} params={params} tab={tab} />;
}

function AgentOverviewTab({ agentId, agent }: { agentId: string; agent?: AgentEntry }) {
  const { data } = useContainerRpc<Record<string, unknown>>(
    "agent.identity.get",
    { agentId },
  );

  const identity = data || agent?.identity;

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

function AgentDataTab({ method, params, tab }: { method: string; params?: Record<string, unknown>; tab: string }) {
  const { data, isLoading } = useContainerRpc<unknown>(method, params);

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-4" />;
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground mt-4">No {tab} data available.</p>;
  }

  return (
    <pre className="text-xs bg-muted/30 rounded-lg p-3 overflow-auto max-h-96 mt-2">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{label}</div>
      <div className="text-sm font-medium truncate">{value}</div>
    </div>
  );
}
