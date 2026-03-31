import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("../../worldgen/index.js", () => ({
  beginWorldgenOperation: vi.fn(() => ({
    startHeartbeat: vi.fn(),
    setLabel: vi.fn(),
    finish: vi.fn(),
  })),
  listWorldgenOperations: vi.fn(() => ({ active: [], recent: [] })),
  rollWorldSeeds: vi.fn(),
  rollSeed: vi.fn(),
  suggestWorldSeeds: vi.fn(),
  suggestSingleSeed: vi.fn(),
  interpretPremiseDivergence: vi.fn(),
  applyPremiseCharacterOverrides: vi.fn((ctx: unknown) => ctx),
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
  worldbookToIpContext: vi.fn(),
}));

vi.mock("../../worldbook-library/index.js", () => ({
  listWorldbookLibrary: vi.fn(),
  importWorldbookToLibrary: vi.fn(),
  composeSelectedWorldbooks: vi.fn(),
}));

vi.mock("../../worldgen/ip-researcher.js", () => ({
  researchKnownIP: vi.fn(() => Promise.resolve(null)),
  evaluateResearchSufficiency: vi.fn((ctx: unknown) => Promise.resolve(ctx)),
}));

vi.mock("../../campaign/index.js", () => ({
  readCampaignConfig: vi.fn(() => ({})),
  markGenerationComplete: vi.fn(),
  saveIpContext: vi.fn(),
  loadIpContext: vi.fn(() => null),
  savePremiseDivergence: vi.fn(),
  loadPremiseDivergence: vi.fn(() => null),
  getActiveCampaign: vi.fn(),
  loadCampaign: vi.fn(),
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
  interpretPremiseDivergence,
  generateWorldScaffold,
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
  worldbookToIpContext,
} from "../../worldgen/worldbook-importer.js";
import {
  listWorldbookLibrary,
  importWorldbookToLibrary,
  composeSelectedWorldbooks,
} from "../../worldbook-library/index.js";
import {
  readCampaignConfig,
  markGenerationComplete,
  getActiveCampaign,
  loadCampaign,
  saveIpContext,
  loadIpContext,
  savePremiseDivergence,
  loadPremiseDivergence,
} from "../../campaign/index.js";
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
const mockedInterpretPremiseDivergence = vi.mocked(interpretPremiseDivergence);
const mockedGenerateWorldScaffold = vi.mocked(generateWorldScaffold);
const mockedSaveScaffoldToDb = vi.mocked(saveScaffoldToDb);
const mockedExtractLoreCards = vi.mocked(extractLoreCards);
const mockedMarkGenComplete = vi.mocked(markGenerationComplete);
const mockedGetActiveCampaign = vi.mocked(getActiveCampaign);
const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedSaveIpContext = vi.mocked(saveIpContext);
const mockedLoadIpContext = vi.mocked(loadIpContext);
const mockedSavePremiseDivergence = vi.mocked(savePremiseDivergence);
const mockedLoadPremiseDivergence = vi.mocked(loadPremiseDivergence);
const mockedDeleteLore = vi.mocked(deleteCampaignLore);
const mockedStoreLore = vi.mocked(storeLoreCards);
const mockedLoadSettings = vi.mocked(loadSettings);
const mockedResolveRoleModel = vi.mocked(resolveRoleModel);
const mockedResolveFallback = vi.mocked(resolveFallbackProvider);
const mockedParseWorldBook = vi.mocked(parseWorldBook);
const mockedClassifyEntries = vi.mocked(classifyEntries);
const mockedImportClassifiedEntries = vi.mocked(importClassifiedEntries);
const mockedWorldbookToIpContext = vi.mocked(worldbookToIpContext);
const mockedListWorldbookLibrary = vi.mocked(listWorldbookLibrary);
const mockedImportWorldbookToLibrary = vi.mocked(importWorldbookToLibrary);
const mockedComposeSelectedWorldbooks = vi.mocked(composeSelectedWorldbooks);
const mockedReadCampaignConfig = vi.mocked(readCampaignConfig);
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
  mockedLoadCampaign.mockResolvedValue({
    id: CAMPAIGN_ID,
    name: "Test Campaign",
    premise: "A dark world",
    seeds: { geography: "Mountains" },
    createdAt: "2026-01-01",
  } as any);
  mockedReadCampaignConfig.mockReturnValue({} as any);
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
    const suggested = { seeds: { geography: "Floating islands", centralConflict: "War" } };
    mockedSuggestWorldSeeds.mockResolvedValue(suggested as any);

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

  it("accepts empty premise and lets the route apply its fallback premise", async () => {
    mockedSuggestWorldSeeds.mockResolvedValue({ seeds: { geography: "Ruins" } } as any);

    const res = await app.request("/api/worldgen/suggest-seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premise: "   " }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.geography).toBe("Ruins");
    expect(mockedSuggestWorldSeeds).toHaveBeenCalledWith(
      expect.objectContaining({ premise: "An original fantasy world" })
    );
  });

  it("returns a hidden _premiseDivergence artifact from suggestWorldSeeds", async () => {
    const premiseDivergence = {
      mode: "diverged",
      protagonistRole: {
        kind: "custom",
        interpretation: "replacement",
        canonicalCharacterName: "Dr. Kel",
        roleSummary: "The player's custom character replaces Dr. Kel as the active station operator.",
      },
      preservedCanonFacts: ["The signal base remains active."],
      changedCanonFacts: ["Dr. Kel is no longer the active protagonist."],
      currentStateDirectives: ["Treat the player as the newly arrived operator."],
      ambiguityNotes: [],
    };
    mockedSuggestWorldSeeds.mockResolvedValue({
      seeds: { geography: "Remote valley" },
      premiseDivergence,
    } as any);

    const res = await app.request("/api/worldgen/suggest-seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premise: "Voices of the Void, but I'm playing instead of Dr Kel" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._premiseDivergence).toEqual(premiseDivergence);
  });

  it("composes selected reusable worldbooks on the backend when selectedWorldbooks is present", async () => {
    const selectedWorldbooks = [
      {
        id: "wb-alpha",
        displayName: "Alpha Archive",
        normalizedSourceHash: "hash-alpha",
        entryCount: 12,
        createdAt: 1700000000000,
        updatedAt: 1700000001000,
      },
    ];
    const ipContext = {
      franchise: "Alpha Archive",
      keyFacts: ["Captain Mira: A decorated sky captain."],
      tonalNotes: ["Lightning oaths bind all captains."],
      source: "llm" as const,
    };

    mockedComposeSelectedWorldbooks.mockReturnValue({
      ipContext,
      worldbookSelection: selectedWorldbooks,
      provenance: { sources: selectedWorldbooks, groups: [] },
    } as any);
    mockedSuggestWorldSeeds.mockResolvedValue({ seeds: { geography: "Sky mesas" } } as any);

    const res = await app.request("/api/worldgen/suggest-seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedWorldbooks }),
    });

    expect(res.status).toBe(200);
    expect(mockedComposeSelectedWorldbooks).toHaveBeenCalledWith(selectedWorldbooks);
    expect(mockedSuggestWorldSeeds).toHaveBeenCalledWith(
      expect.objectContaining({
        premise: "A world based on the Alpha Archive setting",
        ipContext,
      }),
    );
  });

  it("falls back to legacy worldbookEntries when reusable selections are absent", async () => {
    const ipContext = {
      franchise: "Legacy Book",
      keyFacts: ["Captain Mira: A decorated sky captain."],
      tonalNotes: ["Custom worldbook setting"],
      source: "llm" as const,
    };

    mockedWorldbookToIpContext.mockReturnValue(ipContext as any);
    mockedSuggestWorldSeeds.mockResolvedValue({ seeds: { geography: "Sky mesas" } } as any);

    const res = await app.request("/api/worldgen/suggest-seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Legacy Book",
        worldbookEntries: [
          {
            name: "Captain Mira",
            type: "character",
            summary: "A decorated sky captain.",
          },
        ],
      }),
    });

    expect(res.status).toBe(200);
    expect(mockedComposeSelectedWorldbooks).not.toHaveBeenCalled();
    expect(mockedWorldbookToIpContext).toHaveBeenCalledWith(
      [
        {
          name: "Captain Mira",
          type: "character",
          summary: "A decorated sky captain.",
        },
      ],
      "Legacy Book",
    );
    expect(mockedSuggestWorldSeeds).toHaveBeenCalledWith(
      expect.objectContaining({ ipContext }),
    );
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
// POST /api/worldgen/generate
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/generate", () => {
  it("computes premiseDivergence once during generate and reuses the cached artifact during later regeneration", async () => {
    const ipContext = {
      franchise: "Voices of the Void",
      keyFacts: ["The signal base sits in a remote valley."],
      tonalNotes: ["lonely", "paranormal"],
      canonicalNames: {
        locations: ["Signal Base"],
        factions: ["Research Staff"],
        characters: ["Dr. Kel", "Maxwell"],
      },
      source: "mcp" as const,
    };
    const computedPremiseDivergence = {
      mode: "diverged",
      protagonistRole: {
        kind: "custom",
        interpretation: "replacement",
        canonicalCharacterName: "Dr. Kel",
        roleSummary: "The player replaces Dr. Kel as the station operator.",
      },
      preservedCanonFacts: ["The signal base remains active."],
      changedCanonFacts: ["Dr. Kel is no longer the active protagonist."],
      currentStateDirectives: ["Treat the player as the newly arrived operator."],
      ambiguityNotes: [],
    };

    let cachedPremiseDivergence: typeof computedPremiseDivergence | null = null;
    mockedLoadIpContext.mockReturnValue(ipContext as any);
    mockedLoadPremiseDivergence.mockImplementation(() => cachedPremiseDivergence as any);
    mockedSavePremiseDivergence.mockImplementation((_, divergence) => {
      cachedPremiseDivergence = divergence as typeof computedPremiseDivergence;
    });
    mockedInterpretPremiseDivergence.mockResolvedValue(computedPremiseDivergence as any);
    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "A strange signals campaign",
        locations: [
          { name: "Signal Base", description: "Station", tags: [], isStarting: true, connectedTo: [] },
        ],
        factions: [],
        npcs: [],
        loreCards: [],
      },
      enrichedIpContext: null,
    } as any);
    mockedGenerateRefinedPremise.mockResolvedValue("Cached divergence reuse" as any);

    const generateRes = await app.request("/api/worldgen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, ipContext }),
    });

    expect(generateRes.status).toBe(200);
    await generateRes.text();
    expect(mockedInterpretPremiseDivergence).toHaveBeenCalledTimes(1);
    expect(mockedSavePremiseDivergence).toHaveBeenCalledWith(CAMPAIGN_ID, computedPremiseDivergence);
    expect(cachedPremiseDivergence).toBe(computedPremiseDivergence);

    const regenerateRes = await app.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, section: "premise" }),
    });

    expect(regenerateRes.status).toBe(200);
    expect(await regenerateRes.json()).toEqual({ refinedPremise: "Cached divergence reuse" });
    expect(mockedGenerateRefinedPremise).toHaveBeenCalledWith(
      expect.objectContaining({ premiseDivergence: computedPremiseDivergence }),
      expect.objectContaining({ franchise: "Voices of the Void" }),
      undefined,
    );
    expect(mockedInterpretPremiseDivergence).toHaveBeenCalledTimes(1);
  });

  it("accepts premiseDivergence from the request body and passes it through to generation/cache", async () => {
    const premiseDivergence = {
      mode: "diverged",
      protagonistRole: {
        kind: "custom",
        interpretation: "replacement",
        canonicalCharacterName: "Dr. Kel",
        roleSummary: "The player's custom character replaces Dr. Kel as the active station operator.",
      },
      preservedCanonFacts: ["The signal base remains active."],
      changedCanonFacts: ["Dr. Kel is no longer the active protagonist."],
      currentStateDirectives: ["Treat the player as the newly arrived operator."],
      ambiguityNotes: [],
    };

    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "A strange signals campaign",
        locations: [
          { name: "Signal Base", description: "Station", tags: [], isStarting: true, connectedTo: [] },
        ],
        factions: [],
        npcs: [],
        loreCards: [],
      },
      enrichedIpContext: null,
    } as any);

    const res = await app.request("/api/worldgen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, premiseDivergence }),
    });

    expect(res.status).toBe(200);
    await res.text();

    expect(mockedSavePremiseDivergence).toHaveBeenCalledWith(CAMPAIGN_ID, premiseDivergence);
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: CAMPAIGN_ID, premiseDivergence }),
      expect.any(Function),
    );
  });

  it("passes full ipContext from request body into generation and saves it to cache", async () => {
    const ipContext = {
      franchise: "Naruto",
      keyFacts: ["Konohagakure is a hidden village."],
      tonalNotes: ["Shonen action"],
      canonicalNames: {
        locations: ["Konohagakure"],
        factions: ["Akatsuki"],
        characters: ["Naruto Uzumaki"],
      },
      excludedCharacters: ["Naruto Uzumaki"],
      source: "mcp" as const,
    };

    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "A shinobi world",
        locations: [
          { name: "Konohagakure", description: "Village", tags: [], isStarting: true, connectedTo: [] },
        ],
        factions: [],
        npcs: [],
        loreCards: [],
      },
      enrichedIpContext: ipContext,
    } as any);
    mockedSaveScaffoldToDb.mockReturnValue(undefined as any);
    mockedMarkGenComplete.mockReturnValue(undefined as any);

    const res = await app.request("/api/worldgen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, ipContext }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await res.text();

    expect(mockedSaveIpContext).toHaveBeenCalledWith(CAMPAIGN_ID, ipContext);
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({ campaignId: CAMPAIGN_ID, ipContext }),
      expect.any(Function),
    );
  });

  it("loads cached ipContext when request body omits it and saves enriched context back", async () => {
    const cachedIpContext = {
      franchise: "Naruto",
      keyFacts: ["Konohagakure is a hidden village."],
      tonalNotes: ["Shonen action"],
      canonicalNames: {
        locations: ["Konohagakure"],
      },
      source: "mcp" as const,
    };
    const enrichedIpContext = {
      ...cachedIpContext,
      keyFacts: [...cachedIpContext.keyFacts, "Akatsuki is a rogue shinobi organization."],
    };

    mockedLoadIpContext.mockReturnValue(cachedIpContext as any);
    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "A shinobi world",
        locations: [
          { name: "Konohagakure", description: "Village", tags: [], isStarting: true, connectedTo: [] },
        ],
        factions: [],
        npcs: [],
        loreCards: [],
      },
      enrichedIpContext,
    } as any);
    mockedSaveScaffoldToDb.mockReturnValue(undefined as any);
    mockedMarkGenComplete.mockReturnValue(undefined as any);

    const res = await app.request("/api/worldgen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    await res.text();

    expect(mockedLoadIpContext).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({ ipContext: cachedIpContext }),
      expect.any(Function),
    );
    expect(mockedSaveIpContext).toHaveBeenCalledWith(CAMPAIGN_ID, enrichedIpContext);
  });

  it("rebuilds ipContext from saved worldbook selection when cache is empty", async () => {
    const worldbookSelection = [
      {
        id: "wb-alpha",
        displayName: "Alpha Archive",
        normalizedSourceHash: "hash-alpha",
        entryCount: 12,
        createdAt: 1700000000000,
        updatedAt: 1700000001000,
      },
    ];
    const composedIpContext = {
      franchise: "Alpha Archive",
      keyFacts: ["Captain Mira: A decorated sky captain."],
      tonalNotes: ["Lightning oaths bind all captains."],
      source: "llm" as const,
    };

    mockedReadCampaignConfig.mockReturnValue({ worldbookSelection } as any);
    mockedComposeSelectedWorldbooks.mockReturnValue({
      ipContext: composedIpContext,
      worldbookSelection,
      provenance: { sources: worldbookSelection, groups: [] },
    } as any);
    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "A skyfaring campaign",
        locations: [
          { name: "Sunspire", description: "Trade city", tags: [], isStarting: true, connectedTo: [] },
        ],
        factions: [],
        npcs: [],
        loreCards: [],
      },
      enrichedIpContext: null,
    } as any);

    const res = await app.request("/api/worldgen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    await res.text();

    expect(mockedReadCampaignConfig).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(mockedComposeSelectedWorldbooks).toHaveBeenCalledWith(worldbookSelection);
    expect(mockedSaveIpContext).toHaveBeenCalledWith(CAMPAIGN_ID, composedIpContext);
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({ ipContext: composedIpContext }),
      expect.any(Function),
    );
  });

  it("loads cached premiseDivergence when request body omits it and reuses it for generation", async () => {
    const cachedPremiseDivergence = {
      mode: "diverged",
      protagonistRole: {
        kind: "custom",
        interpretation: "replacement",
        canonicalCharacterName: "Dr. Kel",
        roleSummary: "The player replaces Dr. Kel as the station operator.",
      },
      preservedCanonFacts: ["The signal base remains active."],
      changedCanonFacts: ["Dr. Kel is no longer the active protagonist."],
      currentStateDirectives: ["Treat the player as the newly arrived operator."],
      ambiguityNotes: [],
    };

    mockedLoadPremiseDivergence.mockReturnValue(cachedPremiseDivergence as any);
    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "A strange signals campaign",
        locations: [
          { name: "Signal Base", description: "Station", tags: [], isStarting: true, connectedTo: [] },
        ],
        factions: [],
        npcs: [],
        loreCards: [],
      },
      enrichedIpContext: null,
    } as any);

    const res = await app.request("/api/worldgen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    await res.text();

    expect(mockedLoadPremiseDivergence).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({ premiseDivergence: cachedPremiseDivergence }),
      expect.any(Function),
    );
    expect(mockedInterpretPremiseDivergence).not.toHaveBeenCalled();
  });

  it("remains compatible with cached ipContext-only generation requests", async () => {
    mockedLoadIpContext.mockReturnValue({
      franchise: "Naruto",
      keyFacts: ["Konohagakure is a hidden village."],
      tonalNotes: ["Shonen action"],
      source: "mcp",
    } as any);
    mockedLoadPremiseDivergence.mockReturnValue(null as any);
    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "A shinobi world",
        locations: [
          { name: "Konohagakure", description: "Village", tags: [], isStarting: true, connectedTo: [] },
        ],
        factions: [],
        npcs: [],
        loreCards: [],
      },
      enrichedIpContext: null,
    } as any);

    const res = await app.request("/api/worldgen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    await res.text();

    expect(mockedLoadIpContext).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        ipContext: expect.objectContaining({ franchise: "Naruto" }),
      }),
      expect.any(Function),
    );
  });

  it("reloads the requested campaign when active state was lost before generation", async () => {
    mockedGetActiveCampaign.mockReturnValue(null as any);
    mockedLoadCampaign.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: "Recovered campaign",
      premise: "A dark world",
      seeds: { geography: "Mountains" },
      createdAt: "2026-01-01",
    } as any);
    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "Recovered world",
        locations: [
          { name: "Konohagakure", description: "Village", tags: [], isStarting: true, connectedTo: [] },
        ],
        factions: [],
        npcs: [],
        loreCards: [],
      },
      enrichedIpContext: null,
    } as any);

    const res = await app.request("/api/worldgen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    await res.text();
    expect(mockedLoadCampaign).toHaveBeenCalledWith(CAMPAIGN_ID);
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
    mockedLoadCampaign.mockRejectedValue(new Error("not found"));

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
// GET /api/worldgen/worldbook-library
// ---------------------------------------------------------------------------
describe("GET /api/worldgen/worldbook-library", () => {
  it("returns reusable worldbook items without requiring an active campaign", async () => {
    const items = [
      {
        id: "wb-alpha",
        displayName: "Alpha Codex",
        normalizedSourceHash: "hash-alpha",
        entryCount: 12,
        createdAt: 1700000000000,
        updatedAt: 1700000001000,
      },
      {
        id: "wb-beta",
        displayName: "Beta Codex",
        normalizedSourceHash: "hash-beta",
        entryCount: 8,
        createdAt: 1700000002000,
        updatedAt: 1700000003000,
      },
    ];
    mockedListWorldbookLibrary.mockReturnValue(items as any);
    mockedGetActiveCampaign.mockReturnValue(null as any);

    const res = await app.request("/api/worldgen/worldbook-library");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items });
    expect(mockedListWorldbookLibrary).toHaveBeenCalledOnce();
    expect(mockedLoadCampaign).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /api/worldgen/worldbook-library/import
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/worldbook-library/import", () => {
  it("parses raw worldbook JSON, classifies on first import, and returns { item, existed }", async () => {
    const worldbook = {
      entries: {
        "0": { comment: "Hero", content: "A brave warrior" },
      },
    };
    const parsed = [{ name: "Hero", text: "A brave warrior" }];
    const classified = [
      { name: "Hero", type: "character" as const, summary: "A brave warrior" },
    ];
    const item = {
      id: "wb-hero",
      displayName: "Hero Book",
      normalizedSourceHash: "hash-hero",
      entryCount: 1,
      createdAt: 1700000000000,
      updatedAt: 1700000001000,
    };

    mockedParseWorldBook.mockReturnValue(parsed as any);
    mockedImportWorldbookToLibrary.mockImplementation(async (options: any) => {
      const entries = await options.classify();
      expect(entries).toEqual(classified);
      expect(options.displayName).toBe("Hero Book");
      expect(options.originalFileName).toBe("hero.json");
      expect(options.parsedEntries).toEqual(parsed);
      return { item, existed: false };
    });
    mockedClassifyEntries.mockResolvedValue(classified as any);

    const res = await app.request("/api/worldgen/worldbook-library/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName: "Hero Book",
        originalFileName: "hero.json",
        worldbook,
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ item, existed: false });
    expect(mockedParseWorldBook).toHaveBeenCalledWith(worldbook);
    expect(mockedClassifyEntries).toHaveBeenCalledWith(parsed, fakeResolvedRole);
    expect(mockedImportWorldbookToLibrary).toHaveBeenCalledOnce();
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
    mockedLoadCampaign.mockRejectedValue(new Error("not found"));

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
  it("reuses cached premiseDivergence for section regeneration", async () => {
    const cachedPremiseDivergence = {
      mode: "diverged",
      protagonistRole: {
        kind: "custom",
        interpretation: "replacement",
        canonicalCharacterName: "Dr. Kel",
        roleSummary: "The player replaces Dr. Kel as the station operator.",
      },
      preservedCanonFacts: ["The signal base remains active."],
      changedCanonFacts: ["Dr. Kel is no longer the active protagonist."],
      currentStateDirectives: ["Treat the player as the newly arrived operator."],
      ambiguityNotes: [],
    };

    mockedLoadPremiseDivergence.mockReturnValue(cachedPremiseDivergence as any);
    mockedGenerateRefinedPremise.mockResolvedValue("New refined premise" as any);

    const res = await app.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, section: "premise" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ refinedPremise: "New refined premise" });
    expect(mockedLoadPremiseDivergence).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(mockedGenerateRefinedPremise).toHaveBeenCalledWith(
      expect.objectContaining({ premiseDivergence: cachedPremiseDivergence }),
      expect.anything(),
      undefined,
    );
  });

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
