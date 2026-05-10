import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  campaigns,
  locations,
  simulationJobs,
  simulationProposals,
} from "../../db/schema.js";
import { calculateLivingWorldProposalMetrics } from "../living-world-metrics.js";
import { ensureWorldClock, readWorldClock } from "../living-world-authority.js";
import { advanceWorldThread, createWorldThread } from "../world-thread.js";

const CAMPAIGN_ID = "living-world-metrics-campaign";
const LOCATION_ID = "loc-metrics-market";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Living World Metrics",
    premise: "A metrics test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
  getDb().insert(locations).values({
    id: LOCATION_ID,
    campaignId: CAMPAIGN_ID,
    name: "Metrics Market",
    description: "A market for metrics fixtures.",
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
  ensureWorldClock({
    campaignId: CAMPAIGN_ID,
    currentTick: 10,
    worldTimeMinutes: 10,
  });
}

function insertProposal(input: {
  id: string;
  status: typeof simulationProposals.$inferSelect.status;
  disposition: typeof simulationProposals.$inferSelect.proposalDisposition;
  createdWorldTimeMinutes?: number;
  payload?: Record<string, unknown>;
  lifecycleMetadata?: Record<string, unknown>;
}) {
  const timestamp = Date.now();
  const row: typeof simulationProposals.$inferInsert = {
    id: input.id,
    campaignId: CAMPAIGN_ID,
    jobId: null,
    proposalType: "metrics_fixture",
    idempotencyKey: null,
    status: input.status,
    proposalDisposition: input.disposition,
    dispositionReason: null,
    baseWorldVersion: 0,
    proposedWorldVersion: null,
    committedWorldVersion: input.status === "committed" ? 1 : null,
    dueAtWorldTimeMinutes: null,
    expiryPolicy: "reject_when_expired",
    priority: 0,
    intendedTools: "[]",
    supersededByProposalId: null,
    lifecycleMetadata: JSON.stringify(input.lifecycleMetadata ?? {}),
    sourceEntityType: "system",
    sourceEntityId: "metrics",
    payload: JSON.stringify(input.payload ?? {}),
    toolResultId: null,
    rejectionReason: null,
    createdWorldTimeMinutes: input.createdWorldTimeMinutes ?? 10,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  getDb().insert(simulationProposals).values(row).run();
}

function insertJob(input: {
  id: string;
  status: typeof simulationJobs.$inferSelect.status;
  scheduledWorldTimeMinutes: number;
}) {
  const timestamp = Date.now();
  const row: typeof simulationJobs.$inferInsert = {
    id: input.id,
    campaignId: CAMPAIGN_ID,
    jobType: "metrics_fixture",
    status: input.status,
    priority: 0,
    baseWorldVersion: 0,
    resultWorldVersion: null,
    idempotencyKey: null,
    scheduledWorldTimeMinutes: input.scheduledWorldTimeMinutes,
    createdWorldTimeMinutes: input.scheduledWorldTimeMinutes,
    sourceEntityType: "system",
    sourceEntityId: "metrics",
    payload: "{}",
    canceledReason: null,
    supersededByJobId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  getDb().insert(simulationJobs).values(row).run();
}

function createDiscoverableSurfaceRows() {
  const thread = createWorldThread({
    campaignId: CAMPAIGN_ID,
    name: "Metrics rumor",
    stage: "surface",
    currentLocationId: LOCATION_ID,
    sourceEventIds: ["event-metrics-source"],
  });
  advanceWorldThread({
    campaignId: CAMPAIGN_ID,
    threadId: thread.id,
    baseWorldVersion: readWorldClock(CAMPAIGN_ID).worldVersion,
    sourceEventIds: ["event-metrics-source"],
    surface: {
      route: "rumor",
      locationRef: LOCATION_ID,
      visibility: "signal_only",
      summary: "Market hands repeat a source-backed rumor.",
    },
  });
}

describe("living world proposal metrics", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-living-world-metrics-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns zero-safe ratios when a campaign has no proposals", () => {
    const metrics = calculateLivingWorldProposalMetrics({ campaignId: CAMPAIGN_ID });

    expect(metrics.metrics).toEqual({
      proposal_commit_ratio: 0,
      proposal_terminal_state_ratio: 0,
      surface_signal_coverage: 0,
      stale_job_count: 0,
    });
    expect(metrics.counts.totalProposals).toBe(0);
    expect(metrics.defects).toEqual({
      missingSurfaceProposalIds: [],
      staleJobIds: [],
    });
  });

  it("counts proposal terminal states, surface coverage, defects, and stale jobs", () => {
    insertProposal({
      id: "proposal-pending",
      status: "pending",
      disposition: "pending",
      payload: { data: { meaningfulOffscreenCommit: true } },
    });
    insertProposal({
      id: "proposal-committed-rumor",
      status: "committed",
      disposition: "committed",
      payload: { data: { meaningfulOffscreenCommit: true } },
      lifecycleMetadata: {
        surfaceSignal: { policy: "rumor", summary: "Market hands repeat a rumor." },
      },
    });
    insertProposal({
      id: "proposal-committed-none",
      status: "committed",
      disposition: "committed",
      payload: { data: { meaningfulOffscreenCommit: true } },
      lifecycleMetadata: {
        surfaceSignal: {
          policy: "none",
          noSurfaceReason: "No player-discoverable consequence.",
        },
      },
    });
    insertProposal({
      id: "proposal-committed-missing",
      status: "committed",
      disposition: "committed",
      payload: { data: { meaningfulOffscreenCommit: true } },
    });
    insertProposal({
      id: "proposal-rejected",
      status: "rejected",
      disposition: "rejected_invalid",
    });
    insertProposal({
      id: "proposal-expired",
      status: "rejected",
      disposition: "expired_stale_version",
    });
    insertProposal({
      id: "proposal-deferred",
      status: "pending",
      disposition: "deferred_not_due",
    });
    insertProposal({
      id: "proposal-superseded",
      status: "superseded",
      disposition: "superseded_by_new_event",
    });
    insertProposal({
      id: "proposal-canceled",
      status: "canceled",
      disposition: "rejected_invalid",
    });
    insertProposal({
      id: "proposal-rebase",
      status: "rejected",
      disposition: "needs_rebase",
    });
    insertProposal({
      id: "proposal-actor-retry",
      status: "rejected",
      disposition: "needs_actor_retry",
    });
    insertJob({ id: "job-stale-queued", status: "queued", scheduledWorldTimeMinutes: 3 });
    insertJob({ id: "job-stale-running", status: "running", scheduledWorldTimeMinutes: 9 });
    insertJob({ id: "job-future", status: "queued", scheduledWorldTimeMinutes: 30 });
    insertJob({ id: "job-completed", status: "completed", scheduledWorldTimeMinutes: 1 });
    createDiscoverableSurfaceRows();

    const metrics = calculateLivingWorldProposalMetrics({ campaignId: CAMPAIGN_ID });

    expect(metrics.metrics.proposal_commit_ratio).toBeCloseTo(3 / 11);
    expect(metrics.metrics.proposal_terminal_state_ratio).toBeCloseTo(9 / 11);
    expect(metrics.metrics.surface_signal_coverage).toBeCloseTo(2 / 3);
    expect(metrics.metrics.stale_job_count).toBe(2);
    expect(metrics.counts).toMatchObject({
      totalProposals: 11,
      pending: 2,
      committed: 3,
      rejected: 4,
      canceled: 1,
      expired: 1,
      deferred: 1,
      superseded: 1,
      needsRebase: 1,
      needsActorRetry: 1,
      meaningfulCommitted: 3,
      discoverableSurface: 1,
      explicitNoSurface: 1,
      missingSurface: 1,
      worldThreadEvents: 1,
      locationRecentEvents: 1,
      staleJobs: 2,
    });
    expect(metrics.defects.missingSurfaceProposalIds).toEqual([
      "proposal-committed-missing",
    ]);
    expect(metrics.defects.staleJobIds.sort()).toEqual([
      "job-stale-queued",
      "job-stale-running",
    ]);
  });

  it("honors the sinceWorldTimeMinutes filter for proposal, event, and job counts", () => {
    insertProposal({
      id: "old-committed",
      status: "committed",
      disposition: "committed",
      createdWorldTimeMinutes: 2,
      payload: { data: { meaningfulOffscreenCommit: true } },
      lifecycleMetadata: {
        surfaceSignal: { policy: "rumor", summary: "Old rumor." },
      },
    });
    insertProposal({
      id: "new-committed",
      status: "committed",
      disposition: "committed",
      createdWorldTimeMinutes: 8,
      payload: { data: { meaningfulOffscreenCommit: true } },
      lifecycleMetadata: {
        surfaceSignal: { policy: "rumor", summary: "New rumor." },
      },
    });
    insertJob({ id: "job-old", status: "queued", scheduledWorldTimeMinutes: 2 });
    insertJob({ id: "job-new", status: "queued", scheduledWorldTimeMinutes: 8 });

    const metrics = calculateLivingWorldProposalMetrics({
      campaignId: CAMPAIGN_ID,
      sinceWorldTimeMinutes: 5,
    });

    expect(metrics.counts.totalProposals).toBe(1);
    expect(metrics.counts.committed).toBe(1);
    expect(metrics.metrics.proposal_commit_ratio).toBe(1);
    expect(metrics.counts.staleJobs).toBe(1);
    expect(metrics.defects.staleJobIds).toEqual(["job-new"]);
  });
});
