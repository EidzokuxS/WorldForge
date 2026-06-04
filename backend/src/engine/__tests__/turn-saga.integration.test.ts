import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  campaigns,
  narratorAttempts,
  oracleDecisions,
  settledTurnPackets,
} from "../../db/schema.js";
import {
  claimTurnSagaWorker,
  createTurnSaga,
  getSettledTurnPacket,
  getTurnSaga,
  markTurnSagaFinalized,
  persistOracleDecision,
  persistSettledTurnPacket,
  recordNarratorAttempt,
  releaseTurnSagaWorker,
  transitionTurnSagaStatus,
  type TurnSagaStatus,
} from "../turn-saga.js";

const CAMPAIGN_ID = "turn-saga-integration-campaign";

let tempDir = "";

function seedCampaign() {
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Saga Integration",
    premise: "Durable turn resolution test.",
    createdAt: 100,
    updatedAt: 100,
  }).run();
}

function advanceSaga(sagaId: string, statuses: readonly TurnSagaStatus[]) {
  for (const toStatus of statuses) {
    transitionTurnSagaStatus({ sagaId, toStatus });
  }
}

function advanceToWorldConsequence(sagaId: string) {
  advanceSaga(sagaId, [
    "collecting_context",
    "pre_turn_catchup",
    "gm_reading",
    "oracle_adjudicating",
    "tool_loop_running",
    "local_reaction_running",
    "world_consequence_running",
  ]);
}

describe("turn saga processor boundary integration", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-turn-saga-integration-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("keeps accepted OracleDecision and SettledTurnPacket durable after narrator failure", () => {
    const saga = createTurnSaga({
      id: "saga-durable-failure",
      campaignId: CAMPAIGN_ID,
      turnId: "turn-durable-failure",
      actionText: "Force the gate.",
      baseWorldVersion: 0,
      requiresNarration: false,
    });
    advanceToWorldConsequence(saga.id);
    const decision = persistOracleDecision({
      id: "oracle-durable-failure",
      sagaId: saga.id,
      question: "Does the gate give?",
      stakes: "The gate may open loudly.",
      outcome: "mixed_success",
      reasoning: "Accepted Oracle result.",
      requiresToolCommit: true,
      baseWorldVersion: 0,
      acceptedWorldVersion: 0,
      sourceRefs: ["gm-read:evidence"],
      decision: { outcome: "mixed_success" },
    });
    claimTurnSagaWorker({
      sagaId: saga.id,
      workerId: "integration-live-worker",
      lockToken: "integration-live-lock",
      allowStaleReclaim: false,
    });
    const packet = persistSettledTurnPacket({
      id: "packet-durable-failure",
      sagaId: saga.id,
      lockToken: "integration-live-lock",
      oracleDecisionId: decision.id,
      canonicalTurnPacket: { turnId: "turn-durable-failure" },
      narratorPacket: { playerAction: "Force the gate.", visibleActors: [] },
      acceptedToolResultRefs: ["tool-result:gate"],
      baseWorldVersion: 0,
      resultWorldVersion: 0,
      requiresNarration: true,
    });
    releaseTurnSagaWorker({
      sagaId: saga.id,
      lockToken: "integration-live-lock",
    });
    transitionTurnSagaStatus({
      sagaId: saga.id,
      toStatus: "narrator_rendering",
    });
    recordNarratorAttempt({
      sagaId: saga.id,
      settledTurnPacketId: packet.id,
      status: "failed",
      groundingResult: { ok: false },
      failureReason: "Packet guard rejected final narration.",
    });

    expect(getDb().select().from(oracleDecisions).all()).toHaveLength(1);
    expect(getDb().select().from(settledTurnPackets).all()).toHaveLength(1);
    expect(getDb().select().from(narratorAttempts).all()).toHaveLength(1);
    expect(getSettledTurnPacket({ campaignId: CAMPAIGN_ID, turnId: "turn-durable-failure" })).toMatchObject({
      id: "packet-durable-failure",
      oracleDecisionId: "oracle-durable-failure",
      acceptedToolResultRefs: ["tool-result:gate"],
    });
    expect(getTurnSaga({ sagaId: saga.id })?.status).toBe("narrator_rendering");
  });

  it("finalizes clarification-style no-narration turns without a settled packet", () => {
    const saga = createTurnSaga({
      id: "saga-clarification-integration",
      campaignId: CAMPAIGN_ID,
      turnId: "turn-clarification-integration",
      baseWorldVersion: 0,
      requiresNarration: false,
    });
    advanceToWorldConsequence(saga.id);

    const finalized = markTurnSagaFinalized({
      sagaId: saga.id,
      reason: "Clarification returned without settled packet.",
    });

    expect(finalized.status).toBe("finalized");
    expect(finalized.settledTurnPacketId).toBeNull();
    expect(
      getDb()
        .select()
        .from(settledTurnPackets)
        .where(eq(settledTurnPackets.sagaId, saga.id))
        .all(),
    ).toHaveLength(0);
  });
});
