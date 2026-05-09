import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { IngestionPipelineError } from "../../character/ingestion/errors.js";
import {
  cloneJjkNarutoArtifact,
  makeArtifactWith,
} from "../../worldgen/__tests__/fixtures/jjk-naruto-artifact.js";

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
  researchWorldgenArtifact: vi.fn(() => Promise.resolve(null)),
  evaluateResearchSufficiency: vi.fn((ctx: unknown) => Promise.resolve(ctx)),
  evaluateResearchArtifactSufficiency: vi.fn((artifact: unknown) => Promise.resolve(artifact)),
}));

vi.mock("../../campaign/index.js", () => ({
  readCampaignConfig: vi.fn(() => ({})),
  markGenerationComplete: vi.fn(),
  saveIpContext: vi.fn(),
  loadIpContext: vi.fn(() => null),
  savePremiseDivergence: vi.fn(),
  loadPremiseDivergence: vi.fn(() => null),
  saveWorldgenResearchFrame: vi.fn(),
  loadWorldgenResearchFrame: vi.fn(() => null),
  saveWorldgenResearchArtifact: vi.fn(),
  loadWorldgenResearchArtifact: vi.fn(() => null),
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
  saveWorldgenResearchFrame,
  loadWorldgenResearchFrame,
  saveWorldgenResearchArtifact,
  loadWorldgenResearchArtifact,
} from "../../campaign/index.js";
import { deleteCampaignLore, storeLoreCards } from "../../vectors/lore-cards.js";
import { loadSettings } from "../../settings/index.js";
import { resolveRoleModel } from "../../ai/index.js";
import {
  researchKnownIP,
  researchWorldgenArtifact,
  evaluateResearchSufficiency,
  evaluateResearchArtifactSufficiency,
} from "../../worldgen/ip-researcher.js";
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
const mockedSaveWorldgenResearchFrame = vi.mocked(saveWorldgenResearchFrame);
const mockedLoadWorldgenResearchFrame = vi.mocked(loadWorldgenResearchFrame);
const mockedSaveWorldgenResearchArtifact = vi.mocked(saveWorldgenResearchArtifact);
const mockedLoadWorldgenResearchArtifact = vi.mocked(loadWorldgenResearchArtifact);
const mockedDeleteLore = vi.mocked(deleteCampaignLore);
const mockedStoreLore = vi.mocked(storeLoreCards);
const mockedLoadSettings = vi.mocked(loadSettings);
const mockedResolveRoleModel = vi.mocked(resolveRoleModel);
const mockedResearchKnownIP = vi.mocked(researchKnownIP);
const mockedResearchWorldgenArtifact = vi.mocked(researchWorldgenArtifact);
const mockedEvaluateResearchSufficiency = vi.mocked(evaluateResearchSufficiency);
const mockedEvaluateResearchArtifactSufficiency = vi.mocked(evaluateResearchArtifactSufficiency);
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
  images: { providerId: "", model: "", stylePrompt: "", enabled: false },
  research: { enabled: false, maxSearchSteps: 3 },
  ui: { showRawReasoning: false },
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
  mockedLoadIpContext.mockReturnValue(null as any);
  mockedLoadPremiseDivergence.mockReturnValue(null as any);
  mockedLoadWorldgenResearchFrame.mockReturnValue(null as any);
  mockedLoadWorldgenResearchArtifact.mockReturnValue(null as any);
  mockedResearchKnownIP.mockResolvedValue(null as any);
  mockedResearchWorldgenArtifact.mockResolvedValue(null as any);
  mockedEvaluateResearchSufficiency.mockImplementation((ctx: any) => Promise.resolve(ctx));
  mockedEvaluateResearchArtifactSufficiency.mockImplementation((artifact: any) => Promise.resolve(artifact));
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

  it("rejects empty premise when no world knowledge context is available", async () => {

    const res = await app.request("/api/worldgen/suggest-seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premise: "   " }),
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Premise is required when no world knowledge context is available.",
    });
    expect(mockedSuggestWorldSeeds).not.toHaveBeenCalled();
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
    expect(mockedComposeSelectedWorldbooks).toHaveBeenCalledWith(selectedWorldbooks, "");
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

  it("returns a v2 research artifact for automatic known-IP research without synthesizing legacy _ipContext", async () => {
    const artifact = cloneJjkNarutoArtifact();
    mockedResearchWorldgenArtifact.mockResolvedValue(artifact as any);
    mockedSuggestWorldSeeds.mockResolvedValue({
      seeds: {
        geography: "Tokyo curse districts shaped by chakra flow",
        politicalStructure: "Jujutsu authorities",
        centralConflict: "Sorcerer clans debate imported chakra use",
        culturalFlavor: ["urban occult", "martial discipline"],
        environment: "Neon rain and curse residue",
        wildcard: "Chakra seals disturb cursed barriers",
      },
      premiseDivergence: null,
    } as any);

    const res = await app.request("/api/worldgen/suggest-seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        premise: "Jujutsu Kaisen world with Naruto power system",
        name: "Cursed Chakra",
        franchise: "Jujutsu Kaisen / Naruto",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._researchArtifact).toEqual(artifact);
    expect(body._ipContext).toBeNull();
    expect(mockedResearchWorldgenArtifact).toHaveBeenCalledWith(
      {
        premise: "Jujutsu Kaisen world with Naruto power system",
        name: "Cursed Chakra",
        knownIP: "Jujutsu Kaisen / Naruto",
        research: fakeSettings.research,
      },
      fakeResolvedRole,
      fakeSettings.research.maxSearchSteps,
    );
    expect(mockedResearchKnownIP).not.toHaveBeenCalled();
    expect(mockedSuggestWorldSeeds).toHaveBeenCalledWith(
      expect.objectContaining({
        premise: "Jujutsu Kaisen world with Naruto power system",
        ipContext: null,
        researchArtifact: artifact,
      }),
    );
  });

  it("runs v2 artifact research from premise even when the franchise field is empty", async () => {
    const artifact = cloneJjkNarutoArtifact();
    mockedResearchWorldgenArtifact.mockResolvedValue(artifact as any);
    mockedSuggestWorldSeeds.mockResolvedValue({
      seeds: { geography: "Tokyo curse districts shaped by chakra flow" },
      premiseDivergence: null,
    } as any);

    const res = await app.request("/api/worldgen/suggest-seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        premise: "Jujutsu Kaisen world with Naruto power system",
        name: "Naruto x JJK",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body._researchArtifact).toEqual(artifact);
    expect(mockedResearchWorldgenArtifact).toHaveBeenCalledWith(
      {
        premise: "Jujutsu Kaisen world with Naruto power system",
        name: "Naruto x JJK",
        knownIP: undefined,
        research: fakeSettings.research,
      },
      fakeResolvedRole,
      fakeSettings.research.maxSearchSteps,
    );
    expect(mockedSuggestWorldSeeds).toHaveBeenCalledWith(
      expect.objectContaining({
        researchArtifact: artifact,
        ipContext: null,
      }),
    );
  });

  it("does not run artifact research for DNA suggestions when research is disabled", async () => {
    mockedSuggestWorldSeeds.mockResolvedValue({
      seeds: { geography: "Tokyo curse districts shaped by chakra flow" },
      premiseDivergence: null,
    } as any);

    const res = await app.request("/api/worldgen/suggest-seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        premise: "Jujutsu Kaisen world with Naruto power system",
        name: "Naruto x JJK",
        research: false,
      }),
    });

    expect(res.status).toBe(200);
    expect(mockedResearchWorldgenArtifact).not.toHaveBeenCalled();
    expect(mockedSuggestWorldSeeds).toHaveBeenCalledWith(
      expect.objectContaining({
        researchArtifact: null,
        ipContext: null,
      }),
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

  it("accepts a v2 research artifact and passes it into suggestSingleSeed", async () => {
    const artifact = cloneJjkNarutoArtifact();
    mockedSuggestSingleSeed.mockResolvedValue("Tokyo Jujutsu High wards with chakra seal routes" as any);

    const res = await app.request("/api/worldgen/suggest-seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        premise: "Jujutsu Kaisen world with Naruto power system",
        category: "geography",
        researchArtifact: artifact,
      }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      category: "geography",
      value: "Tokyo Jujutsu High wards with chakra seal routes",
    });
    expect(mockedSuggestSingleSeed).toHaveBeenCalledWith(
      expect.objectContaining({
        premise: "Jujutsu Kaisen world with Naruto power system",
        category: "geography",
        researchArtifact: artifact,
      }),
    );
  });

  it("ignores legacy context fields when a v2 research artifact is present", async () => {
    const artifact = cloneJjkNarutoArtifact();
    const legacyIpContext = {
      franchise: "Legacy mixed canon",
      keyFacts: ["Stale village politics should not enter the artifact lane."],
      tonalNotes: ["stale legacy tone"],
      source: "mcp" as const,
    };
    const legacyPremiseDivergence = {
      mode: "coexisting",
      protagonistRole: {
        kind: "custom",
        interpretation: "coexisting",
        canonicalCharacterName: null,
        roleSummary: "Legacy divergence from an old seed request.",
      },
      preservedCanonFacts: ["Legacy canon fact."],
      changedCanonFacts: [],
      currentStateDirectives: ["Use stale context."],
      ambiguityNotes: [],
    };
    mockedSuggestSingleSeed.mockResolvedValue("Artifact-owned geography" as any);

    const res = await app.request("/api/worldgen/suggest-seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        premise: "Jujutsu Kaisen world with Naruto power system",
        category: "geography",
        ipContext: legacyIpContext,
        premiseDivergence: legacyPremiseDivergence,
        researchArtifact: artifact,
      }),
    });

    expect(res.status).toBe(200);
    const request = mockedSuggestSingleSeed.mock.calls[0]?.[0] as any;
    expect(request).toEqual(
      expect.objectContaining({
        premise: "Jujutsu Kaisen world with Naruto power system",
        category: "geography",
        researchArtifact: artifact,
      }),
    );
    expect(request.ipContext).toBeUndefined();
    expect(request.premiseDivergence).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// POST /api/worldgen/generate
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/generate", () => {
  it("builds and persists a worldgen research frame from cached ipContext, divergence, and seeds", async () => {
    const ipContext = {
      franchise: "Jujutsu Kaisen",
      keyFacts: ["Shibuya is a major Tokyo district."],
      tonalNotes: ["Urban occult action"],
      source: "mcp" as const,
    };
    const premiseDivergence = {
      mode: "diverged",
      protagonistRole: {
        kind: "custom",
        interpretation: "outsider",
        canonicalCharacterName: null,
        roleSummary: "The player arrives as an outsider with a Naruto-style power overlay.",
      },
      preservedCanonFacts: ["Shibuya remains an active cursed-energy hotspot."],
      changedCanonFacts: ["Chakra techniques now coexist with cursed techniques."],
      currentStateDirectives: ["Treat chakra-capable outsiders as part of the live power ecosystem."],
      ambiguityNotes: [],
    };

    mockedLoadIpContext.mockReturnValue(ipContext as any);
    mockedLoadPremiseDivergence.mockReturnValue(premiseDivergence as any);
    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "Shibuya burns under two intertwined power systems.",
        locations: [{ name: "Shibuya", description: "District", tags: [], isStarting: true, connectedTo: [] }],
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
    expect(mockedSaveWorldgenResearchFrame).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.objectContaining({
        franchise: "Jujutsu Kaisen",
        divergenceMode: "diverged",
        dnaConstraints: expect.arrayContaining(["Geography: Mountains"]),
      }),
    );
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({
        researchFrame: expect.objectContaining({
          franchise: "Jujutsu Kaisen",
          stepFocus: expect.objectContaining({
            locations: expect.arrayContaining([expect.stringContaining("Geography: Mountains")]),
          }),
        }),
      }),
      expect.any(Function),
    );
  });

  it("accepts a v2 research artifact body, saves it, and passes it into scaffold generation without legacy research frames", async () => {
    const artifact = cloneJjkNarutoArtifact();

    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "Shibuya burns under two intertwined power systems.",
        locations: [{ name: "Shibuya", description: "District", tags: [], isStarting: true, connectedTo: [] }],
        factions: [],
        npcs: [],
        loreCards: [],
      },
      enrichedIpContext: null,
    } as any);

    const res = await app.request("/api/worldgen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, ipContext: null, researchArtifact: artifact }),
    });

    expect(res.status).toBe(200);
    await res.text();
    expect(mockedSaveWorldgenResearchArtifact).toHaveBeenCalledWith(CAMPAIGN_ID, artifact);
    expect(mockedResearchKnownIP).not.toHaveBeenCalled();
    expect(mockedSaveWorldgenResearchFrame).not.toHaveBeenCalled();
    expect(mockedLoadWorldgenResearchFrame).not.toHaveBeenCalled();
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({
        ipContext: null,
        researchArtifact: artifact,
        researchFrame: null,
      }),
      expect.any(Function),
    );
  });

  it("loads a cached v2 research artifact when generate omits browser pass-through", async () => {
    const artifact = cloneJjkNarutoArtifact();

    mockedLoadWorldgenResearchArtifact.mockReturnValue(artifact as any);
    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "Cached artifact world",
        locations: [{ name: "Tokyo Jujutsu High", description: "School", tags: [], isStarting: true, connectedTo: [] }],
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
    expect(mockedLoadWorldgenResearchArtifact).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(mockedResearchWorldgenArtifact).not.toHaveBeenCalled();
    expect(mockedResearchKnownIP).not.toHaveBeenCalled();
    expect(mockedSaveWorldgenResearchFrame).not.toHaveBeenCalled();
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({ researchArtifact: artifact }),
      expect.any(Function),
    );
  });

  it("treats null request artifacts as omitted and keeps stored artifact authority over stale legacy fields", async () => {
    const artifact = cloneJjkNarutoArtifact();
    const staleLegacyContext = {
      franchise: "Naruto and Jujutsu Kaisen",
      keyFacts: ["Hidden Cloud Village politics should not enter the artifact lane."],
      tonalNotes: ["stale legacy tone"],
      source: "mcp" as const,
    };
    const staleLegacyDivergence = {
      mode: "coexisting",
      protagonistRole: {
        kind: "custom",
        interpretation: "coexisting",
        canonicalCharacterName: null,
        roleSummary: "Legacy divergence from an old nullable request.",
      },
      preservedCanonFacts: ["Legacy Naruto villages remain cached."],
      changedCanonFacts: [],
      currentStateDirectives: ["Use the legacy mixed context."],
      ambiguityNotes: [],
    };

    mockedLoadWorldgenResearchArtifact.mockReturnValue(artifact as any);
    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "Stored artifact wins",
        locations: [{ name: "Tokyo Jujutsu High", description: "School", tags: [], isStarting: true, connectedTo: [] }],
        factions: [],
        npcs: [],
        loreCards: [],
      },
      enrichedIpContext: null,
    } as any);

    const res = await app.request("/api/worldgen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        researchArtifact: null,
        ipContext: staleLegacyContext,
        premiseDivergence: staleLegacyDivergence,
      }),
    });

    expect(res.status).toBe(200);
    await res.text();
    expect(mockedLoadWorldgenResearchArtifact).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(mockedSaveWorldgenResearchArtifact).not.toHaveBeenCalledWith(CAMPAIGN_ID, null);
    expect(mockedSaveIpContext).not.toHaveBeenCalled();
    expect(mockedSavePremiseDivergence).not.toHaveBeenCalled();
    expect(mockedLoadIpContext).not.toHaveBeenCalled();
    expect(mockedLoadPremiseDivergence).not.toHaveBeenCalled();
    expect(mockedLoadWorldgenResearchFrame).not.toHaveBeenCalled();
    expect(mockedResearchWorldgenArtifact).not.toHaveBeenCalled();
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({
        ipContext: null,
        premiseDivergence: null,
        researchFrame: null,
        researchArtifact: artifact,
      }),
      expect.any(Function),
    );
  });

  it("uses a stored v2 artifact as the only research lane when legacy context is also cached", async () => {
    const artifact = cloneJjkNarutoArtifact();
    const cachedIpContext = {
      franchise: "Naruto and Jujutsu Kaisen",
      keyFacts: ["Hidden Mist Village and Tokyo Jujutsu High are both present."],
      tonalNotes: ["mixed canon"],
      source: "mcp" as const,
    };
    const cachedPremiseDivergence = {
      mode: "coexisting",
      protagonistRole: {
        kind: "custom",
        interpretation: "coexisting",
        canonicalCharacterName: null,
        roleSummary: "Legacy cached divergence from the old mixed-canon lane.",
      },
      preservedCanonFacts: ["Legacy Naruto villages remain cached."],
      changedCanonFacts: [],
      currentStateDirectives: ["Use the legacy mixed context."],
      ambiguityNotes: [],
    };

    mockedLoadWorldgenResearchArtifact.mockReturnValue(artifact as any);
    mockedLoadIpContext.mockReturnValue(cachedIpContext as any);
    mockedLoadPremiseDivergence.mockReturnValue(cachedPremiseDivergence as any);
    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "Artifact-only world",
        locations: [{ name: "Tokyo Jujutsu High", description: "School", tags: [], isStarting: true, connectedTo: [] }],
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
    expect(mockedLoadWorldgenResearchArtifact).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(mockedLoadIpContext).not.toHaveBeenCalled();
    expect(mockedLoadPremiseDivergence).not.toHaveBeenCalled();
    expect(mockedInterpretPremiseDivergence).not.toHaveBeenCalled();
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({
        ipContext: null,
        premiseDivergence: null,
        researchFrame: null,
        researchArtifact: artifact,
      }),
      expect.any(Function),
    );
  });

  it("does not save or forward body legacy context when a body artifact exists", async () => {
    const artifact = cloneJjkNarutoArtifact();
    const bodyIpContext = {
      franchise: "Naruto and Jujutsu Kaisen",
      keyFacts: ["Five Great Nations are cached in a legacy request body."],
      tonalNotes: ["mixed canon"],
      source: "mcp" as const,
    };
    const bodyPremiseDivergence = {
      mode: "coexisting",
      protagonistRole: {
        kind: "custom",
        interpretation: "coexisting",
        canonicalCharacterName: null,
        roleSummary: "Legacy request-body divergence from the old lane.",
      },
      preservedCanonFacts: ["Legacy Naruto political geography remains cached."],
      changedCanonFacts: [],
      currentStateDirectives: ["Use legacy mixed context."],
      ambiguityNotes: [],
    };

    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "Artifact-only body world",
        locations: [{ name: "Tokyo Jujutsu High", description: "School", tags: [], isStarting: true, connectedTo: [] }],
        factions: [],
        npcs: [],
        loreCards: [],
      },
      enrichedIpContext: null,
    } as any);

    const res = await app.request("/api/worldgen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        ipContext: bodyIpContext,
        premiseDivergence: bodyPremiseDivergence,
        researchArtifact: artifact,
      }),
    });

    expect(res.status).toBe(200);
    await res.text();
    expect(mockedSaveWorldgenResearchArtifact).toHaveBeenCalledWith(CAMPAIGN_ID, artifact);
    expect(mockedSaveIpContext).not.toHaveBeenCalled();
    expect(mockedSavePremiseDivergence).not.toHaveBeenCalled();
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({
        ipContext: null,
        premiseDivergence: null,
        researchFrame: null,
        researchArtifact: artifact,
      }),
      expect.any(Function),
    );
  });

  it("saves the single enriched v2 research artifact returned by world scaffold generation", async () => {
    const artifact = cloneJjkNarutoArtifact();
    const enrichedArtifact = makeArtifactWith((draft) => {
      draft.generatedContext.keyFacts.push("Kyoto Jujutsu High can support second-stage faction generation.");
    });

    mockedLoadWorldgenResearchArtifact.mockReturnValue(artifact as any);
    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "Cached artifact world",
        locations: [{ name: "Tokyo Jujutsu High", description: "School", tags: [], isStarting: true, connectedTo: [] }],
        factions: [],
        npcs: [],
        loreCards: [],
      },
      enrichedIpContext: null,
      researchArtifact: enrichedArtifact,
    } as any);

    const res = await app.request("/api/worldgen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    await res.text();
    expect(mockedSaveWorldgenResearchArtifact).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      enrichedArtifact,
    );
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({ researchArtifact: artifact }),
      expect.any(Function),
    );
  });

  it("re-runs v2 artifact research when generate has no body artifact and no cached artifact", async () => {
    const artifact = cloneJjkNarutoArtifact();

    mockedResearchWorldgenArtifact.mockResolvedValue(artifact as any);
    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "Re-researched artifact world",
        locations: [{ name: "Tokyo Jujutsu High", description: "School", tags: [], isStarting: true, connectedTo: [] }],
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
    expect(mockedResearchWorldgenArtifact).toHaveBeenCalledWith(
      { premise: "A dark world", name: "Test Campaign", research: fakeSettings.research },
      fakeResolvedRole,
      fakeSettings.research.maxSearchSteps,
    );
    expect(mockedSaveWorldgenResearchArtifact).toHaveBeenCalledWith(CAMPAIGN_ID, artifact);
    expect(mockedResearchKnownIP).not.toHaveBeenCalled();
    expect(mockedSaveWorldgenResearchFrame).not.toHaveBeenCalled();
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({ researchArtifact: artifact }),
      expect.any(Function),
    );
  });

  it("clears stale loaded legacy fields when on-demand v2 artifact research succeeds", async () => {
    const artifact = cloneJjkNarutoArtifact();
    const stalePremiseDivergence = {
      mode: "diverged",
      protagonistRole: {
        kind: "custom",
        interpretation: "replacement",
        canonicalCharacterName: "Old Hero",
        roleSummary: "Stale divergence from a previous legacy generation.",
      },
      preservedCanonFacts: ["Old cached canon fact."],
      changedCanonFacts: ["Old cached change."],
      currentStateDirectives: ["Follow old legacy directives."],
      ambiguityNotes: [],
    };
    const staleResearchFrame = {
      franchise: "Legacy Frame",
      premise: "Old premise",
      divergenceMode: "diverged",
      keyFacts: ["Old frame fact."],
      stepFocus: {},
    };

    mockedLoadIpContext.mockReturnValue(null as any);
    mockedLoadPremiseDivergence.mockReturnValue(stalePremiseDivergence as any);
    mockedLoadWorldgenResearchFrame.mockReturnValue(staleResearchFrame as any);
    mockedResearchWorldgenArtifact.mockResolvedValue(artifact as any);
    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "On-demand artifact world",
        locations: [{ name: "Tokyo Jujutsu High", description: "School", tags: [], isStarting: true, connectedTo: [] }],
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
    expect(mockedResearchWorldgenArtifact).toHaveBeenCalled();
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({
        ipContext: null,
        premiseDivergence: null,
        researchFrame: null,
        researchArtifact: artifact,
      }),
      expect.any(Function),
    );
  });

  it("passes saved worldgen source hint into on-demand v2 artifact research", async () => {
    const artifact = cloneJjkNarutoArtifact();
    mockedReadCampaignConfig.mockReturnValue({
      worldgenSourceHint: "Jujutsu Kaisen / Naruto",
      worldgenResearchEnabled: true,
    } as any);
    mockedResearchWorldgenArtifact.mockResolvedValue(artifact as any);
    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "On-demand hinted artifact world",
        locations: [{ name: "Tokyo Jujutsu High", description: "School", tags: [], isStarting: true, connectedTo: [] }],
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
    expect(mockedResearchWorldgenArtifact).toHaveBeenCalledWith(
      {
        premise: "A dark world",
        name: "Test Campaign",
        knownIP: "Jujutsu Kaisen / Naruto",
        research: fakeSettings.research,
      },
      fakeResolvedRole,
      fakeSettings.research.maxSearchSteps,
    );
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({
        researchArtifact: artifact,
        ipContext: null,
      }),
      expect.any(Function),
    );
  });

  it("skips on-demand v2 artifact research when the campaign saved research disabled", async () => {
    mockedReadCampaignConfig.mockReturnValue({
      worldgenSourceHint: "Jujutsu Kaisen / Naruto",
      worldgenResearchEnabled: false,
    } as any);
    mockedGenerateWorldScaffold.mockResolvedValue({
      scaffold: {
        refinedPremise: "No research world",
        locations: [{ name: "Original Start", description: "Start", tags: [], isStarting: true, connectedTo: [] }],
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
    expect(mockedResearchWorldgenArtifact).not.toHaveBeenCalled();
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({
        researchArtifact: null,
        ipContext: null,
      }),
      expect.any(Function),
    );
  });

  it("rejects malformed v2 research artifacts before persistence or generation", async () => {
    const res = await app.request("/api/worldgen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        researchArtifact: {
          version: 2,
          rawPremise: "too incomplete",
        },
      }),
    });

    expect(res.status).toBe(400);
    expect(mockedSaveWorldgenResearchArtifact).not.toHaveBeenCalled();
    expect(mockedGenerateWorldScaffold).not.toHaveBeenCalled();
  });

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

  it("prefers request-body ipContext over cached campaign context and skips fresh research", async () => {
    const requestIpContext = {
      franchise: "Naruto",
      keyFacts: ["Konohagakure is a hidden village."],
      tonalNotes: ["Shonen action"],
      source: "mcp" as const,
    };
    const cachedIpContext = {
      franchise: "Bleach",
      keyFacts: ["Soul Reapers protect Karakura Town."],
      tonalNotes: ["Stylized supernatural action"],
      source: "mcp" as const,
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
      enrichedIpContext: requestIpContext,
    } as any);

    const res = await app.request("/api/worldgen/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, ipContext: requestIpContext }),
    });

    expect(res.status).toBe(200);
    await res.text();

    expect(mockedResearchKnownIP).not.toHaveBeenCalled();
    expect(mockedGenerateWorldScaffold).toHaveBeenCalledWith(
      expect.objectContaining({ ipContext: requestIpContext }),
      expect.any(Function),
    );
    expect(mockedGenerateWorldScaffold).not.toHaveBeenCalledWith(
      expect.objectContaining({ ipContext: cachedIpContext }),
      expect.any(Function),
    );
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
    mockedLoadIpContext.mockReturnValue(null as any);
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
    expect(mockedComposeSelectedWorldbooks).toHaveBeenCalledWith(worldbookSelection, "A dark world");
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

  function buildDraftBackedNpcEditConvergencePayload() {
    return {
      name: "Marshal Selene Voss",
      persona: "Now leads from the front and trusts the village scouts.",
      tags: ["strategist", "scarred", "field medic"],
      goals: {
        shortTerm: ["Fortify the village", "Brief the scouts"],
        longTerm: ["Keep the refugees alive", "Break the siege"],
      },
      locationName: "Village",
      factionName: "Free Company",
      tier: "supporting" as const,
      // The visible card fields above are the user's latest edits; the nested
      // draft intentionally carries stale pre-edit values from the audited bug.
      draft: {
        identity: {
          role: "npc" as const,
          tier: "key" as const,
          displayName: "Captain Aldric",
          canonicalStatus: "imported" as const,
          baseFacts: {
            biography: "A veteran commander from the old garrison.",
            socialRole: ["Commander"],
            hardConstraints: ["Never abandon the walls"],
          },
          behavioralCore: {
            motives: ["Hold the castle"],
            pressureResponses: ["Digs in under pressure"],
            taboos: ["Leaving civilians behind"],
            attachments: ["The old garrison banner"],
            selfImage: "A stern commander who never bends.",
          },
          liveDynamics: {
            activeGoals: ["Defend the gate"],
            beliefDrift: ["Order must come first"],
            currentStrains: ["Haunted by the last siege"],
            earnedChanges: ["Kept the garrison standing"],
          },
        },
        profile: {
          species: "Human",
          gender: "",
          ageText: "",
          appearance: "",
          backgroundSummary: "A veteran commander from the old garrison.",
          personaSummary: "A stern commander who never bends.",
        },
        socialContext: {
          factionId: null,
          factionName: "Iron Guard",
          homeLocationId: null,
          homeLocationName: null,
          currentLocationId: null,
          currentLocationName: "Castle",
          relationshipRefs: [],
          socialStatus: [],
          originMode: "resident" as const,
        },
        motivations: {
          shortTermGoals: ["Defend the gate"],
          longTermGoals: ["Hold the castle"],
          beliefs: ["Order must come first"],
          drives: ["Hold the castle"],
          frictions: ["Haunted by the last siege"],
        },
        capabilities: {
          traits: ["Veteran"],
          skills: [{ name: "Tactics", tier: "Skilled" as const }],
          flaws: [],
          specialties: [],
          wealthTier: null,
        },
        state: {
          hp: 5,
          conditions: [],
          statusFlags: [],
          activityState: "active",
        },
        loadout: {
          inventorySeed: [],
          equippedItemRefs: [],
          currencyNotes: "",
          signatureItems: [],
        },
        startConditions: {},
        provenance: {
          sourceKind: "import" as const,
          importMode: "outsider" as const,
          templateId: null,
          archetypePrompt: null,
          worldgenOrigin: null,
          legacyTags: ["veteran"],
        },
        grounding: {
          summary: "Imported grounding summary",
          facts: ["Won the siege of Red Vale"],
          abilities: ["Organizes shield lines"],
          constraints: ["Needs supply lines"],
          signatureMoves: ["Shield wall feint"],
          strongPoints: ["Battlefield command"],
          vulnerabilities: ["Overextends to protect civilians"],
          uncertaintyNotes: ["Some canon beats diverge"],
          powerProfile: {
            attack: "Measured",
            speed: "Average",
            durability: "High",
            range: "Short",
            strengths: ["Discipline"],
            constraints: ["Needs formation"],
            vulnerabilities: ["Protective instincts"],
            uncertaintyNotes: ["Imported card contradicts one war journal"],
          },
          sources: [
            {
              kind: "card" as const,
              label: "Import Card",
              excerpt: "Old card excerpt",
            },
          ],
        },
        sourceBundle: {
          canonSources: [
            {
              kind: "canon" as const,
              label: "War Journal",
              excerpt: "Captain Aldric held the walls.",
            },
          ],
          secondarySources: [
            {
              kind: "card" as const,
              label: "Import Card",
              excerpt: "Old card excerpt",
            },
          ],
          synthesis: {
            owner: "worldforge",
            strategy: "worldforge-owned-synthesis",
            notes: ["Preserve canon-facing metadata across edit convergence."],
          },
        },
        continuity: {
          identityInertia: "anchored" as const,
          protectedCore: ["identity.baseFacts", "identity.behavioralCore"],
          mutableSurface: ["identity.liveDynamics"],
          changePressureNotes: ["Only visible shallow card edits should change here."],
        },
      },
    };
  }

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

  it("persists dense location hierarchy and NPC scene placement through save-edits normalization", async () => {
    mockedSaveScaffoldToDb.mockReturnValue(undefined as any);
    mockedMarkGenComplete.mockReturnValue(undefined as any);
    mockedDeleteLore.mockResolvedValue(undefined as any);
    mockedExtractLoreCards.mockResolvedValue([] as any);
    mockedStoreLore.mockResolvedValue(undefined as any);

    const res = await app.request("/api/worldgen/save-edits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        scaffold: {
          ...validScaffold,
          locations: [
            {
              name: "Castle",
              description: "Big castle",
              tags: ["fortified"],
              isStarting: true,
              connectedTo: ["Castle Bailey"],
              kind: "macro",
              parentLocationName: null,
            },
            {
              name: "Castle Bailey",
              description: "The inner yard where scenes actually happen.",
              tags: ["courtyard"],
              isStarting: false,
              connectedTo: ["Castle"],
              kind: "persistent_sublocation",
              parentLocationName: "Castle",
            },
          ],
          npcs: [
            {
              name: "Gate Warden Mira",
              persona: "Keeps watch over the bailey gate.",
              tags: ["warden"],
              goals: {
                shortTerm: ["Secure the gate"],
                longTerm: ["Keep the castle alive"],
              },
              locationName: "Castle",
              sceneLocationName: "Castle Bailey",
              factionName: null,
              tier: "supporting",
            },
            {
              ...buildDraftBackedNpcEditConvergencePayload(),
              locationName: "Castle",
              sceneLocationName: "Castle Bailey",
            },
          ],
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(mockedSaveScaffoldToDb).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.objectContaining({
        locations: [
          expect.objectContaining({
            name: "Castle",
            kind: "macro",
            parentLocationName: null,
            connectedTo: ["Castle Bailey"],
          }),
          expect.objectContaining({
            name: "Castle Bailey",
            kind: "persistent_sublocation",
            parentLocationName: "Castle",
            connectedTo: ["Castle"],
          }),
        ],
        npcs: [
          expect.objectContaining({
            name: "Gate Warden Mira",
            locationName: "Castle",
            sceneLocationName: "Castle Bailey",
          }),
          expect.objectContaining({
            name: "Marshal Selene Voss",
            locationName: "Castle",
            sceneLocationName: "Castle Bailey",
          }),
        ],
      }),
    );
  });

  it("draft-backed NPC edit convergence preserves visible shallow edits across the save/load/world-payload round-trip at the route boundary", async () => {
    mockedSaveScaffoldToDb.mockReturnValue(undefined as any);
    mockedMarkGenComplete.mockReturnValue(undefined as any);
    mockedDeleteLore.mockResolvedValue(undefined as any);
    mockedExtractLoreCards.mockResolvedValue([] as any);
    mockedStoreLore.mockResolvedValue(undefined as any);

    const res = await app.request("/api/worldgen/save-edits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        scaffold: {
          ...validScaffold,
          npcs: [buildDraftBackedNpcEditConvergencePayload()],
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(mockedSaveScaffoldToDb).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.objectContaining({
        npcs: [
          expect.objectContaining({
            name: "Marshal Selene Voss",
            persona: "Now leads from the front and trusts the village scouts.",
            tags: ["strategist", "scarred", "field medic"],
            goals: {
              shortTerm: ["Fortify the village", "Brief the scouts"],
              longTerm: ["Keep the refugees alive", "Break the siege"],
            },
            locationName: "Village",
            factionName: "Free Company",
            tier: "supporting",
            draft: expect.objectContaining({
              identity: expect.objectContaining({
                displayName: "Marshal Selene Voss",
                tier: "supporting",
              }),
              profile: expect.objectContaining({
                personaSummary: "Now leads from the front and trusts the village scouts.",
              }),
              socialContext: expect.objectContaining({
                currentLocationName: "Village",
                factionName: "Free Company",
              }),
              motivations: expect.objectContaining({
                shortTermGoals: ["Fortify the village", "Brief the scouts"],
                longTermGoals: ["Keep the refugees alive", "Break the siege"],
              }),
            }),
          }),
        ],
      }),
    );
  });

  it("normalizes draft-backed supporting NPC payloads without tier regression", async () => {
    mockedSaveScaffoldToDb.mockReturnValue(undefined as any);
    mockedMarkGenComplete.mockReturnValue(undefined as any);
    mockedDeleteLore.mockResolvedValue(undefined as any);
    mockedExtractLoreCards.mockResolvedValue([] as any);
    mockedStoreLore.mockResolvedValue(undefined as any);

    const res = await app.request("/api/worldgen/save-edits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        scaffold: {
          ...validScaffold,
          npcs: [
            {
              draft: {
                identity: {
                  role: "npc",
                  tier: "supporting",
                  displayName: "Quartermaster Hale",
                  canonicalStatus: "original",
                },
                profile: {
                  species: "",
                  gender: "",
                  ageText: "",
                  appearance: "",
                  backgroundSummary: "",
                  personaSummary: "Keeps the stores ledger balanced.",
                },
                socialContext: {
                  factionId: null,
                  factionName: "Castle Guard",
                  homeLocationId: null,
                  homeLocationName: null,
                  currentLocationId: null,
                  currentLocationName: "Castle",
                  relationshipRefs: [],
                  socialStatus: [],
                  originMode: "resident",
                },
                motivations: {
                  shortTermGoals: ["Count the rations"],
                  longTermGoals: ["Keep the garrison supplied"],
                  beliefs: [],
                  drives: [],
                  frictions: [],
                },
                capabilities: {
                  traits: [],
                  skills: [],
                  flaws: [],
                  specialties: [],
                  wealthTier: null,
                },
                state: {
                  hp: 5,
                  conditions: [],
                  statusFlags: [],
                  activityState: "active",
                },
                loadout: {
                  inventorySeed: [],
                  equippedItemRefs: [],
                  currencyNotes: "",
                  signatureItems: [],
                },
                startConditions: {},
                provenance: {
                  sourceKind: "worldgen",
                  importMode: null,
                  templateId: null,
                  archetypePrompt: null,
                  worldgenOrigin: null,
                  legacyTags: [],
                },
              },
              locationName: "Castle",
              factionName: "Castle Guard",
              tier: "supporting",
            },
          ],
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(mockedSaveScaffoldToDb).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.objectContaining({
        npcs: [
          expect.objectContaining({
            name: "Quartermaster Hale",
            tier: "supporting",
            draft: expect.objectContaining({
              identity: expect.objectContaining({
                tier: "supporting",
              }),
            }),
          }),
        ],
      }),
    );
  });

  it("re-extracts lore from the same normalized scaffold shape that gets persisted", async () => {
    mockedSaveScaffoldToDb.mockReturnValue(undefined as any);
    mockedMarkGenComplete.mockReturnValue(undefined as any);
    mockedDeleteLore.mockResolvedValue(undefined as any);
    mockedExtractLoreCards.mockResolvedValue([
      {
        term: "Quartermaster Hale",
        definition: "Keeps the castle stores running.",
        category: "npc",
      },
    ] as any);
    mockedStoreLore.mockResolvedValue(undefined as any);

    const res = await app.request("/api/worldgen/save-edits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        scaffold: {
          ...validScaffold,
          npcs: [
            {
              draft: {
                identity: {
                  role: "npc",
                  tier: "supporting",
                  displayName: "Quartermaster Hale",
                  canonicalStatus: "original",
                },
                profile: {
                  species: "",
                  gender: "",
                  ageText: "",
                  appearance: "",
                  backgroundSummary: "",
                  personaSummary: "Keeps the stores ledger balanced.",
                },
                socialContext: {
                  factionId: null,
                  factionName: "Castle Guard",
                  homeLocationId: null,
                  homeLocationName: null,
                  currentLocationId: null,
                  currentLocationName: "Castle",
                  relationshipRefs: [],
                  socialStatus: [],
                  originMode: "resident",
                },
                motivations: {
                  shortTermGoals: ["Count the rations"],
                  longTermGoals: ["Keep the garrison supplied"],
                  beliefs: [],
                  drives: [],
                  frictions: [],
                },
                capabilities: {
                  traits: [],
                  skills: [],
                  flaws: [],
                  specialties: [],
                  wealthTier: null,
                },
                state: {
                  hp: 5,
                  conditions: [],
                  statusFlags: [],
                  activityState: "active",
                },
                loadout: {
                  inventorySeed: [],
                  equippedItemRefs: [],
                  currencyNotes: "",
                  signatureItems: [],
                },
                startConditions: {},
                provenance: {
                  sourceKind: "worldgen",
                  importMode: null,
                  templateId: null,
                  archetypePrompt: null,
                  worldgenOrigin: null,
                  legacyTags: [],
                },
              },
              locationName: "Castle",
              factionName: "Castle Guard",
              tier: "supporting",
            },
          ],
        },
      }),
    });

    expect(res.status).toBe(200);
    const normalizedScaffold = mockedSaveScaffoldToDb.mock.calls.at(-1)?.[1];
    expect(normalizedScaffold).toBeDefined();
    expect(mockedExtractLoreCards).toHaveBeenCalledWith(
      expect.objectContaining({
        npcs: [
          expect.objectContaining({
            name: "Quartermaster Hale",
            tier: "supporting",
            draft: expect.objectContaining({
              identity: expect.objectContaining({
                tier: "supporting",
              }),
            }),
          }),
        ],
      }),
      fakeResolvedRole,
      {
        ipContext: null,
        premiseDivergence: null,
        researchArtifact: null,
      },
    );
    expect(mockedExtractLoreCards.mock.calls.at(-1)?.[0]).toBe(normalizedScaffold);
  });

  it("passes stored v2 artifact context into lore re-extraction without legacy context", async () => {
    const artifact = cloneJjkNarutoArtifact();
    const cachedIpContext = {
      franchise: "Naruto and Jujutsu Kaisen",
      keyFacts: ["Hidden Cloud Village remains cached from legacy data."],
      tonalNotes: ["mixed canon"],
      source: "mcp" as const,
    };
    const cachedPremiseDivergence = {
      mode: "coexisting",
      protagonistRole: {
        kind: "custom",
        interpretation: "coexisting",
        canonicalCharacterName: null,
        roleSummary: "Legacy cached divergence.",
      },
      preservedCanonFacts: ["Legacy Naruto political context is cached."],
      changedCanonFacts: [],
      currentStateDirectives: [],
      ambiguityNotes: [],
    };

    mockedLoadWorldgenResearchArtifact.mockReturnValue(artifact as any);
    mockedLoadIpContext.mockReturnValue(cachedIpContext as any);
    mockedLoadPremiseDivergence.mockReturnValue(cachedPremiseDivergence as any);
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
    expect(mockedLoadWorldgenResearchArtifact).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(mockedLoadIpContext).not.toHaveBeenCalled();
    expect(mockedLoadPremiseDivergence).not.toHaveBeenCalled();
    expect(mockedExtractLoreCards).toHaveBeenCalledWith(
      expect.anything(),
      fakeResolvedRole,
      {
        ipContext: null,
        premiseDivergence: null,
        researchArtifact: artifact,
      },
    );
  });

  it("passes legacy context into lore re-extraction when no artifact exists", async () => {
    const cachedIpContext = {
      franchise: "Voices of the Void",
      keyFacts: ["The signal base sits in a remote valley."],
      tonalNotes: ["lonely"],
      source: "mcp" as const,
    };
    const cachedPremiseDivergence = {
      mode: "diverged",
      protagonistRole: {
        kind: "custom",
        interpretation: "replacement",
        canonicalCharacterName: "Dr. Kel",
        roleSummary: "The player replaces Dr. Kel.",
      },
      preservedCanonFacts: ["The signal base remains active."],
      changedCanonFacts: ["Dr. Kel is absent."],
      currentStateDirectives: [],
      ambiguityNotes: [],
    };

    mockedLoadWorldgenResearchArtifact.mockReturnValue(null as any);
    mockedLoadIpContext.mockReturnValue(cachedIpContext as any);
    mockedLoadPremiseDivergence.mockReturnValue(cachedPremiseDivergence as any);
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
    expect(mockedLoadWorldgenResearchArtifact).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(mockedLoadIpContext).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(mockedLoadPremiseDivergence).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(mockedExtractLoreCards).toHaveBeenCalledWith(
      expect.anything(),
      fakeResolvedRole,
      {
        ipContext: cachedIpContext,
        premiseDivergence: cachedPremiseDivergence,
        researchArtifact: null,
      },
    );
  });

  it("materializes supporting draft state for legacy supporting save-edits NPC payloads", async () => {
    mockedSaveScaffoldToDb.mockReturnValue(undefined as any);
    mockedMarkGenComplete.mockReturnValue(undefined as any);
    mockedDeleteLore.mockResolvedValue(undefined as any);
    mockedExtractLoreCards.mockResolvedValue([] as any);
    mockedStoreLore.mockResolvedValue(undefined as any);

    const res = await app.request("/api/worldgen/save-edits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        scaffold: {
          ...validScaffold,
          npcs: [
            {
              name: "Wall Runner Nessa",
              persona: "Scales the walls faster than the watch can shout.",
              tags: ["swift"],
              goals: { shortTerm: ["Carry the alert"], longTerm: ["Protect the outer wards"] },
              locationName: "Castle",
              factionName: null,
              tier: "supporting",
            },
          ],
        },
      }),
    });

    expect(res.status).toBe(200);
    expect(mockedSaveScaffoldToDb).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.objectContaining({
        npcs: [
          expect.objectContaining({
            name: "Wall Runner Nessa",
            tier: "supporting",
            draft: expect.objectContaining({
              identity: expect.objectContaining({
                tier: "supporting",
              }),
            }),
          }),
        ],
      }),
    );
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
      null,
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

  it("skips targeted research sufficiency for premise regeneration and keeps the cached ipContext lane untouched", async () => {
    const cachedIpContext = {
      franchise: "Naruto",
      keyFacts: ["Konohagakure is a hidden village."],
      tonalNotes: ["Shonen action"],
      source: "mcp" as const,
    };

    mockedLoadIpContext.mockReturnValue(cachedIpContext as any);
    mockedGenerateRefinedPremise.mockResolvedValue("New refined premise" as any);

    const res = await app.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, section: "premise" }),
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ refinedPremise: "New refined premise" });
    expect(mockedEvaluateResearchSufficiency).not.toHaveBeenCalled();
    expect(mockedSaveIpContext).not.toHaveBeenCalled();
    expect(mockedGenerateRefinedPremise).toHaveBeenCalledWith(
      expect.anything(),
      cachedIpContext,
      undefined,
    );
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

  it("loads cached v2 research artifact for section regeneration and passes it through request context", async () => {
    const artifact = cloneJjkNarutoArtifact();
    const locs = [{ name: "Tokyo Jujutsu High", description: "School", tags: [], isStarting: false, connectedTo: [] }];

    mockedLoadWorldgenResearchArtifact.mockReturnValue(artifact as any);
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
    expect(await res.json()).toEqual({ locations: locs });
    expect(mockedLoadWorldgenResearchArtifact).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(mockedResearchKnownIP).not.toHaveBeenCalled();
    expect(mockedEvaluateResearchSufficiency).not.toHaveBeenCalled();
    expect(mockedGenerateLocations).toHaveBeenCalledWith(
      expect.objectContaining({ researchArtifact: artifact }),
      "A dark world",
      null,
      undefined,
    );
  });

  it("uses a stored v2 artifact as the only research lane when regenerating with legacy context cached", async () => {
    const artifact = cloneJjkNarutoArtifact();
    const cachedIpContext = {
      franchise: "Naruto and Jujutsu Kaisen",
      keyFacts: ["Hidden Mist Village remains cached from a legacy generated world."],
      tonalNotes: ["mixed canon"],
      source: "mcp" as const,
    };
    const cachedPremiseDivergence = {
      mode: "coexisting",
      protagonistRole: {
        kind: "custom",
        interpretation: "coexisting",
        canonicalCharacterName: null,
        roleSummary: "Legacy cached divergence from the old mixed-canon lane.",
      },
      preservedCanonFacts: ["Legacy Naruto villages remain cached."],
      changedCanonFacts: [],
      currentStateDirectives: ["Use the legacy mixed context."],
      ambiguityNotes: [],
    };
    const locs = [{ name: "Tokyo Jujutsu High", description: "School", tags: [], isStarting: false, connectedTo: [] }];

    mockedLoadWorldgenResearchArtifact.mockReturnValue(artifact as any);
    mockedLoadIpContext.mockReturnValue(cachedIpContext as any);
    mockedLoadPremiseDivergence.mockReturnValue(cachedPremiseDivergence as any);
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
    expect(await res.json()).toEqual({ locations: locs });
    expect(mockedLoadWorldgenResearchArtifact).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(mockedLoadIpContext).not.toHaveBeenCalled();
    expect(mockedLoadPremiseDivergence).not.toHaveBeenCalled();
    expect(mockedInterpretPremiseDivergence).not.toHaveBeenCalled();
    expect(mockedEvaluateResearchSufficiency).not.toHaveBeenCalled();
    expect(mockedGenerateLocations).toHaveBeenCalledWith(
      expect.objectContaining({
        premiseDivergence: null,
        researchFrame: null,
        researchArtifact: artifact,
      }),
      "A dark world",
      null,
      undefined,
    );
  });

  it("uses v2 artifact sufficiency for section regeneration and saves enriched artifact back", async () => {
    const artifact = cloneJjkNarutoArtifact();
    const enrichedArtifact = makeArtifactWith((draft) => {
      draft.generatedContext.keyFacts.push("Kyoto Jujutsu High provides a second sorcerer-institution anchor.");
    });
    const locs = [{ name: "Kyoto Jujutsu High", description: "School", tags: [], isStarting: false, connectedTo: [] }];

    mockedLoadWorldgenResearchArtifact.mockReturnValue(artifact as any);
    mockedEvaluateResearchArtifactSufficiency.mockResolvedValue(enrichedArtifact as any);
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
    expect(await res.json()).toEqual({ locations: locs });
    expect(mockedEvaluateResearchSufficiency).not.toHaveBeenCalled();
    expect(mockedEvaluateResearchArtifactSufficiency).toHaveBeenCalledWith(
      artifact,
      "locations",
      "A dark world",
      fakeResolvedRole,
      {
        provider: "brave",
        braveApiKey: undefined,
        zaiApiKey: undefined,
        llmProvider: fakeResolvedRole.provider,
      },
    );
    expect(mockedSaveWorldgenResearchArtifact).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      enrichedArtifact,
    );
    expect(mockedGenerateLocations).toHaveBeenCalledWith(
      expect.objectContaining({ researchArtifact: enrichedArtifact }),
      "A dark world",
      null,
      undefined,
    );
  });

  it("keeps v2 artifact enrichment idempotent across save, reload, and enrich-again", async () => {
    const initialArtifact = cloneJjkNarutoArtifact();
    const newFact = "Kyoto Jujutsu High provides a second sorcerer-institution anchor.";
    let storedArtifact = initialArtifact;
    const locs = [{ name: "Kyoto Jujutsu High", description: "School", tags: [], isStarting: false, connectedTo: [] }];

    mockedLoadWorldgenResearchArtifact.mockImplementation(() => storedArtifact as any);
    mockedSaveWorldgenResearchArtifact.mockImplementation((_, artifact) => {
      storedArtifact = artifact as typeof initialArtifact;
    });
    mockedEvaluateResearchArtifactSufficiency.mockImplementation(async (artifact: any) => {
      if (artifact.generatedContext.keyFacts.includes(newFact)) {
        return artifact;
      }
      return {
        ...artifact,
        generatedContext: {
          ...artifact.generatedContext,
          keyFacts: [...artifact.generatedContext.keyFacts, newFact],
        },
      };
    });
    mockedGenerateLocations.mockResolvedValue(locs as any);

    for (let i = 0; i < 2; i++) {
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
      await res.json();
    }

    expect(storedArtifact.generatedContext.keyFacts.filter((fact) => fact === newFact)).toHaveLength(1);
    expect(mockedSaveWorldgenResearchArtifact).toHaveBeenCalledTimes(1);
    expect(mockedEvaluateResearchSufficiency).not.toHaveBeenCalled();
  });

  it("reuses cached ipContext before on-demand research and saves targeted regenerate enrichment back through the same lane", async () => {
    const cachedIpContext = {
      franchise: "Naruto",
      keyFacts: ["Konohagakure is a hidden village."],
      tonalNotes: ["Shonen action"],
      source: "mcp" as const,
    };
    const enrichedIpContext = {
      ...cachedIpContext,
      keyFacts: [...cachedIpContext.keyFacts, "Sunagakure is a major allied hidden village."],
    };
    const locs = [{ name: "Forest", description: "Dense", tags: [], isStarting: false, connectedTo: [] }];

    mockedLoadIpContext.mockReturnValue(cachedIpContext as any);
    mockedEvaluateResearchSufficiency.mockResolvedValue(enrichedIpContext as any);
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
    expect(await res.json()).toEqual({ locations: locs });
    expect(mockedResearchKnownIP).not.toHaveBeenCalled();
    expect(mockedEvaluateResearchSufficiency).toHaveBeenCalledWith(
      cachedIpContext,
      "locations",
      "A dark world",
      fakeResolvedRole,
      {
        provider: "brave",
        braveApiKey: undefined,
        zaiApiKey: undefined,
        llmProvider: fakeResolvedRole.provider,
      },
      expect.objectContaining({
        franchise: "Naruto",
        divergenceMode: "diverged",
      }),
    );
    expect(mockedGenerateLocations).toHaveBeenCalledWith(
      expect.anything(),
      "A dark world",
      enrichedIpContext,
      undefined,
    );
    expect(mockedSaveIpContext).toHaveBeenCalledWith(CAMPAIGN_ID, enrichedIpContext);
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

  // Route-wiring transparency check only. Does NOT prove P64-R5 runtime behavior.
  // P64-R5 is proven by the real-step integration test below, which mocks only
  // the safeGenerateObject seam and runs the real generateNpcsStep implementation.
  it("calls generateNpcsStep for section=npcs (route-wiring only)", async () => {
    const npcs = [{ name: "Guard", persona: "Loyal", tags: [], goals: { shortTerm: [], longTerm: [] }, locationName: "Castle", sceneLocationName: "Castle Throne Room", factionName: null }];
    mockedGenerateNpcs.mockResolvedValue(npcs as any);
    const locations = [
      { name: "Castle", description: "Fortress", tags: [], isStarting: true, connectedTo: ["Castle Throne Room"], kind: "macro", parentLocationName: null },
      { name: "Castle Throne Room", description: "Audience chamber", tags: [], isStarting: false, connectedTo: ["Castle"], kind: "persistent_sublocation", parentLocationName: "Castle" },
    ];

    const res = await app.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        section: "npcs",
        refinedPremise: "A dark world",
        locationNames: ["Castle", "Castle Throne Room"],
        locations,
        factionNames: ["Rebels"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ npcs });
    expect(mockedGenerateNpcs).toHaveBeenCalled();
    const args = mockedGenerateNpcs.mock.calls[0];
    expect(args?.[0]).toEqual(
      expect.objectContaining({
        research: fakeSettings.research,
      }),
    );
    expect(args?.[1]).toBe("A dark world");
    expect(args?.[2]).toEqual(locations);
    expect(args?.[3]).toEqual(["Rebels"]);
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

describe("/api/worldgen/regenerate-section section=npcs — real step integration (P64-R5)", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../worldgen/index.js");
    vi.doUnmock("../../ai/generate-object-safe.js");
    vi.doUnmock("../../character/ingestion/assess-original.js");
  });

  it("returns a full nested personality pack when the route runs the real generateNpcsStep with only the LLM seam mocked", async () => {
    vi.resetModules();
    vi.doUnmock("../../worldgen/index.js");
    vi.doMock("../../ai/generate-object-safe.js", () => ({
      safeGenerateObject: vi.fn(),
    }));
    vi.doMock("../../character/ingestion/assess-original.js", async () => {
      const actual = await vi.importActual<any>(
        "../../character/ingestion/assess-original.js",
      );
      return {
        ...actual,
        assessOriginalCharacterPowerStats: vi.fn(async ({ draft }: any) => ({
          ...draft,
          powerStats: {
            attackPotency: { tier: "Wall", rank: 4 },
            speed: { tier: "Street", rank: 4 },
            durability: { tier: "Wall", rank: 4 },
            intelligence: { tier: "Gifted", rank: 5 },
            hax: [],
            vulnerabilities: [],
          },
        })),
      };
    });

    const settingsModule = await import("../../settings/index.js");
    const aiModule = await import("../../ai/index.js");
    const campaignModule = await import("../../campaign/index.js");
    const generateObjectModule = await import("../../ai/generate-object-safe.js");

    vi.mocked(settingsModule.loadSettings).mockReturnValue(fakeSettings);
    vi.mocked(aiModule.resolveRoleModel).mockReturnValue(fakeResolvedRole as any);
    vi.mocked(aiModule.createModel).mockReturnValue({ id: "mock-model" } as any);
    vi.mocked(campaignModule.getActiveCampaign).mockReturnValue({
      id: CAMPAIGN_ID,
      name: "Test Campaign",
      premise: "A dark world",
      seeds: { geography: "Mountains" },
      createdAt: "2026-01-01",
    } as any);
    vi.mocked(campaignModule.loadCampaign).mockResolvedValue({
      id: CAMPAIGN_ID,
      name: "Test Campaign",
      premise: "A dark world",
      seeds: { geography: "Mountains" },
      createdAt: "2026-01-01",
    } as any);
    vi.mocked(campaignModule.readCampaignConfig).mockReturnValue({} as any);
    vi.mocked(campaignModule.loadIpContext).mockReturnValue(null);
    vi.mocked(campaignModule.loadPremiseDivergence).mockReturnValue(null);
    vi.mocked(campaignModule.loadWorldgenResearchFrame).mockReturnValue(null);

    const mockedSafeGenerateObject = vi.mocked(generateObjectModule.safeGenerateObject);
    mockedSafeGenerateObject
      .mockResolvedValueOnce({
        object: {
          npcs: [
            {
              name: "Guard",
              role: "Gate warden",
              locationName: "Castle",
              factionName: null,
            },
          ],
        },
      } as any)
      .mockResolvedValueOnce({
        object: { npcs: [] },
      } as any)
      .mockResolvedValueOnce({
        object: {
          persona: "A stoic gate warden who has served the Castle for twenty years.",
          selfImage: "The last man who still keeps his post.",
          socialRoles: ["Gate Warden"],
          tags: ["Disciplined", "Watchful", "Loyal"],
          goals: {
            shortTerm: ["Hold the gate through the night"],
            longTerm: ["Retire with honor intact"],
          },
          personalitySummary: "Stoic guard with a private grudge against his captain",
          personalityVoice: "Terse, repeats the rulebook to himself under his breath",
          personalityDecisionStyle: "Defers to protocol unless protocol fails him",
          personalityWorldview: "Order is the only thing standing between people and ruin",
          personalityContradictions: [
            "Believes loyalty is absolute, but secretly resents his captain for three long years.",
          ],
          personalityMythology: "The last man who kept his post when the others fled",
          personalitySampleLines: [
            "Stand down. I will not ask again.",
            "Protocol says you leave through the west gate. Use it.",
          ],
        },
      } as any);

    const { default: worldgenRoutesReal } = await import("../worldgen.js");
    const realApp = new Hono();
    realApp.route("/api/worldgen", worldgenRoutesReal);

    const res = await realApp.request("/api/worldgen/regenerate-section", {
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
    expect(mockedSafeGenerateObject).toHaveBeenCalledTimes(3);

    const body = await res.json();
    expect(body.npcs).toHaveLength(1);
    expect(body.npcs[0].draft).toBeDefined();

    const personality = body.npcs[0].draft.identity.personality;
    expect(personality.summary).toBe("Stoic guard with a private grudge against his captain");
    expect(personality.voice).toBe(
      "Terse, repeats the rulebook to himself under his breath",
    );
    expect(personality.decisionStyle).toBe(
      "Defers to protocol unless protocol fails him",
    );
    expect(personality.worldview).toBe(
      "Order is the only thing standing between people and ruin",
    );
    expect(personality.internalContradictions).toEqual([
      "Believes loyalty is absolute, but secretly resents his captain for three long years.",
    ]);
    expect(personality.personalMythology).toBe(
      "The last man who kept his post when the others fled",
    );
    expect(personality.sampleLines).toEqual([
      "Stand down. I will not ask again.",
      "Protocol says you leave through the west gate. Use it.",
    ]);
  });
});

describe("/api/worldgen/regenerate-section section=npcs — Phase 65 PowerStats enrichment (P65-R5)", () => {
  const knownIpContext = {
    franchise: "Naruto",
    keyFacts: ["Konohagakure is a hidden village."],
    tonalNotes: ["Shonen action"],
    source: "mcp" as const,
  };

  function makePowerStats(anchor: string) {
    return {
      attackPotency: { tier: "Wall", rank: 5 },
      speed: { tier: "Street", rank: 4 },
      durability: { tier: "Wall", rank: 5 },
      intelligence: { tier: "Gifted", rank: 6 },
      hax: [],
      vulnerabilities: [
        {
          description: `${anchor} loses their edge when isolated from allied support.`,
          severity: "major" as const,
        },
      ],
    };
  }

  function makeNpcDetail(persona: string) {
    return {
      persona,
      selfImage: "Keeps the line steady when everyone else is wavering.",
      socialRoles: ["Gate Watch"],
      tags: ["Disciplined", "Watchful", "Loyal"],
      goals: {
        shortTerm: ["Hold the gate through the night"],
        longTerm: ["Retire with honor intact"],
      },
      personalitySummary:
        "A practical defender who treats panic as a luxury nobody can afford.",
      personalityVoice:
        "Short commands, dry humor, and measured pauses before bad news.",
      personalityDecisionStyle:
        "Locks down the risk first, then solves the second-order mess.",
      personalityWorldview:
        "Order is the thin line between frightened people and collapse.",
      personalityContradictions: [
        "Preaches discipline, but bends the rules whenever rookies are at risk.",
      ],
      personalityMythology:
        "If they keep the watch steady, the city still deserves dawn.",
      personalitySampleLines: [
        "Hold formation. Panic is louder than the breach.",
        "You can argue after sunrise. Tonight you follow the signal fire.",
      ],
    };
  }

  async function setupRealRegenerateRoute(opts: {
    ipContext: typeof knownIpContext | null;
    researchEnabled: boolean;
    mockKnownIp?: boolean;
    mockOriginal?: boolean;
  }) {
    vi.resetModules();
    vi.doUnmock("../../worldgen/index.js");
    vi.doMock("../../ai/generate-object-safe.js", () => ({
      safeGenerateObject: vi.fn(),
    }));

    if (opts.mockKnownIp) {
      vi.doMock("../../character/known-ip-worldgen-research.js", async () => {
        const actual = await vi.importActual<any>(
          "../../character/known-ip-worldgen-research.js",
        );
        return {
          ...actual,
          enrichKnownIpWorldgenNpcDraft: vi.fn(),
        };
      });
    }

    if (opts.mockOriginal) {
      vi.doMock("../../character/ingestion/assess-original.js", async () => {
        const actual = await vi.importActual<any>(
          "../../character/ingestion/assess-original.js",
        );
        return {
          ...actual,
          assessOriginalCharacterPowerStats: vi.fn(),
        };
      });
    }

    const settingsModule = await import("../../settings/index.js");
    const aiModule = await import("../../ai/index.js");
    const campaignModule = await import("../../campaign/index.js");
    const ipResearcherModule = await import("../../worldgen/ip-researcher.js");
    const generateObjectModule = await import(
      "../../ai/generate-object-safe.js"
    );
    const libModule = await import("../../lib/index.js");
    const knownIpModule = opts.mockKnownIp
      ? await import("../../character/known-ip-worldgen-research.js")
      : null;
    const originalModule = opts.mockOriginal
      ? await import("../../character/ingestion/assess-original.js")
      : null;

    vi.mocked(settingsModule.loadSettings).mockReturnValue({
      ...fakeSettings,
      research: {
        ...fakeSettings.research,
        enabled: opts.researchEnabled,
      },
    } as any);
    vi.mocked(aiModule.resolveRoleModel).mockReturnValue(fakeResolvedRole as any);
    vi.mocked(aiModule.createModel).mockReturnValue({ id: "mock-model" } as any);
    vi.mocked(campaignModule.getActiveCampaign).mockReturnValue({
      id: CAMPAIGN_ID,
      name: "Test Campaign",
      premise: "A dark world",
      seeds: { geography: "Mountains" },
      createdAt: "2026-01-01",
    } as any);
    vi.mocked(campaignModule.loadCampaign).mockResolvedValue({
      id: CAMPAIGN_ID,
      name: "Test Campaign",
      premise: "A dark world",
      seeds: { geography: "Mountains" },
      createdAt: "2026-01-01",
    } as any);
    vi.mocked(campaignModule.readCampaignConfig).mockReturnValue({} as any);
    vi.mocked(campaignModule.loadIpContext).mockReturnValue(opts.ipContext);
    vi.mocked(campaignModule.loadPremiseDivergence).mockReturnValue(
      opts.ipContext
        ? {
            mode: "canonical",
            protagonistRole: {
              kind: "canonical",
              interpretation: "canonical",
              canonicalCharacterName: null,
              roleSummary: "No protagonist divergence is cached for this test.",
            },
            preservedCanonFacts: [],
            changedCanonFacts: [],
            currentStateDirectives: [],
            ambiguityNotes: [],
          }
        : null,
    );
    vi.mocked(campaignModule.loadWorldgenResearchFrame).mockReturnValue(null);
    vi.mocked(ipResearcherModule.evaluateResearchSufficiency).mockResolvedValue(
      opts.ipContext as any,
    );
    vi.mocked(libModule.getErrorMessage).mockImplementation(
      (error: unknown, fallback?: string) =>
        error instanceof Error ? error.message : (fallback ?? "Unknown error"),
    );

    const { default: worldgenRoutesReal } = await import("../worldgen.js");
    const realApp = new Hono();
    realApp.route("/api/worldgen", worldgenRoutesReal);

    return {
      realApp,
      mockedSafeGenerateObject: vi.mocked(generateObjectModule.safeGenerateObject),
      mockedKnownIpEnrichment:
        knownIpModule &&
        vi.mocked(knownIpModule.enrichKnownIpWorldgenNpcDraft),
      mockedOriginalAssessment:
        originalModule &&
        vi.mocked(originalModule.assessOriginalCharacterPowerStats),
    };
  }

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("../../worldgen/index.js");
    vi.doUnmock("../../ai/generate-object-safe.js");
    vi.doUnmock("../../character/known-ip-worldgen-research.js");
    vi.doUnmock("../../character/ingestion/assess-original.js");
  });

  it("enriches power stats for both known-IP tiers through the real HTTP route when research.enabled=true", async () => {
    const { realApp, mockedSafeGenerateObject, mockedKnownIpEnrichment } =
      await setupRealRegenerateRoute({
        ipContext: knownIpContext,
        researchEnabled: true,
        mockKnownIp: true,
      });

    mockedSafeGenerateObject
      .mockResolvedValueOnce({
        object: {
          npcs: [
            {
              name: "Guard Captain Ryo",
              role: "Village gate captain",
              locationName: "Castle",
              factionName: "Rebels",
            },
          ],
        },
      } as any)
      .mockResolvedValueOnce({
        object: {
          npcs: [
            {
              name: "Quartermaster Mina",
              role: "Supply runner",
              locationName: "Castle",
              factionName: null,
            },
          ],
        },
      } as any)
      .mockResolvedValueOnce({
        object: makeNpcDetail(
          "A battle-tested captain who reads a crowd faster than a map.",
        ),
      } as any)
      .mockResolvedValueOnce({
        object: makeNpcDetail(
          "A wiry quartermaster who can turn scarcity into routine.",
        ),
      } as any);

    mockedKnownIpEnrichment?.mockImplementation(async ({ draft }: any) => ({
      ...draft,
      powerStats: makePowerStats(draft.identity.displayName),
    }));

    const res = await realApp.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        section: "npcs",
        refinedPremise: "A hidden village under siege.",
        locationNames: ["Castle"],
        factionNames: ["Rebels"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.npcs).toHaveLength(2);
    expect(body.npcs[0].tier).toBe("key");
    expect(body.npcs[1].tier).toBe("supporting");
    expect(body.npcs[0].draft?.powerStats).not.toBeNull();
    expect(body.npcs[1].draft?.powerStats).not.toBeNull();
    expect(body.npcs[0].draft.powerStats.vulnerabilities[0].description).toContain(
      "Guard Captain Ryo",
    );
    expect(body.npcs[1].draft.powerStats.vulnerabilities[0].description).toContain(
      "Quartermaster Mina",
    );
    expect(mockedKnownIpEnrichment).toHaveBeenCalledTimes(2);
  });

  it("enriches power stats for both original-world tiers through the real HTTP route", async () => {
    const { realApp, mockedSafeGenerateObject, mockedOriginalAssessment } =
      await setupRealRegenerateRoute({
        ipContext: null,
        researchEnabled: false,
        mockOriginal: true,
      });

    mockedSafeGenerateObject
      .mockResolvedValueOnce({
        object: {
          npcs: [
            {
              name: "Marshal Thorn",
              role: "Frontline commander",
              locationName: "Castle",
              factionName: "Rebels",
            },
          ],
        },
      } as any)
      .mockResolvedValueOnce({
        object: {
          npcs: [
            {
              name: "Lantern Vey",
              role: "Signal courier",
              locationName: "Castle",
              factionName: null,
            },
          ],
        },
      } as any)
      .mockResolvedValueOnce({
        object: makeNpcDetail(
          "A scarred commander who turns every retreat into a new line of defense.",
        ),
      } as any)
      .mockResolvedValueOnce({
        object: makeNpcDetail(
          "A courier who remembers every alley and every lie told in it.",
        ),
      } as any);

    mockedOriginalAssessment?.mockImplementation(async ({ draft }: any) => ({
      ...draft,
      powerStats: makePowerStats(draft.identity.displayName),
    }));

    const res = await realApp.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        section: "npcs",
        refinedPremise: "A besieged city-state where every watchfire matters.",
        locationNames: ["Castle"],
        factionNames: ["Rebels"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.npcs).toHaveLength(2);
    expect(body.npcs[0].tier).toBe("key");
    expect(body.npcs[1].tier).toBe("supporting");
    expect(body.npcs[0].draft?.powerStats).not.toBeNull();
    expect(body.npcs[1].draft?.powerStats).not.toBeNull();
    expect(body.npcs[0].draft.powerStats.vulnerabilities[0].description).toContain(
      "Marshal Thorn",
    );
    expect(body.npcs[1].draft.powerStats.vulnerabilities[0].description).toContain(
      "Lantern Vey",
    );
    expect(mockedOriginalAssessment).toHaveBeenCalledTimes(2);
  });

  it("fails closed at the HTTP boundary when original-world power assessment exhausts", async () => {
    const { realApp, mockedSafeGenerateObject, mockedOriginalAssessment } =
      await setupRealRegenerateRoute({
        ipContext: null,
        researchEnabled: false,
        mockOriginal: true,
      });

    mockedSafeGenerateObject
      .mockResolvedValueOnce({
        object: {
          npcs: [
            {
              name: "Thornwatch Jalen",
              role: "Wall sentry",
              locationName: "Castle",
              factionName: null,
            },
          ],
        },
      } as any)
      .mockResolvedValueOnce({
        object: { npcs: [] },
      } as any)
      .mockResolvedValueOnce({
        object: makeNpcDetail(
          "A sleepless sentry who treats silence like an incoming attack.",
        ),
      } as any);

    mockedOriginalAssessment?.mockRejectedValue(
      new IngestionPipelineError({
        stage: "power_assess",
        attempts: 3,
        cause: new Error("assessment seam exploded"),
        message:
          'Ingestion stage "power_assess" failed after 3 attempts: assessment seam exploded',
      }),
    );

    const res = await realApp.request("/api/worldgen/regenerate-section", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        section: "npcs",
        refinedPremise: "A quiet wall before the signal horns start.",
        locationNames: ["Castle"],
        factionNames: [],
      }),
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Ingestion stage "power_assess" failed after 3 attempts');
    expect(body).not.toHaveProperty("npcs");
  });
});
