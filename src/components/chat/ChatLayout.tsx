"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth, UserButton } from "@clerk/nextjs";
import { Settings } from "lucide-react";

import { Sidebar } from "@/components/chat/Sidebar";
import { OrganizationSwitcher } from "@/components/organization/OrganizationSwitcher";
import { useOrgContext } from "@/components/providers/OrganizationProvider";
import { useApi } from "@/lib/api";
import { useSessions } from "@/hooks/useSessions";
import { Button } from "@/components/ui/button";

interface ChatLayoutProps {
  children: React.ReactNode;
}

function dispatchNewChatEvent(): void {
  window.dispatchEvent(new CustomEvent("newChat"));
}

function dispatchSelectSessionEvent(sessionId: string): void {
  window.dispatchEvent(new CustomEvent("selectSession", { detail: { sessionId } }));
}

export function ChatLayout({ children }: ChatLayoutProps): React.ReactElement {
  const { isSignedIn } = useAuth();
  const api = useApi();
  const { orgId, isPersonalContext, isOrgAdmin } = useOrgContext();
  const { sessions, isLoading: isLoadingSessions, refresh: refreshSessions } = useSessions();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

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

  return (
    <div className="flex h-screen bg-black text-white overflow-hidden relative selection:bg-white/20">
      {/* Global Grain Overlay */}
      <div className="fixed inset-0 z-0 pointer-events-none bg-noise opacity-[0.03]" />

      <div className="relative z-10 flex w-full h-full">
        <div className="w-64 hidden md:flex flex-col border-r border-white/10 bg-black/50 backdrop-blur-xl">
          <div className="p-3 border-b border-white/10">
            <OrganizationSwitcher />
          </div>

          <div className="px-3 py-2 text-xs font-medium text-white/40 uppercase tracking-wider">
            {isPersonalContext ? "Personal Chats" : "Organization Chats"}
          </div>

          {!isPersonalContext && isOrgAdmin && orgId && (
            <div className="px-3 py-2">
              <Link href={`/org/${orgId}/settings/encryption`}>
                <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-white/70 hover:text-white hover:bg-white/10">
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
          />
        </div>

        <main className="flex-1 min-h-0 flex flex-col relative bg-black/20">
          <header className="h-14 border-b border-white/10 flex items-center justify-end px-4 backdrop-blur-sm bg-black/20 absolute top-0 right-0 left-0 z-20">
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
    </div>
  );
}
