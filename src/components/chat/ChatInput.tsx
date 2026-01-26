"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

import { ModelSelector } from "./ModelSelector";

interface Model {
  id: string;
  name: string;
}

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  centered?: boolean;
  models?: Model[];
  selectedModel?: string;
  onModelChange?: (modelId: string) => void;
}

export function ChatInput({ onSend, disabled, centered, models, selectedModel, onModelChange }: ChatInputProps) {
  const [input, setInput] = React.useState("");

  const handleSend = () => {
    if (input.trim()) {
      onSend(input);
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={cn("p-4", !centered && "border-t border-white/10 bg-black/40 backdrop-blur-md")}>
      <div className="relative flex items-center max-w-3xl mx-auto">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 min-h-[50px] max-h-[200px] resize-none border border-white/10 rounded-2xl p-4 pr-12 pb-12 bg-white/5 text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20 focus:bg-white/10 transition-all"
          disabled={disabled}
        />
        {models && selectedModel && onModelChange && (
          <div className="absolute left-2 bottom-2">
            <ModelSelector
              models={models}
              selectedModel={selectedModel}
              onModelChange={onModelChange}
              disabled={disabled}
            />
          </div>
        )}
        <Button
          size="icon"
          className="absolute right-2 bottom-2"
          onClick={handleSend}
          disabled={!input.trim() || disabled}
          data-testid="send-button"
          aria-label="Send message"
        >
          <SendHorizontal className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
