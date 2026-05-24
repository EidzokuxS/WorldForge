import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PowerStats } from "@worldforge/shared";
import {
  hydrateStoredNpcRecord,
  hydrateStoredPlayerRecord,
  projectNpcRecord,
  projectPlayerRecord,
} from "../../character/record-adapters.js";
import { closeDb, connectDb, getDb, getSqliteConnection } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  authorityTraces,
  actorProcessStates,
  campaigns,
  locationRecentEvents,
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
import { listKeyActorProcessesForCampaign } from "../key-actor-process.js";
import type { SceneFrame } from "../scene-frame.js";
import {
  closeVectorDb,
  getVectorDb,
  openVectorDb,
} from "../../vectors/connection.js";

const CAMPAIGN_ID = "actor-tools-campaign";

let tempDir = "";
let previousCampaignsRoot: string | undefined;

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

function seedNpc(input: {
  id?: string;
  name?: string;
  persona?: string;
  shortTermGoal?: string;
  longTermGoal?: string;
} = {}) {
  getDb().insert(npcs).values({
    id: input.id ?? "npc-key",
    campaignId: CAMPAIGN_ID,
    name: input.name ?? "Watcher",
    persona: input.persona ?? "A key NPC who watches the door.",
    characterRecord: "{}",
    derivedTags: "[]",
    tags: "[]",
    tier: "key",
    currentLocationId: "loc-a",
    currentSceneLocationId: "loc-a",
    goals: JSON.stringify({
      short_term: [input.shortTermGoal ?? "keep watch"],
      long_term: [input.longTermGoal ?? "protect the station"],
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
  ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 7, worldTimeMinutes: 7 });
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
    worldVersion: 0,
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

function createTwoActorSceneFrame(): SceneFrame {
  const frame = createSceneFrame();
  frame.roster.active.push({
    id: "npc-second",
    actorId: "npc-second",
    type: "npc",
    label: "Sentinel",
    locationId: "loc-a",
    sceneScopeId: "loc-a",
    awareness: "clear",
    tags: ["key"],
    summary: "Sentinel can also respond inside the visible scene.",
  });
  frame.targetCandidates.push({
    id: "npc-second",
    type: "actor",
    label: "Sentinel",
    actorId: "npc-second",
    awareness: "clear",
    tags: ["key"],
  });
  return frame;
}

function createActorFrame() {
  return buildActorFrame({
    frame: createSceneFrame(),
    actorId: "npc-key",
    worldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
    legalTools: ["log_event", "move_to"],
  });
}

function actorSelfWriteScopes(extra: readonly string[] = []): string[] {
  return ["npc:npc-key", ...extra];
}

function countAuthorityTraces(): number {
  return getDb()
    .select()
    .from(authorityTraces)
    .where(eq(authorityTraces.campaignId, CAMPAIGN_ID))
    .all().length;
}

function readActorProcessSnapshot(actorId = "npc-key"): Record<string, unknown> {
  const row = getDb()
    .select()
    .from(actorProcessStates)
    .where(eq(actorProcessStates.actorId, actorId))
    .get();
  if (!row) throw new Error(`Missing ${actorId} actor process`);
  return {
    status: row.status,
    lastWorldVersion: row.lastWorldVersion,
    lastWakeWorldTimeMinutes: row.lastWakeWorldTimeMinutes,
    nextWakeWorldTimeMinutes: row.nextWakeWorldTimeMinutes,
    disabledReason: row.disabledReason,
    processState: row.processState,
  };
}

function ensureActorProcessSnapshot(actorId = "npc-key"): Record<string, unknown> {
  listKeyActorProcessesForCampaign({ campaignId: CAMPAIGN_ID });
  return readActorProcessSnapshot(actorId);
}

function readNpcRecordText(actorId = "npc-key"): string {
  const row = getDb()
    .select()
    .from(npcs)
    .where(eq(npcs.id, actorId))
    .get();
  if (!row) throw new Error(`Missing ${actorId}`);
  return JSON.stringify(row);
}

function readPlayerRecordText(playerId = "player-1"): string {
  const row = getDb()
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .get();
  if (!row) throw new Error(`Missing ${playerId}`);
  return JSON.stringify(row);
}

function readNpcImportance(actorId = "npc-key"): number {
  const row = getDb()
    .select({ unprocessedImportance: npcs.unprocessedImportance })
    .from(npcs)
    .where(eq(npcs.id, actorId))
    .get();
  return row?.unprocessedImportance ?? 0;
}

function countLocationRecentEvents(): number {
  return getDb()
    .select()
    .from(locationRecentEvents)
    .where(eq(locationRecentEvents.campaignId, CAMPAIGN_ID))
    .all().length;
}

function installProcessUpdateFailureTrigger(
  operation: string,
  sourceActorId?: string,
  targetActorId?: string,
) {
  const actorPredicate = sourceActorId ? ` AND NEW.source_entity_id = '${sourceActorId}'` : "";
  const targetActor = targetActorId ? `'${targetActorId}'` : "NEW.source_entity_id";
  getSqliteConnection().exec(`
    CREATE TEMP TRIGGER actor_process_stale_after_authority
    AFTER INSERT ON authority_traces
    WHEN NEW.campaign_id = '${CAMPAIGN_ID}' AND NEW.operation = '${operation}'${actorPredicate}
    BEGIN
      UPDATE actor_process_states
      SET
        status = 'disabled',
        last_world_version = NEW.result_world_version + 100,
        disabled_reason = 'test process update failure',
        updated_at = NEW.created_at
      WHERE campaign_id = NEW.campaign_id
        AND actor_type = 'npc'
        AND actor_id = ${targetActor};
    END;
  `);
}

async function openTestVectorDb() {
  process.env.GSD_CAMPAIGNS_ROOT = path.join(tempDir, "campaigns");
  fs.mkdirSync(path.join(process.env.GSD_CAMPAIGNS_ROOT, CAMPAIGN_ID), {
    recursive: true,
  });
  await openVectorDb(CAMPAIGN_ID);
}

async function readEpisodicVectorRows(): Promise<Record<string, unknown>[]> {
  const vectorDb = getVectorDb();
  const tableNames = await vectorDb.tableNames();
  if (!tableNames.includes("episodic_events")) {
    return [];
  }
  const table = await vectorDb.openTable("episodic_events");
  return table.query().toArray() as Promise<Record<string, unknown>[]>;
}

describe("actor tool execution", () => {
  beforeEach(() => {
    previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-actor-tools-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedWorld();
  });

  afterEach(() => {
    closeVectorDb();
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
    if (previousCampaignsRoot === undefined) {
      delete process.env.GSD_CAMPAIGNS_ROOT;
    } else {
      process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
    }
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
      allowedWriteScopes: actorSelfWriteScopes(["location:loc-a", "location:loc-b"]),
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
      allowedWriteScopes: actorSelfWriteScopes(["location:loc-a", "location:loc-b"]),
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
              evidenceRefs: ["Watcher", "Player"],
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
    expect(actionResult?.observationOnly).toBe(true);
    expect(actionResult?.authority).toBeUndefined();
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
        .all(),
    ).toEqual([]);
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({
      worldVersion: 0,
      worldTimeMinutes: 7,
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
        planUpdates: [{
          summary: "Keep observing the platform without claiming a new write domain.",
          status: "continued",
          writeScopes: ["npc:other:state"],
        }],
        nextDecisionTrigger: {
          reason: "player changes the local situation",
          delayWorldTimeMinutes: 10,
        },
      }),
    });

    expect(result.decisions).toHaveLength(1);
    expect(result.actionResults).toHaveLength(1);
    expect(result.actionResults[0]?.result.success).toBe(true);
    expect(result.parallelFrameRetrievalTrace).toEqual([
      expect.objectContaining({
        jobCount: 1,
        writeScopes: [],
        serializedFallbackCount: 0,
      }),
    ]);
    expect(result.parallelPrepTrace).toEqual([
      expect.objectContaining({
        jobCount: 1,
        writeScopes: ["npc:npc-key:state", "location:loc-a:presence"],
        serializedFallbackCount: 0,
      }),
    ]);
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
      activePlan: {
        summary: "Keep observing the platform without claiming a new write domain.",
        writeScopes: [],
        provenance: {
          source: "actor_private_plan_update",
          authoritativeForPlayer: false,
        },
      },
    });
    expect(JSON.stringify(state)).not.toContain("npc:other:state");
  });

  it("rejects actor tool writes outside the scheduled positive write scopes", async () => {
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
      legalTools: ["add_tag"],
      scheduleActorProcesses: () => {
        const clock = readWorldClock(CAMPAIGN_ID);
        return {
          campaignId: CAMPAIGN_ID,
          baseWorldVersion: clock.worldVersion,
          worldTimeMinutes: clock.worldTimeMinutes,
          candidateActorIds: ["npc-key"],
          decisions: [{
            actorId: "npc-key",
            actorName: "Watcher",
            route: "required_before_done",
            reason: "test actor positive scope fence",
            signals: [],
            writeScopes: ["npc:npc-key:state"],
            reservation: {
              actorId: "npc-key",
              route: "required_before_done",
              writeScopes: ["npc:npc-key:state"],
              status: "reserved",
              conflictsWithActorIds: [],
            },
          }],
        };
      },
      decideActor: ({ actorFrame }) => ({
        actorId: actorFrame.observer.actorId,
        citedFactIds: ["self:npc-key"],
        intent: "try to mark the player from an NPC-only actor write scope",
        requestedTools: [
          {
            toolName: "add_tag",
            purpose: "invalid player-owned mutation from actor turn",
            input: {
              entityName: "Player",
              entityType: "player",
              tag: "actor-scope-leak",
            },
          },
        ],
        nextDecisionTrigger: {
          reason: "scope leak test complete",
          delayWorldTimeMinutes: 10,
        },
      }),
    });

    expect(result.actionResults).toHaveLength(1);
    expect(result.actionResults[0]?.result.success).toBe(false);
    expect(result.actionResults[0]?.result.error).toContain(
      "authority_write_scope_mismatch:player:player-1:tags",
    );
    expect(readPlayerRecordText()).not.toContain("actor-scope-leak");
    expect(countAuthorityTraces()).toBe(0);
  });

  it("rolls back actor add_tag when process update fails after tool authority commit", async () => {
    const processBefore = ensureActorProcessSnapshot();
    installProcessUpdateFailureTrigger("tool:add_tag");

    await expect(runRequiredActorDecisionPass({
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
        intent: "mark the watcher as alert",
        requestedTools: [
          {
            toolName: "add_tag",
            purpose: "mark the watcher alert",
            input: {
              entityName: "Watcher",
              entityType: "npc",
              tag: "alerted-by-boundary-test",
            },
          },
        ],
        nextDecisionTrigger: {
          reason: "watch for player follow-up",
          delayWorldTimeMinutes: 10,
        },
      }),
    })).rejects.toThrow("Actor process update failed for npc-key: stale_rejected");

    expect(readNpcRecordText()).not.toContain("alerted-by-boundary-test");
    expect(countAuthorityTraces()).toBe(0);
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({
      worldVersion: 0,
      worldTimeMinutes: 7,
    });
    expect(readActorProcessSnapshot()).toEqual(processBefore);
  });

  it("rolls back first required actor side effects when a later actor process update fails", async () => {
    seedNpc({
      id: "npc-second",
      name: "Sentinel",
      persona: "A second key NPC who watches the same platform.",
      shortTermGoal: "watch the side door",
      longTermGoal: "protect the signal room",
    });
    const firstProcessBefore = ensureActorProcessSnapshot("npc-key");
    const secondProcessBefore = ensureActorProcessSnapshot("npc-second");
    installProcessUpdateFailureTrigger("tool:add_tag", "npc-key", "npc-second");

    await expect(runRequiredActorDecisionPass({
      campaignId: CAMPAIGN_ID,
      tick: 7,
      provider: {
        id: "test-provider",
        name: "Test",
        baseUrl: "http://localhost:1/v1",
        apiKey: "test",
        model: "test-model",
      },
      sceneFrame: createTwoActorSceneFrame(),
      playerLocationId: "loc-a",
      playerSceneScopeId: "loc-a",
      elapsedWorldTimeMinutes: 1,
      legalTools: ["add_tag"],
      scheduleActorProcesses: () => {
          const clock = readWorldClock(CAMPAIGN_ID);
          return {
            campaignId: CAMPAIGN_ID,
            baseWorldVersion: clock.worldVersion,
            worldTimeMinutes: clock.worldTimeMinutes,
            candidateActorIds: ["npc-key", "npc-second"],
            decisions: [
              {
                actorId: "npc-key",
                actorName: "Watcher",
                route: "required_before_done",
                reason: "test first required actor",
                signals: [],
                writeScopes: ["npc:npc-key:state"],
                reservation: {
                  actorId: "npc-key",
                  route: "required_before_done",
                  writeScopes: ["npc:npc-key:state"],
                  status: "reserved",
                  conflictsWithActorIds: [],
                },
              },
              {
                actorId: "npc-second",
                actorName: "Sentinel",
                route: "required_before_done",
                reason: "test second required actor",
                signals: [],
                writeScopes: ["npc:npc-second:state"],
                reservation: {
                  actorId: "npc-second",
                  route: "required_before_done",
                  writeScopes: ["npc:npc-second:state"],
                  status: "reserved",
                  conflictsWithActorIds: [],
                },
              },
            ],
          };
      },
      decideActor: ({ actorFrame }) => ({
        actorId: actorFrame.observer.actorId,
        citedFactIds: [`self:${actorFrame.observer.actorId}`],
        intent: `${actorFrame.observer.label} marks a local alert`,
        requestedTools: [
          {
            toolName: "add_tag",
            purpose: "mark alert state for atomic pass regression",
            input: {
              entityName: actorFrame.observer.label,
              entityType: "npc",
              tag: actorFrame.observer.actorId === "npc-key"
                ? "first-required-actor-committed"
                : "second-required-actor-attempted",
            },
          },
        ],
        nextDecisionTrigger: {
          reason: "test pass-level rollback",
          delayWorldTimeMinutes: 10,
        },
      }),
    })).rejects.toThrow("Actor process update failed for npc-second: stale_rejected");

    expect(readNpcRecordText("npc-key")).not.toContain("first-required-actor-committed");
    expect(readNpcRecordText("npc-second")).not.toContain("second-required-actor-attempted");
    expect(countAuthorityTraces()).toBe(0);
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({
      worldVersion: 0,
      worldTimeMinutes: 7,
    });
    expect(readActorProcessSnapshot("npc-key")).toEqual(firstProcessBefore);
    expect(readActorProcessSnapshot("npc-second")).toEqual(secondProcessBefore);
  });

  it("retracts durable actor log_event side effects when process update fails", async () => {
    await openTestVectorDb();
    const processBefore = ensureActorProcessSnapshot();
    installProcessUpdateFailureTrigger("tool:log_event");

    await expect(runRequiredActorDecisionPass({
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
        intent: "record a durable watch beat",
        requestedTools: [
          {
            toolName: "log_event",
            purpose: "record a future-relevant watch beat",
            input: {
              text: "Watcher learns the platform door pattern for later.",
              importance: 4,
              participants: ["Watcher"],
              durability: "durable",
              futureRelevance: "The watcher can use the door pattern in later turns.",
            },
          },
        ],
        nextDecisionTrigger: {
          reason: "watch pattern may matter later",
          delayWorldTimeMinutes: 10,
        },
      }),
    })).rejects.toThrow("Actor process update failed for npc-key: stale_rejected");

    expect(countAuthorityTraces()).toBe(0);
    expect(countLocationRecentEvents()).toBe(0);
    expect(await readEpisodicVectorRows()).toEqual([]);
    expect(readNpcImportance()).toBe(0);
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({
      worldVersion: 0,
      worldTimeMinutes: 7,
    });
    expect(readActorProcessSnapshot()).toEqual(processBefore);
  });

  it("stores actor durable log_event as hidden actor memory by default", async () => {
    await openTestVectorDb();

    const result = await executeActorDecisionPacket({
      campaignId: CAMPAIGN_ID,
      tick: 7,
      sceneFrame: createSceneFrame(),
      actorFrame: createActorFrame(),
      baseWorldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
      allowedWriteScopes: actorSelfWriteScopes(),
      packet: {
        actorId: "npc-key",
        citedFactIds: ["self:npc-key"],
        intent: "record private recognition for later actor behavior",
        requestedTools: [
          {
            toolName: "log_event",
            purpose: "store private actor memory without surfacing it to the player",
            input: {
              text: "Watcher privately recognizes the sealed proof pattern.",
              importance: 4,
              participants: ["Watcher"],
              durability: "durable",
              futureRelevance: "The watcher can use the recognition in later turns.",
            },
          },
        ],
      },
    });

    expect(result.actionResults[0]?.result).toMatchObject({
      success: true,
      result: {
        durability: "durable",
        persisted: true,
        visibility: "hidden",
        surfaceRoute: "actor_private_log_event",
        knowledgeRoute: "actor:npc-key",
      },
    });
    expect(getDb().select().from(locationRecentEvents).all()).toEqual([
      expect.objectContaining({
        summary: "Watcher privately recognizes the sealed proof pattern.",
        visibility: "hidden",
        surfaceRoute: "actor_private_log_event",
        knowledgeRoute: "actor:npc-key",
        hiddenCauseTerms: JSON.stringify(["npc-key"]),
      }),
    ]);
    expect(await readEpisodicVectorRows()).toEqual([
      expect.objectContaining({
        text: "Watcher privately recognizes the sealed proof pattern.",
      }),
    ]);
    expect(countAuthorityTraces()).toBe(1);
  });

  it("does not treat contested bounds as a completed actor process action", async () => {
    setNpcPowerStats("npc-key", createPowerStats({
      attackPotency: { tier: "City", rank: 7 },
      speed: { tier: "Supersonic", rank: 6 },
    }));
    setPlayerPowerStats("player-1", createPowerStats({
      durability: { tier: "Building", rank: 4 },
      speed: { tier: "Subsonic", rank: 4 },
    }));

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
        citedFactIds: ["self:npc-key", "actor:player-1"],
        intent: "test the player with a restraint threat",
        requestedTools: [
          {
            toolName: "request_contested_outcome",
            purpose: "get bounds, not aftermath",
            input: {
              actorName: "Watcher",
              targetName: "Player",
              mode: "restrain",
              intent: "Pin the player against the platform door.",
              stakes: "Whether the player can keep moving before the watcher closes distance.",
              evidenceRefs: ["Watcher", "Player"],
            },
          },
        ],
        nextDecisionTrigger: {
          reason: "needs a concrete follow-up action",
          delayWorldTimeMinutes: 10,
        },
      }),
    });

    expect(result.actionResults[0]?.result).toMatchObject({
      success: true,
      observationOnly: true,
    });
    expect(result.actionResults[0]?.result.authority).toBeUndefined();
    const processRow = getDb()
      .select()
      .from(actorProcessStates)
      .where(eq(actorProcessStates.actorId, "npc-key"))
      .get();
    const state = JSON.parse(processRow?.processState ?? "{}") as Record<string, unknown>;
    expect(state).toMatchObject({
      agencyDebt: 1,
      nextDecisionReason: "needs a concrete follow-up action",
    });
  });

  it("does not block broad status reads on presence-only actor decisions", async () => {
    const decideActor = vi.fn(() => {
      throw new Error("presence-only actor should not run before done");
    });

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
      playerAction: "I identify visible exits, guards, ledgers, and public routes.",
      playerLocationId: "loc-a",
      playerSceneScopeId: "loc-a",
      elapsedWorldTimeMinutes: 1,
      decideActor,
    });

    expect(decideActor).not.toHaveBeenCalled();
    expect(result.decisions).toEqual([]);
    expect(result.actionResults).toEqual([]);
    expect(result.schedule.decisions[0]).toMatchObject({
      actorId: "npc-key",
      route: "proposal_after_done",
      reason: "present actor reaction deferred after visible status read",
    });
  });

  it("honors explicit present actor deferral after a settled player-turn outcome", async () => {
    const decideActor = vi.fn(() => {
      throw new Error("settled actor reaction should not run before done");
    });

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
      playerAction: "I ask the clerk to stamp the filing now.",
      playerLocationId: "loc-a",
      playerSceneScopeId: "loc-a",
      elapsedWorldTimeMinutes: 1,
      presentActorReactionRoute: "proposal_after_done",
      decideActor,
    });

    expect(decideActor).not.toHaveBeenCalled();
    expect(result.decisions).toEqual([]);
    expect(result.actionResults).toEqual([]);
    expect(result.schedule.decisions[0]).toMatchObject({
      actorId: "npc-key",
      route: "proposal_after_done",
      reason: "present actor reaction deferred after visible status read",
    });
  });
});
