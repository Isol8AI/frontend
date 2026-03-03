"use client";

import { Loader2, RefreshCw, Clock, Play } from "lucide-react";
import { useGatewayRpc, useGatewayRpcMutation } from "@/hooks/useGatewayRpc";
import { Button } from "@/components/ui/button";

interface CronJob {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  agentId?: string;
  schedule: unknown;
  createdAtMs?: number;
  updatedAtMs?: number;
  [key: string]: unknown;
}

interface CronListResponse {
  jobs?: CronJob[];
  total?: number;
  hasMore?: boolean;
}

export function CronPanel() {
  const { data, error, isLoading, mutate } = useGatewayRpc<CronListResponse>("cron.list");
  const callRpc = useGatewayRpcMutation();

  const handleToggle = async (id: string, currentlyEnabled: boolean) => {
    try {
      await callRpc("cron.update", { id, patch: { enabled: !currentlyEnabled } });
      mutate();
    } catch (err) {
      console.error("Failed to toggle cron job:", err);
    }
  };

  const handleRun = async (id: string) => {
    try {
      await callRpc("cron.run", { id, mode: "force" });
    } catch (err) {
      console.error("Failed to run cron job:", err);
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

  const jobs = data?.jobs ?? (Array.isArray(data) ? data as unknown as CronJob[] : []);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cron Jobs</h2>
        <Button variant="ghost" size="sm" onClick={() => mutate()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No cron jobs configured.</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 opacity-50" />
                  <span className="text-sm font-medium">{job.name || job.id}</span>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleRun(job.id)}>
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant={job.enabled ? "outline" : "default"}
                    size="sm"
                    onClick={() => handleToggle(job.id, !!job.enabled)}
                  >
                    {job.enabled ? "Disable" : "Enable"}
                  </Button>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                {typeof job.schedule === "string" ? job.schedule : job.schedule ? JSON.stringify(job.schedule) : "\u2014"}{" "}
                {job.agentId ? `\u00b7 ${job.agentId}` : ""}
              </div>
              {job.description && (
                <div className="text-xs text-muted-foreground/70">{job.description}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
