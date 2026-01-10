"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "@/components/chat/Sidebar";
import { UserButton, useAuth } from "@clerk/nextjs";
import { useApi } from "@/lib/api";

interface Session {
  id: string;
  name: string;
}

interface ChatLayoutProps {
  children: React.ReactNode;
}

export function ChatLayout({ children }: ChatLayoutProps) {
  const { isSignedIn } = useAuth();
  const api = useApi();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.get("/chat/sessions");
      setSessions(data);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    }
  }, [api]);

  useEffect(() => {
    if (isSignedIn) {
      api.syncUser()
        .then((data) => {
          console.log("User sync:", data);
          loadSessions();
        })
        .catch((err) => console.error("User sync failed:", err));
    }
  }, [isSignedIn]);

  const handleNewChat = () => {
    setCurrentSessionId(null);
    // Trigger a refresh in the child component
    window.dispatchEvent(new CustomEvent("newChat"));
  };

  const handleSelectSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    window.dispatchEvent(new CustomEvent("selectSession", { detail: { sessionId } }));
  };

  // Listen for session updates from ChatWindow
  useEffect(() => {
    const handleSessionUpdate = () => {
      loadSessions();
    };
    window.addEventListener("sessionUpdated", handleSessionUpdate);
    return () => window.removeEventListener("sessionUpdated", handleSessionUpdate);
  }, [loadSessions]);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        className="w-64 hidden md:flex border-r"
        sessions={sessions}
        currentSessionId={currentSessionId}
        onNewChat={handleNewChat}
        onSelectSession={handleSelectSession}
      />

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative">
        {/* Header */}
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
