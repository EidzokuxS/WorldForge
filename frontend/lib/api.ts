import type { SeedCategory, Settings, WorldSeeds } from "@/lib/types";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:3001";

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
    goals: Record<string, string>;
    beliefs: Record<string, string>;
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
}

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

function parseJsonObject(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
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
      goals: parseJsonObject(npc.goals),
      beliefs: parseJsonObject(npc.beliefs),
    })),
    factions: raw.factions.map((fac) => ({
      ...fac,
      tags: parseJsonArray(fac.tags),
      goals: parseJsonArray(fac.goals),
      assets: parseJsonArray(fac.assets),
    })),
    relationships: raw.relationships.map((rel) => ({
      ...rel,
      tags: parseJsonArray(rel.tags),
    })),
  };
}

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

export function fetchSettings(): Promise<Settings> {
  return apiGet<Settings>("/api/settings");
}

export function updateSettings(settings: Settings): Promise<Settings> {
  return apiPost<Settings>("/api/settings", settings);
}

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

export function rollWorldSeeds(): Promise<WorldSeeds> {
  return apiPost<WorldSeeds>("/api/worldgen/roll-seeds");
}

export function rollWorldSeed(
  category: SeedCategory
): Promise<RollSeedResult> {
  return apiPost<RollSeedResult>("/api/worldgen/roll-seed", { category });
}

export function suggestSeeds(premise: string): Promise<WorldSeeds> {
  return apiPost<WorldSeeds>("/api/worldgen/suggest-seeds", { premise });
}

export function suggestSeed(
  premise: string,
  category: SeedCategory
): Promise<RollSeedResult> {
  return apiPost<RollSeedResult>("/api/worldgen/suggest-seed", {
    premise,
    category,
  });
}

export async function generateWorld(
  campaignId: string,
  onProgress?: (progress: GenerationProgress) => void
): Promise<GenerateWorldResult> {
  const res = await fetch(`${API_BASE}/api/worldgen/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignId }),
  });

  if (!res.ok) {
    throw new Error(await readErrorMessage(res));
  }

  const contentType = res.headers.get("content-type") ?? "";

  // Fallback: non-SSE response (e.g. validation error returned as JSON)
  if (!contentType.includes("text/event-stream")) {
    return (await res.json()) as GenerateWorldResult;
  }

  // SSE parsing
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let currentData = "";

  for (; ;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!; // keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        currentData = line.slice(5).trim();
      } else if (line === "") {
        // Empty line = end of SSE message
        if (currentEvent && currentData) {
          const parsed = JSON.parse(currentData) as Record<string, unknown>;

          if (currentEvent === "progress") {
            onProgress?.(parsed as unknown as GenerationProgress);
          } else if (currentEvent === "complete") {
            return parsed as unknown as GenerateWorldResult;
          } else if (currentEvent === "error") {
            const msg =
              typeof parsed.error === "string"
                ? parsed.error
                : "World generation failed.";
            throw new Error(msg);
          }
        }
        currentEvent = "";
        currentData = "";
      }
    }
  }

  // Stream ended without "complete" event
  throw new Error("World generation stream ended without completion.");
}

export async function getWorldData(campaignId: string): Promise<WorldData> {
  const raw = await apiGet<RawWorldData>(`/api/campaigns/${campaignId}/world`);
  return parseWorldData(raw);
}

// ───── Lore Cards ─────

export interface LoreCardItem {
  id: string;
  term: string;
  definition: string;
  category: string;
}

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

export interface CampaignMeta {
  id: string;
  name: string;
  premise: string;
  createdAt: number;
  updatedAt: number;
}

export function getActiveCampaign(): Promise<CampaignMeta> {
  return apiGet<CampaignMeta>("/api/campaigns/active");
}

// ───── World Review ─────

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
  | { section: "premise"; additionalInstruction?: string }
  | { section: "locations"; refinedPremise: string; additionalInstruction?: string }
  | { section: "factions"; refinedPremise: string; locationNames: string[]; additionalInstruction?: string }
  | { section: "npcs"; refinedPremise: string; locationNames: string[]; factionNames: string[]; additionalInstruction?: string };

export function regenerateSection<T>(body: RegenerateSectionRequest): Promise<T> {
  return apiPost<T>("/api/worldgen/regenerate-section", body);
}

export function saveWorldEdits(campaignId: string, scaffold: EditableScaffold): Promise<{ ok: boolean }> {
  return apiPost<{ ok: boolean }>("/api/worldgen/save-edits", { campaignId, scaffold });
}

// ───── Character Creation ─────

export interface ParsedCharacter {
  name: string;
  tags: string[];
  hp: number;
  equippedItems: string[];
  locationName: string;
}

export function parseCharacter(
  campaignId: string,
  description: string
): Promise<ParsedCharacter> {
  return apiPost<ParsedCharacter>("/api/worldgen/parse-character", {
    campaignId,
    description,
  });
}

export function generateCharacter(
  campaignId: string
): Promise<ParsedCharacter> {
  return apiPost<ParsedCharacter>("/api/worldgen/generate-character", {
    campaignId,
  });
}

export function saveCharacter(
  campaignId: string,
  character: ParsedCharacter
): Promise<{ ok: boolean; playerId: string }> {
  return apiPost<{ ok: boolean; playerId: string }>(
    "/api/worldgen/save-character",
    { campaignId, character }
  );
}
