"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCron } from "@/hooks/useCron";

export function CronPanel() {
  const { jobs, isLoading, error, createJob, deleteJob, runJob } = useCron();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSchedule, setNewSchedule] = useState("0 9 * * *");
  const [newCommand, setNewCommand] = useState("");

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="p-4 text-destructive text-sm">Failed to load cron jobs.</div>;

  const handleCreate = async () => {
    if (!newCommand.trim() || !newName.trim()) return;
    await createJob({ name: newName, schedule: newSchedule, command: newCommand });
    setNewName("");
    setNewCommand("");
    setShowCreate(false);
  };

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-medium">Scheduled Jobs</h2>
        <Button size="sm" variant="outline" onClick={() => setShowCreate(!showCreate)}><Plus className="h-4 w-4 mr-1" />New Job</Button>
      </div>
      {showCreate && (
        <div className="p-3 rounded-md border border-border space-y-2">
          <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Job name" />
          <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm font-mono" value={newSchedule} onChange={(e) => setNewSchedule(e.target.value)} placeholder="Cron schedule" />
          <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={newCommand} onChange={(e) => setNewCommand(e.target.value)} placeholder="Command" />
          <Button size="sm" onClick={handleCreate}>Create</Button>
        </div>
      )}
      {(!jobs || jobs.length === 0) ? (
        <p className="text-sm text-muted-foreground">No cron jobs configured.</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center justify-between p-3 rounded-md border border-border">
              <div>
                <p className="text-sm font-medium">{job.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{job.schedule}</p>
                <p className="text-xs text-muted-foreground">{job.command}</p>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => runJob(job.id)}><Play className="h-4 w-4" /></Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteJob(job.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
