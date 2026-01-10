"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { SendHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  centered?: boolean;
}

export function ChatInput({ onSend, disabled, centered }: ChatInputProps) {
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
    <div className={cn("p-4 bg-background", !centered && "border-t")}>
      <div className="relative flex items-center max-w-4xl mx-auto">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          className="flex-1 min-h-[50px] max-h-[200px] resize-none border rounded-xl p-3 pr-12 focus:outline-none focus:ring-2 focus:ring-ring"
          disabled={disabled}
        />
        <Button
          size="icon"
          className="absolute right-2 bottom-2"
          onClick={handleSend}
          disabled={!input.trim() || disabled}
        >
          <SendHorizontal className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
}
