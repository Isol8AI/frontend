// frontend/src/hooks/useAgentChat.ts
/**
 * Agent chat hook that uses the shared GatewayProvider WebSocket.
 *
 * Message protocol (unchanged):
 * - Send: { type: "agent_chat", agent_name: string, message: string }
 * - Receive: { type: "chunk", content: string }
 * - Receive: { type: "done" }
 * - Receive: { type: "error", message: string }
 * - Receive: { type: "heartbeat" }
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useGateway, type ChatIncomingMessage } from "@/hooks/useGateway";

// =============================================================================
// Types
// =============================================================================

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface UseAgentChatReturn {
  messages: AgentMessage[];
  isStreaming: boolean;
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  clearMessages: () => void;
  isConnected: boolean;
}

interface InternalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// =============================================================================
// Hook
// =============================================================================

export function useAgentChat(agentName: string | null): UseAgentChatReturn {
  const { isConnected, sendChat, onChatMessage } = useGateway();

  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentAssistantIdRef = useRef<string | null>(null);
  const streamContentRef = useRef<string>("");
  const agentNameRef = useRef(agentName);
  agentNameRef.current = agentName;

  // ---- Chat message handler ----

  useEffect(() => {
    return onChatMessage((msg: ChatIncomingMessage) => {
      // Only process if we're currently streaming
      if (!currentAssistantIdRef.current) return;

      if (msg.type === "chunk") {
        streamContentRef.current += msg.content;
        const updatedContent = streamContentRef.current;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === currentAssistantIdRef.current
              ? { ...m, content: updatedContent }
              : m,
          ),
        );
        return;
      }

      if (msg.type === "done") {
        setIsStreaming(false);
        currentAssistantIdRef.current = null;
        streamContentRef.current = "";
        return;
      }

      if (msg.type === "error") {
        if (currentAssistantIdRef.current) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentAssistantIdRef.current
                ? { ...m, content: `Error: ${msg.message}` }
                : m,
            ),
          );
        }
        setError(msg.message);
        setIsStreaming(false);
        currentAssistantIdRef.current = null;
        streamContentRef.current = "";
        return;
      }

      if (msg.type === "heartbeat") {
        if (!streamContentRef.current && currentAssistantIdRef.current) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === currentAssistantIdRef.current
                ? { ...m, content: "Agent is working..." }
                : m,
            ),
          );
        }
      }
    });
  }, [onChatMessage]);

  // ---- Send message ----

  const sendMessage = useCallback(
    async (message: string): Promise<void> => {
      if (!agentNameRef.current) {
        throw new Error("No agent selected");
      }

      setError(null);

      const userMsgId = `user-${Date.now()}`;
      const assistantMsgId = `assistant-${Date.now()}`;

      currentAssistantIdRef.current = assistantMsgId;
      streamContentRef.current = "";

      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content: message },
        { id: assistantMsgId, role: "assistant", content: "" },
      ]);
      setIsStreaming(true);

      try {
        sendChat(agentNameRef.current, message);
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to send message";
        setError(errorMessage);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, content: `Error: ${errorMessage}` }
              : m,
          ),
        );
        setIsStreaming(false);
        currentAssistantIdRef.current = null;
        streamContentRef.current = "";
      }
    },
    [sendChat],
  );

  // ---- Clear messages ----

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setIsStreaming(false);
    currentAssistantIdRef.current = null;
    streamContentRef.current = "";
  }, []);

  // ---- Clear on agent change ----

  const prevAgentNameRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (prevAgentNameRef.current === undefined) {
      prevAgentNameRef.current = agentName;
      return;
    }
    if (prevAgentNameRef.current !== agentName) {
      clearMessages();
      prevAgentNameRef.current = agentName;
    }
  }, [agentName, clearMessages]);

  // ---- External interface ----

  const externalMessages: AgentMessage[] = messages.map(({ role, content }) => ({
    role,
    content,
  }));

  return {
    messages: externalMessages,
    isStreaming,
    error,
    sendMessage,
    clearMessages,
    isConnected,
  };
}
