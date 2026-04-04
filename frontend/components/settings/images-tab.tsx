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
    <div className="rounded-lg border border-border/40 p-[clamp(16px,1.4vw,28px)]">
      <div className="mb-[clamp(12px,1vw,20px)]">
        <div className="text-[clamp(14px,1vw,18px)] font-semibold">Image Generation</div>
        <div className="text-[clamp(11px,0.75vw,13px)] text-muted-foreground">
          Configure provider, model, and style defaults for generated assets.
        </div>
      </div>
      <div className="space-y-[clamp(8px,0.7vw,14px)]">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enable image generation</p>
            <p className="text-xs text-muted-foreground">
              Disable to keep the game in text-only mode.
            </p>
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

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Image Provider</Label>
            <Select
              value={settings.images.providerId}
              onValueChange={(value: string) =>
                updateSettings((current) => ({
                  ...current,
                  images: { ...current.images, providerId: value },
                }))
              }
            >
              <SelectTrigger className="w-full">
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

          <div className="space-y-2">
            <Label>Model / Checkpoint</Label>
            <Input
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
        </div>

        <div className="space-y-2">
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
      </div>
    </div>
  );
}
