"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { testRole } from "@/lib/api";
import { clamp } from "@/lib/clamp";
import { getErrorMessage } from "@/lib/settings";
import type { RoleConfig, Settings } from "@/lib/types";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RoleConfigCard, type RoleName } from "@/components/settings/role-config-card";

const ROLE_META: Record<RoleName, { title: string; description: string }> = {
  judge: {
    title: "Judge",
    description: "Fast, structured model for rulings and tool decisions.",
  },
  storyteller: {
    title: "Storyteller",
    description: "Creative model for narrative text and dialogue.",
  },
  generator: {
    title: "Generator",
    description:
      "Model for world generation — locations, NPCs, factions, lore. Needs strong structured output.",
  },
  embedder: {
    title: "Embedder",
    description:
      "Embedding model for semantic search over lore cards. Only needs provider and model name.",
  },
};

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

export interface RolesTabProps {
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
}

export function RolesTab({ settings, setSettings }: RolesTabProps) {
  const [testingRoles, setTestingRoles] = useState<Record<RoleName, boolean>>({
    judge: false,
    storyteller: false,
    generator: false,
    embedder: false,
  });

  const providerById = useMemo(() => {
    return new Map(settings.providers.map((provider) => [provider.id, provider]));
  }, [settings.providers]);

  const updateSettings = (updater: (current: Settings) => Settings) => {
    setSettings((current) => updater(current));
  };

  const handleRoleConfigChange = (role: RoleName, update: Partial<RoleConfig>) => {
    updateSettings((current) => ({
      ...current,
      [role]: { ...current[role], ...update },
    }));
  };

  const handleTestRole = async (role: RoleName) => {
    if (role === "embedder") {
      toast.info("Embedder cannot be tested with a text prompt. Configure a provider and model for embedding.");
      return;
    }
    setTestingRoles((current) => ({
      ...current,
      [role]: true,
    }));
    try {
      const result = await testRole(role, settings);

      if (result.success) {
        const responsePreview = truncateText(result.response?.trim() ?? "", 200);
        toast.success(`${role} — ${result.model} (${result.latencyMs}ms)`, {
          description: responsePreview || "Model returned an empty response.",
        });
      } else {
        toast.error(`Role test failed: ${role}`, {
          description: result.error ?? "Unknown role test error.",
        });
      }
    } catch (error) {
      toast.error(`Role test failed: ${role}`, {
        description:
          getErrorMessage(error, "Unknown role test error."),
      });
    } finally {
      setTestingRoles((current) => ({
        ...current,
        [role]: false,
      }));
    }
  };

  return (
    <>
      {(["judge", "storyteller", "generator", "embedder"] as const).map((role) => (
        <RoleConfigCard
          key={role}
          roleName={role}
          title={ROLE_META[role].title}
          description={ROLE_META[role].description}
          config={settings[role]}
          providers={settings.providers}
          resolvedProvider={providerById.get(settings[role].providerId)}
          isTesting={testingRoles[role]}
          hideAdvanced={role === "embedder"}
          onConfigChange={(update) => handleRoleConfigChange(role, update)}
          onTestRole={() => void handleTestRole(role)}
        />
      ))}

      <div className="rounded-lg border border-border/40 p-[clamp(16px,1.4vw,28px)]">
        <div className="mb-[clamp(12px,1vw,20px)]">
          <div className="text-[clamp(14px,1vw,18px)] font-semibold">Fallback</div>
          <div className="text-[clamp(11px,0.75vw,13px)] text-muted-foreground">
            Global provider fallback and timeout behavior.
          </div>
        </div>
        <div className="grid gap-[clamp(12px,1vw,20px)] md:grid-cols-2">
          <div className="space-y-2">
            <Label>Fallback Provider</Label>
            <Select
              value={settings.fallback.providerId}
              onValueChange={(value: string) =>
                updateSettings((current) => ({
                  ...current,
                  fallback: { ...current.fallback, providerId: value },
                }))
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {settings.providers.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Fallback Model</Label>
            <Input
              value={settings.fallback.model}
              onChange={(event) =>
                updateSettings((current) => ({
                  ...current,
                  fallback: { ...current.fallback, model: event.target.value },
                }))
              }
              placeholder="gpt-4o-mini"
            />
          </div>

          <div className="space-y-2">
            <Label>Global timeout (ms)</Label>
            <Input
              type="number"
              min={1000}
              max={120000}
              value={settings.fallback.timeoutMs}
              onChange={(event) =>
                updateSettings((current) => ({
                  ...current,
                  fallback: {
                    ...current.fallback,
                    timeoutMs: clamp(
                      Number.parseInt(event.target.value || "0", 10) || 30000,
                      1000,
                      120000
                    ),
                  },
                }))
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Retry count</Label>
            <Input
              type="number"
              min={0}
              max={10}
              value={settings.fallback.retryCount}
              onChange={(event) =>
                updateSettings((current) => ({
                  ...current,
                  fallback: {
                    ...current.fallback,
                    retryCount: clamp(
                      Number.parseInt(event.target.value || "0", 10) || 0,
                      0,
                      10
                    ),
                  },
                }))
              }
            />
          </div>
        </div>
      </div>
    </>
  );
}
