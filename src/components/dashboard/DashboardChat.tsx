"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, Send, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgents } from "@/hooks/useAgents";
import { useAgentChat } from "@/hooks/useAgentChat";

export function DashboardChat() {
  const { agents } = useAgents();
  const [selectedAgent, setSelectedAgent] = useState<string>("");
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, isStreaming, sendMessage } = useAgentChat(selectedAgent || null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (!input.trim() || !selectedAgent) return;
    sendMessage(input);
    setInput("");
  };

  return (
    <div className="flex flex-col h-full">
      {/* Agent selector */}
      <div className="p-3 border-b border-border">
        <select
          className="rounded-md border border-border bg-background px-3 py-2 text-sm w-full max-w-xs"
          value={selectedAgent}
          onChange={(e) => setSelectedAgent(e.target.value)}
        >
          <option value="">Select an agent...</option>
          {(agents ?? []).map((a: { agent_name: string }) => (
            <option key={a.agent_name} value={a.agent_name}>{a.agent_name}</option>
          ))}
        </select>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
        {!selectedAgent ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Bot className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Select an agent to start chatting</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">Send a message to start a conversation</p>
          </div>
        ) : (
          messages.map((msg: { role: string; content: string }, i: number) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                msg.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}>
                {msg.content}
              </div>
            </div>
          ))
        )}
        {isStreaming && (
          <div className="flex justify-start">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border flex gap-2">
        <input
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder={selectedAgent ? "Type a message..." : "Select an agent first"}
          disabled={!selectedAgent}
        />
        <Button size="sm" onClick={handleSend} disabled={!selectedAgent || !input.trim() || isStreaming}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
