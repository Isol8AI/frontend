import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Sparkles, Copy, RefreshCw, Share2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  model?: string;
}

interface MessageListProps {
  messages: Message[];
  isTyping?: boolean;
}

// ... ThinkingBlock ...

function MessageToolbar({ modelName }: { modelName?: string }) {
    return (
        <div className="flex items-center gap-1 mb-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-xs font-medium text-white/40 mr-2 flex items-center gap-1">
                <Bot className="h-3 w-3" />
                {modelName || "Assistant"}
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-white hover:bg-white/10">
                <Copy className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-white hover:bg-white/10">
                <RefreshCw className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-white/40 hover:text-white hover:bg-white/10">
                <Share2 className="h-3 w-3" />
            </Button>
        </div>
    );
}

export function MessageList({ messages, isTyping }: MessageListProps) {
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, messages.map(m => m.content).join(''), messages.map(m => m.thinking).join('')]);

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto p-4 md:px-8 custom-scrollbar"
    >
      <div className="max-w-3xl mx-auto space-y-10 py-8">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={cn(
              "flex w-full flex-col group relative",
              msg.role === "user" ? "items-end" : "items-start"
            )}
          >
            {msg.role === "assistant" && <MessageToolbar modelName={msg.model} />}

            <div
              className={cn(
                "relative text-sm leading-7",
                msg.role === "user"
                  ? "text-white max-w-[85%] text-right"
                  : "text-white/90 w-full pl-0"
              )}
            >
              {msg.role === "assistant" && msg.thinking && (
                 <ThinkingBlock content={msg.thinking} />
              )}
              
              <div className="whitespace-pre-wrap">
                {msg.content || (isTyping && msg.role === "assistant" && !msg.thinking ? (
                  <span className="inline-flex gap-1 items-center h-5">
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                ) : null)}
              </div>
            </div>
          </div>
        ))}
        <div ref={scrollRef} />
      </div>
    </div>
  );
}
