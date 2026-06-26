import type { CampaignWorldbookSelection, SeedCategory } from "@/lib/types";
import type {
  CanonicalLoadoutPreview,
  CharacterDraft,
  CharacterRecord,
  LocationKind,
  LocationPersistence,
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

export type PublicDtoHandle = string;

export type WorldLocationConnectedPath = {
  edgeId: PublicDtoHandle;
  routeHandle: PublicDtoHandle;
  toLocationId: PublicDtoHandle;
  toPlaceHandle: PublicDtoHandle;
  toLocationName?: string | null;
  travelCost: number;
  discovered?: boolean;
};

export type WorldLocationRecentHappening = {
  id: PublicDtoHandle;
  eventHandle: PublicDtoHandle;
  locationId: PublicDtoHandle;
  placeHandle: PublicDtoHandle;
  sourceLocationId?: PublicDtoHandle | null;
  sourcePlaceHandle?: PublicDtoHandle | null;
  anchorLocationId?: PublicDtoHandle | null;
  anchorPlaceHandle?: PublicDtoHandle | null;
  eventType: string;
  summary: string;
  tick: number;
  importance: number;
  archivedAtTick?: number | null;
  createdAt: number;
};

export type WorldSceneAwarenessBand = "none" | "hint" | "clear";

export interface WorldCurrentScene {
  id: PublicDtoHandle | null;
  sceneHandle?: PublicDtoHandle | null;
  name: string | null;
  broadLocationId: PublicDtoHandle | null;
  broadPlaceHandle?: PublicDtoHandle | null;
  broadLocationName: string | null;
  sceneNpcIds: PublicDtoHandle[];
  actorHandles?: PublicDtoHandle[];
  clearNpcIds: PublicDtoHandle[];
  clearActorHandles?: PublicDtoHandle[];
  awareness: {
    byNpcId: Record<PublicDtoHandle, WorldSceneAwarenessBand>;
    byActorHandle?: Record<PublicDtoHandle, WorldSceneAwarenessBand>;
    hintSignals: string[];
  };
}

export interface WorldLocation {
  id: PublicDtoHandle;
  placeHandle?: PublicDtoHandle;
  name: string;
  description: string;
  tags: string[];
  connectedTo: PublicDtoHandle[];
  connectedToPlaceHandles?: PublicDtoHandle[];
  connectedPaths?: WorldLocationConnectedPath[];
  recentHappenings?: WorldLocationRecentHappening[];
  isStarting: boolean;
  locationKind?: LocationKind | null;
  parentLocationId?: PublicDtoHandle | null;
  parentPlaceHandle?: PublicDtoHandle | null;
  anchorLocationId?: PublicDtoHandle | null;
  anchorPlaceHandle?: PublicDtoHandle | null;
  persistence?: LocationPersistence | null;
  expiresAtTick?: number | null;
  archivedAtTick?: number | null;
}

export interface WorldPlayerInventoryItem {
  id: PublicDtoHandle;
  itemHandle?: PublicDtoHandle;
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

export interface WorldData {
  currentTick: number;
  worldVersion: number;
  worldTimeMinutes: number;
  currentScene: WorldCurrentScene | null;
  locations: WorldLocation[];
  npcs: Array<{
    id: PublicDtoHandle;
    actorHandle?: PublicDtoHandle;
    name: string;
    persona: string;
    tags: string[];
    tier: string;
    currentLocationId: PublicDtoHandle | null;
    currentPlaceHandle?: PublicDtoHandle | null;
    sceneScopeId: PublicDtoHandle | null;
    sceneHandle?: PublicDtoHandle | null;
    goals: { short_term: string[]; long_term: string[] };
    beliefs: string[];
    characterRecord?: CharacterRecord | null;
    draft?: CharacterDraft | null;
    npc?: ScaffoldNpc | null;
  }>;
  factions: Array<{
    id: PublicDtoHandle;
    factionHandle?: PublicDtoHandle;
    name: string;
    tags: string[];
    goals: string[];
    assets: string[];
  }>;
  relationships: Array<{
    id: PublicDtoHandle;
    relationshipHandle?: PublicDtoHandle;
    entityA: PublicDtoHandle | null;
    entityAHandle?: PublicDtoHandle | null;
    entityB: PublicDtoHandle | null;
    entityBHandle?: PublicDtoHandle | null;
    tags: string[];
    reason: string | null;
  }>;
  items: Array<{
    id: PublicDtoHandle;
    itemHandle?: PublicDtoHandle;
    name: string;
    tags: string[];
    ownerId: PublicDtoHandle | null;
    ownerActorHandle?: PublicDtoHandle | null;
    locationId: PublicDtoHandle | null;
    placeHandle?: PublicDtoHandle | null;
  }>;
  player: {
    id: PublicDtoHandle;
    actorHandle?: PublicDtoHandle;
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
    currentLocationId: PublicDtoHandle | null;
    currentPlaceHandle?: PublicDtoHandle | null;
    sceneScopeId: PublicDtoHandle | null;
    sceneHandle?: PublicDtoHandle | null;
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
  kind?: "macro" | "persistent_sublocation";
  parentLocationName?: string | null;
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
  sceneLocationName?: string | null;
  factionName: string | null;
  tier: "key" | "supporting";
  draft?: CharacterDraft;
  /** Frontend-only cache for advanced review/inspection. Stripped by backend Zod validation. */
  characterRecord?: CharacterRecord | null;
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
  | { campaignId: string; section: "npcs"; refinedPremise: string; locations: ScaffoldLocation[]; locationNames: string[]; factionNames: string[]; additionalInstruction?: string };

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
  id: PublicDtoHandle;
  checkpointHandle: PublicDtoHandle;
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
