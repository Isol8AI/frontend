"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth, UserButton } from "@clerk/nextjs";
import { Settings } from "lucide-react";

import { Sidebar } from "@/components/chat/Sidebar";
import { OrganizationSwitcher } from "@/components/organization/OrganizationSwitcher";
import { useOrgContext } from "@/components/providers/OrganizationProvider";
import { useApi } from "@/lib/api";
import { Button } from "@/components/ui/button";

interface Session {
  id: string;
  name: string;
}

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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);

  // Use refs to avoid recreating event handlers on every render
  const apiRef = useRef(api);
  apiRef.current = api;

  const loadSessions = useCallback(async (): Promise<void> => {
    setIsLoadingSessions(true);
    try {
      const data = await apiRef.current.get("/chat/sessions");
      // Backend returns paginated response: { sessions: [...], total, limit, offset }
      setSessions((data as { sessions: Session[] }).sessions);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const resetToNewChat = useCallback((): void => {
    setCurrentSessionId(null);
    dispatchNewChatEvent();
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!isSignedIn) return;

    apiRef.current.syncUser()
      .then(() => loadSessions())
      .catch((err) => console.error("User sync failed:", err));
  }, [isSignedIn, loadSessions]);

  // Note: We don't need a separate useEffect for orgId changes because
  // OrganizationProvider dispatches 'orgContextChanged' event which is
  // handled below. Having both would cause duplicate resets.

  // Stable event listener setup using refs
  useEffect(() => {
    const handleOrgContextChanged = (): void => {
      resetToNewChat();
    };

    const handleSessionUpdated = (): void => {
      loadSessions();
    };

    window.addEventListener("orgContextChanged", handleOrgContextChanged);
    window.addEventListener("sessionUpdated", handleSessionUpdated);

    return () => {
      window.removeEventListener("orgContextChanged", handleOrgContextChanged);
      window.removeEventListener("sessionUpdated", handleSessionUpdated);
    };
  }, [loadSessions, resetToNewChat]);

  function handleNewChat(): void {
    setCurrentSessionId(null);
    dispatchNewChatEvent();
  }

  function handleSelectSession(sessionId: string): void {
    setCurrentSessionId(sessionId);
    dispatchSelectSessionEvent(sessionId);
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <div className="w-64 hidden md:flex flex-col border-r">
        <div className="p-3 border-b">
          <OrganizationSwitcher />
        </div>

        <div className="px-3 py-2 text-xs text-muted-foreground border-b">
          {isPersonalContext ? "Personal Chats" : "Organization Chats"}
        </div>

        {!isPersonalContext && isOrgAdmin && orgId && (
          <div className="px-3 py-2 border-b">
            <Link href={`/org/${orgId}/settings/encryption`}>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2">
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

      <main className="flex-1 flex flex-col relative">
        <header className="h-14 border-b flex items-center justify-end px-4">
          <UserButton />
        </header>

        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      </main>
    </div>
  );
}
