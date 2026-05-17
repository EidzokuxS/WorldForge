import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  campaigns,
  factions,
  locations,
  simulationJobs,
  simulationProposals,
  worldClocks,
} from "../../db/schema.js";
import {
  commitAuthorityTrace,
  ensureWorldClock,
  queueSimulationJob,
  readWorldClock,
} from "../living-world-authority.js";
import {
  commitSimulationProposal,
  createSimulationProposal,
  parseSimulationProposalPayload,
} from "../simulation-proposal.js";
import { executeDueSimulationProposal } from "../simulation-proposal-executor.js";
import {
  queuePostTurnSimulationProposals,
} from "../simulation-queue.js";
import {
  createFactionReport,
  ensureFactionCommandNode,
  ensureFactionResource,
} from "../faction-command-network.js";

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

function seedFactionCommandNetwork() {
  getDb().insert(locations).values({
    id: "loc-market",
    campaignId: CAMPAIGN_ID,
    name: "Night Market",
    description: "A market with faction reports.",
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
  getDb().insert(factions).values({
    id: "faction-wardens",
    campaignId: CAMPAIGN_ID,
    name: "Market Wardens",
    tags: "[]",
    goals: "[]",
    assets: "[]",
  }).run();
  const node = ensureFactionCommandNode({
    campaignId: CAMPAIGN_ID,
    factionId: "faction-wardens",
    standingOrders: [],
  });
  ensureFactionResource({
    campaignId: CAMPAIGN_ID,
    factionId: "faction-wardens",
    resourceKey: "patrols",
    quantity: 2,
  });
  createFactionReport({
    campaignId: CAMPAIGN_ID,
    factionId: "faction-wardens",
    commandNodeId: node.id,
    route: "report_message",
    summary: "A runner reports pressure at the night market.",
    sourceLocationId: "loc-market",
  });
  return node;
}

function seedPlayerLocation() {
  getDb().insert(locations).values({
    id: "loc-player",
    campaignId: CAMPAIGN_ID,
    name: "Player Hall",
    description: "The player-facing scene anchor.",
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
      ],
    });
    expect(getDb().select().from(simulationJobs).all()).toHaveLength(1);
    const proposals = getDb().select().from(simulationProposals).all();
    expect(proposals).toHaveLength(1);
    expect(proposals.map((proposal) => proposal.status)).toEqual([
      "pending",
    ]);
    expect(proposals.map((proposal) => proposal.proposalDisposition)).toEqual([
      "pending",
    ]);
    expect(proposals.map((proposal) => proposal.dueAtWorldTimeMinutes)).toEqual([
      result.worldTimeMinutes,
    ]);
    expect(proposals.map((proposal) => proposal.priority)).toEqual([10]);
    const payloads = proposals.map((proposal) =>
      parseSimulationProposalPayload(proposal.payload),
    );
    expect(payloads.every((payload) => payload.schemaVersion === 2)).toBe(true);
    expect(payloads.every((payload) => payload.intendedTools.length > 0)).toBe(true);
    const offscreenPayload = proposals
      .map((proposal) => ({
        proposal,
        payload: parseSimulationProposalPayload(proposal.payload),
      }))
      .find((entry) => entry.proposal.proposalType === "npc_offscreen_updates")?.payload;
    expect(offscreenPayload?.intendedTools).toEqual([
      expect.objectContaining({
        name: "record_location_event",
        args: expect.objectContaining({
          locationRef: "loc-player",
          eventType: "npc_offscreen_interval_due",
        }),
      }),
    ]);
    const toolNames = payloads.flatMap((payload) => payload.intendedTools.map((tool) => tool.name));
    expect(toolNames).not.toContain("npc_offscreen_update");
    expect(toolNames).not.toContain("npc_reflection_update");
    expect(toolNames).not.toContain("faction_command_operation");
    expect(toolNames).not.toContain("record_world_event");
    expect(proposals.map((proposal) => proposal.payload).join("\n")).not.toContain("secret-key");
    expect(proposals.map((proposal) => proposal.payload).join("\n")).not.toContain("factionRouting");
  });

  it("queues executable offscreen interval proposals instead of unsupported multi-tool work", async () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 5 });
    seedPlayerLocation();

    const result = queuePostTurnSimulationProposals({
      campaignId: CAMPAIGN_ID,
      tick: 5,
      judgeProvider: provider(),
      playerLocationId: "loc-player",
      playerSceneScopeId: "scene-player",
      route: "/chat/action",
      idempotencyKey: "post-turn:offscreen-executable:5",
    });
    const offscreen = result.queued.find((proposal) =>
      proposal.proposalType === "npc_offscreen_updates");
    if (!offscreen) {
      throw new Error("expected npc_offscreen_updates proposal");
    }

    const row = getDb()
      .select()
      .from(simulationProposals)
      .where(eq(simulationProposals.id, offscreen.proposalId))
      .get();
    const payload = parseSimulationProposalPayload(row?.payload ?? "{}");
    expect(payload.intendedTools).toEqual([
      expect.objectContaining({
        name: "record_location_event",
        args: expect.objectContaining({ locationRef: "loc-player" }),
      }),
    ]);

    const execution = await executeDueSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: offscreen.proposalId,
      tick: 5,
      phase: "watchdog",
    });

    expect(execution).toMatchObject({
      status: "committed",
      disposition: "committed",
      proposalId: offscreen.proposalId,
    });
    expect(readWorldClock(CAMPAIGN_ID).worldVersion).toBe(1);
  });

  it("keeps all interval-bound post-turn proposals out of non-interval turns", () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 2 });

    const result = queuePostTurnSimulationProposals({
      campaignId: CAMPAIGN_ID,
      tick: 2,
      judgeProvider: provider(),
      playerLocationId: "loc-player",
    });

    expect(result.queued.map((proposal) => proposal.proposalType)).toEqual([]);
  });

  it("does not queue unsupported faction command proposals until an executable proposal tool exists", () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 5 });
    seedFactionCommandNetwork();

    const result = queuePostTurnSimulationProposals({
      campaignId: CAMPAIGN_ID,
      tick: 5,
      judgeProvider: provider(),
      playerLocationId: "loc-player",
      route: "/chat/action",
    });
    const payloads = getDb()
      .select()
      .from(simulationProposals)
      .all()
      .map((row) => parseSimulationProposalPayload(row.payload));

    expect(result.queued.map((proposal) => proposal.proposalType)).toEqual([
      "npc_offscreen_updates",
    ]);
    const toolNames = payloads.flatMap((payload) => payload.intendedTools.map((tool) => tool.name));
    expect(toolNames).not.toContain("faction_command_operation");
    expect(toolNames).not.toContain("record_world_event");
  });

  it("dedupes rollback-critical post-turn proposals by idempotency key", () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 5 });

    const first = queuePostTurnSimulationProposals({
      campaignId: CAMPAIGN_ID,
      tick: 5,
      judgeProvider: provider(),
      playerLocationId: "loc-player",
      playerSceneScopeId: "scene-player",
      route: "/chat/action",
      idempotencyKey: "post-turn:campaign:turn:saga:attempt:5",
    });
    const second = queuePostTurnSimulationProposals({
      campaignId: CAMPAIGN_ID,
      tick: 5,
      judgeProvider: provider(),
      playerLocationId: "loc-player",
      playerSceneScopeId: "scene-player",
      route: "/chat/action",
      idempotencyKey: "post-turn:campaign:turn:saga:attempt:5",
    });

    expect(second.queued.map((proposal) => proposal.proposalId)).toEqual(
      first.queued.map((proposal) => proposal.proposalId),
    );
    expect(getDb().select().from(simulationJobs).all()).toHaveLength(1);
    expect(getDb().select().from(simulationJobs).all().map((job) => job.idempotencyKey).sort()).toEqual([
      "post-turn:campaign:turn:saga:attempt:5:npc_offscreen_updates:system:npc-offscreen",
    ]);
    expect(getDb().select().from(simulationProposals).all()).toHaveLength(1);
    expect(getDb().select().from(simulationProposals).all().map((proposal) => proposal.idempotencyKey).sort()).toEqual([
      "post-turn:campaign:turn:saga:attempt:5:npc_offscreen_updates:system:npc-offscreen",
    ]);
  });

  it("heals a supported crash gap when an idempotent job exists before its proposal", () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 5 });
    const jobId = queueSimulationJob({
      campaignId: CAMPAIGN_ID,
      jobType: "npc_offscreen_tick",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "npc-offscreen" },
      idempotencyKey: "post-turn:gap:5:npc_offscreen_updates:system:npc-offscreen",
      priority: 10,
      payload: { crashedAfterJobInsert: true },
    });

    const result = queuePostTurnSimulationProposals({
      campaignId: CAMPAIGN_ID,
      tick: 5,
      judgeProvider: provider(),
      playerLocationId: "loc-player",
      route: "/chat/action",
      idempotencyKey: "post-turn:gap:5",
    });

    expect(result.queued).toHaveLength(1);
    expect(result.queued[0]).toMatchObject({
      proposalType: "npc_offscreen_updates",
      status: "pending",
    });
    const jobs = getDb().select().from(simulationJobs).all();
    const proposals = getDb().select().from(simulationProposals).all();
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ id: jobId });
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({
      jobId,
      idempotencyKey: "post-turn:gap:5:npc_offscreen_updates:system:npc-offscreen",
    });

    const second = queuePostTurnSimulationProposals({
      campaignId: CAMPAIGN_ID,
      tick: 5,
      judgeProvider: provider(),
      playerLocationId: "loc-player",
      route: "/chat/action",
      idempotencyKey: "post-turn:gap:5",
    });
    expect(second.queued.map((proposal) => proposal.proposalId)).toEqual(
      result.queued.map((proposal) => proposal.proposalId),
    );
    expect(getDb().select().from(simulationJobs).all()).toHaveLength(1);
    expect(getDb().select().from(simulationProposals).all()).toHaveLength(1);
  });

  it("reuses an existing proposal row by idempotency key without payload scanning", () => {
    ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 0 });

    const first = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "npc_reflection_updates",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "test" },
      idempotencyKey: "proposal-key-1",
      summary: "First proposal.",
      writeScopes: ["npc:memory"],
      provenance: { source: "test", tick: 0, idempotencyKey: "legacy-payload-key" },
    });
    const second = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "npc_reflection_updates",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "test" },
      idempotencyKey: "proposal-key-1",
      summary: "Duplicate proposal.",
      writeScopes: ["npc:belief"],
      provenance: { source: "test", tick: 0, idempotencyKey: "different-payload-key" },
    });

    expect(second.proposalId).toBe(first.proposalId);
    expect(second.writeScopes).toEqual(["npc:memory"]);
    expect(getDb().select().from(simulationProposals).all()).toHaveLength(1);
  });

  it("rejects direct metadata-only commits and still rejects stale, conflicting, and expired proposals", () => {
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
      status: "rejected",
      reason: "proposal_commit_requires_executor_receipt",
      baseWorldVersion: 0,
    });
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({ worldVersion: 0 });

    const stale = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "faction_command_updates",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "test" },
      summary: "Faction update.",
      writeScopes: ["faction:state"],
      provenance: { source: "test", tick: 1 },
    });
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "tool:log_event",
      baseWorldVersion: 0,
      sourceEntity: { type: "player", id: "player-1" },
    });
    expect(commitSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalId: stale.proposalId,
    })).toMatchObject({
      status: "rejected",
      reason: "stale_base_world_version",
      baseWorldVersion: 0,
      currentWorldVersion: 1,
    });

    const conflicting = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "npc_offscreen_updates",
      baseWorldVersion: 1,
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
      currentWorldVersion: 1,
    });

    getDb().update(worldClocks)
      .set({ worldTimeMinutes: 10, currentTick: 10 })
      .where(eq(worldClocks.campaignId, CAMPAIGN_ID))
      .run();
    const expired = createSimulationProposal({
      campaignId: CAMPAIGN_ID,
      proposalType: "world_event",
      baseWorldVersion: 1,
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
      currentWorldVersion: 1,
    });
    expect(readWorldClock(CAMPAIGN_ID)).toMatchObject({ worldVersion: 1 });
  });
});
