import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("../../campaign/index.js", () => ({
  assertSafeId: vi.fn(),
  getActiveCampaign: vi.fn(),
  loadCampaign: vi.fn(),
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

vi.mock("../../settings/index.js", () => ({
  loadSettings: vi.fn(),
}));

vi.mock("../../ai/index.js", () => ({
  resolveRoleModel: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../vectors/embeddings.js", () => ({
  embedTexts: vi.fn(),
}));

vi.mock("../../vectors/lore-cards.js", () => ({
  getAllLoreCards: vi.fn(),
  searchLoreCards: vi.fn(),
  deleteCampaignLore: vi.fn(),
  updateLoreCard: vi.fn(),
  deleteLoreCardById: vi.fn(),
}));

import { getActiveCampaign, loadCampaign } from "../../campaign/index.js";
import { loadSettings } from "../../settings/index.js";
import { embedTexts } from "../../vectors/embeddings.js";
import {
  getAllLoreCards,
  searchLoreCards,
  deleteCampaignLore,
  updateLoreCard,
  deleteLoreCardById,
} from "../../vectors/lore-cards.js";
import loreRoutes from "../lore.js";

const mockedGetActive = vi.mocked(getActiveCampaign);
const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedLoadSettings = vi.mocked(loadSettings);
const mockedEmbedTexts = vi.mocked(embedTexts);
const mockedGetAllLore = vi.mocked(getAllLoreCards);
const mockedSearchLore = vi.mocked(searchLoreCards);
const mockedDeleteLore = vi.mocked(deleteCampaignLore);
const mockedUpdateLoreCard = vi.mocked(updateLoreCard);
const mockedDeleteLoreCardById = vi.mocked(deleteLoreCardById);

// ---------------------------------------------------------------------------
// App setup — mount under /api/campaigns so :id param is captured
// ---------------------------------------------------------------------------
const app = new Hono();
app.route("/api/campaigns", loreRoutes);

const CAMPAIGN_ID = "test-campaign-1";

function activateCampaign() {
  mockedGetActive.mockReturnValue({
    id: CAMPAIGN_ID,
    name: "Test Campaign",
    createdAt: new Date().toISOString(),
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /:id/lore
// ---------------------------------------------------------------------------
describe("GET /:id/lore", () => {
  it("returns lore cards", async () => {
    activateCampaign();
    const fakeCards = [
      { id: "1", term: "Ancient Ruins", category: "location", definition: "Ruins of old city" },
      { id: "2", term: "Dragon Cult", category: "faction", definition: "Secret cult" },
    ];
    mockedGetAllLore.mockResolvedValue(fakeCards as any);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/lore`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ cards: fakeCards });
    expect(mockedGetAllLore).toHaveBeenCalledOnce();
  });

  it("returns 404 when no active campaign matches", async () => {
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockRejectedValue(new Error("not found"));

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/lore`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("reloads the requested campaign when active state was lost", async () => {
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: "Recovered",
      createdAt: new Date().toISOString(),
    } as any);
    mockedGetAllLore.mockResolvedValue([] as any);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/lore`);

    expect(res.status).toBe(200);
    expect(mockedLoadCampaign).toHaveBeenCalledWith(CAMPAIGN_ID);
  });

  it("returns 500 when getAllLoreCards throws", async () => {
    activateCampaign();
    mockedGetAllLore.mockRejectedValue(new Error("db error"));

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/lore`);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// GET /:id/lore/search
// ---------------------------------------------------------------------------
describe("GET /:id/lore/search", () => {
  it("returns search results", async () => {
    activateCampaign();
    mockedLoadSettings.mockReturnValue({
      embedder: { providerId: "p1", model: "emb-model", temperature: 0, maxTokens: 512 },
      providers: [{ id: "p1", name: "P1", baseUrl: "http://localhost:1234", apiKey: "", defaultModel: "m", isBuiltin: false }],
    } as any);

    // resolveEmbedder calls resolveRoleModel internally — we mock it via the helpers chain.
    // Since resolveEmbedder checks provider list, we need resolveRoleModel to work.
    const { resolveRoleModel } = await import("../../ai/index.js");
    vi.mocked(resolveRoleModel).mockReturnValue({
      provider: { baseUrl: "http://localhost:1234", apiKey: "", model: "emb-model" },
      temperature: 0,
      maxTokens: 512,
    } as any);

    const fakeVector = [0.1, 0.2, 0.3];
    mockedEmbedTexts.mockResolvedValue([fakeVector]);

    const fakeResults = [
      { id: "1", term: "Found Card", definition: "Match", category: "concept", vector: fakeVector },
    ];
    mockedSearchLore.mockResolvedValue(fakeResults as any);

    const res = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/lore/search?q=ruins&limit=5`
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    // vector field should be stripped from results
    expect(body.cards).toEqual([
      { id: "1", term: "Found Card", definition: "Match", category: "concept" },
    ]);
  });

  it("returns 400 when query param q is missing", async () => {
    activateCampaign();

    const res = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/lore/search`
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("'q' is required");
  });

  it("returns 404 when no active campaign", async () => {
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockRejectedValue(new Error("not found"));

    const res = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/lore/search?q=test`
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// PUT /:id/lore/:cardId
// ---------------------------------------------------------------------------
describe("PUT /:id/lore/:cardId", () => {
  it("updates one lore card by id", async () => {
    activateCampaign();
    mockedUpdateLoreCard.mockResolvedValue({
      id: "card-1",
      term: "Updated Ruins",
      definition: "Now reclaimed by scholars.",
      category: "location",
    } as any);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/lore/card-1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        term: " Updated Ruins ",
        definition: " Now reclaimed by scholars. ",
        category: "location",
      }),
    });

    expect(res.status).toBe(200);
    expect(mockedUpdateLoreCard).toHaveBeenCalledWith("card-1", {
      term: "Updated Ruins",
      definition: "Now reclaimed by scholars.",
      category: "location",
    }, expect.anything());
    await expect(res.json()).resolves.toEqual({
      card: {
        id: "card-1",
        term: "Updated Ruins",
        definition: "Now reclaimed by scholars.",
        category: "location",
      },
    });
  });

  it("rejects invalid lore edit payloads", async () => {
    activateCampaign();

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/lore/card-1`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        term: "   ",
        definition: "",
        category: "invalid-category",
      }),
    });

    expect(res.status).toBe(400);
    expect(mockedUpdateLoreCard).not.toHaveBeenCalled();
  });

  it("returns 404 for missing lore cards", async () => {
    activateCampaign();
    mockedUpdateLoreCard.mockResolvedValue(null);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/lore/missing-card`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        term: "Updated Ruins",
        definition: "Now reclaimed by scholars.",
        category: "location",
      }),
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Lore card not found." });
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id/lore
// ---------------------------------------------------------------------------
describe("DELETE /:id/lore", () => {
  it("deletes lore and returns ok", async () => {
    activateCampaign();
    mockedDeleteLore.mockResolvedValue(undefined);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/lore`, {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
    expect(mockedDeleteLore).toHaveBeenCalledOnce();
  });

  it("returns 404 when no active campaign", async () => {
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockRejectedValue(new Error("not found"));

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/lore`, {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 500 when deleteCampaignLore throws", async () => {
    activateCampaign();
    mockedDeleteLore.mockRejectedValue(new Error("delete error"));

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/lore`, {
      method: "DELETE",
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// DELETE /:id/lore/:cardId
// ---------------------------------------------------------------------------
describe("DELETE /:id/lore/:cardId", () => {
  it("deletes one lore card by id", async () => {
    activateCampaign();
    mockedDeleteLoreCardById.mockResolvedValue(true);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/lore/card-1`, {
      method: "DELETE",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
    expect(mockedDeleteLoreCardById).toHaveBeenCalledWith("card-1");
  });

  it("returns 404 for missing lore cards", async () => {
    activateCampaign();
    mockedDeleteLoreCardById.mockResolvedValue(false);

    const res = await app.request(`/api/campaigns/${CAMPAIGN_ID}/lore/missing-card`, {
      method: "DELETE",
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Lore card not found." });
  });
});
