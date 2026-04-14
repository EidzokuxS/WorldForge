"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { testRole } from "@/lib/api";
import { getErrorMessage } from "@/lib/settings";
import type { RoleConfig, Settings } from "@/lib/types";
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
    </>
  );
}
