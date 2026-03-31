import type { CampaignWorldbookSelection, SeedCategory } from "@/lib/types";

export interface TestConnectionRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface TestConnectionResult {
  success: boolean;
  latencyMs: number;
  model: string;
  error?: string;
}

export interface TestRoleResult {
  success: boolean;
  role: string;
  model: string;
  response?: string;
  error?: string;
  latencyMs: number;
}

export interface RollSeedResult {
  category: SeedCategory;
  value: string | string[];
}

export interface GenerateWorldResult {
  refinedPremise?: string;
  locationCount?: number;
  npcCount?: number;
  factionCount?: number;
  startingLocation?: string;
}

export interface GenerationProgress {
  step: number;
  totalSteps: number;
  label: string;
}

export interface WorldData {
  locations: Array<{
    id: string;
    campaignId: string;
    name: string;
    description: string;
    tags: string[];
    connectedTo: string[];
    isStarting: boolean;
  }>;
  npcs: Array<{
    id: string;
    campaignId: string;
    name: string;
    persona: string;
    tags: string[];
    tier: string;
    currentLocationId: string | null;
    goals: { short_term: string[]; long_term: string[] };
    beliefs: string[];
  }>;
  factions: Array<{
    id: string;
    campaignId: string;
    name: string;
    tags: string[];
    goals: string[];
    assets: string[];
  }>;
  relationships: Array<{
    id: string;
    campaignId: string;
    entityA: string;
    entityB: string;
    tags: string[];
    reason: string | null;
  }>;
  items: Array<{
    id: string;
    name: string;
    tags: string[];
    ownerId: string | null;
    locationId: string | null;
  }>;
  player: {
    id: string;
    campaignId: string;
    name: string;
    race: string;
    gender: string;
    age: string;
    appearance: string;
    hp: number;
    tags: string[];
    equippedItems: string[];
    currentLocationId: string | null;
  } | null;
}

export const LORE_CARD_CATEGORIES = [
  "concept",
  "rule",
  "location",
  "faction",
  "npc",
  "ability",
  "item",
  "event",
] as const;

export type LoreCardCategory = (typeof LORE_CARD_CATEGORIES)[number];

export interface LoreCardUpdateInput {
  term: string;
  definition: string;
  category: LoreCardCategory;
}

export interface LoreCardItem {
  id: string;
  term: string;
  definition: string;
  category: LoreCardCategory;
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

export interface ScaffoldNpc {
  name: string;
  persona: string;
  tags: string[];
  goals: { shortTerm: string[]; longTerm: string[] };
  locationName: string;
  factionName: string | null;
  /** Frontend-only stable key for React rendering. Stripped by backend Zod validation. */
  _uid?: string;
}

export interface ScaffoldLoreCard {
  term: string;
  definition: string;
  category: string;
}

export interface EditableScaffold {
  refinedPremise: string;
  locations: ScaffoldLocation[];
  factions: ScaffoldFaction[];
  npcs: ScaffoldNpc[];
  loreCards: ScaffoldLoreCard[];
}

export type RegenerateSectionRequest =
  | { campaignId: string; section: "premise"; additionalInstruction?: string }
  | { campaignId: string; section: "locations"; refinedPremise: string; additionalInstruction?: string }
  | { campaignId: string; section: "factions"; refinedPremise: string; locationNames: string[]; additionalInstruction?: string }
  | { campaignId: string; section: "npcs"; refinedPremise: string; locationNames: string[]; factionNames: string[]; additionalInstruction?: string };

export interface ParsedCharacter {
  name: string;
  race: string;
  gender: string;
  age: string;
  appearance: string;
  tags: string[];
  hp: number;
  equippedItems: string[];
  locationName: string;
}

export type CharacterResult =
  | { role: "player"; character: ParsedCharacter }
  | { role: "key"; npc: ScaffoldNpc };

export type CheckpointMeta = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  auto: boolean;
};

// ───── WorldBook Import ─────

export interface ClassifiedWorldBookEntry {
  name: string;
  type: "character" | "location" | "faction" | "bestiary" | "lore_general";
  summary: string;
}

export interface WorldBookImportResult {
  imported: {
    characters: number;
    locations: number;
    factions: number;
    loreCards: number;
  };
}

export type WorldbookLibraryItem = CampaignWorldbookSelection;
