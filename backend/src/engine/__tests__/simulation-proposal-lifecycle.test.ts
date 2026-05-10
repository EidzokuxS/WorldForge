import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  campaigns,
  simulationProposals,
  worldClocks,
} from "../../db/schema.js";
import {
  commitAuthorityTrace,
  ensureWorldClock,
  queueSimulationJob,
} from "../living-world-authority.js";
import {
  classifySimulationProposalPreflight,
  commitSimulationProposal,
  createSimulationProposal,
  parseSimulationProposalPayload,
  type SimulationProposalPayload,
} from "../simulation-proposal.js";

const CAMPAIGN_ID = "simulation-proposal-lifecycle-campaign";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Simulation Proposal Lifecycle",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
}

function basePayload(overrides: Partial<SimulationProposalPayload> = {}): SimulationProposalPayload {
  return {
    schemaVersion: 2,
    summary: "A pending offscreen consequence.",
    readSet: ["npc:npc-1:state", "location:market:presence"],
    writeScopes: ["npc:npc-1:state"],
    preconditions: [],
    dueAtWorldTimeMinutes: 10,
    expiryPolicy: "reject_when_expired",
    priority: 5,
    intendedTools: [{ name: "actor_decision", reason: "test" }],
    sourceJobId: "job-1",
    sourceEntity: { type: "npc", id: "npc-1" },
    provenance: { source: "test", tick: 10 },
    expiresAtWorldTimeMinutes: 30,
    data: {},
    ...overrides,
  };
}

describe("simulation proposal lifecycle preflight", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-proposal-lifecycle-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("stores Phase 91 lifecycle fields while keeping legacy payload rows readable", () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 12, worldTimeMinutes: 120 });
    const jobId = queueSimulationJob({
      campaignId: CAMPAIGN_ID,
      jobType: "key_actor_process",
      baseWorldVersion: 0,
      sourceEntity: { type: "npc", id: "npc-1" },
      payload: { route: "test" },
    });

    const proposal = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "key_actor_decision",
      baseWorldVersion: 0,
      sourceEntity: { type: "npc", id: "npc-1" },
      jobId,
      summary: "NPC should decide after the player ignores the hook.",
      readSet: ["npc:npc-1:state"],
      writeScopes: ["npc:npc-1:state"],
      preconditions: ["Actor must still own the process lock."],
      dueAtWorldTimeMinutes: 125,
      expiresAtWorldTimeMinutes: 180,
      priority: 8,
      intendedTools: [{ name: "actor_decision", args: { actorId: "npc-1" } }],
      provenance: { source: "test", tick: 12 },
    });

    expect(proposal).toMatchObject({
      status: "pending",
      disposition: "pending",
      dueAtWorldTimeMinutes: 125,
      priority: 8,
    });

    const row = getDb()
      .select()
      .from(simulationProposals)
      .where(eq(simulationProposals.id, proposal.proposalId))
      .get();
    expect(row).toMatchObject({
      proposalDisposition: "pending",
      dueAtWorldTimeMinutes: 125,
      expiryPolicy: "reject_when_expired",
      priority: 8,
    });
    expect(row?.intendedTools).toContain("actor_decision");

    const payload = parseSimulationProposalPayload(row?.payload ?? "{}");
    expect(payload).toMatchObject({
      schemaVersion: 2,
      dueAtWorldTimeMinutes: 125,
      expiryPolicy: "reject_when_expired",
      priority: 8,
      sourceJobId: jobId,
      sourceEntity: { type: "npc", id: "npc-1" },
    });
    expect(payload.intendedTools).toEqual([
      { name: "actor_decision", args: { actorId: "npc-1" } },
    ]);

    expect(parseSimulationProposalPayload(JSON.stringify({
      summary: "legacy row",
      readSet: ["world_version:0"],
      writeScopes: ["world:event"],
      preconditions: [],
      provenance: { source: "legacy" },
      data: {},
    }))).toMatchObject({
      schemaVersion: 1,
      expiryPolicy: "reject_when_expired",
      priority: 0,
      intendedTools: [],
    });
  });

  it("classifies every Phase 91 preflight branch with reason-coded dispositions", () => {
    const ready = classifySimulationProposalPreflight({
      status: "pending",
      baseWorldVersion: 3,
      currentWorldVersion: 3,
      currentWorldTimeMinutes: 10,
      payload: basePayload(),
    });
    expect(ready).toMatchObject({ disposition: "ready_to_commit" });

    expect(classifySimulationProposalPreflight({
      status: "pending",
      baseWorldVersion: 3,
      currentWorldVersion: 3,
      currentWorldTimeMinutes: 9,
      payload: basePayload({ dueAtWorldTimeMinutes: 10 }),
    })).toMatchObject({ disposition: "deferred_not_due" });

    expect(classifySimulationProposalPreflight({
      status: "pending",
      baseWorldVersion: 3,
      currentWorldVersion: 3,
      currentWorldTimeMinutes: 31,
      payload: basePayload({ expiresAtWorldTimeMinutes: 30 }),
    })).toMatchObject({ disposition: "expired_stale_version" });

    expect(classifySimulationProposalPreflight({
      status: "pending",
      baseWorldVersion: 3,
      currentWorldVersion: 3,
      currentWorldTimeMinutes: 10,
      payload: basePayload({ preconditions: ["invalid: required report was consumed"] }),
    })).toMatchObject({ disposition: "rejected_invalid" });

    expect(classifySimulationProposalPreflight({
      status: "pending",
      baseWorldVersion: 3,
      currentWorldVersion: 3,
      currentWorldTimeMinutes: 10,
      payload: basePayload({ writeScopes: ["npc:npc-1:state"] }),
      blockedWriteScopes: ["npc:npc-1"],
    })).toMatchObject({
      disposition: "rejected_invalid",
      reason: "conflicting_write_scope",
      conflictingWriteScope: "npc:npc-1:state",
    });

    expect(classifySimulationProposalPreflight({
      status: "pending",
      baseWorldVersion: 3,
      currentWorldVersion: 4,
      currentWorldTimeMinutes: 10,
      payload: basePayload(),
      changedReadSetRefs: ["faction:faction-1:state"],
    })).toMatchObject({ disposition: "needs_rebase" });

    expect(classifySimulationProposalPreflight({
      status: "pending",
      baseWorldVersion: 3,
      currentWorldVersion: 4,
      currentWorldTimeMinutes: 10,
      payload: basePayload(),
      changedReadSetRefs: ["npc:npc-1:state"],
    })).toMatchObject({
      disposition: "needs_actor_retry",
      materialReadSetRefs: ["npc:npc-1:state"],
    });

    expect(classifySimulationProposalPreflight({
      status: "pending",
      baseWorldVersion: 3,
      currentWorldVersion: 3,
      currentWorldTimeMinutes: 10,
      payload: basePayload(),
      supersededByProposalId: "proposal-newer",
    })).toMatchObject({
      disposition: "superseded_by_new_event",
      supersededByProposalId: "proposal-newer",
    });
  });

  it("persists direct commit preflight dispositions without weakening legacy rejection results", () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 0, worldTimeMinutes: 10 });

    const deferred = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "deferred_actor_decision",
      baseWorldVersion: 0,
      sourceEntity: { type: "npc", id: "npc-deferred" },
      summary: "Too early.",
      writeScopes: ["npc:npc-deferred:state"],
      dueAtWorldTimeMinutes: 20,
      provenance: { source: "test" },
    });
    expect(commitSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: deferred.proposalId,
    })).toMatchObject({
      status: "rejected",
      reason: "deferred_not_due",
      disposition: "deferred_not_due",
    });
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, deferred.proposalId)).get())
      .toMatchObject({ status: "pending", proposalDisposition: "deferred_not_due" });

    const stale = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "stale_actor_decision",
      baseWorldVersion: 0,
      sourceEntity: { type: "npc", id: "npc-stale" },
      summary: "Can rebase if reads are unaffected.",
      readSet: ["npc:npc-stale:state"],
      writeScopes: ["npc:npc-stale:state"],
      provenance: { source: "test" },
    });
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "test:advance",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "test" },
    });
    expect(commitSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: stale.proposalId,
      changedReadSetRefs: ["location:market:presence"],
    })).toMatchObject({
      status: "rejected",
      reason: "stale_base_world_version",
      disposition: "needs_rebase",
      currentWorldVersion: 1,
    });
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, stale.proposalId)).get())
      .toMatchObject({
        status: "rejected",
        rejectionReason: "stale_base_world_version",
        proposalDisposition: "needs_rebase",
      });

    const actorRetry = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "material_actor_decision",
      baseWorldVersion: 1,
      sourceEntity: { type: "npc", id: "npc-retry" },
      summary: "Must retry when actor state changed.",
      readSet: ["npc:npc-retry:state"],
      writeScopes: ["npc:npc-retry:state"],
      provenance: { source: "test" },
    });
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "test:advance-again",
      baseWorldVersion: 1,
      sourceEntity: { type: "system", id: "test" },
    });
    expect(commitSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: actorRetry.proposalId,
      changedReadSetRefs: ["npc:npc-retry:state"],
    })).toMatchObject({
      status: "rejected",
      reason: "needs_actor_retry",
      disposition: "needs_actor_retry",
    });

    getDb().update(worldClocks)
      .set({ worldTimeMinutes: 40, currentTick: 40 })
      .where(eq(worldClocks.campaignId, CAMPAIGN_ID))
      .run();
    const expired = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "expired_actor_decision",
      baseWorldVersion: 2,
      sourceEntity: { type: "npc", id: "npc-expired" },
      summary: "Expired.",
      writeScopes: ["npc:npc-expired:state"],
      expiresAtWorldTimeMinutes: 30,
      provenance: { source: "test" },
    });
    expect(commitSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: expired.proposalId,
    })).toMatchObject({
      status: "rejected",
      reason: "expired",
      disposition: "expired_stale_version",
    });

    const superseded = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "superseded_actor_decision",
      baseWorldVersion: 2,
      sourceEntity: { type: "npc", id: "npc-superseded" },
      summary: "Superseded.",
      writeScopes: ["npc:npc-superseded:state"],
      provenance: { source: "test" },
    });
    expect(commitSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: superseded.proposalId,
      supersededByProposalId: "proposal-newer",
    })).toMatchObject({
      status: "rejected",
      reason: "superseded_by_new_event",
      disposition: "superseded_by_new_event",
    });
    expect(getDb().select().from(simulationProposals).where(eq(simulationProposals.id, superseded.proposalId)).get())
      .toMatchObject({
        status: "superseded",
        supersededByProposalId: "proposal-newer",
      });
  });
});
