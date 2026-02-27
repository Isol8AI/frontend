/**
 * WebSocket-based agent chat hook with plaintext streaming.
 *
 * Sends plaintext messages to the backend over WebSocket and receives
 * streamed plaintext response chunks. No encryption involved.
 *
 * Message protocol:
 * - Send: { type: "agent_chat", agent_name: string, message: string }
 * - Receive: { type: "chunk", content: string } -- append to response
 * - Receive: { type: "done" } -- stream complete
 * - Receive: { type: "error", message: string } -- error
 * - Receive: { type: "heartbeat" } -- agent working, keep alive
 * - Receive: { type: "pong" } -- response to our ping
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";

// =============================================================================
// Constants
// =============================================================================

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff
const PING_INTERVAL_MS = 30000; // 30 seconds
const CONNECTION_TIMEOUT_MS = 10000;

// =============================================================================
// WebSocket URL
// =============================================================================

function getWebSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }

  // Fallback: derive from API URL
  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";
  return apiUrl
    .replace(/^https:\/\//, "wss://")
    .replace(/^http:\/\//, "ws://")
    .replace("api-", "ws-")
    .replace(/\/api\/v1$/, "");
}

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

// Internal message type with ID for tracking streaming updates
interface InternalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

// WebSocket incoming message types

interface WSChunkData {
  type: "chunk";
  content: string;
}

interface WSDoneData {
  type: "done";
}

interface WSErrorData {
  type: "error";
  message: string;
}

interface WSPongData {
  type: "pong";
}

interface WSHeartbeatData {
  type: "heartbeat";
}

type WSIncomingData =
  | WSChunkData
  | WSDoneData
  | WSErrorData
  | WSPongData
  | WSHeartbeatData;

function isValidWSData(data: unknown): data is WSIncomingData {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;

  if (obj.type === "chunk" && typeof obj.content === "string") return true;
  if (obj.type === "done") return true;
  if (obj.type === "error" && typeof obj.message === "string") return true;
  if (obj.type === "pong") return true;
  if (obj.type === "heartbeat") return true;

  return false;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useAgentChat(
  agentName: string | null,
): UseAgentChatReturn {
  const { getToken } = useAuth();

  // State
  const [messages, setMessages] = useState<InternalMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Refs for WebSocket management
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track current streaming assistant message
  const currentAssistantIdRef = useRef<string | null>(null);
  const streamContentRef = useRef<string>("");

  // Keep agentName in a ref so the WS message handler always has the latest value
  const agentNameRef = useRef(agentName);
  agentNameRef.current = agentName;

  // =============================================================================
  // Cleanup Helpers
  // =============================================================================

  const clearPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // =============================================================================
  // Message Handler
  // =============================================================================

  const handleMessage = useCallback((data: WSIncomingData) => {
    if (data.type === "pong") {
      // Server acknowledged our ping -- nothing to do
      return;
    }

    if (data.type === "heartbeat") {
      // Agent is working (e.g. tool execution). Show indicator if no content yet.
      if (!streamContentRef.current && currentAssistantIdRef.current) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === currentAssistantIdRef.current
              ? { ...msg, content: "Agent is working..." }
              : msg,
          ),
        );
      }
      return;
    }

    if (data.type === "chunk") {
      streamContentRef.current += data.content;
      const updatedContent = streamContentRef.current;

      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === currentAssistantIdRef.current
            ? { ...msg, content: updatedContent }
            : msg,
        ),
      );
      return;
    }

    if (data.type === "done") {
      setIsStreaming(false);
      currentAssistantIdRef.current = null;
      streamContentRef.current = "";
      return;
    }

    if (data.type === "error") {
      // Update the assistant placeholder with error text
      if (currentAssistantIdRef.current) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === currentAssistantIdRef.current
              ? { ...msg, content: `Error: ${data.message}` }
              : msg,
          ),
        );
      }

      setError(data.message);
      setIsStreaming(false);
      currentAssistantIdRef.current = null;
      streamContentRef.current = "";
    }
  }, []);

  // =============================================================================
  // WebSocket Connection (lazy -- connects on first sendMessage)
  // =============================================================================

  const connect = useCallback(async (): Promise<void> => {
    // Don't connect if already connected or connecting
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const wsUrl = getWebSocketUrl();
      const ws = new WebSocket(`${wsUrl}?token=${token}`);

      ws.onopen = () => {
        reconnectAttemptRef.current = 0;
        setIsConnected(true);
        setError(null);

        // Start ping keep-alive
        clearPingInterval();
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, PING_INTERVAL_MS);
      };

      ws.onclose = (event) => {
        wsRef.current = null;
        setIsConnected(false);
        clearPingInterval();

        // Don't reconnect for normal closure or auth failure
        if (event.code === 1000 || event.code === 4001) {
          if (event.code === 4001) {
            setError("Authentication failed. Please refresh the page.");
          }
          return;
        }

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay =
            RECONNECT_DELAYS[reconnectAttemptRef.current] || 16000;
          reconnectAttemptRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setError("Connection lost. Please refresh the page.");
        }
      };

      ws.onerror = () => {
        // onerror fires before onclose -- actual handling happens in onclose
      };

      ws.onmessage = (event) => {
        if (!event.data || event.data.trim() === "") {
          return;
        }

        try {
          const data: unknown = JSON.parse(event.data);

          if (!isValidWSData(data)) {
            return;
          }

          handleMessage(data);
        } catch {
          // Ignore unparseable messages
        }
      };

      wsRef.current = ws;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    }
  }, [getToken, handleMessage, clearPingInterval]);

  // =============================================================================
  // Send Message
  // =============================================================================

  const sendMessage = useCallback(
    async (message: string): Promise<void> => {
      if (!agentNameRef.current) {
        throw new Error("No agent selected");
      }

      setError(null);

      // Create placeholder messages
      const userMsgId = `user-${Date.now()}`;
      const assistantMsgId = `assistant-${Date.now()}`;

      // Set up streaming refs BEFORE state update to prevent race condition
      // where early chunks arrive before the ref is set
      currentAssistantIdRef.current = assistantMsgId;
      streamContentRef.current = "";

      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content: message },
        { id: assistantMsgId, role: "assistant", content: "" },
      ]);
      setIsStreaming(true);

      try {
        // Ensure WebSocket is connected (lazy connect)
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          await connect();

          // Wait for connection to be established
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("Connection timeout"));
            }, CONNECTION_TIMEOUT_MS);

            const checkConnection = setInterval(() => {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                clearTimeout(timeout);
                clearInterval(checkConnection);
                resolve();
              }
            }, 100);
          });
        }

        // Send plaintext message
        wsRef.current!.send(
          JSON.stringify({
            type: "agent_chat",
            agent_name: agentNameRef.current,
            message,
          }),
        );
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to send message";
        setError(errorMessage);

        // Update assistant placeholder with error
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, content: `Error: ${errorMessage}` }
              : msg,
          ),
        );

        setIsStreaming(false);
        currentAssistantIdRef.current = null;
        streamContentRef.current = "";
      }
    },
    [connect],
  );

  // =============================================================================
  // Clear Messages
  // =============================================================================

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    setIsStreaming(false);
    currentAssistantIdRef.current = null;
    streamContentRef.current = "";
  }, []);

  // =============================================================================
  // Clear messages and close connection when agentName changes
  // =============================================================================

  const prevAgentNameRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // On initial mount, just record the agentName
    if (prevAgentNameRef.current === undefined) {
      prevAgentNameRef.current = agentName;
      return;
    }

    // Agent changed -- clear state
    if (prevAgentNameRef.current !== agentName) {
      clearMessages();
      prevAgentNameRef.current = agentName;
    }
  }, [agentName, clearMessages]);

  // =============================================================================
  // Close WebSocket when agentName becomes null or on unmount
  // =============================================================================

  useEffect(() => {
    if (agentName === null) {
      // Close existing connection when no agent selected
      clearReconnectTimeout();
      clearPingInterval();
      if (wsRef.current) {
        wsRef.current.close(1000, "No agent selected");
        wsRef.current = null;
      }
      setIsConnected(false);
    }
  }, [agentName, clearReconnectTimeout, clearPingInterval]);

  useEffect(() => {
    return () => {
      clearReconnectTimeout();
      clearPingInterval();
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmounted");
        wsRef.current = null;
      }
    };
  }, [clearReconnectTimeout, clearPingInterval]);

  // =============================================================================
  // Project external interface (strip internal IDs from messages)
  // =============================================================================

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

