import * as React from "react";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { useApi } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function ChatWindow() {
  const api = useApi();
  const [messages, setMessages] = React.useState<Message[]>([
    { id: "1", role: "assistant", content: "Hello! This is an encrypted secure chat. How can I help you?" }
  ]);
  const [isTyping, setIsTyping] = React.useState(false);

  const handleSend = async (content: string) => {
    // 1. Optimistic Update (Show user message immediately)
    const tempId = Date.now().toString();
    const newMessage: Message = { id: tempId, role: "user", content };
    setMessages((prev) => [...prev, newMessage]);
    setIsTyping(true);

    try {
        // 2. Call Backend
        const data = await api.post("/chat/", { message: content });
        
        // 3. Add AI Response
        const aiMessage: Message = { 
            id: Date.now().toString(), 
            role: "assistant", 
            content: data.response 
        };
        setMessages((prev) => [...prev, aiMessage]);
    } catch (err: any) {
        console.error("Chat Error:", err);
        const errorMessage: Message = { 
            id: Date.now().toString(), 
            role: "assistant", 
            content: `Error: ${err.message || "Failed to send message."}` 
        };
        setMessages((prev) => [...prev, errorMessage]);
    } finally {
        setIsTyping(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} />
      <ChatInput onSend={handleSend} disabled={isTyping} />
    </div>
  );
}
