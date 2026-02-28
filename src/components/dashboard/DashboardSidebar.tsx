"use client";

import { cn } from "@/lib/utils";
import {
  MessageSquare, Bot, Settings, Clock, Puzzle,
  Bug, ScrollText, Radio, FolderOpen, Brain, CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export type DashboardSection =
  | "chat" | "agents" | "config" | "sessions" | "memory"
  | "files" | "cron" | "skills" | "debug" | "logs" | "channels";

const SECTIONS: { id: DashboardSection; label: string; icon: React.ElementType }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "agents", label: "Agents", icon: Bot },
  { id: "config", label: "Config", icon: Settings },
  { id: "sessions", label: "Sessions", icon: Clock },
  { id: "memory", label: "Memory", icon: Brain },
  { id: "files", label: "Files", icon: FolderOpen },
  { id: "cron", label: "Cron", icon: CalendarClock },
  { id: "skills", label: "Skills", icon: Puzzle },
  { id: "debug", label: "Debug", icon: Bug },
  { id: "logs", label: "Logs", icon: ScrollText },
  { id: "channels", label: "Channels", icon: Radio },
];

interface DashboardSidebarProps {
  active: DashboardSection;
  onSelect: (section: DashboardSection) => void;
}

export function DashboardSidebar({ active, onSelect }: DashboardSidebarProps) {
  return (
    <div className="w-48 flex flex-col border-r border-border bg-sidebar/50 backdrop-blur-xl">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">OpenClaw</h2>
      </div>
      <ScrollArea className="flex-1 px-2 py-2">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <Button
            key={id}
            variant="ghost"
            className={cn(
              "w-full justify-start gap-2 mb-0.5 text-sm",
              active === id && "bg-accent text-accent-foreground",
            )}
            onClick={() => onSelect(id)}
          >
            <Icon className="h-4 w-4 opacity-70" />
            {label}
          </Button>
        ))}
      </ScrollArea>
    </div>
  );
}
