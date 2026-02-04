"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, UserButton } from "@clerk/nextjs";
import { Settings } from "lucide-react";

import { Sidebar } from "@/components/chat/Sidebar";
import { AgentCreateDialog } from "@/components/chat/AgentCreateDialog";
import { OrganizationSwitcher } from "@/components/organization/OrganizationSwitcher";
import { useOrgContext } from "@/components/providers/OrganizationProvider";
import { useApi } from "@/lib/api";
import { useSessions } from "@/hooks/useSessions";
import { useAgents } from "@/hooks/useAgents";
import { Button } from "@/components/ui/button";
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

type SidebarTab = 'chats' | 'agents';

function dispatchNewChatEvent(): void {
  window.dispatchEvent(new CustomEvent("newChat"));
}

function dispatchSelectSessionEvent(sessionId: string): void {
  window.dispatchEvent(new CustomEvent("selectSession", { detail: { sessionId } }));
}

function dispatchSelectAgentEvent(agentName: string): void {
  window.dispatchEvent(new CustomEvent("selectAgent", { detail: { agentName } }));
}

function dispatchSelectChatsEvent(): void {
  window.dispatchEvent(new CustomEvent("selectChats"));
}

export function ChatLayout({ children }: ChatLayoutProps): React.ReactElement {
  const { isSignedIn } = useAuth();
  const api = useApi();
  const { orgId, isPersonalContext, isOrgAdmin } = useOrgContext();
  const { sessions, isLoading: isLoadingSessions, refresh: refreshSessions, deleteSession } = useSessions();
  const { agents, isLoading: isLoadingAgents, createAgent, deleteAgent } = useAgents();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionToDelete, setSessionToDelete] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SidebarTab>('chats');
  const [currentAgentName, setCurrentAgentName] = useState<string | null>(null);
  const [agentToDelete, setAgentToDelete] = useState<string | null>(null);
  const [showCreateAgent, setShowCreateAgent] = useState(false);

  // DEBUG: Log component mount/unmount
  useEffect(() => {
    console.log("[ChatLayout] MOUNTED");
    return () => {
      console.log("[ChatLayout] UNMOUNTING");
    };
  }, []);

  // DEBUG: Log org context changes
  useEffect(() => {
    console.log("[ChatLayout] Org context from useOrgContext:", {
      orgId,
      isPersonalContext,
      isOrgAdmin,
    });
  }, [orgId, isPersonalContext, isOrgAdmin]);

  const resetToNewChat = useCallback((): void => {
    setCurrentSessionId(null);
    dispatchNewChatEvent();
    refreshSessions();
  }, [refreshSessions]);

  useEffect(() => {
    if (!isSignedIn) return;

    api.syncUser()
      .catch((err) => console.error("User sync failed:", err));
  }, [isSignedIn, api]);

  // Note: We don't need a separate useEffect for orgId changes because
  // OrganizationProvider dispatches 'orgContextChanged' event which is
  // handled below. Having both would cause duplicate resets.

  // Stable event listener setup
  useEffect(() => {
    const handleOrgContextChanged = (event: Event): void => {
      const customEvent = event as CustomEvent;
      console.log("[ChatLayout] Received 'orgContextChanged' event:", customEvent.detail);
      resetToNewChat();
    };

    const handleSessionUpdated = (): void => {
      console.log("[ChatLayout] Received 'sessionUpdated' event");
      refreshSessions();
    };

    window.addEventListener("orgContextChanged", handleOrgContextChanged);
    window.addEventListener("sessionUpdated", handleSessionUpdated);

    return () => {
      window.removeEventListener("orgContextChanged", handleOrgContextChanged);
      window.removeEventListener("sessionUpdated", handleSessionUpdated);
    };
  }, [refreshSessions, resetToNewChat]);

  function handleNewChat(): void {
    setCurrentSessionId(null);
    dispatchNewChatEvent();
  }

  function handleSelectSession(sessionId: string): void {
    setCurrentSessionId(sessionId);
    dispatchSelectSessionEvent(sessionId);
  }

  const handleConfirmDelete = useCallback(async (): Promise<void> => {
    if (!sessionToDelete) return;

    try {
      await deleteSession(sessionToDelete);

      // If we deleted the active session, reset to new chat
      if (sessionToDelete === currentSessionId) {
        setCurrentSessionId(null);
        dispatchNewChatEvent();
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    } finally {
      setSessionToDelete(null);
    }
  }, [sessionToDelete, currentSessionId, deleteSession]);

  function handleTabChange(tab: SidebarTab): void {
    setActiveTab(tab);
    if (tab === 'chats') {
      setCurrentAgentName(null);
      dispatchSelectChatsEvent();
    } else {
      setCurrentSessionId(null);
    }
  }

  function handleSelectAgent(agentName: string): void {
    setCurrentAgentName(agentName);
    setCurrentSessionId(null);
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

  const handleCreateAgent = useCallback(async (name: string, soulContent?: string): Promise<void> => {
    await createAgent(name, soulContent);
    setCurrentAgentName(name);
    dispatchSelectAgentEvent(name);
  }, [createAgent]);

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden relative selection:bg-primary/20">
      {/* Global Grain Overlay */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-noise opacity-[0.03]" />

      <div className="relative z-10 flex w-full h-full">
        <div className="w-64 hidden md:flex flex-col border-r border-border bg-sidebar/50 backdrop-blur-xl">
          <div className="p-3 border-b border-border">
            <OrganizationSwitcher />
          </div>

          <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {isPersonalContext ? "Personal Chats" : "Organization Chats"}
          </div>

          {!isPersonalContext && isOrgAdmin && orgId && (
            <div className="px-3 py-2">
              <Link href={`/org/${orgId}/settings/encryption`}>
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground hover:bg-accent">
                  <Settings className="h-4 w-4" />
                  Org Settings
                </Button>
              </Link>
            </div>
          )}

          <Sidebar
            className="flex-1"
            sessions={sessions}
            currentSessionId={currentSessionId}
            isLoading={isLoadingSessions}
            onNewChat={handleNewChat}
            onSelectSession={handleSelectSession}
            onDeleteSession={(id) => setSessionToDelete(id)}
            activeTab={activeTab}
            onTabChange={handleTabChange}
            agents={agents}
            currentAgentName={currentAgentName}
            isLoadingAgents={isLoadingAgents}
            onNewAgent={() => setShowCreateAgent(true)}
            onSelectAgent={handleSelectAgent}
            onDeleteAgent={(name) => setAgentToDelete(name)}
          />
        </div>

        <main className="flex-1 min-h-0 flex flex-col relative bg-background/20">
          <header className="h-14 border-b border-border flex items-center justify-end px-4 backdrop-blur-sm bg-background/20 absolute top-0 right-0 left-0 z-20">
            <UserButton 
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8"
                }
              }}
            />
          </header>

          <div className="flex-1 min-h-0 pt-14 flex flex-col">
            {children}
          </div>
        </main>
      </div>

      <AlertDialog open={!!sessionToDelete} onOpenChange={(open) => !open && setSessionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this conversation and all its messages. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!agentToDelete} onOpenChange={(open) => !open && setAgentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the agent &quot;{agentToDelete}&quot; and all its memory, personality, and conversation history. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteAgent} className="bg-red-600 hover:bg-red-700">
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
    </div>
  );
}
