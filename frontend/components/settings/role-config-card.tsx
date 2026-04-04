import { Loader2, Play } from "lucide-react";
import { clamp } from "@/lib/clamp";
import type { Provider, RoleConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

export type RoleName = "judge" | "storyteller" | "generator" | "embedder";

export interface RoleConfigCardProps {
  roleName: RoleName;
  title: string;
  description: string;
  config: RoleConfig;
  providers: Provider[];
  resolvedProvider: Provider | undefined;
  isTesting: boolean;
  hideAdvanced?: boolean;
  onConfigChange: (update: Partial<RoleConfig>) => void;
  onTestRole: () => void;
}

function normalizeTemperature(value: number): number {
  return Number((Math.round(value * 10) / 10).toFixed(1));
}

export function RoleConfigCard({
  roleName,
  title,
  description,
  config,
  providers,
  resolvedProvider,
  isTesting,
  hideAdvanced,
  onConfigChange,
  onTestRole,
}: RoleConfigCardProps) {
  return (
    <div className="rounded-lg border border-border/40 p-[clamp(16px,1.4vw,28px)]">
      <div className="mb-[clamp(12px,1vw,20px)] flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[clamp(14px,1vw,18px)] font-semibold">{title}</div>
          <div className="text-[clamp(11px,0.75vw,13px)] text-muted-foreground">{description}</div>
        </div>
        <Button
          variant="secondary"
          disabled={isTesting}
          onClick={onTestRole}
        >
          {isTesting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {isTesting ? "Testing..." : "Test Role"}
        </Button>
      </div>
      <div className="grid gap-[clamp(12px,1vw,20px)] md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${roleName}-provider`}>Provider</Label>
          <Select
            value={config.providerId}
            onValueChange={(value: string) =>
              onConfigChange({ providerId: value })
            }
          >
            <SelectTrigger id={`${roleName}-provider`} className="w-full">
              <SelectValue placeholder="Select provider" />
            </SelectTrigger>
            <SelectContent>
              {providers.map((provider) => (
                <SelectItem key={provider.id} value={provider.id}>
                  {provider.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${roleName}-model`}>
            Model (leave empty for provider default)
          </Label>
          <Input
            id={`${roleName}-model`}
            value={config.model ?? ""}
            onChange={(event) =>
              onConfigChange({ model: event.target.value })
            }
            placeholder={resolvedProvider?.defaultModel || "gpt-4o-mini"}
          />
        </div>

        {!hideAdvanced && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Default temperature</Label>
                <span className="text-xs text-muted-foreground">
                  {config.temperature.toFixed(1)}
                </span>
              </div>
              <Slider
                min={0}
                max={2}
                step={0.1}
                value={[config.temperature]}
                onValueChange={([value]: number[]) =>
                  onConfigChange({
                    temperature: normalizeTemperature(value ?? 0),
                  })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`${roleName}-max-tokens`}>Max tokens</Label>
              <Input
                id={`${roleName}-max-tokens`}
                type="number"
                min={1}
                max={32000}
                value={config.maxTokens}
                onChange={(event) =>
                  onConfigChange({
                    maxTokens: clamp(
                      Number.parseInt(event.target.value || "0", 10) || 1,
                      1,
                      32000
                    ),
                  })
                }
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
