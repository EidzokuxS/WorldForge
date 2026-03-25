import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("../../worldgen/index.js", () => ({
  rollWorldSeeds: vi.fn(),
  rollSeed: vi.fn(),
  suggestWorldSeeds: vi.fn(),
  suggestSingleSeed: vi.fn(),
  generateWorldScaffold: vi.fn(),
  generateRefinedPremiseStep: vi.fn(),
  generateLocationsStep: vi.fn(),
  generateFactionsStep: vi.fn(),
  generateNpcsStep: vi.fn(),
  saveScaffoldToDb: vi.fn(),
  extractLoreCards: vi.fn(),
}));

vi.mock("../../worldgen/worldbook-importer.js", () => ({
  WORLDBOOK_ENTRY_TYPES: ["npc", "location", "faction", "lore_general", "bestiary"],
  parseWorldBook: vi.fn(),
  classifyEntries: vi.fn(),
  importClassifiedEntries: vi.fn(),
}));

vi.mock("../../campaign/index.js", () => ({
  markGenerationComplete: vi.fn(),
  saveIpContext: vi.fn(),
  loadIpContext: vi.fn(() => null),
  getActiveCampaign: vi.fn(),
}));

vi.mock("../../vectors/lore-cards.js", () => ({
  deleteCampaignLore: vi.fn(),
  storeLoreCards: vi.fn(),
}));

vi.mock("../../settings/index.js", () => ({
  loadSettings: vi.fn(),
}));

vi.mock("../../ai/index.js", () => ({
  resolveRoleModel: vi.fn(),
  createModel: vi.fn(),
}));

vi.mock("../../ai/with-model-fallback.js", () => ({
  resolveFallbackProvider: vi.fn(),
}));

vi.mock("../../lib/index.js", () => ({
  getErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
  getErrorStatus: vi.fn(() => 500),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

// Import mocked modules
import {
  rollWorldSeeds,
  rollSeed,
  suggestWorldSeeds,
  suggestSingleSeed,
  saveScaffoldToDb,
  extractLoreCards,
  generateRefinedPremiseStep,
  generateLocationsStep,
  generateFactionsStep,
  generateNpcsStep,
} from "../../worldgen/index.js";
import {
  parseWorldBook,
  classifyEntries,
  importClassifiedEntries,
} from "../../worldgen/worldbook-importer.js";
import { markGenerationComplete, getActiveCampaign } from "../../campaign/index.js";
import { deleteCampaignLore, storeLoreCards } from "../../vectors/lore-cards.js";
import { loadSettings } from "../../settings/index.js";
import { resolveRoleModel } from "../../ai/index.js";
import { resolveFallbackProvider } from "../../ai/with-model-fallback.js";
import worldgenRoutes from "../worldgen.js";

// Typed mocks
const mockedRollWorldSeeds = vi.mocked(rollWorldSeeds);
const mockedRollSeed = vi.mocked(rollSeed);
const mockedSuggestWorldSeeds = vi.mocked(suggestWorldSeeds);
const mockedSuggestSingleSeed = vi.mocked(suggestSingleSeed);
const mockedSaveScaffoldToDb = vi.mocked(saveScaffoldToDb);
const mockedExtractLoreCards = vi.mocked(extractLoreCards);
const mockedMarkGenComplete = vi.mocked(markGenerationComplete);
const mockedGetActiveCampaign = vi.mocked(getActiveCampaign);
const mockedDeleteLore = vi.mocked(deleteCampaignLore);
const mockedStoreLore = vi.mocked(storeLoreCards);
const mockedLoadSettings = vi.mocked(loadSettings);
const mockedResolveRoleModel = vi.mocked(resolveRoleModel);
const mockedResolveFallback = vi.mocked(resolveFallbackProvider);
const mockedParseWorldBook = vi.mocked(parseWorldBook);
const mockedClassifyEntries = vi.mocked(classifyEntries);
const mockedImportClassifiedEntries = vi.mocked(importClassifiedEntries);
const mockedGenerateRefinedPremise = vi.mocked(generateRefinedPremiseStep);
const mockedGenerateLocations = vi.mocked(generateLocationsStep);
const mockedGenerateFactions = vi.mocked(generateFactionsStep);
const mockedGenerateNpcs = vi.mocked(generateNpcsStep);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = new Hono();
app.route("/api/worldgen", worldgenRoutes);

const CAMPAIGN_ID = "test-campaign-123";

const fakeSettings = {
  providers: [{ id: "p1", name: "Test", baseUrl: "http://localhost:1234", apiKey: "", defaultModel: "m1" }],
  generator: { providerId: "p1", model: "m1", temperature: 0.7, maxTokens: 2048 },
  storyteller: { providerId: "p1", model: "m1", temperature: 0.8, maxTokens: 1024 },
  judge: { providerId: "p1", model: "m1", temperature: 0, maxTokens: 512 },
  embedder: { providerId: "p1", model: "m1", temperature: 0, maxTokens: 512 },
  fallback: { providerId: "", model: "", timeoutMs: 30000, retryCount: 2 },
  images: { providerId: "", model: "", stylePrompt: "", enabled: false },
  research: { enabled: false, maxSearchSteps: 3 },
} as any;

const fakeResolvedRole = {
  provider: { baseUrl: "http://localhost:1234", model: "m1", apiKey: "" },
  temperature: 0.7,
  maxTokens: 2048,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedLoadSettings.mockReturnValue(fakeSettings);
  mockedResolveRoleModel.mockReturnValue(fakeResolvedRole as any);
  mockedResolveFallback.mockReturnValue(null as any);
  mockedGetActiveCampaign.mockReturnValue({
    id: CAMPAIGN_ID,
    name: "Test Campaign",
    premise: "A dark world",
    seeds: { geography: "Mountains" },
    createdAt: "2026-01-01",
  } as any);
});

// ---------------------------------------------------------------------------
// POST /api/worldgen/roll-seeds
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/roll-seeds", () => {
  it("returns rolled seeds object", async () => {
    const seeds = {
      geography: "Islands",
      politicalStructure: "Republic",
      centralConflict: "Invasion",
      culturalFlavor: ["Norse", "Celtic"],
      environment: "Temperate",
      wildcard: "Dragons",
    };
    mockedRollWorldSeeds.mockReturnValue(seeds as any);

    const res = await app.request("/api/worldgen/roll-seeds", { method: "POST" });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(seeds);
    expect(mockedRollWorldSeeds).toHaveBeenCalledOnce();
  });

  it("returns 500 when rollWorldSeeds throws", async () => {
    mockedRollWorldSeeds.mockImplementation(() => {
      throw new Error("rng error");
    });

    const res = await app.request("/api/worldgen/roll-seeds", { method: "POST" });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// POST /api/worldgen/roll-seed
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/roll-seed", () => {
  it("returns single rolled seed for valid category", async () => {
    mockedRollSeed.mockReturnValue("Volcanic Islands" as any);

    const res = await app.request("/api/worldgen/roll-seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "geography" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ category: "geography", value: "Volcanic Islands" });
    expect(mockedRollSeed).toHaveBeenCalledWith("geography");
  });

  it("returns 400 for invalid category", async () => {
    const res = await app.request("/api/worldgen/roll-seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "invalid_cat" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// POST /api/worldgen/suggest-seeds
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/suggest-seeds", () => {
  it("calls suggestWorldSeeds with premise and returns result", async () => {
    const suggested = { geography: "Floating islands", centralConflict: "War" };
    mockedSuggestWorldSeeds.mockResolvedValue({ seeds: suggested, ipContext: null } as any);

    const res = await app.request("/api/worldgen/suggest-seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premise: "A world of floating islands" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.geography).toBe("Floating islands");
    expect(mockedSuggestWorldSeeds).toHaveBeenCalledWith(
      expect.objectContaining({ premise: "A world of floating islands" })
    );
  });

  it("returns 400 for empty premise", async () => {
    const res = await app.request("/api/worldgen/suggest-seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premise: "   " }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// POST /api/worldgen/suggest-seed
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/suggest-seed", () => {
  it("calls suggestSingleSeed and returns result", async () => {
    mockedSuggestSingleSeed.mockResolvedValue("Great Desert" as any);

    const res = await app.request("/api/worldgen/suggest-seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premise: "Arid world", category: "geography" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ category: "geography", value: "Great Desert" });
    expect(mockedSuggestSingleSeed).toHaveBeenCalledWith(
      expect.objectContaining({ premise: "Arid world", category: "geography" })
    );
  });
});

// ---------------------------------------------------------------------------
// POST /api/worldgen/save-edits
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/save-edits", () => {
  const validScaffold = {
    refinedPremise: "A refined dark world",
    locations: [{ name: "Castle", description: "Big castle", tags: ["fortified"], isStarting: true, connectedTo: ["Village"] }],
    factions: [],
    npcs: [],
    loreCards: [],
  };

  it("calls saveScaffoldToDb and markGenerationComplete", async () => {
    mockedSaveScaffoldToDb.mockReturnValue(undefined as any);
    mockedMarkGenComplete.mockReturnValue(undefined as any);
    mockedDeleteLore.mockResolvedValue(undefined as any);
    mockedExtractLoreCards.mockResolvedValue([] as any);
    mockedStoreLore.mockResolvedValue(undefined as any);

    const res = await app.request("/api/worldgen/save-edits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, scaffold: validScaffold }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(mockedSaveScaffoldToDb).toHaveBeenCalledWith(CAMPAIGN_ID, validScaffold);
    expect(mockedMarkGenComplete).toHaveBeenCalledWith(CAMPAIGN_ID, "A refined dark world");
  });

  it("returns 404 with no active campaign", async () => {
    mockedGetActiveCampaign.mockReturnValue(null as any);

    const res = await app.request("/api/worldgen/save-edits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: "non-existent", scaffold: validScaffold }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// POST /api/worldgen/parse-worldbook
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/parse-worldbook", () => {
  it("parses valid WorldBook JSON and returns classified entries", async () => {
    const worldbook = {
      entries: {
        "0": { comment: "Hero", content: "A brave warrior" },
        "1": { comment: "Village", content: "A small village" },
      },
    };
    const parsed = [
      { name: "Hero", content: "A brave warrior" },
      { name: "Village", content: "A small village" },
    ];
    const classified = [
      { name: "Hero", type: "npc", summary: "A brave warrior" },
      { name: "Village", type: "location", summary: "A small village" },
    ];
    mockedParseWorldBook.mockReturnValue(parsed as any);
    mockedClassifyEntries.mockResolvedValue(classified as any);

    const res = await app.request("/api/worldgen/parse-worldbook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, worldbook }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ entries: classified });
    expect(mockedParseWorldBook).toHaveBeenCalledWith(worldbook);
    expect(mockedClassifyEntries).toHaveBeenCalledWith(parsed, fakeResolvedRole);
  });

  it("returns 400 for missing worldbook", async () => {
    const res = await app.request("/api/worldgen/parse-worldbook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// POST /api/worldgen/import-worldbook
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/import-worldbook", () => {
  it("classifies entries and imports them, returning counts", async () => {
    const entries = [
      { name: "Hero", type: "npc" as const, summary: "A brave warrior" },
      { name: "Village", type: "location" as const, summary: "A small village" },
    ];
    const importResult = { npcs: 1, locations: 1, factions: 0, loreCards: 0 };
    mockedImportClassifiedEntries.mockResolvedValue(importResult as any);

    const res = await app.request("/api/worldgen/import-worldbook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, entries }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(importResult);
    expect(mockedImportClassifiedEntries).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      entries,
      expect.anything()
    );
  });

  it("returns 404 when campaign not active", async () => {
    mockedGetActiveCampaign.mockReturnValue(null as any);

    const res = await app.request("/api/worldgen/import-worldbook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: "wrong-id",
        entries: [{ name: "X", type: "npc", summary: "Y" }],
      }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// POST /api/worldgen/regenerate-section
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/regenerate-section", () => {
  it("calls generateRefinedPremiseStep for section=premise", async () => {
    mockedGenerateRefinedPremise.mockResolvedValue("New refined premise" as any);

    const res = await app.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, section: "premise" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ refinedPremise: "New refined premise" });
    expect(mockedGenerateRefinedPremise).toHaveBeenCalled();
  });

  it("calls generateLocationsStep for section=locations", async () => {
    const locs = [{ name: "Forest", description: "Dense", tags: [], isStarting: false, connectedTo: [] }];
    mockedGenerateLocations.mockResolvedValue(locs as any);

    const res = await app.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        section: "locations",
        refinedPremise: "A dark world",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ locations: locs });
    expect(mockedGenerateLocations).toHaveBeenCalled();
  });

  it("calls generateFactionsStep for section=factions", async () => {
    const facs = [{ name: "Rebels", tags: [], goals: [], assets: [], territoryNames: [] }];
    mockedGenerateFactions.mockResolvedValue(facs as any);

    const res = await app.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        section: "factions",
        refinedPremise: "A dark world",
        locationNames: ["Castle"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ factions: facs });
    expect(mockedGenerateFactions).toHaveBeenCalled();
  });

  it("calls generateNpcsStep for section=npcs", async () => {
    const npcs = [{ name: "Guard", persona: "Loyal", tags: [], goals: { shortTerm: [], longTerm: [] }, locationName: "Castle", factionName: null }];
    mockedGenerateNpcs.mockResolvedValue(npcs as any);

    const res = await app.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        section: "npcs",
        refinedPremise: "A dark world",
        locationNames: ["Castle"],
        factionNames: ["Rebels"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ npcs });
    expect(mockedGenerateNpcs).toHaveBeenCalled();
  });

  it("returns 400 for unknown section", async () => {
    const res = await app.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, section: "unknown_thing" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
