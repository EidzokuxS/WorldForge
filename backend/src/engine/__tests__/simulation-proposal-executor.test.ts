import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const { applySurfaceSignalDecisionMock, executeToolCallMock } = vi.hoisted(() => ({
  applySurfaceSignalDecisionMock: vi.fn(),
  executeToolCallMock: vi.fn(),
}));

vi.mock("../surface-signal.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../surface-signal.js")>();
  applySurfaceSignalDecisionMock.mockImplementation(actual.applySurfaceSignalDecision);
  return {
    ...actual,
    applySurfaceSignalDecision: applySurfaceSignalDecisionMock,
  };
});

vi.mock("../tool-executor.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../tool-executor.js")>();
  executeToolCallMock.mockImplementation(actual.executeToolCall);
  return {
    ...actual,
    executeToolCall: executeToolCallMock,
  };
});

import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  actorProcessStates,
  authorityTraces,
  campaigns,
  chronicle,
  locationEdges,
  locationRecentEvents,
  locations,
  npcs,
  players,
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
import {
  simulationProposalAuthorityTraceToolResultId,
  simulationProposalToolResultId,
} from "../simulation-proposal-execution.js";
import { executeDueSimulationProposal } from "../simulation-proposal-executor.js";
import { resolveDueSimulationProposalsForScope } from "../simulation-proposal-watchdog.js";
import { resolveDueWorldWorkForScopeWithProposalWatchdog } from "../due-world-work.js";
import { executeToolCall } from "../tool-executor.js";
import type { ToolExecutionContext } from "../tool-execution-context.js";
import { attachToolResultAuthority, type ToolResult } from "../tool-result.js";
import { backfillKeyActorProcessesForCampaign } from "../key-actor-process.js";
import type { ActorScheduleDecision } from "../actor-scheduler.js";
import type { SceneFrame } from "../scene-frame.js";

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

function seedActorDecisionWorld() {
  getDb().insert(locations).values([
    {
      id: "loc-a",
      campaignId: CAMPAIGN_ID,
      name: "Station A",
      description: "Station A description",
      kind: "macro",
      parentLocationId: null,
      anchorLocationId: null,
      persistence: "persistent",
      expiresAtTick: null,
      archivedAtTick: null,
      tags: "[]",
      isStarting: true,
      connectedTo: JSON.stringify(["loc-b"]),
    },
    {
      id: "loc-b",
      campaignId: CAMPAIGN_ID,
      name: "Station B",
      description: "Station B description",
      kind: "macro",
      parentLocationId: null,
      anchorLocationId: null,
      persistence: "persistent",
      expiresAtTick: null,
      archivedAtTick: null,
      tags: "[]",
      isStarting: false,
      connectedTo: JSON.stringify(["loc-a"]),
    },
  ]).run();
  getDb().insert(locationEdges).values([
    {
      id: "loc-a-loc-b",
      campaignId: CAMPAIGN_ID,
      fromLocationId: "loc-a",
      toLocationId: "loc-b",
      travelCost: 1,
      discovered: true,
    },
    {
      id: "loc-b-loc-a",
      campaignId: CAMPAIGN_ID,
      fromLocationId: "loc-b",
      toLocationId: "loc-a",
      travelCost: 1,
      discovered: true,
    },
  ]).run();
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
  getDb().insert(npcs).values({
    id: "npc-key",
    campaignId: CAMPAIGN_ID,
    name: "Watcher",
    persona: "A key NPC who watches the platform.",
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
  backfillKeyActorProcessesForCampaign({
    campaignId: CAMPAIGN_ID,
    nextWakeDelayMinutes: 0,
  });
}

function createActorDecisionSceneFrame(): SceneFrame {
  return {
    campaignId: CAMPAIGN_ID,
    tick: 10,
    worldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
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

function createActorDecisionSchedule(): ActorScheduleDecision {
  return {
    actorId: "npc-key",
    actorName: "Watcher",
    route: "proposal_after_done",
    reason: "due actor work must resolve before the narrator packet",
    signals: [{
      type: "due_time",
      reason: "next wake time reached",
      priority: 5,
      requiredBeforeDone: false,
    }],
    writeScopes: ["npc:npc-key:state", "location:loc-a:presence"],
  };
}

function createActorDecisionProposal() {
  const schedule = createActorDecisionSchedule();
  const clock = readWorldClock(CAMPAIGN_ID);
  const jobId = createJob("key_actor_due_decision", clock.worldVersion);
  return {
    jobId,
    proposal: createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "key_actor_due_decision",
      baseWorldVersion: clock.worldVersion,
      sourceEntity: { type: "npc", id: "npc-key" },
      jobId,
      summary: `${schedule.actorName}: ${schedule.reason}`,
      readSet: [
        `world_version:${clock.worldVersion}`,
        `world_time:${clock.worldTimeMinutes}`,
        "npc:npc-key:process",
      ],
      writeScopes: schedule.writeScopes,
      dueAtWorldTimeMinutes: clock.worldTimeMinutes,
      priority: 5,
      intendedTools: [{
        name: "actor_decision",
        reason: "pre_narrator_packet",
      }],
      provenance: { source: "test", tick: 10 },
      data: {
        schedule,
        phase: "pre_narrator_packet",
      },
    }),
  };
}

const testProvider = {
  id: "test-provider",
  name: "Test",
  baseUrl: "http://localhost:1/v1",
  apiKey: "test",
  model: "test-model",
};

function mockNextRuntimeAuthorityResult(stateDeltaRefs: string[]) {
  vi.mocked(executeToolCall).mockImplementationOnce(async (
    campaignId: string,
    toolName: string,
    args: Record<string, unknown>,
    tick: number,
    _outcomeTier?: string,
    context?: ToolExecutionContext,
  ): Promise<ToolResult> => {
    const authority = context?.authority;
    if (!authority) {
      return { success: false, error: "missing_authority_context" };
    }
    const trace = commitAuthorityTrace({
      campaignId,
      operation: `tool:${toolName}`,
      baseWorldVersion: authority.baseWorldVersion,
      sourceEntity: authority.sourceEntity,
      elapsedWorldTimeMinutes: authority.elapsedWorldTimeMinutes ?? 1,
      currentTick: tick,
      toolResultId: authority.toolResultId,
      stateDeltaRefs,
      metadata: {
        source: "test_runtime_authority",
        toolName,
        args,
      },
    });
    return attachToolResultAuthority(
      {
        success: true,
        status: "success",
        kind: "mutation",
        result: {
          entity: args.entityName,
          tags: [args.tag],
        },
      },
      {
        ...trace,
        requireStateDelta: true,
      },
    );
  });
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
  writeScopes?: Parameters<typeof createSimulationProposal>[0]["writeScopes"];
  dueAtWorldTimeMinutes?: number;
  expiresAtWorldTimeMinutes?: number;
  priority?: number;
  intendedTools?: Parameters<typeof createSimulationProposal>[0]["intendedTools"];
  data?: Parameters<typeof createSimulationProposal>[0]["data"];
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
      writeScopes: input.writeScopes ?? ["world:event"],
      dueAtWorldTimeMinutes:
        input.dueAtWorldTimeMinutes ?? readWorldClock(CAMPAIGN_ID).worldTimeMinutes,
      expiresAtWorldTimeMinutes: input.expiresAtWorldTimeMinutes,
      priority: input.priority ?? 5,
      intendedTools: input.intendedTools ?? [{
        name: "add_chronicle_entry",
        args: { text: `Chronicle for ${input.proposalType}` },
      }],
      provenance: { source: "test", tick: 10 },
      data: input.data,
    }),
  };
}

describe("simulation proposal executor", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-proposal-executor-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedWorld();
    applySurfaceSignalDecisionMock.mockClear();
    executeToolCallMock.mockClear();
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
    const [trace] = getDb().select().from(authorityTraces).all();
    expect(result.status === "committed" ? result.authorityTraceIds : [])
      .toEqual([trace?.id]);
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, proposal.proposalId)).get())
      .toMatchObject({
        status: "committed",
        proposalDisposition: "committed",
        committedWorldVersion: 1,
      });
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, jobId)).get())
      .toMatchObject({ status: "completed", resultWorldVersion: 1 });
  });

  it("rejects whole intended-tool batches before any partial commit can execute", async () => {
    const { proposal, jobId } = createExecutableProposal({
      proposalType: "partial_batch_rollback",
      intendedTools: [
        {
          name: "add_chronicle_entry",
          args: { text: "This partial proposal must roll back." },
        },
        {
          name: "add_tag",
          args: { entityName: "Missing Actor", entityType: "npc", tag: "should-not-exist" },
        },
      ],
      writeScopes: ["world:event"],
    });

    const result = await executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    });

    expect(result).toMatchObject({
      status: "terminal",
      disposition: "rejected_invalid",
      reason: "multi_tool_proposal_rejected_pending_atomic_commit",
    });
    expect(readWorldClock(CAMPAIGN_ID).worldVersion).toBe(0);
    expect(getDb().select().from(chronicle).all()).toEqual([]);
    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, proposal.proposalId)).get())
      .toMatchObject({
        status: "rejected",
        proposalDisposition: "rejected_invalid",
        committedWorldVersion: null,
      });
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, jobId)).get())
      .toMatchObject({
        status: "failed",
        resultWorldVersion: null,
      });
  });

  it("returns committed idempotently without rewriting lifecycle on duplicate execution", async () => {
    const { proposal, jobId } = createExecutableProposal({
      proposalType: "duplicate_commit",
    });

    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "committed",
      committedWorldVersion: 1,
    });

    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "committed",
      committedWorldVersion: 1,
      sourceJobId: jobId,
    });
    expect(getDb().select().from(chronicle).all()).toEqual([
      expect.objectContaining({ text: "Chronicle for duplicate_commit" }),
    ]);
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, proposal.proposalId)).get())
      .toMatchObject({
        status: "committed",
        proposalDisposition: "committed",
        committedWorldVersion: 1,
      });
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, jobId)).get())
      .toMatchObject({ status: "completed", resultWorldVersion: 1, canceledReason: null });
  });

  it("claims proposal execution before mutation so concurrent executors cannot reject an already-mutated proposal", async () => {
    const { proposal, jobId } = createExecutableProposal({
      proposalType: "concurrent_claim",
    });

    const results = await Promise.all([
      executeDueSimulationProposal({
        campaignId: CAMPAIGN_ID,
        proposalId: proposal.proposalId,
        tick: 10,
        phase: "watchdog",
      }),
      executeDueSimulationProposal({
        campaignId: CAMPAIGN_ID,
        proposalId: proposal.proposalId,
        tick: 10,
        phase: "watchdog",
      }),
    ]);

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "committed",
          disposition: "committed",
          committedWorldVersion: 1,
        }),
        expect.objectContaining({
          status: "deferred",
          disposition: "pending",
          reason: "proposal_execution_in_progress",
        }),
      ]),
    );
    expect(getDb().select().from(chronicle).all()).toEqual([
      expect.objectContaining({ text: "Chronicle for concurrent_claim" }),
    ]);
    expect(getDb().select().from(authorityTraces).all()).toHaveLength(1);
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, proposal.proposalId)).get())
      .toMatchObject({
        status: "committed",
        proposalDisposition: "committed",
        committedWorldVersion: 1,
      });
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, jobId)).get())
      .toMatchObject({ status: "completed", resultWorldVersion: 1, canceledReason: null });
  });

  it("abandons stale executing proposal claims without replaying tools", async () => {
    const { proposal, jobId } = createExecutableProposal({
      proposalType: "stale_executing_claim",
    });
    const staleClaimedAt = Date.now() - (11 * 60_000);
    getDb()
      .update(simulationProposals)
      .set({
        status: "executing",
        proposalDisposition: "pending",
        dispositionReason: "execution_claimed",
        rejectionReason: null,
        lifecycleMetadata: JSON.stringify({
          execution: {
            token: "stale-execution-token",
            phase: "watchdog",
            claimedAt: staleClaimedAt,
            previousStatus: "pending",
            previousDisposition: "pending",
          },
        }),
        updatedAt: staleClaimedAt,
      })
      .where(eq(simulationProposals.id, proposal.proposalId))
      .run();

    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "terminal",
      disposition: "execution_abandoned",
      reason: "stale_executing_claim",
      sourceJobId: jobId,
    });

    expect(getDb().select().from(chronicle).all()).toEqual([]);
    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
    const row = getDb()
      .select()
      .from(simulationProposals)
      .where(eq(simulationProposals.id, proposal.proposalId))
      .get();
    expect(row).toMatchObject({
      status: "rejected",
      proposalDisposition: "execution_abandoned",
      dispositionReason: "stale_executing_claim",
      rejectionReason: "execution_abandoned",
      committedWorldVersion: null,
    });
    expect(JSON.parse(row?.lifecycleMetadata ?? "{}")).toMatchObject({
      execution: { token: "stale-execution-token" },
      abandonedExecution: {
        reason: "stale_executing_claim",
        staleAfterMs: 600_000,
      },
    });
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, jobId)).get())
      .toMatchObject({
        status: "failed",
        canceledReason: "stale_executing_claim",
        resultWorldVersion: null,
      });
  });

  it("recovers stale executing proposals that already wrote their authority trace", async () => {
    const { proposal, jobId } = createExecutableProposal({
      proposalType: "stale_executed_claim",
    });
    const staleClaimedAt = Date.now() - (11 * 60_000);
    const executionToken = "stale-executed-token";
    getDb()
      .update(simulationProposals)
      .set({
        status: "executing",
        proposalDisposition: "pending",
        dispositionReason: "execution_claimed",
        rejectionReason: null,
        lifecycleMetadata: JSON.stringify({
          execution: {
            token: executionToken,
            phase: "watchdog",
            claimedAt: staleClaimedAt,
            previousStatus: "pending",
            previousDisposition: "pending",
          },
        }),
        updatedAt: staleClaimedAt,
      })
      .where(eq(simulationProposals.id, proposal.proposalId))
      .run();
    getDb().insert(chronicle).values({
      id: "chronicle-stale-executed",
      campaignId: CAMPAIGN_ID,
      tick: 10,
      text: "Chronicle for stale_executed_claim",
      createdAt: staleClaimedAt,
    }).run();
    const trace = commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "tool:add_chronicle_entry",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "stale_executed_claim" },
      currentTick: 10,
      toolResultId: simulationProposalToolResultId({
        proposalId: proposal.proposalId,
        executionToken,
        toolName: "add_chronicle_entry",
      }),
      stateDeltaRefs: ["chronicle:chronicle-stale-executed"],
      metadata: { proposalId: proposal.proposalId, executionToken },
    });
    const traceRow = getDb()
      .select()
      .from(authorityTraces)
      .where(eq(authorityTraces.toolResultId, trace.toolResultId))
      .get();

    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "committed",
      disposition: "committed",
      committedWorldVersion: 1,
      authorityTraceIds: [traceRow?.id],
      sourceJobId: jobId,
    });

    expect(getDb().select().from(chronicle).all()).toEqual([
      expect.objectContaining({ text: "Chronicle for stale_executed_claim" }),
    ]);
    expect(getDb().select().from(authorityTraces).all()).toHaveLength(1);
    const row = getDb()
      .select()
      .from(simulationProposals)
      .where(eq(simulationProposals.id, proposal.proposalId))
      .get();
    expect(row).toMatchObject({
      status: "committed",
      proposalDisposition: "committed",
      dispositionReason: "stale_execution_recovered_from_authority_trace",
      committedWorldVersion: 1,
    });
    expect(JSON.parse(row?.lifecycleMetadata ?? "{}")).toMatchObject({
      recoveredExecution: {
        reason: "stale_execution_authority_trace_found",
        toolResultId: trace.toolResultId,
      },
    });
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, jobId)).get())
      .toMatchObject({ status: "completed", resultWorldVersion: 1, canceledReason: null });
  });

  it("watchdog recovers stale authority-trace-only proposals instead of skipping them", async () => {
    const baseWorldVersion = readWorldClock(CAMPAIGN_ID).worldVersion;
    const jobId = createJob("trace_only_stale", baseWorldVersion);
    const proposal = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "trace_only_stale",
      baseWorldVersion,
      sourceEntity: { type: "system", id: "trace_only_stale" },
      jobId,
      summary: "Trace-only proposal already wrote authority.",
      readSet: [`world_version:${baseWorldVersion}`],
      writeScopes: ["world:background"],
      priority: 5,
      intendedTools: [],
      provenance: { source: "test", tick: 10 },
    });
    const staleClaimedAt = Date.now() - (11 * 60_000);
    const executionToken = "trace-only-executed-token";
    getDb()
      .update(simulationProposals)
      .set({
        status: "executing",
        proposalDisposition: "pending",
        dispositionReason: "authority_trace_only_execution_claimed",
        rejectionReason: null,
        lifecycleMetadata: JSON.stringify({
          execution: {
            token: executionToken,
            kind: "authority_trace_only",
            claimedAt: staleClaimedAt,
            previousStatus: "pending",
            previousDisposition: "pending",
          },
        }),
        updatedAt: staleClaimedAt,
      })
      .where(eq(simulationProposals.id, proposal.proposalId))
      .run();
    const trace = commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "proposal:trace_only_stale",
      baseWorldVersion,
      sourceEntity: { type: "system", id: "trace_only_stale" },
      toolResultId: simulationProposalAuthorityTraceToolResultId({
        proposalId: proposal.proposalId,
        executionToken,
      }),
      stateDeltaRefs: ["world:background"],
      metadata: { proposalId: proposal.proposalId, executionToken },
    });

    const result = await resolveDueWorldWorkForScopeWithProposalWatchdog({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      phase: "pre_scene_frame",
    });

    expect(result.proposals.selected).toEqual([proposal.proposalId]);
    expect(result.proposals.skipped).toEqual([]);
    expect(result.proposals.executed).toEqual([
      expect.objectContaining({
        status: "committed",
        proposalId: proposal.proposalId,
        committedWorldVersion: trace.resultWorldVersion,
      }),
    ]);
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, jobId)).get())
      .toMatchObject({ status: "completed", resultWorldVersion: trace.resultWorldVersion });
  });

  it("rejects log_event proposals before execution because their durable path is non-atomic", async () => {
    const { proposal } = createExecutableProposal({
      proposalType: "log_event_is_not_proposal_atomic",
      intendedTools: [{
        name: "log_event",
        args: {
          text: "The room briefly smells of rain.",
          importance: 1,
          participants: [],
          durability: "scene_local",
        },
      }],
    });

    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "terminal",
      disposition: "rejected_invalid",
      reason: "unsupported_intended_tool:log_event",
    });
    expect(getDb().select().from(chronicle).all()).toEqual([]);
    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({ worldVersion: 0 });
  });

  it("fences stale executors before a late proposal tool can commit authority", async () => {
    const { proposal } = createExecutableProposal({
      proposalType: "late_stale_executor",
    });
    const executionToken = "late-stale-token";
    const claimedLifecycleMetadata = JSON.stringify({
      execution: {
        token: executionToken,
        phase: "watchdog",
        claimedAt: Date.now(),
        previousStatus: "pending",
        previousDisposition: "pending",
      },
    });
    getDb()
      .update(simulationProposals)
      .set({
        status: "rejected",
        proposalDisposition: "execution_abandoned",
        dispositionReason: "stale_executing_claim",
        rejectionReason: "execution_abandoned",
        lifecycleMetadata: JSON.stringify({
          execution: { token: executionToken },
          abandonedExecution: { reason: "stale_executing_claim" },
        }),
      })
      .where(eq(simulationProposals.id, proposal.proposalId))
      .run();
    const toolResultId = simulationProposalToolResultId({
      proposalId: proposal.proposalId,
      executionToken,
      toolName: "add_chronicle_entry",
    });
    const context: ToolExecutionContext = {
      scope: "background",
      subjectActorId: "late_stale_executor",
      subjectActorRefs: new Set(),
      authority: {
        baseWorldVersion: 0,
        sourceEntity: { type: "system", id: "late_stale_executor" },
        elapsedWorldTimeMinutes: 1,
        toolResultId,
        allowedWriteScopes: ["world:event"],
        metadata: {
          proposalId: proposal.proposalId,
          executionToken,
          phase: "watchdog",
          toolName: "add_chronicle_entry",
          toolResultId,
          claimLifecycleMetadata: claimedLifecycleMetadata,
        },
      },
      currentLocationId: null,
      currentSceneScopeId: null,
      legalLocationRefs: new Set(),
      legalActorRefs: new Set(),
      legalItemRefs: new Set(),
      legalFactionRefs: new Set(),
      currentLocationRefs: new Set(),
      currentSceneRefs: new Set(),
      legalMovementRefs: new Set(),
    };

    await expect(executeToolCall(
      CAMPAIGN_ID,
      "add_chronicle_entry",
      { text: "This late stale executor must not commit." },
      10,
      undefined,
      context,
    )).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("Proposal execution fence failed"),
    });

    expect(getDb().select().from(chronicle).all()).toEqual([]);
    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({ worldVersion: 0 });
  });

  it("commits proposal effects and records the surface signal failure after authority commit", async () => {
    applySurfaceSignalDecisionMock.mockImplementationOnce(() => {
      throw new Error("surface_signal_thread_advance_failed:test");
    });
    const { proposal, jobId } = createExecutableProposal({
      proposalType: "surface_signal_post_commit_failure",
      data: {
        meaningfulOffscreenCommit: true,
        surfaceSignal: {
          policy: "rumor",
          summary: "A harmless public rumor reaches the corridor.",
          sourceEventIds: [],
          authorityTraceIds: [],
          hiddenCauseTerms: ["hidden sabotage"],
        },
      },
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
      surfaceSignalFailure: "surface_signal_thread_advance_failed:test",
      sourceJobId: jobId,
    });
    expect(getDb().select().from(chronicle).all()).toEqual([
      expect.objectContaining({ text: "Chronicle for surface_signal_post_commit_failure" }),
    ]);
    expect(getDb().select().from(authorityTraces).all()).toHaveLength(1);
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({ worldVersion: 1 });
    const row = getDb()
      .select()
      .from(simulationProposals)
      .where(eq(simulationProposals.id, proposal.proposalId))
      .get();
    expect(row).toMatchObject({
      status: "committed",
      proposalDisposition: "committed",
      dispositionReason: "intended_tools_executed",
      committedWorldVersion: 1,
    });
    expect(JSON.parse(row?.lifecycleMetadata ?? "{}")).toMatchObject({
      surfaceSignalFailure: "surface_signal_thread_advance_failed:test",
    });
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, jobId)).get())
      .toMatchObject({
        status: "completed",
        resultWorldVersion: 1,
        canceledReason: null,
      });
  });

  it("recovers accepted proposal tool effects when final disposition ownership is lost", async () => {
    seedActorDecisionWorld();
    const { proposal, jobId } = createExecutableProposal({
      proposalType: "claim_lost_after_tool_execution",
      writeScopes: ["location:loc-a:*"],
      intendedTools: [{
        name: "record_location_event",
        args: {
          locationRef: "loc-a",
          eventType: "ambient",
          summary: "This event must roll back when final disposition ownership is lost.",
          visibility: "player_perceivable",
          surfaceRoute: "test_visible_proposal_event",
        },
      }],
      data: {
        meaningfulOffscreenCommit: true,
        surfaceSignal: {
          policy: "rumor",
          summary: "A public rumor reaches the station platform.",
          locationRef: "loc-a",
          sourceEventIds: [],
          authorityTraceIds: [],
          hiddenCauseTerms: ["sealed machinery"],
        },
      },
    });
    applySurfaceSignalDecisionMock.mockImplementationOnce((input) => {
      const row = getDb()
        .select()
        .from(simulationProposals)
        .where(eq(simulationProposals.id, proposal.proposalId))
        .get();
      getDb()
        .update(simulationProposals)
        .set({
          status: "superseded",
          proposalDisposition: "superseded_by_new_event",
          dispositionReason: "simulated_claim_loss_after_tool_execution",
          rejectionReason: "superseded_by_new_event",
          lifecycleMetadata: JSON.stringify({
            ...JSON.parse(row?.lifecycleMetadata ?? "{}"),
            simulatedClaimLossAfterToolExecution: true,
          }),
          updatedAt: Date.now(),
        })
        .where(eq(simulationProposals.id, proposal.proposalId))
        .run();
      return {
        policy: input.decision.policy,
        summary: input.decision.summary,
        threadId: null,
        eventId: null,
        locationEventCreated: false,
      };
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
      sourceJobId: jobId,
    });
    expect(getDb().select().from(chronicle).all()).toEqual([]);
    expect(getDb().select().from(locationRecentEvents).all()).toHaveLength(1);
    expect(getDb().select().from(authorityTraces).all()).toHaveLength(1);
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({ worldVersion: 1 });
    const row = getDb()
      .select()
      .from(simulationProposals)
      .where(eq(simulationProposals.id, proposal.proposalId))
      .get();
    expect(row).toMatchObject({
      status: "committed",
      proposalDisposition: "committed",
      dispositionReason: "authority_committed_after_disposition_claim_lost",
      committedWorldVersion: 1,
    });
    expect(JSON.parse(row?.lifecycleMetadata ?? "{}")).toMatchObject({
      dispositionClaimLost: true,
      recoveredExecution: {
        reason: "authority_trace_found",
      },
    });
    expect(JSON.parse(row?.lifecycleMetadata ?? "{}"))
      .toHaveProperty("simulatedClaimLossAfterToolExecution");
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, jobId)).get())
      .toMatchObject({
        status: "completed",
        resultWorldVersion: 1,
        canceledReason: null,
      });
  });

  it("rejects multi-tool proposals before any partial commit can execute", async () => {
    const { proposal } = createExecutableProposal({
      proposalType: "multi_tool_non_atomic",
      intendedTools: [
        { name: "add_chronicle_entry", args: { text: "First proposed effect." } },
        { name: "add_chronicle_entry", args: { text: "Second proposed effect." } },
      ],
    });

    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "terminal",
      disposition: "rejected_invalid",
      reason: "multi_tool_proposal_rejected_pending_atomic_commit",
    });
    expect(getDb().select().from(chronicle).all()).toEqual([]);
    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({ worldVersion: 0 });
  });

  it("rejects proposal intent markers before execution", async () => {
    const { proposal } = createExecutableProposal({
      proposalType: "intent_marker_not_commit",
      intendedTools: [{
        name: "start_search",
        args: {
          actorRef: "system",
          query: "rumored night market",
          evidenceRefs: [],
        },
      }],
    });

    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "terminal",
      disposition: "rejected_invalid",
      reason: "unsupported_intended_tool:start_search",
    });
    expect(getDb().select().from(chronicle).all()).toEqual([]);
    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({ worldVersion: 0 });
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

  it("rejects proposal-only contested bounds before executing them as committed world effects", async () => {
    const { proposal } = createExecutableProposal({
      proposalType: "contest_bounds_are_not_commit",
      intendedTools: [{
        name: "request_contested_outcome",
        args: {
          actorName: "Watcher",
          targetName: "Player",
          mode: "restrain",
          intent: "Resolve a restraint from a background proposal.",
          stakes: "Whether the player is restrained.",
          evidenceRefs: [],
        },
      }],
    });

    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "terminal",
      disposition: "rejected_invalid",
      reason: "unsupported_intended_tool:request_contested_outcome",
    });
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

  it("commits due actor decision proposals with an atomic process authority receipt", async () => {
    seedActorDecisionWorld();
    const { proposal } = createActorDecisionProposal();

    const result = await executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "pre_narrator_packet",
      actorDecisionContext: {
        provider: testProvider,
        sceneFrame: createActorDecisionSceneFrame(),
        decideActor: ({ actorFrame }) => ({
          actorId: actorFrame.observer.actorId,
          citedFactIds: ["self:npc-key"],
          decisionSummary: "Watcher quietly rechecks the platform locks.",
          intent: "keep watch without changing visible scene state",
          requestedTools: [],
          noActionReason: "No visible intervention is needed yet.",
          planUpdates: [{
            summary: "Continue guarding the station platform.",
            status: "continued",
            writeScopes: ["npc:npc-key:state"],
          }],
          nextDecisionTrigger: {
            reason: "wait for a stronger player-facing change",
            delayWorldTimeMinutes: 12,
          },
        }),
      },
    });

    expect(result).toMatchObject({
      status: "committed",
      disposition: "committed",
      proposalId: proposal.proposalId,
      committedWorldVersion: 1,
    });
    const committed = result.status === "committed" ? result : null;
    expect(committed?.toolResults).toEqual([
      expect.objectContaining({
        toolName: "actor_decision",
        result: expect.objectContaining({
          success: true,
          authority: expect.objectContaining({
            toolResultId: expect.stringContaining(":tool:actor_decision"),
            resultWorldVersion: 1,
            stateDeltaRefs: ["npc:npc-key:process"],
          }),
        }),
      }),
    ]);
    const processRow = getDb()
      .select()
      .from(actorProcessStates)
      .where(eq(actorProcessStates.actorId, "npc-key"))
      .get();
    expect(processRow).toMatchObject({
      status: "waiting",
      lastWorldVersion: 1,
      lastWakeWorldTimeMinutes: 10,
      nextWakeWorldTimeMinutes: 22,
    });
    const processState = JSON.parse(processRow?.processState ?? "{}") as Record<string, unknown>;
    expect(processState).toMatchObject({
      nextDecisionReason: "wait for a stronger player-facing change",
      agencyDebt: 0,
    });
    const trace = getDb()
      .select()
      .from(authorityTraces)
      .where(eq(authorityTraces.operation, "proposal:actor_decision"))
      .get();
    expect(trace).toMatchObject({
      baseWorldVersion: 0,
      resultWorldVersion: 1,
      toolResultId: committed?.toolResults[0]?.result.authority?.toolResultId,
    });
  });

  it("executes actor proposals queued during the same pre-narrator due-work pass", async () => {
    seedActorDecisionWorld();

    const result = await resolveDueWorldWorkForScopeWithProposalWatchdog({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      phase: "pre_narrator_packet",
      actorDecisionContext: {
        provider: testProvider,
        sceneFrame: createActorDecisionSceneFrame(),
        decideActor: ({ actorFrame }) => ({
          actorId: actorFrame.observer.actorId,
          citedFactIds: ["self:npc-key"],
          decisionSummary: "Watcher keeps the station watch plan alive.",
          intent: "maintain the guard plan without visible side effects",
          requestedTools: [],
          noActionReason: "No visible response is needed.",
          nextDecisionTrigger: {
            reason: "wait for a new disturbance",
            delayWorldTimeMinutes: 10,
          },
        }),
      },
    });

    expect(result.deferred).toHaveLength(1);
    expect(result.proposals.selected).toHaveLength(1);
    expect(result.proposals.executed).toEqual([
      expect.objectContaining({
        status: "committed",
        proposalType: "key_actor_due_decision",
      }),
    ]);
    expect(getDb().select().from(simulationProposals).all()).toHaveLength(1);
    expect(getDb().select().from(actorProcessStates).where(eq(actorProcessStates.actorId, "npc-key")).get())
      .toMatchObject({ status: "waiting", lastWorldVersion: 1 });
  });

  it("does not execute actor decision proposals before a scene frame is available", async () => {
    seedActorDecisionWorld();
    const { proposal } = createActorDecisionProposal();

    const result = await resolveDueWorldWorkForScopeWithProposalWatchdog({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      phase: "pre_scene_frame",
    });

    expect(result.proposals.selected).toEqual([]);
    expect(result.proposals.executed).toEqual([]);
    expect(result.proposals.skipped).toEqual(expect.arrayContaining([
      {
        proposalId: proposal.proposalId,
        reason: "actor_decision_requires_scene_frame",
      },
    ]));
    expect(result.proposals.skipped.every((entry) =>
      entry.reason === "actor_decision_requires_scene_frame",
    )).toBe(true);
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, proposal.proposalId)).get())
      .toMatchObject({ status: "pending" });
    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
  });

  it("cleans unsupported legacy proposals without spending the executable watchdog limit", async () => {
    const unsupportedReflection = createExecutableProposal({
      proposalType: "unsupported_reflection",
      priority: 10,
      writeScopes: ["npc:memory"],
      intendedTools: [{ name: "npc_reflection_update", reason: "legacy_scan" }],
    });
    const unsupportedFaction = createExecutableProposal({
      proposalType: "unsupported_faction",
      priority: 9,
      writeScopes: ["faction:command_network", "world:event"],
      intendedTools: [
        { name: "faction_command_operation", reason: "legacy_interval" },
        { name: "record_world_event", reason: "legacy_surface" },
      ],
    });
    const actorDecision = createExecutableProposal({
      proposalType: "actor_decision_without_scene_frame",
      priority: 8,
      writeScopes: ["npc:npc-key"],
      intendedTools: [{ name: "actor_decision", reason: "needs_scene_frame" }],
    });
    const executable = createExecutableProposal({
      proposalType: "watchdog_after_unsupported",
      priority: 1,
    });

    const result = await resolveDueSimulationProposalsForScope({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      phase: "pre_scene_frame",
      playerLocationId: "visible-player-location",
      playerSceneScopeId: "visible-player-scene",
      limit: 1,
    });

    expect(result.selected).toEqual([
      unsupportedReflection.proposal.proposalId,
      unsupportedFaction.proposal.proposalId,
      executable.proposal.proposalId,
    ]);
    expect(result.skipped).toEqual([
      {
        proposalId: actorDecision.proposal.proposalId,
        reason: "actor_decision_requires_scene_frame",
      },
    ]);
    expect(result.executed).toEqual([
      expect.objectContaining({
        status: "terminal",
        proposalId: unsupportedReflection.proposal.proposalId,
        disposition: "rejected_invalid",
      }),
      expect.objectContaining({
        status: "terminal",
        proposalId: unsupportedFaction.proposal.proposalId,
        disposition: "rejected_invalid",
      }),
      expect.objectContaining({
        status: "committed",
        proposalId: executable.proposal.proposalId,
      }),
    ]);
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, unsupportedReflection.proposal.proposalId)).get())
      .toMatchObject({ status: "rejected", proposalDisposition: "rejected_invalid" });
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, unsupportedFaction.proposal.proposalId)).get())
      .toMatchObject({ status: "rejected", proposalDisposition: "rejected_invalid" });
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, actorDecision.proposal.proposalId)).get())
      .toMatchObject({ status: "pending" });
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, executable.proposal.proposalId)).get())
      .toMatchObject({ status: "committed", proposalDisposition: "committed" });
  });

  it("does not queue a duplicate actor proposal while one is already executing", async () => {
    seedActorDecisionWorld();
    const { proposal } = createActorDecisionProposal();
    getDb()
      .update(simulationProposals)
      .set({
        status: "executing",
        proposalDisposition: "pending",
        lifecycleMetadata: JSON.stringify({
          execution: {
            token: "fresh-execution-token",
            phase: "pre_narrator_packet",
            claimedAt: Date.now(),
            previousStatus: "pending",
            previousDisposition: "pending",
          },
        }),
      })
      .where(eq(simulationProposals.id, proposal.proposalId))
      .run();

    const result = await resolveDueWorldWorkForScopeWithProposalWatchdog({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      phase: "pre_narrator_packet",
      actorDecisionContext: {
        provider: testProvider,
        sceneFrame: createActorDecisionSceneFrame(),
      },
    });

    expect(result.deferred).toHaveLength(1);
    expect(result.proposals.selected).toEqual([proposal.proposalId]);
    expect(result.proposals.executed).toEqual([
      expect.objectContaining({
        status: "deferred",
        reason: "proposal_execution_in_progress",
      }),
    ]);
    expect(getDb().select().from(simulationProposals).all()).toHaveLength(1);
  });

  it("rejects actor decision proposals that try to smuggle runtime side effects", async () => {
    seedActorDecisionWorld();
    const { proposal } = createActorDecisionProposal();

    const result = await executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "pre_narrator_packet",
      actorDecisionContext: {
        provider: testProvider,
        sceneFrame: createActorDecisionSceneFrame(),
        decideActor: ({ actorFrame }) => ({
          actorId: actorFrame.observer.actorId,
          citedFactIds: ["self:npc-key"],
          decisionSummary: "Watcher tries to write a visible event.",
          intent: "smuggle a runtime event from proposal execution",
          requestedTools: [{
            toolName: "log_event",
            purpose: "should be illegal inside actor_decision proposals",
            input: {
              text: "Watcher writes an event from the proposal executor.",
              importance: 2,
              participants: ["Watcher"],
              durability: "scene_local",
            },
          }],
        }),
      },
    });

    expect(result).toMatchObject({
      status: "terminal",
      disposition: "rejected_invalid",
    });
    expect(result.status === "terminal" ? result.reason : "").toContain("tool is not legal");
    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
    expect(getDb().select().from(chronicle).all()).toEqual([]);
    expect(getDb().select().from(actorProcessStates).where(eq(actorProcessStates.actorId, "npc-key")).get())
      .toMatchObject({ lastWorldVersion: 0 });
  });

  it("passes live watchdog changed refs so stale actor reads retry instead of blindly rebasing", async () => {
    const { proposal } = createExecutableProposal({
      proposalType: "watchdog_stale_actor_read",
      readSet: ["npc:npc-retry:state"],
    });
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "test:actor-change",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "test" },
      stateDeltaRefs: ["npc:npc-retry:state"],
    });

    const result = await resolveDueWorldWorkForScopeWithProposalWatchdog({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      phase: "pre_scene_frame",
    });

    expect(result.proposals.selected).toEqual([proposal.proposalId]);
    expect(result.proposals.executed).toEqual([
      expect.objectContaining({
        status: "terminal",
        disposition: "needs_actor_retry",
        reason: "material_read_set_changed",
      }),
    ]);
    expect(getDb().select().from(chronicle).all()).toEqual([]);
  });

  it("fails closed when direct stale proposal execution has no changed-read proof", async () => {
    const { proposal } = createExecutableProposal({
      proposalType: "direct_stale_without_proof",
      readSet: ["npc:npc-retry:state"],
    });
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "test:unknown-change",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "test" },
      stateDeltaRefs: ["location:unknown:presence"],
    });

    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "terminal",
      disposition: "needs_actor_retry",
      reason: "stale_base_world_version_unverified_read_set",
    });
    expect(getDb().select().from(chronicle).all()).toEqual([]);
  });

  it("rejects actor decision proposals when the supplied SceneFrame is stale after rebase", async () => {
    seedActorDecisionWorld();
    const staleSceneFrame = createActorDecisionSceneFrame();
    const { proposal } = createActorDecisionProposal();
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "test:unrelated-location-change",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "test" },
      stateDeltaRefs: ["location:unrelated:presence"],
    });

    const result = await executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "pre_narrator_packet",
      changedReadSetRefs: ["location:unrelated:presence"],
      actorDecisionContext: {
        provider: testProvider,
        sceneFrame: staleSceneFrame,
        decideActor: ({ actorFrame }) => ({
          actorId: actorFrame.observer.actorId,
          citedFactIds: ["self:npc-key"],
          intent: "maintain a stale plan",
          requestedTools: [],
          noActionReason: "No visible response is needed.",
        }),
      },
    });

    expect(result).toMatchObject({
      status: "terminal",
      disposition: "rejected_invalid",
    });
    expect(result.status === "terminal" ? result.reason : "").toContain("actor_decision_stale_scene_frame");
    expect(getDb().select().from(actorProcessStates).where(eq(actorProcessStates.actorId, "npc-key")).get())
      .toMatchObject({ lastWorldVersion: 0 });
  });

  it("rejects same-pass proposal write-scope conflicts before the second mutation executes", async () => {
    const first = createExecutableProposal({
      proposalType: "same_scope_first",
      writeScopes: ["world:event"],
      priority: 9,
    });
    const second = createExecutableProposal({
      proposalType: "same_scope_second",
      writeScopes: ["world:event"],
      priority: 1,
    });

    const result = await resolveDueWorldWorkForScopeWithProposalWatchdog({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      phase: "pre_scene_frame",
    });

    expect(result.proposals.selected).toEqual([first.proposal.proposalId, second.proposal.proposalId]);
    expect(result.proposals.executed).toEqual([
      expect.objectContaining({
        status: "committed",
        proposalId: first.proposal.proposalId,
      }),
      expect.objectContaining({
        status: "terminal",
        proposalId: second.proposal.proposalId,
        disposition: "rejected_invalid",
        reason: "conflicting_write_scope",
      }),
    ]);
    expect(getDb().select().from(chronicle).all()).toEqual([
      expect.objectContaining({ text: "Chronicle for same_scope_first" }),
    ]);
  });

  it("rejects runtime proposal authority whose state delta refs exceed declared write scopes", async () => {
    seedActorDecisionWorld();
    const { proposal } = createExecutableProposal({
      proposalType: "runtime_scope_mismatch",
      writeScopes: ["npc:npc-a:tags"],
      intendedTools: [{
        name: "add_tag",
        args: {
          entityName: "Watcher",
          entityType: "npc",
          tag: "marked",
        },
      }],
    });

    const result = await executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "pre_scene_frame",
    });

    expect(result).toMatchObject({
      status: "terminal",
      disposition: "rejected_invalid",
      reason: expect.stringContaining("authority_write_scope_mismatch:npc:Watcher"),
    });
    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
    expect(readWorldClock(CAMPAIGN_ID).worldVersion).toBe(0);
    expect(getDb().select().from(npcs).where(eq(npcs.id, "npc-key")).get())
      .toMatchObject({ tags: "[]" });
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, proposal.proposalId)).get())
      .toMatchObject({
        status: "rejected",
        proposalDisposition: "rejected_invalid",
        committedWorldVersion: null,
      });
  });

  it("commits runtime proposal authority when state delta refs are covered by write scopes", async () => {
    const { proposal } = createExecutableProposal({
      proposalType: "runtime_scope_covered",
      writeScopes: ["npc:npc-a:tags"],
      intendedTools: [{
        name: "add_tag",
        args: {
          entityName: "npc-a",
          entityType: "npc",
          tag: "marked",
        },
      }],
    });
    mockNextRuntimeAuthorityResult(["npc:npc-a:tags"]);

    const result = await executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "pre_scene_frame",
    });

    expect(result).toMatchObject({
      status: "committed",
      disposition: "committed",
      committedWorldVersion: 1,
    });
    expect(getDb().select().from(authorityTraces).all()).toEqual([
      expect.objectContaining({
        operation: "tool:add_tag",
        stateDeltaRefs: JSON.stringify(["npc:npc-a:tags"]),
      }),
    ]);
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, proposal.proposalId)).get())
      .toMatchObject({
        status: "committed",
        proposalDisposition: "committed",
        committedWorldVersion: 1,
      });
  });

  it("rejects proposal tools whose actual authority writes exceed declared scopes", async () => {
    seedActorDecisionWorld();
    const { proposal } = createExecutableProposal({
      proposalType: "declared_scope_mismatch",
      writeScopes: ["npc:npc-key:state"],
      intendedTools: [{
        name: "record_location_event",
        args: {
          locationRef: "loc-a",
          eventType: "ambient",
          summary: "This location event is outside the proposal write scope.",
          visibility: "player_perceivable",
          surfaceRoute: "test_visible_proposal_event",
        },
      }],
    });

    const result = await executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "pre_scene_frame",
    });

    expect(result).toMatchObject({
      status: "terminal",
      disposition: "rejected_invalid",
    });
    expect(result.status === "terminal" ? result.reason : "").toContain(
      "proposal_write_scope_mismatch:location:loc-a:recent_event",
    );
    expect(getDb().select().from(locationRecentEvents).all()).toEqual([]);
    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
  });

  it("carries write-scope fences across before-watchdog and after-watchdog due work", async () => {
    seedActorDecisionWorld();
    const first = createExecutableProposal({
      proposalType: "before_watchdog_location_scope",
      writeScopes: ["location:loc-a:*"],
      priority: 9,
      intendedTools: [{
        name: "record_location_event",
        args: {
          locationRef: "loc-a",
          eventType: "ambient",
          summary: "A location update claims the same visible scope before actor work.",
          visibility: "player_perceivable",
          surfaceRoute: "test_visible_proposal_event",
        },
      }],
    });

    const result = await resolveDueWorldWorkForScopeWithProposalWatchdog({
      campaignId: CAMPAIGN_ID,
      tick: 10,
      phase: "pre_narrator_packet",
      actorDecisionContext: {
        provider: testProvider,
        sceneFrame: createActorDecisionSceneFrame(),
        decideActor: ({ actorFrame }) => ({
          actorId: actorFrame.observer.actorId,
          citedFactIds: ["self:npc-key"],
          intent: "try to update the same actor process",
          requestedTools: [],
          noActionReason: "No visible response is needed.",
        }),
      },
    });

    expect(result.proposals.selected).toContain(first.proposal.proposalId);
    expect(result.deferred).toEqual([]);
    expect(result.skipped).toEqual(expect.arrayContaining([
      expect.objectContaining({ actorId: "npc-key" }),
    ]));
    expect(result.proposals.executed.some((entry) =>
      entry.proposalType === "key_actor_due_decision"
    )).toBe(false);
    expect(getDb().select().from(locationRecentEvents).all()).toEqual([
      expect.objectContaining({
        locationId: "loc-a",
        summary: "A location update claims the same visible scope before actor work.",
      }),
    ]);
    expect(getDb().select().from(actorProcessStates).where(eq(actorProcessStates.actorId, "npc-key")).get())
      .toMatchObject({ lastWorldVersion: 0 });
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
