"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSettings } from "@/hooks/useSettings";

export function ConfigPanel() {
  const { config, isLoading, error, updateConfig } = useSettings();
  const [tab, setTab] = useState<"form" | "json">("form");
  const [jsonError, setJsonError] = useState("");
  const [rawJson, setRawJson] = useState<string | null>(null);

  const displayJson = rawJson ?? (config ? JSON.stringify(config, null, 2) : "");

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="p-4 text-destructive text-sm">Failed to load config.</div>;

  const handleJsonSave = async () => {
    try {
      const parsed = JSON.parse(displayJson);
      setJsonError("");
      await updateConfig(parsed);
    } catch {
      setJsonError("Invalid JSON");
    }
  };

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <div className="flex gap-2 border-b border-border pb-2">
        <button className={`text-sm px-3 py-1.5 rounded-md ${tab === "form" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setTab("form")}>Form</button>
        <button className={`text-sm px-3 py-1.5 rounded-md ${tab === "json" ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`} onClick={() => setTab("json")}>JSON</button>
      </div>
      {tab === "form" ? (
        <div className="space-y-4">
          {config && Object.entries(config).map(([key, value]) => (
            <div key={key} className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{key}</label>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={typeof value === "string" ? value : JSON.stringify(value)}
                onChange={(e) => updateConfig({ [key]: e.target.value })}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            className="w-full h-96 rounded-md border border-border bg-background px-3 py-2 text-sm font-mono resize-none"
            value={displayJson}
            onChange={(e) => setRawJson(e.target.value)}
          />
          {jsonError && <p className="text-destructive text-xs">{jsonError}</p>}
          <Button size="sm" onClick={handleJsonSave}><Save className="h-4 w-4 mr-1" />Save</Button>
        </div>
      )}
    </div>
  );
}
