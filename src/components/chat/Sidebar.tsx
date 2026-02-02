"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare, Loader2, Trash2 } from "lucide-react";

interface Session {
  id: string;
  name: string;
}

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  sessions?: Session[];
  currentSessionId?: string | null;
  isLoading?: boolean;
  onNewChat?: () => void;
  onSelectSession?: (sessionId: string) => void;
  onDeleteSession?: (sessionId: string) => void;
}

export function Sidebar({
  className,
  sessions = [],
  currentSessionId,
  isLoading = false,
  onNewChat,
  onSelectSession,
  onDeleteSession,
  ...props
}: SidebarProps) {
  return (
    <div className={cn("flex flex-col h-full", className)} {...props}>
      <div className="px-3 py-2">
        <Button
          className="w-full justify-start gap-2 bg-primary text-primary-foreground hover:bg-primary/90 font-medium transition-all shadow-lg shadow-primary/5"
          onClick={onNewChat}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1 px-3 py-2">
        <div className="space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="ml-2 text-xs text-muted-foreground">Loading...</span>
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground/50 text-center py-4">
              No conversations yet
            </p>
          ) : (
            sessions.map((session) => (
              <div key={session.id} className="group relative">
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start gap-2 font-normal truncate transition-all pr-8",
                    currentSessionId === session.id
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                  )}
                  onClick={() => onSelectSession?.(session.id)}
                >
                  <MessageSquare className="h-4 w-4 flex-shrink-0 opacity-70" />
                  <span className="truncate">{session.name}</span>
                </Button>
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-accent transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteSession?.(session.id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive transition-colors" />
                </button>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t border-border text-[10px] text-muted-foreground/40 text-center uppercase tracking-widest font-mono">
        Isol8 v0.1
      </div>
    </div>
  );
}
