"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Zap, Crown, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useBilling } from "@/hooks/useBilling";

export function SubscriptionGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isLoading, isSubscribed, createCheckout, refresh } = useBilling();
  const searchParams = useSearchParams();
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const justSubscribed = searchParams.get("subscription") === "success";
  const [polling, setPolling] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Poll for subscription activation after returning from Stripe checkout
  useEffect(() => {
    if (!justSubscribed || isSubscribed || isLoading) return;

    setPolling(true);
    setTimedOut(false);
    let attempts = 0;
    const maxAttempts = 20; // 20 * 2s = 40s max

    const interval = setInterval(async () => {
      attempts++;
      await refresh();

      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setPolling(false);
        setTimedOut(true);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [justSubscribed, isSubscribed, isLoading, refresh]);

  // Stop polling once subscription is confirmed
  useEffect(() => {
    if (isSubscribed && polling) {
      setPolling(false);
      // Clean up URL param
      window.history.replaceState({}, "", "/chat");
    }
  }, [isSubscribed, polling]);

  const handleCheckout = async (tier: "starter" | "pro") => {
    setCheckoutLoading(tier);
    try {
      await createCheckout(tier);
    } catch (err) {
      console.error("Checkout failed:", err);
      setCheckoutLoading(null);
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show timeout error if polling exhausted
  if (justSubscribed && !isSubscribed && timedOut) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-semibold">Setup taking longer than expected</h2>
          <p className="text-sm text-muted-foreground">
            Your payment was received but container setup hasn&apos;t completed yet.
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Refresh
          </Button>
        </div>
      </div>
    );
  }

  // Show activation spinner while waiting for webhook to process
  if (justSubscribed && !isSubscribed) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <CheckCircle className="h-10 w-10 text-green-500 mx-auto" />
          <h2 className="text-xl font-semibold">Payment received!</h2>
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <p className="text-sm">Setting up your container...</p>
          </div>
        </div>
      </div>
    );
  }

  if (isSubscribed) {
    return <>{children}</>;
  }

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8 text-center">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">
            Choose your plan
          </h2>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Subscribe to get your own AI agent container with persistent memory,
            custom personality, and access to top-tier models.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4 max-w-lg mx-auto">
          {/* Starter */}
          <div className="rounded-xl border border-border p-6 space-y-4 bg-card/50">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-blue-400" />
                <h3 className="font-medium">Starter</h3>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-semibold">$25</span>
                <span className="text-muted-foreground text-sm">/mo</span>
              </div>
            </div>
            <ul className="text-sm text-muted-foreground space-y-2 text-left">
              <li>Personal AI container</li>
              <li>Persistent memory</li>
              <li>1 free model included</li>
              <li>Pay-per-use premium models</li>
            </ul>
            <Button
              className="w-full"
              variant="outline"
              onClick={() => handleCheckout("starter")}
              disabled={!!checkoutLoading}
            >
              {checkoutLoading === "starter" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Get Started"
              )}
            </Button>
          </div>

          {/* Pro */}
          <div className="rounded-xl border border-primary/50 p-6 space-y-4 bg-card/50 relative">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-primary text-primary-foreground text-xs font-medium rounded-full">
              Popular
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Crown className="h-4 w-4 text-amber-400" />
                <h3 className="font-medium">Pro</h3>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-semibold">$75</span>
                <span className="text-muted-foreground text-sm">/mo</span>
              </div>
            </div>
            <ul className="text-sm text-muted-foreground space-y-2 text-left">
              <li>Everything in Starter</li>
              <li>Higher usage budget</li>
              <li>Priority support</li>
              <li>Advanced agent features</li>
            </ul>
            <Button
              className="w-full"
              onClick={() => handleCheckout("pro")}
              disabled={!!checkoutLoading}
            >
              {checkoutLoading === "pro" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Upgrade to Pro"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
