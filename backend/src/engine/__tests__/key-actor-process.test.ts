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
  locations,
  npcs,
} from "../../db/schema.js";
import { ensureWorldClock } from "../living-world-authority.js";
import {
  backfillKeyActorProcessesForCampaign,
  listKeyActorProcessesForCampaign,
  promotePersistentNpcToActorProcess,
  updateActorProcessAfterDecision,
} from "../key-actor-process.js";

const CAMPAIGN_ID = "key-actor-process-campaign";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Key Actor Process",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
  getDb().insert(locations).values({
    id: "loc-1",
    campaignId: CAMPAIGN_ID,
    name: "Market",
    description: "A crowded market.",
    kind: "macro",
    parentLocationId: null,
    anchorLocationId: null,
    persistence: "persistent",
    expiresAtTick: null,
    archivedAtTick: null,
    tags: "[]",
    isStarting: true,
    connectedTo: "[]",
  }).run();
}

function seedNpc(input: {
  id: string;
  name: string;
  tier: "temporary" | "persistent" | "key";
}) {
  getDb().insert(npcs).values({
    id: input.id,
    campaignId: CAMPAIGN_ID,
    name: input.name,
    persona: `${input.name} persona`,
    characterRecord: "{}",
    derivedTags: "[]",
    tags: "[]",
    tier: input.tier,
    currentLocationId: "loc-1",
    currentSceneLocationId: "loc-1",
    goals: JSON.stringify({
      short_term: [`${input.name} short goal`],
      long_term: [`${input.name} long goal`],
    }),
    beliefs: "[]",
    unprocessedImportance: 0,
    inactiveTicks: 0,
    createdAt: Date.now(),
  }).run();
}

describe("key actor process state", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-key-actor-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 10 });
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("backfills key NPCs without upgrading temporary or persistent NPCs implicitly", () => {
    seedNpc({ id: "npc-key", name: "Key Actor", tier: "key" });
    seedNpc({ id: "npc-persistent", name: "Persistent Actor", tier: "persistent" });
    seedNpc({ id: "npc-temporary", name: "Temporary Actor", tier: "temporary" });

    const backfill = backfillKeyActorProcessesForCampaign({
      campaignId: CAMPAIGN_ID,
      nextWakeDelayMinutes: 20,
    });

    expect(backfill.insertedActorIds).toEqual(["npc-key"]);
    let processes = listKeyActorProcessesForCampaign({
      campaignId: CAMPAIGN_ID,
      backfill: false,
    });
    expect(processes.map((process) => process.actorId)).toEqual(["npc-key"]);
    expect(processes[0]).toMatchObject({
      actorId: "npc-key",
      nextWakeWorldTimeMinutes: 30,
      state: {
        goals: ["Key Actor short goal", "Key Actor long goal"],
        nextDecisionReason: "initial_backfill",
      },
    });

    expect(promotePersistentNpcToActorProcess({
      campaignId: CAMPAIGN_ID,
      npcId: "npc-persistent",
      nextWakeDelayMinutes: 5,
      reason: "test promotion",
    })).toBe(true);

    processes = listKeyActorProcessesForCampaign({
      campaignId: CAMPAIGN_ID,
      backfill: false,
    });
    expect(processes.map((process) => process.actorId).sort()).toEqual([
      "npc-key",
      "npc-persistent",
    ]);

    const processRows = getDb().select().from(actorProcessStates).all();
    expect(processRows.map((row) => row.actorId).sort()).not.toContain("npc-temporary");
  });

  it("updates process state with base-version protection", () => {
    seedNpc({ id: "npc-key", name: "Key Actor", tier: "key" });
    backfillKeyActorProcessesForCampaign({
      campaignId: CAMPAIGN_ID,
      nextWakeDelayMinutes: 20,
    });
    const process = listKeyActorProcessesForCampaign({
      campaignId: CAMPAIGN_ID,
      backfill: false,
    })[0]!;

    const updated = updateActorProcessAfterDecision({
      campaignId: CAMPAIGN_ID,
      actorId: process.actorId,
      expectedBaseWorldVersion: 0,
      resultWorldVersion: 1,
      lastWakeWorldTimeMinutes: 10,
      nextWakeWorldTimeMinutes: 45,
      status: "waiting",
      processState: {
        ...process.state,
        agencyDebt: 0,
        nextDecisionReason: "handled_due_time",
      },
    });
    expect(updated).toMatchObject({
      status: "updated",
      previousWorldVersion: 0,
      resultWorldVersion: 1,
    });

    const stale = updateActorProcessAfterDecision({
      campaignId: CAMPAIGN_ID,
      actorId: process.actorId,
      expectedBaseWorldVersion: 0,
      resultWorldVersion: 2,
      processState: process.state,
    });
    expect(stale).toMatchObject({
      status: "stale_rejected",
      previousWorldVersion: 1,
    });

    const row = getDb()
      .select()
      .from(actorProcessStates)
      .where(eq(actorProcessStates.actorId, "npc-key"))
      .get();
    expect(row).toMatchObject({
      lastWorldVersion: 1,
      lastWakeWorldTimeMinutes: 10,
      nextWakeWorldTimeMinutes: 45,
      status: "waiting",
    });
  });
});
