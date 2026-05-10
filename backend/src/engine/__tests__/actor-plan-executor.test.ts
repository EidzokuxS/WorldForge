import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  actorProcessStates,
  authorityTraces,
  campaigns,
  locationEdges,
  locationRecentEvents,
  locations,
  npcs,
  simulationProposals,
} from "../../db/schema.js";
import {
  backfillKeyActorProcessesForCampaign,
  listKeyActorProcessesForCampaign,
} from "../key-actor-process.js";
import {
  commitAuthorityTrace,
  ensureWorldClock,
  readWorldClock,
} from "../living-world-authority.js";
import { executeActorPlanStep } from "../actor-plan-executor.js";

const CAMPAIGN_ID = "actor-plan-executor-campaign";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Actor Plan Executor",
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
    isStarting: id === "loc-a",
    connectedTo: "[]",
  }).run();
}

function seedEdge(fromLocationId: string, toLocationId: string, travelCost = 5) {
  getDb().insert(locationEdges).values({
    id: `${fromLocationId}-${toLocationId}`,
    campaignId: CAMPAIGN_ID,
    fromLocationId,
    toLocationId,
    travelCost,
    discovered: true,
  }).run();
}

function seedNpc() {
  getDb().insert(npcs).values({
    id: "npc-key",
    campaignId: CAMPAIGN_ID,
    name: "Courier",
    persona: "A key NPC who follows routes.",
    characterRecord: "{}",
    derivedTags: "[]",
    tags: "[]",
    tier: "key",
    currentLocationId: "loc-a",
    currentSceneLocationId: "loc-a",
    goals: JSON.stringify({
      short_term: ["reach the depot"],
      long_term: ["keep the route alive"],
    }),
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
  seedLocation("loc-c", "Blocked Tower");
  seedEdge("loc-a", "loc-b", 7);
  seedEdge("loc-b", "loc-a", 7);
  seedNpc();
  ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 10 });
  backfillKeyActorProcessesForCampaign({
    campaignId: CAMPAIGN_ID,
    nextWakeDelayMinutes: 0,
  });
}

function setActivePlan(plan: unknown) {
  const row = getDb()
    .select()
    .from(actorProcessStates)
    .where(eq(actorProcessStates.actorId, "npc-key"))
    .get();
  if (!row) {
    throw new Error("missing actor process row");
  }
  const processState = JSON.parse(row.processState) as Record<string, unknown>;
  getDb()
    .update(actorProcessStates)
    .set({
      processState: JSON.stringify({
        ...processState,
        activePlan: plan,
      }),
      nextWakeWorldTimeMinutes: readWorldClock(CAMPAIGN_ID).worldTimeMinutes,
    })
    .where(eq(actorProcessStates.id, row.id))
    .run();
}

function loadProcess() {
  const process = listKeyActorProcessesForCampaign({
    campaignId: CAMPAIGN_ID,
    backfill: false,
  })[0];
  if (!process) {
    throw new Error("missing actor process");
  }
  return process;
}

describe("actor plan executor", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-actor-plan-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedWorld();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("commits deterministic travel as inspectable authority state", () => {
    setActivePlan({
      id: "plan-travel",
      summary: "Courier goes to the depot.",
      deterministic: true,
      writeScopes: ["npc:npc-key:state", "location:loc-b:presence"],
      action: {
        kind: "travel",
        destinationLocationName: "Depot",
        summary: "Courier reaches the depot offscreen.",
        surface: {
          surfaceRoute: "rumor_or_sighting",
          visibility: "local_signal",
          knowledgeRoute: "witness_report",
          hiddenCauseTerms: ["sealed patron"],
        },
      },
    });

    const result = executeActorPlanStep({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      process: loadProcess(),
      baseWorldVersion: 0,
    });

    expect(result).toMatchObject({
      status: "completed",
      actorId: "npc-key",
      processUpdateStatus: "updated",
      surface: {
        locationRef: "loc-b",
        surfaceRoute: "rumor_or_sighting",
        visibility: "local_signal",
        knowledgeRoute: "witness_report",
        hiddenCauseTerms: ["sealed patron"],
      },
    });
    expect(
      getDb()
        .select({ currentLocationId: npcs.currentLocationId })
        .from(npcs)
        .where(eq(npcs.id, "npc-key"))
        .get(),
    ).toMatchObject({ currentLocationId: "loc-b" });
    expect(getDb().select().from(locationRecentEvents).all()).toEqual([
      expect.objectContaining({
        locationId: "loc-b",
        eventType: "actor_plan_step",
        summary: "Courier reaches the depot offscreen.",
        surfaceRoute: "rumor_or_sighting",
        visibility: "local_signal",
        knowledgeRoute: "witness_report",
        hiddenCauseTerms: JSON.stringify(["sealed patron"]),
      }),
    ]);
    expect(getDb().select().from(authorityTraces).all()).toEqual([
      expect.objectContaining({
        operation: "actor_plan:travel",
        sourceEntityId: "npc-key",
        baseWorldVersion: 0,
        resultWorldVersion: 1,
      }),
    ]);
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({
      worldVersion: 1,
      worldTimeMinutes: 17,
    });
    expect(loadProcess().state.activePlan).toBeNull();
  });

  it("records failure and replan work when a deterministic path is invalid", () => {
    setActivePlan({
      id: "plan-blocked",
      summary: "Courier tries to reach the tower.",
      deterministic: true,
      writeScopes: ["npc:npc-key:state", "location:loc-c:presence"],
      action: {
        kind: "travel",
        destinationLocationName: "Blocked Tower",
      },
    });

    const result = executeActorPlanStep({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      process: loadProcess(),
      baseWorldVersion: 0,
    });

    expect(result).toMatchObject({
      status: "failed",
      actorId: "npc-key",
      processUpdateStatus: "updated",
    });
    expect(result.failureReason).toContain("not connected");
    expect(
      getDb()
        .select({ currentLocationId: npcs.currentLocationId })
        .from(npcs)
        .where(eq(npcs.id, "npc-key"))
        .get(),
    ).toMatchObject({ currentLocationId: "loc-a" });
    expect(getDb().select().from(locationRecentEvents).all()).toEqual([
      expect.objectContaining({ eventType: "actor_plan_failure" }),
    ]);
    expect(getDb().select().from(simulationProposals).all()).toEqual([
      expect.objectContaining({
        proposalType: "key_actor_replan_request",
        status: "pending",
        sourceEntityId: "npc-key",
      }),
    ]);
    expect(loadProcess().state.interrupts[0]?.reason).toContain("not connected");
  });

  it("rejects stale base versions before mutation", () => {
    setActivePlan({
      id: "plan-stale",
      summary: "Courier goes to the depot.",
      deterministic: true,
      action: {
        kind: "travel",
        destinationLocationName: "Depot",
      },
    });
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "test:advance",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "test" },
      elapsedWorldTimeMinutes: 1,
    });

    const result = executeActorPlanStep({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      process: loadProcess(),
      baseWorldVersion: 0,
    });

    expect(result).toMatchObject({
      status: "stale_rejected",
      failureReason: "stale_base_world_version",
    });
    expect(
      getDb()
        .select({ currentLocationId: npcs.currentLocationId })
        .from(npcs)
        .where(eq(npcs.id, "npc-key"))
        .get(),
    ).toMatchObject({ currentLocationId: "loc-a" });
    expect(getDb().select().from(locationRecentEvents).all()).toEqual([]);
    expect(getDb().select().from(authorityTraces).all()).toHaveLength(1);
  });
});
