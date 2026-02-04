"use client";

import { useEffect, useState } from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { AgentChatWindow } from "@/components/chat/AgentChatWindow";

type ActiveView = "chats" | "agents";

export default function ChatPage() {
  const [activeView, setActiveView] = useState<ActiveView>("chats");
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
      setActiveView("agents");
    }

    function handleSelectChats() {
      setActiveView("chats");
      setSelectedAgent(null);
      setPendingSoulContent(undefined);
    }

    function handleNewChat() {
      setActiveView("chats");
      setSelectedAgent(null);
      setPendingSoulContent(undefined);
    }

    window.addEventListener("selectAgent", handleSelectAgent);
    window.addEventListener("selectChats", handleSelectChats);
    window.addEventListener("newChat", handleNewChat);

    return () => {
      window.removeEventListener("selectAgent", handleSelectAgent);
      window.removeEventListener("selectChats", handleSelectChats);
      window.removeEventListener("newChat", handleNewChat);
    };
  }, []);

  return (
    <ChatLayout>
      {activeView === "chats" ? (
        <ChatWindow />
      ) : (
        <AgentChatWindow
          agentName={selectedAgent}
          pendingSoulContent={pendingSoulContent}
          onSoulContentSent={() => setPendingSoulContent(undefined)}
        />
      )}
    </ChatLayout>
  );
}
