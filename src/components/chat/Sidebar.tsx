"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MessageSquare } from "lucide-react";

type SidebarProps = React.HTMLAttributes<HTMLDivElement>;

export function Sidebar({ className, ...props }: SidebarProps) {
  return (
    <div className={cn("flex flex-col h-full bg-muted/20", className)} {...props}>
      <div className="p-4 border-b">
        <Button className="w-full justify-start gap-2" variant="default">
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>
      
      <ScrollArea className="flex-1 px-2 py-2">
        <div className="space-y-1">
            {/* Placeholder for recent chats */}
            <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground font-normal">
                <MessageSquare className="h-4 w-4" />
                <span>Project Ideas</span>
            </Button>
            <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground font-normal">
                <MessageSquare className="h-4 w-4" />
                <span>Meeting Notes</span>
            </Button>
        </div>
      </ScrollArea>
      
      <div className="p-4 border-t text-xs text-muted-foreground text-center">
        Secure Chat v0.1
      </div>
    </div>
  );
}
