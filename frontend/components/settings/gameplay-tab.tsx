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
    <section className="wf-set-group">
      <div className="wf-set-group-head">
        <div>
          <h2 className="wf-set-group-h">Gameplay</h2>
          <p className="wf-set-group-sub">
            Debug-only controls for inspecting optional provider output without
            changing the canonical play surface.
          </p>
        </div>
      </div>

      <div className="wf-set-row">
        <div className="space-y-2">
          <Label htmlFor="showRawReasoning" className="wf-set-row-h">
            Show raw reasoning
          </Label>
          <p className="wf-set-row-sub">
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
    </section>
  );
}
