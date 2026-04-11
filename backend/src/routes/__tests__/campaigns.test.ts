import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("../../campaign/index.js", () => ({
  assertSafeId: vi.fn(),
  createCampaign: vi.fn(),
  deleteCampaign: vi.fn(),
  getActiveCampaign: vi.fn(),
  listCampaigns: vi.fn(),
  loadCampaign: vi.fn(),
  readCampaignConfig: vi.fn(),
  createCheckpoint: vi.fn(),
  listCheckpoints: vi.fn(),
  loadCheckpoint: vi.fn(),
  deleteCheckpoint: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../engine/location-events.js", () => ({
  listRecentLocationEventsForLocations: vi.fn(),
}));

vi.mock("../../engine/location-graph.js", () => ({
  listConnectedPaths: vi.fn(),
  loadLocationGraph: vi.fn(),
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

vi.mock("../../ai/index.js", () => ({
  resolveRoleModel: vi.fn(),
}));

vi.mock("../../settings/index.js", () => ({
  loadSettings: vi.fn(),
}));

import {
  createCampaign,
  deleteCampaign,
  getActiveCampaign,
  listCampaigns,
  loadCampaign,
  readCampaignConfig,
} from "../../campaign/index.js";
import { getDb } from "../../db/index.js";
import { listRecentLocationEventsForLocations } from "../../engine/location-events.js";
import { listConnectedPaths, loadLocationGraph } from "../../engine/location-graph.js";
import campaignRoutes from "../campaigns.js";

const mockedList = vi.mocked(listCampaigns);
const mockedCreate = vi.mocked(createCampaign);
const mockedLoad = vi.mocked(loadCampaign);
const mockedDelete = vi.mocked(deleteCampaign);
const mockedGetActive = vi.mocked(getActiveCampaign);
const mockedGetDb = vi.mocked(getDb);
const mockedListRecentLocationEventsForLocations = vi.mocked(
  listRecentLocationEventsForLocations,
);
const mockedListConnectedPaths = vi.mocked(listConnectedPaths);
const mockedLoadLocationGraph = vi.mocked(loadLocationGraph);
const mockedReadConfig = vi.mocked(readCampaignConfig);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = new Hono();
app.route("/api/campaigns", campaignRoutes);

const CAMPAIGN_ID = "abc-123";

beforeEach(() => {
  vi.clearAllMocks();
  mockedReadConfig.mockReturnValue({ personaTemplates: [] } as any);
  mockedLoadLocationGraph.mockReturnValue({
    locations: [],
    edges: [],
  } as any);
  mockedListConnectedPaths.mockReturnValue([]);
  mockedListRecentLocationEventsForLocations.mockReturnValue({});
});

// ---------------------------------------------------------------------------
// GET /api/campaigns
// ---------------------------------------------------------------------------
describe("GET /api/campaigns", () => {
  it("returns campaign list", async () => {
    const campaigns = [
      { id: CAMPAIGN_ID, name: "Adventure", createdAt: "2026-01-01" },
    ];
    mockedList.mockReturnValue(campaigns as any);

    const res = await app.request("/api/campaigns");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(campaigns);
  });

  it("returns 500 when listCampaigns throws", async () => {
    mockedList.mockImplementation(() => {
      throw new Error("fs error");
    });

    const res = await app.request("/api/campaigns");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// POST /api/campaigns
// ---------------------------------------------------------------------------
describe("POST /api/campaigns", () => {
  it("creates campaign and returns 201", async () => {
    const created = { id: CAMPAIGN_ID, name: "New World", createdAt: "2026-03-10" };
    mockedCreate.mockResolvedValue(created as any);

    const res = await app.request("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New World",
        premise: "A dark fantasy realm",
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toEqual(created);
    expect(mockedCreate).toHaveBeenCalledWith(
      "New World",
      "A dark fantasy realm",
      undefined,
      { ipContext: undefined, premiseDivergence: undefined },
    );
  });

  it("passes seeds when provided", async () => {
    mockedCreate.mockResolvedValue({ id: "x" } as any);
    const seeds = { geography: "Mountains" };

    await app.request("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Seeded",
        premise: "A premise",
        seeds,
      }),
    });

    expect(mockedCreate).toHaveBeenCalledWith(
      "Seeded",
      "A premise",
      seeds,
      { ipContext: undefined, premiseDivergence: undefined },
    );
  });

  it("returns 400 for missing name", async () => {
    const res = await app.request("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ premise: "A premise" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("allows missing premise for worldbook-driven campaign creation", async () => {
    mockedCreate.mockResolvedValue({ id: CAMPAIGN_ID, name: "Test" } as any);

    const res = await app.request("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test" }),
    });

    expect(res.status).toBe(201);
    expect(mockedCreate).toHaveBeenCalledWith(
      "Test",
      "",
      undefined,
      { ipContext: undefined, premiseDivergence: undefined },
    );
  });

  it("passes precomputed worldgen context when provided", async () => {
    mockedCreate.mockResolvedValue({ id: CAMPAIGN_ID, name: "Test" } as any);
    const ipContext = {
      franchise: "Voices of the Void",
      keyFacts: ["fact"],
      tonalNotes: ["tone"],
      canonicalNames: {
        locations: ["Alpha Root Base"],
        factions: ["Alpen Signal Observatorium (ASO)"],
        characters: ["Doctor Kel"],
      },
      source: "mcp",
    };
    const premiseDivergence = {
      mode: "diverged",
      protagonistRole: {
        kind: "custom",
        interpretation: "replacement",
        canonicalCharacterName: "Doctor Kel",
        roleSummary: "A custom researcher replaces Doctor Kel.",
      },
      preservedCanonFacts: ["canon"],
      changedCanonFacts: ["change"],
      currentStateDirectives: ["directive"],
      ambiguityNotes: ["note"],
    };

    const res = await app.request("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        premise: "Custom researcher in VotV",
        ipContext,
        premiseDivergence,
      }),
    });

    expect(res.status).toBe(201);
    expect(mockedCreate).toHaveBeenCalledWith(
      "Test",
      "Custom researcher in VotV",
      undefined,
      { ipContext, premiseDivergence },
    );
  });

  it("passes worldbookSelection through to createCampaign when provided", async () => {
    mockedCreate.mockResolvedValue({ id: CAMPAIGN_ID, name: "Test" } as any);
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

    const res = await app.request("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Test",
        premise: "A premise",
        worldbookSelection,
      }),
    });

    expect(res.status).toBe(201);
    expect(mockedCreate).toHaveBeenCalledWith(
      "Test",
      "A premise",
      undefined,
      {
        ipContext: undefined,
        premiseDivergence: undefined,
        worldbookSelection,
      },
    );
  });

  it("returns 400 for empty name (whitespace only)", async () => {
    const res = await app.request("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "   ", premise: "Valid premise" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 500 when createCampaign throws", async () => {
    mockedCreate.mockRejectedValue(new Error("create failed"));

    const res = await app.request("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Test", premise: "A premise" }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// POST /:id/load
// ---------------------------------------------------------------------------
describe("POST /:id/load", () => {
  it("loads campaign and returns it", async () => {
    const campaign = { id: CAMPAIGN_ID, name: "Loaded", createdAt: "2026-01-01" };
    mockedLoad.mockResolvedValue(campaign as any);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/load`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(campaign);
  });

  it("returns 500 when loadCampaign throws", async () => {
    mockedLoad.mockRejectedValue(new Error("not found"));

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/load`, {
      method: "POST",
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id
// ---------------------------------------------------------------------------
describe("DELETE /:id", () => {
  it("deletes campaign and returns ok", async () => {
    mockedDelete.mockResolvedValue(undefined);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("returns 500 when deleteCampaign throws", async () => {
    mockedDelete.mockRejectedValue(new Error("delete error"));

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}`, {
      method: "DELETE",
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// GET /:id/world
// ---------------------------------------------------------------------------
describe("GET /:id/world", () => {
  it("returns 409 when the requested campaign world is not generation-ready", async () => {
    mockedGetActive.mockReturnValue({
      id: CAMPAIGN_ID,
      name: "Test",
      createdAt: "2026-01-01",
      generationComplete: false,
    } as any);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/world`);

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual({
      error: "World generation is not complete for this campaign.",
    });
    expect(mockedGetDb).not.toHaveBeenCalled();
  });

  it("returns world data for active campaign", async () => {
    mockedGetActive.mockReturnValue({
      id: CAMPAIGN_ID,
      name: "Test",
      createdAt: "2026-01-01",
      generationComplete: true,
    } as any);

    const mockAll = vi.fn();
    const mockWhere = vi.fn(() => ({ all: mockAll }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    const mockSelect = vi.fn(() => ({ from: mockFrom }));

    // Each chained query returns different data
    const worldData = {
      locations: [{ id: 1, name: "Forest" }],
      npcs: [{ id: 2, name: "Guard" }],
      factions: [{ id: 3, name: "Rebels" }],
      relationships: [{ id: 4, type: "ally" }],
      player: { id: 5, name: "Hero" },
    };

    // The route calls db.select().from(X).where(Y).all() five times
    mockAll
      .mockReturnValueOnce(worldData.locations)
      .mockReturnValueOnce(worldData.npcs)
      .mockReturnValueOnce(worldData.factions)
      .mockReturnValueOnce(worldData.relationships)
      .mockReturnValueOnce([worldData.player]);

    mockedGetDb.mockReturnValue({
      select: mockSelect,
    } as any);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/world`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locations).toEqual([
      expect.objectContaining({
        id: 1,
        name: "Forest",
        connectedPaths: [],
        recentHappenings: [],
      }),
    ]);
    expect(body.npcs).toHaveLength(1);
    expect(body.npcs[0]).toMatchObject(worldData.npcs[0]);
    expect(body.npcs[0]).toHaveProperty("characterRecord");
    expect(body.npcs[0]).toHaveProperty("draft");
    expect(body.npcs[0]).toHaveProperty("npc");
    expect(body.factions).toEqual(worldData.factions);
    expect(body.relationships).toEqual(worldData.relationships);
    expect(body.player).toMatchObject(worldData.player);
    expect(body.player).toHaveProperty("characterRecord");
    expect(body.player).toHaveProperty("draft");
    expect(body.player).toHaveProperty("character");
  });

  it("returns player as null when no player exists", async () => {
    mockedGetActive.mockReturnValue({
      id: CAMPAIGN_ID,
      name: "Test",
      createdAt: "2026-01-01",
      generationComplete: true,
    } as any);

    const mockAll = vi.fn();
    const mockWhere = vi.fn(() => ({ all: mockAll }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    const mockSelect = vi.fn(() => ({ from: mockFrom }));

    mockAll
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]); // empty players

    mockedGetDb.mockReturnValue({
      select: mockSelect,
    } as any);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/world`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.player).toBeNull();
  });

  it("returns 404 when campaign is not active", async () => {
    mockedGetActive.mockReturnValue(null as any);
    mockedLoad.mockRejectedValue(new Error("not found"));

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/world`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("reloads the requested campaign when active state was lost", async () => {
    mockedGetActive.mockReturnValue(null as any);
    mockedLoad.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: "Recovered",
      createdAt: "2026-01-01",
      generationComplete: true,
    } as any);

    const mockAll = vi.fn();
    const mockWhere = vi.fn(() => ({ all: mockAll }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    const mockSelect = vi.fn(() => ({ from: mockFrom }));

    mockAll
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    mockedGetDb.mockReturnValue({
      select: mockSelect,
    } as any);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/world`);

    expect(res.status).toBe(200);
    expect(mockedLoad).toHaveBeenCalledWith(CAMPAIGN_ID);
  });

  it("surfaces persistent DB npc rows as supporting review-tier aliases", async () => {
    mockedGetActive.mockReturnValue({
      id: CAMPAIGN_ID,
      name: "Test",
      createdAt: "2026-01-01",
      generationComplete: true,
    } as any);

    const mockAll = vi.fn();
    const mockWhere = vi.fn(() => ({ all: mockAll }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    const mockSelect = vi.fn(() => ({ from: mockFrom }));

    mockAll
      .mockReturnValueOnce([])
      .mockReturnValueOnce([
        {
          id: "npc-1",
          campaignId: CAMPAIGN_ID,
          name: "Signal Runner Toma",
          persona: "Carries messages through the storm.",
          tags: "[]",
          tier: "persistent",
          currentLocationId: null,
          goals: JSON.stringify({
            short_term: ["Deliver the warning"],
            long_term: ["Keep the valley connected"],
          }),
          beliefs: "[]",
          unprocessedImportance: 0,
          inactiveTicks: 0,
          createdAt: 0,
        },
      ])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    mockedGetDb.mockReturnValue({
      select: mockSelect,
    } as any);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/world`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.npcs).toHaveLength(1);
    expect(body.npcs[0]?.npc?.tier).toBe("supporting");
    expect(body.npcs[0]?.draft?.identity?.tier).toBe("persistent");
  });

  it("returns connectedPaths and recent happenings for each location instead of raw connectedTo IDs alone", async () => {
    mockedGetActive.mockReturnValue({
      id: CAMPAIGN_ID,
      name: "Test",
      createdAt: "2026-01-01",
      generationComplete: true,
    } as any);

    const mockAll = vi.fn();
    const mockWhere = vi.fn(() => ({ all: mockAll }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    const mockSelect = vi.fn(() => ({ from: mockFrom }));

    mockAll
      .mockReturnValueOnce([
        {
          id: "loc-1",
          name: "Shibuya Crossing",
          description: "Macro hub",
          connectedTo: '["loc-2"]',
        },
      ])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    mockedLoadLocationGraph.mockReturnValue({
      locations: [
        {
          id: "loc-1",
          name: "Shibuya Crossing",
          kind: "macro",
          persistence: "persistent",
          archivedAtTick: null,
          expiresAtTick: null,
        },
        {
          id: "loc-2",
          name: "Shibuya Station",
          kind: "persistent_sublocation",
          persistence: "persistent",
          archivedAtTick: null,
          expiresAtTick: null,
        },
      ],
      edges: [
        {
          id: "edge-1",
          fromLocationId: "loc-1",
          toLocationId: "loc-2",
          travelCost: 1,
          discovered: true,
        },
      ],
    } as any);
    mockedListConnectedPaths.mockImplementation(({ fromLocationId }) =>
      fromLocationId === "loc-1"
        ? [
            {
              edgeId: "edge-1",
              locationId: "loc-2",
              locationName: "Shibuya Station",
              travelCost: 1,
            },
          ]
        : [],
    );
    mockedListRecentLocationEventsForLocations.mockReturnValue({
      "loc-1": [
        {
          id: "event-1",
          campaignId: CAMPAIGN_ID,
          locationId: "loc-1",
          sourceLocationId: "scene-1",
          anchorLocationId: "loc-1",
          sourceEventId: "evt-episodic-1",
          eventType: "ephemeral_scene",
          summary: "A rooftop clash spilled cursed residue into the crossing.",
          tick: 12,
          importance: 4,
          archivedAtTick: 13,
          createdAt: 1700000000000,
        },
      ],
    });

    mockedGetDb.mockReturnValue({
      select: mockSelect,
    } as any);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/world`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locations[0]).toMatchObject({
      connectedPaths: [
        {
          edgeId: "edge-1",
          toLocationId: "loc-2",
          toLocationName: "Shibuya Station",
          travelCost: 1,
        },
      ],
      recentHappenings: [
        expect.objectContaining({
          summary: "A rooftop clash spilled cursed residue into the crossing.",
        }),
      ],
    });
    expect(body.locations[0].connectedTo).toBeUndefined();
    expect(mockedLoadLocationGraph).toHaveBeenCalledWith({ campaignId: CAMPAIGN_ID });
    expect(mockedListRecentLocationEventsForLocations).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      locationIds: ["loc-1"],
      limitPerLocation: 5,
    });
    expect(mockedListConnectedPaths).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      fromLocationId: "loc-1",
      edges: expect.any(Array),
      locations: expect.any(Array),
    });
  });

  it("returns bounded empty fallback arrays when a location has no graph edges or local history", async () => {
    mockedGetActive.mockReturnValue({
      id: CAMPAIGN_ID,
      name: "Test",
      createdAt: "2026-01-01",
      generationComplete: true,
    } as any);

    const mockAll = vi.fn();
    const mockWhere = vi.fn(() => ({ all: mockAll }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    const mockSelect = vi.fn(() => ({ from: mockFrom }));

    mockAll
      .mockReturnValueOnce([
        {
          id: "loc-1",
          name: "Shibuya Crossing",
          description: "Macro hub",
          connectedTo: '["loc-2"]',
        },
        {
          id: "loc-2",
          name: "Quiet Shrine",
          description: "Still and empty",
          connectedTo: "[]",
        },
      ])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([])
      .mockReturnValueOnce([]);

    mockedLoadLocationGraph.mockReturnValue({
      locations: [
        {
          id: "loc-1",
          name: "Shibuya Crossing",
          kind: "macro",
          persistence: "persistent",
          archivedAtTick: null,
          expiresAtTick: null,
        },
        {
          id: "loc-2",
          name: "Quiet Shrine",
          kind: "persistent_sublocation",
          persistence: "persistent",
          archivedAtTick: null,
          expiresAtTick: null,
        },
      ],
      edges: [],
    } as any);
    mockedListRecentLocationEventsForLocations.mockReturnValue({});

    mockedGetDb.mockReturnValue({
      select: mockSelect,
    } as any);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/world`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locations).toEqual([
      expect.objectContaining({
        id: "loc-1",
        connectedPaths: [],
        recentHappenings: [],
      }),
      expect.objectContaining({
        id: "loc-2",
        connectedPaths: [],
        recentHappenings: [],
      }),
    ]);
  });
});
