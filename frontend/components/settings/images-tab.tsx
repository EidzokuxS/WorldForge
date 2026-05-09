"use client";

import { NONE_PROVIDER_ID } from "@/lib/settings";
import type { Settings } from "@/lib/types";
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
import { Textarea } from "@/components/ui/textarea";

export interface ImagesTabProps {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
}

export function ImagesTab({ settings, setSettings }: ImagesTabProps) {
  const updateSettings = (updater: (current: Settings) => Settings) => {
    setSettings((current) => updater(current));
  };

  return (
    <section className="wf-set-group">
      <div className="wf-set-group-head">
        <div>
          <h2 className="wf-set-group-h">Images</h2>
          <p className="wf-set-group-sub">
            Configure provider, model, and style defaults for generated assets.
          </p>
        </div>
      </div>

      <div className="wf-set-row">
        <div>
          <div className="wf-set-row-h">Enable image generation</div>
          <div className="wf-set-row-sub">Disable to keep the game in text-only mode.</div>
        </div>
        <Switch
          checked={settings.images.enabled}
          onCheckedChange={(value: boolean) =>
            updateSettings((current) => ({
              ...current,
              images: { ...current.images, enabled: value },
            }))
          }
        />
      </div>

      <div className="wf-set-row">
        <div>
          <div className="wf-set-row-h">Image Provider</div>
          <div className="wf-set-row-sub">Provider used for generated assets.</div>
        </div>
        <Select
          value={settings.images.providerId}
          onValueChange={(value: string) =>
            updateSettings((current) => ({
              ...current,
              images: { ...current.images, providerId: value },
            }))
          }
        >
          <SelectTrigger className="wf-settings-control">
            <SelectValue placeholder="Select image provider" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_PROVIDER_ID}>None / Disabled</SelectItem>
            {settings.providers.map((provider) => (
              <SelectItem key={provider.id} value={provider.id}>
                {provider.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="wf-set-row">
        <div>
          <div className="wf-set-row-h">Model / Checkpoint</div>
          <div className="wf-set-row-sub">Image model name.</div>
        </div>
        <Input
          className="wf-settings-control"
          value={settings.images.model}
          onChange={(event) =>
            updateSettings((current) => ({
              ...current,
              images: { ...current.images, model: event.target.value },
            }))
          }
          placeholder="sd-xl-turbo"
        />
      </div>

      <div className="wf-set-block">
        <Label>Default style prompt</Label>
        <Textarea
          value={settings.images.stylePrompt}
          onChange={(event) =>
            updateSettings((current) => ({
              ...current,
              images: {
                ...current.images,
                stylePrompt: event.target.value,
              },
            }))
          }
          rows={5}
          placeholder="dark fantasy art, matte painting style..."
        />
      </div>
    </section>
  );
}
