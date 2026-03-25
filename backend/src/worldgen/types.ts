import type { ResearchConfig } from "@worldforge/shared";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type { WorldSeeds } from "./seed-roller.js";

export interface GenerateScaffoldRequest {
  campaignId: string;
  name: string;
  premise: string;
  seeds?: Partial<WorldSeeds>;
  role: ResolvedRole;
  /** Optional fallback role for retrying lore extraction when primary model fails. */
  fallbackRole?: ResolvedRole;
  /** Optional: name of a known franchise/IP to research before generation (e.g. "Warhammer 40,000"). If omitted, franchise detection runs on premise/name automatically. Pass an empty string to disable research entirely. */
  knownIP?: string;
  /** Research agent configuration. When omitted, defaults to enabled with 10 max steps. */
  research?: ResearchConfig;
}

export interface GenerationProgress {
  step: number;
  totalSteps: number;
  label: string;
}

export interface ScaffoldLocation {
  name: string;
  description: string;
  tags: string[];
  isStarting: boolean;
  connectedTo: string[];
}

export interface ScaffoldFaction {
  name: string;
  tags: string[];
  goals: string[];
  assets: string[];
  territoryNames: string[];
}

export interface ScaffoldNpcGoals {
  shortTerm: string[];
  longTerm: string[];
}

export interface ScaffoldNpc {
  name: string;
  persona: string;
  tags: string[];
  goals: ScaffoldNpcGoals;
  locationName: string;
  factionName: string | null;
  /** NPC importance tier. "key" = canonical/plot-relevant, "supporting" = original/background.
   *  Optional until plan 24-03 rewrites the NPC generation step to always populate it. */
  tier?: "key" | "supporting";
}

export const LORE_CATEGORIES = [
  "location", "npc", "faction", "ability", "rule", "concept", "item", "event",
] as const;

export type LoreCategory = (typeof LORE_CATEGORIES)[number];

export interface ExtractedLoreCard {
  term: string;
  definition: string;
  category: LoreCategory;
}

export interface WorldScaffold {
  refinedPremise: string;
  locations: ScaffoldLocation[];
  factions: ScaffoldFaction[];
  npcs: ScaffoldNpc[];
  loreCards: ExtractedLoreCard[];
}
