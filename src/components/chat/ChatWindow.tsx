"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { useEncryption } from "@/hooks/useEncryption";
import { useChatWebSocket as useChat } from "@/hooks/useChatWebSocket";
import { useOrgEncryptionStatus } from "@/hooks/useOrgEncryptionStatus";
import { useModels } from "@/hooks/useModels";
import { useOrgContext } from "@/components/providers/OrganizationProvider";
import { SetupEncryptionPrompt } from "@/components/encryption/SetupEncryptionPrompt";
import { UnlockEncryptionPrompt } from "@/components/encryption/UnlockEncryptionPrompt";
import { OrgEncryptionSetupPrompt } from "@/components/encryption/OrgEncryptionSetupPrompt";
import { AwaitingOrgEncryption } from "@/components/encryption/AwaitingOrgEncryption";
import { AwaitingOrgKeyDistribution } from "@/components/encryption/AwaitingOrgKeyDistribution";
import { EncryptionStatusBadge } from "@/components/encryption/EncryptionStatusBadge";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";



// Convert ChatMessage to legacy Message format for MessageList
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function ChatWindow(): React.ReactElement {
  const encryption = useEncryption();
  const { orgId, isOrgAdmin } = useOrgContext();
  const orgEncryption = useOrgEncryptionStatus(orgId);
  const encryptedChat = useChat({
    orgId,
    onSessionChange: () => {
      window.dispatchEvent(new CustomEvent("sessionUpdated"));
    },
  });

  const { models } = useModels();
  const [userSelectedModel, setUserSelectedModel] = useState<string>("");

  // Derive effective model: use user selection if valid, otherwise default to first model
  const selectedModel = useMemo(() => {
    if (userSelectedModel && models.some(m => m.id === userSelectedModel)) {
      return userSelectedModel;
    }
    return models.length > 0 ? models[0].id : "";
  }, [userSelectedModel, models]);

  // Determine if encryption is ready for chat
  const isEncryptionReady = encryption.state.isSetup && encryption.state.isUnlocked;
  // Only show welcome screen if: no messages AND not loading AND no session selected
  // If a session is selected (even with 0 messages), show the chat view, not welcome
  const isInitialState = encryptedChat.messages.length === 0
    && !encryptedChat.isLoadingSession
    && !encryptedChat.sessionId;
  const isTyping = encryptedChat.isStreaming;
  const isLoadingSession = encryptedChat.isLoadingSession;

  // Debug logging for session state
  console.log(`[ChatWindow] Render state:`, {
    messagesCount: encryptedChat.messages.length,
    sessionId: encryptedChat.sessionId,
    isLoadingSession,
    isInitialState,
    orgId
  });

  // Track previous orgId to detect context changes
  const prevOrgIdRef = useRef<string | null | undefined>(undefined);

  // Clear session when org context changes (but not on initial mount)
  useEffect(() => {
    // Skip initial mount (when prevOrgIdRef is undefined)
    if (prevOrgIdRef.current !== undefined && prevOrgIdRef.current !== orgId) {
      encryptedChat.clearSession();
    }
    prevOrgIdRef.current = orgId;
  }, [orgId, encryptedChat.clearSession]);

  // Handle new chat event
  useEffect(() => {
    function handleNewChat(): void {
      encryptedChat.clearSession();
    }
    window.addEventListener("newChat", handleNewChat);
    return () => window.removeEventListener("newChat", handleNewChat);
  }, [encryptedChat.clearSession]);

  // Handle session selection event
  useEffect(() => {
    async function handleSelectSession(e: Event): Promise<void> {
      const customEvent = e as CustomEvent<{ sessionId: string }>;
      const selectedSessionId = customEvent.detail.sessionId;
      console.log(`[ChatWindow] selectSession event received for: ${selectedSessionId}`);

      try {
        await encryptedChat.loadSession(selectedSessionId);
        console.log(`[ChatWindow] loadSession completed, messages count: ${encryptedChat.messages.length}`);
      } catch (err) {
        console.error("[ChatWindow] Failed to load session:", err);
      }
    }

    window.addEventListener("selectSession", handleSelectSession);
    return () => window.removeEventListener("selectSession", handleSelectSession);
  }, [encryptedChat.loadSession]);

  // Auto-unlock org key when personal keys are unlocked and user has distributed key
  useEffect(() => {
    if (
      encryption.state.isUnlocked &&
      orgId &&
      orgEncryption.userHasOrgKey &&
      orgEncryption.encryptedOrgKey &&
      !encryption.isOrgUnlocked
    ) {
      try {
        encryption.unlockOrgKey(orgEncryption.encryptedOrgKey);
      } catch (err) {
        console.error("Failed to auto-unlock org key:", err);
      }
    }
  }, [
    encryption.state.isUnlocked,
    orgId,
    orgEncryption.userHasOrgKey,
    orgEncryption.encryptedOrgKey,
    encryption.isOrgUnlocked,
    encryption,
  ]);

  // Handle sending a message
  const handleSend = useCallback(async (content: string): Promise<void> => {
    if (!isEncryptionReady) {
      console.error("Encryption not ready");
      return;
    }

    try {
      await encryptedChat.sendMessage(content, selectedModel);
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  }, [encryptedChat, selectedModel, isEncryptionReady]);

  // Convert ChatMessage to Message[] for MessageList
  // Memoized to prevent unnecessary re-renders when parent state changes
  const messages: Message[] = useMemo(() =>
    encryptedChat.messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      thinking: msg.thinking,
      model: msg.model,
    })),
    [encryptedChat.messages]
  );

  // Show loading state only during initial encryption status fetch
  // (not during setup - SetupEncryptionPrompt handles its own loading state)
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

  // ===== ORGANIZATION ENCRYPTION CHECKS =====
  // Only run when in organization context (orgId is present)
  if (orgId) {
    // Loading org encryption status
    if (orgEncryption.isLoading) {
      return (
        <div className="flex flex-col h-full items-center justify-center">
          <div className="animate-pulse text-muted-foreground">
            Checking organization encryption...
          </div>
        </div>
      );
    }

    // Case 1: Org has no encryption set up
    if (!orgEncryption.orgHasEncryption) {
      if (isOrgAdmin) {
        // Admin can set up org encryption
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
              <OrgEncryptionSetupPrompt orgId={orgId} onSuccess={orgEncryption.refetch} />
            </div>
          </div>
        );
      } else {
        // Member must wait for admin to set up encryption
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
              <AwaitingOrgEncryption />
            </div>
          </div>
        );
      }
    }

    // Case 2: Org has encryption but user doesn't have distributed key
    if (!orgEncryption.userHasOrgKey) {
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
            <AwaitingOrgKeyDistribution />
          </div>
        </div>
      );
    }

    // Case 3: User has key - auto-unlock happens via useEffect above
    // If org key is not yet unlocked, show loading while auto-unlock happens
    if (!encryption.isOrgUnlocked) {
      return (
        <div className="flex flex-col h-full items-center justify-center">
          <div className="animate-pulse text-muted-foreground">
            Unlocking organization encryption...
          </div>
        </div>
      );
    }
  }

  // Show error message if there's an encryption error
  if (encryptedChat.error) {
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
        <div className="flex-1 flex flex-col">
          {messages.length > 0 && (
            <MessageList messages={messages} isTyping={isTyping} />
          )}
          <div
            className="p-4 m-4 bg-red-900/20 text-red-300 rounded-lg"
            data-testid="encryption-error"
          >
            <p className="font-medium">Encryption Error</p>
            <p className="text-sm">{encryptedChat.error}</p>
          </div>
          <ChatInput 
            onSend={handleSend} 
            disabled={isTyping} 
            models={models}
            selectedModel={selectedModel}
            onModelChange={setUserSelectedModel}
          />
        </div>
      </div>
    );
  }

  // Initial state - show welcome screen
  // Initial state - show welcome screen
  if (isInitialState) {
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
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold mb-3 text-foreground tracking-tight font-host">Isol8</h1>
            <p className="text-muted-foreground text-lg font-light">
              Secure, encrypted conversations
            </p>
          </div>

          <div className="w-full max-w-2xl">
            <ChatInput 
                onSend={handleSend} 
                disabled={isTyping} 
                centered 
                models={models}
                selectedModel={selectedModel}
                onModelChange={setUserSelectedModel}
            />
          </div>
        </div>
      </div>
    );
  }

  // Normal chat state
  return (
    <div className="flex flex-col h-full min-h-0 bg-background/20">
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
      {isLoadingSession ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">
            Loading conversation...
          </div>
        </div>
      ) : (
        <MessageList messages={messages} isTyping={isTyping} />
      )}
      <ChatInput
        onSend={handleSend}
        disabled={isTyping || isLoadingSession}
        models={models}
        selectedModel={selectedModel}
        onModelChange={setUserSelectedModel}
      />
    </div>
  );
}
