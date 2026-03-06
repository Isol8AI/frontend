"use client";

import { useState } from "react";
import { Link2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "isol8:channel-onboarding-dismissed";

interface ChannelOnboardingCardProps {
  onSetUpChannels: () => void;
}

export function ChannelOnboardingCard({
  onSetUpChannels,
}: ChannelOnboardingCardProps): React.ReactElement | null {
  const [dismissed, setDismissed] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY) === "true",
  );

  if (dismissed) return null;

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  }

  return (
    <div className="mx-4 mt-3 flex items-center gap-3 rounded-lg border border-border bg-card/50 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Link2 className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">Connect a channel</p>
        <p className="text-xs text-muted-foreground">
          Chat with your agent on Telegram, Discord, WhatsApp, and more.
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 text-xs"
        onClick={onSetUpChannels}
      >
        Set up channels
      </Button>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
