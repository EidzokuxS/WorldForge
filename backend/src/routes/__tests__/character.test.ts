import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Phase 60-04: all 4 character-creation routes delegate to ingestCharacterDraft.
// We mock the pipeline entry + provide the real IngestionPipelineError class
// so the route's 502-conversion branch can be exercised end-to-end.
//
// vi.hoisted is required because vi.mock is hoisted above top-level imports,
// and the factory cannot reference a top-level `const` from outer scope.
const { ingestMock } = vi.hoisted(() => ({ ingestMock: vi.fn() }));

vi.mock("../../character/ingestion/index.js", async () => {
  const actualErrors = await vi.importActual<any>("../../character/ingestion/errors.js");
  return {
    ingestCharacterDraft: ingestMock,
    IngestionPipelineError: actualErrors.IngestionPipelineError,
  };
});

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
  loadCampaign: vi.fn(),
  readCampaignConfig: vi.fn(() => ({ currentTick: 0 })),
  loadIpContext: vi.fn(() => null),
  loadPremiseDivergence: vi.fn(() => null),
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
    debug: vi.fn(),
    event: vi.fn(),
  })),
}));

import { getActiveCampaign, loadCampaign, readCampaignConfig } from "../../campaign/index.js";
import { getDb } from "../../db/index.js";
import { resolveStartingLocation } from "../../worldgen/index.js";
import { IngestionPipelineError } from "../../character/ingestion/errors.js";
import characterRoutes from "../character.js";

const mockedGetActive = vi.mocked(getActiveCampaign);
const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedReadCampaignConfig = vi.mocked(readCampaignConfig);
const mockedGetDb = vi.mocked(getDb);
const mockedResolveStart = vi.mocked(resolveStartingLocation);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = new Hono();
app.route("/api/worldgen", characterRoutes);

const CAMPAIGN_ID = "test-camp-1";

function setActiveCampaign() {
  const campaign = {
    id: CAMPAIGN_ID,
    name: "Test",
    createdAt: "2026-01-01",
    premise: "A dark world",
  } as any;
  mockedGetActive.mockReturnValue(campaign);
  mockedLoadCampaign.mockResolvedValue(campaign);
}

/** Create mock DB with chainable select/insert/delete */
function createMockDb(opts: {
  locations?: Array<{
    id: string;
    name: string;
    isStarting?: boolean;
    kind?: string | null;
    parentLocationId?: string | null;
  }>;
}) {
  const locs = opts.locations ?? [{ id: "loc-1", name: "Tavern" }];

  const mockRun = vi.fn();
  const mockGet = vi.fn(() => null);
  const mockAll = vi.fn(() => locs);
  const mockWhere = vi.fn(() => ({ all: mockAll, run: mockRun, get: mockGet }));
  const mockFrom = vi.fn(() => ({ where: mockWhere, get: mockGet }));
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
  return { db, mockRun, mockAll, mockDelete, mockInsert, mockValues, mockGet };
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
  ingestMock.mockReset();
  mockedLoadCampaign.mockRejectedValue(new Error("not found"));
  mockedReadCampaignConfig.mockReturnValue({ currentTick: 0 } as any);
});

/** Full CharacterDraft fixture used for save-character and pipeline mocks. */
function makePlayerDraft(overrides: Record<string, unknown> = {}) {
  return {
    identity: {
      role: "player",
      tier: "key",
      displayName: "Hero",
      canonicalStatus: "original",
      baseFacts: {
        biography: "A wandering swordsman.",
        socialRole: ["player"],
        hardConstraints: ["Protect innocent travelers"],
      },
      behavioralCore: {
        motives: ["Keep moving before the past catches up"],
        pressureResponses: ["Shuts down before trusting strangers"],
        taboos: ["Abandoning a companion"],
        attachments: ["The old family blade"],
        selfImage: "Quiet but determined.",
      },
      liveDynamics: {
        activeGoals: ["Find work", "Restore family honor"],
        beliefDrift: [],
        currentStrains: ["Guarded"],
        earnedChanges: [],
      },
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
    sourceBundle: {
      canonSources: [],
      secondarySources: [
        {
          kind: "runtime",
          label: "Generator concept",
          excerpt: "A wandering swordsman.",
        },
      ],
      synthesis: {
        owner: "WorldForge",
        strategy: "test-fixture",
        notes: ["Route tests should preserve richer identity payloads."],
      },
    },
    continuity: {
      identityInertia: "flexible",
      protectedCore: ["identity.baseFacts"],
      mutableSurface: ["identity.liveDynamics"],
      changePressureNotes: ["Player drafts may change through play."],
    },
    powerStats: {
      attackPotency: { tier: "Street", rank: 4 },
      durability: { tier: "Street", rank: 3 },
      speed: { tier: "Human", rank: 8 },
      intelligence: { tier: "Above Average", rank: 6 },
      hax: [],
      vulnerabilities: [],
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
        baseFacts: {
          biography: "Veteran sentry.",
          socialRole: ["npc"],
          hardConstraints: [],
        },
        behavioralCore: {
          motives: ["Duty-bound"],
          pressureResponses: [],
          taboos: [],
          attachments: [],
          selfImage: "Stoic and suspicious.",
        },
        liveDynamics: {
          activeGoals: ["Hold the gate"],
          beliefDrift: [],
          currentStrains: [],
          earnedChanges: [],
        },
      },
    }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Phase 60-04: ingestion pipeline delegation — 4 routes × 2 roles + override
// priority proof + IngestionPipelineError -> 502 mapping.
// ---------------------------------------------------------------------------
describe("Phase 60 route delegation: ingestCharacterDraft", () => {
  const CREATION_ROUTES = [
    { path: "/parse-character", body: { concept: "a rogue" }, mode: "parse" as const },
    { path: "/generate-character", body: {}, mode: "generate" as const },
    { path: "/research-character", body: { archetype: "paladin" }, mode: "research" as const },
    {
      path: "/import-v2-card",
      body: {
        name: "X",
        description: "d",
        personality: "p",
        scenario: "s",
        tags: [],
        importMode: "native",
      },
      mode: "import" as const,
    },
  ];

  for (const route of CREATION_ROUTES) {
    for (const role of ["player", "key"] as const) {
      it(`${route.path} role=${role} delegates to ingestCharacterDraft`, async () => {
        setActiveCampaign();
        createMockDbForResolveNames();
        const draft = role === "key" ? makeNpcDraft() : makePlayerDraft();
        ingestMock.mockResolvedValueOnce(draft);

        const res = await app.request(`/api/worldgen${route.path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            campaignId: CAMPAIGN_ID,
            role,
            locationNames: ["Tavern"],
            factionNames: role === "key" ? ["Guild"] : undefined,
            ...route.body,
          }),
        });

        expect(res.status).toBe(200);
        expect(ingestMock).toHaveBeenCalledTimes(1);
        const callInput = ingestMock.mock.calls[0]![0];
        expect(callInput.mode).toBe(route.mode);
        expect(callInput.role).toBe(role);
        expect(callInput.campaignId).toBe(CAMPAIGN_ID);

        const body = await res.json();
        expect(body.role).toBe(role === "key" ? "key" : "player");
        expect(body.draft.powerStats).toBeDefined();
      });
    }
  }

  it("threads overrideText from /import-v2-card request into IngestionInput", async () => {
    setActiveCampaign();
    createMockDbForResolveNames();
    ingestMock.mockResolvedValueOnce(makePlayerDraft());

    const res = await app.request("/api/worldgen/import-v2-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        role: "player",
        name: "Gojo",
        description: "canon sorcerer",
        personality: "cocky",
        scenario: "school",
        tags: [],
        importMode: "native",
        overrideText: "eyes are red not blue",
        locationNames: ["Tavern"],
      }),
    });

    expect(res.status).toBe(200);
    expect(ingestMock).toHaveBeenCalledTimes(1);
    const callInput = ingestMock.mock.calls[0]![0];
    expect(callInput.mode).toBe("import");
    expect(callInput.overrideText).toBe("eyes are red not blue");
    expect(callInput.v2Card.name).toBe("Gojo");
    expect(callInput.v2Card.importMode).toBe("native");
  });

  it("returns compact compatibility tags for key imports instead of drives/frictions or card meta", async () => {
    setActiveCampaign();
    createMockDbForResolveNames();
    ingestMock.mockResolvedValueOnce(
      makeNpcDraft({
        motivations: {
          shortTermGoals: ["Hold the line"],
          longTermGoals: ["Keep the city standing"],
          beliefs: [],
          drives: ["Fill the void where fear should reside with meaningful experiences"],
          frictions: ["Cannot perceive her own emotional void, dependent on others to reflect it"],
        },
        capabilities: {
          traits: ["Manipulator", "Spider Motif"],
          skills: [],
          flaws: [],
          specialties: [],
          wealthTier: null,
        },
        provenance: {
          sourceKind: "import",
          importMode: "outsider",
          templateId: null,
          archetypePrompt: null,
          worldgenOrigin: null,
          legacyTags: ["SFW ↔ NSFW", "Mentor Figure", "Strategic Thinker"],
        },
      }),
    );

    const res = await app.request("/api/worldgen/import-v2-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        role: "key",
        name: "Kafka",
        description: "d",
        personality: "p",
        scenario: "s",
        tags: [],
        importMode: "outsider",
        locationNames: ["Tavern"],
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.npc.tags).toEqual([
      "Manipulator",
      "Spider Motif",
      "Mentor Figure",
      "Strategic Thinker",
    ]);
  });

  it("override proof: overrideText at HTTP boundary reaches pipeline IngestionInput for parse mode", async () => {
    setActiveCampaign();
    createMockDbForResolveNames();
    ingestMock.mockResolvedValueOnce(makePlayerDraft());

    await app.request("/api/worldgen/parse-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        role: "player",
        concept: "a knight",
        overrideText: "she is actually a rogue",
        locationNames: ["Tavern"],
      }),
    });

    expect(ingestMock).toHaveBeenCalledTimes(1);
    const callInput = ingestMock.mock.calls[0]![0];
    expect(callInput.overrideText).toBe("she is actually a rogue");
    expect(callInput.freeText).toBe("a knight");
  });

  it("route returns 502 with stage when IngestionPipelineError is thrown", async () => {
    setActiveCampaign();
    createMockDbForResolveNames();
    ingestMock.mockRejectedValueOnce(
      new IngestionPipelineError({
        stage: "power_assess",
        attempts: 3,
        cause: null,
        message: "Pipeline blew up",
      }),
    );

    const res = await app.request("/api/worldgen/parse-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        role: "player",
        concept: "x",
        locationNames: ["Tavern"],
      }),
    });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.stage).toBe("power_assess");
    expect(body.error).toContain("Pipeline blew up");
    expect(body.attempts).toBe(3);
  });

  it("passes importMode verbatim through to IngestionInput.v2Card", async () => {
    setActiveCampaign();
    createMockDbForResolveNames();
    ingestMock.mockResolvedValueOnce(makeNpcDraft());

    await app.request("/api/worldgen/import-v2-card", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        role: "key",
        name: "Raven",
        description: "A mysterious traveler",
        personality: "Quiet",
        scenario: "Night",
        tags: ["Dark"],
        importMode: "outsider",
        locationNames: ["Tavern"],
        factionNames: ["Guild"],
      }),
    });

    const callInput = ingestMock.mock.calls[0]![0];
    expect(callInput.v2Card.importMode).toBe("outsider");
  });
});

// ---------------------------------------------------------------------------
// POST /save-character (untouched by Phase 60-04 — still uses draft directly)
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/save-character", () => {
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

    const firstInsertCall = mockValues.mock.calls[0] as unknown as [Record<string, unknown>] | undefined;
    const insertPayload = firstInsertCall?.[0];
    expect(insertPayload).toBeDefined();
    expect(insertPayload?.characterRecord).toBeDefined();
    expect(insertPayload?.derivedTags).toBeDefined();
  });

  it("materializes bounded opening-state status flags when saving structured start conditions", async () => {
    setActiveCampaign();
    const { mockValues } = createMockDb({
      locations: [{ id: "loc-1", name: "Tavern" }],
    });

    const draft = makePlayerDraft({
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: null,
        currentLocationName: "Tavern",
        relationshipRefs: [],
        socialStatus: [],
        originMode: "outsider",
      },
      startConditions: {
        startLocationId: "loc-1",
        arrivalMode: "on-foot",
        immediateSituation: "A tail is closing in as she slips through the market crowd.",
        entryPressure: ["under watch", "clock running out"],
        companions: ["Mira"],
        startingVisibility: "noticed",
        resolvedNarrative: "You arrive in the market with a tail behind you.",
        sourcePrompt: "Start in the market while being followed.",
      },
    });

    const res = await app.request("/api/worldgen/save-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        draft,
      }),
    });

    expect(res.status).toBe(200);

    const firstInsertCall = mockValues.mock.calls[0] as unknown as [Record<string, unknown>] | undefined;
    const insertPayload = firstInsertCall?.[0];
    const characterRecord = JSON.parse(String(insertPayload?.characterRecord ?? "{}")) as {
      startConditions: Record<string, unknown>;
      state: { statusFlags: string[] };
      socialContext: { currentLocationId: string | null; currentLocationName: string | null };
    };

    expect(characterRecord.socialContext.currentLocationId).toBe("loc-1");
    expect(characterRecord.startConditions).toMatchObject({
      startLocationId: "loc-1",
      arrivalMode: "on-foot",
      startingVisibility: "noticed",
      entryPressure: ["under watch", "clock running out"],
      companions: ["Mira"],
      immediateSituation: "A tail is closing in as she slips through the market crowd.",
    });
    expect(characterRecord.state.statusFlags).toEqual(
      expect.arrayContaining([
        "Opening: Arrival - On Foot",
        "Opening: Visibility - Noticed",
        "Opening: Pressure - Under Watch",
        "Opening: Pressure - Clock Running Out",
        "Opening: Companion Present",
        "Opening: Situation - Pursued",
      ]),
    );
  });

  it("starts a selected persistent sublocation at parent broad id plus concrete scene id", async () => {
    setActiveCampaign();
    const { mockValues } = createMockDb({
      locations: [
        {
          id: "loc-macro",
          name: "Dense Transit Ward",
          kind: "macro",
          parentLocationId: null,
        },
        {
          id: "loc-concourse",
          name: "Station Concourse",
          kind: "persistent_sublocation",
          parentLocationId: "loc-macro",
          isStarting: true,
        },
      ],
    });

    const draft = makePlayerDraft({
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: null,
        currentLocationName: "Station Concourse",
        relationshipRefs: [],
        socialStatus: [],
        originMode: "outsider",
      },
      startConditions: {
        startLocationId: "loc-concourse",
        arrivalMode: "escorted",
        immediateSituation: "A clerk is checking papers at the concourse gate.",
        entryPressure: ["under watch"],
        companions: [],
        startingVisibility: "noticed",
        resolvedNarrative: "You arrive at the concourse gate.",
        sourcePrompt: "Start in the concourse.",
      },
    });

    const res = await app.request("/api/worldgen/save-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        draft,
      }),
    });

    expect(res.status).toBe(200);
    const firstInsertCall = mockValues.mock.calls[0] as unknown as [Record<string, unknown>] | undefined;
    const insertPayload = firstInsertCall?.[0];
    expect(insertPayload?.currentLocationId).toBe("loc-macro");
    expect(insertPayload?.currentSceneLocationId).toBe("loc-concourse");

    const characterRecord = JSON.parse(String(insertPayload?.characterRecord ?? "{}")) as {
      socialContext: { currentLocationName: string | null };
      startConditions: { startLocationId: string | null };
      state: { statusFlags: string[] };
    };
    expect(characterRecord.socialContext.currentLocationName).toBe("Station Concourse");
    expect(characterRecord.startConditions.startLocationId).toBe("loc-concourse");
    expect(characterRecord.state.statusFlags).toEqual(
      expect.arrayContaining([
        "Opening: Arrival - Escorted",
        "Opening: Visibility - Noticed",
        "Opening: Pressure - Under Watch",
      ]),
    );
  });

  it("starts a selected macro location with matching broad and scene ids", async () => {
    setActiveCampaign();
    const { mockValues } = createMockDb({
      locations: [
        {
          id: "loc-macro",
          name: "Dense Transit Ward",
          kind: "macro",
          parentLocationId: null,
          isStarting: true,
        },
      ],
    });

    const draft = makePlayerDraft({
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: null,
        currentLocationName: "Dense Transit Ward",
        relationshipRefs: [],
        socialStatus: [],
        originMode: "outsider",
      },
      startConditions: {
        startLocationId: "loc-macro",
        arrivalMode: "settled",
        immediateSituation: "The character arrives at the main ward.",
        entryPressure: [],
        companions: [],
        startingVisibility: "expected",
        resolvedNarrative: "You arrive at the main ward.",
        sourcePrompt: null,
      },
    });

    const res = await app.request("/api/worldgen/save-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        draft,
      }),
    });

    expect(res.status).toBe(200);
    const firstInsertCall = mockValues.mock.calls[0] as unknown as [Record<string, unknown>] | undefined;
    const insertPayload = firstInsertCall?.[0];
    expect(insertPayload?.currentLocationId).toBe("loc-macro");
    expect(insertPayload?.currentSceneLocationId).toBe("loc-macro");
  });

  it("rejects a selected persistent sublocation whose parent row is missing", async () => {
    setActiveCampaign();
    createMockDb({
      locations: [
        {
          id: "loc-concourse",
          name: "Station Concourse",
          kind: "persistent_sublocation",
          parentLocationId: "missing-parent",
          isStarting: true,
        },
      ],
    });

    const draft = makePlayerDraft({
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: null,
        currentLocationName: "Station Concourse",
        relationshipRefs: [],
        socialStatus: [],
        originMode: "outsider",
      },
      startConditions: {
        startLocationId: "loc-concourse",
        arrivalMode: "settled",
        immediateSituation: "The character arrives in a broken scene row.",
        entryPressure: [],
        companions: [],
        startingVisibility: "expected",
        resolvedNarrative: "You arrive in a broken scene row.",
        sourcePrompt: null,
      },
    });

    const res = await app.request("/api/worldgen/save-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        draft,
      }),
    });

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      error: expect.stringContaining("parent"),
    });
  });

  it("loads the campaign by id when active session is missing", async () => {
    const campaign = {
      id: CAMPAIGN_ID,
      name: "Test",
      createdAt: "2026-01-01",
      premise: "A dark world",
    } as any;
    mockedGetActive.mockReturnValue(null);
    mockedLoadCampaign.mockResolvedValue(campaign);
    createMockDb({
      locations: [{ id: "loc-1", name: "Tavern" }],
    });

    const draft = makePlayerDraft();
    const res = await app.request("/api/worldgen/save-character", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, draft }),
    });

    expect(res.status).toBe(200);
    expect(mockedLoadCampaign).toHaveBeenCalledWith(CAMPAIGN_ID);
  });
});

// ---------------------------------------------------------------------------
// POST /resolve-starting-location (untouched by Phase 60-04)
// ---------------------------------------------------------------------------
describe("POST /api/worldgen/resolve-starting-location", () => {
  it("returns first isStarting location when no prompt", async () => {
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
      locationId: "loc-2",
      locationName: "Tavern",
      startConditions: {
        startLocationId: "loc-2",
        arrivalMode: "settled",
        immediateSituation: "You begin in Tavern.",
        entryPressure: [],
        companions: [],
        startingVisibility: "expected",
        resolvedNarrative: null,
        sourcePrompt: null,
      },
      narrative: null,
    } as any);

    const res = await app.request("/api/worldgen/resolve-starting-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.locationId).toBe("loc-2");
    expect(body.locationName).toBe("Tavern");
    expect(body.startConditions.startLocationId).toBe("loc-2");
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
      locationId: "loc-1",
      locationName: "Forest",
      startConditions: {
        startLocationId: "loc-1",
        arrivalMode: "on-foot",
        immediateSituation: "You arrive at the edge of the dark forest.",
        entryPressure: [],
        companions: [],
        startingVisibility: "noticed",
        resolvedNarrative: "You arrive at the edge of the dark forest.",
        sourcePrompt: "I want to start in the forest",
      },
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
    expect(body.startConditions.arrivalMode).toBe("on-foot");
    expect(body.narrative).toBe("You arrive at the edge of the dark forest.");
    expect(mockedResolveStart).toHaveBeenCalled();
  });
});
