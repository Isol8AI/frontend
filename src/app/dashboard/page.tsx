"use client";

import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { DashboardSidebar, type DashboardSection } from "@/components/dashboard/DashboardSidebar";
import { DashboardChat } from "@/components/dashboard/DashboardChat";
import { AgentsPanel } from "@/components/dashboard/AgentsPanel";
import { ConfigPanel } from "@/components/dashboard/ConfigPanel";
import { SessionsPanel } from "@/components/dashboard/SessionsPanel";
import { MemoryPanel } from "@/components/dashboard/MemoryPanel";
import { FilesPanel } from "@/components/dashboard/FilesPanel";
import { CronPanel } from "@/components/dashboard/CronPanel";
import { SkillsPanel } from "@/components/dashboard/SkillsPanel";
import { DebugPanel } from "@/components/dashboard/DebugPanel";
import { LogsPanel } from "@/components/dashboard/LogsPanel";
import { ChannelsPanel } from "@/components/dashboard/ChannelsPanel";

export default function DashboardPage() {
  const [activeSection, setActiveSection] = useState<DashboardSection>("chat");

  const panels: Record<DashboardSection, React.ReactNode> = {
    chat: <DashboardChat />,
    agents: <AgentsPanel />,
    config: <ConfigPanel />,
    sessions: <SessionsPanel />,
    memory: <MemoryPanel />,
    files: <FilesPanel />,
    cron: <CronPanel />,
    skills: <SkillsPanel />,
    debug: <DebugPanel />,
    logs: <LogsPanel />,
    channels: <ChannelsPanel />,
  };

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      <DashboardSidebar active={activeSection} onSelect={setActiveSection} />
      <main className="flex-1 min-h-0 flex flex-col">
        <header className="h-14 border-b border-border flex items-center justify-between px-4">
          <h1 className="text-sm font-medium capitalize">{activeSection}</h1>
          <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
        </header>
        <div className="flex-1 overflow-auto">
          {panels[activeSection]}
        </div>
      </main>
    </div>
  );
}
