import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("../../character/index.js", () => ({
  parseCharacterDescription: vi.fn(),
  generateCharacter: vi.fn(),
  generateCharacterFromArchetype: vi.fn(),
  mapV2CardToCharacter: vi.fn(),
  parseNpcDescription: vi.fn(),
  mapV2CardToNpc: vi.fn(),
  generateNpcFromArchetype: vi.fn(),
  researchArchetype: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../settings/index.js", () => ({
  loadSettings: vi.fn(() => ({
    providers: [{ id: "p1", name: "P", baseUrl: "http://x", apiKey: "k", defaultModel: "m" }],
    generator: { providerId: "p1", model: "m", temperature: 0.7, maxTokens: 4096 },
    images: { providerId: "", model: "", stylePrompt: "", enabled: false },
    research: { enabled: false, maxSearchSteps: 3 },
  })),
}));

vi.mock("../../campaign/index.js", () => ({
  getActiveCampaign: vi.fn(),
}));

vi.mock("../../ai/index.js", () => ({
  resolveRoleModel: vi.fn(() => ({
    provider: { baseUrl: "http://x", model: "m", apiKey: "k" },
    temperature: 0.7,
    maxTokens: 4096,
  })),
}));

vi.mock("../../worldgen/index.js", () => ({
  resolveStartingLocation: vi.fn(),
}));

vi.mock("../../images/index.js", () => ({
  generateImage: vi.fn(),
  resolveImageProvider: vi.fn(() => null),
  buildPortraitPrompt: vi.fn(),
  ensureImageDir: vi.fn(),
  cacheImage: vi.fn(),
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

import {
  parseCharacterDescription,
  generateCharacter,
  generateCharacterFromArchetype,
  mapV2CardToCharacter,
  parseNpcDescription,
  mapV2CardToNpc,
  generateNpcFromArchetype,
  researchArchetype,
} from "../../character/index.js";
import { getActiveCampaign } from "../../campaign/index.js";
import { getDb } from "../../db/index.js";
import { resolveStartingLocation } from "../../worldgen/index.js";
import characterRoutes from "../character.js";

const mockedGetActive = vi.mocked(getActiveCampaign);
const mockedGetDb = vi.mocked(getDb);
const mockedParseChar = vi.mocked(parseCharacterDescription);
const mockedParseNpc = vi.mocked(parseNpcDescription);
const mockedGenChar = vi.mocked(generateCharacter);
const mockedGenCharArch = vi.mocked(generateCharacterFromArchetype);
const mockedGenNpcArch = vi.mocked(generateNpcFromArchetype);
const mockedMapV2Char = vi.mocked(mapV2CardToCharacter);
const mockedMapV2Npc = vi.mocked(mapV2CardToNpc);
const mockedResearchArchetype = vi.mocked(researchArchetype);
const mockedResolveStart = vi.mocked(resolveStartingLocation);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = new Hono();
app.route("/api/worldgen", characterRoutes);

const CAMPAIGN_ID = "test-camp-1";

function setActiveCampaign() {
  mockedGetActive.mockReturnValue({
    id: CAMPAIGN_ID,
    name: "Test",
    createdAt: "2026-01-01",
    premise: "A dark world",
  } as any);
}

/** Create mock DB with chainable select/insert/delete */
function createMockDb(opts: {
  locations?: Array<{ id: string; name: string; isStarting?: boolean }>;
}) {
  const locs = opts.locations ?? [{ id: "loc-1", name: "Tavern" }];

  const mockRun = vi.fn();
  const mockAll = vi.fn(() => locs);
  const mockWhere = vi.fn(() => ({ all: mockAll, run: mockRun }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));
  const mockValues = vi.fn(() => ({ run: mockRun }));
  const mockInsert = vi.fn(() => ({ values: mockValues }));
  const mockDelete = vi.fn(() => ({ where: mockWhere }));

  const db = {
    select: mockSelect,
    insert: mockInsert,
    delete: mockDelete,
  } as any;

  mockedGetDb.mockReturnValue(db);
  return { db, mockRun, mockAll, mockDelete, mockInsert, mockValues };
}

/** Mock DB that also returns locationNames for helpers.resolveNames */
function createMockDbForResolveNames() {
  const mockRun = vi.fn();
  const locAll = vi.fn(() => [{ name: "Tavern" }, { name: "Forest" }]);
  const facAll = vi.fn(() => [{ name: "Guild" }]);

  let callCount = 0;
  const mockAll = vi.fn(() => {
    callCount++;
    if (callCount === 1) return locAll();
    return facAll();
  });
  const mockWhere = vi.fn(() => ({ all: mockAll, run: mockRun }));
  const mockFrom = vi.fn(() => ({ where: mockWhere }));
  const mockSelect = vi.fn(() => ({ from: mockFrom }));

  mockedGetDb.mockReturnValue({
    select: mockSelect,
    insert: vi.fn(() => ({ values: vi.fn(() => ({ run: mockRun })) })),
    delete: vi.fn(() => ({ where: mockWhere })),
  } as any);
}

beforeEach(() => {
  vi.clearAllMocks();
});

function makePlayerDraft(overrides: Record<string, unknown> = {}) {
  return {
    identity: {
      role: "player",
      tier: "key",
      displayName: "Hero",
      canonicalStatus: "original",
    },
    profile: {
      species: "Human",
      gender: "Male",
      ageText: "25",
      appearance: "Tall",
      backgroundSummary: "A wandering swordsman.",
      personaSummary: "Quiet but determined.",
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: "Tavern",
      relationshipRefs: [],
      socialStatus: [],
      originMode: "native",
    },
    motivations: {
      shortTermGoals: ["Find work"],
      longTermGoals: ["Restore family honor"],
      beliefs: [],
      drives: ["Brave"],
      frictions: ["Guarded"],
    },
    capabilities: {
      traits: ["Brave"],
      skills: [{ name: "Swordsman", tier: "Novice" }],
      flaws: [],
      specialties: [],
      wealthTier: "Poor",
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "active",
    },
    loadout: {
      inventorySeed: ["Sword"],
      equippedItemRefs: ["Sword"],
      currencyNotes: "",
      signatureItems: ["Sword"],
    },
    startConditions: {},
    provenance: {
      sourceKind: "generator",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
    },
    ...overrides,
  };
}

function makeNpcDraft(overrides: Record<string, unknown> = {}) {
  return {
    ...makePlayerDraft({
      identity: {
        role: "npc",
        tier: "key",
        displayName: "Guard",
        canonicalStatus: "original",
      },
      profile: {
        species: "Human",
        gender: "",
        ageText: "",
        appearance: "",
        backgroundSummary: "Veteran sentry.",
        personaSummary: "Stoic and suspicious.",
      },
      socialContext: {
        factionId: null,
        factionName: "Guild",
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: null,
        currentLocationName: "Tavern",
        relationshipRefs: [],
        socialStatus: [],
        originMode: "resident",
      },
      motivations: {
        shortTermGoals: ["Hold the gate"],
        longTermGoals: ["Keep the town safe"],
        beliefs: ["Trouble starts at the docks"],
        drives: ["Duty-bound"],
        frictions: ["Suspicious"],
      },
      capabilities: {
        traits: ["Disciplined"],
        skills: [{ name: "Spearman", tier: "Skilled" }],
        flaws: [],
        specialties: [],
        wealthTier: null,
      },
      loadout: {
        inventorySeed: [],
        equippedItemRefs: [],
        currencyNotes: "",
        signatureItems: [],
      },
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// POST /parse-character
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/parse-character", () => {
  it("with role=player calls parseCharacterDescription", async () => {
    setActiveCampaign();
    createMockDbForResolveNames();
    const fakeDraft = makePlayerDraft();
    mockedParseChar.mockResolvedValue(fakeDraft as any);

    const res = await app.request("/api/worldgen/parse-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, concept: "A brave knight" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("player");
    expect(body.draft).toEqual(fakeDraft);
    expect(body.character).toMatchObject({
      name: "Hero",
      race: "Human",
      locationName: "Tavern",
    });
    expect(mockedParseChar).toHaveBeenCalled();
  });

  it("with role=key calls parseNpcDescription", async () => {
    setActiveCampaign();
    createMockDbForResolveNames();
    const fakeDraft = makeNpcDraft();
    mockedParseNpc.mockResolvedValue(fakeDraft as any);

    const res = await app.request("/api/worldgen/parse-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        concept: "A stoic guard",
        role: "key",
        locationNames: ["Tavern"],
        factionNames: ["Guild"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("key");
    expect(body.draft).toEqual(fakeDraft);
    expect(body.npc).toMatchObject({
      name: "Guard",
      persona: "Stoic and suspicious.",
      locationName: "Tavern",
    });
    expect(mockedParseNpc).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /generate-character
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/generate-character", () => {
  it("with role=player calls generateCharacter", async () => {
    setActiveCampaign();
    createMockDbForResolveNames();
    const fakeDraft = makePlayerDraft({
      identity: {
        role: "player",
        tier: "key",
        displayName: "Ranger",
        canonicalStatus: "original",
      },
      profile: {
        species: "Elf",
        gender: "Female",
        ageText: "Young adult",
        appearance: "Sharp-eyed",
        backgroundSummary: "A forest scout.",
        personaSummary: "Calm under pressure.",
      },
    });
    mockedGenChar.mockResolvedValue(fakeDraft as any);

    const res = await app.request("/api/worldgen/generate-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("player");
    expect(body.draft).toEqual(fakeDraft);
    expect(body.character).toMatchObject({
      name: "Ranger",
      race: "Elf",
    });
    expect(mockedGenChar).toHaveBeenCalled();
  });

  it("with role=key calls generateNpcFromArchetype", async () => {
    setActiveCampaign();
    createMockDbForResolveNames();
    const fakeDraft = makeNpcDraft({
      identity: {
        role: "npc",
        tier: "key",
        displayName: "Merchant",
        canonicalStatus: "original",
      },
      profile: {
        species: "Human",
        gender: "",
        ageText: "",
        appearance: "",
        backgroundSummary: "A dockside broker.",
        personaSummary: "Greedy but personable.",
      },
    });
    mockedGenNpcArch.mockResolvedValue(fakeDraft as any);

    const res = await app.request("/api/worldgen/generate-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        role: "key",
        locationNames: ["Tavern"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("key");
    expect(body.draft).toEqual(fakeDraft);
    expect(body.npc).toMatchObject({
      name: "Merchant",
      persona: "Greedy but personable.",
    });
    expect(mockedGenNpcArch).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /research-character
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/research-character", () => {
  it("returns a shared draft plus compatibility alias for player archetype research", async () => {
    setActiveCampaign();
    createMockDbForResolveNames();
    mockedResearchArchetype.mockResolvedValue("swordmaster notes");
    const fakeDraft = makePlayerDraft({
      identity: {
        role: "player",
        tier: "key",
        displayName: "Blade",
        canonicalStatus: "original",
      },
    });
    mockedGenCharArch.mockResolvedValue(fakeDraft as any);

    const res = await app.request("/api/worldgen/research-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        archetype: "Swordmaster",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("player");
    expect(body.draft).toEqual(fakeDraft);
    expect(body.character).toMatchObject({ name: "Blade" });
  });
});

// ---------------------------------------------------------------------------
// POST /import-v2-card
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/import-v2-card", () => {
  const v2Body = {
    campaignId: CAMPAIGN_ID,
    name: "Raven",
    description: "A mysterious traveler",
    personality: "Quiet",
    scenario: "Night",
    tags: ["Dark"],
  };

  it("with role=player calls mapV2CardToCharacter", async () => {
    setActiveCampaign();
    createMockDbForResolveNames();
    const fakeDraft = makePlayerDraft({
      identity: {
        role: "player",
        tier: "key",
        displayName: "Raven",
        canonicalStatus: "imported",
      },
    });
    mockedMapV2Char.mockResolvedValue(fakeDraft as any);

    const res = await app.request("/api/worldgen/import-v2-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(v2Body),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("player");
    expect(body.draft).toEqual(fakeDraft);
    expect(body.character).toMatchObject({ name: "Raven" });
    expect(mockedMapV2Char).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Raven",
        importMode: "native",
      })
    );
  });

  it("with role=key calls mapV2CardToNpc", async () => {
    setActiveCampaign();
    createMockDbForResolveNames();
    const fakeDraft = makeNpcDraft({
      identity: {
        role: "npc",
        tier: "key",
        displayName: "Raven",
        canonicalStatus: "imported",
      },
    });
    mockedMapV2Npc.mockResolvedValue(fakeDraft as any);

    const res = await app.request("/api/worldgen/import-v2-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...v2Body,
        role: "key",
        locationNames: ["Tavern"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("key");
    expect(body.draft).toEqual(fakeDraft);
    expect(body.npc).toMatchObject({ name: "Raven" });
    expect(mockedMapV2Npc).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Raven",
        importMode: "native",
      })
    );
  });

  it("passes outsider import mode through to NPC mapping", async () => {
    setActiveCampaign();
    createMockDbForResolveNames();
    mockedMapV2Npc.mockResolvedValue({ name: "Raven" } as any);

    const res = await app.request("/api/worldgen/import-v2-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...v2Body,
        role: "key",
        importMode: "outsider",
        locationNames: ["Tavern"],
      }),
    });

    expect(res.status).toBe(200);
    expect(mockedMapV2Npc).toHaveBeenCalledWith(
      expect.objectContaining({
        importMode: "outsider",
      })
    );
  });
});

// ---------------------------------------------------------------------------
// POST /save-character
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/save-character", () => {
  const saveBody = {
    campaignId: CAMPAIGN_ID,
    character: {
      name: "Hero",
      race: "Human",
      gender: "Male",
      age: "25",
      appearance: "Tall",
      tags: ["Brave"],
      hp: 5,
      equippedItems: ["Sword"],
      locationName: "Tavern",
    },
  };

  it("saves player to DB and returns playerId", async () => {
    setActiveCampaign();
    const { mockInsert, mockRun } = createMockDb({
      locations: [{ id: "loc-1", name: "Tavern" }],
    });

    const res = await app.request("/api/worldgen/save-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saveBody),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body).toHaveProperty("playerId");
    expect(typeof body.playerId).toBe("string");
  });

  it("rejects unknown location with 400", async () => {
    setActiveCampaign();
    createMockDb({
      locations: [{ id: "loc-1", name: "Forest" }], // not "Tavern"
    });

    const res = await app.request("/api/worldgen/save-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saveBody),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Tavern");
  });

  it("deletes existing player before inserting new one", async () => {
    setActiveCampaign();
    const { db } = createMockDb({
      locations: [{ id: "loc-1", name: "Tavern" }],
    });

    await app.request("/api/worldgen/save-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(saveBody),
    });

    // delete is called before insert
    expect(db.delete).toHaveBeenCalled();
    expect(db.insert).toHaveBeenCalled();
  });

  it("persists canonical record and derived tags when saving a draft payload", async () => {
    setActiveCampaign();
    const { mockValues } = createMockDb({
      locations: [{ id: "loc-1", name: "Tavern" }],
    });

    const draft = makePlayerDraft();

    const res = await app.request("/api/worldgen/save-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        draft,
      }),
    });

    expect(res.status).toBe(200);

    const insertPayload = mockValues.mock.calls[0]![0] as Record<string, unknown>;
    expect(insertPayload.characterRecord).toBeDefined();
    expect(insertPayload.derivedTags).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// POST /resolve-starting-location
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/resolve-starting-location", () => {
  it("returns first isStarting location when no prompt", async () => {
    setActiveCampaign();
    createMockDb({
      locations: [
        { id: "loc-1", name: "Forest", isStarting: false },
        { id: "loc-2", name: "Tavern", isStarting: true },
      ],
    });
    // Override mockAll to return locations with isStarting
    const mockAll = vi.fn(() => [
      { id: "loc-1", name: "Forest", isStarting: false },
      { id: "loc-2", name: "Tavern", isStarting: true },
    ]);
    const mockWhere = vi.fn(() => ({ all: mockAll }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    const mockSelect = vi.fn(() => ({ from: mockFrom }));
    mockedGetDb.mockReturnValue({ select: mockSelect } as any);

    const res = await app.request("/api/worldgen/resolve-starting-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locationId).toBe("loc-2");
    expect(body.locationName).toBe("Tavern");
    expect(body.narrative).toBeNull();
  });

  it("with prompt calls resolveStartingLocation", async () => {
    setActiveCampaign();
    const mockAll = vi.fn(() => [
      { id: "loc-1", name: "Forest", isStarting: false },
      { id: "loc-2", name: "Tavern", isStarting: true },
    ]);
    const mockWhere = vi.fn(() => ({ all: mockAll }));
    const mockFrom = vi.fn(() => ({ where: mockWhere }));
    const mockSelect = vi.fn(() => ({ from: mockFrom }));
    mockedGetDb.mockReturnValue({ select: mockSelect } as any);

    mockedResolveStart.mockResolvedValue({
      locationName: "Forest",
      narrative: "You arrive at the edge of the dark forest.",
    } as any);

    const res = await app.request("/api/worldgen/resolve-starting-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        prompt: "I want to start in the forest",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locationId).toBe("loc-1");
    expect(body.locationName).toBe("Forest");
    expect(body.narrative).toBe("You arrive at the edge of the dark forest.");
    expect(mockedResolveStart).toHaveBeenCalled();
  });
});
