import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  authorityTraces,
  campaigns,
  chronicle,
  simulationJobs,
  simulationProposals,
} from "../../db/schema.js";
import {
  commitAuthorityTrace,
  ensureWorldClock,
  queueSimulationJob,
  readWorldClock,
} from "../living-world-authority.js";
import { createSimulationProposal } from "../simulation-proposal.js";
import { executeDueSimulationProposal } from "../simulation-proposal-executor.js";
import { resolveDueWorldWorkForScopeWithProposalWatchdog } from "../due-world-work.js";

const CAMPAIGN_ID = "simulation-proposal-executor-campaign";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Simulation Proposal Executor",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
}

function seedWorld() {
  seedCampaign();
  ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 10, worldTimeMinutes: 10 });
}

function createJob(jobType: string, baseWorldVersion = readWorldClock(CAMPAIGN_ID).worldVersion) {
  return queueSimulationJob({
    campaignId: CAMPAIGN_ID,
    jobType,
    baseWorldVersion,
    sourceEntity: { type: "system", id: jobType },
    priority: 5,
    payload: { jobType },
  });
}

function createExecutableProposal(input: {
  proposalType: string;
  jobType?: string;
  baseWorldVersion?: number;
  readSet?: string[];
  dueAtWorldTimeMinutes?: number;
  expiresAtWorldTimeMinutes?: number;
  intendedTools?: Parameters<typeof createSimulationProposal>[0]["intendedTools"];
}) {
  const baseWorldVersion = input.baseWorldVersion ?? readWorldClock(CAMPAIGN_ID).worldVersion;
  const jobId = createJob(input.jobType ?? input.proposalType, baseWorldVersion);
  return {
    jobId,
    proposal: createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: input.proposalType,
      baseWorldVersion,
      sourceEntity: { type: "system", id: input.proposalType },
      jobId,
      summary: `Execute ${input.proposalType}.`,
      readSet: input.readSet ?? [`world_version:${baseWorldVersion}`],
      writeScopes: ["world:event"],
      dueAtWorldTimeMinutes:
        input.dueAtWorldTimeMinutes ?? readWorldClock(CAMPAIGN_ID).worldTimeMinutes,
      expiresAtWorldTimeMinutes: input.expiresAtWorldTimeMinutes,
      priority: 5,
      intendedTools: input.intendedTools ?? [{
        name: "add_chronicle_entry",
        args: { text: `Chronicle for ${input.proposalType}` },
      }],
      provenance: { source: "test", tick: 10 },
    }),
  };
}

describe("simulation proposal executor", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-proposal-executor-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedWorld();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("rejects metadata-only proposal commits without authority or effects", async () => {
    const { proposal, jobId } = createExecutableProposal({
      proposalType: "metadata_only",
      intendedTools: [],
    });

    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "terminal",
      disposition: "rejected_invalid",
      reason: "metadata_only_commit_rejected",
    });

    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
    expect(getDb().select().from(chronicle).all()).toEqual([]);
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, proposal.proposalId)).get())
      .toMatchObject({
        status: "rejected",
        proposalDisposition: "rejected_invalid",
      });
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, jobId)).get())
      .toMatchObject({
        status: "failed",
        canceledReason: "metadata_only_commit_rejected",
      });
  });

  it("commits intended runtime tools and synchronizes proposal and job status", async () => {
    const { proposal, jobId } = createExecutableProposal({
      proposalType: "chronicle_commit",
    });

    const result = await executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    });

    expect(result).toMatchObject({
      status: "committed",
      disposition: "committed",
      committedWorldVersion: 1,
      sourceJobId: jobId,
    });
    expect(result.status === "committed" ? result.toolResults : []).toHaveLength(1);
    expect(result.status === "committed" ? result.authorityTraceIds : []).toHaveLength(1);
    expect(getDb().select().from(chronicle).all()).toEqual([
      expect.objectContaining({ text: "Chronicle for chronicle_commit" }),
    ]);
    expect(getDb().select().from(authorityTraces).all()).toEqual([
      expect.objectContaining({
        operation: "tool:add_chronicle_entry",
        baseWorldVersion: 0,
        resultWorldVersion: 1,
      }),
    ]);
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, proposal.proposalId)).get())
      .toMatchObject({
        status: "committed",
        proposalDisposition: "committed",
        committedWorldVersion: 1,
      });
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, jobId)).get())
      .toMatchObject({ status: "completed", resultWorldVersion: 1 });
  });

  it("rejects failed tool validation without committing world state", async () => {
    const { proposal } = createExecutableProposal({
      proposalType: "invalid_tool",
      intendedTools: [{ name: "add_chronicle_entry", args: {} }],
    });

    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "terminal",
      disposition: "rejected_invalid",
      reason: expect.stringContaining("invalid_tool_args:add_chronicle_entry"),
    });
    expect(getDb().select().from(chronicle).all()).toEqual([]);
    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({ worldVersion: 0 });
  });

  it("rebases stale proposals with unaffected reads before executing tools", async () => {
    const { proposal } = createExecutableProposal({
      proposalType: "rebase_commit",
      readSet: ["npc:npc-safe:state"],
    });
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "test:unrelated-change",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "test" },
      stateDeltaRefs: ["location:market:presence"],
    });

    const result = await executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
      changedReadSetRefs: ["location:market:presence"],
    });

    expect(result).toMatchObject({
      status: "committed",
      disposition: "committed",
      committedWorldVersion: 2,
      rebasedFromWorldVersion: 0,
    });
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, proposal.proposalId)).get())
      .toMatchObject({
        baseWorldVersion: 1,
        committedWorldVersion: 2,
        proposalDisposition: "committed",
      });
  });

  it("marks stale material read-set proposals for actor retry without tool execution", async () => {
    const { proposal, jobId } = createExecutableProposal({
      proposalType: "actor_retry",
      readSet: ["npc:npc-retry:state"],
    });
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "test:actor-change",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "test" },
      stateDeltaRefs: ["npc:npc-retry:state"],
    });

    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
      changedReadSetRefs: ["npc:npc-retry:state"],
    })).resolves.toMatchObject({
      status: "terminal",
      disposition: "needs_actor_retry",
      reason: "material_read_set_changed",
    });

    expect(getDb().select().from(chronicle).all()).toEqual([]);
    expect(getDb().select().from(authorityTraces).all()).toHaveLength(1);
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, jobId)).get())
      .toMatchObject({
        status: "failed",
        canceledReason: "material_read_set_changed",
      });
  });

  it("synchronizes deferred, expired, and superseded terminal dispositions", async () => {
    const deferred = createExecutableProposal({
      proposalType: "deferred_proposal",
      dueAtWorldTimeMinutes: 20,
    });
    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: deferred.proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "deferred",
      disposition: "deferred_not_due",
    });
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, deferred.proposal.proposalId)).get())
      .toMatchObject({ status: "pending", proposalDisposition: "deferred_not_due" });
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, deferred.jobId)).get())
      .toMatchObject({ status: "queued", canceledReason: null });

    const expired = createExecutableProposal({
      proposalType: "expired_proposal",
      dueAtWorldTimeMinutes: 1,
      expiresAtWorldTimeMinutes: 5,
    });
    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: expired.proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "terminal",
      disposition: "expired_stale_version",
    });
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, expired.jobId)).get())
      .toMatchObject({ status: "failed", canceledReason: "proposal_expired_before_commit" });

    const superseded = createExecutableProposal({
      proposalType: "superseded_proposal",
    });
    getDb().update(simulationProposals)
      .set({ supersededByProposalId: "proposal-newer" })
      .where(eq(simulationProposals.id, superseded.proposal.proposalId))
      .run();
    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: superseded.proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "terminal",
      disposition: "superseded_by_new_event",
    });
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, superseded.jobId)).get())
      .toMatchObject({ status: "superseded", canceledReason: "proposal_superseded_by_new_event" });
  });

  it("runs executable due proposals through the due-world watchdog wrapper", async () => {
    const { proposal } = createExecutableProposal({
      proposalType: "watchdog_commit",
    });

    const result = await resolveDueWorldWorkForScopeWithProposalWatchdog({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      phase: "pre_scene_frame",
    });

    expect(result.proposals.selected).toEqual([proposal.proposalId]);
    expect(result.proposals.executed).toEqual([
      expect.objectContaining({ status: "committed", proposalId: proposal.proposalId }),
    ]);
    expect(getDb().select().from(chronicle).all()).toHaveLength(1);
  });
});
