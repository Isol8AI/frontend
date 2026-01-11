"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, UserButton } from "@clerk/nextjs";

import { Sidebar } from "@/components/chat/Sidebar";
import { OrganizationSwitcher } from "@/components/organization/OrganizationSwitcher";
import { useOrgContext } from "@/components/providers/OrganizationProvider";
import { useApi } from "@/lib/api";

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
  const { orgId, isPersonalContext } = useOrgContext();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const loadSessions = useCallback(async (): Promise<void> => {
    try {
      const data = await api.get("/chat/sessions");
      setSessions(data as Session[]);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  }, [api]);

  const resetToNewChat = useCallback((): void => {
    setCurrentSessionId(null);
    dispatchNewChatEvent();
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!isSignedIn) return;

    api.syncUser()
      .then(() => loadSessions())
      .catch((err) => console.error("User sync failed:", err));
  }, [isSignedIn, api, loadSessions]);

  useEffect(() => {
    if (isSignedIn) {
      resetToNewChat();
    }
  }, [orgId, isSignedIn, resetToNewChat]);

  useEffect(() => {
    window.addEventListener("orgContextChanged", resetToNewChat);
    return () => window.removeEventListener("orgContextChanged", resetToNewChat);
  }, [resetToNewChat]);

  useEffect(() => {
    window.addEventListener("sessionUpdated", loadSessions);
    return () => window.removeEventListener("sessionUpdated", loadSessions);
  }, [loadSessions]);

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

        <Sidebar
          className="flex-1"
          sessions={sessions}
          currentSessionId={currentSessionId}
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
