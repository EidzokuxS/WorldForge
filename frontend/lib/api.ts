import type {
  CampaignMeta,
  IpResearchContext,
  PremiseDivergence,
  SeedCategory,
  Settings,
  WorldSeeds,
} from "@/lib/types";
import type {
  TestConnectionRequest,
  TestConnectionResult,
  TestRoleResult,
  RollSeedResult,
  GenerateWorldResult,
  GenerationProgress,
  WorldData,
  LoreCardItem,
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
  WorldBookImportResult,
} from "./api-types";

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
  WorldBookImportResult,
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";
const LAST_ACTIVE_CAMPAIGN_KEY = "worldforge:lastActiveCampaignId";

// ───── Raw types (internal) ─────

interface RawWorldData {
  locations: Array<{
    id: string;
    campaignId: string;
    name: string;
    description: string;
    tags: string;
    connectedTo: string;
    isStarting: boolean;
  }>;
  npcs: Array<{
    id: string;
    campaignId: string;
    name: string;
    persona: string;
    tags: string;
    tier: string;
    currentLocationId: string | null;
    goals: string;
    beliefs: string;
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
    currentLocationId: string | null;
  } | null;
}

// ───── Helpers ─────

function parseJsonArray(value: string): string[] {
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

function parseNpcGoals(value: string): { short_term: string[]; long_term: string[] } {
  try {
    const parsed = JSON.parse(value) as unknown;
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

function parseWorldData(raw: RawWorldData): WorldData {
  return {
    locations: raw.locations.map((loc) => ({
      ...loc,
      tags: parseJsonArray(loc.tags),
      connectedTo: parseJsonArray(loc.connectedTo),
    })),
    npcs: raw.npcs.map((npc) => ({
      ...npc,
      tags: parseJsonArray(npc.tags),
      goals: parseNpcGoals(npc.goals),
      beliefs: parseJsonArray(npc.beliefs),
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
        }
      : null,
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
    worldbookEntries?: ClassifiedWorldBookEntry[];
  }
): Promise<WorldSeeds & { _ipContext?: IpContext | null; _premiseDivergence?: PremiseDivergence | null }> {
  return apiPost<WorldSeeds & { _ipContext?: IpContext | null; _premiseDivergence?: PremiseDivergence | null }>("/api/worldgen/suggest-seeds", {
    premise,
    name: opts?.name,
    franchise: opts?.franchise,
    research: opts?.research,
    worldbookEntries: opts?.worldbookEntries,
  });
}

/** @deprecated Use IpResearchContext from @/lib/types */
export type IpContext = IpResearchContext;
export type PremiseDivergenceContext = PremiseDivergence;

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
  onNarrative: (text: string) => void;
  onOracleResult: (result: { chance: number; roll: number; outcome: string; reasoning: string }) => void;
  onStateUpdate: (update: { tool: string; args: unknown; result: unknown }) => void;
  onQuickActions: (actions: Array<{ label: string; action: string }>) => void;
  onDone: () => void;
  onError: (error: string) => void;
}

export async function parseTurnSSE(body: ReadableStream<Uint8Array>, handlers: TurnSSEHandlers): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let currentData = "";

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
        if (currentEvent && currentData) {
          try {
            const parsed = JSON.parse(currentData);
            switch (currentEvent) {
              case "narrative": handlers.onNarrative(parsed.text); break;
              case "oracle_result": handlers.onOracleResult(parsed); break;
              case "state_update": handlers.onStateUpdate(parsed); break;
              case "quick_actions": handlers.onQuickActions(parsed.actions ?? parsed.result?.actions ?? []); break;
              case "done": handlers.onDone(); break;
              case "error": handlers.onError(parsed.error ?? "Unknown error"); break;
            }
          } catch { /* skip malformed events */ }
        }
        currentEvent = "";
        currentData = "";
      }
    }
  }
}

// ───── SSE Stream Parser ─────

interface SSEHandlers<T> {
  onProgress?: (data: Record<string, unknown>) => void;
  onComplete: (data: Record<string, unknown>) => T;
  onError?: (data: Record<string, unknown>) => never;
  label: string;
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
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        currentData = line.slice(5).trim();
      } else if (line === "") {
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
  character: ParsedCharacter
): Promise<{ ok: boolean; playerId: string }> {
  return apiPost<{ ok: boolean; playerId: string }>(
    "/api/worldgen/save-character",
    { campaignId, character }
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
  });
}

export function generateCharacter(
  campaignId: string,
  role: "player" | "key" = "player",
  locationNames?: string[],
  factionNames?: string[],
): Promise<CharacterResult> {
  return apiPost<CharacterResult>("/api/worldgen/generate-character", {
    campaignId, role, locationNames, factionNames,
  });
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
  });
}

export function importV2Card(
  campaignId: string,
  card: { name: string; description: string; personality: string; scenario: string; tags: string[] },
  role: "player" | "key" = "player",
  locationNames?: string[],
  factionNames?: string[],
): Promise<CharacterResult> {
  return apiPost<CharacterResult>("/api/worldgen/import-v2-card", {
    campaignId, ...card, role, locationNames, factionNames,
  });
}

export function resolveStartingLocation(
  campaignId: string,
  prompt?: string,
): Promise<{ locationId: string; locationName: string; narrative: string | null }> {
  return apiPost("/api/worldgen/resolve-starting-location", { campaignId, prompt });
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

export function chatRetry(): Promise<Response> {
  return apiStreamPost("/api/chat/retry", {});
}

export function chatUndo(): Promise<{ success: boolean; messagesRemoved: number }> {
  return apiPost<{ success: boolean; messagesRemoved: number }>("/api/chat/undo", {});
}

export function chatEdit(
  messageIndex: number,
  newContent: string,
): Promise<{ success: boolean }> {
  return apiPost<{ success: boolean }>("/api/chat/edit", { messageIndex, newContent });
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

export function importWorldBook(
  campaignId: string,
  entries: ClassifiedWorldBookEntry[],
): Promise<WorldBookImportResult> {
  return apiPost<WorldBookImportResult>(
    "/api/worldgen/import-worldbook",
    { campaignId, entries },
  );
}
