import type { CampaignWorldbookSelection, SeedCategory } from "@/lib/types";
import type {
  CanonicalLoadoutPreview,
  CharacterDraft,
  CharacterRecord,
  LocationConnectedPathSummary,
  LocationKind,
  LocationPersistence,
  LocationRecentHappeningSummary,
  PersonaTemplate,
  PersonaTemplateSummary,
  ResolvedStartConditions,
} from "@worldforge/shared";
export type {
  CanonicalLoadoutPreview,
  LocationKind,
  LocationPersistence,
  PersonaTemplate,
  PersonaTemplateSummary,
  ResolvedStartConditions,
} from "@worldforge/shared";

export type WorldLocationConnectedPath = LocationConnectedPathSummary & {
  toLocationName?: string | null;
};

export type WorldLocationRecentHappening = LocationRecentHappeningSummary;

export type WorldSceneAwarenessBand = "none" | "hint" | "clear";

export interface WorldCurrentScene {
  id: string | null;
  name: string | null;
  broadLocationId: string | null;
  broadLocationName: string | null;
  sceneNpcIds: string[];
  clearNpcIds: string[];
  awareness: {
    byNpcId: Record<string, WorldSceneAwarenessBand>;
    hintSignals: string[];
  };
}

export interface WorldLocation {
  id: string;
  campaignId: string;
  name: string;
  description: string;
  tags: string[];
  connectedTo: string[];
  connectedPaths?: WorldLocationConnectedPath[];
  recentHappenings?: WorldLocationRecentHappening[];
  isStarting: boolean;
  locationKind?: LocationKind | null;
  parentLocationId?: string | null;
  anchorLocationId?: string | null;
  persistence?: LocationPersistence | null;
  expiresAtTick?: number | null;
  archivedAtTick?: number | null;
}

export interface WorldPlayerInventoryItem {
  id: string;
  name: string;
  tags: string[];
  equipState: "carried" | "equipped";
  equippedSlot: string | null;
  isSignature: boolean;
}

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
  /** Current entity index within stage (0-based) */
  subStep?: number;
  /** Total entities in stage */
  subTotal?: number;
  /** Entity name or validation round label */
  subLabel?: string;
}

export interface WorldData {
  currentScene: WorldCurrentScene | null;
  locations: WorldLocation[];
  npcs: Array<{
    id: string;
    campaignId: string;
    name: string;
    persona: string;
    tags: string[];
    tier: string;
    currentLocationId: string | null;
    sceneScopeId: string | null;
    goals: { short_term: string[]; long_term: string[] };
    beliefs: string[];
    characterRecord?: CharacterRecord | null;
    draft?: CharacterDraft | null;
    npc?: ScaffoldNpc | null;
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
    inventory: WorldPlayerInventoryItem[];
    equipment: WorldPlayerInventoryItem[];
    currentLocationId: string | null;
    sceneScopeId: string | null;
    characterRecord?: CharacterRecord | null;
    draft?: CharacterDraft | null;
    character?: ParsedCharacter | null;
  } | null;
  personaTemplates: PersonaTemplateSummary[];
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
  category: string;
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
  tier: "key" | "supporting";
  draft?: CharacterDraft;
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
  personaTemplates?: PersonaTemplateSummary[];
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
  draft?: CharacterDraft;
}

type CharacterResultEnvelope = {
  draft: CharacterDraft;
  characterRecord?: CharacterRecord | null;
};

export type CharacterResult =
  | ({ role: "player"; character: ParsedCharacter } & CharacterResultEnvelope)
  | ({ role: "key"; npc: ScaffoldNpc } & CharacterResultEnvelope);

export type PersonaTemplateRecord = PersonaTemplate;
export type PersonaTemplateListResult = {
  personaTemplates: PersonaTemplateSummary[];
};

export type ApplyPersonaTemplateResult =
  | ({
      character: ParsedCharacter;
      personaTemplate: PersonaTemplateSummary;
    } & CharacterResultEnvelope)
  | ({
      npc: ScaffoldNpc;
      personaTemplate: PersonaTemplateSummary;
    } & CharacterResultEnvelope);

export type ResolveStartConditionsResult = ResolvedStartConditions;
export type LoadoutPreviewResult = CanonicalLoadoutPreview;

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
