"use client";

import { useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";

const AGENT_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;
const AGENT_NAME_MAX = 50;

interface AgentCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateAgent: (name: string) => Promise<void>;
}

export function AgentCreateDialog({
  open,
  onOpenChange,
  onCreateAgent,
}: AgentCreateDialogProps) {
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) {
      setName("");
      setNameError(null);
      setIsCreating(false);
    }
    onOpenChange(isOpen);
  }, [onOpenChange]);

  const validateName = useCallback((value: string): string | null => {
    if (!value.trim()) {
      return "Agent name is required";
    }
    if (value.length > AGENT_NAME_MAX) {
      return `Name must be ${AGENT_NAME_MAX} characters or fewer`;
    }
    if (!AGENT_NAME_REGEX.test(value)) {
      return "Only letters, numbers, underscores, and hyphens are allowed";
    }
    return null;
  }, []);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.slice(0, AGENT_NAME_MAX);
    setName(value);
    if (nameError) {
      setNameError(validateName(value));
    }
  };

  const handleNameBlur = () => {
    if (name.trim()) {
      setNameError(validateName(name));
    }
  };

  const handleCreate = async (e: React.MouseEvent) => {
    e.preventDefault();

    const error = validateName(name);
    if (error) {
      setNameError(error);
      return;
    }

    setIsCreating(true);
    try {
      await onCreateAgent(name.trim());
      handleOpenChange(false);
    } catch {
      setIsCreating(false);
    }
  };

  const isCreateDisabled =
    isCreating || !name.trim() || !!validateName(name);

  return (
    <AlertDialog open={open} onOpenChange={(o) => !isCreating && handleOpenChange(o)}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Create a New Agent</AlertDialogTitle>
          <AlertDialogDescription>
            Give your agent a name. You can customize its personality later
            via SOUL.md in the control panel.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <label
              htmlFor="agent-name"
              className="text-sm font-medium text-white mb-1.5 block"
            >
              Name
            </label>
            <Input
              id="agent-name"
              type="text"
              placeholder="my-agent"
              value={name}
              onChange={handleNameChange}
              onBlur={handleNameBlur}
              disabled={isCreating}
              maxLength={AGENT_NAME_MAX}
              autoFocus
              className="bg-white/5 border-white/10 text-white placeholder:text-white/30 focus:ring-1 focus:ring-white/20"
              data-testid="agent-name-input"
            />
            {nameError && (
              <p
                className="text-xs text-red-400 mt-1.5"
                data-testid="agent-name-error"
              >
                {nameError}
              </p>
            )}
            <p className="text-xs text-white/40 mt-1.5">
              Letters, numbers, underscores, and hyphens only.
            </p>
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isCreating}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCreate}
            disabled={isCreateDisabled}
            className="gap-2"
            data-testid="agent-create-button"
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
