import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  campaigns,
  locations,
  npcs,
} from "../../db/schema.js";
import {
  commitAuthorityTrace,
  ensureWorldClock,
} from "../living-world-authority.js";
import { backfillKeyActorProcessesForCampaign } from "../key-actor-process.js";
import { scheduleKeyActorProcessesForTurn } from "../actor-scheduler.js";

const CAMPAIGN_ID = "actor-scheduler-campaign";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Actor Scheduler",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
}

function seedLocation(id: string, parentLocationId: string | null = null) {
  getDb().insert(locations).values({
    id,
    campaignId: CAMPAIGN_ID,
    name: id,
    description: `${id} description`,
    kind: parentLocationId ? "persistent_sublocation" : "macro",
    parentLocationId,
    anchorLocationId: null,
    persistence: "persistent",
    expiresAtTick: null,
    archivedAtTick: null,
    tags: "[]",
    isStarting: id === "loc-main",
    connectedTo: "[]",
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
    goals: JSON.stringify({ short_term: ["watch"], long_term: ["advance plan"] }),
    beliefs: "[]",
    unprocessedImportance: 0,
    inactiveTicks: 0,
    createdAt: Date.now(),
  }).run();
}

describe("actor scheduler", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-actor-scheduler-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
    seedLocation("loc-main");
    seedLocation("scene-a", "loc-main");
    seedLocation("scene-b", "loc-main");
    seedLocation("loc-away");
    seedLocation("scene-away", "loc-away");
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 0 });
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("does not over-tick distant key actors on short dialogue turns", () => {
    seedNpc({
      id: "npc-away",
      name: "Away Actor",
      locationId: "loc-away",
      sceneId: "scene-away",
    });
    backfillKeyActorProcessesForCampaign({
      campaignId: CAMPAIGN_ID,
      nextWakeDelayMinutes: 30,
    });

    const schedule = scheduleKeyActorProcessesForTurn({
      campaignId: CAMPAIGN_ID,
      tick: 1,
      playerLocationId: "loc-main",
      playerSceneScopeId: "scene-a",
      elapsedWorldTimeMinutes: 1,
    });

    expect(schedule.decisions).toHaveLength(1);
    expect(schedule.decisions[0]).toMatchObject({
      actorId: "npc-away",
      route: "sleeping",
      reason: "no wake signal",
    });
  });

  it("marks present key actors as required before the visible turn boundary", () => {
    seedNpc({
      id: "npc-present",
      name: "Present Actor",
      locationId: "loc-main",
      sceneId: "scene-a",
    });
    backfillKeyActorProcessesForCampaign({
      campaignId: CAMPAIGN_ID,
      nextWakeDelayMinutes: 30,
    });

    const schedule = scheduleKeyActorProcessesForTurn({
      campaignId: CAMPAIGN_ID,
      tick: 1,
      playerLocationId: "loc-main",
      playerSceneScopeId: "scene-a",
      elapsedWorldTimeMinutes: 1,
    });

    expect(schedule.decisions[0]).toMatchObject({
      actorId: "npc-present",
      route: "required_before_done",
      reason: "present actor can affect the visible scene",
      reservation: {
        status: "reserved",
      },
    });
    expect(schedule.decisions[0]?.signals.map((signal) => signal.type)).toContain(
      "direct_observation",
    );
  });

  it("wakes distant actors after enough world time elapses", () => {
    seedNpc({
      id: "npc-away",
      name: "Away Actor",
      locationId: "loc-away",
      sceneId: "scene-away",
    });
    backfillKeyActorProcessesForCampaign({
      campaignId: CAMPAIGN_ID,
      nextWakeDelayMinutes: 30,
    });
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "tool:wait",
      baseWorldVersion: 0,
      sourceEntity: { type: "player", id: "player-1" },
      elapsedWorldTimeMinutes: 35,
    });

    const schedule = scheduleKeyActorProcessesForTurn({
      campaignId: CAMPAIGN_ID,
      tick: 35,
      playerLocationId: "loc-main",
      playerSceneScopeId: "scene-a",
      elapsedWorldTimeMinutes: 35,
    });

    expect(schedule).toMatchObject({
      baseWorldVersion: 1,
      worldTimeMinutes: 35,
    });
    expect(schedule.decisions[0]).toMatchObject({
      actorId: "npc-away",
      route: "proposal_after_done",
      signals: [expect.objectContaining({ type: "due_time" })],
    });
  });

  it("routes same-broad-location hidden actors through exposed-scope catch-up proposals", () => {
    seedNpc({
      id: "npc-nearby",
      name: "Nearby Actor",
      locationId: "loc-main",
      sceneId: "scene-b",
    });
    backfillKeyActorProcessesForCampaign({
      campaignId: CAMPAIGN_ID,
      nextWakeDelayMinutes: 30,
    });

    const schedule = scheduleKeyActorProcessesForTurn({
      campaignId: CAMPAIGN_ID,
      tick: 2,
      playerLocationId: "loc-main",
      playerSceneScopeId: "scene-a",
      elapsedWorldTimeMinutes: 2,
    });

    expect(schedule.decisions[0]).toMatchObject({
      actorId: "npc-nearby",
      route: "proposal_after_done",
      signals: [expect.objectContaining({ type: "exposed_scope_catch_up" })],
    });
  });

  it("serializes conflicting present actor write scopes", () => {
    seedNpc({
      id: "npc-present-a",
      name: "Present A",
      locationId: "loc-main",
      sceneId: "scene-a",
    });
    seedNpc({
      id: "npc-present-b",
      name: "Present B",
      locationId: "loc-main",
      sceneId: "scene-a",
    });
    backfillKeyActorProcessesForCampaign({
      campaignId: CAMPAIGN_ID,
      nextWakeDelayMinutes: 30,
    });

    const schedule = scheduleKeyActorProcessesForTurn({
      campaignId: CAMPAIGN_ID,
      tick: 1,
      playerLocationId: "loc-main",
      playerSceneScopeId: "scene-a",
      elapsedWorldTimeMinutes: 1,
    });

    expect(schedule.decisions.map((decision) => decision.route)).toEqual([
      "required_before_done",
      "required_before_done",
    ]);
    expect(schedule.decisions[0]?.reservation).toMatchObject({ status: "reserved" });
    expect(schedule.decisions[1]?.reservation).toMatchObject({
      status: "conflict_serialized",
      conflictsWithActorIds: ["npc-present-a"],
    });
  });
});
