"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare } from "lucide-react";

interface Session {
  id: string;
  name: string;
}

interface SidebarProps extends React.HTMLAttributes<HTMLDivElement> {
  sessions?: Session[];
  currentSessionId?: string | null;
  onNewChat?: () => void;
  onSelectSession?: (sessionId: string) => void;
}

export function Sidebar({
  className,
  sessions = [],
  currentSessionId,
  onNewChat,
  onSelectSession,
  ...props
}: SidebarProps) {
  return (
    <div className={cn("flex flex-col h-full bg-muted/20", className)} {...props}>
      <div className="p-4 border-b">
        <Button
          className="w-full justify-start gap-2"
          variant="default"
          onClick={onNewChat}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      <ScrollArea className="flex-1 px-2 py-2">
        <div className="space-y-1">
          {sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              No conversations yet
            </p>
          ) : (
            sessions.map((session) => (
              <Button
                key={session.id}
                variant={currentSessionId === session.id ? "secondary" : "ghost"}
                className="w-full justify-start gap-2 text-muted-foreground font-normal truncate"
                onClick={() => onSelectSession?.(session.id)}
              >
                <MessageSquare className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{session.name}</span>
              </Button>
            ))
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t text-xs text-muted-foreground text-center">
        Freebird v0.1
      </div>
    </div>
  );
}
