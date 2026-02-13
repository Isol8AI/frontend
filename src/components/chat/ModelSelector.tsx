"use client";

import * as React from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronRight,
  Search,
  Sparkles,
  Globe,
  Cloud,
  Zap,
  Brain,
  Bot,
  Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Model {
  id: string;
  name: string;
}

interface ModelSelectorProps {
  models: Model[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  disabled?: boolean;
}

interface ProviderConfig {
  displayName: string;
  icon: React.ElementType;
  accentColor: string;
}

const PROVIDER_CONFIG: Record<string, ProviderConfig> = {
  anthropic: { displayName: "Anthropic", icon: Sparkles, accentColor: "text-orange-400" },
  meta: { displayName: "Meta", icon: Globe, accentColor: "text-blue-400" },
  amazon: { displayName: "Amazon", icon: Cloud, accentColor: "text-amber-400" },
  mistral: { displayName: "Mistral", icon: Zap, accentColor: "text-cyan-400" },
  cohere: { displayName: "Cohere", icon: Brain, accentColor: "text-green-400" },
  ai21: { displayName: "AI21", icon: Bot, accentColor: "text-purple-400" },
};

function extractProvider(modelId: string): string {
  // Bedrock format: "us.anthropic.claude-..." or "anthropic.claude-..."
  const parts = modelId.split(".");
  if (parts.length >= 2) {
    // Skip region prefix like "us" — take the first non-region segment
    const candidate = parts[0].toLowerCase();
    if (candidate.length <= 3 && parts.length >= 3) {
      return parts[1].toLowerCase();
    }
    return candidate;
  }
  // Fallback: use the whole ID up to the first dash or colon
  const match = modelId.match(/^([a-zA-Z0-9]+)/);
  return match ? match[1].toLowerCase() : "unknown";
}

function getProviderConfig(providerId: string): ProviderConfig {
  if (PROVIDER_CONFIG[providerId]) {
    return PROVIDER_CONFIG[providerId];
  }
  return {
    displayName: providerId.charAt(0).toUpperCase() + providerId.slice(1),
    icon: Cpu,
    accentColor: "text-gray-400",
  };
}

interface ProviderGroup {
  providerId: string;
  config: ProviderConfig;
  models: Model[];
}

export function ModelSelector({
  models,
  selectedModel,
  onModelChange,
  disabled = false,
}: ModelSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [expandedProviders, setExpandedProviders] = React.useState<Set<string>>(new Set());

  const selectedModelData = models.find((m) => m.id === selectedModel);
  const selectedModelName = selectedModelData?.name || "Select Model";
  const selectedProviderId = selectedModelData ? extractProvider(selectedModelData.id) : null;
  const selectedProviderConfig = selectedProviderId ? getProviderConfig(selectedProviderId) : null;

  // On open: expand group containing selected model, reset search
  React.useEffect(() => {
    if (open) {
      setSearch("");
      if (selectedProviderId) {
        setExpandedProviders(new Set([selectedProviderId]));
      } else {
        setExpandedProviders(new Set());
      }
    }
  }, [open, selectedProviderId]);

  // On search: expand all groups so filtered results are visible
  React.useEffect(() => {
    if (search) {
      const allProviderIds = new Set(models.map((m) => extractProvider(m.id)));
      setExpandedProviders(allProviderIds);
    }
  }, [search, models]);

  const groups = React.useMemo((): ProviderGroup[] => {
    const searchLower = search.toLowerCase();
    const filtered = search
      ? models.filter(
          (m) =>
            m.name.toLowerCase().includes(searchLower) ||
            m.id.toLowerCase().includes(searchLower)
        )
      : models;

    const groupMap = new Map<string, Model[]>();
    for (const model of filtered) {
      const providerId = extractProvider(model.id);
      if (!groupMap.has(providerId)) {
        groupMap.set(providerId, []);
      }
      groupMap.get(providerId)!.push(model);
    }

    return Array.from(groupMap.entries())
      .map(([providerId, providerModels]) => ({
        providerId,
        config: getProviderConfig(providerId),
        models: providerModels.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.config.displayName.localeCompare(b.config.displayName));
  }, [models, search]);

  const toggleProvider = (providerId: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      if (next.has(providerId)) {
        next.delete(providerId);
      } else {
        next.add(providerId);
      }
      return next;
    });
  };

  const SelectedIcon = selectedProviderConfig?.icon || Cpu;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 h-9 px-3 bg-white/5 border-white/10 text-white hover:bg-white/10 hover:text-white transition-all"
        >
          <span className="flex items-center gap-2">
            <SelectedIcon
              className={cn("h-4 w-4", selectedProviderConfig?.accentColor || "text-gray-400")}
            />
            {selectedModelName}
          </span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        collisionPadding={16}
        className="!w-[320px] !max-h-[320px] !p-0 !bg-[#111111] border-white/10 text-white shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Search header */}
        <div className="p-3 border-b border-white/10 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/40" />
            <Input
              placeholder="Search models..."
              className="pl-9 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Scrollable provider groups */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="py-1">
            {groups.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-white/30">
                No models found
              </div>
            ) : (
              groups.map((group) => {
                const Icon = group.config.icon;
                const isExpanded = expandedProviders.has(group.providerId);

                return (
                  <div key={group.providerId}>
                    {/* Group header */}
                    <button
                      onClick={() => toggleProvider(group.providerId)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 transition-colors"
                    >
                      <ChevronRight
                        className={cn(
                          "h-3.5 w-3.5 text-white/40 transition-transform duration-200",
                          isExpanded && "rotate-90"
                        )}
                      />
                      <Icon className={cn("h-4 w-4", group.config.accentColor)} />
                      <span className="font-medium text-white/90">
                        {group.config.displayName}
                      </span>
                      <span className="ml-auto text-[11px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded-full">
                        {group.models.length}
                      </span>
                    </button>

                    {/* Model rows */}
                    {isExpanded && (
                      <div className="pb-1">
                        {group.models.map((model) => {
                          const isSelected = selectedModel === model.id;
                          return (
                            <button
                              key={model.id}
                              title={model.id}
                              onClick={() => {
                                onModelChange(model.id);
                                setOpen(false);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between pl-9 pr-3 py-1.5 text-sm transition-colors group",
                                isSelected
                                  ? "bg-white/10 text-white"
                                  : "text-white/70 hover:bg-white/5 hover:text-white"
                              )}
                            >
                              <div className="font-medium truncate text-left">
                                {model.name}
                              </div>
                              {isSelected && (
                                <div className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] shrink-0 ml-2" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="p-2 border-t border-white/10 bg-white/[0.02] shrink-0">
          <div className="text-[10px] text-center text-white/30">
            Powered by AWS Bedrock
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
