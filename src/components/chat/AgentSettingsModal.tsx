"use client";

import { useEffect, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2, Save } from "lucide-react";
import { useAgentSettings } from "@/hooks/useAgentSettings";

interface AgentSettingsModalProps {
  agentName: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentSettingsModal({
  agentName,
  open,
  onOpenChange,
}: AgentSettingsModalProps) {
  const settings = useAgentSettings();

  useEffect(() => {
    if (open && agentName) {
      settings.loadAgent(agentName);
    }
    if (!open) {
      settings.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, agentName]);

  const handleClose = useCallback(() => {
    if (settings.isDirty) {
      const confirmed = window.confirm(
        "You have unsaved changes. Discard them?",
      );
      if (!confirmed) return;
    }
    onOpenChange(false);
  }, [settings.isDirty, onOpenChange]);

  const handleSave = useCallback(async () => {
    if (!agentName) return;
    await settings.save(agentName);
  }, [agentName, settings]);

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-50" />
        <Dialog.Content className="fixed inset-4 md:inset-8 lg:inset-16 bg-background rounded-lg border border-border z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <Dialog.Title className="text-sm font-medium text-foreground">
              Agent Settings: {agentName}
            </Dialog.Title>
            <div className="flex items-center gap-2">
              <button
                onClick={handleClose}
                className="text-muted-foreground hover:text-foreground p-1 rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {settings.loading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Loading agent settings...
                </span>
              </div>
            ) : settings.error ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2">
                <p className="text-sm text-destructive">{settings.error}</p>
                <button
                  onClick={() => agentName && settings.loadAgent(agentName)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Try again
                </button>
              </div>
            ) : (
              <>
                <div className="px-4 py-2 border-b border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground font-mono">
                    SOUL.md
                  </span>
                  {settings.isDirty && (
                    <span className="text-xs text-amber-400">(modified)</span>
                  )}
                </div>
                <textarea
                  className="flex-1 bg-background text-foreground text-sm font-mono p-4 resize-none focus:outline-none"
                  value={settings.soulContent}
                  onChange={(e) => settings.setSoulContent(e.target.value)}
                  placeholder="Define your agent's personality and instructions here..."
                  spellCheck={false}
                />
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end px-4 py-3 border-t border-border gap-2">
            <button
              onClick={handleClose}
              className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!settings.isDirty || settings.saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {settings.saving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
