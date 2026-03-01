"use client";

import { useEffect, useState } from "react";
import { useAuth, UserButton } from "@clerk/nextjs";
import { Plus, Bot } from "lucide-react";

import { SubscriptionGate } from "@/components/chat/SubscriptionGate";
import { ContainerGate } from "@/components/chat/ContainerGate";
import { useApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ControlSidebar } from "@/components/control/ControlSidebar";
import { cn } from "@/lib/utils";

interface ChatLayoutProps {
  children: React.ReactNode;
  activeView: "chat" | "control";
  onViewChange: (view: "chat" | "control") => void;
  activePanel?: string;
  onPanelChange?: (panel: string) => void;
}

function dispatchSelectAgentEvent(agentName: string): void {
  window.dispatchEvent(
    new CustomEvent("selectAgent", { detail: { agentName } }),
  );
}

export function ChatLayout({
  children,
  activeView,
  onViewChange,
  activePanel,
  onPanelChange,
}: ChatLayoutProps): React.ReactElement {
  const { isSignedIn } = useAuth();
  const api = useApi();
  const [currentAgentName, setCurrentAgentName] = useState<string>("main");

  useEffect(() => {
    if (!isSignedIn) return;

    api.syncUser().catch((err) => console.error("User sync failed:", err));
  }, [isSignedIn, api]);

  function handleSelectAgent(agentName: string): void {
    setCurrentAgentName(agentName);
    dispatchSelectAgentEvent(agentName);
  }

  // TODO: fetch agent list from OpenClaw via backend proxy
  const agents = [{ name: "main", label: "OpenClaw" }];

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden relative selection:bg-primary/20">
      {/* Global Grain Overlay */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-noise opacity-[0.03]" />

      <div className="relative z-10 flex w-full h-full">
        <div className="w-64 hidden md:flex flex-col border-r border-border bg-sidebar/50 backdrop-blur-xl">
          {/* Tab Switcher */}
          <div className="flex border-b border-border">
            <button
              className={cn(
                "flex-1 px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors",
                activeView === "chat"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => onViewChange("chat")}
            >
              Chat
            </button>
            <button
              className={cn(
                "flex-1 px-3 py-2 text-xs font-medium uppercase tracking-wider transition-colors",
                activeView === "control"
                  ? "text-foreground border-b-2 border-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => onViewChange("control")}
            >
              Control
            </button>
          </div>

          {activeView === "chat" ? (
            <>
              {/* New Agent Button */}
              <div className="px-3 py-2">
                <Button
                  className="w-full justify-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-all shadow-lg shadow-primary/5"
                  disabled
                  title="Coming soon — create additional OpenClaw agents"
                >
                  <Plus className="h-4 w-4" />
                  New Agent
                </Button>
              </div>

              {/* Agent List */}
              <ScrollArea className="flex-1 px-3 py-2">
                <div className="space-y-1">
                  {agents.map((agent) => (
                    <Button
                      key={agent.name}
                      variant="ghost"
                      className={cn(
                        "w-full justify-start gap-2 font-normal truncate transition-all",
                        currentAgentName === agent.name
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                      onClick={() => handleSelectAgent(agent.name)}
                    >
                      <Bot className="h-4 w-4 flex-shrink-0 opacity-70" />
                      <span className="truncate">{agent.label}</span>
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </>
          ) : (
            <ControlSidebar activePanel={activePanel} onPanelChange={onPanelChange} />
          )}

          <div className="p-4 border-t border-border text-[10px] text-muted-foreground/40 text-center uppercase tracking-widest font-mono">
            Isol8 v0.1
          </div>
        </div>

        <main className="flex-1 min-h-0 flex flex-col relative bg-background/20">
          <header className="h-14 border-b border-border flex items-center justify-end gap-2 px-4 backdrop-blur-sm bg-background/20 absolute top-0 right-0 left-0 z-20">
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8",
                },
              }}
            />
          </header>

          <div className="flex-1 min-h-0 pt-14 flex flex-col">
            <SubscriptionGate>
              <ContainerGate>{children}</ContainerGate>
            </SubscriptionGate>
          </div>
        </main>
      </div>
    </div>
  );
}
