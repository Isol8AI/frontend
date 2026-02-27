"use client";

import { useEffect, useState } from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { AgentChatWindow } from "@/components/chat/AgentChatWindow";

export default function ChatPage() {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [pendingSoulContent, setPendingSoulContent] = useState<
    string | undefined
  >(undefined);

  useEffect(() => {
    function handleSelectAgent(e: Event) {
      const customEvent = e as CustomEvent<{
        agentName: string;
        soulContent?: string;
      }>;
      setSelectedAgent(customEvent.detail.agentName);
      setPendingSoulContent(customEvent.detail.soulContent);
    }

    window.addEventListener("selectAgent", handleSelectAgent);

    return () => {
      window.removeEventListener("selectAgent", handleSelectAgent);
    };
  }, []);

  return (
    <ChatLayout>
      {selectedAgent ? (
        <AgentChatWindow
          agentName={selectedAgent}
          pendingSoulContent={pendingSoulContent}
          onSoulContentSent={() => setPendingSoulContent(undefined)}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <p>Select an agent or create a new one to get started.</p>
        </div>
      )}
    </ChatLayout>
  );
}
