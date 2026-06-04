import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  campaigns,
  narratorAttempts,
  settledTurnPackets,
} from "../../db/schema.js";
import {
  PendingNarrationError,
  TurnSagaLockConflictError,
  assertNoPendingNarrationBeforeNewTurn,
  claimTurnSagaWorker,
  createTurnSaga,
  findPendingNarrationSaga,
  getTurnSaga,
  markTurnSagaFinalized,
  persistOracleDecision,
  persistSettledTurnPacket,
  recordNarratorAttempt,
  releaseTurnSagaWorker,
  transitionTurnSagaStatus,
  type TurnSagaStatus,
} from "../turn-saga.js";

const CAMPAIGN_ID = "phase-89-runtime-resilience";

let tempDir = "";

function seedCampaign(id = CAMPAIGN_ID) {
  getDb().insert(campaigns).values({
    id,
    name: `Phase 89 Resilience ${id}`,
    premise: "Runtime resilience closeout campaign.",
    createdAt: 100,
    updatedAt: 100,
  }).run();
}

function createSaga(id: string, overrides: Partial<Parameters<typeof createTurnSaga>[0]> = {}) {
  return createTurnSaga({
    id,
    campaignId: CAMPAIGN_ID,
    turnId: `${id}-turn`,
    playerId: "player-1",
    actionId: `${id}-action`,
    actionText: "Force the sealed gate.",
    sourceAction: { playerAction: "Force the sealed gate." },
    baseWorldVersion: 10,
    provenance: { phase: "89-closeout" },
    nowMs: 1_000,
    ...overrides,
  });
}

function advanceSaga(sagaId: string, statuses: readonly TurnSagaStatus[]) {
  let nowMs = 2_000;
  for (const toStatus of statuses) {
    transitionTurnSagaStatus({
      sagaId,
      toStatus,
      reason: `phase-89:${toStatus}`,
      nowMs,
    });
    nowMs += 1;
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

function persistDecision(sagaId: string) {
  return persistOracleDecision({
    id: `${sagaId}-oracle`,
    sagaId,
    question: "Does the gate open?",
    stakes: "The hinge may alert nearby actors.",
    outcome: "mixed_success",
    reasoning: "The gate opens, but the noise matters.",
    mechanicalImplications: [{ ref: "gate:open" }],
    visibilityImplications: [{ route: "nearby", visible: true }],
    requiresToolCommit: true,
    baseWorldVersion: 10,
    acceptedWorldVersion: 11,
    sourceRefs: ["gm-read"],
    decision: { roll: 48 },
    nowMs: 3_000,
  });
}

function persistPacket(sagaId: string, lockToken = `${sagaId}-packet-lock`) {
  claimTurnSagaWorker({
    sagaId,
    workerId: `${sagaId}-packet-worker`,
    lockToken,
    allowStaleReclaim: false,
    nowMs: 3_500,
  });
  const packet = persistSettledTurnPacket({
    id: `${sagaId}-packet`,
    sagaId,
    lockToken,
    oracleDecisionId: `${sagaId}-oracle`,
    canonicalTurnPacket: { resolution: "gate-open-noisy" },
    narratorPacket: { visibleEvents: ["The gate opens with a shriek."] },
    sourceRefs: ["gm-read", "tool-loop"],
    acceptedToolResultRefs: ["tool-result:gate"],
    acceptedActorResultRefs: ["actor-result:nearby"],
    dueWorldRefs: ["thread:watch"],
    baseWorldVersion: 10,
    resultWorldVersion: 11,
    requiresNarration: true,
    nowMs: 3_600,
  });
  releaseTurnSagaWorker({
    sagaId,
    lockToken,
    nowMs: 3_700,
  });
  return packet;
}

describe("Phase 89 runtime resilience closeout", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-phase-89-resilience-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("blocks new paid turns until pending narration is finalized, then clears the barrier", () => {
    const saga = createSaga("p89-pending-barrier");
    advanceToWorldConsequence(saga.id);
    persistDecision(saga.id);
    persistPacket(saga.id);

    expect(findPendingNarrationSaga({ campaignId: CAMPAIGN_ID })).toMatchObject({
      id: saga.id,
      status: "resolved_pending_narration",
      settledTurnPacketId: `${saga.id}-packet`,
    });
    expect(() =>
      assertNoPendingNarrationBeforeNewTurn({ campaignId: CAMPAIGN_ID }),
    ).toThrow(PendingNarrationError);

    transitionTurnSagaStatus({
      sagaId: saga.id,
      toStatus: "narrator_rendering",
      nowMs: 4_000,
    });
    const attempt = recordNarratorAttempt({
      id: `${saga.id}-attempt`,
      sagaId: saga.id,
      status: "succeeded",
      finalText: "The gate opens with a shriek.",
      nowMs: 4_100,
    });
    markTurnSagaFinalized({
      sagaId: saga.id,
      narratorAttemptId: attempt.id,
      reason: "Phase 89 closeout finalized.",
      nowMs: 4_200,
    });

    expect(findPendingNarrationSaga({ campaignId: CAMPAIGN_ID })).toBeNull();
    expect(() =>
      assertNoPendingNarrationBeforeNewTurn({ campaignId: CAMPAIGN_ID }),
    ).not.toThrow();
  });

  it("treats paid pre-packet world-consequence work as a blocking pending boundary", () => {
    const saga = createSaga("p89-pre-packet", { requiresNarration: false });
    advanceToWorldConsequence(saga.id);
    persistDecision(saga.id);

    const pending = findPendingNarrationSaga({ campaignId: CAMPAIGN_ID });

    expect(pending).toMatchObject({
      id: saga.id,
      status: "world_consequence_running",
      oracleDecisionId: `${saga.id}-oracle`,
      settledTurnPacketId: null,
      requiresNarration: false,
    });
    expect(getDb().select().from(settledTurnPackets).all()).toHaveLength(0);
    expect(() =>
      assertNoPendingNarrationBeforeNewTurn({ campaignId: CAMPAIGN_ID }),
    ).toThrow(PendingNarrationError);
  });

  it("fences stale narrator workers after recovery reclaims the saga lock", () => {
    const saga = createSaga("p89-fenced-recovery");
    advanceToWorldConsequence(saga.id);
    persistDecision(saga.id);
    const packet = persistPacket(saga.id);

    claimTurnSagaWorker({
      sagaId: saga.id,
      workerId: "stale-narrator",
      lockToken: "stale-lock",
      staleAfterMs: 300_000,
      nowMs: 4_000,
    });
    const recovery = claimTurnSagaWorker({
      sagaId: saga.id,
      workerId: "recovery-narrator",
      lockToken: "recovery-lock",
      staleAfterMs: 300_000,
      nowMs: 304_001,
    });
    transitionTurnSagaStatus({
      sagaId: saga.id,
      toStatus: "narrator_rendering",
      lockToken: recovery.lockToken,
      nowMs: 304_002,
    });

    expect(() =>
      recordNarratorAttempt({
        id: `${saga.id}-stale-attempt`,
        sagaId: saga.id,
        settledTurnPacketId: packet.id,
        status: "succeeded",
        finalText: "Stale narration should not land.",
        lockToken: "stale-lock",
        nowMs: 304_003,
      }),
    ).toThrow(TurnSagaLockConflictError);
    expect(getDb().select().from(narratorAttempts).all()).toHaveLength(0);

    const attempt = recordNarratorAttempt({
      id: `${saga.id}-fresh-attempt`,
      sagaId: saga.id,
      settledTurnPacketId: packet.id,
      status: "succeeded",
      finalText: "Recovered narration lands once.",
      lockToken: recovery.lockToken,
      nowMs: 304_004,
    });
    expect(() =>
      markTurnSagaFinalized({
        sagaId: saga.id,
        narratorAttemptId: attempt.id,
        lockToken: "stale-lock",
        nowMs: 304_005,
      }),
    ).toThrow(TurnSagaLockConflictError);

    const finalized = markTurnSagaFinalized({
      sagaId: saga.id,
      narratorAttemptId: attempt.id,
      lockToken: recovery.lockToken,
      reason: "Recovered narrator completed final prose.",
      nowMs: 304_006,
    });

    expect(finalized).toMatchObject({
      status: "finalized",
      latestNarratorAttemptId: attempt.id,
      activeLockToken: null,
      activeWorkerId: null,
    });
    expect(getTurnSaga({ sagaId: saga.id })?.latestNarratorAttemptId).toBe(attempt.id);
  });
});
