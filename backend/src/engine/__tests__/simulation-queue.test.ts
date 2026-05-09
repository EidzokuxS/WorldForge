import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  campaigns,
  simulationJobs,
  simulationProposals,
  worldClocks,
} from "../../db/schema.js";
import {
  commitAuthorityTrace,
  ensureWorldClock,
  readWorldClock,
} from "../living-world-authority.js";
import {
  commitSimulationProposal,
  createSimulationProposal,
} from "../simulation-proposal.js";
import {
  queuePostTurnSimulationProposals,
} from "../simulation-queue.js";

const CAMPAIGN_ID = "simulation-queue-campaign";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Simulation Queue",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
}

function provider() {
  return {
    id: "judge",
    name: "Judge",
    baseUrl: "http://localhost:1234",
    apiKey: "secret-key",
    model: "judge-model",
    defaultModel: "judge-model",
    isBuiltin: false,
  } as any;
}

describe("simulation queue and proposal lifecycle", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-sim-queue-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("queues post-turn simulation as versioned proposals without provider secrets", () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 5 });

    const result = queuePostTurnSimulationProposals({
      campaignId: CAMPAIGN_ID,
      tick: 5,
      judgeProvider: provider(),
      playerLocationId: "loc-player",
      playerSceneScopeId: "scene-player",
      route: "/chat/action",
    });

    expect(result).toMatchObject({
      campaignId: CAMPAIGN_ID,
      baseWorldVersion: 0,
      queued: [
        expect.objectContaining({ proposalType: "npc_offscreen_updates" }),
        expect.objectContaining({ proposalType: "npc_reflection_updates" }),
        expect.objectContaining({ proposalType: "faction_command_updates" }),
      ],
    });
    expect(getDb().select().from(simulationJobs).all()).toHaveLength(3);
    const proposals = getDb().select().from(simulationProposals).all();
    expect(proposals).toHaveLength(3);
    expect(proposals.map((proposal) => proposal.status)).toEqual([
      "pending",
      "pending",
      "pending",
    ]);
    expect(proposals.map((proposal) => proposal.payload).join("\n")).not.toContain("secret-key");
    expect(proposals.map((proposal) => proposal.payload).join("\n")).toContain("factionRouting");
  });

  it("keeps interval-bound workers out of non-interval turns while preserving reflection scan proposals", () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 2 });

    const result = queuePostTurnSimulationProposals({
      campaignId: CAMPAIGN_ID,
      tick: 2,
      judgeProvider: provider(),
      playerLocationId: "loc-player",
    });

    expect(result.queued.map((proposal) => proposal.proposalType)).toEqual([
      "npc_reflection_updates",
    ]);
  });

  it("commits valid proposals and rejects stale, conflicting, and expired proposals without hidden writes", () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 0 });
    const valid = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "npc_reflection_updates",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "test" },
      summary: "Update memory if still current.",
      readSet: ["npc:unprocessed_importance"],
      writeScopes: ["npc:memory"],
      provenance: { source: "test", tick: 0 },
    });

    expect(commitSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: valid.proposalId,
    })).toMatchObject({
      status: "committed",
      baseWorldVersion: 0,
      committedWorldVersion: 1,
    });
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({ worldVersion: 1 });

    const stale = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "faction_command_updates",
      baseWorldVersion: 1,
      sourceEntity: { type: "system", id: "test" },
      summary: "Faction update.",
      writeScopes: ["faction:state"],
      provenance: { source: "test", tick: 1 },
    });
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "tool:log_event",
      baseWorldVersion: 1,
      sourceEntity: { type: "player", id: "player-1" },
    });
    expect(commitSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: stale.proposalId,
    })).toMatchObject({
      status: "rejected",
      reason: "stale_base_world_version",
      baseWorldVersion: 1,
      currentWorldVersion: 2,
    });

    const conflicting = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "npc_offscreen_updates",
      baseWorldVersion: 2,
      sourceEntity: { type: "system", id: "test" },
      summary: "NPC move.",
      writeScopes: ["npc:state"],
      provenance: { source: "test", tick: 2 },
    });
    expect(commitSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: conflicting.proposalId,
      blockedWriteScopes: ["npc:state"],
    })).toMatchObject({
      status: "rejected",
      reason: "conflicting_write_scope",
      currentWorldVersion: 2,
    });

    getDb().update(worldClocks)
      .set({ worldTimeMinutes: 10, currentTick: 10 })
      .where(eq(worldClocks.campaignId, CAMPAIGN_ID))
      .run();
    const expired = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "world_event",
      baseWorldVersion: 2,
      sourceEntity: { type: "system", id: "test" },
      summary: "Expired pressure.",
      writeScopes: ["world:event"],
      provenance: { source: "test", tick: 2 },
      expiresAtWorldTimeMinutes: 5,
    });
    expect(commitSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: expired.proposalId,
    })).toMatchObject({
      status: "rejected",
      reason: "expired",
      currentWorldVersion: 2,
    });
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({ worldVersion: 2 });
  });
});
