"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { useAgentChat } from "@/hooks/useAgentChat";

import type { ToolUse } from "@/hooks/useAgentChat";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  model?: string;
  toolUses?: ToolUse[];
}

interface AgentChatWindowProps {
  agentName: string;
}

export function AgentChatWindow({
  agentName,
}: AgentChatWindowProps): React.ReactElement {
  const {
    messages: chatMessages,
    isStreaming,
    error: chatError,
    sendMessage,
    clearMessages,
    isConnected,
  } = useAgentChat(agentName);

  const isInitialState = chatMessages.length === 0;
  const isTyping = isStreaming;

  const prevAgentNameRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (
      prevAgentNameRef.current !== undefined &&
      prevAgentNameRef.current !== agentName
    ) {
      clearMessages();
    }
    prevAgentNameRef.current = agentName;
  }, [agentName, clearMessages]);

  const handleSend = useCallback(
    async (content: string): Promise<void> => {
      try {
        await sendMessage(content);
      } catch (err) {
        console.error("Failed to send message:", err);
      }
    },
    [sendMessage],
  );

  const messages: Message[] = useMemo(
    () =>
      chatMessages.map((msg, i) => ({
        id: String(i),
        role: msg.role,
        content: msg.content,
        ...(msg.toolUses?.length ? { toolUses: msg.toolUses } : {}),
      })),
    [chatMessages],
  );

  const connectionIndicator =
    !isConnected ? (
      <div className="px-3 py-1.5 rounded text-xs font-medium bg-yellow-900/30 text-yellow-300">
        Connecting...
      </div>
    ) : null;

  if (chatError) {
    return (
      <div className="flex flex-col h-full bg-background/20">
        <div className="absolute top-4 right-4 z-20">
          {connectionIndicator}
        </div>
        <div className="flex-1 flex flex-col">
          {messages.length > 0 && (
            <MessageList messages={messages} isTyping={isTyping} />
          )}
          <div className="p-4 m-4 bg-red-900/20 text-red-300 rounded-lg">
            <p className="font-medium">Error</p>
            <p className="text-sm">{chatError}</p>
          </div>
          <ChatInput onSend={handleSend} disabled={isTyping} />
        </div>
      </div>
    );
  }

  if (isInitialState) {
    return (
      <div className="flex flex-col h-full bg-background/20">
        <div className="absolute top-4 right-4 z-20">
          {connectionIndicator}
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-3 text-foreground tracking-tight font-host">
              {agentName}
            </h1>
            <p className="text-muted-foreground text-lg font-light">
              Start a conversation with your agent
            </p>
          </div>
          <div className="w-full max-w-2xl">
            <ChatInput onSend={handleSend} disabled={isTyping} centered />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0 bg-background/20">
      <div className="absolute top-4 right-4 z-20">
        {connectionIndicator}
      </div>
      <MessageList messages={messages} isTyping={isTyping} />
      <ChatInput onSend={handleSend} disabled={isTyping} />
    </div>
  );
}
