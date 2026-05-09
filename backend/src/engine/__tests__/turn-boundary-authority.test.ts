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
  buildDoneBoundaryData,
} from "../simulation-queue.js";

const CAMPAIGN_ID = "turn-boundary-authority-campaign";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Turn Boundary",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
}

describe("turn boundary authority metadata", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-turn-boundary-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("adds current world version to done payloads without changing the turn tick", () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 4 });
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "tool:log_event",
      baseWorldVersion: 0,
      sourceEntity: { type: "player", id: "player-1" },
      elapsedWorldTimeMinutes: 2,
      currentTick: 4,
    });

    expect(buildDoneBoundaryData(CAMPAIGN_ID, { tick: 5 })).toMatchObject({
      tick: 5,
      worldVersion: 1,
      worldTimeMinutes: 6,
    });
  });

  it("rejects proposals created before a done boundary when the world advances afterwards", () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 0 });
    const proposal = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "npc_offscreen_updates",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "npc-offscreen" },
      summary: "Move an offscreen NPC.",
      writeScopes: ["npc:state"],
      provenance: { source: "test", tick: 0 },
    });

    const doneBoundary = buildDoneBoundaryData(CAMPAIGN_ID, { tick: 1 });
    expect(doneBoundary).toMatchObject({ worldVersion: 0 });

    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "tool:reveal_location",
      baseWorldVersion: 0,
      sourceEntity: { type: "player", id: "player-1" },
    });

    expect(commitSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: proposal.proposalId,
    })).toMatchObject({
      status: "rejected",
      reason: "stale_base_world_version",
      currentWorldVersion: 1,
    });
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({ worldVersion: 1 });
    expect(
      getDb()
        .select()
        .from(simulationProposals)
        .where(eq(simulationProposals.id, proposal.proposalId))
        .get(),
    ).toMatchObject({
      status: "rejected",
      rejectionReason: "stale_base_world_version",
    });
  });
});
