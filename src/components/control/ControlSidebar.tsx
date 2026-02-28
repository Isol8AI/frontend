"use client";

import {
  Activity, Radio, Monitor, MessageSquare, BarChart3, Clock,
  Bot, Sparkles, Network,
  Settings, Bug, ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ControlSidebarProps {
  activePanel?: string;
  onPanelChange?: (panel: string) => void;
}

const SECTIONS = [
  {
    label: "Control",
    items: [
      { id: "overview", label: "Overview", icon: Activity },
      { id: "channels", label: "Channels", icon: Radio },
      { id: "instances", label: "Instances", icon: Monitor },
      { id: "sessions", label: "Sessions", icon: MessageSquare },
      { id: "usage", label: "Usage", icon: BarChart3 },
      { id: "cron", label: "Cron Jobs", icon: Clock },
    ],
  },
  {
    label: "Agent",
    items: [
      { id: "agents", label: "Agents", icon: Bot },
      { id: "skills", label: "Skills", icon: Sparkles },
      { id: "nodes", label: "Nodes", icon: Network },
    ],
  },
  {
    label: "Settings",
    items: [
      { id: "config", label: "Config", icon: Settings },
      { id: "debug", label: "Debug", icon: Bug },
      { id: "logs", label: "Logs", icon: ScrollText },
    ],
  },
];

export function ControlSidebar({ activePanel = "overview", onPanelChange }: ControlSidebarProps) {
  return (
    <ScrollArea className="flex-1">
      <div className="py-2">
        {SECTIONS.map((section) => (
          <div key={section.label} className="mb-2">
            <div className="px-3 py-1 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
              {section.label}
            </div>
            {section.items.map((item) => (
              <button
                key={item.id}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors",
                  activePanel === item.id
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
                onClick={() => onPanelChange?.(item.id)}
              >
                <item.icon className="h-3.5 w-3.5 flex-shrink-0 opacity-70" />
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
