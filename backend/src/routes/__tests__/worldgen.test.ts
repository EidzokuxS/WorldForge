import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

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
}));

vi.mock("../../worldgen/worldbook-importer.js", () => ({
  WORLDBOOK_ENTRY_TYPES: ["character", "location", "faction", "bestiary", "lore_general"],
  parseWorldBook: vi.fn(),
  classifyEntries: vi.fn(),
}));

vi.mock("../../worldbook-library/index.js", () => ({
  listWorldbookLibrary: vi.fn(),
  importWorldbookToLibrary: vi.fn(),
  composeSelectedWorldbooks: vi.fn(),
}));

vi.mock("../../worldgen/ip-researcher.js", () => ({
  researchWorldgenArtifact: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("../../campaign/index.js", () => ({
  getActiveCampaign: vi.fn(),
  loadCampaign: vi.fn(),
}));

vi.mock("../../settings/index.js", () => ({
  loadSettings: vi.fn(),
}));

vi.mock("../../ai/index.js", () => ({
  resolveRoleModel: vi.fn(),
}));

vi.mock("../../lib/index.js", () => ({
  getErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
  getPlayerSafeErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
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

import {
  rollSeed,
  rollWorldSeeds,
  suggestSingleSeed,
  suggestWorldSeeds,
} from "../../worldgen/index.js";
import {
  classifyEntries,
  parseWorldBook,
} from "../../worldgen/worldbook-importer.js";
import {
  composeSelectedWorldbooks,
  importWorldbookToLibrary,
  listWorldbookLibrary,
} from "../../worldbook-library/index.js";
import { researchWorldgenArtifact } from "../../worldgen/ip-researcher.js";
import { getActiveCampaign, loadCampaign } from "../../campaign/index.js";
import { loadSettings } from "../../settings/index.js";
import { resolveRoleModel } from "../../ai/index.js";
import worldgenRoutes from "../worldgen.js";

const app = new Hono();
app.route("/api/worldgen", worldgenRoutes);

const CAMPAIGN_ID = "campaign-intake-contract";
const WORLD_SEEDS = {
  geography: "Drowned rail provinces",
  politicalStructure: "Signal-house councils",
  centralConflict: "The last dry line is failing",
  culturalFlavor: ["brass mourning bells", "tide timetables"],
  environment: "Salt rain and flooded stations",
  wildcard: "Maps remember abandoned routes",
};
const SETTINGS = {
  providers: [{
    id: "provider-1",
    name: "Local test provider",
    baseUrl: "http://localhost:1234",
    apiKey: "",
    defaultModel: "model-1",
  }],
  generator: { providerId: "provider-1", model: "model-1", temperature: 0.7, maxTokens: 2048 },
  storyteller: { providerId: "provider-1", model: "model-1", temperature: 0.8, maxTokens: 1024 },
  judge: { providerId: "provider-1", model: "model-1", temperature: 0, maxTokens: 512 },
  embedder: { providerId: "provider-1", model: "model-1", temperature: 0, maxTokens: 512 },
  images: { providerId: "", model: "", stylePrompt: "", enabled: false },
  research: { enabled: true, maxSearchSteps: 3 },
  ui: { showRawReasoning: false },
};
const RESOLVED_ROLE = {
  provider: { baseUrl: "http://localhost:1234", model: "model-1", apiKey: "" },
  temperature: 0.7,
  maxTokens: 2048,
};
const CAMPAIGN = {
  id: CAMPAIGN_ID,
  name: "The Drowned Timetable",
  premise: "Rail kingdoms persist beneath a rising sea.",
  seeds: WORLD_SEEDS,
  createdAt: "2026-07-10T00:00:00.000Z",
};

const mockedRollWorldSeeds = vi.mocked(rollWorldSeeds);
const mockedRollSeed = vi.mocked(rollSeed);
const mockedSuggestWorldSeeds = vi.mocked(suggestWorldSeeds);
const mockedSuggestSingleSeed = vi.mocked(suggestSingleSeed);
const mockedParseWorldBook = vi.mocked(parseWorldBook);
const mockedClassifyEntries = vi.mocked(classifyEntries);
const mockedComposeSelectedWorldbooks = vi.mocked(composeSelectedWorldbooks);
const mockedImportWorldbookToLibrary = vi.mocked(importWorldbookToLibrary);
const mockedListWorldbookLibrary = vi.mocked(listWorldbookLibrary);
const mockedResearchWorldgenArtifact = vi.mocked(researchWorldgenArtifact);
const mockedGetActiveCampaign = vi.mocked(getActiveCampaign);
const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedLoadSettings = vi.mocked(loadSettings);
const mockedResolveRoleModel = vi.mocked(resolveRoleModel);

beforeEach(() => {
  vi.clearAllMocks();
  mockedLoadSettings.mockReturnValue(SETTINGS as never);
  mockedResolveRoleModel.mockReturnValue(RESOLVED_ROLE as never);
  mockedGetActiveCampaign.mockReturnValue(CAMPAIGN as never);
  mockedLoadCampaign.mockResolvedValue(CAMPAIGN as never);
  mockedResearchWorldgenArtifact.mockResolvedValue(null);
});

describe("worldgen intake routes", () => {
  it("returns a complete random DNA draft", async () => {
    mockedRollWorldSeeds.mockReturnValue(WORLD_SEEDS);

    const response = await app.request("/api/worldgen/roll-seeds", { method: "POST" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(WORLD_SEEDS);
    expect(mockedRollWorldSeeds).toHaveBeenCalledOnce();
  });

  it("rolls one validated DNA category", async () => {
    mockedRollSeed.mockReturnValue("Archipelago termini");

    const response = await app.request("/api/worldgen/roll-seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "geography" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ category: "geography", value: "Archipelago termini" });
    expect(mockedRollSeed).toHaveBeenCalledWith("geography");
  });

  it("rejects an unknown DNA category before invoking the generator", async () => {
    const response = await app.request("/api/worldgen/roll-seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: "factions" }),
    });

    expect(response.status).toBe(400);
    expect(mockedRollSeed).not.toHaveBeenCalled();
  });

  it("generates a complete DNA draft from the campaign concept", async () => {
    mockedSuggestWorldSeeds.mockResolvedValue({ seeds: WORLD_SEEDS, ipContext: null, premiseDivergence: null });

    const response = await app.request("/api/worldgen/suggest-seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: CAMPAIGN.name,
        premise: CAMPAIGN.premise,
        research: false,
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject(WORLD_SEEDS);
    expect(mockedResearchWorldgenArtifact).not.toHaveBeenCalled();
    expect(mockedSuggestWorldSeeds).toHaveBeenCalledWith(expect.objectContaining({
      premise: CAMPAIGN.premise,
      researchArtifact: null,
    }));
  });

  it("composes selected reusable worldbooks before suggesting DNA", async () => {
    const selectedWorldbooks = [{
      id: "worldbook-rail",
      displayName: "Rail Almanac",
      normalizedSourceHash: "source-hash",
      entryCount: 8,
      createdAt: 1,
      updatedAt: 2,
    }];
    const ipContext = {
      franchise: "Rail Almanac",
      keyFacts: ["Signal houses govern the dry lines."],
      tonalNotes: ["salt-worn industrial melancholy"],
      source: "llm" as const,
    };
    mockedComposeSelectedWorldbooks.mockResolvedValue({
      ipContext,
      worldbookSelection: selectedWorldbooks,
      provenance: { sources: selectedWorldbooks, groups: [] },
    } as never);
    mockedSuggestWorldSeeds.mockResolvedValue({ seeds: WORLD_SEEDS, ipContext: null, premiseDivergence: null });

    const response = await app.request("/api/worldgen/suggest-seeds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedWorldbooks, premise: CAMPAIGN.premise }),
    });

    expect(response.status).toBe(200);
    expect(mockedComposeSelectedWorldbooks).toHaveBeenCalledWith(selectedWorldbooks, CAMPAIGN.premise);
    expect(mockedSuggestWorldSeeds).toHaveBeenCalledWith(expect.objectContaining({ ipContext }));
  });

  it("suggests one DNA category through the intake model contract", async () => {
    mockedSuggestSingleSeed.mockResolvedValue("Tide-locked signal republics");

    const response = await app.request("/api/worldgen/suggest-seed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premise: CAMPAIGN.premise, category: "politicalStructure" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      category: "politicalStructure",
      value: "Tide-locked signal republics",
    });
    expect(mockedSuggestSingleSeed).toHaveBeenCalledWith(expect.objectContaining({
      premise: CAMPAIGN.premise,
      category: "politicalStructure",
    }));
  });
});

describe("worldbook intake routes", () => {
  it("lists reusable worldbooks without requiring an active campaign", async () => {
    const items = [{
      id: "worldbook-rail",
      displayName: "Rail Almanac",
      normalizedSourceHash: "source-hash",
      entryCount: 8,
      createdAt: 1,
      updatedAt: 2,
    }];
    mockedListWorldbookLibrary.mockReturnValue(items);
    mockedGetActiveCampaign.mockReturnValue(null);

    const response = await app.request("/api/worldgen/worldbook-library");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items });
    expect(mockedLoadCampaign).not.toHaveBeenCalled();
  });

  it("parses and classifies a worldbook", async () => {
    const worldbook = { entries: { "0": { comment: "Bellkeeper", content: "Guards a signal bell." } } };
    const parsed = [{ name: "Bellkeeper", text: "Guards a signal bell." }];
    const classified = [{ name: "Bellkeeper", type: "character" as const, summary: "Guards a signal bell." }];
    mockedParseWorldBook.mockReturnValue(parsed);
    mockedClassifyEntries.mockResolvedValue(classified);

    const response = await app.request("/api/worldgen/parse-worldbook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ worldbook }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ entries: classified });
    expect(mockedClassifyEntries).toHaveBeenCalledWith(parsed, RESOLVED_ROLE);
  });

  it("stores a classified reusable worldbook", async () => {
    const worldbook = { entries: { "0": { comment: "Bellkeeper", content: "Guards a signal bell." } } };
    const parsed = [{ name: "Bellkeeper", text: "Guards a signal bell." }];
    const classified = [{ name: "Bellkeeper", type: "character" as const, summary: "Guards a signal bell." }];
    const item = {
      id: "worldbook-rail",
      displayName: "Rail Almanac",
      normalizedSourceHash: "source-hash",
      entryCount: 1,
      createdAt: 1,
      updatedAt: 2,
    };
    mockedParseWorldBook.mockReturnValue(parsed);
    mockedClassifyEntries.mockResolvedValue(classified);
    mockedImportWorldbookToLibrary.mockImplementation(async (options) => {
      expect(await options.classify()).toEqual(classified);
      return { item, existed: false };
    });

    const response = await app.request("/api/worldgen/worldbook-library/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: "Rail Almanac", originalFileName: "rail.json", worldbook }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ item, existed: false });
  });

});

describe("Campaign World writer ownership", () => {
  it.each([
    "/api/worldgen/generate",
    "/api/worldgen/regenerate-section",
    "/api/worldgen/save-edits",
    "/api/worldgen/import-worldbook",
  ])("returns 404 for POST %s", async (path) => {
    const response = await app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(404);
  });
});
