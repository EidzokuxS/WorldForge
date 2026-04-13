"use client";

import type { Settings } from "@/lib/types";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface GameplayTabProps {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
}

export function GameplayTab({ settings, setSettings }: GameplayTabProps) {
  const updateSettings = (updater: (current: Settings) => Settings) => {
    setSettings((current) => updater(current));
  };

  return (
    <div className="rounded-lg border border-border/40 p-[clamp(16px,1.4vw,28px)]">
      <div className="mb-[clamp(12px,1vw,20px)]">
        <div className="text-[clamp(14px,1vw,18px)] font-semibold">Gameplay Debug</div>
        <p className="text-[clamp(11px,0.75vw,13px)] text-muted-foreground">
          Debug-only controls for inspecting optional provider output without
          changing the canonical play surface.
        </p>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-lg border border-border/50 bg-muted/20 p-4">
        <div className="space-y-2">
          <Label htmlFor="showRawReasoning" className="text-sm font-medium">
            Show raw reasoning
          </Label>
          <p className="text-xs text-muted-foreground">
            Debug-only. Hidden by default. When a provider exposes separate
            reasoning, this only reveals that raw block and does not alter
            canonical narration.
          </p>
        </div>
        <Switch
          id="showRawReasoning"
          checked={settings.ui.showRawReasoning}
          onCheckedChange={(value: boolean) =>
            updateSettings((current) => ({
              ...current,
              ui: {
                ...current.ui,
                showRawReasoning: value,
              },
            }))
          }
        />
      </div>
    </div>
  );
}
