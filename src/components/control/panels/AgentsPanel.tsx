"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Bot, FileText, Wrench, Sparkles } from "lucide-react";
import { useContainerRpc } from "@/hooks/useContainerRpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type AgentTab = "overview" | "files" | "tools" | "skills";

interface Agent {
  name: string;
  [key: string]: unknown;
}

export function AgentsPanel() {
  const { data, error, isLoading, mutate } = useContainerRpc<Agent[]>("agents.list");
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

  const agents = Array.isArray(data) ? data : [];
  const current = selectedAgent || agents[0]?.name;

  const TABS: { id: AgentTab; label: string; icon: typeof Bot }[] = [
    { id: "overview", label: "Overview", icon: Bot },
    { id: "files", label: "Files", icon: FileText },
    { id: "tools", label: "Tools", icon: Wrench },
    { id: "skills", label: "Skills", icon: Sparkles },
  ];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Agents</h2>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Agent selector */}
      <div className="flex gap-1 flex-wrap">
        {agents.map((a) => (
          <Button
            key={a.name}
            variant={current === a.name ? "default" : "outline"}
            size="sm"
            onClick={() => setSelectedAgent(a.name)}
          >
            <Bot className="h-3.5 w-3.5 mr-1" />
            {a.name}
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
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  activeTab === tab.id
                    ? "text-foreground border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <AgentTabContent agent={current} tab={activeTab} />
        </>
      )}
    </div>
  );
}

function AgentTabContent({ agent, tab }: { agent: string; tab: AgentTab }) {
  const methodMap: Record<AgentTab, string> = {
    overview: "agents.get",
    files: "agents.files",
    tools: "agents.tools",
    skills: "agents.skills",
  };

  const { data, isLoading } = useContainerRpc<unknown>(
    methodMap[tab],
    { agent },
  );

  if (isLoading) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-4" />;
  }

  if (!data) {
    return <p className="text-sm text-muted-foreground mt-4">No data.</p>;
  }

  return (
    <pre className="text-xs bg-muted/30 rounded-lg p-3 overflow-auto max-h-96 mt-2">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
