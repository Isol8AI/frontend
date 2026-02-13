import * as React from "react";
import { cn } from "@/lib/utils";
import { Copy, RefreshCw, Share2, Bot, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScrollToBottom } from "@/hooks/useScrollToBottom";

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
  onRetry?: (assistantMsgId: string) => void;
}

function ThinkingBlock({ content }: { content: string }) {
  const [isExpanded, setIsExpanded] = React.useState(false);

  return (
    <div className="mb-4 border border-white/10 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 transition-colors text-left"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-white/60" />
        ) : (
          <ChevronRight className="h-4 w-4 text-white/60" />
        )}
        <span className="text-sm text-white/60 italic">Thinking...</span>
      </button>
      {isExpanded && (
        <div className="px-3 py-2 text-sm text-white/50 whitespace-pre-wrap border-t border-white/10">
          {content}
        </div>
      )}
    </div>
  );
}

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

function ErrorToolbar({ messageId, onRetry }: { messageId: string; onRetry?: (id: string) => void }) {
    return (
        <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-red-400">Failed to generate</span>
            {onRetry && (
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-red-400 hover:text-white hover:bg-white/10"
                    onClick={() => onRetry(messageId)}
                >
                    <RefreshCw className="h-3 w-3" />
                </Button>
            )}
        </div>
    );
}

export function MessageList({ messages, isTyping, onRetry }: MessageListProps) {
  const { containerRef, endRef } = useScrollToBottom();

  return (
    <div
      ref={containerRef}
      className="flex-1 min-h-0 overflow-y-auto p-4 md:px-8"
      data-lenis-prevent
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
            {msg.role === "assistant" && (
              msg.content.startsWith("Error: ")
                ? <ErrorToolbar messageId={msg.id} onRetry={onRetry} />
                : <MessageToolbar modelName={msg.model} />
            )}

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

              <div className={cn(
                "whitespace-pre-wrap",
                msg.role === "assistant" && msg.content.startsWith("Error: ") && "text-red-400/80"
              )}>
                {msg.role === "assistant" && msg.content.startsWith("Error: ")
                  ? msg.content.slice(7)
                  : msg.content || (isTyping && msg.role === "assistant" && !msg.thinking ? (
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
        <div ref={endRef} />
      </div>
    </div>
  );
}
