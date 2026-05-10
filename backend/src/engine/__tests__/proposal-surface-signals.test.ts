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
  locationRecentEvents,
  locations,
  simulationJobs,
  simulationProposals,
  worldThreadEvents,
  worldThreads,
} from "../../db/schema.js";
import {
  ensureWorldClock,
  queueSimulationJob,
  readWorldClock,
} from "../living-world-authority.js";
import { createSimulationProposal } from "../simulation-proposal.js";
import { executeDueSimulationProposal } from "../simulation-proposal-executor.js";
import { validateSurfaceSignalDecision } from "../surface-signal.js";

const CAMPAIGN_ID = "proposal-surface-signals-campaign";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Proposal Surface Signals",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
  getDb().insert(locations).values({
    id: "loc-market",
    campaignId: CAMPAIGN_ID,
    name: "Market",
    description: "A market.",
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

function seedWorld() {
  seedCampaign();
  ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 10, worldTimeMinutes: 10 });
}

function createProposal(input: {
  proposalType: string;
  data: Record<string, unknown>;
}) {
  const clock = readWorldClock(CAMPAIGN_ID);
  const jobId = queueSimulationJob({
    campaignId: CAMPAIGN_ID,
    jobType: input.proposalType,
    baseWorldVersion: clock.worldVersion,
    sourceEntity: { type: "system", id: input.proposalType },
    payload: input.data,
  });
  return {
    jobId,
    proposal: createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: input.proposalType,
      baseWorldVersion: clock.worldVersion,
      sourceEntity: { type: "system", id: input.proposalType },
      jobId,
      summary: `Execute ${input.proposalType}.`,
      readSet: [`world_version:${clock.worldVersion}`],
      writeScopes: ["world:event", "location:loc-market:event"],
      dueAtWorldTimeMinutes: clock.worldTimeMinutes,
      priority: 5,
      intendedTools: [{
        name: "add_chronicle_entry",
        args: { text: `Chronicle for ${input.proposalType}` },
      }],
      provenance: { source: "test", tick: 10 },
      data: input.data,
    }),
  };
}

describe("proposal surface signals", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-proposal-surface-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedWorld();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("validates policy, hidden cause redaction, and explicit none reasons", () => {
    expect(() => validateSurfaceSignalDecision({ summary: "Missing policy" }))
      .toThrow("surface_signal_policy_missing_or_invalid");
    expect(() => validateSurfaceSignalDecision({
      policy: "none",
      summary: "",
    })).toThrow("surface_signal_none_requires_reason");
    expect(() => validateSurfaceSignalDecision({
      policy: "rumor",
      summary: "The secret cult controls the market.",
      hiddenCauseTerms: ["secret cult"],
    })).toThrow("Surface signal summary leaks hidden cause term");
    expect(validateSurfaceSignalDecision({
      policy: "none",
      noSurfaceReason: "Pure bookkeeping with no player-discoverable consequence.",
    })).toMatchObject({
      policy: "none",
      noSurfaceReason: "Pure bookkeeping with no player-discoverable consequence.",
    });
  });

  it("rejects meaningful offscreen commits that omit a surface policy", async () => {
    const { proposal, jobId } = createProposal({
      proposalType: "missing_surface",
      data: { meaningfulOffscreenCommit: true },
    });

    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "terminal",
      disposition: "rejected_invalid",
      reason: "surface_signal_required_for_meaningful_offscreen_commit",
    });
    expect(getDb().select().from(chronicle).all()).toEqual([]);
    expect(getDb().select().from(authorityTraces).all()).toEqual([]);
    expect(getDb().select().from(simulationJobs).where(eq(simulationJobs.id, jobId)).get())
      .toMatchObject({ status: "failed" });
  });

  it("creates discoverable thread and location signals without hidden cause leakage", async () => {
    const { proposal } = createProposal({
      proposalType: "rumor_surface",
      data: {
        meaningfulOffscreenCommit: true,
        surfaceSignal: {
          policy: "rumor",
          summary: "Market porters whisper that a sealed cart left before dawn.",
          locationRef: "loc-market",
          threadName: "Sealed cart rumor",
          sourceEventIds: ["event-cart"],
          hiddenCauseTerms: ["secret cult"],
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
      committedWorldVersion: 3,
    });
    expect(getDb().select().from(worldThreads).all()).toEqual([
      expect.objectContaining({
        name: "Sealed cart rumor",
        currentLocationId: "loc-market",
      }),
    ]);
    expect(getDb().select().from(worldThreadEvents).all()).toEqual([
      expect.objectContaining({
        eventType: "surface_signal",
        surfaceRoute: "rumor",
        locationId: "loc-market",
        summary: "Market porters whisper that a sealed cart left before dawn.",
      }),
    ]);
    expect(getDb().select().from(locationRecentEvents).all()).toEqual([
      expect.objectContaining({
        eventType: "world_thread_signal",
        surfaceRoute: "rumor",
        knowledgeRoute: "rumor",
        summary: "Market porters whisper that a sealed cart left before dawn.",
      }),
    ]);
    expect(
      getDb().select().from(worldThreadEvents).all().map((event) => event.summary).join("\n"),
    ).not.toContain("secret cult");
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, proposal.proposalId)).get())
      .toMatchObject({ status: "committed", committedWorldVersion: 3 });
  });

  it("routes physical traces as local sensory evidence with provenance", async () => {
    const { proposal } = createProposal({
      proposalType: "physical_trace_surface",
      data: {
        meaningfulOffscreenCommit: true,
        surfaceSignal: {
          policy: "physical_trace",
          summary: "Scuffed wax marks lead away from the stall.",
          locationRef: "loc-market",
          threadName: "Scuffed wax trail",
          sourceEventIds: ["event-footprints"],
          hiddenCauseTerms: ["assassin"],
        },
      },
    });

    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "committed",
      disposition: "committed",
      committedWorldVersion: 3,
    });

    const [threadEvent] = getDb().select().from(worldThreadEvents).all();
    expect(threadEvent).toMatchObject({
      eventType: "surface_signal",
      surfaceRoute: "sensory",
      visibility: "signal_only",
      locationId: "loc-market",
      summary: "Scuffed wax marks lead away from the stall.",
    });
    expect(JSON.parse(threadEvent.sourceEventIds)).toContain("event-footprints");
    expect(JSON.parse(threadEvent.sourceAuthorityTraceIds).length).toBeGreaterThan(0);
    const [locationEvent] = getDb().select().from(locationRecentEvents).all();
    expect(locationEvent).toMatchObject({
      eventType: "world_thread_signal",
      surfaceRoute: "sensory",
      visibility: "local_signal",
      knowledgeRoute: "direct_observation",
      summary: "Scuffed wax marks lead away from the stall.",
    });
    expect(threadEvent.summary).not.toContain("assassin");
    expect(locationEvent.summary).not.toContain("assassin");
  });

  it("allows explicit no-surface commits while preserving the reason in metadata", async () => {
    const { proposal } = createProposal({
      proposalType: "none_surface",
      data: {
        meaningfulOffscreenCommit: true,
        surfaceSignal: {
          policy: "none",
          noSurfaceReason: "Internal accounting only; no player-discoverable signal.",
        },
      },
    });

    await expect(executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
      tick: 10,
      phase: "watchdog",
    })).resolves.toMatchObject({
      status: "committed",
      disposition: "committed",
      committedWorldVersion: 1,
    });
    expect(getDb().select().from(worldThreads).all()).toEqual([]);
    expect(getDb().select().from(locationRecentEvents).all()).toEqual([]);
    const row = getDb()
      .select()
      .from(simulationProposals)
      .where(eq(simulationProposals.id, proposal.proposalId))
      .get();
    expect(row?.lifecycleMetadata).toContain("Internal accounting only");
  });
});
