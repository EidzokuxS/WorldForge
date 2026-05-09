import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  actorKnowledgeRecords,
  actorProcessStates,
  campaigns,
  factionCommandNodes,
  factionOperations,
  factionReports,
  factions,
  simulationJobs,
  simulationProposals,
  worldThreads,
} from "../../db/schema.js";
import {
  buildContextBudgetTrace,
  ContextBudgetViolationError,
} from "../context-budget-trace.js";
import {
  commitAuthorityTrace,
  ensureWorldClock,
  invalidateAuthorityAfterRestore,
  queueSimulationJob,
  readWorldClock,
  upsertActorProcessState,
} from "../living-world-authority.js";
import { recordActorKnowledge } from "../knowledge-model.js";
import {
  commitSimulationProposal,
  createSimulationProposal,
} from "../simulation-proposal.js";

const CAMPAIGN_ID = "phase-88-integration-campaign";

let tempDir = "";

function seedCampaign(): void {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Phase 88 Integration",
    premise: "A living-world verification campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
  getDb().insert(factions).values({
    id: "faction-1",
    campaignId: CAMPAIGN_ID,
    name: "Signal Wardens",
    tags: "[]",
    goals: "[]",
    assets: "[]",
  }).run();
  getDb().insert(factionCommandNodes).values({
    id: "command-1",
    campaignId: CAMPAIGN_ID,
    factionId: "faction-1",
    label: "Watch Desk",
    status: "active",
    standingOrders: "[]",
    metadata: "{}",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
}

function insertFutureFactionAndThreadArtifacts(): void {
  const timestamp = Date.now();
  getDb().insert(factionReports).values([
    {
      id: "report-safe",
      campaignId: CAMPAIGN_ID,
      factionId: "faction-1",
      commandNodeId: "command-1",
      route: "report_message",
      status: "available",
      summary: "Boundary-safe report.",
      sourceEventIds: "[]",
      sourceKnowledgeIds: "[]",
      hiddenCauseTerms: "[]",
      baseWorldVersion: 1,
      createdWorldTimeMinutes: 20,
      deliverAtWorldTimeMinutes: 20,
      deliveredWorldTimeMinutes: 20,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "report-future",
      campaignId: CAMPAIGN_ID,
      factionId: "faction-1",
      commandNodeId: "command-1",
      route: "report_message",
      status: "in_transit",
      summary: "Future report.",
      sourceEventIds: "[]",
      sourceKnowledgeIds: "[]",
      hiddenCauseTerms: "[]",
      baseWorldVersion: 2,
      createdWorldTimeMinutes: 30,
      deliverAtWorldTimeMinutes: 40,
      deliveredWorldTimeMinutes: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]).run();

  getDb().insert(factionOperations).values([
    {
      id: "operation-safe",
      campaignId: CAMPAIGN_ID,
      factionId: "faction-1",
      commandNodeId: "command-1",
      status: "proposed",
      operationKind: "observe",
      summary: "Boundary-safe operation.",
      requiredReportIds: "[]",
      resourceCosts: "{}",
      targetLocationId: null,
      baseWorldVersion: 1,
      committedWorldVersion: null,
      authorityTraceId: null,
      blockedReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "operation-future",
      campaignId: CAMPAIGN_ID,
      factionId: "faction-1",
      commandNodeId: "command-1",
      status: "committed",
      operationKind: "move_assets",
      summary: "Future operation.",
      requiredReportIds: "[]",
      resourceCosts: "{}",
      targetLocationId: null,
      baseWorldVersion: 2,
      committedWorldVersion: 3,
      authorityTraceId: null,
      blockedReason: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]).run();

  getDb().insert(worldThreads).values([
    {
      id: "thread-safe",
      campaignId: CAMPAIGN_ID,
      name: "Boundary thread",
      status: "active",
      stage: "watching",
      visibility: "signal_only",
      pressure: 1,
      hiddenCause: null,
      hiddenCauseTerms: "[]",
      involvedActorIds: "[]",
      involvedFactionIds: "[]",
      sourceEventIds: "[\"event-safe\"]",
      sourceAuthorityTraceIds: "[]",
      surfaceRoutes: "[]",
      currentLocationId: null,
      nextDueWorldTimeMinutes: 20,
      baseWorldVersion: 1,
      lastAdvancedWorldVersion: 1,
      createdWorldTimeMinutes: 20,
      updatedWorldTimeMinutes: 20,
      metadata: "{}",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    {
      id: "thread-future",
      campaignId: CAMPAIGN_ID,
      name: "Future thread",
      status: "resolved",
      stage: "after-restore",
      visibility: "signal_only",
      pressure: 3,
      hiddenCause: "future-only cause",
      hiddenCauseTerms: "[\"future-only cause\"]",
      involvedActorIds: "[]",
      involvedFactionIds: "[]",
      sourceEventIds: "[\"event-future\"]",
      sourceAuthorityTraceIds: "[]",
      surfaceRoutes: "[]",
      currentLocationId: null,
      nextDueWorldTimeMinutes: 35,
      baseWorldVersion: 2,
      lastAdvancedWorldVersion: 2,
      createdWorldTimeMinutes: 30,
      updatedWorldTimeMinutes: 35,
      metadata: "{}",
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  ]).run();
}

describe("phase 88 integration gate", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-phase-88-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("restores a rollback boundary across jobs, proposals, actors, knowledge, factions, and threads", () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 10, worldTimeMinutes: 10 });
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "test:boundary",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "phase-88" },
      elapsedWorldTimeMinutes: 10,
    });
    const boundaryKnowledge = recordActorKnowledge({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-scout",
      route: "report_message",
      statement: "Boundary report remains true.",
      sourceEventIds: ["event-boundary"],
    });

    const safeJobId = queueSimulationJob({
      campaignId: CAMPAIGN_ID,
      jobType: "npc_tick",
      baseWorldVersion: 1,
      sourceEntity: { type: "npc", id: "npc-safe" },
      scheduledWorldTimeMinutes: 20,
      payload: { action: "safe" },
    });
    upsertActorProcessState({
      campaignId: CAMPAIGN_ID,
      actorType: "npc",
      actorId: "npc-safe",
      status: "queued",
      lastWorldVersion: 1,
      nextWakeWorldTimeMinutes: 20,
      processState: { plan: "safe" },
    });

    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "test:future",
      baseWorldVersion: 1,
      sourceEntity: { type: "system", id: "phase-88" },
      elapsedWorldTimeMinutes: 10,
    });
    const futureJobId = queueSimulationJob({
      campaignId: CAMPAIGN_ID,
      jobType: "npc_tick",
      baseWorldVersion: 2,
      sourceEntity: { type: "npc", id: "npc-future" },
      scheduledWorldTimeMinutes: 35,
      payload: { action: "future" },
    });
    const futureProposal = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "npc_offscreen_updates",
      baseWorldVersion: 2,
      sourceEntity: { type: "npc", id: "npc-future" },
      summary: "Future proposal.",
      writeScopes: ["npc:future"],
      provenance: { source: "phase-88-test" },
    });
    upsertActorProcessState({
      campaignId: CAMPAIGN_ID,
      actorType: "npc",
      actorId: "npc-future",
      status: "running",
      lastWorldVersion: 2,
      nextWakeWorldTimeMinutes: 35,
      processState: { plan: "future" },
    });
    const futureKnowledge = recordActorKnowledge({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-scout",
      route: "memory",
      statement: "Future memory must disappear after restore.",
      sourceEventIds: ["event-future"],
    });
    insertFutureFactionAndThreadArtifacts();

    invalidateAuthorityAfterRestore({
      campaignId: CAMPAIGN_ID,
      restoredWorldVersion: 1,
      restoredWorldTimeMinutes: 20,
      reason: "phase 88 restore",
    });

    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({
      worldVersion: 1,
      worldTimeMinutes: 20,
      currentTick: 20,
    });
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, safeJobId)).get())
      .toMatchObject({ status: "queued", canceledReason: null });
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, futureJobId)).get())
      .toMatchObject({ status: "canceled", canceledReason: "phase 88 restore" });
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, futureProposal.proposalId)).get())
      .toMatchObject({ status: "canceled", rejectionReason: "phase 88 restore" });
    expect(getDb().select().from(actorProcessStates).where(eq(actorProcessStates.actorId, "npc-safe")).get())
      .toMatchObject({ status: "queued", disabledReason: null });
    expect(getDb().select().from(actorProcessStates).where(eq(actorProcessStates.actorId, "npc-future")).get())
      .toMatchObject({ status: "disabled", disabledReason: "phase 88 restore" });
    expect(getDb().select().from(actorKnowledgeRecords).where(eq(actorKnowledgeRecords.id, boundaryKnowledge.id)).get())
      .toMatchObject({ invalidatedAtWorldVersion: null });
    expect(getDb().select().from(actorKnowledgeRecords).where(eq(actorKnowledgeRecords.id, futureKnowledge.id)).get())
      .toMatchObject({ invalidatedAtWorldVersion: 1 });
    expect(getDb().select().from(factionReports).where(eq(factionReports.id, "report-safe")).get())
      .toMatchObject({ status: "available" });
    expect(getDb().select().from(factionReports).where(eq(factionReports.id, "report-future")).get())
      .toMatchObject({ status: "invalidated" });
    expect(getDb().select().from(factionOperations).where(eq(factionOperations.id, "operation-safe")).get())
      .toMatchObject({ status: "proposed", blockedReason: null });
    expect(getDb().select().from(factionOperations).where(eq(factionOperations.id, "operation-future")).get())
      .toMatchObject({ status: "canceled", blockedReason: "phase 88 restore" });
    expect(getDb().select().from(worldThreads).where(eq(worldThreads.id, "thread-safe")).get())
      .toMatchObject({ status: "active" });
    expect(getDb().select().from(worldThreads).where(eq(worldThreads.id, "thread-future")).get())
      .toMatchObject({ status: "invalidated" });
    expect(commitSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: futureProposal.proposalId,
    })).toMatchObject({
      status: "rejected",
      reason: "not_pending",
    });
  });

  it("fails closed on hidden truth, source-free truth, full-history dumps, and output clipping", () => {
    expect(() =>
      buildContextBudgetTrace({
        label: "Phase88NarratorPacket",
        visibleTexts: ["The hidden faction master waits inside the packet."],
        visibleItemCount: 1,
        hiddenExcludedCount: 0,
        candidateItemCount: 1,
        sectionCounts: { facts: 1 },
        sourceCoverage: { sourceFreeCount: 1 },
        forbiddenPrivateTerms: ["hidden faction master"],
        fullHistoryDumpAttempted: true,
        sourceFreeMemoryCount: 1,
        summaryAsTruthCount: 1,
        didClipModelOutput: true,
      }),
    ).toThrow(ContextBudgetViolationError);
  });
});
