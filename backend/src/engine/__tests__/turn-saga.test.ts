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
  turnSagas,
} from "../../db/schema.js";
import {
  PendingNarrationError,
  TurnSagaLockConflictError,
  TurnSagaTransitionError,
  assertNoPendingNarrationBeforeNewTurn,
  claimTurnSagaWorker,
  createTurnSaga,
  findPendingNarrationSaga,
  findLatestSuccessfulNarratorAttempt,
  getSettledTurnPacket,
  getTurnSaga,
  heartbeatTurnSagaWorker,
  markTurnSagaFailedStateCorruption,
  markTurnSagaFinalized,
  markTurnSagaFinalizedIfNeeded,
  mergeTurnSagaProvenance,
  persistOracleDecision,
  persistSettledTurnPacket,
  recordNarratorAttempt,
  releaseTurnSagaWorker,
  transitionTurnSagaStatus,
  type TurnSagaStatus,
} from "../turn-saga.js";

const CAMPAIGN_ID = "turn-saga-campaign";
const OTHER_CAMPAIGN_ID = "turn-saga-other-campaign";

let tempDir = "";

function seedCampaign(id = CAMPAIGN_ID) {
  getDb().insert(campaigns).values({
    id,
    name: `Saga Test ${id}`,
    premise: "A deterministic saga test campaign.",
    createdAt: 100,
    updatedAt: 100,
  }).run();
}

function createSaga(id: string, turnId = id) {
  return createTurnSaga({
    id,
    campaignId: CAMPAIGN_ID,
    turnId,
    playerId: "player-1",
    actionId: `${turnId}-action`,
    actionText: "Open the sealed door.",
    sourceAction: { verb: "open", object: "sealed-door" },
    baseWorldVersion: 10,
    provenance: { report: "v5-runtime" },
    nowMs: 1_000,
  });
}

function advanceSaga(
  sagaId: string,
  statuses: readonly TurnSagaStatus[],
  startMs = 2_000,
) {
  let index = 0;
  for (const toStatus of statuses) {
    transitionTurnSagaStatus({
      sagaId,
      toStatus,
      reason: `advance:${toStatus}`,
      nowMs: startMs + index,
    });
    index += 1;
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

function persistDecision(sagaId: string, id = `${sagaId}-oracle`) {
  return persistOracleDecision({
    id,
    sagaId,
    question: "Does the sealed door open?",
    stakes: "Noise may alert the watch.",
    outcome: "mixed_success",
    reasoning: "The lock gives, but the hinge shrieks.",
    mechanicalImplications: [{ ref: "condition:door-open" }],
    visibilityImplications: [{ route: "audible", range: "nearby" }],
    confidence: 82,
    chance: 65,
    requiresToolCommit: true,
    baseWorldVersion: 10,
    acceptedWorldVersion: 11,
    sourceRefs: ["gm-read-1"],
    decision: { roll: 42 },
    nowMs: 3_000,
  });
}

function persistPacket(
  sagaId: string,
  oracleDecisionId: string | null = `${sagaId}-oracle`,
  overrides: Partial<Parameters<typeof persistSettledTurnPacket>[0]> = {},
) {
  const lockToken = overrides.lockToken ?? `${sagaId}-packet-lock`;
  claimTurnSagaWorker({
    sagaId,
    workerId: `${sagaId}-packet-worker`,
    lockToken,
    allowStaleReclaim: false,
    nowMs: 3_900,
  });
  const packet = persistSettledTurnPacket({
    id: `${sagaId}-packet`,
    sagaId,
    lockToken,
    oracleDecisionId,
    canonicalTurnPacket: {
      turnId: sagaId,
      resolution: "door opens with noise",
    },
    narratorPacket: {
      visibleEvents: ["The door opens.", "The hinge shrieks."],
    },
    sourceRefs: ["gm-read-1", "tool-loop-1"],
    acceptedToolResultRefs: ["tool-result-1"],
    acceptedActorResultRefs: ["actor-result-1"],
    dueWorldRefs: ["thread-1"],
    baseWorldVersion: 10,
    resultWorldVersion: 11,
    nowMs: 4_000,
    ...overrides,
  });
  releaseTurnSagaWorker({
    sagaId,
    lockToken,
    nowMs: 4_001,
  });
  return packet;
}

describe("turn saga persistence", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-turn-saga-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
    seedCampaign(OTHER_CAMPAIGN_ID);
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("allows the full D-03 lifecycle with settled narration boundary", () => {
    createSaga("saga-legal", "turn-legal");
    advanceToWorldConsequence("saga-legal");
    persistDecision("saga-legal");
    persistPacket("saga-legal");

    transitionTurnSagaStatus({
      sagaId: "saga-legal",
      toStatus: "narrator_rendering",
      nowMs: 5_001,
    });
    recordNarratorAttempt({
      id: "saga-legal-attempt-1",
      sagaId: "saga-legal",
      status: "failed",
      groundingResult: { ok: false, missingRefs: ["tool-result-1"] },
      failureReason: "Grounding mismatch.",
      nowMs: 5_002,
    });
    transitionTurnSagaStatus({
      sagaId: "saga-legal",
      toStatus: "narrator_repairing",
      nowMs: 5_003,
    });
    const success = recordNarratorAttempt({
      id: "saga-legal-attempt-2",
      sagaId: "saga-legal",
      status: "succeeded",
      groundingResult: { ok: true },
      finalText: "The sealed door opens with a shriek.",
      nowMs: 5_004,
    });

    const finalized = markTurnSagaFinalized({
      sagaId: "saga-legal",
      narratorAttemptId: success.id,
      nowMs: 5_005,
    });

    expect(finalized.status).toBe("finalized");
    expect(finalized.settledTurnPacketId).toBe("saga-legal-packet");
    expect(finalized.latestNarratorAttemptId).toBe("saga-legal-attempt-2");
  });

  it("finalizes first-pass narrator success directly from narrator_rendering", () => {
    createSaga("saga-first-pass", "turn-first-pass");
    advanceToWorldConsequence("saga-first-pass");
    persistDecision("saga-first-pass");
    persistPacket("saga-first-pass");
    transitionTurnSagaStatus({
      sagaId: "saga-first-pass",
      toStatus: "narrator_rendering",
      nowMs: 5_000,
    });
    const attempt = recordNarratorAttempt({
      id: "saga-first-pass-attempt",
      sagaId: "saga-first-pass",
      status: "succeeded",
      groundingResult: { ok: true },
      finalText: "The sealed door opens on the first telling.",
      nowMs: 5_001,
    });

    const finalized = markTurnSagaFinalized({
      sagaId: "saga-first-pass",
      nowMs: 5_002,
    });

    expect(finalized.status).toBe("finalized");
    expect(finalized.latestNarratorAttemptId).toBe(attempt.id);
    expect(findPendingNarrationSaga({ campaignId: CAMPAIGN_ID })).toBeNull();
  });

  it("rejects finalization without successful final prose and remains pending", () => {
    createSaga("saga-no-prose", "turn-no-prose");
    advanceToWorldConsequence("saga-no-prose");
    persistDecision("saga-no-prose");
    persistPacket("saga-no-prose");
    transitionTurnSagaStatus({
      sagaId: "saga-no-prose",
      toStatus: "narrator_rendering",
      nowMs: 5_000,
    });
    recordNarratorAttempt({
      id: "saga-no-prose-attempt",
      sagaId: "saga-no-prose",
      status: "failed",
      groundingResult: { ok: false },
      failureReason: "Grounding mismatch.",
      nowMs: 5_001,
    });

    expect(() =>
      markTurnSagaFinalized({
        sagaId: "saga-no-prose",
        nowMs: 5_002,
      }),
    ).toThrow(/not a successful final-prose attempt/);

    expect(getTurnSaga({ sagaId: "saga-no-prose" })?.status).toBe(
      "narrator_rendering",
    );
    expect(findPendingNarrationSaga({ campaignId: CAMPAIGN_ID })?.id).toBe(
      "saga-no-prose",
    );
  });

  it("rejects skipped transitions to narrator rendering or finalized before settled resolution", () => {
    createSaga("saga-skip", "turn-skip");
    advanceToWorldConsequence("saga-skip");

    expect(() =>
      transitionTurnSagaStatus({
        sagaId: "saga-skip",
        toStatus: "narrator_rendering",
        nowMs: 5_000,
      }),
    ).toThrow(TurnSagaTransitionError);

    expect(() =>
      transitionTurnSagaStatus({
        sagaId: "saga-skip",
        toStatus: "finalized",
        nowMs: 5_001,
      }),
    ).toThrow(TurnSagaTransitionError);

    expect(getTurnSaga({ sagaId: "saga-skip" })?.status).toBe(
      "world_consequence_running",
    );
  });

  it("rejects settled packets before world consequences have accepted resolution", () => {
    createSaga("saga-created", "turn-created");
    expect(() => persistPacket("saga-created", null)).toThrow(
      TurnSagaTransitionError,
    );

    createSaga("saga-gm", "turn-gm");
    advanceSaga("saga-gm", [
      "collecting_context",
      "pre_turn_catchup",
      "gm_reading",
    ]);
    expect(() => persistPacket("saga-gm", null)).toThrow(
      TurnSagaTransitionError,
    );

    expect(getDb().select().from(settledTurnPackets).all()).toHaveLength(0);
  });

  it("persists OracleDecision before narration and keeps it independent", () => {
    createSaga("saga-oracle", "turn-oracle");
    advanceSaga("saga-oracle", [
      "collecting_context",
      "pre_turn_catchup",
      "gm_reading",
      "oracle_adjudicating",
    ]);

    const decision = persistDecision("saga-oracle");

    expect(decision).toMatchObject({
      id: "saga-oracle-oracle",
      sagaId: "saga-oracle",
      turnId: "turn-oracle",
      outcome: "mixed_success",
      baseWorldVersion: 10,
      acceptedWorldVersion: 11,
      sourceRefs: ["gm-read-1"],
    });
    expect(decision.mechanicalImplications).toEqual([
      { ref: "condition:door-open" },
    ]);
    expect(getTurnSaga({ sagaId: "saga-oracle" })?.oracleDecisionId).toBe(
      "saga-oracle-oracle",
    );
    expect(findPendingNarrationSaga({ campaignId: CAMPAIGN_ID })).toBeNull();
    expect(getDb().select().from(oracleDecisions).all()).toHaveLength(1);
    expect(getDb().select().from(narratorAttempts).all()).toHaveLength(0);
  });

  it("persists SettledTurnPacket and finds it by campaign turn", () => {
    createSaga("saga-packet", "turn-packet");
    advanceToWorldConsequence("saga-packet");
    persistDecision("saga-packet");

    const packet = persistPacket("saga-packet");
    const byCampaignTurn = getSettledTurnPacket({
      campaignId: CAMPAIGN_ID,
      turnId: "turn-packet",
    });
    const saga = getTurnSaga({ sagaId: "saga-packet" });

    expect(packet).toMatchObject({
      id: "saga-packet-packet",
      sagaId: "saga-packet",
      oracleDecisionId: "saga-packet-oracle",
      baseWorldVersion: 10,
      resultWorldVersion: 11,
      sourceRefs: ["gm-read-1", "tool-loop-1"],
      acceptedToolResultRefs: ["tool-result-1"],
      acceptedActorResultRefs: ["actor-result-1"],
      dueWorldRefs: ["thread-1"],
    });
    expect(byCampaignTurn?.canonicalTurnPacket).toEqual({
      turnId: "saga-packet",
      resolution: "door opens with noise",
    });
    expect(saga?.settledTurnPacketId).toBe("saga-packet-packet");
    expect(saga?.status).toBe("resolved_pending_narration");
    expect(saga?.statusUpdatedAt).toBe(4_000);
    expect(getSettledTurnPacket({
      packetId: packet.id,
      campaignId: CAMPAIGN_ID,
    })?.id).toBe(packet.id);
    expect(getSettledTurnPacket({
      packetId: packet.id,
      campaignId: OTHER_CAMPAIGN_ID,
    })).toBeNull();
    expect(getSettledTurnPacket({
      sagaId: "saga-packet",
      campaignId: OTHER_CAMPAIGN_ID,
    })).toBeNull();
    expect(getDb().select().from(settledTurnPackets).all()).toHaveLength(1);
  });

  it("requires the active worker lock token to persist a settled packet", () => {
    createSaga("saga-packet-fence", "turn-packet-fence");
    advanceToWorldConsequence("saga-packet-fence");
    persistDecision("saga-packet-fence");
    claimTurnSagaWorker({
      sagaId: "saga-packet-fence",
      workerId: "live-worker",
      lockToken: "live-lock",
      allowStaleReclaim: false,
      nowMs: 3_900,
    });

    expect(() =>
      persistSettledTurnPacket({
        id: "saga-packet-fence-stale-packet",
        sagaId: "saga-packet-fence",
        lockToken: "stale-lock",
        oracleDecisionId: "saga-packet-fence-oracle",
        canonicalTurnPacket: { turnId: "turn-packet-fence" },
        narratorPacket: { playerAction: "Force the gate." },
        baseWorldVersion: 10,
        resultWorldVersion: 11,
        nowMs: 4_000,
      }),
    ).toThrow(TurnSagaLockConflictError);
    expect(getDb().select().from(settledTurnPackets).all()).toHaveLength(0);
    expect(getTurnSaga({ sagaId: "saga-packet-fence" })).toMatchObject({
      status: "world_consequence_running",
      settledTurnPacketId: null,
      activeLockToken: "live-lock",
    });

    const packet = persistSettledTurnPacket({
      id: "saga-packet-fence-packet",
      sagaId: "saga-packet-fence",
      lockToken: "live-lock",
      oracleDecisionId: "saga-packet-fence-oracle",
      canonicalTurnPacket: { turnId: "turn-packet-fence" },
      narratorPacket: { playerAction: "Force the gate." },
      baseWorldVersion: 10,
      resultWorldVersion: 11,
      nowMs: 4_001,
    });

    expect(packet.id).toBe("saga-packet-fence-packet");
    expect(getTurnSaga({ sagaId: "saga-packet-fence" })).toMatchObject({
      status: "resolved_pending_narration",
      settledTurnPacketId: "saga-packet-fence-packet",
      activeLockToken: "live-lock",
    });
  });

  it("finds pending narration immediately after packet persistence by campaign", () => {
    createSaga("saga-pending", "turn-pending");
    advanceToWorldConsequence("saga-pending");
    persistDecision("saga-pending");
    persistPacket("saga-pending");

    const otherSaga = createTurnSaga({
      id: "saga-other",
      campaignId: OTHER_CAMPAIGN_ID,
      turnId: "turn-other",
      baseWorldVersion: 10,
      nowMs: 1_500,
    });
    const pending = findPendingNarrationSaga({ campaignId: CAMPAIGN_ID });

    expect(pending).toMatchObject({
      id: "saga-pending",
      status: "resolved_pending_narration",
    });
    expect(findPendingNarrationSaga({ campaignId: OTHER_CAMPAIGN_ID })).toBeNull();
    expect(otherSaga.status).toBe("created");
    expect(() =>
      assertNoPendingNarrationBeforeNewTurn({ campaignId: CAMPAIGN_ID }),
    ).toThrow(PendingNarrationError);
  });

  it("blocks a live-locked world consequence turn before settled packet persistence", () => {
    const saga = createTurnSaga({
      id: "saga-live-lock-before-packet",
      campaignId: CAMPAIGN_ID,
      turnId: "turn-live-lock-before-packet",
      actionText: "Force the gate.",
      baseWorldVersion: 10,
      requiresNarration: false,
      nowMs: 1_100,
    });
    advanceToWorldConsequence(saga.id);
    claimTurnSagaWorker({
      sagaId: saga.id,
      workerId: "live-turn-narration:worker",
      lockToken: "live-turn-narration-lock",
      allowStaleReclaim: false,
      nowMs: 4_000,
    });

    const pending = findPendingNarrationSaga({ campaignId: CAMPAIGN_ID });

    expect(pending).toMatchObject({
      id: saga.id,
      status: "world_consequence_running",
      requiresNarration: false,
      activeLockToken: "live-turn-narration-lock",
    });
    expect(getDb().select().from(settledTurnPackets).all()).toHaveLength(0);
    expect(() =>
      assertNoPendingNarrationBeforeNewTurn({ campaignId: CAMPAIGN_ID }),
    ).toThrow(PendingNarrationError);
  });

  it("blocks a paid world consequence turn before settled packet persistence", () => {
    const saga = createTurnSaga({
      id: "saga-paid-before-packet",
      campaignId: CAMPAIGN_ID,
      turnId: "turn-paid-before-packet",
      actionText: "Force the gate.",
      baseWorldVersion: 10,
      requiresNarration: false,
      nowMs: 1_150,
    });
    advanceToWorldConsequence(saga.id);
    persistDecision(saga.id, "saga-paid-before-packet-oracle");

    const pending = findPendingNarrationSaga({ campaignId: CAMPAIGN_ID });

    expect(pending).toMatchObject({
      id: saga.id,
      status: "world_consequence_running",
      requiresNarration: false,
      oracleDecisionId: "saga-paid-before-packet-oracle",
    });
    expect(getDb().select().from(settledTurnPackets).all()).toHaveLength(0);
    expect(() =>
      assertNoPendingNarrationBeforeNewTurn({ campaignId: CAMPAIGN_ID }),
    ).toThrow(PendingNarrationError);
  });

  it("claims pending narration with a worker lock and refuses a second active worker", () => {
    createSaga("saga-claim", "turn-claim");
    advanceToWorldConsequence("saga-claim");
    persistDecision("saga-claim");
    persistPacket("saga-claim");

    const claimed = claimTurnSagaWorker({
      sagaId: "saga-claim",
      workerId: "worker-1",
      lockToken: "lock-1",
      nowMs: 5_000,
    });

    expect(claimed.saga.activeLockToken).toBe("lock-1");
    expect(claimed.saga.activeWorkerId).toBe("worker-1");
    expect(() =>
      claimTurnSagaWorker({
        sagaId: "saga-claim",
        workerId: "worker-2",
        lockToken: "lock-2",
        nowMs: 5_100,
      }),
    ).toThrow(TurnSagaLockConflictError);

    const released = releaseTurnSagaWorker({
      sagaId: "saga-claim",
      lockToken: "lock-1",
      nowMs: 5_200,
    });
    expect(released.activeLockToken).toBeNull();

    expect(claimTurnSagaWorker({
      sagaId: "saga-claim",
      workerId: "worker-2",
      lockToken: "lock-2",
      nowMs: 5_300,
    }).saga.activeWorkerId).toBe("worker-2");
  });

  it("refuses to reclaim a very old active resume lock when stale reclaim is disabled", () => {
    createSaga("saga-stale-lock", "turn-stale-lock");
    advanceToWorldConsequence("saga-stale-lock");
    persistDecision("saga-stale-lock");
    persistPacket("saga-stale-lock");

    claimTurnSagaWorker({
      sagaId: "saga-stale-lock",
      workerId: "worker-1",
      lockToken: "lock-1",
      nowMs: 1_000,
    });

    expect(() =>
      claimTurnSagaWorker({
        sagaId: "saga-stale-lock",
        workerId: "worker-2",
        lockToken: "lock-2",
        allowStaleReclaim: false,
        nowMs: 60 * 60_000,
      }),
    ).toThrow(TurnSagaLockConflictError);

    expect(getTurnSaga({ sagaId: "saga-stale-lock" })).toMatchObject({
      activeLockToken: "lock-1",
      activeWorkerId: "worker-1",
    });
  });

  it("uses heartbeat freshness for abandoned-worker recovery rather than original claim age", () => {
    createSaga("saga-heartbeat-lock", "turn-heartbeat-lock");
    advanceToWorldConsequence("saga-heartbeat-lock");
    persistDecision("saga-heartbeat-lock");
    persistPacket("saga-heartbeat-lock");

    claimTurnSagaWorker({
      sagaId: "saga-heartbeat-lock",
      workerId: "worker-1",
      lockToken: "lock-1",
      staleAfterMs: 300_000,
      nowMs: 1_000,
    });
    const refreshed = heartbeatTurnSagaWorker({
      sagaId: "saga-heartbeat-lock",
      lockToken: "lock-1",
      nowMs: 290_000,
    });

    expect(refreshed.activeStartedAt).toBe(290_000);
    expect(() =>
      claimTurnSagaWorker({
        sagaId: "saga-heartbeat-lock",
        workerId: "worker-2",
        lockToken: "lock-2",
        staleAfterMs: 300_000,
        nowMs: 301_001,
      }),
    ).toThrow(TurnSagaLockConflictError);

    const reclaimed = claimTurnSagaWorker({
      sagaId: "saga-heartbeat-lock",
      workerId: "worker-2",
      lockToken: "lock-2",
      staleAfterMs: 300_000,
      nowMs: 590_001,
    });
    expect(reclaimed.saga).toMatchObject({
      activeLockToken: "lock-2",
      activeWorkerId: "worker-2",
    });
  });

  it("allows crash recovery after an abandoned lock stops heartbeating", () => {
    createSaga("saga-abandoned-lock", "turn-abandoned-lock");
    advanceToWorldConsequence("saga-abandoned-lock");
    persistDecision("saga-abandoned-lock");
    persistPacket("saga-abandoned-lock");

    claimTurnSagaWorker({
      sagaId: "saga-abandoned-lock",
      workerId: "crashed-worker",
      lockToken: "dead-lock",
      staleAfterMs: 300_000,
      nowMs: 1_000,
    });

    const reclaimed = claimTurnSagaWorker({
      sagaId: "saga-abandoned-lock",
      workerId: "recovery-worker",
      lockToken: "recovery-lock",
      staleAfterMs: 300_000,
      nowMs: 301_001,
    });

    expect(reclaimed.saga).toMatchObject({
      activeLockToken: "recovery-lock",
      activeWorkerId: "recovery-worker",
    });
  });

  it("fences resume writes when a stale worker loses its lock token", () => {
    createSaga("saga-fenced-stale", "turn-fenced-stale");
    advanceToWorldConsequence("saga-fenced-stale");
    persistDecision("saga-fenced-stale");
    persistPacket("saga-fenced-stale");
    transitionTurnSagaStatus({
      sagaId: "saga-fenced-stale",
      toStatus: "narrator_rendering",
      nowMs: 2_500,
    });
    claimTurnSagaWorker({
      sagaId: "saga-fenced-stale",
      workerId: "stale-worker",
      lockToken: "stale-lock",
      staleAfterMs: 300_000,
      nowMs: 3_000,
    });
    claimTurnSagaWorker({
      sagaId: "saga-fenced-stale",
      workerId: "fresh-worker",
      lockToken: "fresh-lock",
      staleAfterMs: 300_000,
      nowMs: 303_001,
    });

    expect(() =>
      recordNarratorAttempt({
        id: "stale-attempt",
        sagaId: "saga-fenced-stale",
        status: "succeeded",
        finalText: "This stale prose must not persist.",
        lockToken: "stale-lock",
        nowMs: 303_002,
      }),
    ).toThrow(TurnSagaLockConflictError);
    expect(getDb()
      .select()
      .from(narratorAttempts)
      .where(eq(narratorAttempts.id, "stale-attempt"))
      .get()).toBeUndefined();

    const freshAttempt = recordNarratorAttempt({
      id: "fresh-attempt",
      sagaId: "saga-fenced-stale",
      status: "succeeded",
      finalText: "Fresh worker owns the narration.",
      lockToken: "fresh-lock",
      nowMs: 303_003,
    });
    expect(() =>
      mergeTurnSagaProvenance({
        sagaId: "saga-fenced-stale",
        patch: { pendingNarrationResume: { assistantAppend: { narratorAttemptId: "stale-attempt" } } },
        lockToken: "stale-lock",
        nowMs: 303_004,
      }),
    ).toThrow(TurnSagaLockConflictError);
    expect(() =>
      markTurnSagaFinalized({
        sagaId: "saga-fenced-stale",
        narratorAttemptId: freshAttempt.id,
        lockToken: "stale-lock",
        nowMs: 303_005,
      }),
    ).toThrow(TurnSagaLockConflictError);
    expect(getTurnSaga({ sagaId: "saga-fenced-stale" })).toMatchObject({
      status: "narrator_rendering",
      activeLockToken: "fresh-lock",
      latestNarratorAttemptId: freshAttempt.id,
    });
  });

  it("uses activeStartedAt as heartbeat so fresh workers cannot be reclaimed", () => {
    createSaga("saga-fresh-heartbeat", "turn-fresh-heartbeat");
    advanceToWorldConsequence("saga-fresh-heartbeat");
    persistDecision("saga-fresh-heartbeat");
    persistPacket("saga-fresh-heartbeat");

    claimTurnSagaWorker({
      sagaId: "saga-fresh-heartbeat",
      workerId: "worker-1",
      lockToken: "lock-1",
      nowMs: 1_000,
    });
    const heartbeat = heartbeatTurnSagaWorker({
      sagaId: "saga-fresh-heartbeat",
      lockToken: "lock-1",
      nowMs: 60_000,
    });

    expect(heartbeat.activeStartedAt).toBe(60_000);
    expect(() =>
      claimTurnSagaWorker({
        sagaId: "saga-fresh-heartbeat",
        workerId: "worker-2",
        lockToken: "lock-2",
        staleAfterMs: 60_000,
        nowMs: 119_999,
      }),
    ).toThrow(TurnSagaLockConflictError);
    expect(getTurnSaga({ sagaId: "saga-fresh-heartbeat" })).toMatchObject({
      activeLockToken: "lock-1",
      activeWorkerId: "worker-1",
      activeStartedAt: 60_000,
    });
  });

  it("reclaims a lock only after the heartbeat is abandoned", () => {
    createSaga("saga-abandoned-heartbeat", "turn-abandoned-heartbeat");
    advanceToWorldConsequence("saga-abandoned-heartbeat");
    persistDecision("saga-abandoned-heartbeat");
    persistPacket("saga-abandoned-heartbeat");

    claimTurnSagaWorker({
      sagaId: "saga-abandoned-heartbeat",
      workerId: "worker-1",
      lockToken: "lock-1",
      nowMs: 1_000,
    });
    heartbeatTurnSagaWorker({
      sagaId: "saga-abandoned-heartbeat",
      lockToken: "lock-1",
      nowMs: 10_000,
    });

    const reclaimed = claimTurnSagaWorker({
      sagaId: "saga-abandoned-heartbeat",
      workerId: "worker-2",
      lockToken: "lock-2",
      staleAfterMs: 60_000,
      nowMs: 70_001,
    });

    expect(reclaimed.saga).toMatchObject({
      activeLockToken: "lock-2",
      activeWorkerId: "worker-2",
      activeStartedAt: 70_001,
    });
  });

  it("rejects wrong lock tokens for narrator attempts, provenance checkpoints, and finalization", () => {
    createSaga("saga-fenced-writes", "turn-fenced-writes");
    advanceToWorldConsequence("saga-fenced-writes");
    persistDecision("saga-fenced-writes");
    persistPacket("saga-fenced-writes");
    claimTurnSagaWorker({
      sagaId: "saga-fenced-writes",
      workerId: "worker-1",
      lockToken: "lock-good",
      nowMs: 5_000,
    });
    transitionTurnSagaStatus({
      sagaId: "saga-fenced-writes",
      toStatus: "narrator_rendering",
      lockToken: "lock-good",
      nowMs: 5_001,
    });

    expect(() =>
      recordNarratorAttempt({
        id: "saga-fenced-writes-stale-attempt",
        sagaId: "saga-fenced-writes",
        status: "succeeded",
        finalText: "Stale prose should not persist.",
        lockToken: "lock-stale",
        nowMs: 5_002,
      }),
    ).toThrow(TurnSagaLockConflictError);
    expect(getDb().select().from(narratorAttempts).all()).toHaveLength(0);

    expect(() =>
      mergeTurnSagaProvenance({
        sagaId: "saga-fenced-writes",
        patch: { pendingNarrationResume: { assistantAppend: { narratorAttemptId: "stale" } } },
        lockToken: "lock-stale",
        nowMs: 5_003,
      }),
    ).toThrow(TurnSagaLockConflictError);
    expect(getTurnSaga({ sagaId: "saga-fenced-writes" })?.provenance).toEqual({
      report: "v5-runtime",
    });

    const attempt = recordNarratorAttempt({
      id: "saga-fenced-writes-good-attempt",
      sagaId: "saga-fenced-writes",
      status: "succeeded",
      finalText: "Fresh worker prose persists.",
      lockToken: "lock-good",
      nowMs: 5_004,
    });
    expect(() =>
      markTurnSagaFinalized({
        sagaId: "saga-fenced-writes",
        narratorAttemptId: attempt.id,
        lockToken: "lock-stale",
        nowMs: 5_005,
      }),
    ).toThrow(TurnSagaLockConflictError);
    expect(getTurnSaga({ sagaId: "saga-fenced-writes" })?.status).toBe("narrator_rendering");
  });

  it("removes finalized saga from pending narration lookup", () => {
    createSaga("saga-finalized", "turn-finalized");
    advanceToWorldConsequence("saga-finalized");
    persistDecision("saga-finalized");
    persistPacket("saga-finalized");
    transitionTurnSagaStatus({
      sagaId: "saga-finalized",
      toStatus: "narrator_rendering",
      nowMs: 5_001,
    });
    transitionTurnSagaStatus({
      sagaId: "saga-finalized",
      toStatus: "narrator_repairing",
      nowMs: 5_002,
    });
    const attempt = recordNarratorAttempt({
      id: "saga-finalized-attempt",
      sagaId: "saga-finalized",
      status: "succeeded",
      finalText: "The sealed door opens.",
      nowMs: 5_003,
    });

    markTurnSagaFinalized({
      sagaId: "saga-finalized",
      narratorAttemptId: attempt.id,
      nowMs: 5_004,
    });

    expect(findPendingNarrationSaga({ campaignId: CAMPAIGN_ID })).toBeNull();
    expect(() =>
      assertNoPendingNarrationBeforeNewTurn({ campaignId: CAMPAIGN_ID }),
    ).not.toThrow();
  });

  it("clears active lock fields during finalization", () => {
    createSaga("saga-finalized-lock", "turn-finalized-lock");
    advanceToWorldConsequence("saga-finalized-lock");
    persistDecision("saga-finalized-lock");
    persistPacket("saga-finalized-lock");
    claimTurnSagaWorker({
      sagaId: "saga-finalized-lock",
      workerId: "worker-finalizer",
      lockToken: "lock-finalizer",
      nowMs: 5_000,
    });
    transitionTurnSagaStatus({
      sagaId: "saga-finalized-lock",
      toStatus: "narrator_rendering",
      nowMs: 5_001,
    });
    const attempt = recordNarratorAttempt({
      id: "saga-finalized-lock-attempt",
      sagaId: "saga-finalized-lock",
      status: "succeeded",
      finalText: "The sealed door opens.",
      nowMs: 5_002,
    });

    const finalized = markTurnSagaFinalized({
      sagaId: "saga-finalized-lock",
      narratorAttemptId: attempt.id,
      nowMs: 5_003,
    });

    expect(finalized).toMatchObject({
      status: "finalized",
      activeLockToken: null,
      activeWorkerId: null,
      activeStartedAt: null,
    });
  });

  it("finds the latest successful narrator attempt for a settled packet", () => {
    createSaga("saga-latest-attempt", "turn-latest-attempt");
    advanceToWorldConsequence("saga-latest-attempt");
    persistDecision("saga-latest-attempt");
    const packet = persistPacket("saga-latest-attempt");
    transitionTurnSagaStatus({
      sagaId: "saga-latest-attempt",
      toStatus: "narrator_rendering",
      nowMs: 5_000,
    });
    recordNarratorAttempt({
      id: "saga-latest-attempt-failed",
      sagaId: "saga-latest-attempt",
      settledTurnPacketId: packet.id,
      status: "failed",
      failureReason: "Guard failed.",
      nowMs: 5_001,
    });
    const firstSuccess = recordNarratorAttempt({
      id: "saga-latest-attempt-success-1",
      sagaId: "saga-latest-attempt",
      settledTurnPacketId: packet.id,
      status: "succeeded",
      finalText: "First successful telling.",
      nowMs: 5_002,
    });
    const latestSuccess = recordNarratorAttempt({
      id: "saga-latest-attempt-success-2",
      sagaId: "saga-latest-attempt",
      settledTurnPacketId: packet.id,
      status: "succeeded",
      finalText: "Latest successful telling.",
      nowMs: 5_003,
    });

    const found = findLatestSuccessfulNarratorAttempt({
      sagaId: "saga-latest-attempt",
      settledTurnPacketId: packet.id,
      campaignId: CAMPAIGN_ID,
    });

    expect(firstSuccess.id).toBe("saga-latest-attempt-success-1");
    expect(found).toMatchObject({
      id: latestSuccess.id,
      finalText: "Latest successful telling.",
    });
  });

  it("merges provenance checkpoints without dropping existing provenance", () => {
    createSaga("saga-provenance", "turn-provenance");

    mergeTurnSagaProvenance({
      sagaId: "saga-provenance",
      patch: {
        pendingNarrationResume: {
          assistantAppend: { narratorAttemptId: "attempt-1", completedAt: 1 },
        },
      },
      nowMs: 2_000,
    });
    const updated = mergeTurnSagaProvenance({
      sagaId: "saga-provenance",
      patch: {
        pendingNarrationResume: {
          postNarrationTail: { narratorAttemptId: "attempt-1", tick: 7, completedAt: 2 },
        },
      },
      nowMs: 2_001,
    });

    expect(updated.provenance).toEqual({
      report: "v5-runtime",
      pendingNarrationResume: {
        assistantAppend: { narratorAttemptId: "attempt-1", completedAt: 1 },
        postNarrationTail: { narratorAttemptId: "attempt-1", tick: 7, completedAt: 2 },
      },
    });
  });

  it("no-ops finalized-if-needed for the same narrator attempt", () => {
    createSaga("saga-finalized-noop", "turn-finalized-noop");
    advanceToWorldConsequence("saga-finalized-noop");
    persistDecision("saga-finalized-noop");
    persistPacket("saga-finalized-noop");
    transitionTurnSagaStatus({
      sagaId: "saga-finalized-noop",
      toStatus: "narrator_rendering",
      nowMs: 5_000,
    });
    const attempt = recordNarratorAttempt({
      id: "saga-finalized-noop-attempt",
      sagaId: "saga-finalized-noop",
      status: "succeeded",
      finalText: "The turn is already done.",
      nowMs: 5_001,
    });
    markTurnSagaFinalized({
      sagaId: "saga-finalized-noop",
      narratorAttemptId: attempt.id,
      nowMs: 5_002,
    });

    const finalizedAgain = markTurnSagaFinalizedIfNeeded({
      sagaId: "saga-finalized-noop",
      narratorAttemptId: attempt.id,
      nowMs: 5_003,
    });

    expect(finalizedAgain.status).toBe("finalized");
    expect(finalizedAgain.latestNarratorAttemptId).toBe(attempt.id);
    expect(() =>
      markTurnSagaFinalizedIfNeeded({
        sagaId: "saga-finalized-noop",
        narratorAttemptId: "different-attempt",
        nowMs: 5_004,
      }),
    ).toThrow(TurnSagaTransitionError);
  });

  it("treats failed_state_corruption as terminal without deleting settled artifacts", () => {
    createSaga("saga-failed", "turn-failed");
    advanceToWorldConsequence("saga-failed");
    persistDecision("saga-failed");
    persistPacket("saga-failed");

    const failed = markTurnSagaFailedStateCorruption({
      sagaId: "saga-failed",
      reason: "World clock restore mismatch.",
      nowMs: 6_000,
    });

    expect(failed.status).toBe("failed_state_corruption");
    expect(failed.settledTurnPacketId).toBe("saga-failed-packet");
    expect(getSettledTurnPacket({ sagaId: "saga-failed" })?.id).toBe(
      "saga-failed-packet",
    );
    expect(() =>
      transitionTurnSagaStatus({
        sagaId: "saga-failed",
        toStatus: "resolved_pending_narration",
        nowMs: 6_001,
      }),
    ).toThrow(TurnSagaTransitionError);
    expect(() =>
      markTurnSagaFailedStateCorruption({
        sagaId: "saga-failed",
        reason: "second failure",
        nowMs: 6_002,
      }),
    ).toThrow(TurnSagaTransitionError);
  });

  it("cascades saga artifacts when the campaign is removed", () => {
    createSaga("saga-cascade", "turn-cascade");
    advanceToWorldConsequence("saga-cascade");
    persistDecision("saga-cascade");
    persistPacket("saga-cascade");
    recordNarratorAttempt({
      id: "saga-cascade-attempt",
      sagaId: "saga-cascade",
      status: "started",
      nowMs: 5_001,
    });

    getDb().delete(campaigns).where(eq(campaigns.id, CAMPAIGN_ID)).run();

    expect(getDb().select().from(turnSagas).all()).toHaveLength(0);
    expect(getDb().select().from(oracleDecisions).all()).toHaveLength(0);
    expect(getDb().select().from(settledTurnPackets).all()).toHaveLength(0);
    expect(getDb().select().from(narratorAttempts).all()).toHaveLength(0);
  });
});
