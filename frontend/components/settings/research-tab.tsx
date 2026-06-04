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
    <section className="wf-set-group">
      <div className="wf-set-group-head">
        <div>
          <h2 className="wf-set-group-h">Research</h2>
          <p className="wf-set-group-sub">
            Configure the AI research agent that supports world formation,
            character grounding, and live clarification for known IP campaigns.
          </p>
        </div>
      </div>
      <div className="wf-settings-list">
        <div className="wf-set-row">
          <div>
            <p className="wf-set-row-h">Enable research agent</p>
            <p className="wf-set-row-sub">
              When enabled, the system can research canon during world
              formation, resolve character grounding, and answer live
              clarification lookups in play.
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

        <div className="wf-set-row">
          <div>
            <div className="wf-set-row-h">Max search steps</div>
            <div className="wf-set-row-sub">
              Maximum number of search iterations, clamped from 1 to 100.
            </div>
          </div>
          <div className="wf-settings-control-stack">
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
        </div>

        <div className="wf-set-row">
          <div>
            <div className="wf-set-row-h">Search Provider</div>
            <div className="wf-set-row-sub">Backend source for franchise research.</div>
          </div>
          <div className="wf-settings-control-stack">
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
        </div>

        {settings.research.searchProvider === "brave" && (
          <div className="wf-set-row">
            <div>
              <div className="wf-set-row-h">Brave Search API Key</div>
              <div className="wf-set-row-sub">Credential for Brave Search API.</div>
            </div>
            <div className="wf-settings-control-stack">
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
          </div>
        )}

        {settings.research.searchProvider === "zai" && (
          <div className="wf-set-row">
            <div>
              <div className="wf-set-row-h">Z.AI API Key</div>
              <div className="wf-set-row-sub">Credential for Z.AI search MCP.</div>
            </div>
            <div className="wf-settings-control-stack">
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
          </div>
        )}
      </div>
    </section>
  );
}
