import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../campaign/index.js", () => ({
  readCampaignConfig: vi.fn(),
}));

vi.mock("../location-events.js", () => ({
  listRecentLocationEvents: vi.fn(),
}));

vi.mock("../../vectors/episodic-events.js", () => ({
  readPendingCommittedEvents: vi.fn(() => []),
}));

import { getDb } from "../../db/index.js";
import { readCampaignConfig } from "../../campaign/index.js";
import { listRecentLocationEvents } from "../location-events.js";
import { readPendingCommittedEvents } from "../../vectors/episodic-events.js";
import { locations, npcs, players } from "../../db/schema.js";
import { assembleAuthoritativeScene } from "../scene-assembly.js";
import type { WorldBrainSceneDirection } from "../world-brain.js";

const CAMPAIGN_ID = "scene-assembly-phase-68";

function createMockDb(options: {
  playerRow?: Record<string, unknown>;
  locationRows?: Array<Record<string, unknown>>;
  npcRows?: Array<Record<string, unknown>>;
} = {}) {
  const playerRow = options.playerRow ?? {
    id: "player-1",
    campaignId: CAMPAIGN_ID,
    name: "Hero",
    hp: 5,
    tags: "[]",
    equippedItems: "[]",
    race: "Human",
    gender: "",
    age: "",
    appearance: "",
    currentLocationId: "loc-1",
    currentSceneLocationId: "scene-1",
    characterRecord: JSON.stringify({
      identity: {
        id: "player-1",
        campaignId: CAMPAIGN_ID,
        role: "player",
        tier: "key",
        displayName: "Hero",
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
        currentLocationName: "Town Square",
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
  };

  const locationRows = options.locationRows ?? [
    {
      id: "scene-1",
      campaignId: CAMPAIGN_ID,
      name: "Town Square",
      description: "A tense square between market stalls.",
      tags: '["urban","tense"]',
      connectedTo: "[]",
    },
  ];

  const npcRows = options.npcRows ?? [
    {
      id: "npc-1",
      campaignId: CAMPAIGN_ID,
      name: "Jiraiya",
      tags: "[]",
      currentLocationId: "loc-1",
      currentSceneLocationId: "scene-1",
    },
  ];

  let lastTable: unknown = null;
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation((table: unknown) => {
      lastTable = table;
      return mockDb;
    }),
    where: vi.fn().mockImplementation(() => {
      if (lastTable === (players as unknown)) {
        return {
          get: vi.fn().mockReturnValue(playerRow),
          all: vi.fn().mockReturnValue([playerRow]),
        };
      }
      if (lastTable === (locations as unknown)) {
        return {
          get: vi.fn().mockReturnValue(locationRows[0] ?? null),
          all: vi.fn().mockReturnValue(locationRows),
        };
      }
      if (lastTable === (npcs as unknown)) {
        return {
          get: vi.fn().mockReturnValue(npcRows[0] ?? null),
          all: vi.fn().mockReturnValue(npcRows),
        };
      }
      return {
        get: vi.fn().mockReturnValue(null),
        all: vi.fn().mockReturnValue([]),
      };
    }),
  };

  return mockDb;
}

function createSceneDirection(overrides: Partial<WorldBrainSceneDirection> = {}): WorldBrainSceneDirection {
  return {
    situationSummary: "A tense pocket encounter crystallizes around the player.",
    sceneQuestion: "Who moves first in this first contact?",
    focalActorNames: ["Hero", "Jiraiya"],
    backgroundActorNames: [],
    presenceReasons: [
      { actorName: "Hero", reason: "The player action creates the local pivot.", perceivable: true },
      { actorName: "Jiraiya", reason: "He is already on this scene pocket and tracking the disturbance.", perceivable: true },
      { actorName: "Jiraiya", reason: "He is reading the player through a hidden threat-model.", perceivable: false },
    ],
    causalBeats: [
      { summary: "The first exchange is about assessing intent, not immediate total escalation.", perceivable: true },
      { summary: "A hidden line of evaluation remains unspoken behind the visible exchange.", perceivable: false },
    ],
    narrationGuardrails: ["Keep the narration anchored to the immediate exchange."],
    ...overrides,
  };
}

describe("assembleAuthoritativeScene world-brain handoff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readCampaignConfig).mockReturnValue({
      name: "Phase 68 Scene Assembly Test",
      premise: "A bounded test world for authoritative scene assembly.",
      createdAt: Date.now(),
      currentTick: 5,
    });
    vi.mocked(listRecentLocationEvents).mockReturnValue([]);
    vi.mocked(readPendingCommittedEvents).mockReturnValue([]);
    vi.mocked(getDb).mockReturnValue(createMockDb() as unknown as ReturnType<typeof getDb>);
  });

  it("stores raw sceneDirection and filters playerPerceivableSceneDirection from the same packet", () => {
    const sceneDirection = createSceneDirection();

    const scene = assembleAuthoritativeScene({
      campaignId: CAMPAIGN_ID,
      currentLocationId: "loc-1",
      currentSceneScopeId: "scene-1",
      pendingEventTicks: [5],
      toolCalls: [],
      playerLabel: "Hero",
      sceneDirection,
    });

    expect(scene.sceneDirection).toEqual(
      expect.objectContaining({
        focalActorNames: ["Hero", "Jiraiya"],
      }),
    );
    expect(scene.playerPerceivableSceneDirection).toEqual(
      expect.objectContaining({
        focalActorNames: ["Hero", "Jiraiya"],
      }),
    );
    expect(scene.playerPerceivableSceneDirection?.presenceReasons).toEqual([
      { actorName: "Hero", reason: "The player action creates the local pivot.", perceivable: true },
      { actorName: "Jiraiya", reason: "He is already on this scene pocket and tracking the disturbance.", perceivable: true },
    ]);
    expect(scene.playerPerceivableSceneDirection?.causalBeats).toEqual([
      { summary: "The first exchange is about assessing intent, not immediate total escalation.", perceivable: true },
    ]);
  });

  it("drops stale world-brain actor claims when authoritative scene effects and presence disagree", () => {
    const sceneDirection = createSceneDirection({
      focalActorNames: ["Ghost Watcher"],
      backgroundActorNames: [],
      presenceReasons: [
        { actorName: "Ghost Watcher", reason: "A stale pre-tool guess put this actor in frame.", perceivable: true },
      ],
    });

    const scene = assembleAuthoritativeScene({
      campaignId: CAMPAIGN_ID,
      currentLocationId: "loc-1",
      currentSceneScopeId: "scene-1",
      pendingEventTicks: [5],
      toolCalls: [
        {
          tool: "spawn_npc",
          args: { name: "Summoned Warden", locationName: "Town Square", tags: ["guardian"] },
          result: { success: true, result: { id: "npc-2", name: "Summoned Warden", locationId: "scene-1", locationName: "Town Square" } },
        },
      ],
      playerLabel: "Hero",
      sceneDirection,
    });

    expect(scene.sceneEffects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          summary: "Summoned Warden becomes visibly present in the scene.",
        }),
      ]),
    );
    expect(scene.sceneDirection?.focalActorNames).toEqual(["Hero"]);
    expect(scene.sceneDirection?.presenceReasons).toEqual([]);
    expect(scene.playerPerceivableSceneDirection?.presenceReasons).toEqual([]);
  });

  it("does not turn failed tool calls or scene-local log_event beats into player-facing scene effects", () => {
    const scene = assembleAuthoritativeScene({
      campaignId: CAMPAIGN_ID,
      currentLocationId: "loc-1",
      currentSceneScopeId: "scene-1",
      pendingEventTicks: [5],
      toolCalls: [
        {
          tool: "spawn_npc",
          args: { name: "Outpost Cook", locationName: "Forest Outpost", tags: ["cook"] },
          result: { success: false, error: "Location is not legal for this player turn." },
        },
        {
          tool: "log_event",
          args: {
            text: "Hero paid for coffee.",
            importance: 2,
            participants: ["Hero"],
            durability: "scene_local",
          },
          result: { success: true, result: { durability: "scene_local", persisted: false } },
        },
      ],
      playerLabel: "Hero",
    });

    expect(scene.sceneEffects.map((effect) => effect.summary)).not.toContain(
      "Outpost Cook becomes visibly present in the scene.",
    );
    expect(scene.sceneEffects.map((effect) => effect.summary)).not.toContain(
      "Hero paid for coffee.",
    );
    expect(scene.playerPerceivableConsequences.join("\n")).not.toContain("Forest Outpost");
    expect(scene.playerPerceivableConsequences.join("\n")).not.toContain("paid for coffee");
  });

  it("summarizes spawn_npc only when the authoritative result location matches the current scene", () => {
    const scene = assembleAuthoritativeScene({
      campaignId: CAMPAIGN_ID,
      currentLocationId: "loc-1",
      currentSceneScopeId: "scene-1",
      pendingEventTicks: [5],
      toolCalls: [
        {
          tool: "spawn_npc",
          args: { name: "Outpost Cook", locationName: "Forest Outpost", tags: ["cook"] },
          result: {
            success: true,
            result: {
              id: "npc-remote",
              name: "Outpost Cook",
              locationId: "forest-outpost",
              locationName: "Forest Outpost",
            },
          },
        },
        {
          tool: "spawn_npc",
          args: { name: "Cafe Clerk", locationName: "Forest Outpost", tags: ["service"] },
          result: {
            success: true,
            result: {
              id: "npc-local",
              name: "Cafe Clerk",
              locationId: "scene-1",
              locationName: "Town Square",
            },
          },
        },
      ],
      playerLabel: "Hero",
    });

    const summaries = scene.sceneEffects.map((effect) => effect.summary);
    expect(summaries).toContain("Cafe Clerk becomes visibly present in the scene.");
    expect(summaries).not.toContain("Outpost Cook becomes visibly present in the scene.");
    expect(scene.playerPerceivableConsequences.join("\n")).not.toContain("Forest Outpost");
  });

  it("filters pending committed events before both scene effects and recent context", () => {
    vi.mocked(readPendingCommittedEvents).mockReturnValue([
      {
        id: "event-local",
        text: "Hero promised Jiraiya to return before dusk.",
        tick: 5,
        location: "Town Square",
        participants: ["Hero", "Jiraiya"],
        importance: 7,
        type: "event",
      },
      {
        id: "event-remote",
        text: "A cook at Forest Outpost served dinner.",
        tick: 5,
        location: "Forest Outpost",
        participants: ["Outpost Cook"],
        importance: 2,
        type: "event",
      },
    ]);

    const scene = assembleAuthoritativeScene({
      campaignId: CAMPAIGN_ID,
      currentLocationId: "loc-1",
      currentSceneScopeId: "scene-1",
      pendingEventTicks: [5],
      toolCalls: [],
      playerLabel: "Hero",
    });

    expect(scene.sceneEffects.map((effect) => effect.summary)).toContain(
      "Hero promised Jiraiya to return before dusk.",
    );
    expect(scene.recentContext.map((entry) => entry.summary)).toContain(
      "Hero promised Jiraiya to return before dusk.",
    );
    expect(scene.sceneEffects.map((effect) => effect.summary)).not.toContain(
      "A cook at Forest Outpost served dinner.",
    );
    expect(scene.recentContext.map((entry) => entry.summary)).not.toContain(
      "A cook at Forest Outpost served dinner.",
    );
  });
});
