"use client";

import { useState } from "react";
import { Loader2, RefreshCw, Save } from "lucide-react";
import { useContainerRpc, useContainerRpcMutation } from "@/hooks/useContainerRpc";
import { Button } from "@/components/ui/button";

export function ConfigPanel() {
  const { data, error, isLoading, mutate } = useContainerRpc<Record<string, unknown>>("config.get");
  const callRpc = useContainerRpcMutation();
  const [editing, setEditing] = useState(false);
  const [rawJson, setRawJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const startEditing = () => {
    setRawJson(JSON.stringify(data, null, 2));
    setEditing(true);
    setSaveError(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const parsed = JSON.parse(rawJson);
      await callRpc("config.set", parsed);
      setEditing(false);
      mutate();
    } catch (err) {
      setSaveError(err instanceof SyntaxError ? "Invalid JSON" : String(err));
    } finally {
      setSaving(false);
    }
  };

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

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Config</h2>
        <div className="flex gap-2">
          {editing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                Save
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => mutate()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={startEditing}>
                Edit
              </Button>
            </>
          )}
        </div>
      </div>

      {saveError && <p className="text-sm text-destructive">{saveError}</p>}

      {editing ? (
        <textarea
          className="w-full h-96 bg-muted/30 rounded-lg p-3 text-xs font-mono border border-border focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          value={rawJson}
          onChange={(e) => setRawJson(e.target.value)}
          spellCheck={false}
        />
      ) : (
        <pre className="text-xs bg-muted/30 rounded-lg p-3 overflow-auto max-h-[calc(100vh-200px)]">
          {data ? JSON.stringify(data, null, 2) : "No config data."}
        </pre>
      )}
    </div>
  );
}
