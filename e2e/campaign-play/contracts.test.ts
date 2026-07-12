import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_PLAY_EVIDENCE_VERSION,
  campaignPlayEligibilitySchema,
  campaignPlayInventorySchema,
  campaignPlayManifestSchema,
  campaignPlayRunConfigSchema,
  campaignPlayScorecardSchema,
} from "./contracts.js";

const HASH = "a".repeat(64);

describe("Campaign Play evidence contracts", () => {
  it("keeps opening turn zero separate from completed player action targets", () => {
    expect(campaignPlayRunConfigSchema.parse({
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: "deterministic-10-one",
      lane: "deterministic-10",
      campaignId: null,
      expectedPlayerActions: 10,
      outputRoot: "output/playtests/campaign-play",
      execution: { kind: "deterministic", fixtureId: "bell-island", seed: "seed-one" },
      restartAfterPlayerActions: [0, 5, 10],
      operators: { runner: "playtest-runner", player: null, auditor: "promotion-auditor" },
    })).toMatchObject({ expectedPlayerActions: 10, restartAfterPlayerActions: [0, 5, 10] });
  });

  it("rejects restart checkpoints beyond the completed action target", () => {
    expect(() => campaignPlayRunConfigSchema.parse({
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: "deterministic-10-one",
      lane: "deterministic-10",
      campaignId: null,
      expectedPlayerActions: 10,
      outputRoot: "output/playtests/campaign-play",
      execution: { kind: "deterministic", fixtureId: "bell-island", seed: "seed-one" },
      restartAfterPlayerActions: [11],
      operators: { runner: "playtest-runner", player: null, auditor: "promotion-auditor" },
    })).toThrow("Restart checkpoints cannot exceed the action target");
  });

  it("requires complete manifests to carry a terminal timestamp", () => {
    expect(() => campaignPlayManifestSchema.parse({
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: "run-one",
      campaignId: "campaign-one",
      parentCampaignId: null,
      lane: "deterministic-10",
      commit: "04070be5",
      dirty: false,
      startedAt: 1,
      completedAt: null,
      openingTurn: 0,
      completedPlayerActions: 10,
      status: "complete",
      runConfigHash: HASH,
      eligibilityHash: HASH,
    })).toThrow("A complete run requires a completion timestamp");
  });

  it("requires the first acceptance actor envelope before opening", () => {
    const base = {
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      campaignId: "campaign-one",
      frozenAt: 1,
      acceptedWorldVersion: 1,
      acceptedSnapshotHash: HASH,
      acceptedContentHash: HASH,
      topologyHash: HASH,
      reachableLocationIds: ["location-a", "location-b", "location-c"],
      pressureAnchorIds: ["pressure-a", "pressure-b"],
      openingCandidateIds: ["location-a"],
      exposurePathIds: ["path-a"],
      planIds: ["plan-a", "plan-b", "plan-c", "plan-d"],
      scheduleIds: ["schedule-a", "schedule-b", "schedule-c", "schedule-d"],
    };
    expect(() => campaignPlayEligibilitySchema.parse({
      ...base,
      activeActors: [
        { actorId: "actor-a", kind: "person", role: "key", placementId: "placement-a", goalIds: ["goal-a"] },
        { actorId: "actor-b", kind: "person", role: "support", placementId: "placement-b", goalIds: ["goal-b"] },
        { actorId: "actor-c", kind: "person", role: "support", placementId: "placement-c", goalIds: ["goal-c"] },
        { actorId: "actor-d", kind: "person", role: "key", placementId: "placement-d", goalIds: ["goal-d"] },
      ],
    })).toThrow("Eligibility requires one collective actor");
  });

  it("rejects a scorecard that claims promotion with a hard failure", () => {
    const hardFailures = {
      replayDivergence: 1,
      partialCommit: 0,
      missingTerminal: 0,
      hiddenStateLeak: 0,
      duplicateInput: 0,
      staleExecution: 0,
      activeDonorCall: 0,
      inventoryMismatch: 0,
      receiptCoverageGap: 0,
      runtimeEventGap: 0,
      turnEventGap: 0,
      provenanceDrift: 0,
      sqliteIntegrityFailure: 0,
    };
    expect(() => campaignPlayScorecardSchema.parse({
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: "run-one",
      lane: "deterministic-10",
      completedPlayerActions: 10,
      expectedPlayerActions: 10,
      receiptCoverage: 1,
      runtimeEventCoverage: 1,
      turnEventCoverage: 1,
      hardFailures,
      promotionEligible: true,
      findings: [],
    })).toThrow("Promotion eligibility does not match the measured gate");
  });

  it("requires canonical inventory order and excludes self hashing", () => {
    expect(() => campaignPlayInventorySchema.parse({
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: "run-one",
      entries: [
        { path: "turns.jsonl", bytes: 1, sha256: HASH },
        { path: "inventory.json", bytes: 1, sha256: HASH },
      ],
    })).toThrow();
  });
});
