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
  simulationJobs,
  simulationProposals,
  worldClocks,
} from "../../db/schema.js";
import {
  WorldVersionConflictError,
  commitAuthorityTrace,
  ensureWorldClock,
  invalidateAuthorityAfterRestore,
  queueSimulationJob,
  readWorldClock,
  recordSimulationProposal,
  upsertActorProcessState,
  validateBaseWorldVersion,
} from "../living-world-authority.js";

const CAMPAIGN_ID = "authority-test-campaign";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Authority Test",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
}

describe("living world authority", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-authority-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a campaign clock and rejects stale base-version writes", () => {
    const clock = ensureWorldClock({
      campaignId: CAMPAIGN_ID,
      currentTick: 7,
    });

    expect(clock).toMatchObject({
      campaignId: CAMPAIGN_ID,
      worldVersion: 0,
      worldTimeMinutes: 7,
      currentTick: 7,
    });

    const authority = commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "tool:log_event",
      baseWorldVersion: 0,
      sourceEntity: { type: "player", id: "player-1" },
      elapsedWorldTimeMinutes: 3,
      currentTick: 7,
      eventIds: ["event-1"],
      stateDeltaRefs: ["event-1"],
    });

    expect(authority).toMatchObject({
      campaignId: CAMPAIGN_ID,
      baseWorldVersion: 0,
      resultWorldVersion: 1,
      worldTimeMinutes: 10,
      elapsedWorldTimeMinutes: 3,
    });

    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({
      worldVersion: 1,
      worldTimeMinutes: 10,
      currentTick: 10,
    });
    expect(() =>
      validateBaseWorldVersion({
        campaignId: CAMPAIGN_ID,
        baseWorldVersion: 0,
      }),
    ).toThrow(WorldVersionConflictError);

    const traces = getDb()
      .select()
      .from(authorityTraces)
      .where(eq(authorityTraces.campaignId, CAMPAIGN_ID))
      .all();
    expect(traces).toHaveLength(1);
    expect(traces[0]?.resultWorldVersion).toBe(1);
  });

  it("cancels future jobs/proposals and disables ahead-of-rollback actor process state", () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 5 });
    const jobId = queueSimulationJob({
      campaignId: CAMPAIGN_ID,
      jobType: "npc_tick",
      baseWorldVersion: 0,
      sourceEntity: { type: "npc", id: "npc-1" },
      scheduledWorldTimeMinutes: 8,
      payload: { action: "wake later" },
    });

    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "tool:move_to",
      baseWorldVersion: 0,
      sourceEntity: { type: "player", id: "player-1" },
      elapsedWorldTimeMinutes: 2,
      stateDeltaRefs: ["loc-2"],
    });

    const proposalId = recordSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "npc_action",
      baseWorldVersion: 1,
      sourceEntity: { type: "npc", id: "npc-1" },
      jobId,
      proposedWorldVersion: 2,
      payload: { wants: "move" },
    });
    upsertActorProcessState({
      campaignId: CAMPAIGN_ID,
      actorType: "npc",
      actorId: "npc-1",
      status: "queued",
      lastWorldVersion: 2,
      nextWakeWorldTimeMinutes: 9,
      processState: { plan: "advance" },
    });

    invalidateAuthorityAfterRestore({
      campaignId: CAMPAIGN_ID,
      restoredWorldVersion: 0,
      restoredWorldTimeMinutes: 5,
      reason: "test rollback",
    });

    const job = getDb()
      .select()
      .from(simulationJobs)
      .where(eq(simulationJobs.id, jobId))
      .get();
    const proposal = getDb()
      .select()
      .from(simulationProposals)
      .where(eq(simulationProposals.id, proposalId))
      .get();
    const actorProcess = getDb()
      .select()
      .from(actorProcessStates)
      .where(eq(actorProcessStates.actorId, "npc-1"))
      .get();

    expect(job).toMatchObject({
      status: "canceled",
      canceledReason: "test rollback",
    });
    expect(proposal).toMatchObject({
      status: "canceled",
      rejectionReason: "test rollback",
    });
    expect(actorProcess).toMatchObject({
      status: "disabled",
      disabledReason: "test rollback",
      nextWakeWorldTimeMinutes: null,
    });
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({
      worldVersion: 0,
      worldTimeMinutes: 5,
      currentTick: 5,
    });
  });

  it("keeps world-version linearity at the database level", () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 0 });
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "tool:add_tag",
      baseWorldVersion: 0,
      sourceEntity: { type: "player", id: "player-1" },
      stateDeltaRefs: ["player-1"],
    });

    expect(() =>
      getDb().insert(authorityTraces).values({
        id: "duplicate-trace",
        campaignId: CAMPAIGN_ID,
        operation: "manual-duplicate",
        sourceEntityType: "test",
        sourceEntityId: null,
        baseWorldVersion: 0,
        resultWorldVersion: 1,
        worldTimeMinutes: 1,
        elapsedWorldTimeMinutes: 1,
        toolResultId: "manual",
        eventIds: "[]",
        stateDeltaRefs: "[]",
        witnesses: "[]",
        metadata: "{}",
        createdAt: Date.now(),
      }).run(),
    ).toThrow();

    const clocks = getDb()
      .select()
      .from(worldClocks)
      .where(eq(worldClocks.campaignId, CAMPAIGN_ID))
      .all();
    expect(clocks).toHaveLength(1);
    expect(clocks[0]?.worldVersion).toBe(1);
  });
});
