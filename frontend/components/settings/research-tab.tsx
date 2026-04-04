"use client";

import type { Settings } from "@/lib/types";
import type { SearchProvider } from "@worldforge/shared";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

export interface ResearchTabProps {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
}

export function ResearchTab({ settings, setSettings }: ResearchTabProps) {
  const updateSettings = (updater: (current: Settings) => Settings) => {
    setSettings((current) => updater(current));
  };

  return (
    <div className="rounded-lg border border-border/40 p-[clamp(16px,1.4vw,28px)]">
      <div className="mb-[clamp(12px,1vw,20px)]">
        <div className="text-[clamp(14px,1vw,18px)] font-semibold">Research Agent</div>
        <div className="text-[clamp(11px,0.75vw,13px)] text-muted-foreground">
          Configure the AI research agent that gathers information about known
          IPs and settings before world generation.
        </div>
      </div>
      <div className="space-y-[clamp(8px,0.7vw,14px)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enable research agent</p>
            <p className="text-xs text-muted-foreground">
              When enabled, the generator will research known IPs before
              building the world scaffold.
            </p>
          </div>
          <Switch
            checked={settings.research.enabled}
            onCheckedChange={(value: boolean) =>
              updateSettings((current) => ({
                ...current,
                research: { ...current.research, enabled: value },
              }))
            }
          />
        </div>

        <div className="max-w-xs space-y-2">
          <Label htmlFor="maxSearchSteps">Max search steps</Label>
          <Input
            id="maxSearchSteps"
            type="number"
            min={1}
            max={100}
            value={settings.research.maxSearchSteps}
            onChange={(event) => {
              const parsed = parseInt(event.target.value, 10);
              if (Number.isNaN(parsed)) return;
              updateSettings((current) => ({
                ...current,
                research: {
                  ...current.research,
                  maxSearchSteps: Math.min(100, Math.max(1, parsed)),
                },
              }));
            }}
          />
          <p className="text-xs text-muted-foreground">
            Maximum number of search iterations the research agent can perform
            (1–100).
          </p>
        </div>

        <div className="max-w-xs space-y-2">
          <Label htmlFor="searchProvider">Search Provider</Label>
          <Select
            value={settings.research.searchProvider ?? "brave"}
            onValueChange={(value: string) =>
              updateSettings((current) => ({
                ...current,
                research: {
                  ...current.research,
                  searchProvider: value as SearchProvider,
                },
              }))
            }
          >
            <SelectTrigger id="searchProvider" className="w-full">
              <SelectValue placeholder="Select search provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="brave">Brave Search</SelectItem>
              <SelectItem value="duckduckgo">DuckDuckGo (unstable)</SelectItem>
              <SelectItem value="zai">Z.AI Search</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Search backend for franchise research. Brave requires a free API key.
            DuckDuckGo may be blocked. Z.AI uses MCP tool calling.
          </p>
        </div>

        {settings.research.searchProvider === "brave" && (
          <div className="max-w-xs space-y-2">
            <Label htmlFor="braveApiKey">Brave Search API Key</Label>
            <Input
              id="braveApiKey"
              type="password"
              placeholder="BSA..."
              value={settings.research.braveApiKey ?? ""}
              onChange={(e) =>
                updateSettings((current) => ({
                  ...current,
                  research: {
                    ...current.research,
                    braveApiKey: e.target.value,
                  },
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Get a free key at{" "}
              <a
                href="https://brave.com/search/api/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                brave.com/search/api
              </a>
              {" "}— $5 free credits/month (~1000 searches).
            </p>
          </div>
        )}

        {settings.research.searchProvider === "zai" && (
          <div className="max-w-xs space-y-2">
            <Label htmlFor="zaiApiKey">Z.AI API Key</Label>
            <Input
              id="zaiApiKey"
              type="password"
              placeholder="..."
              value={settings.research.zaiApiKey ?? ""}
              onChange={(e) =>
                updateSettings((current) => ({
                  ...current,
                  research: {
                    ...current.research,
                    zaiApiKey: e.target.value,
                  },
                }))
              }
            />
            <p className="text-xs text-muted-foreground">
              Z.AI API key for web search MCP.{" "}
              <a
                href="https://z.ai"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                z.ai
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
