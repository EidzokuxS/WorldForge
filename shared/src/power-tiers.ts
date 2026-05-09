import type { TierRank, ApDurabilityTier, SpeedTier, IntelligenceTier, HaxAbility } from "./types.js";
import { AP_DURABILITY_TIERS, SPEED_TIERS, INTELLIGENCE_TIERS } from "./types.js";

export { AP_DURABILITY_TIERS, SPEED_TIERS, INTELLIGENCE_TIERS };

// --- Normalization maps for common LLM output variants ---

const AP_DUR_ALIASES: Record<string, ApDurabilityTier> = {
  "city level": "City",
  "city-level": "City",
  "town level": "Town",
  "town-level": "Town",
  "building level": "Building",
  "building-level": "Building",
  "wall level": "Wall",
  "wall-level": "Wall",
  "street level": "Street",
  "street-level": "Street",
  "mountain level": "Mountain",
  "mountain-level": "Mountain",
  "island level": "Island",
  "island-level": "Island",
  "country level": "Country",
  "country-level": "Country",
  "continental level": "Continental",
  "continental-level": "Continental",
  "planetary": "Planet",
  "stellar": "Star",
  "galactic": "Galaxy",
  "universal level": "Universal",
  "multiversal": "Multiversal+",
  "multi-versal+": "Multiversal+",
  "city block level": "City Block",
  "city block-level": "City Block",
  "solar system level": "Solar System",
  "solar-system": "Solar System",
  "moon level": "Moon",
  "star level": "Star",
  "planet level": "Planet",
  "galaxy level": "Galaxy",
  "human level": "Human",
};

const SPEED_ALIASES: Record<string, SpeedTier> = {
  "massively hypersonic": "Massively Hypersonic",
  "massively hypersonic+": "Massively Hypersonic",
  "mhs": "Massively Hypersonic",
  "mhs+": "Massively Hypersonic",
  "sub-relativistic": "Sub-Relativistic",
  "sub relativistic": "Sub-Relativistic",
  "ftl+": "FTL",
  "faster than light": "FTL",
  "mftl+": "MFTL",
  "massively ftl": "MFTL",
  "massively ftl+": "MFTL",
  "infinite speed": "Infinite",
  "human speed": "Human",
  "superhuman speed": "Superhuman",
};

const INT_ALIASES: Record<string, IntelligenceTier> = {
  "above average intelligence": "Above Average",
  "above-average": "Above Average",
  "extraordinary genius": "Extraordinary Genius",
  "super genius": "Supergenius",
  "super-genius": "Supergenius",
  "genius level": "Genius",
  "genius-level": "Genius",
  "gifted intelligence": "Gifted",
  "average intelligence": "Average",
};

/**
 * Normalize a tier name string from LLM output to canonical enum value.
 * Returns undefined if no match found (caller should handle retry or rejection).
 * Tries: exact match first, then case-insensitive exact, then alias lookup.
 */
export function normalizeTierName<T extends string>(
  tierList: readonly T[],
  aliases: Record<string, T>,
  raw: string,
): T | undefined {
  // Exact match
  if ((tierList as readonly string[]).includes(raw)) return raw as T;
  // Case-insensitive exact match
  const lower = raw.toLowerCase().trim();
  const exactCI = tierList.find(t => t.toLowerCase() === lower);
  if (exactCI) return exactCI;
  // Alias lookup
  return aliases[lower];
}

export function normalizeApDurTier(raw: string): ApDurabilityTier | undefined {
  return normalizeTierName(AP_DURABILITY_TIERS, AP_DUR_ALIASES, raw);
}

export function normalizeSpeedTier(raw: string): SpeedTier | undefined {
  return normalizeTierName(SPEED_TIERS, SPEED_ALIASES, raw);
}

export function normalizeIntelligenceTier(raw: string): IntelligenceTier | undefined {
  return normalizeTierName(INTELLIGENCE_TIERS, INT_ALIASES, raw);
}

export function compareTiers<T extends string>(
  tierList: readonly T[],
  a: TierRank<T>,
  b: TierRank<T>,
): number {
  const indexA = tierList.indexOf(a.tier);
  const indexB = tierList.indexOf(b.tier);
  if (indexA !== indexB) return indexA - indexB;
  return a.rank - b.rank;
}

export function tierDistance<T extends string>(
  tierList: readonly T[],
  a: TierRank<T>,
  b: TierRank<T>,
): { tiers: number; total: number } {
  const indexA = tierList.indexOf(a.tier);
  const indexB = tierList.indexOf(b.tier);
  const tierDiff = indexA - indexB;
  const totalSteps = tierDiff * 10 + (a.rank - b.rank);
  return { tiers: tierDiff, total: totalSteps };
}

export function canHaxBypass(
  hax: HaxAbility,
  targetDurability: TierRank<ApDurabilityTier>,
): boolean {
  if (!hax.bypassTier) return false;
  const bypassIndex = AP_DURABILITY_TIERS.indexOf(hax.bypassTier);
  const targetIndex = AP_DURABILITY_TIERS.indexOf(targetDurability.tier);
  return bypassIndex >= targetIndex;
}

export function formatTierRank<T extends string>(tr: TierRank<T>): string {
  return `${tr.tier} ${tr.rank}`;
}
