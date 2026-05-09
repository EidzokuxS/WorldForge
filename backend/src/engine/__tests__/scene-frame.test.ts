import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

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
  readPendingCommittedEvents: vi.fn(),
}));

import { readCampaignConfig } from "../../campaign/index.js";
import { getDb } from "../../db/index.js";
import { items, locationEdges, locations, npcs, players } from "../../db/schema.js";
import { readPendingCommittedEvents } from "../../vectors/episodic-events.js";
import { listRecentLocationEvents } from "../location-events.js";
import {
  SCENE_FRAME_MOVEMENT_CANDIDATE_LIMIT,
  SCENE_FRAME_RECENT_EVENT_LIMIT,
  SCENE_FRAME_TARGET_CANDIDATE_LIMIT,
  buildSceneFrameOracleContextForCandidate,
  buildSceneFrame,
  getSceneFramePlayerHints,
  getSceneFrameVisibleActorNames,
  type SceneFrame,
  type SceneFrameBuildOptions,
} from "../scene-frame.js";
import { runtimeToolInputSchemas } from "../tool-schemas.js";

const campaignId = "campaign-70-02";
const playerId = "11111111-1111-4111-8111-111111111111";
const clearNpcId = "22222222-2222-4222-8222-222222222222";
const hintNpcId = "33333333-3333-4333-8333-333333333333";
const backgroundNpcId = "44444444-4444-4444-8444-444444444444";
const broadLocationId = "55555555-5555-4555-8555-555555555555";
const sceneScopeId = "66666666-6666-4666-8666-666666666666";
const connectedLocationId = "77777777-7777-4777-8777-777777777777";
const itemId = "88888888-8888-4888-8888-888888888888";

function getDrizzleTableName(table: unknown): string | null {
  return (table as Record<PropertyKey, unknown>)?.[Symbol.for("drizzle:Name")] as string | null;
}

function createPlayerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: playerId,
    campaignId,
    name: "Player",
    race: "Human",
    gender: "",
    age: "",
    appearance: "",
    hp: 5,
    tags: '["player-visible"]',
    equippedItems: "[]",
    currentLocationId: broadLocationId,
    currentSceneLocationId: sceneScopeId,
    characterRecord: "{}",
    derivedTags: "[]",
    ...overrides,
  };
}

function createMockDb(options: {
  playerRows?: Array<Record<string, unknown>>;
  npcRows?: Array<Record<string, unknown>>;
  locationRows?: Array<Record<string, unknown>>;
  edgeRows?: Array<Record<string, unknown>>;
  itemRows?: Array<Record<string, unknown>>;
} = {}) {
  const state = {
    players: options.playerRows ?? [createPlayerRow()],
    npcs: options.npcRows ?? [
      {
        id: clearNpcId,
        campaignId,
        name: "Bridge Captain",
        persona: "A watch commander.",
        characterRecord: "{}",
        derivedTags: "[]",
        tags: '["guard"]',
        tier: "key",
        currentLocationId: broadLocationId,
        currentSceneLocationId: sceneScopeId,
        goals: '{"short_term":[],"long_term":[]}',
        beliefs: "[]",
        unprocessedImportance: 0,
        inactiveTicks: 0,
        createdAt: 1,
      },
      {
        id: hintNpcId,
        campaignId,
        name: "Veiled Scout",
        persona: "A half-seen observer.",
        characterRecord: "{}",
        derivedTags: "[]",
        tags: '["obscured"]',
        tier: "persistent",
        currentLocationId: broadLocationId,
        currentSceneLocationId: sceneScopeId,
        goals: '{"short_term":[],"long_term":[]}',
        beliefs: "[]",
        unprocessedImportance: 0,
        inactiveTicks: 0,
        createdAt: 1,
      },
      {
        id: backgroundNpcId,
        campaignId,
        name: "Roof Archer",
        persona: "Outside the immediate scene pocket.",
        characterRecord: "{}",
        derivedTags: "[]",
        tags: '["guard"]',
        tier: "persistent",
        currentLocationId: broadLocationId,
        currentSceneLocationId: "99999999-9999-4999-8999-999999999999",
        goals: '{"short_term":[],"long_term":[]}',
        beliefs: "[]",
        unprocessedImportance: 0,
        inactiveTicks: 0,
        createdAt: 1,
      },
    ],
    locations: options.locationRows ?? [
      {
        id: broadLocationId,
        campaignId,
        name: "Market District",
        description: "A broad district.",
        kind: "macro",
        parentLocationId: null,
        anchorLocationId: null,
        persistence: "persistent",
        expiresAtTick: null,
        archivedAtTick: null,
        tags: '["district"]',
        isStarting: false,
        connectedTo: "[]",
      },
      {
        id: sceneScopeId,
        campaignId,
        name: "Bridge Checkpoint",
        description: "A narrow checkpoint inside the market district.",
        kind: "persistent_sublocation",
        parentLocationId: broadLocationId,
        anchorLocationId: null,
        persistence: "persistent",
        expiresAtTick: null,
        archivedAtTick: null,
        tags: '["checkpoint"]',
        isStarting: false,
        connectedTo: "[]",
      },
      {
        id: connectedLocationId,
        campaignId,
        name: "Canal Walk",
        description: "A connected footpath.",
        kind: "macro",
        parentLocationId: null,
        anchorLocationId: null,
        persistence: "persistent",
        expiresAtTick: null,
        archivedAtTick: null,
        tags: '["path"]',
        isStarting: false,
        connectedTo: "[]",
      },
    ],
    locationEdges: options.edgeRows ?? [
      {
        id: "edge-market-canal",
        campaignId,
        fromLocationId: broadLocationId,
        toLocationId: connectedLocationId,
        travelCost: 2,
        discovered: true,
      },
    ],
    items: options.itemRows ?? [
      {
        id: itemId,
        campaignId,
        name: "Signal Horn",
        tags: '["scene-prop"]',
        ownerId: null,
        locationId: sceneScopeId,
        equipState: "carried",
        equippedSlot: null,
        isSignature: false,
      },
    ],
  };

  let lastTableName: string | null = null;
  const rowsForTable = (tableName: string | null): Array<Record<string, unknown>> => {
    switch (tableName) {
      case "players":
        return state.players;
      case "npcs":
        return state.npcs;
      case "locations":
        return state.locations;
      case "location_edges":
        return state.locationEdges;
      case "items":
        return state.items;
      default:
        return [];
    }
  };

  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation((table: unknown) => {
      lastTableName = getDrizzleTableName(table);
      return db;
    }),
    where: vi.fn().mockImplementation(() => ({
      get: vi.fn().mockImplementation(() => rowsForTable(lastTableName)[0] ?? null),
      all: vi.fn().mockImplementation(() => rowsForTable(lastTableName)),
    })),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
  };

  return db;
}

function buildDbBackedFrame(overrides: Partial<SceneFrameBuildOptions> = {}) {
  return buildSceneFrame({
    campaignId,
    tick: 12,
    playerAction: "I ask the Bridge Captain about the Signal Horn.",
    intent: "question Bridge Captain",
    method: "point to Signal Horn",
    ...overrides,
  } as unknown as SceneFrameBuildOptions);
}

describe("SceneFrame builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getDb as Mock).mockReturnValue(createMockDb());
    (readCampaignConfig as Mock).mockReturnValue({
      name: "Phase 70 SceneFrame",
      premise: "Test",
      createdAt: 1,
      currentTick: 12,
    });
    (listRecentLocationEvents as Mock).mockReturnValue([
      {
        id: "location-recent-1",
        campaignId,
        locationId: sceneScopeId,
        sourceLocationId: null,
        anchorLocationId: null,
        sourceEventId: null,
        eventType: "patrol",
        summary: "The patrol tightened the bridge line.",
        tick: 11,
        importance: 3,
        archivedAtTick: null,
        createdAt: 1,
      },
    ]);
    (readPendingCommittedEvents as Mock).mockReturnValue([
      {
        id: "pending-event-1",
        text: "The player raises a question at the checkpoint.",
        tick: 12,
        location: sceneScopeId,
        participants: [playerId, clearNpcId],
        importance: 4,
        type: "dialogue",
      },
    ]);
  });

  it("projects roster buckets from resolveScenePresence with stable actor IDs", async () => {
    const frame: SceneFrame = await buildDbBackedFrame();

    expect(frame.roster.active.map((actor) => actor.actorId)).toEqual([
      playerId,
      clearNpcId,
    ]);
    expect(frame.roster.support.map((actor) => actor.actorId)).toEqual([hintNpcId]);
    expect(frame.roster.background.map((actor) => actor.actorId)).toEqual([backgroundNpcId]);
    expect(frame.perception.forbiddenActorIds).toEqual([hintNpcId, backgroundNpcId]);
    expect(frame.perception.forbiddenActorLabels).toEqual(["Veiled Scout", "Roof Archer"]);
    expect(frame.targetCandidates.map((candidate) => candidate.actorId)).toContain(clearNpcId);
    expect(frame.targetCandidates.map((candidate) => candidate.actorId)).toContain(hintNpcId);
    expect(frame.targetCandidates.map((candidate) => candidate.actorId)).not.toContain(
      backgroundNpcId,
    );
    expect(frame.roster.active[1]).toEqual(
      expect.objectContaining({
        id: clearNpcId,
        actorId: clearNpcId,
        label: "Bridge Captain",
        awareness: "clear",
        knowledgeBasis: "perceived_now",
      }),
    );
    expect(frame.perception.playerAwarenessHints).toContain(
      "You catch only a partial sign of movement nearby.",
    );
  });

  it("keeps dense sublocation scene rosters scoped to the player's stored scene id", async () => {
    (getDb as Mock).mockReturnValue(
      createMockDb({
        playerRows: [
          createPlayerRow({
            currentLocationId: broadLocationId,
            currentSceneLocationId: sceneScopeId,
          }),
        ],
        npcRows: [
          {
            id: clearNpcId,
            campaignId,
            name: "Concourse Warden",
            persona: "Standing beside the player in the concourse.",
            characterRecord: "{}",
            derivedTags: "[]",
            tags: '["clear"]',
            tier: "key",
            currentLocationId: broadLocationId,
            currentSceneLocationId: sceneScopeId,
            goals: '{"short_term":[],"long_term":[]}',
            beliefs: "[]",
            unprocessedImportance: 0,
            inactiveTicks: 0,
            createdAt: 1,
          },
          {
            id: backgroundNpcId,
            campaignId,
            name: "Rooftop Runner",
            persona: "Working in a sibling sublocation under the same macro.",
            characterRecord: "{}",
            derivedTags: "[]",
            tags: '["clear"]',
            tier: "persistent",
            currentLocationId: broadLocationId,
            currentSceneLocationId: "sibling-rooftop",
            goals: '{"short_term":[],"long_term":[]}',
            beliefs: "[]",
            unprocessedImportance: 0,
            inactiveTicks: 0,
            createdAt: 1,
          },
        ],
      }),
    );

    const frame = await buildDbBackedFrame();

    expect(frame.currentLocationId).toBe(broadLocationId);
    expect(frame.currentSceneScopeId).toBe(sceneScopeId);
    expect(frame.currentLocationName).toBe("Market District");
    expect(frame.currentSceneScopeName).toBe("Bridge Checkpoint");
    expect(frame.roster.active.map((actor) => actor.label)).toContain("Concourse Warden");
    expect(frame.roster.active.map((actor) => actor.label)).not.toContain("Rooftop Runner");
    expect(frame.roster.support.map((actor) => actor.label)).not.toContain("Rooftop Runner");
    expect(frame.roster.background).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: backgroundNpcId,
          label: "Rooftop Runner",
          awareness: "none",
        }),
      ]),
    );
  });

  it("derives parent broad presence when the player is stored inside a persistent sublocation", async () => {
    (getDb as Mock).mockReturnValue(
      createMockDb({
        playerRows: [
          createPlayerRow({
            currentLocationId: sceneScopeId,
            currentSceneLocationId: sceneScopeId,
          }),
        ],
        npcRows: [
          {
            id: clearNpcId,
            campaignId,
            name: "Concourse Warden",
            persona: "Standing beside the player in the concourse.",
            characterRecord: "{}",
            derivedTags: "[]",
            tags: '["clear"]',
            tier: "key",
            currentLocationId: broadLocationId,
            currentSceneLocationId: sceneScopeId,
            goals: '{"short_term":[],"long_term":[]}',
            beliefs: "[]",
            unprocessedImportance: 0,
            inactiveTicks: 0,
            createdAt: 1,
          },
          {
            id: backgroundNpcId,
            campaignId,
            name: "Rooftop Runner",
            persona: "Working in a sibling sublocation under the same macro.",
            characterRecord: "{}",
            derivedTags: "[]",
            tags: '["clear"]',
            tier: "persistent",
            currentLocationId: broadLocationId,
            currentSceneLocationId: "sibling-rooftop",
            goals: '{"short_term":[],"long_term":[]}',
            beliefs: "[]",
            unprocessedImportance: 0,
            inactiveTicks: 0,
            createdAt: 1,
          },
        ],
      }),
    );

    const frame = await buildDbBackedFrame();

    expect(frame.currentLocationId).toBe(sceneScopeId);
    expect(frame.currentSceneScopeId).toBe(sceneScopeId);
    expect(getSceneFrameVisibleActorNames(frame)).toContain("Concourse Warden");
    expect(getSceneFrameVisibleActorNames(frame)).not.toContain("Rooftop Runner");
    expect(frame.roster.background).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: backgroundNpcId,
          label: "Rooftop Runner",
          awareness: "none",
        }),
      ]),
    );
  });

  it("keeps broad-only legacy rows out of immediate presence while preserving them as background", async () => {
    (getDb as Mock).mockReturnValue(
      createMockDb({
        playerRows: [
          createPlayerRow({
            currentLocationId: broadLocationId,
            currentSceneLocationId: null,
          }),
        ],
        npcRows: [
          {
            id: clearNpcId,
            campaignId,
            name: "Legacy Broad Guard",
            persona: "A legacy actor without scene scope.",
            characterRecord: "{}",
            derivedTags: "[]",
            tags: '["guard"]',
            tier: "key",
            currentLocationId: broadLocationId,
            currentSceneLocationId: null,
            goals: '{"short_term":[],"long_term":[]}',
            beliefs: "[]",
            unprocessedImportance: 0,
            inactiveTicks: 0,
            createdAt: 1,
          },
        ],
      }),
    );

    const frame = await buildDbBackedFrame();

    expect(frame.currentLocationId).toBe(broadLocationId);
    expect(frame.currentSceneScopeId).toBeNull();
    expect(frame.roster.active.map((actor) => actor.label)).not.toContain("Legacy Broad Guard");
    expect(frame.roster.support).toHaveLength(0);
    expect(frame.roster.background).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: clearNpcId,
          label: "Legacy Broad Guard",
          awareness: "none",
        }),
      ]),
    );
    expect(frame.targetCandidates.map((candidate) => candidate.label)).not.toContain(
      "Legacy Broad Guard",
    );
  });

  it("classifies campaigns without a player row as invalid instead of fabricating recovery", async () => {
    (getDb as Mock).mockReturnValue(
      createMockDb({
        playerRows: [],
      }),
    );

    await expect(buildDbBackedFrame()).rejects.toThrow(
      /invalid-campaign missing player row/,
    );
  });

  it("derives recentEvents, targetCandidates, movementCandidates, and rulebook affordances without LLM calls", async () => {
    const frame = await buildDbBackedFrame();

    expect(frame.recentEvents).toEqual([
      expect.objectContaining({
        id: "location-recent-1",
        source: "location_recent_event",
        summary: "The patrol tightened the bridge line.",
        perceivableByPlayer: true,
      }),
      expect.objectContaining({
        id: "pending-event-1",
        source: "committed_event",
        actorIds: [playerId, clearNpcId],
      }),
    ]);
    expect(frame.targetCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `actor:${clearNpcId}`,
          type: "actor",
          actorId: clearNpcId,
          label: "Bridge Captain",
        }),
        expect.objectContaining({
          id: `item:${itemId}`,
          type: "item",
          itemId,
          label: "Signal Horn",
        }),
      ]),
    );
    expect(frame.movementCandidates).toEqual([
      expect.objectContaining({
        id: "edge-market-canal",
        locationId: connectedLocationId,
        label: "Canal Walk",
        connected: true,
        travelCost: 2,
      }),
    ]);
    expect(frame.oracleContext).toBeUndefined();
    expect(frame.combatEnvelope).toBeUndefined();
    expect(JSON.stringify(frame)).not.toContain("oracleContext");
    expect(JSON.stringify(frame)).not.toContain("combatEnvelope");
  });

  it("preserves explicit post-GM oracle context and deferred hook context without inventing memory hints", async () => {
    const neutralFrame = await buildDbBackedFrame({
      deferredHooks: [
        {
          id: "hook-memory-1",
          hookType: "memory",
          subjectIds: [clearNpcId],
          reason: "Follow up on the bridge toll rumor.",
        },
      ],
    });
    const bridgeCaptain = neutralFrame.targetCandidates.find(
      (candidate) => candidate.actorId === clearNpcId,
    );

    expect(bridgeCaptain).toBeDefined();
    expect(neutralFrame.recentEvents.map((event) => event.id)).toEqual([
      "location-recent-1",
      "pending-event-1",
    ]);
    expect(neutralFrame.deferredHooks).toEqual([
      {
        id: "hook-memory-1",
        hookType: "memory",
        subjectIds: [clearNpcId],
        reason: "Follow up on the bridge toll rumor.",
      },
    ]);
    expect("memoryHints" in neutralFrame).toBe(false);
    expect(neutralFrame.oracleContext).toBeUndefined();

    const explicitOracleContext = buildSceneFrameOracleContextForCandidate(bridgeCaptain!);
    const framedAfterGmDecision = await buildDbBackedFrame({
      oracleContext: explicitOracleContext,
    });

    expect(framedAfterGmDecision.oracleContext).toEqual(
      expect.objectContaining({
        actorId: clearNpcId,
        candidateId: `actor:${clearNpcId}`,
        targetLabel: "Bridge Captain",
      }),
    );
    expect(JSON.stringify(framedAfterGmDecision)).toContain("oracleContext");
  });

  it("does not resolve raw hostile prose into a pre-GM target or combat envelope", async () => {
    (getDb as Mock).mockReturnValue(
      createMockDb({
        npcRows: [
          {
            id: clearNpcId,
            campaignId,
            name: "Iru",
            persona: "Standing nearby.",
            characterRecord: "{}",
            derivedTags: "[]",
            tags: '["rival"]',
            tier: "key",
            currentLocationId: broadLocationId,
            currentSceneLocationId: sceneScopeId,
            goals: '{"short_term":[],"long_term":[]}',
            beliefs: "[]",
            unprocessedImportance: 0,
            inactiveTicks: 0,
            createdAt: 1,
          },
        ],
      }),
    );

    const frame = await buildDbBackedFrame({
      playerAction: "I hit Iru",
      intent: "make tea",
      method: "politely",
    });

    expect(frame.targetCandidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: clearNpcId,
          label: "Iru",
        }),
      ]),
    );
    expect(frame.oracleContext).toBeUndefined();
    expect(frame.combatEnvelope).toBeUndefined();
    expect(JSON.stringify(frame)).not.toContain("oracleContext");
    expect(JSON.stringify(frame)).not.toContain("combatEnvelope");
  });

  it("derives player-turn allowedTools without disabling item spawning", async () => {
    (readPendingCommittedEvents as Mock).mockReturnValue(
      Array.from({ length: SCENE_FRAME_RECENT_EVENT_LIMIT + 2 }, (_, index) => ({
        id: `pending-${index}`,
        text: `Pending event ${index}`,
        tick: 12,
        location: sceneScopeId,
        participants: [playerId],
        importance: 1,
        type: "event",
      })),
    );
    (getDb as Mock).mockReturnValue(
      createMockDb({
        locationRows: [
          ...createMockDbState().locations,
          ...Array.from({ length: SCENE_FRAME_MOVEMENT_CANDIDATE_LIMIT + 2 }, (_, index) => ({
            id: `move-${index}`,
            campaignId,
            name: `Connected ${index}`,
            description: "",
            kind: "macro",
            parentLocationId: null,
            anchorLocationId: null,
            persistence: "persistent",
            expiresAtTick: null,
            archivedAtTick: null,
            tags: "[]",
            isStarting: false,
            connectedTo: "[]",
          })),
        ],
        edgeRows: Array.from({ length: SCENE_FRAME_MOVEMENT_CANDIDATE_LIMIT + 2 }, (_, index) => ({
          id: `edge-${index}`,
          campaignId,
          fromLocationId: broadLocationId,
          toLocationId: `move-${index}`,
          travelCost: index + 1,
          discovered: true,
        })),
        itemRows: Array.from({ length: SCENE_FRAME_TARGET_CANDIDATE_LIMIT + 2 }, (_, index) => ({
          id: `item-${index}`,
          campaignId,
          name: `Scene Item ${index}`,
          tags: "[]",
          ownerId: null,
          locationId: sceneScopeId,
          equipState: "carried",
          equippedSlot: null,
          isSignature: false,
        })),
      }),
    );

    const frame = await buildDbBackedFrame();

    expect(frame.allowedTools).toEqual(Object.keys(runtimeToolInputSchemas));
    expect(frame.allowedTools).toContain("spawn_item");
    expect(frame.recentEvents).toHaveLength(SCENE_FRAME_RECENT_EVENT_LIMIT);
    expect(frame.targetCandidates).toHaveLength(SCENE_FRAME_TARGET_CANDIDATE_LIMIT);
    expect(frame.movementCandidates).toHaveLength(SCENE_FRAME_MOVEMENT_CANDIDATE_LIMIT);
  });

  it("keeps explicit caller-supplied allowedTools unchanged", async () => {
    const frame = await buildDbBackedFrame({
      allowedTools: ["log_event", "spawn_item"],
    });

    expect(frame.allowedTools).toEqual(["log_event", "spawn_item"]);
  });

  it("keeps hidden names out of visibleActorNames while exposing playerHints for hint-band actors", async () => {
    const frame = await buildDbBackedFrame();
    const visibleActorNames = getSceneFrameVisibleActorNames(frame);
    const playerHints = getSceneFramePlayerHints(frame);

    expect(visibleActorNames).toEqual(["Player", "Bridge Captain"]);
    expect(visibleActorNames).not.toContain("Veiled Scout");
    expect(visibleActorNames).not.toContain("Roof Archer");
    expect(playerHints).toContain("You catch only a partial sign of movement nearby.");
    expect(frame.targetCandidates.map((candidate) => candidate.label)).toContain(
      "You catch only a partial sign of movement nearby.",
    );
    expect(frame.targetCandidates.map((candidate) => candidate.label)).not.toContain(
      "Veiled Scout",
    );
  });

  it("keeps broad-location none-awareness actors in background instead of active scene response buckets", async () => {
    const frame = await buildDbBackedFrame();

    expect(frame.roster.active.map((actor) => actor.label)).not.toContain("Roof Archer");
    expect(frame.roster.support.map((actor) => actor.label)).not.toContain("Roof Archer");
    expect(frame.roster.background).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: backgroundNpcId,
          label: "Roof Archer",
          awareness: "none",
        }),
      ]),
    );
  });
});

function createMockDbState() {
  return {
    locations: [
      {
        id: broadLocationId,
        campaignId,
        name: "Market District",
        description: "A broad district.",
        kind: "macro",
        parentLocationId: null,
        anchorLocationId: null,
        persistence: "persistent",
        expiresAtTick: null,
        archivedAtTick: null,
        tags: '["district"]',
        isStarting: false,
        connectedTo: "[]",
      },
      {
        id: sceneScopeId,
        campaignId,
        name: "Bridge Checkpoint",
        description: "A narrow checkpoint inside the market district.",
        kind: "persistent_sublocation",
        parentLocationId: broadLocationId,
        anchorLocationId: null,
        persistence: "persistent",
        expiresAtTick: null,
        archivedAtTick: null,
        tags: '["checkpoint"]',
        isStarting: false,
        connectedTo: "[]",
      },
    ],
  };
}
