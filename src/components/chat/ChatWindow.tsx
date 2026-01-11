"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";

import { ChatInput } from "./ChatInput";
import { MessageList } from "./MessageList";
import { ModelSelector } from "./ModelSelector";
import { useApi } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

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
    </div>
  );
}

export function ChatWindow(): React.ReactElement {
  const api = useApi();
  const { getToken } = useAuth();
  const { user } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>("");

  const isInitialState = messages.length === 0;

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
  }, [user?.id, api]);

  useEffect(() => {
    function handleNewChat(): void {
      setMessages([]);
      setSessionId(null);
    }
    window.addEventListener("newChat", handleNewChat);
    return () => window.removeEventListener("newChat", handleNewChat);
  }, []);

  useEffect(() => {
    async function handleSelectSession(e: Event): Promise<void> {
      const customEvent = e as CustomEvent<{ sessionId: string }>;
      const selectedSessionId = customEvent.detail.sessionId;
      setSessionId(selectedSessionId);

      try {
        const data = await api.get(`/chat/sessions/${selectedSessionId}/messages`) as Array<{ id: string; role: string; content: string }>;
        const loadedMessages: Message[] = data.map((msg) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant",
          content: msg.content,
        }));
        setMessages(loadedMessages);
      } catch (err) {
        console.error("Failed to load messages:", err);
      }
    }

    window.addEventListener("selectSession", handleSelectSession);
    return () => window.removeEventListener("selectSession", handleSelectSession);
  }, [api]);

  const handleSend = useCallback(async function(content: string): Promise<void> {
    const tempId = Date.now().toString();
    const assistantId = (Date.now() + 1).toString();

    setMessages((prev) => [...prev, { id: tempId, role: "user", content }]);
    setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "" }]);
    setIsTyping(true);

    try {
      const token = await getToken();
      if (!token) throw new Error("No authentication token");

      const response = await fetch("http://localhost:8000/api/v1/chat/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: content,
          session_id: sessionId,
          model: selectedModel,
        }),
      });

      if (!response.ok) {
        throw new Error("Stream request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === "session" && !sessionId) {
              setSessionId(data.session_id);
              window.dispatchEvent(new CustomEvent("sessionUpdated"));
            } else if (data.type === "content") {
              fullContent += data.content;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantId ? { ...msg, content: fullContent } : msg
                )
              );
            }
          } catch {
            // Ignore parse errors for incomplete chunks
          }
        }
      }
    } catch (err) {
      console.error("Chat Error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to send message.";
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId ? { ...msg, content: `Error: ${errorMessage}` } : msg
        )
      );
    } finally {
      setIsTyping(false);
    }
  }, [getToken, sessionId, selectedModel]);

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