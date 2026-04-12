import type {
  CampaignMeta,
  CampaignWorldbookSelection,
  CharacterImportMode,
  IpResearchContext,
  PremiseDivergence,
  SeedCategory,
  Settings,
  WorldSeeds,
} from "@/lib/types";
import type {
  ApplyPersonaTemplateResult,
  TestConnectionRequest,
  TestConnectionResult,
  TestRoleResult,
  RollSeedResult,
  GenerateWorldResult,
  GenerationProgress,
  WorldData,
  LoreCardItem,
  LoreCardUpdateInput,
  ScaffoldLocation,
  ScaffoldFaction,
  ScaffoldNpc,
  ScaffoldLoreCard,
  EditableScaffold,
  RegenerateSectionRequest,
  ParsedCharacter,
  CharacterResult,
  CheckpointMeta,
  ClassifiedWorldBookEntry,
  LoadoutPreviewResult,
  PersonaTemplateListResult,
  PersonaTemplateRecord,
  ResolveStartConditionsResult,
  WorldBookImportResult,
  WorldbookLibraryItem,
  WorldCurrentScene,
  WorldLocationConnectedPath,
  WorldLocationRecentHappening,
  WorldPlayerInventoryItem,
  WorldSceneAwarenessBand,
} from "./api-types";
import type {
  CharacterDraft,
  CharacterRecord,
  ChatMessage,
  LocationKind,
  LocationPersistence,
} from "@worldforge/shared";
import {
  characterDraftToParsedCharacter,
  characterDraftToScaffoldNpc,
  characterRecordToDraft,
  parsedCharacterToDraft,
  scaffoldNpcToDraft,
} from "./character-drafts";

// Re-export all types so existing `import type { X } from "@/lib/api"` keeps working.
export type {
  TestConnectionRequest,
  TestConnectionResult,
  TestRoleResult,
  RollSeedResult,
  GenerateWorldResult,
  GenerationProgress,
  WorldData,
  LoreCardItem,
  LoreCardUpdateInput,
  ScaffoldLocation,
  ScaffoldFaction,
  ScaffoldNpc,
  ScaffoldLoreCard,
  EditableScaffold,
  RegenerateSectionRequest,
  ParsedCharacter,
  CharacterResult,
  ApplyPersonaTemplateResult,
  CheckpointMeta,
  ClassifiedWorldBookEntry,
  LoadoutPreviewResult,
  PersonaTemplateListResult,
  PersonaTemplateRecord,
  ResolveStartConditionsResult,
  WorldBookImportResult,
  WorldbookLibraryItem,
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";
const LAST_ACTIVE_CAMPAIGN_KEY = "worldforge:lastActiveCampaignId";

export type ChatHistoryResponse = {
  messages: ChatMessage[];
  premise: string;
  hasLiveTurnSnapshot: boolean;
};

export type LookupKind =
  | "world_canon_fact"
  | "character_canon_fact"
  | "power_profile"
  | "event_clarification";

export interface ChatLookupRequest {
  lookupKind: LookupKind;
  subject: string;
  compareAgainst?: string;
  question?: string;
}

export interface LookupResultEvent {
  lookupKind: LookupKind;
  subject: string;
  answer: string;
  citations: Array<{ kind?: string; label: string; excerpt: string }>;
  uncertaintyNotes: string[];
  sceneImpact: string;
}

// ───── Raw types (internal) ─────

interface RawWorldData {
  currentScene?: unknown;
  locations: Array<{
    id: string;
    campaignId: string;
    name: string;
    description: string;
    tags: unknown;
    connectedTo?: unknown;
    connectedPaths?: unknown;
    recentHappenings?: unknown;
    isStarting: boolean;
    kind?: LocationKind | null;
    locationKind?: LocationKind | null;
    parentLocationId?: string | null;
    anchorLocationId?: string | null;
    persistence?: LocationPersistence | null;
    expiresAtTick?: number | null;
    archivedAtTick?: number | null;
  }>;
  npcs: Array<{
    id: string;
    campaignId: string;
    name: string;
    persona: string;
    tags: string;
    tier: string;
    currentLocationId: string | null;
    sceneScopeId?: string | null;
    goals: string;
    beliefs: string;
    characterRecord?: CharacterRecord | null;
    draft?: CharacterDraft | null;
    npc?: ScaffoldNpc | null;
  }>;
  factions: Array<{
    id: string;
    campaignId: string;
    name: string;
    tags: string;
    goals: string;
    assets: string;
  }>;
  relationships: Array<{
    id: string;
    campaignId: string;
    entityA: string;
    entityB: string;
    tags: string;
    reason: string | null;
  }>;
  items: Array<{
    id: string;
    name: string;
    tags: string;
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
    tags: string;
    equippedItems: string;
    inventory?: unknown;
    equipment?: unknown;
    currentLocationId: string | null;
    sceneScopeId?: string | null;
    characterRecord?: CharacterRecord | null;
    draft?: CharacterDraft | null;
    character?: ParsedCharacter | null;
  } | null;
  personaTemplates?: Array<{
    id: string;
    campaignId: string;
    name: string;
    description: string;
    roleScope: "player" | "npc" | "any";
    tags: string[];
    createdAt: number;
    updatedAt: number;
  }>;
}

// ───── Helpers ─────

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

const EMPTY_NPC_GOALS = { short_term: [] as string[], long_term: [] as string[] };

function parseNpcGoals(value: unknown): { short_term: string[]; long_term: string[] } {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const obj = parsed as Record<string, unknown>;
      return {
        short_term: Array.isArray(obj.short_term) ? obj.short_term as string[] : [],
        long_term: Array.isArray(obj.long_term) ? obj.long_term as string[] : [],
      };
    }
    return EMPTY_NPC_GOALS;
  } catch {
    return EMPTY_NPC_GOALS;
  }
}

function parseNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseLocationKind(value: unknown): LocationKind | null {
  return value === "macro"
    || value === "persistent_sublocation"
    || value === "ephemeral_scene"
    ? value
    : null;
}

function parseLocationPersistence(value: unknown): LocationPersistence | null {
  return value === "persistent" || value === "ephemeral" ? value : null;
}

function parseWorldLocationConnectedPaths(value: unknown): WorldLocationConnectedPath[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item) => {
      if (typeof item !== "object" || item === null) {
        return [];
      }

      const path = item as Record<string, unknown>;
      const edgeId = typeof path.edgeId === "string" ? path.edgeId : null;
      const toLocationId = typeof path.toLocationId === "string"
        ? path.toLocationId
        : typeof path.locationId === "string"
          ? path.locationId
          : null;
      const travelCost = typeof path.travelCost === "number" && Number.isFinite(path.travelCost)
        ? path.travelCost
        : null;

      if (!edgeId || !toLocationId || travelCost == null) {
        return [];
      }

      return [{
        edgeId,
        toLocationId,
        toLocationName: typeof path.toLocationName === "string"
          ? path.toLocationName
          : typeof path.locationName === "string"
            ? path.locationName
            : null,
        travelCost,
        discovered: typeof path.discovered === "boolean" ? path.discovered : true,
      }];
    });
  } catch {
    return [];
  }
}

function parseWorldLocationRecentHappenings(value: unknown): WorldLocationRecentHappening[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item) => {
      if (typeof item !== "object" || item === null) {
        return [];
      }

      const event = item as Record<string, unknown>;
      const id = typeof event.id === "string" ? event.id : null;
      const locationId = typeof event.locationId === "string" ? event.locationId : null;
      const eventType = typeof event.eventType === "string" ? event.eventType : null;
      const summary = typeof event.summary === "string" ? event.summary : null;
      const tick = typeof event.tick === "number" && Number.isFinite(event.tick) ? event.tick : null;
      const importance = typeof event.importance === "number" && Number.isFinite(event.importance)
        ? event.importance
        : null;
      const createdAt = typeof event.createdAt === "number" && Number.isFinite(event.createdAt)
        ? event.createdAt
        : null;

      if (!id || !locationId || !eventType || !summary || tick == null || importance == null || createdAt == null) {
        return [];
      }

      return [{
        id,
        locationId,
        sourceLocationId: typeof event.sourceLocationId === "string" ? event.sourceLocationId : null,
        anchorLocationId: typeof event.anchorLocationId === "string" ? event.anchorLocationId : null,
        eventType,
        summary,
        tick,
        importance,
        archivedAtTick: parseNullableNumber(event.archivedAtTick),
        createdAt,
      }];
    });
  } catch {
    return [];
  }
}

function parseWorldPlayerInventoryItems(value: unknown): WorldPlayerInventoryItem[] {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item) => {
      if (typeof item !== "object" || item === null) {
        return [];
      }

      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : null;
      const name = typeof row.name === "string" ? row.name : null;
      const equipState = row.equipState === "equipped" ? "equipped" : row.equipState === "carried" ? "carried" : null;

      if (!id || !name || !equipState) {
        return [];
      }

      return [{
        id,
        name,
        tags: parseJsonArray(row.tags),
        equipState,
        equippedSlot: typeof row.equippedSlot === "string" ? row.equippedSlot : null,
        isSignature: row.isSignature === true || row.isSignature === 1,
      }];
    });
  } catch {
    return [];
  }
}

function parseWorldSceneAwarenessBand(value: unknown): WorldSceneAwarenessBand {
  return value === "clear" || value === "hint" ? value : "none";
}

function parseWorldCurrentScene(value: unknown): WorldCurrentScene | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const scene = value as Record<string, unknown>;
  const awareness = typeof scene.awareness === "object" && scene.awareness !== null
    ? scene.awareness as Record<string, unknown>
    : {};
  const rawByNpcId = typeof awareness.byNpcId === "object" && awareness.byNpcId !== null
    ? awareness.byNpcId as Record<string, unknown>
    : {};

  return {
    id: typeof scene.id === "string" ? scene.id : null,
    name: typeof scene.name === "string" ? scene.name : null,
    broadLocationId: typeof scene.broadLocationId === "string" ? scene.broadLocationId : null,
    broadLocationName: typeof scene.broadLocationName === "string" ? scene.broadLocationName : null,
    sceneNpcIds: parseJsonArray(scene.sceneNpcIds),
    clearNpcIds: parseJsonArray(scene.clearNpcIds),
    awareness: {
      byNpcId: Object.fromEntries(
        Object.entries(rawByNpcId)
          .filter(([npcId]) => npcId.length > 0)
          .map(([npcId, band]) => [npcId, parseWorldSceneAwarenessBand(band)]),
      ),
      hintSignals: parseJsonArray(awareness.hintSignals),
    },
  };
}

function normalizeCharacterResult(
  raw: CharacterResult | ({
    role: "player";
    draft?: CharacterDraft;
    character?: ParsedCharacter;
    characterRecord?: CharacterRecord | null;
  } | {
    role: "key";
    draft?: CharacterDraft;
    npc?: ScaffoldNpc;
    characterRecord?: CharacterRecord | null;
  }),
): CharacterResult {
  if (raw.role === "player") {
    const draft = raw.draft
      ?? (raw.characterRecord ? characterRecordToDraft(raw.characterRecord) : null)
      ?? raw.character?.draft
      ?? parsedCharacterToDraft(raw.character as ParsedCharacter);
    return {
      role: "player",
      characterRecord: raw.characterRecord ?? null,
      draft,
      character: raw.character ?? characterDraftToParsedCharacter(draft),
    };
  }

  const draft = raw.draft
    ?? (raw.characterRecord ? characterRecordToDraft(raw.characterRecord) : null)
    ?? raw.npc?.draft
    ?? scaffoldNpcToDraft(raw.npc as ScaffoldNpc);
  return {
    role: "key",
    characterRecord: raw.characterRecord ?? null,
    draft,
    npc: raw.npc ?? characterDraftToScaffoldNpc(draft),
  };
}

function parseWorldData(raw: RawWorldData): WorldData {
  return {
    currentScene: parseWorldCurrentScene(raw.currentScene),
    locations: raw.locations.map((loc) => {
      const connectedPaths = parseWorldLocationConnectedPaths(loc.connectedPaths);
      const connectedTo = connectedPaths.length > 0
        ? connectedPaths.map((path) => path.toLocationId)
        : parseJsonArray(loc.connectedTo);

      return {
        id: loc.id,
        campaignId: loc.campaignId,
        name: loc.name,
        description: loc.description,
        tags: parseJsonArray(loc.tags),
        connectedTo,
        connectedPaths,
        recentHappenings: parseWorldLocationRecentHappenings(loc.recentHappenings),
        isStarting: loc.isStarting,
        locationKind: parseLocationKind(loc.locationKind ?? loc.kind),
        parentLocationId: typeof loc.parentLocationId === "string" ? loc.parentLocationId : null,
        anchorLocationId: typeof loc.anchorLocationId === "string" ? loc.anchorLocationId : null,
        persistence: parseLocationPersistence(loc.persistence),
        expiresAtTick: parseNullableNumber(loc.expiresAtTick),
        archivedAtTick: parseNullableNumber(loc.archivedAtTick),
      };
    }),
    npcs: raw.npcs.map((npc) => ({
      ...npc,
      tags: parseJsonArray(npc.tags),
      goals: parseNpcGoals(npc.goals),
      beliefs: parseJsonArray(npc.beliefs),
      sceneScopeId: typeof npc.sceneScopeId === "string" ? npc.sceneScopeId : npc.currentLocationId,
      characterRecord: npc.characterRecord ?? null,
      draft: npc.draft ?? (npc.characterRecord ? characterRecordToDraft(npc.characterRecord) : npc.npc?.draft ?? null),
      npc: npc.npc ?? (npc.draft ? characterDraftToScaffoldNpc(npc.draft) : npc.characterRecord ? characterDraftToScaffoldNpc(characterRecordToDraft(npc.characterRecord)) : null),
    })),
    factions: raw.factions.map((fac) => ({
      ...fac,
      tags: parseJsonArray(fac.tags),
      goals: parseJsonArray(fac.goals),
      assets: parseJsonArray(fac.assets),
    })),
    items: raw.items.map((item) => ({
      ...item,
      tags: parseJsonArray(item.tags),
    })),
    relationships: raw.relationships.map((rel) => ({
      ...rel,
      tags: parseJsonArray(rel.tags),
    })),
    player: raw.player
      ? {
          ...raw.player,
          tags: parseJsonArray(raw.player.tags),
          equippedItems: parseJsonArray(raw.player.equippedItems),
          inventory: parseWorldPlayerInventoryItems(raw.player.inventory),
          equipment: parseWorldPlayerInventoryItems(raw.player.equipment),
          sceneScopeId: typeof raw.player.sceneScopeId === "string"
            ? raw.player.sceneScopeId
            : raw.player.currentLocationId,
          characterRecord: raw.player.characterRecord ?? null,
          draft: raw.player.draft ?? (raw.player.characterRecord ? characterRecordToDraft(raw.player.characterRecord) : raw.player.character?.draft ?? null),
          character: raw.player.character ?? (raw.player.draft ? characterDraftToParsedCharacter(raw.player.draft) : raw.player.characterRecord ? characterDraftToParsedCharacter(characterRecordToDraft(raw.player.characterRecord)) : null),
        }
      : null,
    personaTemplates: raw.personaTemplates ?? [],
  };
}

// ───── HTTP primitives ─────

export async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { error?: string };
    if (payload.error) {
      return payload.error;
    }
  } catch {
    // Fall back to status text.
  }
  return response.statusText || "Request failed";
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return (await res.json()) as T;
}

export async function apiStreamPost(
  path: string,
  body: unknown
): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return res;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return (await res.json()) as T;
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return (await res.json()) as T;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }
  return (await res.json()) as T;
}

function campaignStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function rememberCampaignId(campaignId: string | null | undefined): void {
  if (!campaignId) return;
  try {
    campaignStorage()?.setItem(LAST_ACTIVE_CAMPAIGN_KEY, campaignId);
  } catch {
    // Non-fatal in private mode or restricted environments.
  }
}

export function getRememberedCampaignId(): string | null {
  try {
    return campaignStorage()?.getItem(LAST_ACTIVE_CAMPAIGN_KEY) ?? null;
  } catch {
    return null;
  }
}

// ───── Settings ─────

export function fetchSettings(): Promise<Settings> {
  return apiGet<Settings>("/api/settings");
}

export function updateSettings(settings: Settings): Promise<Settings> {
  return apiPost<Settings>("/api/settings", settings);
}

// ───── Provider Testing ─────

export function testConnection(
  req: TestConnectionRequest
): Promise<TestConnectionResult> {
  return apiPost<TestConnectionResult>("/api/providers/test", req);
}

export function testRole(
  role: "judge" | "storyteller" | "generator",
  settings: Settings
): Promise<TestRoleResult> {
  return apiPost<TestRoleResult>("/api/ai/test-role", {
    role,
    providers: settings.providers,
    roles: {
      judge: settings.judge,
      storyteller: settings.storyteller,
      generator: settings.generator,
    },
  });
}

// ───── World DNA Seeds ─────

export function rollWorldSeeds(): Promise<WorldSeeds> {
  return apiPost<WorldSeeds>("/api/worldgen/roll-seeds");
}

export function rollWorldSeed(
  category: SeedCategory
): Promise<RollSeedResult> {
  return apiPost<RollSeedResult>("/api/worldgen/roll-seed", { category });
}

export function suggestSeeds(
  premise: string,
  opts?: {
    name?: string;
    franchise?: string;
    research?: boolean;
    selectedWorldbooks?: CampaignWorldbookSelection[];
    worldbookEntries?: ClassifiedWorldBookEntry[];
  }
): Promise<WorldSeeds & { _ipContext?: IpContext | null; _premiseDivergence?: PremiseDivergence | null }> {
  return apiPost<WorldSeeds & { _ipContext?: IpContext | null; _premiseDivergence?: PremiseDivergence | null }>("/api/worldgen/suggest-seeds", {
    premise,
    name: opts?.name,
    franchise: opts?.franchise,
    research: opts?.research,
    selectedWorldbooks: opts?.selectedWorldbooks,
    worldbookEntries: opts?.worldbookEntries,
  });
}

/** @deprecated Use IpResearchContext from @/lib/types */
export type IpContext = IpResearchContext;
export type PremiseDivergenceContext = PremiseDivergence;
export type WorldbookSelection = CampaignWorldbookSelection;

export function suggestSeed(
  premise: string,
  category: SeedCategory,
  ipContext?: IpContext | null,
  premiseDivergence?: PremiseDivergence | null,
): Promise<RollSeedResult> {
  return apiPost<RollSeedResult>("/api/worldgen/suggest-seed", {
    premise,
    category,
    ipContext: ipContext ?? null,
    premiseDivergence: premiseDivergence ?? null,
  });
}

// ───── Turn SSE Parser ─────

export interface TurnSSEHandlers {
  onSceneSettling?: (status: {
    stage?: string;
    phase?: string;
    opening?: boolean;
  }) => void;
  onLookupResult?: (result: LookupResultEvent) => void;
  onNarrative: (text: string) => void;
  onOracleResult: (result: { chance: number; roll: number; outcome: string; reasoning: string }) => void;
  onStateUpdate: (update: { tool: string; args: unknown; result: unknown }) => void;
  onQuickActions: (actions: Array<{ label: string; action: string }>) => void;
  onFinalizing?: () => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function parseTurnSSE(body: ReadableStream<Uint8Array>, handlers: TurnSSEHandlers): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let currentData = "";

  const dispatchCurrentEvent = () => {
    if (!currentEvent || !currentData) {
      currentEvent = "";
      currentData = "";
      return;
    }

    try {
      const parsed = JSON.parse(currentData);
      switch (currentEvent) {
        case "scene-settling": handlers.onSceneSettling?.(parsed); break;
        case "lookup_result": handlers.onLookupResult?.(parsed); break;
        case "narrative": handlers.onNarrative(parsed.text); break;
        case "oracle_result": handlers.onOracleResult(parsed); break;
        case "state_update": handlers.onStateUpdate(parsed); break;
        case "quick_actions": handlers.onQuickActions(parsed.actions ?? parsed.result?.actions ?? []); break;
        case "finalizing_turn": handlers.onFinalizing?.(); break;
        case "done": handlers.onDone(); break;
        case "error": handlers.onError(parsed.error ?? "Unknown error"); break;
      }
    } catch {
      // Skip malformed events.
    }

    currentEvent = "";
    currentData = "";
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        currentData += line.slice(5).trim();
      } else if (line === "") {
        dispatchCurrentEvent();
      }
    }
  }

  if (buffer.length > 0) {
    for (const line of buffer.split("\n")) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        currentData += line.slice(5).trim();
      }
    }
  }

  dispatchCurrentEvent();
}

// ───── SSE Stream Parser ─────

interface SSEHandlers<T> {
  onProgress?: (data: Record<string, unknown>) => void;
  onComplete: (data: Record<string, unknown>) => T;
  onError?: (data: Record<string, unknown>) => never;
  label: string;
}

export interface WorldgenDebugOperation {
  id: string;
  kind: "suggest-seeds" | "generate-world";
  status: "running" | "completed" | "failed";
  label: string;
  startedAt: number;
  updatedAt: number;
  elapsedMs: number;
  heartbeatCount: number;
  campaignId?: string;
  franchise?: string;
  premisePreview?: string;
  error?: string;
}

export interface WorldgenDebugProgress {
  active: WorldgenDebugOperation[];
  recent: WorldgenDebugOperation[];
}

async function parseSSEStream<T>(body: ReadableStream<Uint8Array>, handlers: SSEHandlers<T>): Promise<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let currentData = "";

  for (; ;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      const normalizedLine = line.replace(/\r$/, "");
      if (normalizedLine.startsWith("event:")) {
        currentEvent = normalizedLine.slice(6).trim();
      } else if (normalizedLine.startsWith("data:")) {
        currentData += normalizedLine.slice(5).trim();
      } else if (normalizedLine === "") {
        if (currentEvent && currentData) {
          let parsed: Record<string, unknown>;
          try {
            parsed = JSON.parse(currentData) as Record<string, unknown>;
          } catch {
            throw new Error(`${handlers.label}: invalid SSE data for event '${currentEvent}'`);
          }

          if (currentEvent === "progress") {
            handlers.onProgress?.(parsed);
          } else if (currentEvent === "complete") {
            return handlers.onComplete(parsed);
          } else if (currentEvent === "error") {
            if (handlers.onError) handlers.onError(parsed);
            const msg = typeof parsed.error === "string" ? parsed.error : `${handlers.label} failed.`;
            throw new Error(msg);
          }
        }
        currentEvent = "";
        currentData = "";
      }
    }
  }

  throw new Error(`${handlers.label} stream ended without completion.`);
}

// ───── World Generation ─────

export async function generateWorld(
  campaignId: string,
  onProgress?: (progress: GenerationProgress) => void,
  ipContext?: IpContext | null,
  premiseDivergence?: PremiseDivergence | null,
): Promise<GenerateWorldResult> {
  const body: Record<string, unknown> = { campaignId };
  if (ipContext) {
    body.ipContext = ipContext;
  }
  if (premiseDivergence) {
    body.premiseDivergence = premiseDivergence;
  }
  const res = await fetch(`${API_BASE}/api/worldgen/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }

  const contentType = res.headers.get("content-type") ?? "";

  // Fallback: non-SSE response (e.g. validation error returned as JSON)
  if (!contentType.includes("text/event-stream")) {
    return (await res.json()) as GenerateWorldResult;
  }

  return parseSSEStream<GenerateWorldResult>(res.body!, {
    label: "World generation",
    onProgress: onProgress
      ? (data) => onProgress(data as unknown as GenerationProgress)
      : undefined,
    onComplete: (data) => data as unknown as GenerateWorldResult,
  });
}

export function getWorldgenDebugProgress(): Promise<WorldgenDebugProgress> {
  return apiGet<WorldgenDebugProgress>("/api/worldgen/debug/progress");
}

export async function getWorldData(campaignId: string): Promise<WorldData> {
  const raw = await apiGet<RawWorldData>(`/api/campaigns/${campaignId}/world`);
  return parseWorldData(raw);
}

// ───── Lore Cards ─────

export async function getLoreCards(
  campaignId: string
): Promise<LoreCardItem[]> {
  const result = await apiGet<{ cards: LoreCardItem[] }>(
    `/api/campaigns/${campaignId}/lore`
  );
  return result.cards;
}

export async function searchLore(
  campaignId: string,
  query: string,
  limit = 5
): Promise<LoreCardItem[]> {
  const result = await apiGet<{ cards: LoreCardItem[] }>(
    `/api/campaigns/${campaignId}/lore/search?q=${encodeURIComponent(query)}&limit=${limit}`
  );
  return result.cards;
}

export async function deleteLore(
  campaignId: string
): Promise<void> {
  await apiDelete(`/api/campaigns/${campaignId}/lore`);
}

export async function updateLoreCard(
  campaignId: string,
  cardId: string,
  payload: LoreCardUpdateInput,
): Promise<LoreCardItem> {
  const result = await apiPut<{ card: LoreCardItem }>(
    `/api/campaigns/${campaignId}/lore/${cardId}`,
    payload,
  );
  return result.card;
}

export async function deleteLoreCardById(
  campaignId: string,
  cardId: string,
): Promise<void> {
  await apiDelete(`/api/campaigns/${campaignId}/lore/${cardId}`);
}

// ───── Campaign Meta ─────

export type { CampaignMeta };

export async function getActiveCampaign(): Promise<CampaignMeta | null> {
  const res = await apiGet<{ campaign: CampaignMeta | null }>("/api/campaigns/active");
  if (res.campaign) {
    rememberCampaignId(res.campaign.id);
  }
  return res.campaign;
}

export async function loadCampaign(campaignId: string): Promise<CampaignMeta> {
  const campaign = await apiPost<CampaignMeta>(`/api/campaigns/${campaignId}/load`);
  rememberCampaignId(campaign.id);
  return campaign;
}

// ───── World Review ─────

export function regenerateSection<T>(body: RegenerateSectionRequest): Promise<T> {
  return apiPost<T>("/api/worldgen/regenerate-section", body);
}

export function saveWorldEdits(campaignId: string, scaffold: EditableScaffold): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>("/api/worldgen/save-edits", { campaignId, scaffold });
}

// ───── Character Creation ─────

export function saveCharacter(
  campaignId: string,
  character: ParsedCharacter | CharacterDraft
): Promise<{ ok: boolean; playerId: string }> {
  return apiPost<{ ok: boolean; playerId: string }>(
    "/api/worldgen/save-character",
    { campaignId, draft: "identity" in character ? character : parsedCharacterToDraft(character) }
  );
}

export function parseCharacter(
  campaignId: string,
  concept: string,
  role: "player" | "key" = "player",
  locationNames?: string[],
  factionNames?: string[],
): Promise<CharacterResult> {
  return apiPost<CharacterResult>("/api/worldgen/parse-character", {
    campaignId, concept, role, locationNames, factionNames,
  }).then(normalizeCharacterResult);
}

export function generateCharacter(
  campaignId: string,
  role: "player" | "key" = "player",
  locationNames?: string[],
  factionNames?: string[],
): Promise<CharacterResult> {
  return apiPost<CharacterResult>("/api/worldgen/generate-character", {
    campaignId, role, locationNames, factionNames,
  }).then(normalizeCharacterResult);
}

export function researchCharacter(
  campaignId: string,
  archetype: string,
  role: "player" | "key" = "player",
  locationNames?: string[],
  factionNames?: string[],
): Promise<CharacterResult> {
  return apiPost<CharacterResult>("/api/worldgen/research-character", {
    campaignId, archetype, role, locationNames, factionNames,
  }).then(normalizeCharacterResult);
}

export function importV2Card(
  campaignId: string,
  card: { name: string; description: string; personality: string; scenario: string; tags: string[] },
  options?: {
    role?: "player" | "key";
    importMode?: CharacterImportMode;
    locationNames?: string[];
    factionNames?: string[];
  },
): Promise<CharacterResult> {
  const role = options?.role ?? "player";
  return apiPost<CharacterResult>("/api/worldgen/import-v2-card", {
    campaignId,
    ...card,
    role,
    importMode: options?.importMode ?? "native",
    locationNames: options?.locationNames,
    factionNames: options?.factionNames,
  }).then(normalizeCharacterResult);
}

export function resolveStartingLocation(
  campaignId: string,
  prompt?: string,
): Promise<ResolveStartConditionsResult> {
  return apiPost("/api/worldgen/resolve-starting-location", { campaignId, prompt });
}

export function previewCanonicalLoadout(
  campaignId: string,
  draft: CharacterDraft,
): Promise<LoadoutPreviewResult> {
  return apiPost("/api/worldgen/preview-loadout", { campaignId, draft });
}

export function listPersonaTemplates(
  campaignId: string,
): Promise<PersonaTemplateListResult> {
  return apiGet(`/api/campaigns/${campaignId}/persona-templates`);
}

export function createPersonaTemplate(
  campaignId: string,
  payload: Omit<PersonaTemplateRecord, "id" | "campaignId" | "createdAt" | "updatedAt">,
): Promise<{ template: PersonaTemplateRecord }> {
  return apiPost(`/api/campaigns/${campaignId}/persona-templates`, {
    campaignId,
    ...payload,
  });
}

export function updatePersonaTemplate(
  campaignId: string,
  templateId: string,
  patch: Partial<Pick<PersonaTemplateRecord, "name" | "description" | "roleScope" | "tags" | "patch">>,
): Promise<{ template: PersonaTemplateRecord }> {
  return apiPut(`/api/campaigns/${campaignId}/persona-templates/${templateId}`, {
    campaignId,
    templateId,
    patch,
  });
}

export function deletePersonaTemplate(
  campaignId: string,
  templateId: string,
): Promise<{ ok: boolean }> {
  return apiDelete(`/api/campaigns/${campaignId}/persona-templates/${templateId}`);
}

export function applyPersonaTemplate(
  campaignId: string,
  templateId: string,
  draft: CharacterDraft,
): Promise<ApplyPersonaTemplateResult> {
  return apiPost<ApplyPersonaTemplateResult>(
    `/api/campaigns/${campaignId}/persona-templates/${templateId}/apply`,
    {
      campaignId,
      templateId,
      draft,
    },
  );
}

// ───── Image URLs ─────

export function getImageUrl(
  campaignId: string,
  type: "portraits" | "locations" | "scenes",
  filename: string,
): string {
  return `${API_BASE}/api/images/${campaignId}/${type}/${filename}`;
}

// ───── Chat Controls (Retry / Undo / Edit) ─────

export function chatHistory(campaignId: string): Promise<ChatHistoryResponse> {
  return apiGet<ChatHistoryResponse>(
    `/api/chat/history?campaignId=${encodeURIComponent(campaignId)}`,
  );
}

export function chatAction(
  campaignId: string,
  playerAction: string,
  intent: string,
  method: string,
): Promise<Response> {
  return apiStreamPost("/api/chat/action", {
    campaignId,
    playerAction,
    intent,
    method,
  });
}

export function chatLookup(
  campaignId: string,
  request: ChatLookupRequest,
): Promise<Response> {
  return apiStreamPost("/api/chat/lookup", {
    campaignId,
    ...request,
  });
}

export function chatOpening(campaignId: string): Promise<Response> {
  return apiStreamPost("/api/chat/opening", { campaignId });
}

export function chatRetry(campaignId: string): Promise<Response> {
  return apiStreamPost("/api/chat/retry", { campaignId });
}

export function chatUndo(campaignId: string): Promise<{ success: boolean; messagesRemoved: number }> {
  return apiPost<{ success: boolean; messagesRemoved: number }>("/api/chat/undo", {
    campaignId,
  });
}

export function chatEdit(
  campaignId: string,
  messageIndex: number,
  newContent: string,
): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>("/api/chat/edit", {
    campaignId,
    messageIndex,
    newContent,
  });
}

// ───── Checkpoints ─────

export function fetchCheckpoints(campaignId: string): Promise<CheckpointMeta[]> {
  return apiGet<CheckpointMeta[]>(`/api/campaigns/${campaignId}/checkpoints`);
}

export function createCheckpointApi(
  campaignId: string,
  name?: string,
  description?: string,
): Promise<CheckpointMeta> {
  return apiPost<CheckpointMeta>(`/api/campaigns/${campaignId}/checkpoints`, {
    name,
    description,
  });
}

export function loadCheckpointApi(
  campaignId: string,
  checkpointId: string,
): Promise<CheckpointMeta> {
  return apiPost<CheckpointMeta>(
    `/api/campaigns/${campaignId}/checkpoints/${checkpointId}/load`,
  );
}

export function deleteCheckpointApi(
  campaignId: string,
  checkpointId: string,
): Promise<void> {
  return apiDelete(`/api/campaigns/${campaignId}/checkpoints/${checkpointId}`);
}

// ───── WorldBook Import ─────

export function parseWorldBook(
  campaignId: string,
  worldbook: object,
): Promise<{ entries: ClassifiedWorldBookEntry[] }> {
  return apiPost<{ entries: ClassifiedWorldBookEntry[] }>(
    "/api/worldgen/parse-worldbook",
    { campaignId, worldbook },
  );
}

/** Classify worldbook entries without requiring an active campaign (pre-creation). */
export function classifyWorldBook(
  worldbook: object,
): Promise<{ entries: ClassifiedWorldBookEntry[] }> {
  return apiPost<{ entries: ClassifiedWorldBookEntry[] }>(
    "/api/worldgen/parse-worldbook",
    { worldbook },
  );
}

/** Convert classified worldbook entries to IpResearchContext (client-side, no LLM needed) */
export function worldbookToIpContext(
  entries: ClassifiedWorldBookEntry[],
  name: string,
): IpResearchContext {
  return {
    franchise: name,
    keyFacts: entries.map((e) => `${e.name}: ${e.summary}`),
    tonalNotes: entries
      .filter((e) => e.type === "lore_general")
      .slice(0, 10)
      .map((e) => e.summary),
    canonicalNames: {
      locations: entries.filter((e) => e.type === "location").map((e) => e.name),
      factions: entries.filter((e) => e.type === "faction").map((e) => e.name),
      characters: entries.filter((e) => e.type === "character").map((e) => e.name),
    },
    source: "llm",
  };
}

export function listWorldbookLibrary(): Promise<{ items: WorldbookLibraryItem[] }> {
  return apiGet<{ items: WorldbookLibraryItem[] }>("/api/worldgen/worldbook-library");
}

export function importWorldbookLibrary(
  displayName: string,
  worldbook: object,
  originalFileName?: string,
): Promise<{ item: WorldbookLibraryItem; existed: boolean }> {
  return apiPost<{ item: WorldbookLibraryItem; existed: boolean }>(
    "/api/worldgen/worldbook-library/import",
    {
      displayName,
      originalFileName,
      worldbook,
    },
  );
}

export function importWorldBook(
  campaignId: string,
  entries: ClassifiedWorldBookEntry[],
): Promise<WorldBookImportResult> {
  return apiPost<WorldBookImportResult>(
    "/api/worldgen/import-worldbook",
    { campaignId, entries },
  );
}
