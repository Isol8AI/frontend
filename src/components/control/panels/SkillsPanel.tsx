"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Sparkles, Search } from "lucide-react";
import { useGatewayRpc } from "@/hooks/useGatewayRpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Skill {
  name: string;
  enabled?: boolean;
  builtin?: boolean;
  description?: string;
  [key: string]: unknown;
}

export function SkillsPanel() {
  const { data, error, isLoading, mutate } = useGatewayRpc<Skill[]>("skills.status");
  const [filter, setFilter] = useState("");

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-3">
        <p className="text-sm text-destructive">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Retry
        </Button>
      </div>
    );
  }

  const skills = Array.isArray(data) ? data : [];
  const filtered = filter
    ? skills.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()))
    : skills;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Skills ({skills.length})</h2>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Filter skills..."
          className="pl-8 h-8 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="space-y-1">
        {filtered.map((skill) => (
          <div key={skill.name} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50">
            <Sparkles className="h-3 w-3 opacity-40 flex-shrink-0" />
            <span className="text-sm truncate">{skill.name}</span>
            {skill.builtin && (
              <span className="text-[10px] text-muted-foreground/50 ml-auto">built-in</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
