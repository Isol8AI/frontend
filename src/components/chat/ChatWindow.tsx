"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";

import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { ModelSelector } from "./ModelSelector";
import { useApi } from "@/lib/api";
import { useEncryption } from "@/hooks/useEncryption";
import { useChat } from "@/hooks/useChat";
import { useOrgEncryptionStatus } from "@/hooks/useOrgEncryptionStatus";
import { useOrgContext } from "@/components/providers/OrganizationProvider";
import { SetupEncryptionPrompt } from "@/components/encryption/SetupEncryptionPrompt";
import { UnlockEncryptionPrompt } from "@/components/encryption/UnlockEncryptionPrompt";
import { OrgEncryptionSetupPrompt } from "@/components/encryption/OrgEncryptionSetupPrompt";
import { AwaitingOrgEncryption } from "@/components/encryption/AwaitingOrgEncryption";
import { AwaitingOrgKeyDistribution } from "@/components/encryption/AwaitingOrgKeyDistribution";
import { EncryptionStatusBadge } from "@/components/encryption/EncryptionStatusBadge";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

interface Model {
  id: string;
  name: string;
}

interface ModelHeaderProps {
  models: Model[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  disabled: boolean;
}

function ModelHeader({ models, selectedModel, onModelChange, disabled }: ModelHeaderProps): React.ReactElement {
  return (
    <div className="flex items-center gap-2 p-2 border-b">
      <span className="text-sm text-muted-foreground">Model:</span>
      <ModelSelector
        models={models}
        selectedModel={selectedModel}
        onModelChange={onModelChange}
        disabled={disabled}
      />
      <div className="ml-auto flex items-center gap-2">
        <EncryptionStatusBadge />
        <Link href="/settings/encryption">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

// Convert ChatMessage to legacy Message format for MessageList
interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function ChatWindow(): React.ReactElement {
  const api = useApi();
  const { user } = useUser();
  const encryption = useEncryption();
  const { orgId, isOrgAdmin } = useOrgContext();
  const orgEncryption = useOrgEncryptionStatus(orgId);
  const encryptedChat = useChat({
    orgId,
    onSessionChange: () => {
      window.dispatchEvent(new CustomEvent("sessionUpdated"));
    },
  });

  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");

  // Determine if encryption is ready for chat
  const isEncryptionReady = encryption.state.isSetup && encryption.state.isUnlocked;
  const isInitialState = encryptedChat.messages.length === 0;
  const isTyping = encryptedChat.isStreaming;

  // Load models on mount
  useEffect(() => {
    async function loadModels(): Promise<void> {
      if (!user) {
        setModels([]);
        setSelectedModel("");
        return;
      }
      try {
        const data = await api.get("/chat/models") as Model[];
        setModels(data);
        if (data.length > 0) {
          setSelectedModel(data[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch models:", err);
      }
    }
    loadModels();
  }, [user, api]);

  // Track previous orgId to detect context changes
  const prevOrgIdRef = useRef<string | null | undefined>(undefined);

  // Clear session when org context changes (but not on initial mount)
  useEffect(() => {
    // Skip initial mount (when prevOrgIdRef is undefined)
    if (prevOrgIdRef.current !== undefined && prevOrgIdRef.current !== orgId) {
      encryptedChat.clearSession();
    }
    prevOrgIdRef.current = orgId;
  }, [orgId, encryptedChat]);

  // Handle new chat event
  useEffect(() => {
    function handleNewChat(): void {
      encryptedChat.clearSession();
    }
    window.addEventListener("newChat", handleNewChat);
    return () => window.removeEventListener("newChat", handleNewChat);
  }, [encryptedChat]);

  // Handle session selection event
  useEffect(() => {
    async function handleSelectSession(e: Event): Promise<void> {
      const customEvent = e as CustomEvent<{ sessionId: string }>;
      const selectedSessionId = customEvent.detail.sessionId;

      try {
        await encryptedChat.loadSession(selectedSessionId);
      } catch (err) {
        console.error("Failed to load session:", err);
      }
    }

    window.addEventListener("selectSession", handleSelectSession);
    return () => window.removeEventListener("selectSession", handleSelectSession);
  }, [encryptedChat]);

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

  // Convert ChatMessage[] to Message[] for MessageList
  const messages: Message[] = encryptedChat.messages.map((msg) => ({
    id: msg.id,
    role: msg.role,
    content: msg.content,
  }));

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
        <ModelHeader
          models={models}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          disabled={true}
        />
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
        <ModelHeader
          models={models}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          disabled={true}
        />
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
            <ModelHeader
              models={models}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              disabled={true}
            />
            <div className="flex-1 flex flex-col items-center justify-center p-4">
              <OrgEncryptionSetupPrompt orgId={orgId} onSuccess={orgEncryption.refetch} />
            </div>
          </div>
        );
      } else {
        // Member must wait for admin to set up encryption
        return (
          <div className="flex flex-col h-full">
            <ModelHeader
              models={models}
              selectedModel={selectedModel}
              onModelChange={setSelectedModel}
              disabled={true}
            />
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
          <ModelHeader
            models={models}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            disabled={true}
          />
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
      <div className="flex flex-col h-full">
        <ModelHeader
          models={models}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          disabled={isTyping}
        />
        <div className="flex-1 flex flex-col">
          {messages.length > 0 && (
            <MessageList messages={messages} isTyping={isTyping} />
          )}
          <div
            className="p-4 m-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg"
            data-testid="encryption-error"
          >
            <p className="font-medium">Encryption Error</p>
            <p className="text-sm">{encryptedChat.error}</p>
          </div>
          <ChatInput onSend={handleSend} disabled={isTyping} />
        </div>
      </div>
    );
  }

  // Initial state - show welcome screen
  if (isInitialState) {
    return (
      <div className="flex flex-col h-full">
        <ModelHeader
          models={models}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          disabled={isTyping}
        />

        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold mb-2">Freebird</h1>
            <p className="text-muted-foreground">
              Start a conversation with any model
            </p>
          </div>

          <div className="w-full max-w-2xl">
            <ChatInput onSend={handleSend} disabled={isTyping} centered />
          </div>
        </div>
      </div>
    );
  }

  // Normal chat state
  return (
    <div className="flex flex-col h-full">
      <ModelHeader
        models={models}
        selectedModel={selectedModel}
        onModelChange={setSelectedModel}
        disabled={isTyping}
      />
      <MessageList messages={messages} isTyping={isTyping} />
      <ChatInput onSend={handleSend} disabled={isTyping} />
    </div>
  );
}
