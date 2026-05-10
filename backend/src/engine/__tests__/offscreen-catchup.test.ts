import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  actorProcessStates,
  campaigns,
  locationEdges,
  locationRecentEvents,
  locations,
  npcs,
  simulationProposals,
} from "../../db/schema.js";
import {
  backfillKeyActorProcessesForCampaign,
} from "../key-actor-process.js";
import {
  ensureWorldClock,
} from "../living-world-authority.js";
import { resolveActorExposureCatchup } from "../actor-exposure-catchup.js";
import { resolveDueWorldWorkForScope } from "../due-world-work.js";

const CAMPAIGN_ID = "offscreen-catchup-campaign";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Offscreen Catchup",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
}

function seedLocation(input: {
  id: string;
  name: string;
  parentLocationId?: string | null;
}) {
  getDb().insert(locations).values({
    id: input.id,
    campaignId: CAMPAIGN_ID,
    name: input.name,
    description: `${input.name} description`,
    kind: input.parentLocationId ? "persistent_sublocation" : "macro",
    parentLocationId: input.parentLocationId ?? null,
    anchorLocationId: null,
    persistence: "persistent",
    expiresAtTick: null,
    archivedAtTick: null,
    tags: "[]",
    isStarting: input.id === "loc-main",
    connectedTo: "[]",
  }).run();
}

function seedEdge(fromLocationId: string, toLocationId: string) {
  getDb().insert(locationEdges).values({
    id: `${fromLocationId}-${toLocationId}`,
    campaignId: CAMPAIGN_ID,
    fromLocationId,
    toLocationId,
    travelCost: 4,
    discovered: true,
  }).run();
}

function seedNpc(input: {
  id: string;
  name: string;
  locationId: string;
  sceneId: string;
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
    currentSceneLocationId: input.sceneId,
    goals: JSON.stringify({ short_term: ["act"], long_term: ["persist"] }),
    beliefs: "[]",
    unprocessedImportance: 0,
    inactiveTicks: 0,
    createdAt: Date.now(),
  }).run();
}

function seedWorld() {
  seedCampaign();
  seedLocation({ id: "loc-main", name: "Station" });
  seedLocation({ id: "scene-a", name: "Platform", parentLocationId: "loc-main" });
  seedLocation({ id: "scene-b", name: "Archive", parentLocationId: "loc-main" });
  seedLocation({ id: "loc-away", name: "Depot" });
  seedEdge("loc-main", "loc-away");
  seedEdge("loc-away", "loc-main");
  ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 20, worldTimeMinutes: 20 });
}

function backfillAndSetPlan(actorId: string, plan: unknown) {
  backfillKeyActorProcessesForCampaign({
    campaignId: CAMPAIGN_ID,
    nextWakeDelayMinutes: 0,
  });
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
      nextWakeWorldTimeMinutes: 20,
    })
    .where(eq(actorProcessStates.id, row.id))
    .run();
}

describe("offscreen catch-up", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-offscreen-catchup-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedWorld();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("resolves due deterministic same-scope work before frame assembly", () => {
    seedNpc({
      id: "npc-nearby",
      name: "Archivist",
      locationId: "loc-main",
      sceneId: "scene-b",
    });
    backfillAndSetPlan("npc-nearby", {
      id: "plan-leave",
      summary: "Archivist heads to the depot.",
      deterministic: true,
      writeScopes: ["npc:npc-nearby:state", "location:loc-away:presence"],
      action: {
        kind: "travel",
        destinationLocationName: "Depot",
        summary: "Archivist leaves the archive for the depot.",
      },
    });

    const result = resolveDueWorldWorkForScope({
      campaignId: CAMPAIGN_ID,
      tick: 20,
      playerLocationId: "loc-main",
      playerSceneScopeId: "scene-a",
      elapsedWorldTimeMinutes: 15,
      phase: "pre_scene_frame",
    });

    expect(result.executed).toEqual([
      expect.objectContaining({ status: "completed", actorId: "npc-nearby" }),
    ]);
    expect(
      getDb()
        .select({ currentLocationId: npcs.currentLocationId })
        .from(npcs)
        .where(eq(npcs.id, "npc-nearby"))
        .get(),
    ).toMatchObject({ currentLocationId: "loc-away" });
    expect(getDb().select().from(locationRecentEvents).all()).toEqual([
      expect.objectContaining({
        locationId: "loc-away",
        summary: "Archivist leaves the archive for the depot.",
      }),
    ]);
  });

  it("turns non-deterministic due work into source-backed decision proposals instead of direct state", () => {
    seedNpc({
      id: "npc-nearby",
      name: "Archivist",
      locationId: "loc-main",
      sceneId: "scene-b",
    });
    backfillAndSetPlan("npc-nearby", {
      id: "plan-think",
      summary: "Archivist decides what to do with the sealed folder.",
      deterministic: false,
      writeScopes: ["npc:npc-nearby:state"],
    });

    const result = resolveDueWorldWorkForScope({
      campaignId: CAMPAIGN_ID,
      tick: 20,
      playerLocationId: "loc-main",
      playerSceneScopeId: "scene-a",
      elapsedWorldTimeMinutes: 15,
      phase: "pre_scene_frame",
    });

    expect(result.executed).toEqual([]);
    expect(result.deferred).toHaveLength(1);
    expect(
      getDb()
        .select({ currentLocationId: npcs.currentLocationId })
        .from(npcs)
        .where(eq(npcs.id, "npc-nearby"))
        .get(),
    ).toMatchObject({ currentLocationId: "loc-main" });
    expect(getDb().select().from(simulationProposals).all()).toEqual([
      expect.objectContaining({
        proposalType: "key_actor_due_decision",
        status: "pending",
        sourceEntityId: "npc-nearby",
      }),
    ]);

    const secondResult = resolveDueWorldWorkForScope({
      campaignId: CAMPAIGN_ID,
      tick: 20,
      playerLocationId: "loc-main",
      playerSceneScopeId: "scene-a",
      elapsedWorldTimeMinutes: 15,
      phase: "pre_scene_frame",
    });

    expect(secondResult.deferred).toHaveLength(1);
    expect(getDb().select().from(simulationProposals).all()).toHaveLength(1);
  });

  it("catches up visible deterministic actor plans before stale frame exposure", () => {
    seedNpc({
      id: "npc-visible",
      name: "Visible Courier",
      locationId: "loc-main",
      sceneId: "scene-a",
    });
    backfillAndSetPlan("npc-visible", {
      id: "plan-visible-leave",
      summary: "PRIVATE MOONLIGHT ROUTE: Visible Courier leaves before the player looks.",
      deterministic: true,
      writeScopes: ["npc:npc-visible:state", "location:loc-away:presence"],
      action: {
        kind: "travel",
        destinationLocationName: "Depot",
        summary: "Visible Courier leaves the platform for the depot.",
      },
    });

    const result = resolveActorExposureCatchup({
      campaignId: CAMPAIGN_ID,
      tick: 20,
      playerLocationId: "loc-main",
      playerSceneScopeId: "scene-a",
      elapsedWorldTimeMinutes: 0,
      phase: "pre_scene_frame",
    });

    expect(result.inspectedActorIds).toEqual(["npc-visible"]);
    expect(result.executed).toEqual([
      expect.objectContaining({ status: "completed", actorId: "npc-visible" }),
    ]);
    expect(result.requiresFrameRefresh).toBe(true);
    expect(
      getDb()
        .select({ currentLocationId: npcs.currentLocationId })
        .from(npcs)
        .where(eq(npcs.id, "npc-visible"))
        .get(),
    ).toMatchObject({ currentLocationId: "loc-away" });
    expect(JSON.stringify(result)).not.toContain("PRIVATE MOONLIGHT ROUTE");
  });

  it("defers visible non-deterministic actor work once without exposing private plan text", () => {
    seedNpc({
      id: "npc-visible",
      name: "Visible Courier",
      locationId: "loc-main",
      sceneId: "scene-a",
    });
    backfillAndSetPlan("npc-visible", {
      id: "plan-visible-choice",
      summary: "PRIVATE OATH: Visible Courier chooses whether to betray the depot.",
      deterministic: false,
      writeScopes: ["npc:npc-visible:state"],
    });

    const first = resolveActorExposureCatchup({
      campaignId: CAMPAIGN_ID,
      tick: 20,
      playerLocationId: "loc-main",
      playerSceneScopeId: "scene-a",
      elapsedWorldTimeMinutes: 0,
      phase: "pre_scene_frame",
    });
    const second = resolveActorExposureCatchup({
      campaignId: CAMPAIGN_ID,
      tick: 20,
      playerLocationId: "loc-main",
      playerSceneScopeId: "scene-a",
      elapsedWorldTimeMinutes: 0,
      phase: "pre_scene_frame",
    });

    expect(first.executed).toEqual([]);
    expect(first.deferred).toHaveLength(1);
    expect(second.deferred).toHaveLength(1);
    expect(
      getDb()
        .select({ currentLocationId: npcs.currentLocationId })
        .from(npcs)
        .where(eq(npcs.id, "npc-visible"))
        .get(),
    ).toMatchObject({ currentLocationId: "loc-main" });
    expect(getDb().select().from(simulationProposals).all()).toEqual([
      expect.objectContaining({
        proposalType: "key_actor_exposure_decision",
        status: "pending",
        sourceEntityId: "npc-visible",
      }),
    ]);
    expect(JSON.stringify({
      executed: first.executed,
      skippedActorIds: first.skippedActorIds,
      inspectedActorIds: first.inspectedActorIds,
      proposals: getDb().select({
        proposalType: simulationProposals.proposalType,
        sourceEntityId: simulationProposals.sourceEntityId,
      }).from(simulationProposals).all(),
    })).not.toContain("PRIVATE OATH");
  });
});
