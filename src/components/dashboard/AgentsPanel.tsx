"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAgents } from "@/hooks/useAgents";

export function AgentsPanel() {
  const { agents, isLoading, error, createAgent, deleteAgent } = useAgents();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="p-4 text-destructive text-sm">Failed to load agents.</div>;

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await createAgent(newName);
    setNewName("");
    setShowCreate(false);
  };

  return (
    <div className="p-4 space-y-4 max-w-3xl">
      <div className="flex justify-between items-center">
        <h2 className="text-sm font-medium">Agents</h2>
        <Button size="sm" variant="outline" onClick={() => setShowCreate(!showCreate)}><Plus className="h-4 w-4 mr-1" />New Agent</Button>
      </div>
      {showCreate && (
        <div className="p-3 rounded-md border border-border space-y-2">
          <input className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Agent name" />
          <Button size="sm" onClick={handleCreate}>Create</Button>
        </div>
      )}
      {(!agents || agents.length === 0) ? (
        <p className="text-sm text-muted-foreground">No agents created yet.</p>
      ) : (
        <div className="space-y-2">
          {agents.map((a: { id?: string; agent_name: string }) => (
            <div key={a.id || a.agent_name} className="flex items-center justify-between p-3 rounded-md border border-border">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">{a.agent_name}</span>
              </div>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteAgent(a.agent_name)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
