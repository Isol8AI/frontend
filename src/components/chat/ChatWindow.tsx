"use client";

import * as React from "react";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { ModelSelector } from "./ModelSelector";
import { useApi } from "@/lib/api";
import { useAuth, useUser } from "@clerk/nextjs";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface Model {
  id: string;
  name: string;
}

export function ChatWindow() {
  const api = useApi();
  const { getToken } = useAuth();
  const { user } = useUser();
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [isTyping, setIsTyping] = React.useState(false);
  const [models, setModels] = React.useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = React.useState<string>("");

  // Check if this is the initial state (no messages yet)
  const isInitialState = messages.length === 0;

  // Load models when user changes (sign in/out/switch account)
  React.useEffect(() => {
    const loadModels = async () => {
      if (!user) {
        // Not signed in, clear models
        setModels([]);
        setSelectedModel("");
        return;
      }
      try {
        const data: Model[] = await api.get("/chat/models");
        setModels(data);
        if (data.length > 0) {
          setSelectedModel(data[0].id);
        }
      } catch (err) {
        console.error("Failed to fetch models:", err);
      }
    };
    loadModels();
  }, [user?.id, api]);

  // Listen for new chat event
  React.useEffect(() => {
    const handleNewChat = () => {
      setMessages([]);
      setSessionId(null);
    };
    window.addEventListener("newChat", handleNewChat);
    return () => window.removeEventListener("newChat", handleNewChat);
  }, []);

  // Listen for session selection event
  React.useEffect(() => {
    const handleSelectSession = async (e: Event) => {
      const customEvent = e as CustomEvent<{ sessionId: string }>;
      const selectedSessionId = customEvent.detail.sessionId;
      setSessionId(selectedSessionId);

      try {
        const data = await api.get(`/chat/sessions/${selectedSessionId}/messages`);
        const loadedMessages: Message[] = data.map((msg: { id: string; role: string; content: string }) => ({
          id: msg.id,
          role: msg.role as "user" | "assistant",
          content: msg.content,
        }));
        setMessages(loadedMessages);
      } catch (err) {
        console.error("Failed to load messages:", err);
      }
    };

    window.addEventListener("selectSession", handleSelectSession);
    return () => window.removeEventListener("selectSession", handleSelectSession);
  }, [api]);

  const handleSend = async (content: string) => {
    const tempId = Date.now().toString();
    const newMessage: Message = { id: tempId, role: "user", content };
    setMessages((prev) => [...prev, newMessage]);
    setIsTyping(true);

    // Create placeholder for streaming response
    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

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
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("No response body");
      }

      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "session") {
                if (!sessionId) {
                  setSessionId(data.session_id);
                  // Notify layout to refresh sessions
                  window.dispatchEvent(new CustomEvent("sessionUpdated"));
                }
              } else if (data.type === "content") {
                fullContent += data.content;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantId
                      ? { ...msg, content: fullContent }
                      : msg
                  )
                );
              } else if (data.type === "done") {
                // Streaming complete
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }
    } catch (err) {
      console.error("Chat Error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to send message.";
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantId
            ? { ...msg, content: `Error: ${errorMessage}` }
            : msg
        )
      );
    } finally {
      setIsTyping(false);
    }
  };

  // Centered initial view
  if (isInitialState) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 p-2 border-b">
          <span className="text-sm text-muted-foreground">Model:</span>
          <ModelSelector
            models={models}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            disabled={isTyping}
          />
        </div>

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

  // Conversation view
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b">
        <span className="text-sm text-muted-foreground">Model:</span>
        <ModelSelector
          models={models}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          disabled={isTyping}
        />
      </div>
      <MessageList messages={messages} isTyping={isTyping} />
      <ChatInput onSend={handleSend} disabled={isTyping} />
    </div>
  );
}