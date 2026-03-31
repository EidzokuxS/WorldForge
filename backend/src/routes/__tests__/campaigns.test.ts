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
  createCheckpoint: vi.fn(),
  listCheckpoints: vi.fn(),
  loadCheckpoint: vi.fn(),
  deleteCheckpoint: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
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
} from "../../campaign/index.js";
import { getDb } from "../../db/index.js";
import campaignRoutes from "../campaigns.js";

const mockedList = vi.mocked(listCampaigns);
const mockedCreate = vi.mocked(createCampaign);
const mockedLoad = vi.mocked(loadCampaign);
const mockedDelete = vi.mocked(deleteCampaign);
const mockedGetActive = vi.mocked(getActiveCampaign);
const mockedGetDb = vi.mocked(getDb);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = new Hono();
app.route("/api/campaigns", campaignRoutes);

const CAMPAIGN_ID = "abc-123";

beforeEach(() => {
  vi.clearAllMocks();
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
  it("returns world data for active campaign", async () => {
    mockedGetActive.mockReturnValue({
      id: CAMPAIGN_ID,
      name: "Test",
      createdAt: "2026-01-01",
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
    expect(body.locations).toEqual(worldData.locations);
    expect(body.npcs).toEqual(worldData.npcs);
    expect(body.factions).toEqual(worldData.factions);
    expect(body.relationships).toEqual(worldData.relationships);
    expect(body.player).toEqual(worldData.player);
  });

  it("returns player as null when no player exists", async () => {
    mockedGetActive.mockReturnValue({
      id: CAMPAIGN_ID,
      name: "Test",
      createdAt: "2026-01-01",
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
});
