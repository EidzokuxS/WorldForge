import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PowerStats } from "@worldforge/shared";
import {
  hydrateStoredNpcRecord,
  hydrateStoredPlayerRecord,
  projectNpcRecord,
  projectPlayerRecord,
} from "../../character/record-adapters.js";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  authorityTraces,
  actorProcessStates,
  campaigns,
  locationEdges,
  locations,
  npcs,
  players,
} from "../../db/schema.js";
import { buildActorFrame } from "../actor-frame.js";
import {
  executeActorDecisionPacket,
  runRequiredActorDecisionPass,
} from "../actor-tools.js";
import {
  commitAuthorityTrace,
  ensureWorldClock,
  readWorldClock,
} from "../living-world-authority.js";
import type { SceneFrame } from "../scene-frame.js";

const CAMPAIGN_ID = "actor-tools-campaign";

let tempDir = "";

function createPowerStats(overrides: Partial<PowerStats> = {}): PowerStats {
  return {
    attackPotency: { tier: "Building", rank: 5 },
    speed: { tier: "Subsonic", rank: 5 },
    durability: { tier: "Building", rank: 5 },
    intelligence: { tier: "Gifted", rank: 5 },
    hax: [],
    vulnerabilities: [],
    ...overrides,
  };
}

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Actor Tools",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
}

function seedLocation(input: {
  id: string;
  name: string;
  connectedTo?: string[];
}) {
  getDb().insert(locations).values({
    id: input.id,
    campaignId: CAMPAIGN_ID,
    name: input.name,
    description: `${input.name} description`,
    kind: "macro",
    parentLocationId: null,
    anchorLocationId: null,
    persistence: "persistent",
    expiresAtTick: null,
    archivedAtTick: null,
    tags: "[]",
    isStarting: input.id === "loc-a",
    connectedTo: JSON.stringify(input.connectedTo ?? []),
  }).run();
}

function seedEdge(fromLocationId: string, toLocationId: string) {
  getDb().insert(locationEdges).values({
    id: `${fromLocationId}-${toLocationId}`,
    campaignId: CAMPAIGN_ID,
    fromLocationId,
    toLocationId,
    travelCost: 1,
    discovered: true,
  }).run();
}

function seedPlayer() {
  getDb().insert(players).values({
    id: "player-1",
    campaignId: CAMPAIGN_ID,
    name: "Player",
    race: "",
    gender: "",
    age: "",
    appearance: "",
    hp: 5,
    characterRecord: "{}",
    derivedTags: "[]",
    tags: "[]",
    equippedItems: "[]",
    currentLocationId: "loc-a",
    currentSceneLocationId: "loc-a",
  }).run();
}

function seedNpc() {
  getDb().insert(npcs).values({
    id: "npc-key",
    campaignId: CAMPAIGN_ID,
    name: "Watcher",
    persona: "A key NPC who watches the door.",
    characterRecord: "{}",
    derivedTags: "[]",
    tags: "[]",
    tier: "key",
    currentLocationId: "loc-a",
    currentSceneLocationId: "loc-a",
    goals: JSON.stringify({
      short_term: ["keep watch"],
      long_term: ["protect the station"],
    }),
    beliefs: "[]",
    unprocessedImportance: 0,
    inactiveTicks: 0,
    createdAt: Date.now(),
  }).run();
}

function seedWorld() {
  seedCampaign();
  seedLocation({ id: "loc-a", name: "Station A", connectedTo: ["loc-b"] });
  seedLocation({ id: "loc-b", name: "Station B", connectedTo: ["loc-a"] });
  seedEdge("loc-a", "loc-b");
  seedEdge("loc-b", "loc-a");
  seedPlayer();
  seedNpc();
  ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 7 });
}

function setNpcPowerStats(npcId: string, powerStats: PowerStats) {
  const row = getDb()
    .select()
    .from(npcs)
    .where(eq(npcs.id, npcId))
    .get();
  if (!row) throw new Error(`Missing NPC ${npcId}`);
  const record = hydrateStoredNpcRecord(row);
  getDb()
    .update(npcs)
    .set(projectNpcRecord({ ...record, powerStats }))
    .where(eq(npcs.id, npcId))
    .run();
}

function setPlayerPowerStats(playerId: string, powerStats: PowerStats) {
  const row = getDb()
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .get();
  if (!row) throw new Error(`Missing player ${playerId}`);
  const record = hydrateStoredPlayerRecord(row);
  getDb()
    .update(players)
    .set(projectPlayerRecord({ ...record, powerStats }))
    .where(eq(players.id, playerId))
    .run();
}

function createSceneFrame(): SceneFrame {
  return {
    campaignId: CAMPAIGN_ID,
    tick: 7,
    playerActorId: "player-1",
    currentLocationId: "loc-a",
    currentSceneScopeId: "loc-a",
    currentLocationName: "Station A",
    currentSceneScopeName: "Station A",
    playerAction: "I wait by the platform.",
    roster: {
      active: [
        {
          id: "player-1",
          actorId: "player-1",
          type: "player",
          label: "Player",
          locationId: "loc-a",
          sceneScopeId: "loc-a",
          awareness: "clear",
        },
        {
          id: "npc-key",
          actorId: "npc-key",
          type: "npc",
          label: "Watcher",
          locationId: "loc-a",
          sceneScopeId: "loc-a",
          awareness: "clear",
          tags: ["key"],
          summary: "Watcher can choose a grounded response.",
        },
      ],
      support: [],
      background: [],
    },
    perception: {
      playerAwarenessHints: [],
      actorAwareness: {},
      actorKnowledge: {},
      forbiddenActorIds: [],
      forbiddenActorLabels: [],
    },
    recentEvents: [],
    targetCandidates: [
      {
        id: "npc-key",
        type: "actor",
        label: "Watcher",
        actorId: "npc-key",
        awareness: "clear",
        tags: ["key"],
      },
    ],
    movementCandidates: [
      {
        id: "loc-b",
        locationId: "loc-b",
        label: "Station B",
        connected: true,
        travelCost: 1,
        path: ["Station A", "Station B"],
      },
    ],
    deferredHooks: [],
    allowedTools: ["log_event", "move_to"],
    oracle: null,
  };
}

function createActorFrame() {
  return buildActorFrame({
    frame: createSceneFrame(),
    actorId: "npc-key",
    worldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
    legalTools: ["log_event", "move_to"],
  });
}

function countAuthorityTraces(): number {
  return getDb()
    .select()
    .from(authorityTraces)
    .where(eq(authorityTraces.campaignId, CAMPAIGN_ID))
    .all().length;
}

describe("actor tool execution", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-actor-tools-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedWorld();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("moves only the acting NPC through the authoritative executor", async () => {
    const sceneFrame = createSceneFrame();
    const actorFrame = createActorFrame();

    const result = await executeActorDecisionPacket({
      campaignId: CAMPAIGN_ID,
      tick: 7,
      sceneFrame,
      actorFrame,
      baseWorldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
      packet: {
        actorId: "npc-key",
        citedFactIds: ["self:npc-key", "move:loc-b"],
        intent: "move to the connected station",
        requestedTools: [
          {
            toolName: "move_to",
            purpose: "Watcher leaves for Station B",
            input: { targetLocationName: "Station B" },
          },
        ],
      },
    });

    expect(result.actionResults).toHaveLength(1);
    expect(result.actionResults[0]?.result.success).toBe(true);
    expect(
      getDb()
        .select({ currentLocationId: npcs.currentLocationId })
        .from(npcs)
        .where(eq(npcs.id, "npc-key"))
        .get(),
    ).toMatchObject({ currentLocationId: "loc-b" });
    expect(
      getDb()
        .select({ currentLocationId: players.currentLocationId })
        .from(players)
        .where(eq(players.id, "player-1"))
        .get(),
    ).toMatchObject({ currentLocationId: "loc-a" });
    expect(countAuthorityTraces()).toBe(1);
    expect(
      getDb()
        .select()
        .from(authorityTraces)
        .where(eq(authorityTraces.campaignId, CAMPAIGN_ID))
        .get(),
    ).toMatchObject({
      sourceEntityType: "npc",
      sourceEntityId: "npc-key",
      operation: "tool:move_to",
    });
  });

  it("refuses hidden actor refs without mutating authority state", async () => {
    const result = await executeActorDecisionPacket({
      campaignId: CAMPAIGN_ID,
      tick: 7,
      sceneFrame: createSceneFrame(),
      actorFrame: createActorFrame(),
      baseWorldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
      packet: {
        actorId: "npc-key",
        citedFactIds: ["self:npc-key"],
        intent: "speak for someone hidden",
        requestedTools: [
          {
            toolName: "log_event",
            purpose: "invalid hidden participant",
            input: {
              text: "Watcher and a hidden auditor exchange a glance.",
              importance: 3,
              participants: ["Watcher", "Hidden Auditor"],
              durability: "scene_local",
            },
          },
        ],
      },
    });

    expect(result.actionResults[0]?.result.success).toBe(false);
    expect(result.actionResults[0]?.result.error).toContain("Tool grounding failed");
    expect(countAuthorityTraces()).toBe(0);
  });

  it("rejects stale actor tools before changing NPC location", async () => {
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "test:advance-clock",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "test" },
      elapsedWorldTimeMinutes: 1,
      currentTick: 7,
    });

    const result = await executeActorDecisionPacket({
      campaignId: CAMPAIGN_ID,
      tick: 7,
      sceneFrame: createSceneFrame(),
      actorFrame: createActorFrame(),
      baseWorldVersion: 0,
      packet: {
        actorId: "npc-key",
        citedFactIds: ["self:npc-key", "move:loc-b"],
        intent: "move using stale context",
        requestedTools: [
          {
            toolName: "move_to",
            purpose: "must not run stale",
            input: { targetLocationName: "Station B" },
          },
        ],
      },
    });

    expect(result.actionResults[0]?.result.success).toBe(false);
    expect(result.actionResults[0]?.result.authority?.failureReason).toContain(
      "Stale world version",
    );
    expect(
      getDb()
        .select({ currentLocationId: npcs.currentLocationId })
        .from(npcs)
        .where(eq(npcs.id, "npc-key"))
        .get(),
    ).toMatchObject({ currentLocationId: "loc-a" });
    expect(countAuthorityTraces()).toBe(1);
  });

  it("records backend bounds for actor contested outcomes without applying aftermath", async () => {
    setNpcPowerStats("npc-key", createPowerStats({
      attackPotency: { tier: "City", rank: 7 },
      speed: { tier: "Supersonic", rank: 6 },
    }));
    setPlayerPowerStats("player-1", createPowerStats({
      durability: { tier: "Building", rank: 4 },
      speed: { tier: "Subsonic", rank: 4 },
    }));

    const result = await executeActorDecisionPacket({
      campaignId: CAMPAIGN_ID,
      tick: 7,
      sceneFrame: createSceneFrame(),
      actorFrame: buildActorFrame({
        frame: createSceneFrame(),
        actorId: "npc-key",
        worldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
        legalTools: ["request_contested_outcome"],
      }),
      baseWorldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
      packet: {
        actorId: "npc-key",
        citedFactIds: ["self:npc-key", "actor:player-1"],
        intent: "restrain the player before they force the platform door",
        requestedTools: [
          {
            toolName: "request_contested_outcome",
            purpose: "get backend bounds before any restraint aftermath",
            input: {
              actorName: "Watcher",
              targetName: "Player",
              mode: "restrain",
              intent: "Pin the player against the platform door.",
              stakes: "Whether the player can keep moving before the watcher closes distance.",
              evidenceRefs: ["self:npc-key", "actor:player-1"],
            },
          },
        ],
      },
    });

    const actionResult = result.actionResults[0]?.result;
    expect(actionResult?.success).toBe(true);
    expect(actionResult?.result).toMatchObject({
      kind: "contested_outcome_bounds",
      actorId: "npc-key",
      targetId: "player-1",
      mode: "restrain",
      combatEnvelopeBuilt: true,
      matchup: expect.any(String),
    });
    const payload = actionResult?.result as Record<string, unknown>;
    expect(payload.allowedEffects).toEqual(
      expect.arrayContaining([
        expect.stringContaining("not an automatic capture"),
      ]),
    );
    expect(payload.prohibitedEffects).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Do not declare death"),
      ]),
    );
    expect(actionResult?.authority?.stateDeltaRefs).toEqual([]);
    expect(payload).not.toHaveProperty("combatSummaryLines");
    expect(JSON.stringify(payload)).not.toContain("City");
    expect(JSON.stringify(payload)).not.toContain("Building");
    expect(JSON.stringify(payload)).not.toContain("Immediate initiative is the truthful read.");
    expect(
      getDb()
        .select({ hp: players.hp, currentLocationId: players.currentLocationId })
        .from(players)
        .where(eq(players.id, "player-1"))
        .get(),
    ).toMatchObject({ hp: 5, currentLocationId: "loc-a" });
    expect(
      getDb()
        .select()
        .from(authorityTraces)
        .where(eq(authorityTraces.campaignId, CAMPAIGN_ID))
        .get(),
    ).toMatchObject({
      sourceEntityType: "npc",
      sourceEntityId: "npc-key",
      operation: "tool:request_contested_outcome",
    });
  });

  it("refuses contested outcomes when actorName does not match the actor turn owner", async () => {
    const result = await executeActorDecisionPacket({
      campaignId: CAMPAIGN_ID,
      tick: 7,
      sceneFrame: createSceneFrame(),
      actorFrame: buildActorFrame({
        frame: createSceneFrame(),
        actorId: "npc-key",
        worldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
        legalTools: ["request_contested_outcome"],
      }),
      baseWorldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
      packet: {
        actorId: "npc-key",
        citedFactIds: ["self:npc-key", "actor:player-1"],
        intent: "smuggle player-authored authority into an NPC tool turn",
        requestedTools: [
          {
            toolName: "request_contested_outcome",
            purpose: "invalid actor owner",
            input: {
              actorName: "Player",
              targetName: "Watcher",
              mode: "attack",
              intent: "Make the player act during the NPC actor turn.",
              stakes: "Whether the actor-turn owner can be spoofed.",
              evidenceRefs: ["self:npc-key", "actor:player-1"],
            },
          },
        ],
      },
    });

    expect(result.actionResults[0]?.result.success).toBe(false);
    expect(result.actionResults[0]?.result.error).toContain("Tool grounding failed");
    expect(countAuthorityTraces()).toBe(0);
  });

  it("refuses contested outcomes against hidden targets before authority write", async () => {
    const result = await executeActorDecisionPacket({
      campaignId: CAMPAIGN_ID,
      tick: 7,
      sceneFrame: createSceneFrame(),
      actorFrame: buildActorFrame({
        frame: createSceneFrame(),
        actorId: "npc-key",
        worldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
        legalTools: ["request_contested_outcome"],
      }),
      baseWorldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
      packet: {
        actorId: "npc-key",
        citedFactIds: ["self:npc-key"],
        intent: "attack someone not in the actor frame",
        requestedTools: [
          {
            toolName: "request_contested_outcome",
            purpose: "invalid hidden target",
            input: {
              actorName: "Watcher",
              targetName: "Hidden Auditor",
              mode: "attack",
              intent: "Strike the auditor.",
              stakes: "Whether the hidden auditor is wounded.",
              evidenceRefs: ["self:npc-key"],
            },
          },
        ],
      },
    });

    expect(result.actionResults[0]?.result.success).toBe(false);
    expect(result.actionResults[0]?.result.error).toContain("Tool grounding failed");
    expect(countAuthorityTraces()).toBe(0);
  });

  it("runs a present required actor pass and updates the actor process clock", async () => {
    const result = await runRequiredActorDecisionPass({
      campaignId: CAMPAIGN_ID,
      tick: 7,
      provider: {
        id: "test-provider",
        name: "Test",
        baseUrl: "http://localhost:1/v1",
        apiKey: "test",
        model: "test-model",
      },
      sceneFrame: createSceneFrame(),
      playerLocationId: "loc-a",
      playerSceneScopeId: "loc-a",
      elapsedWorldTimeMinutes: 1,
      decideActor: ({ actorFrame }) => ({
        actorId: actorFrame.observer.actorId,
        citedFactIds: ["self:npc-key"],
        intent: "keep a visible watch without changing durable state",
        requestedTools: [
          {
            toolName: "log_event",
            purpose: "record the visible reaction beat",
            input: {
              text: "Watcher keeps a visible watch on the platform.",
              importance: 2,
              participants: ["Watcher"],
              durability: "scene_local",
            },
          },
        ],
        nextDecisionTrigger: {
          reason: "player changes the local situation",
          delayWorldTimeMinutes: 10,
        },
      }),
    });

    expect(result.decisions).toHaveLength(1);
    expect(result.actionResults).toHaveLength(1);
    expect(result.actionResults[0]?.result.success).toBe(true);
    const processRow = getDb()
      .select()
      .from(actorProcessStates)
      .where(eq(actorProcessStates.actorId, "npc-key"))
      .get();
    expect(processRow).toMatchObject({
      status: "waiting",
      lastWorldVersion: 0,
      lastWakeWorldTimeMinutes: 7,
      nextWakeWorldTimeMinutes: 17,
    });
    const state = JSON.parse(processRow?.processState ?? "{}") as Record<string, unknown>;
    expect(state).toMatchObject({
      nextDecisionReason: "player changes the local situation",
      agencyDebt: 0,
    });
  });
});
