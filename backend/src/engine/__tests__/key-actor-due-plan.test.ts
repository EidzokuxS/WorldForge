import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  actorProcessStates,
  actorWakeSignals,
  authorityTraces,
  campaigns,
  locationEdges,
  locationRecentEvents,
  locations,
  npcs,
  players,
  simulationProposals,
} from "../../db/schema.js";
import { backfillKeyActorProcessesForCampaign } from "../key-actor-process.js";
import { ensureWorldClock } from "../living-world-authority.js";
import { enqueueActorWakeSignal } from "../actor-wake-signals.js";
import { scheduleKeyActorProcessesForTurn } from "../actor-scheduler.js";
import { resolveDueWorldWorkForScope } from "../due-world-work.js";
import { buildSceneFrame } from "../scene-frame.js";

const CAMPAIGN_ID = "key-actor-due-plan-campaign";
const PLAYER_ID = "player-1";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Key Actor Due Plan",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
}

function seedLocation(id: string, name: string) {
  getDb().insert(locations).values({
    id,
    campaignId: CAMPAIGN_ID,
    name,
    description: `${name} description`,
    kind: "macro",
    parentLocationId: null,
    anchorLocationId: null,
    persistence: "persistent",
    expiresAtTick: null,
    archivedAtTick: null,
    tags: "[]",
    isStarting: id === "loc-b",
    connectedTo: "[]",
  }).run();
}

function seedEdge(fromLocationId: string, toLocationId: string) {
  getDb().insert(locationEdges).values({
    id: `${fromLocationId}-${toLocationId}`,
    campaignId: CAMPAIGN_ID,
    fromLocationId,
    toLocationId,
    travelCost: 6,
    discovered: true,
  }).run();
}

function seedPlayer() {
  getDb().insert(players).values({
    id: PLAYER_ID,
    campaignId: CAMPAIGN_ID,
    name: "Mira",
    race: "human",
    gender: "",
    age: "",
    appearance: "",
    hp: 5,
    characterRecord: "{}",
    derivedTags: "[]",
    tags: "[]",
    equippedItems: "[]",
    currentLocationId: "loc-b",
    currentSceneLocationId: "loc-b",
  }).run();
}

function seedNpc(input: {
  id: string;
  name: string;
  locationId: string;
}) {
  getDb().insert(npcs).values({
    id: input.id,
    campaignId: CAMPAIGN_ID,
    name: input.name,
    persona: `${input.name} persona`,
    characterRecord: "{}",
    derivedTags: "[]",
    tags: "[]",
    tier: "key",
    currentLocationId: input.locationId,
    currentSceneLocationId: input.locationId,
    goals: JSON.stringify({ short_term: ["continue"], long_term: ["matter later"] }),
    beliefs: "[]",
    unprocessedImportance: 0,
    inactiveTicks: 0,
    createdAt: Date.now(),
  }).run();
}

function seedWorld() {
  seedCampaign();
  seedLocation("loc-a", "Market");
  seedLocation("loc-b", "Depot");
  seedLocation("loc-c", "Distant Gate");
  seedEdge("loc-a", "loc-b");
  seedEdge("loc-b", "loc-a");
  seedPlayer();
  seedNpc({ id: "npc-due", name: "Courier", locationId: "loc-a" });
  for (let index = 0; index < 40; index += 1) {
    seedNpc({
      id: `npc-sleeper-${index}`,
      name: `Sleeper ${index}`,
      locationId: "loc-c",
    });
  }
  ensureWorldClock({
    campaignId: CAMPAIGN_ID,
    currentTick: 20,
    worldTimeMinutes: 20,
  });
  backfillKeyActorProcessesForCampaign({
    campaignId: CAMPAIGN_ID,
    nextWakeDelayMinutes: 500,
  });
}

function setActivePlan(actorId: string, plan: unknown, nextWakeWorldTimeMinutes: number) {
  const row = getDb()
    .select()
    .from(actorProcessStates)
    .where(eq(actorProcessStates.actorId, actorId))
    .get();
  if (!row) {
    throw new Error(`missing actor process ${actorId}`);
  }
  const processState = JSON.parse(row.processState) as Record<string, unknown>;
  getDb()
    .update(actorProcessStates)
    .set({
      processState: JSON.stringify({ ...processState, activePlan: plan }),
      nextWakeWorldTimeMinutes,
    })
    .where(eq(actorProcessStates.id, row.id))
    .run();
}

describe("key actor due plan acceptance", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-key-actor-due-plan-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedWorld();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("executes one due key NPC elsewhere and leaves a discoverable consequence", async () => {
    setActivePlan("npc-due", {
      id: "plan-deliver",
      summary: "Courier carries a sealed pouch to the depot.",
      deterministic: true,
      writeScopes: ["npc:npc-due:state", "location:loc-b:presence"],
      action: {
        kind: "travel",
        destinationLocationId: "loc-b",
        summary: "Courier arrives at the depot with a sealed pouch.",
        surface: {
          surfaceRoute: "sighting",
          visibility: "local_signal",
          knowledgeRoute: "witness_report",
          hiddenCauseTerms: ["sealed patron"],
        },
      },
    }, 20);
    enqueueActorWakeSignal({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-due",
      signalType: "report",
      sourceType: "authority_trace",
      sourceId: "trace-courier-due",
      summary: "Courier due plan should resolve before exposure.",
      priority: 8,
      dueWorldTimeMinutes: 20,
    });

    const schedule = scheduleKeyActorProcessesForTurn({
      campaignId: CAMPAIGN_ID,
      tick: 20,
      playerLocationId: "loc-b",
      playerSceneScopeId: "loc-b",
      elapsedWorldTimeMinutes: 10,
    });
    expect(schedule.candidateActorIds).toEqual(["npc-due"]);
    expect(schedule.decisions.map((decision) => decision.actorId)).toEqual(["npc-due"]);

    const result = resolveDueWorldWorkForScope({
      campaignId: CAMPAIGN_ID,
      tick: 20,
      playerLocationId: "loc-b",
      playerSceneScopeId: "loc-b",
      elapsedWorldTimeMinutes: 10,
      phase: "pre_scene_frame",
    });

    expect(result.executed).toEqual([
      expect.objectContaining({
        status: "completed",
        actorId: "npc-due",
        surface: expect.objectContaining({
          visibility: "local_signal",
          hiddenCauseTerms: ["sealed patron"],
        }),
      }),
    ]);
    expect(result.deferred).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(getDb().select().from(actorWakeSignals).all()).toEqual([
      expect.objectContaining({ actorId: "npc-due", status: "consumed" }),
    ]);
    expect(getDb().select().from(authorityTraces).all()).toEqual([
      expect.objectContaining({
        operation: "actor_plan:travel",
        sourceEntityId: "npc-due",
        resultWorldVersion: 1,
      }),
    ]);
    const event = getDb().select().from(locationRecentEvents).all()[0];
    expect(event).toMatchObject({
      locationId: "loc-b",
      summary: "Courier arrives at the depot with a sealed pouch.",
      surfaceRoute: "sighting",
      visibility: "local_signal",
      knowledgeRoute: "witness_report",
      hiddenCauseTerms: JSON.stringify(["sealed patron"]),
    });
    expect(event?.summary).not.toContain("sealed patron");

    const frame = await buildSceneFrame({
      campaignId: CAMPAIGN_ID,
      tick: 20,
      playerActorId: PLAYER_ID,
      playerAction: "I look around the depot.",
      currentLocationId: "loc-b",
      currentSceneScopeId: "loc-b",
      currentLocationName: "Depot",
      currentSceneScopeName: "Depot",
      roster: {
        active: [{
          id: PLAYER_ID,
          type: "player",
          label: "Mira",
          locationId: "loc-b",
          sceneScopeId: "loc-b",
          awareness: "clear",
        }],
        support: [],
        background: [],
      },
      perception: {
        playerAwarenessHints: [],
        actorAwareness: {},
        forbiddenActorIds: [],
        forbiddenActorLabels: [],
      },
      recentEvents: [{
        id: event!.id,
        tick: event!.tick,
        summary: event!.summary,
        source: "location_recent_event",
        actorIds: [],
        perceivableByPlayer: true,
      }],
      targetCandidates: [],
      movementCandidates: [],
      deferredHooks: [],
      allowedTools: ["log_event"],
    });
    expect(frame.recentEvents).toContainEqual(
      expect.objectContaining({
        summary: "Courier arrives at the depot with a sealed pouch.",
        perceivableByPlayer: true,
      }),
    );
    expect(JSON.stringify(frame)).not.toContain("sealed patron");
  });

  it("defers non-deterministic due key NPC work without mutating sleepers", () => {
    setActivePlan("npc-due", {
      id: "plan-choose",
      summary: "Courier decides whether to trust the depot clerk.",
      deterministic: false,
      writeScopes: ["npc:npc-due:state"],
    }, 20);

    const result = resolveDueWorldWorkForScope({
      campaignId: CAMPAIGN_ID,
      tick: 20,
      playerLocationId: "loc-b",
      playerSceneScopeId: "loc-b",
      elapsedWorldTimeMinutes: 10,
      phase: "pre_scene_frame",
    });

    expect(result.executed).toEqual([]);
    expect(result.deferred).toHaveLength(1);
    expect(getDb().select().from(simulationProposals).all()).toEqual([
      expect.objectContaining({
        proposalType: "key_actor_due_decision",
        status: "pending",
        sourceEntityId: "npc-due",
      }),
    ]);
    expect(
      getDb()
        .select({ currentLocationId: npcs.currentLocationId })
        .from(npcs)
        .where(eq(npcs.id, "npc-due"))
        .get(),
    ).toMatchObject({ currentLocationId: "loc-a" });
    expect(result.deferred[0]?.decision.actorId).toBe("npc-due");
    expect(result.deferred[0]?.decision.actorId.startsWith("npc-sleeper-")).toBe(false);
  });
});
