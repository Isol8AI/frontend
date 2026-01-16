/**
 * Encrypted chat hook with streaming support.
 *
 * This hook provides encrypted chat functionality:
 * - Encrypts outgoing messages to enclave
 * - Handles SSE streaming of encrypted responses
 * - Decrypts responses using ephemeral transport keys
 * - Loads and decrypts session history
 *
 * Encryption Flow:
 * 1. Generate ephemeral transport keypair for response decryption
 * 2. Encrypt message to enclave's public key
 * 3. Re-encrypt history for enclave
 * 4. Stream encrypted response chunks
 * 5. Decrypt each chunk with transport private key
 */

'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { BACKEND_URL } from '@/lib/api';
import { useEncryption } from './useEncryption';
import type {
  SerializedEncryptedPayload,
  EncryptedMessage,
} from '@/lib/crypto/message-crypto';

// =============================================================================
// Types
// =============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Original encrypted payload (for history re-encryption) */
  encryptedPayload?: SerializedEncryptedPayload;
  /** Whether this message is still streaming */
  isStreaming?: boolean;
}

export interface UseChatOptions {
  /** Initial session ID (for loading existing sessions) */
  initialSessionId?: string | null;
  /** Organization ID for org context (null = personal mode) */
  orgId?: string | null;
  /** Callback when session ID changes */
  onSessionChange?: (sessionId: string) => void;
}

export interface UseChatReturn {
  /** Current messages */
  messages: ChatMessage[];
  /** Current session ID */
  sessionId: string | null;
  /** Whether a message is currently streaming */
  isStreaming: boolean;
  /** Current error message */
  error: string | null;
  /** Send a new message */
  sendMessage: (content: string, model: string) => Promise<void>;
  /** Load messages for a session */
  loadSession: (sessionId: string) => Promise<void>;
  /** Clear the current session */
  clearSession: () => void;
  /** Abort current streaming request */
  abort: () => void;
}

// =============================================================================
// SSE Data Types
// =============================================================================

interface SSESessionData {
  type: 'session';
  session_id: string;
}

interface SSEEncryptedChunkData {
  type: 'encrypted_chunk';
  encrypted_content: SerializedEncryptedPayload;
}

interface SSEDoneData {
  type: 'done';
  stored_user_message?: SerializedEncryptedPayload;
  stored_assistant_message?: SerializedEncryptedPayload;
}

interface SSEErrorData {
  type: 'error';
  message: string;
}

type SSEData =
  | SSESessionData
  | SSEEncryptedChunkData
  | SSEDoneData
  | SSEErrorData;

function isValidSSEData(data: unknown): data is SSEData {
  if (typeof data !== 'object' || data === null) return false;
  const obj = data as Record<string, unknown>;

  if (obj.type === 'session' && typeof obj.session_id === 'string') return true;
  if (obj.type === 'encrypted_chunk' && typeof obj.encrypted_content === 'object')
    return true;
  if (obj.type === 'done') return true;
  if (obj.type === 'error' && typeof obj.message === 'string') return true;

  return false;
}

// =============================================================================
// Hook Implementation
// =============================================================================

export function useChat(options: UseChatOptions = {}): UseChatReturn {
  const { initialSessionId, orgId, onSessionChange } = options;
  const { getToken } = useAuth();
  const encryption = useEncryption();
  const isOrgContext = !!orgId;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(
    initialSessionId ?? null
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  // Load session messages
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

  // Send encrypted message
  const sendMessage = useCallback(
    async (content: string, model: string): Promise<void> => {
      console.log('\n' + '='.repeat(80));
      console.log('🔐 ENCRYPTED CHAT FLOW - FRONTEND');
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
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      // Abort any previous request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();

      try {
        const token = await getToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        // Step 1: Generate ephemeral transport keypair
        console.log('\n📤 STEP 1: Generate Ephemeral Transport Keypair');
        console.log('-'.repeat(60));
        const transportKeypair = encryption.generateTransportKeypair();
        console.log('Transport Public Key (full):', transportKeypair.publicKey);
        console.log('Transport Private Key (full - ephemeral, safe to log):', transportKeypair.privateKey);

        // Step 2: Encrypt message to enclave
        console.log('\n📤 STEP 2: Encrypt Message to Enclave');
        console.log('-'.repeat(60));
        console.log('Plaintext Message:', content);
        console.log('Enclave Public Key (full):', encryption.state.enclavePublicKey);
        const encryptedMessage = encryption.encryptMessage(content);
        console.log('Encrypted Payload (full):');
        console.log('  ephemeral_public_key:', encryptedMessage.ephemeral_public_key);
        console.log('  iv:', encryptedMessage.iv);
        console.log('  ciphertext:', encryptedMessage.ciphertext);
        console.log('  auth_tag:', encryptedMessage.auth_tag);
        console.log('  hkdf_salt:', encryptedMessage.hkdf_salt);

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
          console.log('\n📤 STEP 2b: Re-encrypt History for Enclave');
          console.log('-'.repeat(60));
          console.log('History messages count:', historyMessages.length);
        }

        // Step 3: Send request to backend
        console.log('\n📤 STEP 3: Send Encrypted Request to Backend');
        console.log('-'.repeat(60));
        console.log('Endpoint: POST /chat/encrypted/stream');
        console.log('Request Body:');
        console.log('  session_id:', sessionId);
        console.log('  model:', model);
        console.log('  client_transport_public_key:', transportKeypair.publicKey.substring(0, 32) + '...');
        console.log('  encrypted_message: [encrypted payload above]');
        console.log('  encrypted_history:', encryptedHistory.length, 'messages');

        const res = await fetch(`${BACKEND_URL}/chat/encrypted/stream`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            session_id: sessionId,
            encrypted_message: encryptedMessage,
            encrypted_history: encryptedHistory,
            client_transport_public_key: transportKeypair.publicKey,
            model,
            ...(orgId && { org_id: orgId }),
          }),
          signal: abortControllerRef.current.signal,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.detail || 'Failed to send message');
        }

        console.log('\n📥 STEP 4: Receive SSE Stream from Backend');
        console.log('-'.repeat(60));

        const reader = res.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        let fullContent = '';
        let storedUserPayload: SerializedEncryptedPayload | undefined;
        let storedAssistantPayload: SerializedEncryptedPayload | undefined;
        let chunkCount = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;

              try {
                const data: unknown = JSON.parse(line.slice(6));

                if (!isValidSSEData(data)) {
                  console.warn('Invalid SSE data:', data);
                  continue;
                }

                if (data.type === 'session') {
                  const newSessionId = data.session_id;
                  console.log('SSE Event [session]:', newSessionId);
                  setSessionId(newSessionId);
                  onSessionChange?.(newSessionId);
                  window.dispatchEvent(new CustomEvent('sessionUpdated'));
                } else if (data.type === 'encrypted_chunk') {
                  chunkCount++;
                  // Decrypt the chunk
                  console.log(`\n📥 STEP 5.${chunkCount}: Decrypt Chunk`);
                  console.log('-'.repeat(60));
                  console.log('Encrypted chunk received:');
                  console.log('  ephemeral_public_key:', data.encrypted_content.ephemeral_public_key.substring(0, 32) + '...');
                  console.log('  ciphertext:', data.encrypted_content.ciphertext.substring(0, 32) + '...');

                  const decryptedChunk = encryption.decryptTransportResponse(
                    data.encrypted_content
                  );
                  console.log('Decrypted chunk:', decryptedChunk);
                  fullContent += decryptedChunk;

                  // Update the assistant message
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMsgId
                        ? { ...msg, content: fullContent }
                        : msg
                    )
                  );
                } else if (data.type === 'done') {
                  console.log('\n✅ SSE Event [done]');
                  storedUserPayload = data.stored_user_message;
                  storedAssistantPayload = data.stored_assistant_message;
                } else if (data.type === 'error') {
                  throw new Error(data.message);
                }
              } catch (parseError) {
                if (parseError instanceof SyntaxError) continue;
                throw parseError;
              }
            }
          }
        } finally {
          reader.releaseLock();
        }

        console.log('\n📋 FINAL RESULT');
        console.log('-'.repeat(60));
        console.log('Total chunks received:', chunkCount);
        console.log('Full decrypted response:', fullContent);
        console.log('='.repeat(80) + '\n');

        // Update messages with stored payloads for future re-encryption
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.id === userMsgId && storedUserPayload) {
              return { ...msg, encryptedPayload: storedUserPayload };
            }
            if (msg.id === assistantMsgId) {
              return {
                ...msg,
                isStreaming: false,
                encryptedPayload: storedAssistantPayload,
              };
            }
            return msg;
          })
        );
      } catch (err) {
        // Don't show error for aborted requests
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }

        console.error('Send message error:', err);
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
      } finally {
        setIsStreaming(false);
      }
    },
    [encryption, getToken, messages, sessionId, onSessionChange, isOrgContext, orgId]
  );

  // Clear session
  const clearSession = useCallback(() => {
    setMessages([]);
    setSessionId(null);
    setError(null);
  }, []);

  // Abort current request
  const abort = useCallback(() => {
    abortControllerRef.current?.abort();
    setIsStreaming(false);
  }, []);

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
