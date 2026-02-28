"use client";

import { Loader2, Download, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSkills } from "@/hooks/useSkills";

export function SkillsPanel() {
  const { skills, isLoading, error, installSkill, toggleSkill } = useSkills();

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="p-4 text-destructive text-sm">Failed to load skills.</div>;

  return (
    <div className="p-4 max-w-3xl">
      <h2 className="text-sm font-medium mb-4">Skills</h2>
      {(!skills || skills.length === 0) ? (
        <p className="text-sm text-muted-foreground">No skills available.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {skills.map((skill) => (
            <div key={skill.name} className="p-3 rounded-md border border-border space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{skill.name}</span>
                {skill.enabled ? (
                  <span className="text-xs text-green-500">Enabled</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Disabled</span>
                )}
              </div>
              {skill.description && (
                <p className="text-xs text-muted-foreground">{skill.description}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => toggleSkill(skill.name, !skill.enabled)}>
                  {skill.enabled ? <ToggleRight className="h-4 w-4 mr-1" /> : <ToggleLeft className="h-4 w-4 mr-1" />}
                  {skill.enabled ? "Disable" : "Enable"}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
