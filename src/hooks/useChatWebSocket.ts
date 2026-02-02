/**
 * WebSocket-based encrypted chat hook with streaming support.
 *
 * This hook provides the SAME interface as useChat (UseChatReturn) but uses
 * WebSocket instead of SSE for streaming. This enables:
 * - True real-time streaming without buffering
 * - Automatic reconnection with exponential backoff
 * - Ping/pong keepalive to maintain connection
 *
 * Encryption Flow (identical to SSE):
 * 1. Generate ephemeral transport keypair for response decryption
 * 2. Encrypt message to enclave's public key
 * 3. Re-encrypt history for enclave
 * 4. Stream encrypted response chunks over WebSocket
 * 5. Decrypt each chunk with transport private key
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { BACKEND_URL } from '@/lib/api';
import { useEncryption } from './useEncryption';
import type { ChatMessage, UseChatOptions, UseChatReturn } from './useChat';
import type {
  SerializedEncryptedPayload,
  EncryptedMessage,
} from '@/lib/crypto/message-crypto';

// =============================================================================
// Constants
// =============================================================================

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]; // Exponential backoff
const PING_INTERVAL_MS = 30000; // 30 seconds

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
  let wsUrl = BACKEND_URL
    .replace(/^https:\/\//, 'wss://')
    .replace(/^http:\/\//, 'ws://')
    .replace('api-', 'ws-')
    .replace(/\/api\/v1$/, ''); // Remove path suffix

  // Handle localhost case
  if (wsUrl.includes('localhost')) {
    wsUrl = wsUrl.replace(/\/api\/v1$/, '');
  }

  return wsUrl;
}

// =============================================================================
// WebSocket Message Types
// =============================================================================

interface WSSessionData {
  type: 'session';
  session_id: string;
}

interface WSEncryptedChunkData {
  type: 'encrypted_chunk';
  encrypted_content: SerializedEncryptedPayload;
}

interface WSThinkingChunkData {
  type: 'thinking';
  encrypted_content: SerializedEncryptedPayload;
}

interface WSDoneData {
  type: 'done';
  stored_user_message?: SerializedEncryptedPayload;
  stored_assistant_message?: SerializedEncryptedPayload;
}

interface WSErrorData {
  type: 'error';
  message: string;
}

interface WSStoredData {
  type: 'stored';
  model_used: string;
  input_tokens: number;
  output_tokens: number;
}

interface WSPingData {
  type: 'ping';
}

interface WSPongData {
  type: 'pong';
}

type WSData =
  | WSSessionData
  | WSEncryptedChunkData
  | WSThinkingChunkData
  | WSDoneData
  | WSStoredData
  | WSErrorData
  | WSPingData
  | WSPongData;

function isValidWSData(data: unknown): data is WSData {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;

  if (obj.type === 'session' && typeof obj.session_id === 'string') return true;
  if (obj.type === 'encrypted_chunk' && typeof obj.encrypted_content === 'object')
    return true;
  if (obj.type === 'thinking' && typeof obj.encrypted_content === 'object')
    return true;
  if (obj.type === 'done') return true;
  if (obj.type === 'stored') return true;
  if (obj.type === 'error' && typeof obj.message === 'string') return true;
  if (obj.type === 'ping') return true;
  if (obj.type === 'pong') return true;

  return false;
}

// =============================================================================
// Connection State
// =============================================================================

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// =============================================================================
// Hook Implementation
// =============================================================================

export function useChatWebSocket(options: UseChatOptions = {}): UseChatReturn {
  const { initialSessionId, orgId, onSessionChange } = options;
  const { getToken } = useAuth();
  const encryption = useEncryption();
  const isOrgContext = !!orgId;

  // State
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(
    initialSessionId ?? null
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');

  // Refs for WebSocket management
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track current streaming message for updates
  const currentAssistantMsgIdRef = useRef<string | null>(null);
  const fullContentRef = useRef<string>('');

  // Pending message to send after connection
  const pendingMessageRef = useRef<{
    content: string;
    model: string;
    resolve: () => void;
    reject: (error: Error) => void;
  } | null>(null);

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
    (data: WSData) => {
      if (data.type === 'ping') {
        // Respond to server ping
        wsRef.current?.send(JSON.stringify({ type: 'pong' }));
        return;
      }

      if (data.type === 'pong') {
        // Server acknowledged our ping
        return;
      }

      if (data.type === 'session') {
        setSessionId(data.session_id);
        onSessionChange?.(data.session_id);
        window.dispatchEvent(new CustomEvent('sessionUpdated'));
      } else if (data.type === 'encrypted_chunk') {
        // Decrypt content chunk
        const decryptedChunk = encryption.decryptTransportResponse(
          data.encrypted_content
        );
        fullContentRef.current += decryptedChunk;
        console.log(`[WS] Chunk received at ${Date.now()}: "${decryptedChunk}"`);

        // Update message content
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === currentAssistantMsgIdRef.current
              ? { ...msg, content: fullContentRef.current }
              : msg
          )
        );
      } else if (data.type === 'thinking') {
        // Decrypt thinking chunk
        const decryptedThinking = encryption.decryptTransportResponse(
          data.encrypted_content
        );

        // Update assistant message with thinking state
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === currentAssistantMsgIdRef.current
              ? { ...msg, thinking: (msg.thinking || '') + decryptedThinking }
              : msg
          )
        );
      } else if (data.type === 'stored') {
        console.log('\n[WS] Event [stored]');
        console.log('  model_used:', data.model_used);
        console.log('  input_tokens:', data.input_tokens);
        console.log('  output_tokens:', data.output_tokens);
      } else if (data.type === 'done') {
        // Update messages with stored payloads for future re-encryption
        setMessages((prev) =>
          prev.map((msg) => {
            // Find the user message (the one before the current assistant message)
            const assistantIdx = prev.findIndex(
              (m) => m.id === currentAssistantMsgIdRef.current
            );
            const userMsgId = assistantIdx > 0 ? prev[assistantIdx - 1].id : null;

            if (msg.id === userMsgId && data.stored_user_message) {
              return { ...msg, encryptedPayload: data.stored_user_message };
            }
            if (msg.id === currentAssistantMsgIdRef.current) {
              return {
                ...msg,
                isStreaming: false,
                encryptedPayload: data.stored_assistant_message,
              };
            }
            return msg;
          })
        );

        setIsStreaming(false);
        currentAssistantMsgIdRef.current = null;
        fullContentRef.current = '';
      } else if (data.type === 'error') {
        setError(data.message);
        setIsStreaming(false);

        // Update assistant message with error
        if (currentAssistantMsgIdRef.current) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === currentAssistantMsgIdRef.current
                ? { ...msg, content: `Error: ${data.message}`, isStreaming: false }
                : msg
            )
          );
        }

        currentAssistantMsgIdRef.current = null;
        fullContentRef.current = '';
      }
    },
    [encryption, onSessionChange]
  );

  // =============================================================================
  // WebSocket Connection
  // =============================================================================

  const connect = useCallback(async (): Promise<void> => {
    // Don't connect if already connected or connecting
    if (
      wsRef.current?.readyState === WebSocket.OPEN ||
      wsRef.current?.readyState === WebSocket.CONNECTING
    ) {
      return;
    }

    setConnectionState('connecting');

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated');
      }

      const wsUrl = getWebSocketUrl();
      // API Gateway WebSocket doesn't use path routing - connect to root with token
      const ws = new WebSocket(`${wsUrl}?token=${token}`);

      ws.onopen = () => {
        console.log('[WS] Connected');
        reconnectAttemptRef.current = 0;
        setConnectionState('connected');
        setError(null);

        // Start ping interval to keep connection alive
        clearPingInterval();
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, PING_INTERVAL_MS);

        // Send pending message if any
        if (pendingMessageRef.current) {
          const { resolve } = pendingMessageRef.current;
          // The actual message sending will be handled by sendMessage
          // Just resolve to signal we're connected
          resolve();
        }
      };

      ws.onclose = (event) => {
        console.log(`[WS] Closed: code=${event.code}, reason=${event.reason}`);
        wsRef.current = null;
        setConnectionState('disconnected');
        clearPingInterval();

        // Don't reconnect for normal closure or auth failure
        if (event.code === 1000 || event.code === 4001) {
          if (event.code === 4001) {
            setError('Authentication failed. Please refresh the page.');
          }
          return;
        }

        // Attempt reconnection with exponential backoff
        if (reconnectAttemptRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = RECONNECT_DELAYS[reconnectAttemptRef.current] || 16000;
          console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttemptRef.current + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          reconnectAttemptRef.current++;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        } else {
          setConnectionState('error');
          setError('Connection lost. Please refresh the page.');
        }
      };

      ws.onerror = (event) => {
        console.error('[WS] Error:', event);
      };

      ws.onmessage = (event) => {
        // Ignore empty messages (e.g., from HTTP integration response forwarding)
        if (!event.data || event.data.trim() === '') {
          return;
        }

        try {
          const data: unknown = JSON.parse(event.data);

          if (!isValidWSData(data)) {
            console.warn('[WS] Invalid message data:', data);
            return;
          }

          handleMessage(data);
        } catch (parseError) {
          console.error('[WS] Failed to parse message:', parseError);
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('[WS] Connection error:', err);
      setConnectionState('error');
      setError(err instanceof Error ? err.message : 'Failed to connect');

      // Reject pending message
      if (pendingMessageRef.current) {
        pendingMessageRef.current.reject(
          err instanceof Error ? err : new Error('Failed to connect')
        );
        pendingMessageRef.current = null;
      }
    }
  }, [getToken, handleMessage, clearPingInterval]);

  // =============================================================================
  // Load Session Messages
  // =============================================================================

  const loadSession = useCallback(
    async (id: string): Promise<void> => {
      // In org context, need org key unlocked; in personal context, need personal key
      if (isOrgContext) {
        if (!encryption.isOrgUnlocked) {
          throw new Error('Organization encryption keys not unlocked');
        }
      } else {
        if (!encryption.state.isUnlocked) {
          throw new Error('Encryption keys not unlocked');
        }
      }

      try {
        const token = await getToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        // Include org_id in query if in org context
        const url = new URL(`${BACKEND_URL}/chat/sessions/${id}/messages`);
        if (orgId) {
          url.searchParams.set('org_id', orgId);
        }

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!res.ok) {
          throw new Error('Failed to load session messages');
        }

        const data = await res.json();

        // Check if messages are encrypted
        if (data.messages?.[0]?.encrypted_content) {
          // Decrypt messages
          const encryptedMessages: EncryptedMessage[] = data.messages.map(
            (msg: { role: 'user' | 'assistant'; encrypted_content: SerializedEncryptedPayload }) => ({
              role: msg.role,
              encrypted_content: msg.encrypted_content,
            })
          );

          const decryptedContents =
            encryption.decryptStoredMessages(encryptedMessages, isOrgContext);

          const loadedMessages: ChatMessage[] = data.messages.map(
            (
              msg: { id: string; role: 'user' | 'assistant'; encrypted_content: SerializedEncryptedPayload },
              index: number
            ) => ({
              id: msg.id,
              role: msg.role,
              content: decryptedContents[index],
              encryptedPayload: msg.encrypted_content,
            })
          );

          setMessages(loadedMessages);
        } else {
          // Fallback for unencrypted messages (legacy)
          const loadedMessages: ChatMessage[] = data.messages.map(
            (msg: { id: string; role: 'user' | 'assistant'; content: string }) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
            })
          );
          setMessages(loadedMessages);
        }

        setSessionId(id);
        setError(null);
      } catch (err) {
        console.error('Failed to load session:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to load session'
        );
        throw err;
      }
    },
    [encryption, getToken, isOrgContext, orgId]
  );

  // =============================================================================
  // Send Message
  // =============================================================================

  const sendMessage = useCallback(
    async (content: string, model: string): Promise<void> => {
      console.log('\n' + '='.repeat(80));
      console.log('[WS] ENCRYPTED CHAT FLOW - FRONTEND');
      console.log('='.repeat(80));

      // In org context, need org key unlocked; in personal context, need personal key
      if (isOrgContext) {
        if (!encryption.isOrgUnlocked) {
          throw new Error('Organization encryption keys not unlocked');
        }
      } else {
        if (!encryption.state.isUnlocked) {
          throw new Error('Encryption keys not unlocked');
        }
      }
      if (!encryption.state.enclavePublicKey) {
        throw new Error('Enclave public key not available');
      }

      // Clear previous error
      setError(null);

      // Create placeholder messages
      const userMsgId = `user-${Date.now()}`;
      const assistantMsgId = `assistant-${Date.now()}`;

      const userMessage: ChatMessage = {
        id: userMsgId,
        role: 'user',
        content,
      };

      const assistantMessage: ChatMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        model: model,
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      // Store assistant message ID for updates
      currentAssistantMsgIdRef.current = assistantMsgId;
      fullContentRef.current = '';

      try {
        // Ensure WebSocket is connected
        if (wsRef.current?.readyState !== WebSocket.OPEN) {
          await connect();

          // Wait for connection to be established
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error('Connection timeout'));
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

        // Prepare encrypted history (messages that have encrypted payloads)
        const historyMessages = messages.filter((m) => m.encryptedPayload);
        const encryptedHistory =
          historyMessages.length > 0
            ? encryption.prepareHistoryForTransport(
                historyMessages.map((m) => ({
                  role: m.role,
                  encrypted_content: m.encryptedPayload!,
                })),
                isOrgContext
              )
            : [];

        if (historyMessages.length > 0) {
          console.log('\n[WS] Re-encrypt History for Enclave');
          console.log('-'.repeat(60));
          console.log('History messages count:', historyMessages.length);
        }

        // Send message over WebSocket
        const payload = {
          session_id: sessionId,
          encrypted_message: encryptedMessage,
          encrypted_history: encryptedHistory,
          client_transport_public_key: transportKeypair.publicKey,
          model,
          ...(orgId && { org_id: orgId }),
        };

        wsRef.current!.send(JSON.stringify(payload));
      } catch (err) {
        console.error('[WS] Send message error:', err);
        const errorMessage =
          err instanceof Error ? err.message : 'Failed to send message';
        setError(errorMessage);

        // Update assistant message with error
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, content: `Error: ${errorMessage}`, isStreaming: false }
              : msg
          )
        );

        setIsStreaming(false);
        currentAssistantMsgIdRef.current = null;
        fullContentRef.current = '';
      }
    },
    [encryption, messages, sessionId, isOrgContext, orgId, connect]
  );

  // =============================================================================
  // Clear Session
  // =============================================================================

  const clearSession = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setError(null);
    currentAssistantMsgIdRef.current = null;
    fullContentRef.current = '';
  }, []);

  // =============================================================================
  // Abort
  // =============================================================================

  const abort = useCallback(() => {
    // Close the WebSocket to stop streaming
    if (wsRef.current) {
      wsRef.current.close(1000, 'User aborted');
      wsRef.current = null;
    }
    setIsStreaming(false);
    currentAssistantMsgIdRef.current = null;
    fullContentRef.current = '';
  }, []);

  // =============================================================================
  // Cleanup on Unmount
  // =============================================================================

  useEffect(() => {
    return () => {
      clearReconnectTimeout();
      clearPingInterval();
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounted');
        wsRef.current = null;
      }
    };
  }, [clearReconnectTimeout, clearPingInterval]);

  // =============================================================================
  // Return Interface (matches UseChatReturn)
  // =============================================================================

  return {
    messages,
    sessionId,
    isStreaming,
    error,
    sendMessage,
    loadSession,
    clearSession,
    abort,
  };
}

// Export connection state type for components that need it
export type { ConnectionState };
