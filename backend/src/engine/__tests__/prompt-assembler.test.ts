import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the module under test
vi.mock("../../campaign/index.js", () => ({
  readCampaignConfig: vi.fn(),
  getChatHistory: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../location-events.js", () => ({
  listRecentLocationEvents: vi.fn(),
}));

vi.mock("../../vectors/lore-cards.js", () => ({
  searchLoreCards: vi.fn(),
}));

vi.mock("../../vectors/embeddings.js", () => ({
  embedTexts: vi.fn(),
}));

import {
  assembleFinalNarrationPrompt,
  assemblePrompt,
  type AssembleOptions,
} from "../prompt-assembler.js";
import type { SceneAssembly } from "../scene-assembly.js";
import { readCampaignConfig, getChatHistory } from "../../campaign/index.js";
import { getDb } from "../../db/index.js";
import { listRecentLocationEvents } from "../location-events.js";
import { searchLoreCards } from "../../vectors/lore-cards.js";
import { embedTexts } from "../../vectors/embeddings.js";
import {
  players as playersTable,
  npcs as npcsTable,
  locations as locationsTable,
  items as itemsTable,
  relationships as relationshipsTable,
  chronicle as chronicleTable,
  factions as factionsTable,
  locationRecentEvents as locationRecentEventsTable,
} from "../../db/schema.js";
import {
  buildNarratorPacket,
  type CanonicalTurnPacket,
  type NarratorPacket,
} from "../narrator-packet.js";
import type { SceneFrame } from "../scene-frame.js";

const mockedListRecentLocationEvents = vi.mocked(listRecentLocationEvents);

type EqualityFilter = {
  key: string;
  value: unknown;
};

function rowKeyForColumn(columnName: string): string | null {
  switch (columnName) {
    case "campaign_id":
      return "campaignId";
    case "current_location_id":
      return "currentLocationId";
    case "current_scene_location_id":
      return "currentSceneLocationId";
    case "location_id":
      return "locationId";
    case "owner_id":
      return "ownerId";
    case "id":
    case "name":
      return columnName;
    default:
      return null;
  }
}

function collectEqualityFilters(condition: unknown): EqualityFilter[] {
  const chunks = (condition as { queryChunks?: unknown[] } | null)?.queryChunks;
  if (!Array.isArray(chunks)) {
    return [];
  }

  const filters: EqualityFilter[] = [];
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index] as {
      name?: string;
      queryChunks?: unknown[];
    } | null;
    if (chunk?.queryChunks) {
      filters.push(...collectEqualityFilters(chunk));
      continue;
    }

    const key = typeof chunk?.name === "string" ? rowKeyForColumn(chunk.name) : null;
    const maybeParam = chunks[index + 2] as { value?: unknown; constructor?: { name?: string } } | null;
    if (key && maybeParam?.constructor?.name === "Param") {
      filters.push({ key, value: maybeParam.value });
    }
  }

  return filters;
}

function applyWhereFilter(
  rows: Record<string, unknown>[],
  condition: unknown,
): Record<string, unknown>[] {
  const filters = collectEqualityFilters(condition);
  if (filters.length === 0) {
    return rows;
  }

  return rows.filter((row) =>
    filters.every(({ key, value }) =>
      Object.prototype.hasOwnProperty.call(row, key)
        ? row[key] === value
        : true,
    ),
  );
}

// Helper to create a mock Drizzle DB that returns data based on table reference identity
function createMockDb(overrides: {
  players?: Record<string, unknown>[];
  locations?: Record<string, unknown>[];
  npcs?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
  relationships?: Record<string, unknown>[];
  chronicle?: Record<string, unknown>[];
  factions?: Record<string, unknown>[];
  locationRecentEvents?: Record<string, unknown>[];
} = {}) {
  // Map table references to override keys
  const tableMap = new Map<unknown, Record<string, unknown>[]>([
    [playersTable, overrides.players ?? []],
    [locationsTable, overrides.locations ?? []],
    [npcsTable, overrides.npcs ?? []],
    [itemsTable, overrides.items ?? []],
    [relationshipsTable, overrides.relationships ?? []],
    [chronicleTable, overrides.chronicle ?? []],
    [factionsTable, overrides.factions ?? []],
    [locationRecentEventsTable, overrides.locationRecentEvents ?? []],
  ]);

  const selectFn = vi.fn().mockImplementation((_columns?: unknown) => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      const data = tableMap.get(table) ?? [];
      const queryForRows = (rows: Record<string, unknown>[]) => ({
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(rows),
          }),
          all: vi.fn().mockReturnValue(rows),
        }),
        all: vi.fn().mockReturnValue(rows),
        get: vi.fn().mockReturnValue(rows[0]),
      });

      return {
        where: vi.fn().mockImplementation((condition: unknown) =>
          queryForRows(applyWhereFilter(data, condition)),
        ),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(data),
          }),
          all: vi.fn().mockReturnValue(data),
        }),
        all: vi.fn().mockReturnValue(data),
        get: vi.fn().mockReturnValue(data[0]),
      };
    }),
  }));

  return { select: selectFn };
}

const defaultOptions: AssembleOptions = {
  campaignId: "test-campaign-123",
  contextWindow: 8192,
};

const baseAwarenessSnapshot = {
  contract: {
    clear: "Full present-scene actor context. Identity and direct interaction are justified.",
    hint: "Bounded indirect presence signal only. No identity leakage in player-facing surfaces.",
    none: "Outside encounter scope for this consumer. Omit from player-facing prompt surfaces.",
  },
  byNpcName: {},
  clearNpcNames: [],
  hintSignals: [],
};

const createSceneAssembly = (
  sceneModeHints: {
    tags?: string[];
    sceneEffects?: SceneAssembly["sceneEffects"];
    sceneDirection?: SceneAssembly["sceneDirection"];
    playerPerceivableSceneDirection?: SceneAssembly["playerPerceivableSceneDirection"];
    openingState?: {
      active: boolean;
      entryPressure?: string[];
      immediateSituation?: string | null;
      promptLines?: string[];
      sceneContextLines?: string[];
    } | null;
    playerAction?: string;
  } = {},
) => ({
  openingScene: false,
  openingState: sceneModeHints.openingState
    ? {
      active: sceneModeHints.openingState.active,
      locationId: "scene-1",
      locationName: "Scenario Hall",
      arrivalMode: null,
      startingVisibility: "noticed",
      immediateSituation: sceneModeHints.openingState.immediateSituation ?? null,
      entryPressure: sceneModeHints.openingState.entryPressure ?? [],
      promptLines: sceneModeHints.openingState.promptLines ?? [],
      sceneContextLines: sceneModeHints.openingState.sceneContextLines ?? [],
    }
    : null,
  currentScene: {
    id: "scene-1",
    name: "Scenario Hall",
    description: "A tense platform with no clear boundaries.",
    tags: sceneModeHints.tags ?? [],
  },
  presentNpcNames: [],
  sceneDirection: sceneModeHints.sceneDirection ?? null,
  playerPerceivableSceneDirection: sceneModeHints.playerPerceivableSceneDirection ?? null,
  awareness: baseAwarenessSnapshot,
  recentContext: [],
  sceneEffects: (sceneModeHints.sceneEffects as SceneAssembly["sceneEffects"]) ?? [],
  playerPerceivableConsequences: [],
});

const packetPlayerId = "11111111-1111-4111-8111-111111111111";
const packetClearActorId = "22222222-2222-4222-8222-222222222222";
const packetHintActorId = "33333333-3333-4333-8333-333333333333";
const packetHiddenActorId = "44444444-4444-4444-8444-444444444444";
const packetEventId = "55555555-5555-4555-8555-555555555555";
const packetResponseId = "66666666-6666-4666-8666-666666666666";
const packetActionId = "77777777-7777-4777-8777-777777777777";
const packetLocationId = "88888888-8888-4888-8888-888888888888";

function createNarratorPacket(
  packetOverrides: Partial<CanonicalTurnPacket> = {},
): NarratorPacket {
  const frame: SceneFrame = {
    campaignId: "test-campaign-123",
    tick: 33,
    playerActorId: packetPlayerId,
    currentLocationId: packetLocationId,
    currentSceneScopeId: packetLocationId,
    playerAction: "I keep my palms open.",
    roster: {
      active: [
        {
          id: packetPlayerId,
          type: "player",
          label: "Iria",
          locationId: packetLocationId,
          sceneScopeId: packetLocationId,
          awareness: "clear",
        },
        {
          id: packetClearActorId,
          type: "npc",
          label: "Mira",
          locationId: packetLocationId,
          sceneScopeId: packetLocationId,
          awareness: "clear",
        },
      ],
      support: [
        {
          id: packetHintActorId,
          type: "npc",
          label: "hint actor",
          locationId: packetLocationId,
          sceneScopeId: packetLocationId,
          awareness: "hint",
          awarenessHint: "A shutter shifts above the alley.",
        },
      ],
      background: [
        {
          id: packetHiddenActorId,
          type: "npc",
          label: "hidden actor",
          locationId: packetLocationId,
          sceneScopeId: null,
          awareness: "none",
        },
      ],
    },
    perception: {
      playerAwarenessHints: ["A shutter shifts above the alley."],
      actorAwareness: {
        [packetPlayerId]: {
          [packetClearActorId]: "clear",
          [packetHintActorId]: "hint",
          [packetHiddenActorId]: "none",
        },
      },
      forbiddenActorIds: [packetHintActorId, packetHiddenActorId],
      forbiddenActorLabels: ["hint actor", "hidden actor"],
    },
    recentEvents: [],
    targetCandidates: [],
    movementCandidates: [],
    deferredHooks: [],
    allowedTools: ["log_event"],
    oracle: { outcome: "weak_hit" },
  };
  const canonicalTurnPacket: CanonicalTurnPacket = {
    campaignId: "test-campaign-123",
    tick: 33,
    playerAction: "I keep my palms open.",
    oracleOutcome: "weak_hit",
    narratorFacts: {
      anchorEventId: packetEventId,
      eventIds: [packetEventId],
      responseIds: [packetResponseId],
      actionIds: [packetActionId],
      toolResultRefs: [{ actionId: packetActionId, toolName: "log_event" }],
    },
    anchorEvent: {
      id: packetEventId,
      actorId: packetPlayerId,
      kind: "player_action",
      summary: "Iria keeps both palms open.",
      perceivableByPlayer: true,
    },
    events: [
      {
        id: packetEventId,
        actorId: packetPlayerId,
        kind: "player_action",
        summary: "Iria keeps both palms open.",
        perceivableByPlayer: true,
      },
    ],
    responses: [
      {
        id: packetResponseId,
        actorId: packetClearActorId,
        responseKind: "gesture",
        eventId: packetEventId,
        summary: "Mira lowers the knife without dropping her guard.",
        visibleToPlayer: true,
      },
    ],
    effects: [
      {
        id: `effect-${packetActionId}`,
        actionId: packetActionId,
        actorId: packetClearActorId,
        toolName: "log_event",
        summary: "Mira lowers the knife without dropping her guard.",
        perceivableByPlayer: true,
        toolResult: { success: true, result: { eventId: packetEventId } },
      },
    ],
    actionResults: [
      {
        order: 0,
        actionId: packetActionId,
        actionRef: packetActionId,
        actorId: packetClearActorId,
        toolName: "log_event",
        input: {
          text: "Mira lowers the knife without dropping her guard.",
          importance: 4,
          participants: ["Mira", "Iria"],
        },
        args: {
          text: "Mira lowers the knife without dropping her guard.",
          importance: 4,
          participants: ["Mira", "Iria"],
        },
        result: { success: true, result: { eventId: packetEventId } },
      },
    ],
    guardrails: ["Use the committed packet only."],
    controlReturnReason: "Return control after Mira's immediate visible response.",
    ...packetOverrides,
  };

  return buildNarratorPacket({ frame, canonicalTurnPacket });
}

describe("assemblePrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    vi.mocked(readCampaignConfig).mockReturnValue({
      name: "Test Campaign",
      premise: "A dark fantasy world where magic is fading.",
      createdAt: Date.now(),
      generationComplete: true,
    });

    vi.mocked(getChatHistory).mockReturnValue([]);

    vi.mocked(getDb).mockReturnValue(createMockDb() as unknown as ReturnType<typeof getDb>);
    mockedListRecentLocationEvents.mockReturnValue([]);
  });

  it("returns formatted string containing [SYSTEM RULES] and [WORLD PREMISE]", async () => {
    const result = await assemblePrompt(defaultOptions);
    expect(result.formatted).toContain("[SYSTEM RULES]");
    expect(result.formatted).toContain("[WORLD PREMISE]");
  });

  it("includes premise text in [WORLD PREMISE] section", async () => {
    const result = await assemblePrompt(defaultOptions);
    expect(result.formatted).toContain("A dark fantasy world where magic is fading.");
  });

  it("includes [PLAYER STATE] section when player data exists", async () => {
    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        players: [
          {
            id: "p1",
            campaignId: "test-campaign-123",
            name: "Elara",
            race: "Elf",
            gender: "Female",
            age: "120",
            appearance: "Silver hair",
            hp: 5,
            tags: '["brave","archer"]',
            equippedItems: '["longbow"]',
            currentLocationId: null,
          },
        ],
      }) as unknown as ReturnType<typeof getDb>
    );

    const result = await assemblePrompt(defaultOptions);
    expect(result.formatted).toContain("[PLAYER STATE]");
    expect(result.formatted).toContain("Elara");
  });

  it("omits [PLAYER STATE] section when no player exists", async () => {
    const result = await assemblePrompt(defaultOptions);
    // Check sections array -- [PLAYER STATE] text appears in SYSTEM_RULES instructions
    // but there should be no dedicated PLAYER STATE section
    expect(result.sections.find((s) => s.name === "PLAYER STATE")).toBeUndefined();
  });

  it("omits [SCENE] section when no location exists", async () => {
    const result = await assemblePrompt(defaultOptions);
    // Check sections array instead of formatted string, because SYSTEM_RULES
    // text mentions "[SCENE]" in the FORBIDDEN list
    expect(result.sections.find((s) => s.name === "SCENE")).toBeUndefined();
  });

  it("includes [ACTION RESULT] when actionResult is provided", async () => {
    const result = await assemblePrompt({
      ...defaultOptions,
      actionResult: {
        chance: 75,
        roll: 42,
        outcome: "success",
        reasoning: "The warrior's training paid off.",
      },
    });
    expect(result.formatted).toContain("[ACTION RESULT]");
    expect(result.formatted).toContain("success");
    expect(result.formatted).toContain("75");
  });

  it("includes [LORE CONTEXT] with term: definition format when lore cards available", async () => {
    vi.mocked(embedTexts).mockResolvedValue([[0.1, 0.2, 0.3]]);
    vi.mocked(searchLoreCards).mockResolvedValue([
      { id: "l1", term: "Arcane Blight", definition: "A corruption that destroys magic.", category: "concept", vector: [0.1] },
      { id: "l2", term: "Ironhold", definition: "A fortress city of the dwarves.", category: "location", vector: [0.2] },
    ]);

    const result = await assemblePrompt({
      ...defaultOptions,
      embedderResult: {
        resolved: {
          provider: { id: "emb", name: "Embedder", baseUrl: "http://localhost", apiKey: "key", model: "embed-model" },
          temperature: 0,
          maxTokens: 512,
        },
      },
      playerAction: "I investigate the ancient ruins",
    });

    expect(result.formatted).toContain("[LORE CONTEXT]");
    expect(result.formatted).toContain("Arcane Blight");
    expect(result.formatted).toContain("A corruption that destroys magic.");
  });

  it("skips lore section gracefully when embedder not configured", async () => {
    const result = await assemblePrompt({
      ...defaultOptions,
      embedderResult: { error: "Not configured", status: 400 },
      playerAction: "I investigate",
    });
    // Check sections array instead of formatted string, because SYSTEM_RULES
    // text mentions "[LORE CONTEXT]" in the FORBIDDEN list
    expect(result.sections.find((s) => s.name === "LORE CONTEXT")).toBeUndefined();
  });

  it("totalTokens is within contextWindow", async () => {
    const result = await assemblePrompt(defaultOptions);
    expect(result.totalTokens).toBeLessThanOrEqual(defaultOptions.contextWindow);
  });

  it("budgetUsed is a percentage 0-100", async () => {
    const result = await assemblePrompt(defaultOptions);
    expect(result.budgetUsed).toBeGreaterThanOrEqual(0);
    expect(result.budgetUsed).toBeLessThanOrEqual(100);
  });

  it("sections array contains PromptSection objects", async () => {
    const result = await assemblePrompt(defaultOptions);
    expect(result.sections.length).toBeGreaterThan(0);
    for (const section of result.sections) {
      expect(section).toHaveProperty("name");
      expect(section).toHaveProperty("priority");
      expect(section).toHaveProperty("content");
      expect(section).toHaveProperty("estimatedTokens");
      expect(section).toHaveProperty("canTruncate");
    }
  });

  it("includes recent conversation when chat history exists", async () => {
    vi.mocked(getChatHistory).mockReturnValue([
      { role: "user", content: "I open the door" },
      { role: "assistant", content: "The door creaks open revealing a dark corridor." },
    ]);

    const result = await assemblePrompt(defaultOptions);
    expect(result.formatted).toContain("[RECENT CONVERSATION]");
    expect(result.formatted).toContain("I open the door");
  });

  it("can omit recent conversation when the caller already supplies message history separately", async () => {
    vi.mocked(getChatHistory).mockReturnValue([
      { role: "user", content: "I open the door" },
      { role: "assistant", content: "The door creaks open revealing a dark corridor." },
    ]);

    const result = await assemblePrompt({
      ...defaultOptions,
      includeRecentConversation: false,
    });

    expect(result.sections.find((section) => section.name === "RECENT CONVERSATION")).toBeUndefined();
  });

  it("surfaces recent happenings for the current location, including archived ephemeral scene spillover", async () => {
    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        players: [
          {
            id: "p1",
            campaignId: "test-campaign-123",
            name: "Elara",
            race: "Human",
            gender: "",
            age: "",
            appearance: "",
            hp: 5,
            tags: "[]",
            equippedItems: "[]",
            currentLocationId: "loc-1",
          },
        ],
        locations: [
          {
            id: "loc-1",
            campaignId: "test-campaign-123",
            name: "Shibuya Crossing",
            description: "A loud macro location packed with civilians.",
            tags: '["macro"]',
            connectedTo: '["loc-2"]',
          },
        ],
      }) as unknown as ReturnType<typeof getDb>
    );
    mockedListRecentLocationEvents.mockReturnValue([
      {
        id: "evt-1",
        campaignId: "test-campaign-123",
        locationId: "loc-1",
        sourceLocationId: "scene-1",
        anchorLocationId: "loc-1",
        sourceEventId: "episodic-1",
        threadId: null,
        surfaceRoute: null,
        visibility: "player_perceivable",
        knowledgeRoute: null,
        hiddenCauseTerms: "[]",
        eventType: "ephemeral_scene",
        summary: "The archived ephemeral scene left cursed residue on the crossing.",
        tick: 14,
        importance: 4,
        archivedAtTick: 15,
        createdAt: 1700000000000,
      },
    ]);

    const result = await assemblePrompt(defaultOptions);

    expect(result.formatted).toContain("Recent happenings here:");
    expect(result.formatted).toContain("archived ephemeral scene");
    expect(result.formatted).toContain("cursed residue on the crossing");
    expect(mockedListRecentLocationEvents).toHaveBeenCalledWith({
      campaignId: "test-campaign-123",
      locationRef: "loc-1",
      limit: 5,
    });
  });

  it("uses an honest bounded fallback when the current location has no recent history", async () => {
    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        players: [
          {
            id: "p1",
            campaignId: "test-campaign-123",
            name: "Elara",
            race: "Human",
            gender: "",
            age: "",
            appearance: "",
            hp: 5,
            tags: "[]",
            equippedItems: "[]",
            currentLocationId: "loc-1",
          },
        ],
        locations: [
          {
            id: "loc-1",
            campaignId: "test-campaign-123",
            name: "Quiet Shrine",
            description: "Still and empty.",
            tags: '["macro"]',
            connectedTo: "[]",
          },
        ],
      }) as unknown as ReturnType<typeof getDb>,
    );
    mockedListRecentLocationEvents.mockReturnValue([]);

    const result = await assemblePrompt(defaultOptions);

    expect(result.formatted).toContain("Recent happenings here: none in the last 50 ticks.");
  });

  it("builds final narration context from scene effects, opening state, and player-perceivable consequences instead of a premise-only fallback", async () => {
    vi.mocked(readCampaignConfig).mockReturnValue({
      name: "Opening Scene Campaign",
      premise: "A disgraced courier carries state secrets through a city on the brink of revolt.",
      currentTick: 14,
      createdAt: Date.now(),
      generationComplete: true,
    });

    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        players: [
          {
            id: "p1",
            campaignId: "test-campaign-123",
            name: "Iria",
            race: "Human",
            gender: "",
            age: "",
            appearance: "",
            hp: 5,
            tags: "[]",
            equippedItems: "[]",
            currentLocationId: "loc-1",
            characterRecord: JSON.stringify({
              identity: {
                id: "p1",
                campaignId: "test-campaign-123",
                role: "player",
                tier: "key",
                displayName: "Iria",
                canonicalStatus: "original",
              },
              profile: {
                species: "Human",
                gender: "",
                ageText: "",
                appearance: "",
                backgroundSummary: "",
                personaSummary: "",
              },
              socialContext: {
                factionId: null,
                factionName: null,
                homeLocationId: null,
                homeLocationName: null,
                currentLocationId: "loc-1",
                currentLocationName: "Ash Market",
                relationshipRefs: [],
                socialStatus: [],
                originMode: "outsider",
              },
              motivations: {
                shortTermGoals: [],
                longTermGoals: [],
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
              startConditions: {
                startLocationId: "loc-1",
                arrivalMode: "on-foot",
                immediateSituation: "City watch lanterns sweep the market while you keep the satchel hidden.",
                entryPressure: ["under watch", "clock running out"],
                companions: [],
                startingVisibility: "noticed",
              },
              provenance: {
                sourceKind: "generator",
                importMode: null,
                templateId: null,
                archetypePrompt: null,
                worldgenOrigin: null,
                legacyTags: [],
              },
            }),
          },
        ],
        locations: [
          {
            id: "loc-1",
            campaignId: "test-campaign-123",
            name: "Ash Market",
            description: "Canvas stalls sag under smoke while merchants whisper behind shuttered lamps.",
            tags: '["market", "tense"]',
            connectedTo: "[]",
          },
        ],
      }) as unknown as ReturnType<typeof getDb>,
    );
    mockedListRecentLocationEvents.mockReturnValue([
      {
        id: "evt-2",
        campaignId: "test-campaign-123",
        locationId: "loc-1",
        sourceLocationId: "loc-1",
        anchorLocationId: "loc-1",
        sourceEventId: "episodic-2",
        threadId: null,
        surfaceRoute: null,
        visibility: "player_perceivable",
        knowledgeRoute: null,
        hiddenCauseTerms: "[]",
        eventType: "scene_effect",
        summary: "A warning bell and bootsteps ripple through the stalls nearby.",
        tick: 14,
        importance: 3,
        archivedAtTick: null,
        createdAt: 1700000000000,
      },
    ]);

    const result = await assembleFinalNarrationPrompt({
      campaignId: "test-campaign-123",
      contextWindow: 8192,
      sceneAssembly: {
        openingScene: true,
        openingState: {
          active: true,
          locationId: "loc-1",
          locationName: "Ash Market",
          arrivalMode: "on-foot",
          startingVisibility: "noticed",
          immediateSituation:
            "City watch lanterns sweep the market while you keep the satchel hidden.",
          entryPressure: ["under watch", "clock running out"],
          promptLines: ["Opening Pressure: under watch, clock running out"],
          sceneContextLines: ["Opening Constraints: The market is already under close scrutiny."],
        },
        currentScene: {
          id: "loc-1",
          name: "Ash Market",
          description:
            "Canvas stalls sag under smoke while merchants whisper behind shuttered lamps.",
          tags: ["market", "tense"],
        },
        presentNpcNames: ["Mira"],
        sceneDirection: null,
        playerPerceivableSceneDirection: null,
        awareness: {
          contract: {
            clear: "Full present-scene actor context. Identity and direct interaction are justified.",
            hint: "Bounded indirect presence signal only. No identity leakage in player-facing surfaces.",
            none: "Outside encounter scope for this consumer. Omit from player-facing prompt surfaces.",
          },
          byNpcName: {
            Mira: "clear",
          },
          clearNpcNames: ["Mira"],
          hintSignals: [],
        },
        recentContext: [
          {
            tick: 14,
            summary: "A warning bell and bootsteps ripple through the stalls nearby.",
            source: "location_recent_event",
          },
        ],
        sceneEffects: [
          {
            id: "effect-1",
            kind: "opening",
            source: "opening_state",
            summary:
              "City watch lanterns sweep the market while you keep the satchel hidden.",
            perceivable: true,
            actor: "player",
            target: null,
            locationId: "loc-1",
            causalDetail: "Opening state remains active.",
          },
          {
            id: "effect-2",
            kind: "environment",
            source: "recent_context",
            summary: "A warning bell and bootsteps ripple through the stalls nearby.",
            perceivable: true,
            actor: null,
            target: null,
            locationId: "loc-1",
            causalDetail: "Player-perceivable same-turn spillover.",
          },
        ],
        playerPerceivableConsequences: [
          "City watch lanterns sweep the market while you keep the satchel hidden.",
          "A warning bell and bootsteps ripple through the stalls nearby.",
        ],
      },
    });

    expect(result.prompt).toContain("[OPENING STATE]");
    expect(result.prompt).toContain("City watch lanterns sweep the market while you keep the satchel hidden.");
    expect(result.prompt).toContain("[SCENE EFFECTS]");
    expect(result.prompt).toContain("A warning bell and bootsteps ripple through the stalls nearby.");
    expect(result.prompt).toContain("player-perceivable=yes");
  });

  it("keeps hidden but present actors in hidden prompt context while excluding same broad-location outsiders", async () => {
    vi.mocked(readCampaignConfig).mockReturnValue({
      name: "Encounter Scope Campaign",
      premise: "Shibuya breaks into several immediate scenes at once.",
      currentTick: 21,
      createdAt: Date.now(),
      generationComplete: true,
    });

    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        players: [
          {
            id: "p1",
            campaignId: "test-campaign-123",
            name: "Yuji",
            hp: 5,
            tags: "[]",
            equippedItems: "[]",
            currentLocationId: "loc-1",
            currentSceneLocationId: "scene-platform-7",
            characterRecord: JSON.stringify({
              identity: {
                id: "p1",
                campaignId: "test-campaign-123",
                role: "player",
                tier: "key",
                displayName: "Yuji",
                canonicalStatus: "original",
              },
              profile: {
                species: "Human",
                gender: "",
                ageText: "",
                appearance: "",
                backgroundSummary: "",
                personaSummary: "",
              },
              socialContext: {
                factionId: null,
                factionName: null,
                homeLocationId: null,
                homeLocationName: null,
                currentLocationId: "loc-1",
                currentLocationName: "Shibuya Station",
                relationshipRefs: [],
                socialStatus: [],
                originMode: "resident",
              },
              motivations: {
                shortTermGoals: [],
                longTermGoals: [],
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
                sourceKind: "generator",
                importMode: null,
                templateId: null,
                archetypePrompt: null,
                worldgenOrigin: null,
                legacyTags: [],
              },
            }),
          },
        ],
        locations: [
          {
            id: "scene-platform-7",
            campaignId: "test-campaign-123",
            name: "Platform 7",
            description: "A concrete platform inside the larger station district.",
            tags: '["encounter-scope"]',
            connectedTo: "[]",
          },
          {
            id: "loc-1",
            campaignId: "test-campaign-123",
            name: "Shibuya Station",
            description: "A district-scale location with several active encounter pockets.",
            tags: '["macro"]',
            connectedTo: "[]",
          },
        ],
        npcs: [
          {
            id: "n1",
            campaignId: "test-campaign-123",
            name: "Nanami",
            persona: "Focused and direct",
            tags: '["sorcerer"]',
            tier: "key",
            currentLocationId: "loc-1",
            currentSceneLocationId: "scene-platform-7",
            goals: '{"short_term":["Protect Yuji"],"long_term":[]}',
            beliefs: '["Stay on mission"]',
            characterRecord: JSON.stringify({
              identity: {
                id: "n1",
                campaignId: "test-campaign-123",
                role: "npc",
                tier: "key",
                displayName: "Nanami",
                canonicalStatus: "original",
              },
              profile: {
                species: "Human",
                gender: "",
                ageText: "",
                appearance: "",
                backgroundSummary: "",
                personaSummary: "Focused and direct",
              },
              socialContext: {
                factionId: null,
                factionName: null,
                homeLocationId: null,
                homeLocationName: null,
                currentLocationId: "loc-1",
                currentLocationName: "Shibuya Station",
                relationshipRefs: [],
                socialStatus: [],
                originMode: "resident",
              },
              motivations: {
                shortTermGoals: ["Protect Yuji"],
                longTermGoals: [],
                beliefs: ["Stay on mission"],
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
                sourceKind: "generator",
                importMode: null,
                templateId: null,
                archetypePrompt: null,
                worldgenOrigin: null,
                legacyTags: [],
              },
            }),
            derivedTags: '["sorcerer"]',
          },
          {
            id: "n-hidden",
            campaignId: "test-campaign-123",
            name: "Choso",
            persona: "Concealed on the catwalk directly above the platform",
            tags: '["sorcerer","hidden"]',
            tier: "key",
            currentLocationId: "loc-1",
            currentSceneLocationId: "scene-platform-7",
            goals: '{"short_term":["Hold position above Yuji"],"long_term":[]}',
            beliefs: '["Do not reveal yourself yet"]',
            characterRecord: JSON.stringify({
              identity: {
                id: "n-hidden",
                campaignId: "test-campaign-123",
                role: "npc",
                tier: "key",
                displayName: "Choso",
                canonicalStatus: "original",
              },
              profile: {
                species: "Human",
                gender: "",
                ageText: "",
                appearance: "",
                backgroundSummary: "",
                personaSummary: "Concealed on the catwalk directly above the platform",
              },
              socialContext: {
                factionId: null,
                factionName: null,
                homeLocationId: null,
                homeLocationName: null,
                currentLocationId: "loc-1",
                currentLocationName: "Shibuya Station",
                relationshipRefs: [],
                socialStatus: [],
                originMode: "resident",
              },
              motivations: {
                shortTermGoals: ["Hold position above Yuji"],
                longTermGoals: [],
                beliefs: ["Do not reveal yourself yet"],
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
                conditions: ["Hidden"],
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
                sourceKind: "generator",
                importMode: null,
                templateId: null,
                archetypePrompt: null,
                worldgenOrigin: null,
                legacyTags: [],
              },
            }),
            derivedTags: '["sorcerer","hidden"]',
          },
          {
            id: "n-outside",
            campaignId: "test-campaign-123",
            name: "Gojo",
            persona: "Watching from another encounter pocket",
            tags: '["sorcerer","same-broad-location-only"]',
            tier: "key",
            currentLocationId: "loc-1",
            currentSceneLocationId: "rooftop-overwatch",
            goals: '{"short_term":["Observe from the rooftop"],"long_term":[]}',
            beliefs: '["Do not reveal yourself yet"]',
            characterRecord: JSON.stringify({
              identity: {
                id: "n-outside",
                campaignId: "test-campaign-123",
                role: "npc",
                tier: "key",
                displayName: "Gojo",
                canonicalStatus: "original",
              },
              profile: {
                species: "Human",
                gender: "",
                ageText: "",
                appearance: "",
                backgroundSummary: "",
                personaSummary: "Watching from another encounter pocket",
              },
              socialContext: {
                factionId: null,
                factionName: null,
                homeLocationId: null,
                homeLocationName: null,
                currentLocationId: "loc-1",
                currentLocationName: "Shibuya Station",
                relationshipRefs: [],
                socialStatus: [],
                originMode: "resident",
              },
              motivations: {
                shortTermGoals: ["Observe from the rooftop"],
                longTermGoals: [],
                beliefs: ["Do not reveal yourself yet"],
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
                conditions: ["Hidden"],
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
                sourceKind: "generator",
                importMode: null,
                templateId: null,
                archetypePrompt: null,
                worldgenOrigin: null,
                legacyTags: [],
              },
            }),
            derivedTags: '["sorcerer","same-broad-location-only"]',
          },
        ],
      }) as unknown as ReturnType<typeof getDb>,
    );

    const hiddenPrompt = await assemblePrompt({
      campaignId: "test-campaign-123",
      contextWindow: 8192,
      storytellerPass: "hidden-tool-driving",
      includeRecentConversation: false,
    });

    expect(hiddenPrompt.formatted).toContain("[ENCOUNTER SCOPE]");
    expect(hiddenPrompt.formatted).toContain("Immediate encounter: Platform 7");
    expect(hiddenPrompt.formatted).toContain("clear=Full present-scene actor context");
    expect(hiddenPrompt.formatted).toContain("hint=Bounded indirect presence signal only");
    expect(hiddenPrompt.formatted).toContain("Nanami");
    expect(hiddenPrompt.formatted).toContain("Choso");
    expect(hiddenPrompt.formatted).toContain("Encounter awareness: hint");
    expect(hiddenPrompt.formatted).not.toContain("Gojo");

    const result = await assembleFinalNarrationPrompt({
      campaignId: "test-campaign-123",
      contextWindow: 8192,
      sceneAssembly: {
        openingScene: false,
        openingState: null,
        currentScene: {
          id: "scene-platform-7",
          name: "Platform 7",
          description: "A concrete platform inside the larger station district.",
          tags: ["encounter-scope"],
        },
        presentNpcNames: ["Nanami"],
        sceneDirection: null,
        playerPerceivableSceneDirection: null,
        awareness: {
          contract: {
            clear: "Full present-scene actor context. Identity and direct interaction are justified.",
            hint: "Bounded indirect presence signal only. No identity leakage in player-facing surfaces.",
            none: "Outside encounter scope for this consumer. Omit from player-facing prompt surfaces.",
          },
          byNpcName: {
            Nanami: "clear",
            Choso: "hint",
          },
          clearNpcNames: ["Nanami"],
          hintSignals: ["A pressure shift suggests someone hidden but present above the platform."],
        },
        recentContext: [
          {
            tick: 21,
            summary: "A pressure shift suggests someone hidden but present above the platform.",
            source: "location_recent_event",
          },
        ],
        sceneEffects: [
          {
            id: "scope-1",
            kind: "environment",
            source: "recent_context",
            summary: "A pressure shift suggests someone hidden but present above the platform.",
            perceivable: true,
            actor: null,
            target: null,
            locationId: "scene-platform-7",
            causalDetail: "Encounter scope should hint without revealing identity.",
          },
        ],
        playerPerceivableConsequences: [
          "Nanami squares up beside you.",
          "A pressure shift suggests someone hidden but present above the platform.",
        ],
      },
    });

    expect(result.prompt).toContain("Nanami");
    expect(result.prompt).toContain("hidden but present");
    expect(result.prompt).not.toContain("Choso");
    expect(result.prompt).not.toContain("Gojo");
  });

  it("includes same-scene NPC equipment when broad location is the parent macro and excludes sibling equipment", async () => {
    vi.mocked(readCampaignConfig).mockReturnValue({
      name: "Dense Runtime Prompt Campaign",
      premise: "A dense transit ward has multiple current scene pockets.",
      currentTick: 31,
      createdAt: Date.now(),
      generationComplete: true,
    });

    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        players: [
          {
            id: "p-scoped",
            campaignId: "test-campaign-123",
            name: "Mara",
            race: "Human",
            gender: "",
            age: "",
            appearance: "",
            hp: 5,
            tags: "[]",
            equippedItems: "[]",
            currentLocationId: "macro-transit",
            currentSceneLocationId: "scene-concourse",
            characterRecord: "{}",
            derivedTags: "[]",
          },
        ],
        locations: [
          {
            id: "macro-transit",
            campaignId: "test-campaign-123",
            name: "Dense Transit Ward",
            description: "A macro transit ward containing separate persistent spaces.",
            tags: '["macro"]',
            connectedTo: '["scene-concourse","scene-rooftop"]',
          },
          {
            id: "scene-concourse",
            campaignId: "test-campaign-123",
            name: "Station Concourse",
            description: "The immediate sublocation where the player is standing.",
            tags: '["persistent_sublocation"]',
            connectedTo: '["macro-transit"]',
          },
          {
            id: "scene-rooftop",
            campaignId: "test-campaign-123",
            name: "Rooftop Service Corridor",
            description: "A sibling sublocation above the concourse.",
            tags: '["persistent_sublocation"]',
            connectedTo: '["macro-transit"]',
          },
        ],
        npcs: [
          {
            id: "npc-same-scene",
            campaignId: "test-campaign-123",
            name: "Concourse Warden",
            persona: "Watching the same concourse as the player.",
            tags: '["clear"]',
            tier: "key",
            currentLocationId: "macro-transit",
            currentSceneLocationId: "scene-concourse",
            goals: '{"short_term":["Keep the concourse orderly"],"long_term":[]}',
            beliefs: "[]",
            unprocessedImportance: 0,
            inactiveTicks: 0,
            createdAt: 1,
            characterRecord: "{}",
            derivedTags: '["clear"]',
          },
          {
            id: "npc-sibling-scene",
            campaignId: "test-campaign-123",
            name: "Rooftop Runner",
            persona: "Working in a different sublocation under the same macro.",
            tags: '["clear"]',
            tier: "persistent",
            currentLocationId: "macro-transit",
            currentSceneLocationId: "scene-rooftop",
            goals: '{"short_term":["Relay rooftop status"],"long_term":[]}',
            beliefs: "[]",
            unprocessedImportance: 0,
            inactiveTicks: 0,
            createdAt: 1,
            characterRecord: "{}",
            derivedTags: '["clear"]',
          },
        ],
        items: [
          {
            id: "item-scene-map",
            campaignId: "test-campaign-123",
            name: "Concourse route map",
            tags: "[]",
            ownerId: null,
            locationId: "scene-concourse",
            equipState: "carried",
            equippedSlot: null,
            isSignature: false,
          },
          {
            id: "item-same-baton",
            campaignId: "test-campaign-123",
            name: "Signal baton",
            tags: "[]",
            ownerId: "npc-same-scene",
            locationId: null,
            equipState: "equipped",
            equippedSlot: "hand",
            isSignature: false,
          },
          {
            id: "item-sibling-lens",
            campaignId: "test-campaign-123",
            name: "Rooftop lens",
            tags: "[]",
            ownerId: "npc-sibling-scene",
            locationId: null,
            equipState: "equipped",
            equippedSlot: "hand",
            isSignature: false,
          },
        ],
      }) as unknown as ReturnType<typeof getDb>,
    );

    const result = await assemblePrompt({
      ...defaultOptions,
      storytellerPass: "hidden-tool-driving",
      includeRecentConversation: false,
    });

    const sceneSection = result.sections.find((section) => section.name === "SCENE");
    expect(sceneSection?.content).toContain("Location: Station Concourse");
    expect(sceneSection?.content).toContain("Items here: Concourse route map");
    expect(sceneSection?.content).toContain("Concourse Warden: Signal baton");
    expect(sceneSection?.content).not.toContain("Rooftop Runner");
    expect(sceneSection?.content).not.toContain("Rooftop lens");

    expect(result.formatted).toContain("Clear actors: Concourse Warden");
    expect(result.formatted).not.toContain("Clear actors: Concourse Warden, Rooftop Runner");
  });

  it("keeps encounter actors visible when the player is stored at a persistent sublocation", async () => {
    vi.mocked(readCampaignConfig).mockReturnValue({
      name: "Persistent Sublocation Prompt Campaign",
      premise: "A pier sits inside a larger canal district.",
      currentTick: 32,
      createdAt: Date.now(),
      generationComplete: true,
    });

    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        players: [
          {
            id: "p-pier",
            campaignId: "test-campaign-123",
            name: "Mira",
            race: "Human",
            gender: "",
            age: "",
            appearance: "",
            hp: 5,
            tags: "[]",
            equippedItems: "[]",
            currentLocationId: "scene-pier",
            currentSceneLocationId: "scene-pier",
            characterRecord: "{}",
            derivedTags: "[]",
          },
        ],
        locations: [
          {
            id: "macro-canal",
            campaignId: "test-campaign-123",
            name: "Canal Market District",
            description: "A broad canal district.",
            kind: "macro",
            parentLocationId: null,
            tags: '["macro"]',
            connectedTo: '["scene-pier"]',
          },
          {
            id: "scene-pier",
            campaignId: "test-campaign-123",
            name: "Lantern-Lit Gondola Pier",
            description: "The immediate pier under the market district.",
            kind: "persistent_sublocation",
            parentLocationId: "macro-canal",
            tags: '["persistent_sublocation"]',
            connectedTo: '["macro-canal"]',
          },
          {
            id: "scene-rooftop",
            campaignId: "test-campaign-123",
            name: "Rooftop Service Corridor",
            description: "A sibling sublocation.",
            kind: "persistent_sublocation",
            parentLocationId: "macro-canal",
            tags: '["persistent_sublocation"]',
            connectedTo: '["macro-canal"]',
          },
        ],
        npcs: [
          {
            id: "npc-gondolier",
            campaignId: "test-campaign-123",
            name: "Gondolier",
            persona: "Waiting at the pier.",
            tags: '["clear"]',
            tier: "temporary",
            currentLocationId: "macro-canal",
            currentSceneLocationId: "scene-pier",
            goals: '{"short_term":["Name the route marker"],"long_term":[]}',
            beliefs: "[]",
            unprocessedImportance: 0,
            inactiveTicks: 0,
            createdAt: 1,
            characterRecord: "{}",
            derivedTags: '["clear"]',
          },
          {
            id: "npc-rooftop",
            campaignId: "test-campaign-123",
            name: "Rooftop Runner",
            persona: "Working in another pocket.",
            tags: '["clear"]',
            tier: "persistent",
            currentLocationId: "macro-canal",
            currentSceneLocationId: "scene-rooftop",
            goals: '{"short_term":["Relay rooftop status"],"long_term":[]}',
            beliefs: "[]",
            unprocessedImportance: 0,
            inactiveTicks: 0,
            createdAt: 1,
            characterRecord: "{}",
            derivedTags: '["clear"]',
          },
        ],
      }) as unknown as ReturnType<typeof getDb>,
    );

    const result = await assemblePrompt({
      ...defaultOptions,
      storytellerPass: "hidden-tool-driving",
      includeRecentConversation: false,
    });

    expect(result.formatted).toContain("Immediate encounter: Lantern-Lit Gondola Pier");
    expect(result.formatted).toContain("Broad location anchor: macro-canal");
    expect(result.formatted).toContain("Clear actors: Gondolier");
    expect(result.formatted).not.toContain("Clear actors: Gondolier, Rooftop Runner");
  });

  it("uses NarratorPacket as authoritative final-visible packet without leaking hidden fields or backend guard metadata", async () => {
    const narratorPacket = createNarratorPacket();

    const result = await assembleFinalNarrationPrompt({
      campaignId: "test-campaign-123",
      contextWindow: 8192,
      sceneAssembly: createSceneAssembly(),
      narratorPacket,
    });

    expect(result.prompt).toContain("[NARRATOR PACKET]");
    expect(result.prompt).toContain("[RP BEAT DIRECTIVE]");
    expect(result.prompt).toContain("one playable RPG/VN beat");
    expect(result.prompt).toContain("Treat NarratorPacket events, effects, and tool results as the only authority");
    expect(result.prompt).toContain("keep it unconfirmed");
    expect(result.prompt).toContain("Stop when the scene reaches a live next decision");
    expect(result.prompt).toContain("Use the NarratorPacket as the authoritative committed packet.");
    expect(result.prompt).toMatch(/\[PRESENT ACTORS\]\n- Mira\b/);
    expect(result.prompt).not.toContain("No other present actors are confirmed in the current scene.");
    expect(result.prompt).toContain("Player action request:");
    expect(result.prompt).toContain("player-supplied claims, not authoritative world state");
    expect(result.prompt).toContain("Treat the raw player action as an attempted request");
    expect(result.prompt).toContain("Do not narrate claimed possessions");
    expect(result.prompt).toContain("without placing the claimed object in the player's hand");
    expect(result.prompt).toContain("When the packet has no perceivable effects");
    expect(result.prompt).toContain("do not introduce any reusable prop, route, hazard, document, authority, promise, injury, movement, changed position, or new named fact");
    expect(result.prompt).toContain("If NarratorPacket has no perceivable effects");
    expect(result.prompt).toContain("keep the beat alive through existing visible actors");
    expect(result.prompt).toContain("End on a concrete playable next moment");
    expect(result.prompt).toContain("Iria keeps both palms open.");
    expect(result.prompt).toContain("Mira lowers the knife without dropping her guard.");
    expect(result.prompt).not.toContain("hiddenRationale");
    expect(result.prompt).not.toContain("plannedActions");
    expect(result.prompt).not.toContain("hidden actor");
    expect(result.prompt).not.toContain("hint actor");
    expect(result.prompt).not.toContain("forbiddenActorNames");
    expect(result.prompt).not.toContain("forbiddenFactMarkers");
    expect(result.prompt).not.toContain(`hidden-actor:${packetHiddenActorId}`);
  });

  it("isolates NarratorPacket final-visible prompts from sceneAssembly failed or skipped effect prose", async () => {
    const narratorPacket = createNarratorPacket();
    const sceneAssembly = createSceneAssembly({
      sceneEffects: [
        {
          id: "failed-effect",
          kind: "state_change",
          source: "recent_context",
          summary: "FAILED SENTINEL: the locked door opens and the alarm goes silent.",
          perceivable: true,
          actor: null,
          target: null,
          locationId: "scene-1",
          causalDetail: "This came from a failed tool-step expectation.",
        },
        {
          id: "hidden-effect",
          kind: "state_change",
          source: "recent_context",
          summary: "HIDDEN SENTINEL: a private offscreen actor changes rooms.",
          perceivable: false,
          actor: null,
          target: null,
          locationId: "scene-1",
          causalDetail: "This is not player-facing.",
        },
      ],
    }) as SceneAssembly;
    sceneAssembly.playerPerceivableConsequences = [
      "SKIPPED SENTINEL: Mira finds a spare key.",
    ];

    const result = await assembleFinalNarrationPrompt({
      campaignId: "test-campaign-123",
      contextWindow: 8192,
      sceneAssembly,
      narratorPacket,
    });

    expect(result.prompt).toContain("[SETTLED PACKET EFFECTS]");
    expect(result.prompt).toContain("Mira lowers the knife without dropping her guard.");
    expect(result.prompt).not.toContain("[SCENE EFFECTS]");
    expect(result.prompt).not.toContain("[PLAYER-PERCEIVABLE CONSEQUENCES]");
    expect(result.prompt).not.toContain("FAILED SENTINEL");
    expect(result.prompt).not.toContain("HIDDEN SENTINEL");
    expect(result.prompt).not.toContain("SKIPPED SENTINEL");
  });

  it("isolates NarratorPacket final-visible prompts from broad world memory and recent conversation", async () => {
    vi.mocked(readCampaignConfig).mockReturnValue({
      name: "Outpost Leak Regression",
      premise: "Forest Outpost exists elsewhere in the campaign.",
      createdAt: Date.now(),
      currentTick: 44,
      generationComplete: true,
    });
    vi.mocked(getChatHistory).mockReturnValue([
      { role: "assistant", content: "Earlier, Forest Outpost reported a quiet dinner." },
      { role: "user", content: "I pay the cafe clerk and sit by the window." },
      { role: "assistant", content: "The cafe clerk starts the griddle and coffee drips behind the counter." },
      { role: "user", content: "Continue scene." },
    ]);
    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        chronicle: [
          { tick: 43, text: "Forest Outpost changed its watch rotation." },
        ],
        factions: [
          { id: "f1", name: "Forest Outpost Watch", tags: "[]", goals: "[]" },
        ],
      }) as unknown as ReturnType<typeof getDb>,
    );

    const sceneAssembly = createSceneAssembly() as SceneAssembly;
    sceneAssembly.currentScene = {
      id: "shibuya-scene",
      name: "Shibuya Kissaten",
      description: "A narrow cafe booth under warm lights.",
      tags: ["urban", "cafe"],
    };
    sceneAssembly.presentNpcNames = ["Cafe Clerk"];
    sceneAssembly.recentContext = [
      {
        tick: 44,
        summary: "Tiamat calls out for service at the Forest Outpost.",
        source: "location_recent_event",
      },
    ];
    const narratorPacket = createNarratorPacket();
    narratorPacket.forbiddenPrivateTerms = ["Forest Outpost"];

    const result = await assembleFinalNarrationPrompt({
      campaignId: "test-campaign-123",
      contextWindow: 8192,
      sceneAssembly,
      narratorPacket,
      playerAction: "I ask how much the coffee costs.",
    });

    expect(result.prompt).toContain("Shibuya Kissaten");
    expect(result.prompt).toMatch(/\[PRESENT ACTORS\]\n- Mira\b/);
    expect(result.prompt).not.toContain("[PRESENT ACTORS]\n- Cafe Clerk");
    expect(result.prompt).toContain("[RECENT VISIBLE TRANSCRIPT]");
    expect(result.prompt).toContain("The cafe clerk starts the griddle and coffee drips behind the counter.");
    expect(result.prompt).not.toContain("[RECENT LOCAL CONTEXT]");
    expect(result.prompt).not.toContain("Forest Outpost");
    expect(result.assembledBase.formatted).not.toContain("Forest Outpost");
    expect(result.assembledBase.sections.find((section) => section.name === "WORLD STATE")).toBeUndefined();
    expect(result.assembledBase.sections.find((section) => section.name === "RECENT CONVERSATION")).toBeUndefined();
  });

  it("pins final narration language from the current player action over unrelated recent chat", async () => {
    vi.mocked(readCampaignConfig).mockReturnValue({
      name: "Urban Occult Crossover",
      premise: "Tokyo sorcerers test a chakra anomaly before Shibuya.",
      createdAt: Date.now(),
      currentTick: 12,
      generationComplete: true,
    });
    vi.mocked(getChatHistory).mockReturnValue([
      { role: "assistant", content: "Клерк протирает стойку и смотрит на дверь." },
      { role: "user", content: "продолжай" },
    ]);

    const result = await assembleFinalNarrationPrompt({
      campaignId: "test-campaign-123",
      contextWindow: 8192,
      sceneAssembly: createSceneAssembly(),
      playerAction: "I ask the cafe clerk how much the coffee costs.",
    });

    expect(result.system).toContain("SESSION RESPONSE LANGUAGE");
    expect(result.system).toContain("Output language: English.");
    expect(result.system).toContain("Do not switch language because of operator locale");
    expect(result.prompt).toContain("SESSION RESPONSE LANGUAGE");
    expect(result.prompt).toContain("Output language: English.");
  });

  it("omits hidden action result roll data from final-visible prompts", async () => {
    const result = await assembleFinalNarrationPrompt({
      campaignId: "test-campaign-123",
      contextWindow: 8192,
      sceneAssembly: createSceneAssembly(),
      actionResult: {
        chance: 75,
        roll: 42,
        outcome: "success",
        reasoning: "Internal judge math should stay hidden.",
      },
      playerAction: "I press for an opening.",
    });

    expect(result.prompt).not.toMatch(/\n\[ACTION RESULT\]\n(?:Chance|Roll|Outcome|Reasoning):/);
    expect(result.prompt).not.toContain("Chance: 75%");
    expect(result.prompt).not.toContain("Roll: 42");
    expect(result.prompt).not.toContain("Reasoning: Internal judge math should stay hidden.");
    expect(result.assembledBase.sections.find((section) => section.name === "ACTION RESULT")).toBeUndefined();
  });

  it("does not expose context compression structured-output contracts to final-visible narration", async () => {
    const result = await assembleFinalNarrationPrompt({
      campaignId: "test-campaign-123",
      contextWindow: 8192,
      sceneAssembly: createSceneAssembly(),
      playerAction: "I keep watch.",
    });

    expect(result.system).not.toContain("STRUCTURED_OUTPUT_CONTRACT: context-compression.v1");
    expect(result.prompt).not.toContain("STRUCTURED_OUTPUT_CONTRACT: context-compression.v1");
    expect(result.assembledBase.formatted).not.toContain("STRUCTURED_OUTPUT_CONTRACT: context-compression.v1");
  });

  it("throws pre-prompt when NarratorPacket prose contains a forbidden actor name or fact marker", async () => {
    const unsafePacket = createNarratorPacket({
      anchorEvent: {
        id: packetEventId,
        actorId: packetPlayerId,
        kind: "player_action",
        summary: `hidden actor leaked hidden-actor:${packetHiddenActorId}`,
        perceivableByPlayer: true,
      },
      events: [
        {
          id: packetEventId,
          actorId: packetPlayerId,
          kind: "player_action",
          summary: `hidden actor leaked hidden-actor:${packetHiddenActorId}`,
          perceivableByPlayer: true,
        },
      ],
    });

    await expect(
      assembleFinalNarrationPrompt({
        campaignId: "test-campaign-123",
        contextWindow: 8192,
        sceneAssembly: createSceneAssembly(),
        narratorPacket: unsafePacket,
      }),
    ).rejects.toThrow(/NarratorPacket prompt unsafe/);
  });

  it("uses double newlines between sections", async () => {
    const result = await assemblePrompt(defaultOptions);
    // At minimum, [SYSTEM RULES] and [WORLD PREMISE] should be separated by double newline
    const systemIdx = result.formatted.indexOf("[SYSTEM RULES]");
    const premiseIdx = result.formatted.indexOf("[WORLD PREMISE]");
    expect(systemIdx).toBeLessThan(premiseIdx);
    // Check there's a double newline between them
    const between = result.formatted.substring(systemIdx, premiseIdx);
    expect(between).toContain("\n\n");
  });

  it("omits [WORLD STATE] section when no chronicle entries or factions exist", async () => {
    const result = await assemblePrompt(defaultOptions);
    expect(result.sections.find((s) => s.name === "WORLD STATE")).toBeUndefined();
  });

  it("includes [WORLD STATE] section with chronicle entries formatted as [Tick N] text", async () => {
    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        chronicle: [
          { tick: 10, text: "The Iron Guild expanded into Westmarch" },
          { tick: 15, text: "[WORLD EVENT] Plague sweeps eastern provinces" },
        ],
      }) as unknown as ReturnType<typeof getDb>
    );

    const result = await assemblePrompt(defaultOptions);
    const worldState = result.sections.find((s) => s.name === "WORLD STATE");
    expect(worldState).toBeDefined();
    expect(worldState!.content).toContain("[Tick 10]");
    expect(worldState!.content).toContain("[Tick 15]");
    expect(worldState!.content).toContain("Recent World Events");
  });

  it("includes faction summaries in [WORLD STATE] section", async () => {
    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        factions: [
          { id: "f1", name: "Iron Guild", tags: '["merchant","powerful"]', goals: '["control trade routes","expand territory"]' },
          { id: "f2", name: "Shadow Council", tags: '["secretive","political"]', goals: '["undermine the crown"]' },
        ],
      }) as unknown as ReturnType<typeof getDb>
    );

    const result = await assemblePrompt(defaultOptions);
    const worldState = result.sections.find((s) => s.name === "WORLD STATE");
    expect(worldState).toBeDefined();
    expect(worldState!.content).toContain("Active Factions");
    expect(worldState!.content).toContain("Iron Guild");
    expect(worldState!.content).toContain("Shadow Council");
  });

  it("WORLD STATE section has priority 3 and canTruncate true", async () => {
    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        chronicle: [
          { tick: 5, text: "Something happened" },
        ],
      }) as unknown as ReturnType<typeof getDb>
    );

    const result = await assemblePrompt(defaultOptions);
    const worldState = result.sections.find((s) => s.name === "WORLD STATE");
    expect(worldState).toBeDefined();
    expect(worldState!.priority).toBe(3);
    expect(worldState!.canTruncate).toBe(true);
  });

  it("includes [WORLD STATE] in formatted output when chronicle entries exist", async () => {
    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        chronicle: [
          { tick: 1, text: "The kingdom was founded" },
        ],
      }) as unknown as ReturnType<typeof getDb>
    );

    const result = await assemblePrompt(defaultOptions);
    expect(result.formatted).toContain("[WORLD STATE]");
  });

  it("hydrates canonical player and npc records before falling back to legacy prompt fields", async () => {
    const canonicalPlayer = {
      identity: {
        id: "p1",
        campaignId: "test-campaign-123",
        role: "player",
        tier: "key",
        displayName: "Elara",
        canonicalStatus: "original",
      },
      profile: {
        species: "Elf",
        gender: "Female",
        ageText: "120",
        appearance: "Silver hair",
        backgroundSummary: "A former royal scout.",
        personaSummary: "Calm and unsentimental.",
      },
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: "loc-1",
        currentLocationName: "Moonwell",
        relationshipRefs: [],
        socialStatus: ["Wanted"],
        originMode: "resident",
      },
      motivations: {
        shortTermGoals: ["Reach the tower"],
        longTermGoals: ["Break the eclipse curse"],
        beliefs: [],
        drives: ["Curious"],
        frictions: ["Guarded"],
      },
      capabilities: {
        traits: ["Observant"],
        skills: [{ name: "Tracker", tier: "Skilled" }],
        flaws: ["Stubborn"],
        specialties: [],
        wealthTier: "Comfortable",
      },
      state: {
        hp: 4,
        conditions: ["Wounded"],
        statusFlags: ["Hidden"],
        activityState: "active",
      },
      loadout: {
        inventorySeed: ["Moonbow"],
        equippedItemRefs: ["Moonbow"],
        currencyNotes: "",
        signatureItems: ["Moonbow"],
      },
      startConditions: {},
      provenance: {
        sourceKind: "generator",
        importMode: null,
        templateId: null,
        archetypePrompt: null,
        worldgenOrigin: null,
        legacyTags: ["legacy-player-only"],
      },
    };

    const canonicalNpc = {
      identity: {
        id: "n1",
        campaignId: "test-campaign-123",
        role: "npc",
        tier: "key",
        displayName: "Captain Mire",
        canonicalStatus: "original",
      },
      profile: {
        species: "Human",
        gender: "",
        ageText: "",
        appearance: "",
        backgroundSummary: "A veteran officer holding the line.",
        personaSummary: "Quietly furious at the council's failures.",
      },
      socialContext: {
        factionId: null,
        factionName: "Wardens",
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: "loc-1",
        currentLocationName: "Moonwell",
        relationshipRefs: [],
        socialStatus: ["Respected"],
        originMode: "resident",
      },
      motivations: {
        shortTermGoals: ["Hold the barricade"],
        longTermGoals: ["Rebuild the watch"],
        beliefs: ["The city can still be saved"],
        drives: ["Duty-bound"],
        frictions: ["Bitter"],
      },
      capabilities: {
        traits: ["Disciplined"],
        skills: [{ name: "Commander", tier: "Master" }],
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
        worldgenOrigin: "scaffold",
        legacyTags: ["legacy-npc-only"],
      },
    };

    vi.mocked(getDb).mockReturnValue(
      createMockDb({
        players: [
          {
            id: "p1",
            campaignId: "test-campaign-123",
            name: "Legacy Elara",
            race: "Legacy Race",
            gender: "Legacy Gender",
            age: "Legacy Age",
            appearance: "Legacy Appearance",
            hp: 4,
            characterRecord: JSON.stringify(canonicalPlayer),
            derivedTags: '["legacy-player-only"]',
            tags: '["legacy-player-only"]',
            equippedItems: '["legacy-bow"]',
            currentLocationId: "loc-1",
            currentSceneLocationId: "loc-1",
          },
        ],
        locations: [
          {
            id: "loc-1",
            campaignId: "test-campaign-123",
            name: "Moonwell",
            description: "A flooded plaza under a broken moon lens.",
            tags: '["quiet"]',
            connectedTo: "[]",
            kind: "persistent_sublocation",
          },
        ],
        npcs: [
          {
            id: "n1",
            campaignId: "test-campaign-123",
            name: "Legacy Mire",
            persona: "Legacy persona",
            characterRecord: JSON.stringify(canonicalNpc),
            derivedTags: '["legacy-npc-only"]',
            tags: '["legacy-npc-only"]',
            tier: "key",
            currentLocationId: "loc-1",
            currentSceneLocationId: "loc-1",
            goals: '{"short_term":["legacy goal"],"long_term":[]}',
            beliefs: '["legacy belief"]',
          },
        ],
      }) as unknown as ReturnType<typeof getDb>,
    );

    const result = await assemblePrompt(defaultOptions);

    expect(result.formatted).toContain("Race: Elf");
    expect(result.formatted).toContain("Wealth: Comfortable");
    expect(result.formatted).toContain("Tags: Observant, Skilled Tracker, Stubborn, Comfortable, Wounded, Hidden, Wanted, Curious, Guarded");
    expect(result.formatted).not.toContain("legacy-player-only");

    expect(result.formatted).toContain("Quietly furious at the council's failures.");
    expect(result.formatted).toContain("Goals: Hold the barricade; Rebuild the watch");
    expect(result.formatted).toContain("Beliefs: The city can still be saved");
    expect(result.formatted).not.toContain("Legacy persona");
    expect(result.formatted).not.toContain("legacy belief");
  });

  it("frames canonical character and start context before derived runtime tags in SYSTEM RULES", async () => {
    const result = await assemblePrompt(defaultOptions);
    const systemRules = result.sections.find((section) => section.name === "SYSTEM RULES");

    expect(systemRules).toBeDefined();
    expect(systemRules!.content).toContain("canonical character records");
    expect(systemRules!.content).toContain("derived runtime tags");
    expect(systemRules!.content).toContain("startConditions");
    expect(systemRules!.content).not.toContain(
      "All characters, items, locations, and factions use a tag-based system",
    );
  });

  it.each([
    {
      label: "combat",
      sceneAssembly: createSceneAssembly({
        tags: ["combat"],
      }),
      actionResult: {
        chance: 95,
        roll: 19,
        outcome: "strong_hit",
        reasoning: "A decisive strike lands.",
      },
      expectedLine: "Combat mode:",
      expectedBaseline: "Narration length is bounded.",
    },
    {
      label: "dialogue",
      sceneAssembly: createSceneAssembly({
        tags: ["dialogue"],
      }),
      playerAction: "I say we should negotiate and talk.",
      expectedLine: "Dialogue mode:",
      expectedBaseline: "Narration length is bounded.",
    },
    {
      label: "quiet",
      sceneAssembly: createSceneAssembly({
        tags: ["quiet"],
      }),
      playerAction: "I wait and watch the lanterns fade.",
      expectedLine: "quiet scene:",
      expectedBaseline: "Concrete nouns and actions are mandatory.",
    },
    {
      label: "horror",
      sceneAssembly: createSceneAssembly({
        openingState: {
          active: true,
          entryPressure: ["under watch", "clock running out"],
          immediateSituation: "A pressure shift gathers above the stairs.",
          promptLines: ["Opening Pressure: under watch, clocks failing"],
        },
      }),
      actionResult: {
        chance: 55,
        roll: 55,
        outcome: "neutral",
        reasoning: "The environment is unnerving.",
      },
      expectedLine: "Horror mode:",
      expectedBaseline: "Narration length is bounded.",
    },
  ])(
    "applies scene-adaptive $label guidance while keeping anti-slop baseline",
    async ({ sceneAssembly, playerAction, actionResult, expectedLine, expectedBaseline }) => {
      const result = await assemblePrompt({
        ...defaultOptions,
        storytellerPass: "hidden-tool-driving",
        sceneAssembly,
        playerAction: playerAction as string | undefined,
        actionResult: actionResult as AssembleOptions["actionResult"] | undefined,
      });

      const systemRules = result.sections.find((section) => section.name === "SYSTEM RULES")?.content ?? "";

      expect(systemRules).toContain(expectedLine);
      expect(systemRules).toContain(expectedBaseline);
      expect(systemRules).toContain("Keep anti-repetition");
      expect(systemRules.toLowerCase()).toContain("do not claim knowledge beyond player perception");
    },
  );

  it("injects the same bounded GLM preset into hidden and final-visible systems", async () => {
    const hiddenPrompt = await assemblePrompt({
      ...defaultOptions,
      storytellerPass: "hidden-tool-driving",
      sceneAssembly: createSceneAssembly({
        tags: ["combat"],
      }),
      actionResult: {
        chance: 80,
        roll: 20,
        outcome: "critical",
        reasoning: "A critical blow lands.",
      },
      playerAction: "I launch a flurry of blows",
    });

    const finalPrompt = await assembleFinalNarrationPrompt({
      campaignId: defaultOptions.campaignId,
      contextWindow: defaultOptions.contextWindow,
      sceneAssembly: createSceneAssembly({
        tags: ["combat"],
        openingState: {
          active: false,
        },
      }),
      actionResult: {
        chance: 80,
        roll: 20,
        outcome: "critical",
        reasoning: "A critical blow lands.",
      },
      playerAction: "I launch a flurry of blows",
    });

    expect(hiddenPrompt.sections.find((section) => section.name === "SYSTEM RULES")?.content).toContain(
      "GLM overlay: short, concrete turns are required.",
    );
    expect(finalPrompt.system).toContain("GLM visible pass overlay: stay tightly bounded and concrete.");
    expect(finalPrompt.system).toContain("Narration length is bounded.");
    expect(finalPrompt.system).toContain("plain scene truth first");
    expect(finalPrompt.system).toContain("mundane or tourist turns");
  });

  it("injects hidden world-brain direction for tool-driving and filtered direction for final-visible narration", async () => {
    const sceneDirection = {
      situationSummary: "A tense contact pocket crystallizes around the newcomer.",
      sceneQuestion: "Does Nanami hold the line or test the newcomer first?",
      focalActorNames: ["Hero", "Nanami"],
      backgroundActorNames: ["Choso"],
      presenceReasons: [
        {
          actorName: "Hero",
          reason: "The player arrival creates the local pivot.",
          perceivable: true,
        },
        {
          actorName: "Nanami",
          reason: "Nanami is already in the encounter scope and tracking the disturbance.",
          perceivable: true,
        },
        {
          actorName: "Choso",
          reason: "A hidden observer is tracking the scene from above.",
          perceivable: false,
        },
      ],
      causalBeats: [
        {
          summary: "Nanami measures intent before committing to escalation.",
          perceivable: true,
        },
        {
          summary: "A hidden observer is judging whether to surface.",
          perceivable: false,
        },
      ],
      narrationGuardrails: [
        "Keep the narration anchored to the immediate exchange.",
        "Do not reveal the hidden observer by name.",
      ],
    } satisfies NonNullable<SceneAssembly["sceneDirection"]>;

    const sceneAssembly = createSceneAssembly({
      sceneDirection,
      playerPerceivableSceneDirection: {
        ...sceneDirection,
        presenceReasons: sceneDirection.presenceReasons.filter((reason) => reason.perceivable),
        causalBeats: sceneDirection.causalBeats.filter((beat) => beat.perceivable),
      },
    });

    const hiddenPrompt = await assemblePrompt({
      ...defaultOptions,
      storytellerPass: "hidden-tool-driving",
      sceneAssembly,
      worldBrainDirection: sceneDirection,
    });

    const finalPrompt = await assembleFinalNarrationPrompt({
      campaignId: defaultOptions.campaignId,
      contextWindow: defaultOptions.contextWindow,
      sceneAssembly,
    });

    expect(hiddenPrompt.formatted).toContain("[WORLD-BRAIN DIRECTION]");
    expect(hiddenPrompt.formatted).toContain("Background actors: Choso");
    expect(hiddenPrompt.formatted).toContain("A hidden observer is judging whether to surface.");
    expect(hiddenPrompt.formatted).toContain("Do not reveal the hidden observer by name.");

    expect(finalPrompt.prompt).toContain("[SCENE DIRECTION]");
    expect(finalPrompt.prompt).toContain("[NARRATION GUARDRAILS]");
    expect(finalPrompt.prompt).toContain("First sentence must add new pressure");
    expect(finalPrompt.prompt).toContain("one concrete line, gesture, decision, or refusal");
    expect(finalPrompt.prompt).toContain("Nanami measures intent before committing to escalation.");
    expect(finalPrompt.prompt).toContain("Focal actors: Hero, Nanami");
    expect(finalPrompt.prompt).not.toContain("Background actors: Choso");
    expect(finalPrompt.prompt).not.toContain("Choso");
    expect(finalPrompt.prompt).not.toContain("A hidden observer is judging whether to surface.");
  });
});
