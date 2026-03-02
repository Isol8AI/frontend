"use client";

import { useEffect, useState } from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { AgentChatWindow } from "@/components/chat/AgentChatWindow";
import { ControlPanelRouter } from "@/components/control/ControlPanelRouter";
import { GatewayProvider } from "@/hooks/useGateway";

export default function ChatPage() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<"chat" | "control">("chat");
  const [activePanel, setActivePanel] = useState<string>("overview");

  useEffect(() => {
    function handleSelectAgent(e: Event) {
      const customEvent = e as CustomEvent<{ agentId: string }>;
      setSelectedAgentId(customEvent.detail.agentId);
    }

    window.addEventListener("selectAgent", handleSelectAgent);

    return () => {
      window.removeEventListener("selectAgent", handleSelectAgent);
    };
  }, []);

  return (
    <GatewayProvider>
      <ChatLayout
        activeView={activeView}
        onViewChange={setActiveView}
        activePanel={activePanel}
        onPanelChange={setActivePanel}
      >
        {activeView === "chat" ? (
          <AgentChatWindow key={selectedAgentId} agentId={selectedAgentId} />
        ) : (
          <ControlPanelRouter panel={activePanel} />
        )}
      </ChatLayout>
    </GatewayProvider>
  );
}
