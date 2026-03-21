import { isLocalProvider } from "@worldforge/shared";
import type { SeedCategory, WorldSeeds } from "@/lib/types";

export type { CampaignMeta } from "@worldforge/shared";

export type SeedSlot = {
  value: string | string[];
  enabled: boolean;
  isCustom: boolean;
};

export type DnaState = {
  geography: SeedSlot;
  politicalStructure: SeedSlot;
  centralConflict: SeedSlot;
  culturalFlavor: SeedSlot;
  environment: SeedSlot;
  wildcard: SeedSlot;
};

export const WORLD_DNA_CARDS: Array<{
  category: SeedCategory;
  label: string;
  emoji: string;
}> = [
  { category: "geography", label: "Geography", emoji: "\uD83C\uDF0D" },
  { category: "politicalStructure", label: "Political Structure", emoji: "\uD83C\uDFDB\uFE0F" },
  { category: "centralConflict", label: "Central Conflict", emoji: "\u2694\uFE0F" },
  { category: "culturalFlavor", label: "Cultural Flavor", emoji: "\uD83C\uDFAD" },
  { category: "environment", label: "Environment", emoji: "\uD83C\uDF3F" },
  { category: "wildcard", label: "Wildcard", emoji: "\u2728" },
];

export function formatUtcDate(timestamp: number): string {
  return new Date(timestamp).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function readSeedValue(
  seeds: WorldSeeds,
  category: SeedCategory
): string | string[] {
  if (category === "culturalFlavor") {
    return Array.isArray(seeds.culturalFlavor) ? seeds.culturalFlavor : [];
  }

  const value = seeds[category];
  return typeof value === "string" ? value : "";
}

export function normalizeSeedValue(
  category: SeedCategory,
  value: string | string[]
): string | string[] {
  if (category === "culturalFlavor") {
    if (Array.isArray(value)) {
      return value.map((item) => item.trim()).filter(Boolean);
    }
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return value;
}

export function seedValueToTextarea(value: string | string[]): string {
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value;
}

export function createEmptyDnaState(): DnaState {
  return {
    geography: { value: "", enabled: true, isCustom: false },
    politicalStructure: { value: "", enabled: true, isCustom: false },
    centralConflict: { value: "", enabled: true, isCustom: false },
    culturalFlavor: { value: [], enabled: true, isCustom: false },
    environment: { value: "", enabled: true, isCustom: false },
    wildcard: { value: "", enabled: true, isCustom: false },
  };
}

export function createDnaStateFromSeeds(seeds: WorldSeeds): DnaState {
  const result = {} as DnaState;
  for (const { category } of WORLD_DNA_CARDS) {
    result[category] = { value: readSeedValue(seeds, category), enabled: true, isCustom: false };
  }
  return result;
}

export function isGeneratorConfigured(settings: {
  providers: Array<{ id: string; baseUrl: string; apiKey?: string }>;
  generator: { providerId: string };
}): boolean {
  const generatorProvider = settings.providers.find(
    (provider) => provider.id === settings.generator.providerId
  );
  if (!generatorProvider) {
    return false;
  }

  if (isLocalProvider(generatorProvider.baseUrl)) {
    return true;
  }

  return Boolean(generatorProvider.apiKey?.trim());
}

export function collectEnabledSeeds(dnaState: DnaState | null): Partial<WorldSeeds> | undefined {
  if (!dnaState) {
    return undefined;
  }

  const result: Partial<WorldSeeds> = {};
  let hasAny = false;

  for (const { category } of WORLD_DNA_CARDS) {
    const slot = dnaState[category];
    if (!slot.enabled) {
      continue;
    }

    if (category === "culturalFlavor") {
      const parsed = Array.isArray(slot.value)
        ? slot.value.filter(Boolean)
        : slot.value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean);
      if (parsed.length > 0) {
        result.culturalFlavor = parsed;
        hasAny = true;
      }
      continue;
    }

    const source = Array.isArray(slot.value) ? slot.value.join(", ") : slot.value;
    const text = source.trim();
    if (!text) {
      continue;
    }

    (result as Record<string, string>)[category] = text;
    hasAny = true;
  }

  return hasAny ? result : undefined;
}
