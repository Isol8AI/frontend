"use client";

import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChevronDown, Search, Sparkles, MessageSquare, Code, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface Model {
  id: string;
  name: string;
  category?: 'chat' | 'reasoning' | 'coding'; // Assuming we might have this info or derive it
}

interface ModelSelectorProps {
  models: Model[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  disabled?: boolean;
}

export function ModelSelector({
  models,
  selectedModel,
  onModelChange,
  disabled = false,
}: ModelSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [activeTab, setActiveTab] = React.useState<'chat' | 'reasoning'>('chat');

  const selectedModelName =
    models.find((m) => m.id === selectedModel)?.name || "Select Model";

  // Mock categorization logic if not present
  const getCategory = (id: string, name: string) => {
    if (id.includes('deepseek') || id.includes('reason')) return 'reasoning';
    if (id.includes('code') || id.includes('coder')) return 'coding';
    return 'chat';
  };

  const filteredModels = models.filter(m => 
    m.name.toLowerCase().includes(search.toLowerCase()) &&
    (activeTab === 'chat' ? getCategory(m.id, m.name) !== 'reasoning' : getCategory(m.id, m.name) === 'reasoning')
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button variant="outline" size="sm" className="gap-2 h-9 px-3 bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white transition-all">
          <span className="flex items-center gap-2">
            {getCategory(selectedModel, selectedModelName) === 'reasoning' ? <Brain className="h-4 w-4 text-purple-400" /> : <MessageSquare className="h-4 w-4 text-blue-400" />}
            {selectedModelName}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-0 bg-[#0A0A0A] border-white/10 text-white shadow-2xl backdrop-blur-xl">
        <div className="p-3 border-b border-white/10 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/40" />
            <Input 
              placeholder="Search models..." 
              className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex p-1 bg-white/5 rounded-lg border border-white/5">
            <button
              onClick={() => setActiveTab('chat')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all",
                activeTab === 'chat' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/70"
              )}
            >
              <MessageSquare className="h-3 w-3" />
              Chat
            </button>
            <button
              onClick={() => setActiveTab('reasoning')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-1.5 text-xs font-medium rounded-md transition-all",
                activeTab === 'reasoning' ? "bg-white/10 text-white shadow-sm" : "text-white/40 hover:text-white/70"
              )}
            >
              <Brain className="h-3 w-3" />
              Reasoning
            </button>
          </div>
        </div>

        <div className="max-h-[300px] overflow-y-auto py-2">
          {filteredModels.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-white/30">
              No models found
            </div>
          ) : (
            <div className="space-y-1 px-1">
               {/* Optional: Add section headers if we want further subdivision within tabs */}
               {filteredModels.map((model) => (
                 <button
                    key={model.id}
                    onClick={() => {
                      onModelChange(model.id);
                      setOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2 text-sm rounded-md transition-colors group",
                      selectedModel === model.id ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                    )}
                 >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "h-8 w-8 rounded-lg flex items-center justify-center border border-white/10 bg-white/5",
                        selectedModel === model.id ? "border-white/20" : ""
                      )}>
                        {getCategory(model.id, model.name) === 'coding' ? <Code className="h-4 w-4" /> : 
                         getCategory(model.id, model.name) === 'reasoning' ? <Brain className="h-4 w-4" /> : 
                         <Sparkles className="h-4 w-4" />}
                      </div>
                      <div className="text-left">
                        <div className="font-medium">{model.name}</div>
                        <div className="text-[10px] text-white/40 group-hover:text-white/60 transition-colors">
                          {model.id}
                        </div>
                      </div>
                    </div>
                    {selectedModel === model.id && (
                      <div className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                    )}
                 </button>
               ))}
            </div>
          )}
        </div>
        
        <div className="p-2 border-t border-white/10 bg-white/[0.02]">
          <div className="text-[10px] text-center text-white/30">
            Powered by Nitro Enclaves
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}