"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";

import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { useEncryption } from "@/hooks/useEncryption";
import { useAgentChat } from "@/hooks/useAgentChat";
import { SetupEncryptionPrompt } from "@/components/encryption/SetupEncryptionPrompt";
import { UnlockEncryptionPrompt } from "@/components/encryption/UnlockEncryptionPrompt";
import { EncryptionStatusBadge } from "@/components/encryption/EncryptionStatusBadge";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

// Convert ChatMessage to legacy Message format for MessageList
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  model?: string;
}

interface AgentChatWindowProps {
  agentName: string | null;
}

export function AgentChatWindow({ agentName }: AgentChatWindowProps): React.ReactElement {
  const encryption = useEncryption();
  const {
    messages: chatMessages,
    isStreaming,
    error: chatError,
    connectionState,
    sendMessage,
    clearMessages,
  } = useAgentChat();

  // Determine if encryption is ready for chat
  const isEncryptionReady = encryption.state.isSetup && encryption.state.isUnlocked;
  const isInitialState = chatMessages.length === 0;
  const isTyping = isStreaming;

  // Track previous agentName to detect agent changes
  const prevAgentNameRef = useRef<string | null | undefined>(undefined);

  // Clear messages when agent changes (but not on initial mount)
  useEffect(() => {
    if (prevAgentNameRef.current !== undefined && prevAgentNameRef.current !== agentName) {
      clearMessages();
    }
    prevAgentNameRef.current = agentName;
  }, [agentName, clearMessages]);

  // Handle sending a message
  const handleSend = useCallback(async (content: string): Promise<void> => {
    if (!isEncryptionReady) {
      console.error("Encryption not ready");
      return;
    }
    if (!agentName) {
      console.error("No agent selected");
      return;
    }

    try {
      await sendMessage(agentName, content);
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  }, [sendMessage, agentName, isEncryptionReady]);

  // Convert ChatMessage to Message[] for MessageList
  const messages: Message[] = useMemo(() =>
    chatMessages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      thinking: msg.thinking,
      model: msg.model,
    })),
    [chatMessages]
  );

  // --- Encryption Guards ---

  // Show loading state only during initial encryption status fetch
  if (encryption.state.isLoading && encryption.state.isSetup === false && encryption.state.publicKey === null) {
    return (
      <div className="flex flex-col h-full items-center justify-center">
        <div className="animate-pulse text-muted-foreground">
          Loading encryption status...
        </div>
      </div>
    );
  }

  // Show setup prompt if encryption not set up
  if (!encryption.state.isSetup) {
    return (
      <div className="flex flex-col h-full">
        <div className="absolute top-4 right-4 z-20">
          <div className="flex items-center gap-2">
            <EncryptionStatusBadge />
            <Link href="/settings/encryption">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <SetupEncryptionPrompt />
        </div>
      </div>
    );
  }

  // Show unlock prompt if encryption is locked
  if (!encryption.state.isUnlocked) {
    return (
      <div className="flex flex-col h-full">
        <div className="absolute top-4 right-4 z-20">
          <div className="flex items-center gap-2">
            <EncryptionStatusBadge />
            <Link href="/settings/encryption">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <UnlockEncryptionPrompt />
        </div>
      </div>
    );
  }

  // --- No agent selected ---
  if (!agentName) {
    return (
      <div className="flex flex-col h-full bg-background/20">
        <div className="absolute top-4 right-4 z-20">
          <div className="flex items-center gap-2">
            <EncryptionStatusBadge />
            <Link href="/settings/encryption">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="text-center">
            <p className="text-muted-foreground text-lg font-light">
              Select an agent to start chatting
            </p>
          </div>
        </div>
      </div>
    );
  }

  // --- Connection status indicator ---
  const connectionIndicator = (connectionState === 'connecting' || connectionState === 'error') ? (
    <div className={`px-3 py-1.5 rounded text-xs font-medium ${
      connectionState === 'connecting'
        ? 'bg-yellow-900/30 text-yellow-300'
        : 'bg-red-900/30 text-red-300'
    }`}>
      {connectionState === 'connecting' ? 'Connecting...' : 'Connection error'}
    </div>
  ) : null;

  // --- Error state ---
  if (chatError) {
    return (
      <div className="flex flex-col h-full bg-background/20">
        <div className="absolute top-4 right-4 z-20">
          <div className="flex items-center gap-2">
            {connectionIndicator}
            <EncryptionStatusBadge />
            <Link href="/settings/encryption">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
        <div className="flex-1 flex flex-col">
          {messages.length > 0 && (
            <MessageList messages={messages} isTyping={isTyping} />
          )}
          <div
            className="p-4 m-4 bg-red-900/20 text-red-300 rounded-lg"
            data-testid="encryption-error"
          >
            <p className="font-medium">Encryption Error</p>
            <p className="text-sm">{chatError}</p>
          </div>
          <ChatInput
            onSend={handleSend}
            disabled={isTyping}
          />
        </div>
      </div>
    );
  }

  // --- Initial state: no messages yet ---
  if (isInitialState) {
    return (
      <div className="flex flex-col h-full bg-background/20">
        <div className="absolute top-4 right-4 z-20">
          <div className="flex items-center gap-2">
            {connectionIndicator}
            <EncryptionStatusBadge />
            <Link href="/settings/encryption">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent">
                <Settings className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-3 text-foreground tracking-tight font-host">{agentName}</h1>
            <p className="text-muted-foreground text-lg font-light">
              Start a conversation with your agent
            </p>
          </div>

          <div className="w-full max-w-2xl">
            <ChatInput
              onSend={handleSend}
              disabled={isTyping}
              centered
            />
          </div>
        </div>
      </div>
    );
  }

  // --- Normal chat state ---
  return (
    <div className="flex flex-col h-full min-h-0 bg-background/20">
      <div className="absolute top-4 right-4 z-20">
        <div className="flex items-center gap-2">
          {connectionIndicator}
          <EncryptionStatusBadge />
          <Link href="/settings/encryption">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-accent">
              <Settings className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
      <MessageList messages={messages} isTyping={isTyping} />
      <ChatInput
        onSend={handleSend}
        disabled={isTyping}
      />
    </div>
  );
}
