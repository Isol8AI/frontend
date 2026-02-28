"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, UserButton } from "@clerk/nextjs";
import { Plus, Loader2, Trash2, Bot, Settings, LayoutDashboard } from "lucide-react";

import Link from "next/link";
import { AgentCreateDialog } from "@/components/chat/AgentCreateDialog";
import { AgentSettingsModal } from "@/components/chat/AgentSettingsModal";
import { useApi } from "@/lib/api";
import { useAgents } from "@/hooks/useAgents";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ChatLayoutProps {
  children: React.ReactNode;
}

function dispatchSelectAgentEvent(
  agentName: string,
  soulContent?: string,
): void {
  window.dispatchEvent(
    new CustomEvent("selectAgent", { detail: { agentName, soulContent } }),
  );
}

export function ChatLayout({ children }: ChatLayoutProps): React.ReactElement {
  const { isSignedIn } = useAuth();
  const api = useApi();
  const {
    agents,
    isLoading: isLoadingAgents,
    createAgent,
    deleteAgent,
  } = useAgents();
  const [currentAgentName, setCurrentAgentName] = useState<string | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<string | null>(null);
  const [showCreateAgent, setShowCreateAgent] = useState(false);
  const [settingsAgentName, setSettingsAgentName] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!isSignedIn) return;

    api.syncUser().catch((err) => console.error("User sync failed:", err));
  }, [isSignedIn, api]);

  function handleSelectAgent(agentName: string): void {
    setCurrentAgentName(agentName);
    dispatchSelectAgentEvent(agentName);
  }

  const handleConfirmDeleteAgent = useCallback(async (): Promise<void> => {
    if (!agentToDelete) return;

    try {
      await deleteAgent(agentToDelete);

      if (agentToDelete === currentAgentName) {
        setCurrentAgentName(null);
      }
    } catch (err) {
      console.error("Failed to delete agent:", err);
    } finally {
      setAgentToDelete(null);
    }
  }, [agentToDelete, currentAgentName, deleteAgent]);

  const handleCreateAgent = useCallback(
    async (name: string, soulContent?: string): Promise<void> => {
      await createAgent(name, soulContent);
      setCurrentAgentName(name);
      dispatchSelectAgentEvent(name, soulContent);
    },
    [createAgent],
  );

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden relative selection:bg-primary/20">
      {/* Global Grain Overlay */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-noise opacity-[0.03]" />

      <div className="relative z-10 flex w-full h-full">
        <div className="w-64 hidden md:flex flex-col border-r border-border bg-sidebar/50 backdrop-blur-xl">
          <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
            Agents
          </div>

          {/* New Agent Button */}
          <div className="px-3 py-2">
            <Button
              className="w-full justify-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-all shadow-lg shadow-primary/5"
              onClick={() => setShowCreateAgent(true)}
            >
              <Plus className="h-4 w-4" />
              New Agent
            </Button>
          </div>

          {/* Agent List */}
          <ScrollArea className="flex-1 px-3 py-2">
            <div className="space-y-1">
              {isLoadingAgents ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-xs text-muted-foreground">
                    Loading...
                  </span>
                </div>
              ) : agents.length === 0 ? (
                <p className="text-xs text-muted-foreground/50 text-center py-4">
                  No agents yet
                </p>
              ) : (
                agents.map((agent) => (
                  <div key={agent.agent_name} className="group relative">
                    <Button
                      variant="ghost"
                      className={cn(
                        "w-full justify-start gap-2 font-normal truncate transition-all pr-16",
                        currentAgentName === agent.agent_name
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                      )}
                      onClick={() => handleSelectAgent(agent.agent_name)}
                    >
                      <Bot className="h-4 w-4 flex-shrink-0 opacity-70" />
                      <span className="truncate">{agent.agent_name}</span>
                    </Button>
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        className="p-1 rounded hover:bg-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSettingsAgentName(agent.agent_name);
                        }}
                      >
                        <Settings className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground transition-colors" />
                      </button>
                      <button
                        className="p-1 rounded hover:bg-accent"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAgentToDelete(agent.agent_name);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive transition-colors" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>

          <div className="p-4 border-t border-border text-[10px] text-muted-foreground/40 text-center uppercase tracking-widest font-mono">
            Isol8 v0.1
          </div>
        </div>

        <main className="flex-1 min-h-0 flex flex-col relative bg-background/20">
          <header className="h-14 border-b border-border flex items-center justify-end gap-2 px-4 backdrop-blur-sm bg-background/20 absolute top-0 right-0 left-0 z-20">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-foreground">
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline text-xs">Dashboard</span>
              </Button>
            </Link>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8",
                },
              }}
            />
          </header>

          <div className="flex-1 min-h-0 pt-14 flex flex-col">{children}</div>
        </main>
      </div>

      <AlertDialog
        open={!!agentToDelete}
        onOpenChange={(open) => !open && setAgentToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the agent &quot;{agentToDelete}&quot;
              and all its memory, personality, and conversation history. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteAgent}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AgentCreateDialog
        open={showCreateAgent}
        onOpenChange={setShowCreateAgent}
        onCreateAgent={handleCreateAgent}
      />

      <AgentSettingsModal
        agentName={settingsAgentName}
        open={settingsAgentName !== null}
        onOpenChange={(open) => {
          if (!open) setSettingsAgentName(null);
        }}
      />
    </div>
  );
}
