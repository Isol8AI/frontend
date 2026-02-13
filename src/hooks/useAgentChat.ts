/**
 * WebSocket-based agent chat hook with streaming support.
 *
 * This hook provides encrypted agent chat functionality over WebSocket.
 * It follows the same connection/encryption pattern as useChatWebSocket but
 * is simplified for agent interactions:
 * - No session ID tracking (agents maintain their own state in encrypted tarballs)
 * - No encrypted history re-encryption (agent state handles this server-side)
 * - No org context (agents are personal only)
 * - No session cache
 * - Messages are local state only (cleared on agent switch)
 *
 * Encryption Flow:
 * 1. Generate ephemeral transport keypair for response decryption
 * 2. Encrypt message to enclave's public key
 * 3. Send over WebSocket with type "agent_chat"
 * 4. Stream encrypted response chunks over WebSocket
 * 5. Decrypt each chunk with transport private key
 */

"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { BACKEND_URL } from "@/lib/api";
import { useEncryption } from "./useEncryption";
import type { ChatMessage } from "./useChat";
import type { SerializedEncryptedPayload } from "@/lib/crypto/message-crypto";

// =============================================================================
// Constants
// =============================================================================

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff
const PING_INTERVAL_MS = 30000; // 30 seconds

// =============================================================================
// WebSocket URL
// =============================================================================

/**
 * Construct WebSocket URL from environment or BACKEND_URL.
 *
 * Priority:
 * 1. NEXT_PUBLIC_WS_URL environment variable
 * 2. Derive from BACKEND_URL by replacing api- with ws- and https with wss
 */
function getWebSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }

  // Derive from BACKEND_URL
  // e.g., https://api-dev.isol8.co/api/v1 -> wss://ws-dev.isol8.co
  let wsUrl = BACKEND_URL.replace(/^https:\/\//, "wss://")
    .replace(/^http:\/\//, "ws://")
    .replace("api-", "ws-")
    .replace(/\/api\/v1$/, ""); // Remove path suffix

  // Handle localhost case
  if (wsUrl.includes("localhost")) {
    wsUrl = wsUrl.replace(/\/api\/v1$/, "");
  }

  return wsUrl;
}

// =============================================================================
// WebSocket Message Types (Agent-specific)
// =============================================================================

interface WSAgentEncryptedChunkData {
  type: "encrypted_chunk";
  encrypted_content: SerializedEncryptedPayload;
}

interface WSAgentDoneData {
  type: "done";
}

interface WSAgentErrorData {
  type: "error";
  message: string;
}

interface WSAgentPingData {
  type: "ping";
}

interface WSAgentPongData {
  type: "pong";
}

type WSAgentData =
  | WSAgentEncryptedChunkData
  | WSAgentDoneData
  | WSAgentErrorData
  | WSAgentPingData
  | WSAgentPongData;

function isValidWSAgentData(data: unknown): data is WSAgentData {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;

  if (
    obj.type === "encrypted_chunk" &&
    typeof obj.encrypted_content === "object"
  )
    return true;
  if (obj.type === "done") return true;
  if (obj.type === "error" && typeof obj.message === "string") return true;
  if (obj.type === "ping") return true;
  if (obj.type === "pong") return true;

  return false;
}

// =============================================================================
// Connection State
// =============================================================================

type ConnectionState = "disconnected" | "connecting" | "connected" | "error";

// =============================================================================
// Return Interface
// =============================================================================

interface UseAgentChatReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  connectionState: ConnectionState;
  sendMessage: (
    agentName: string,
    content: string,
    soulContent?: string,
  ) => Promise<void>;
  clearMessages: () => void;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useAgentChat(): UseAgentChatReturn {
  const { getToken } = useAuth();
  const encryption = useEncryption();

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<ConnectionState>("disconnected");

  // Refs for WebSocket management
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track current streaming message for updates
  const currentAssistantMsgIdRef = useRef<string | null>(null);
  const fullContentRef = useRef<string>("");

  // =============================================================================
  // Cleanup Functions
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

  const handleMessage = useCallback(
    (data: WSAgentData) => {
      if (data.type === "ping") {
        // Respond to server ping
        wsRef.current?.send(JSON.stringify({ type: "pong" }));
        return;
      }

      if (data.type === "pong") {
        // Server acknowledged our ping
        return;
      }

      if (data.type === "encrypted_chunk") {
        // Decrypt content chunk
        const decryptedChunk = encryption.decryptTransportResponse(
          data.encrypted_content,
        );
        fullContentRef.current += decryptedChunk;

        // Update message content
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === currentAssistantMsgIdRef.current
              ? { ...msg, content: fullContentRef.current }
              : msg,
          ),
        );
      } else if (data.type === "done") {
        // Stream complete - agent state updated server-side
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === currentAssistantMsgIdRef.current
              ? { ...msg, isStreaming: false }
              : msg,
          ),
        );

        setIsStreaming(false);
        currentAssistantMsgIdRef.current = null;
        fullContentRef.current = "";
      } else if (data.type === "error") {
        setError(data.message);
        setIsStreaming(false);

        // Update assistant message with error
        if (currentAssistantMsgIdRef.current) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === currentAssistantMsgIdRef.current
                ? {
                    ...msg,
                    content: `Error: ${data.message}`,
                    isStreaming: false,
                  }
                : msg,
            ),
          );
        }

        currentAssistantMsgIdRef.current = null;
        fullContentRef.current = "";
      }
    },
    [encryption],
  );

  // =============================================================================
  // WebSocket Connection (Lazy - connects on first sendMessage)
  // =============================================================================

  const connect = useCallback(async (): Promise<void> => {
    // Don't connect if already connected or connecting
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    setConnectionState("connecting");

    try {
      const token = await getToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const wsUrl = getWebSocketUrl();
      // API Gateway WebSocket doesn't use path routing - connect to root with token
      const ws = new WebSocket(`${wsUrl}?token=${token}`);

      ws.onopen = () => {
        console.log("[AgentWS] Connected");
        reconnectAttemptRef.current = 0;
        setConnectionState("connected");
        setError(null);

        // Start ping interval to keep connection alive
        clearPingInterval();
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, PING_INTERVAL_MS);
      };

      ws.onclose = (event) => {
        console.log(
          `[AgentWS] Closed: code=${event.code}, reason=${event.reason}`,
        );
        wsRef.current = null;
        setConnectionState("disconnected");
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
          const delay = RECONNECT_DELAYS[reconnectAttemptRef.current] || 16000;
          console.log(
            `[AgentWS] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`,
          );
          reconnectAttemptRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setConnectionState("error");
          setError("Connection lost. Please refresh the page.");
        }
      };

      ws.onerror = (event) => {
        console.error("[AgentWS] Error:", event);
      };

      ws.onmessage = (event) => {
        // Ignore empty messages (e.g., from HTTP integration response forwarding)
        if (!event.data || event.data.trim() === "") {
          return;
        }

        try {
          const data: unknown = JSON.parse(event.data);

          if (!isValidWSAgentData(data)) {
            console.warn("[AgentWS] Invalid message data:", data);
            return;
          }

          handleMessage(data);
        } catch (parseError) {
          console.error("[AgentWS] Failed to parse message:", parseError);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error("[AgentWS] Connection error:", err);
      setConnectionState("error");
      setError(err instanceof Error ? err.message : "Failed to connect");
    }
  }, [getToken, handleMessage, clearPingInterval]);

  // =============================================================================
  // Send Message
  // =============================================================================

  const sendMessage = useCallback(
    async (
      agentName: string,
      content: string,
      soulContent?: string,
    ): Promise<void> => {
      if (!encryption.state.isUnlocked) {
        throw new Error("Encryption keys not unlocked");
      }
      if (!encryption.state.enclavePublicKey) {
        throw new Error("Enclave public key not available");
      }
      if (!encryption.getPrivateKey()) {
        throw new Error("User private key not available");
      }
      if (!encryption.state.publicKey) {
        throw new Error("User public key not available");
      }

      // Clear previous error
      setError(null);

      // Create placeholder messages
      const userMsgId = `user-${Date.now()}`;
      const assistantMsgId = `assistant-${Date.now()}`;

      const userMessage: ChatMessage = {
        id: userMsgId,
        role: "user",
        content,
      };

      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: "assistant",
        content: "",
        isStreaming: true,
      };

      // Store assistant message ID for updates BEFORE state update
      // This prevents race condition where early streaming chunks arrive
      // before the ref is set, causing updates to fail
      currentAssistantMsgIdRef.current = assistantMsgId;
      fullContentRef.current = "";

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      try {
        // Ensure WebSocket is connected (lazy connect)
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          await connect();

          // Wait for connection to be established
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("Connection timeout"));
            }, 10000);

            const checkConnection = setInterval(() => {
              if (wsRef.current?.readyState === WebSocket.OPEN) {
                clearTimeout(timeout);
                clearInterval(checkConnection);
                resolve();
              }
            }, 100);
          });
        }

        // Generate ephemeral transport keypair
        const transportKeypair = encryption.generateTransportKeypair();

        // Encrypt message to enclave
        const encryptedMessage = encryption.encryptMessage(content);

        // Fetch agent state and handle based on encryption mode
        let encryptedStateForEnclave = null;

        try {
          const token = await getToken();
          const stateResponse = await fetch(
            `${BACKEND_URL}/agents/${agentName}/state`,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          );

          if (stateResponse.ok) {
            const { encrypted_state, encryption_mode } = await stateResponse.json();

            if (encryption_mode === "zero_trust" && encrypted_state) {
              // Zero trust: client decrypts state, re-encrypts to enclave transport key
              const { encryptToPublicKey, decryptWithPrivateKey, hexToBytes } = await import(
                "@/lib/crypto/primitives"
              );

              const privateKeyHex = encryption.getPrivateKey()!;
              const privateKeyBytes = hexToBytes(privateKeyHex);

              const statePayload = {
                ephemeralPublicKey: new Uint8Array(
                  Buffer.from(encrypted_state.ephemeral_public_key, "hex")
                ),
                iv: new Uint8Array(Buffer.from(encrypted_state.iv, "hex")),
                ciphertext: new Uint8Array(
                  Buffer.from(encrypted_state.ciphertext, "hex")
                ),
                authTag: new Uint8Array(
                  Buffer.from(encrypted_state.auth_tag, "hex")
                ),
                hkdfSalt: new Uint8Array(
                  Buffer.from(encrypted_state.hkdf_salt, "hex")
                ),
              };

              const stateBytes = decryptWithPrivateKey(
                privateKeyBytes,
                statePayload,
                "agent-state-storage"
              );

              // Re-encrypt to enclave transport key
              const encryptedForEnclave = encryptToPublicKey(
                hexToBytes(encryption.state.enclavePublicKey!),
                stateBytes,
                "client-to-enclave-transport"
              );

              encryptedStateForEnclave = {
                ephemeral_public_key: Buffer.from(
                  encryptedForEnclave.ephemeralPublicKey
                ).toString("hex"),
                iv: Buffer.from(encryptedForEnclave.iv).toString("hex"),
                ciphertext: Buffer.from(encryptedForEnclave.ciphertext).toString(
                  "hex"
                ),
                auth_tag: Buffer.from(encryptedForEnclave.authTag).toString("hex"),
                hkdf_salt: Buffer.from(encryptedForEnclave.hkdfSalt).toString("hex"),
              };
            }
            // Background mode: no client-side state handling needed.
            // The backend fetches KMS-encrypted state and sends it to the enclave directly.
          }
        } catch (err) {
          console.warn("[AgentWS] Failed to fetch/process agent state:", err);
          // Continue without state - might be a new agent
        }

        // Build WebSocket payload
        const payload: Record<string, unknown> = {
          type: "agent_chat",
          agent_name: agentName,
          encrypted_message: encryptedMessage,
          client_transport_public_key: transportKeypair.publicKey,
          user_public_key: encryption.state.publicKey,
        };

        // Include re-encrypted state for zero trust mode
        if (encryptedStateForEnclave) {
          payload.encrypted_state = encryptedStateForEnclave;
        }

        // Encrypt and include soul content for new agents (first message only)
        if (soulContent) {
          payload.encrypted_soul_content =
            encryption.encryptMessage(soulContent);
        }

        wsRef.current!.send(JSON.stringify(payload));
      } catch (err) {
        console.error("[AgentWS] Send message error:", err);
        const errorMessage =
          err instanceof Error ? err.message : "Failed to send message";
        setError(errorMessage);

        // Update assistant message with error
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? {
                  ...msg,
                  content: `Error: ${errorMessage}`,
                  isStreaming: false,
                }
              : msg,
          ),
        );

        setIsStreaming(false);
        currentAssistantMsgIdRef.current = null;
        fullContentRef.current = "";
      }
    },
    [encryption, connect, getToken],
  );

  // =============================================================================
  // Clear Messages (called when switching agents)
  // =============================================================================

  const clearMessages = useCallback(() => {
    setMessages([]);
    setError(null);
    currentAssistantMsgIdRef.current = null;
    fullContentRef.current = "";
  }, []);

  // =============================================================================
  // Cleanup on Unmount
  // =============================================================================

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
  // Return Interface
  // =============================================================================

  return {
    messages,
    isStreaming,
    error,
    connectionState,
    sendMessage,
    clearMessages,
  };
}

// Export types for components that need them
export type { UseAgentChatReturn, ConnectionState };
