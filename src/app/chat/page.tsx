"use client";

import { useEffect, useState } from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { AgentChatWindow } from "@/components/chat/AgentChatWindow";
import { ControlPanelRouter } from "@/components/control/ControlPanelRouter";
import { GatewayProvider } from "@/hooks/useGateway";

export default function ChatPage() {
  const [selectedAgent, setSelectedAgent] = useState<string>("main");
  const [activeView, setActiveView] = useState<"chat" | "control">("chat");
  const [activePanel, setActivePanel] = useState<string>("overview");

  useEffect(() => {
    function handleSelectAgent(e: Event) {
      const customEvent = e as CustomEvent<{ agentName: string }>;
      setSelectedAgent(customEvent.detail.agentName);
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
          <AgentChatWindow agentName={selectedAgent} />
        ) : (
          <ControlPanelRouter panel={activePanel} />
        )}
      </ChatLayout>
    </GatewayProvider>
  );
}
