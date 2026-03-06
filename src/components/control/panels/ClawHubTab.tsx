"use client";

import { useState } from "react";
import {
  Loader2,
  RefreshCw,
  ExternalLink,
  Download,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { useGatewayRpc, useGatewayRpcMutation } from "@/hooks/useGatewayRpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SkillInstallSpec {
  id?: string;
  kind: string;
  package?: string;
  bins?: string[];
}

interface SkillStatusEntry {
  name: string;
  description: string;
  source: string;
  skillKey: string;
  emoji?: string;
  enabled?: boolean;
  installed?: boolean;
  install?: SkillInstallSpec[];
  [key: string]: unknown;
}

interface SkillStatusReport {
  skills: SkillStatusEntry[];
}

export function ClawHubTab({ agentId: _agentId }: { agentId?: string }) {
  const callRpc = useGatewayRpcMutation();
  const { data: raw, mutate: mutateSkills } = useGatewayRpc<SkillStatusReport | SkillStatusEntry[]>(
    "skills.status",
    {},
  );

  const [installSlug, setInstallSlug] = useState("");
  const [installLoading, setInstallLoading] = useState<string | null>(null);
  const [toggleLoading, setToggleLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allSkills: SkillStatusEntry[] = Array.isArray(raw) ? raw : raw?.skills ?? [];

  const handleInstallDeps = async (skill: SkillStatusEntry) => {
    const specs = skill.install ?? [];
    // Find a node-kind install spec (works in containers without brew)
    const nodeSpec = specs.find((s) => s.kind === "node");
    if (!nodeSpec) {
      setError(`No compatible installer for "${skill.name}" (only node packages supported in containers)`);
      return;
    }
    const installId = nodeSpec.id ?? "node";
    setInstallLoading(skill.skillKey);
    setError(null);
    try {
      await callRpc("skills.install", {
        name: skill.name,
        installId,
        timeoutMs: 120000,
      });
      mutateSkills();
    } catch (err) {
      console.error("Skill install failed:", err);
      setError(err instanceof Error ? err.message : "Install failed");
    } finally {
      setInstallLoading(null);
    }
  };

  const handleToggle = async (skill: SkillStatusEntry) => {
    setToggleLoading(skill.skillKey);
    setError(null);
    try {
      await callRpc("skills.update", {
        skillKey: skill.skillKey,
        enabled: !skill.enabled,
      });
      mutateSkills();
    } catch (err) {
      console.error("Skill toggle failed:", err);
      setError(err instanceof Error ? err.message : "Toggle failed");
    } finally {
      setToggleLoading(null);
    }
  };

  const handleInstallBySlug = async () => {
    const slug = installSlug.trim();
    if (!slug) return;
    setInstallLoading(slug);
    setError(null);
    try {
      // Use skills.install with "node" kind — the slug is the npm package name
      await callRpc("skills.install", {
        name: slug,
        installId: "node",
        timeoutMs: 120000,
      });
      setInstallSlug("");
      mutateSkills();
    } catch (err) {
      console.error("Skill install failed:", err);
      setError(err instanceof Error ? err.message : "Install failed");
    } finally {
      setInstallLoading(null);
    }
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">ClawHub</h2>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => mutateSkills()}>
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => window.open("https://clawhub.ai", "_blank")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Browse ClawHub
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Browse skills on{" "}
        <a href="https://clawhub.ai" target="_blank" rel="noopener noreferrer" className="underline">
          clawhub.ai
        </a>
        , then install by entering the package name below.
      </p>

      {/* Install by package name */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Install a Skill
        </h3>
        <div className="flex gap-2">
          <Input
            placeholder="npm-package-name"
            className="h-8 text-xs font-mono"
            value={installSlug}
            onChange={(e) => setInstallSlug(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleInstallBySlug();
            }}
          />
          <Button
            size="sm"
            className="text-xs gap-1.5"
            onClick={handleInstallBySlug}
            disabled={installLoading !== null || !installSlug.trim()}
          >
            {installLoading === installSlug.trim() ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            Install
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* Installed skills */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Available Skills ({allSkills.length})
        </h3>

        {allSkills.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No skills found. Browse ClawHub to discover skills.
          </p>
        )}

        {allSkills.map((skill) => (
          <div
            key={skill.skillKey || skill.name}
            className="rounded-lg border border-border p-4 space-y-2 bg-card/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {skill.emoji && (
                    <span className="text-base flex-shrink-0">{skill.emoji}</span>
                  )}
                  <h4 className="text-sm font-medium truncate">{skill.name}</h4>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {skill.source}
                  </span>
                </div>
                {skill.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {skill.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* Install deps button (only if skill has install specs) */}
                {skill.install && skill.install.length > 0 && !skill.installed && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1"
                    onClick={() => handleInstallDeps(skill)}
                    disabled={installLoading !== null}
                    title="Install dependencies"
                  >
                    {installLoading === skill.skillKey ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Download className="h-3 w-3" />
                    )}
                  </Button>
                )}
                {/* Toggle enable/disable */}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => handleToggle(skill)}
                  disabled={toggleLoading !== null}
                  title={skill.enabled ? "Disable" : "Enable"}
                >
                  {toggleLoading === skill.skillKey ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : skill.enabled ? (
                    <ToggleRight className="h-4 w-4 text-green-500" />
                  ) : (
                    <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
