import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CAMPAIGN_PLAY_EVIDENCE_VERSION } from "./contracts.js";
import {
  createCampaignPlayInventory,
  validateCampaignPlayBundle,
} from "./probes.js";
import { createCampaignPlayScorecard } from "./scorecard.js";

const RUN_ID = "deterministic-run-one";
const CAMPAIGN_ID = "campaign-one";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

let root = "";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-campaign-play-evidence-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function writeJson(relativePath: string, value: unknown): void {
  fs.writeFileSync(path.join(root, relativePath), JSON.stringify(value, null, 2), "utf8");
}

function writeJsonLines(relativePath: string, values: unknown[]): void {
  fs.writeFileSync(
    path.join(root, relativePath),
    values.map((value) => JSON.stringify(value)).join("\n"),
    "utf8",
  );
}

function refreshInventory(): void {
  writeJson("inventory.json", createCampaignPlayInventory(root, RUN_ID));
}

function createCompleteBundle(): void {
  for (const directory of ["build", "checkpoints", "probes", "screenshots"]) {
    fs.mkdirSync(path.join(root, directory));
  }
  writeJson("build/run-config.json", {
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    runId: RUN_ID,
    lane: "deterministic-10",
    campaignId: CAMPAIGN_ID,
    worldSource: { kind: "fixture" },
    expectedPlayerActions: 1,
    outputRoot: root,
    execution: { kind: "deterministic", fixtureId: "bell-island", seed: "test-seed" },
    restartAfterPlayerActions: [],
    operators: { runner: "vitest", player: null, auditor: "validator" },
  });
  writeJson("checkpoints/action-1.json", {
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    runId: RUN_ID,
    campaignId: CAMPAIGN_ID,
    checkpointId: "action-1",
    afterPlayerAction: 1,
    recordedAt: 1_600,
    acceptedSnapshotHash: HASH_A,
    worldVersion: 9,
    worldHash: HASH_B,
    runtimeRevision: 16,
    runtimeHash: HASH_C,
    publicProjectionHash: HASH_A,
    protectedAuditHash: HASH_B,
    eventCursor: 2,
    sqliteIntegrity: "ok",
    foreignKeyViolations: 0,
  });
  fs.writeFileSync(path.join(root, "probes", "secrecy.json"), "{}", "utf8");
  fs.writeFileSync(path.join(root, "screenshots", "ready.png"), Buffer.from([1, 2, 3]));
  writeJson("manifest.json", {
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    runId: RUN_ID,
    campaignId: CAMPAIGN_ID,
    worldSource: { kind: "fixture" },
    parentCampaignId: null,
    lane: "deterministic-10",
    commit: "04070be5",
    dirty: false,
    startedAt: 1_000,
    completedAt: 2_000,
    openingTurn: 0,
    completedPlayerActions: 1,
    status: "complete",
    runConfigHash: HASH_A,
    eligibilityHash: HASH_B,
  });
  writeJson("eligibility.json", {
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    campaignId: CAMPAIGN_ID,
    frozenAt: 1_100,
    acceptedWorldVersion: 7,
    acceptedSnapshotHash: HASH_A,
    acceptedContentHash: HASH_B,
    topologyHash: HASH_C,
    reachableLocationIds: ["location-a", "location-b", "location-c"],
    activeActors: [
      { actorId: "actor-a", kind: "person", role: "key", placementId: "placement-a", goalIds: ["goal-a"] },
      { actorId: "actor-b", kind: "person", role: "support", placementId: "placement-b", goalIds: ["goal-b"] },
      { actorId: "actor-c", kind: "person", role: "support", placementId: "placement-c", goalIds: ["goal-c"] },
      { actorId: "actor-d", kind: "collective", role: "key", placementId: "placement-d", goalIds: ["goal-d"] },
    ],
    pressureAnchorIds: ["pressure-a", "pressure-b"],
    openingCandidateIds: ["location-a"],
    exposurePathIds: ["exposure-a"],
    planIds: ["plan-a", "plan-b", "plan-c", "plan-d"],
    scheduleIds: ["schedule-a", "schedule-b", "schedule-c", "schedule-d"],
  });
  writeJsonLines("turns.jsonl", [
    {
      runId: RUN_ID, campaignId: CAMPAIGN_ID, turnId: "turn-opening", turnKind: "opening",
      openingTurn: 0, playerActionNumber: null, status: "completed", worldVersion: 8,
      runtimeRevision: 8, eventCursor: 8, submittedAt: 1_200, completedAt: 1_300,
      publicResultHash: HASH_A,
    },
    {
      runId: RUN_ID, campaignId: CAMPAIGN_ID, turnId: "turn-action-1", turnKind: "player_action",
      openingTurn: null, playerActionNumber: 1, status: "completed", worldVersion: 9,
      runtimeRevision: 16, eventCursor: 8, submittedAt: 1_400, completedAt: 1_500,
      publicResultHash: HASH_B,
    },
  ]);
  writeJsonLines("inputs.jsonl", [{
    runId: RUN_ID, campaignId: CAMPAIGN_ID, inputId: "input-1", idempotencyKey: "action-1",
    playerActionNumber: 1, source: "freeform", choiceHandle: null, text: "I wait by the gate.",
    visibleStateHash: HASH_A, submittedAt: 1_400,
  }]);
  writeJsonLines("browser-actions.jsonl", []);
  writeJsonLines("network-trace.jsonl", [{
    runId: RUN_ID, campaignId: CAMPAIGN_ID, sequence: 1, method: "GET",
    path: `/api/campaigns/${CAMPAIGN_ID}/play/state`, status: 200,
    requestBodyHash: null, responseBodyHash: HASH_A, playerActionNumber: null,
  }]);
  writeJsonLines("model-stages.jsonl", [{
    runId: RUN_ID, campaignId: CAMPAIGN_ID, turnId: "turn-action-1", stage: "judge",
    workerEpoch: 1, providerId: "fixture", model: "judge-fixture", strategy: "strict_object",
    attempts: 2, retryUsed: true, textFallbackUsed: false, inputTokens: 10, outputTokens: 10,
    costMicros: 0, durationMs: 1, artifactHash: HASH_A,
  }]);
  writeJson("budget.json", {
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    runId: RUN_ID,
    billingKind: "metered",
    maximumInputTokens: 100,
    maximumOutputTokens: 100,
    maximumCostMicros: 1,
    actualInputTokens: 10,
    actualOutputTokens: 10,
    actualCostMicros: 0,
    p95TurnDurationMs: 1,
    p99TurnDurationMs: 1,
  });
  writeJsonLines("runtime-events.jsonl", [
    {
      runId: RUN_ID, campaignId: CAMPAIGN_ID, sequence: 1, mutationKind: "play_state_created",
      turnId: null, workerEpoch: null, worldVersion: 7, priorRuntimeRevision: 0,
      resultRuntimeRevision: 1, priorRuntimeHash: HASH_A, resultRuntimeHash: HASH_B,
      protectedPayloadHash: HASH_C,
    },
    {
      runId: RUN_ID, campaignId: CAMPAIGN_ID, sequence: 2, mutationKind: "character_created",
      turnId: null, workerEpoch: null, worldVersion: 8, priorRuntimeRevision: 1,
      resultRuntimeRevision: 2, priorRuntimeHash: HASH_B, resultRuntimeHash: HASH_C,
      protectedPayloadHash: HASH_A,
    },
  ]);
  writeJsonLines("receipts.jsonl", [{
    runId: RUN_ID, campaignId: CAMPAIGN_ID, turnId: "turn-action-1", commandId: "command-1",
    receiptId: "receipt-1", actorId: "player-one", worldVersion: 9,
    eventIds: ["event-1"], receiptHash: HASH_A,
  }]);
  writeJsonLines("actor-jobs.jsonl", [{
    runId: RUN_ID, campaignId: CAMPAIGN_ID, turnId: "turn-action-1", jobId: "job-1",
    actorId: "actor-a", stage: "completed", sourceWorldVersion: 8,
    settledWorldVersion: 9, proposalId: "proposal-1",
  }]);
  writeJsonLines("visibility.jsonl", [{
    runId: RUN_ID, campaignId: CAMPAIGN_ID, turnId: "turn-action-1", eventId: "event-1",
    exposureId: "exposure-1", observationId: "observation-1", channel: "direct_perception",
    eligible: true, publicEntryHash: HASH_A,
  }]);
  fs.writeFileSync(path.join(root, "transcript.md"), "# Deterministic transcript\n", "utf8");
  writeJson("scorecard.json", createCampaignPlayScorecard({
    runId: RUN_ID,
    lane: "deterministic-10",
    completedPlayerActions: 1,
    expectedPlayerActions: 1,
    receiptBearingMutations: 1,
    mechanicalMutations: 1,
    runtimeEvents: 2,
    runtimeRevisions: 2,
    turnOwnedRuntimeEvents: 1,
    turnOwnedRuntimeMutations: 1,
  }));
  fs.writeFileSync(path.join(root, "human-notes.md"), "Deterministic lane.\n", "utf8");
  writeJson("browser-console.json", []);
  writeJson("network-errors.json", []);
  refreshInventory();
}

describe("Campaign Play evidence probes", () => {
  it("validates a complete promotion bundle and its SHA-256 inventory", () => {
    createCompleteBundle();
    expect(validateCampaignPlayBundle(root)).toMatchObject({
      valid: true,
      promotionEligible: true,
      issues: [],
    });
  });

  it("detects changed evidence after inventory creation", () => {
    createCompleteBundle();
    fs.appendFileSync(path.join(root, "transcript.md"), "Changed after capture.\n", "utf8");
    expect(validateCampaignPlayBundle(root)).toMatchObject({
      valid: false,
      promotionEligible: false,
      issues: [expect.stringContaining("inventory.json")],
    });
  });

  it("preserves an over-budget bundle and reports it as ineligible evidence", () => {
    createCompleteBundle();
    const budgetPath = path.join(root, "budget.json");
    const budget = JSON.parse(fs.readFileSync(budgetPath, "utf8")) as Record<string, unknown>;
    budget.actualOutputTokens = 101;
    writeJson("budget.json", budget);
    refreshInventory();

    expect(validateCampaignPlayBundle(root)).toMatchObject({
      valid: false,
      promotionEligible: false,
      issues: ["Output token budget was exceeded."],
    });
  });

  it("rejects displaced gameplay requests even when the inventory is current", () => {
    createCompleteBundle();
    writeJsonLines("network-trace.jsonl", [{
      runId: RUN_ID, campaignId: CAMPAIGN_ID, sequence: 1, method: "POST",
      path: "/api/chat/action", status: 404, requestBodyHash: HASH_A,
      responseBodyHash: HASH_B, playerActionNumber: 1,
    }]);
    refreshInventory();
    expect(validateCampaignPlayBundle(root).issues).toContain(
      "network-trace.jsonl contains a displaced gameplay path.",
    );
  });

  it("rejects duplicate idempotency evidence", () => {
    createCompleteBundle();
    const duplicate = {
      runId: RUN_ID, campaignId: CAMPAIGN_ID, inputId: "input-2", idempotencyKey: "action-1",
      playerActionNumber: 1, source: "freeform", choiceHandle: null, text: "I wait again.",
      visibleStateHash: HASH_A, submittedAt: 1_401,
    };
    writeJsonLines("inputs.jsonl", [
      {
        ...duplicate,
        inputId: "input-1",
        text: "I wait by the gate.",
        submittedAt: 1_400,
      },
      duplicate,
    ]);
    refreshInventory();
    const validation = validateCampaignPlayBundle(root);
    expect(validation.valid).toBe(false);
    expect(validation.issues).toContain("inputs.jsonl contains a duplicate idempotency key.");
  });

  it("rejects a complete bundle with an interrupted turn", () => {
    createCompleteBundle();
    const lines = fs.readFileSync(path.join(root, "turns.jsonl"), "utf8").split("\n");
    const action = JSON.parse(lines[1]) as Record<string, unknown>;
    action.status = "interrupted";
    action.completedAt = null;
    action.publicResultHash = null;
    writeJsonLines("turns.jsonl", [JSON.parse(lines[0]) as unknown, action]);
    refreshInventory();
    expect(validateCampaignPlayBundle(root).issues).toContain(
      "A complete bundle contains a nonterminal or failed turn.",
    );
  });

  it("rejects a bundle with a missing required ledger", () => {
    createCompleteBundle();
    fs.rmSync(path.join(root, "receipts.jsonl"));
    expect(validateCampaignPlayBundle(root).issues).toContain(
      "Required file is missing: receipts.jsonl.",
    );
  });

  it("rejects protected payload fields in public browser evidence", () => {
    createCompleteBundle();
    writeJsonLines("browser-actions.jsonl", [{
      runId: RUN_ID,
      campaignId: CAMPAIGN_ID,
      playerActionNumber: 1,
      control: "freeform",
      visibleStateHash: HASH_A,
      chosenText: "I wait by the gate.",
      choiceHandle: null,
      turnId: "turn-action-1",
      chooser: null,
      signedAt: null,
      decisionNote: null,
      protectedPayload: { goalId: "hidden-goal" },
    }]);
    refreshInventory();
    const validation = validateCampaignPlayBundle(root);
    expect(validation.valid).toBe(false);
    expect(validation.issues[0]).toContain("browser-actions.jsonl line 1 is invalid");
  });
});
