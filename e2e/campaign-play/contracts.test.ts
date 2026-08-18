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
      worldSource: { kind: "fixture" },
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
      worldSource: { kind: "fixture" },
      expectedPlayerActions: 10,
      outputRoot: "output/playtests/campaign-play",
      execution: { kind: "deterministic", fixtureId: "bell-island", seed: "seed-one" },
      restartAfterPlayerActions: [11],
      operators: { runner: "playtest-runner", player: null, auditor: "promotion-auditor" },
    })).toThrow("Restart checkpoints cannot exceed the action target");
  });

  it("requires exact role pricing for live provider lanes", () => {
    expect(() => campaignPlayRunConfigSchema.parse({
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: "first-playable-one",
      lane: "first-playable",
      campaignId: "campaign-one",
      worldSource: { kind: "generated" },
      expectedPlayerActions: 2,
      outputRoot: "output/playtests/campaign-play",
      execution: {
        kind: "live",
        providerId: "provider-one",
        models: { generator: "generator", judge: "judge", storyteller: "storyteller" },
        billing: { kind: "metered", maximumCostMicros: 1_000_000 },
        maximumInputTokens: 10_000,
        maximumOutputTokens: 32_768,
        maximumTurnDurationMs: 120_000,
      },
      restartAfterPlayerActions: [],
      operators: { runner: "runner", player: "manual-player", auditor: "auditor" },
    })).toThrow();
  });

  it("accepts subscription authority without inventing per-token pricing", () => {
    const config = campaignPlayRunConfigSchema.parse({
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: "first-playable-subscription",
      lane: "first-playable",
      campaignId: "campaign-one",
      worldSource: { kind: "generated" },
      expectedPlayerActions: 2,
      outputRoot: "output/playtests/campaign-play",
      execution: {
        kind: "live",
        providerId: "zai-coding-plan",
        models: { generator: "glm-5.2", judge: "glm-5.2", storyteller: "glm-5.2" },
        billing: {
          kind: "subscription",
          providerName: "Z.AI Coding Plan",
          planId: "pro",
          currency: "USD",
          monthlyListPriceMicros: 72_000_000,
          pricingSourceUrl: "https://z.ai/subscribe",
          quotaEndpoint: "https://api.z.ai/api/monitor/usage/quota/limit",
        },
        maximumInputTokens: 100_000,
        maximumOutputTokens: 32_768,
        maximumTurnDurationMs: 180_000,
      },
      restartAfterPlayerActions: [],
      operators: { runner: "runner", player: "manual-player", auditor: "auditor" },
    });
    expect(config.execution).toMatchObject({
      kind: "live",
      providerId: "zai-coding-plan",
      billing: { kind: "subscription", planId: "pro" },
    });
  });

  it("rejects a live run output ceiling below 32k", () => {
    expect(() => campaignPlayRunConfigSchema.parse({
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: "first-playable-low-output",
      lane: "first-playable",
      campaignId: "campaign-one",
      worldSource: { kind: "generated" },
      expectedPlayerActions: 1,
      outputRoot: "output/playtests/campaign-play",
      execution: {
        kind: "live",
        providerId: "zai-coding-plan",
        models: { generator: "glm-5.2", judge: "glm-5.2", storyteller: "glm-5.2" },
        billing: {
          kind: "subscription",
          providerName: "Z.AI Coding Plan",
          planId: "pro",
          currency: "USD",
          monthlyListPriceMicros: 72_000_000,
          pricingSourceUrl: "https://z.ai/subscribe",
          quotaEndpoint: "https://api.z.ai/api/monitor/usage/quota/limit",
        },
        maximumInputTokens: 100_000,
        maximumOutputTokens: 32_767,
        maximumTurnDurationMs: 180_000,
      },
      restartAfterPlayerActions: [],
      operators: { runner: "runner", player: "manual-player", auditor: "auditor" },
    })).toThrow();
  });

  it("pins the causal-20 lane to checkpoints 1, 5, 10, and 20", () => {
    const base = {
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: "causal-twenty",
      lane: "causal-20",
      campaignId: "campaign-one",
      worldSource: { kind: "generated" },
      expectedPlayerActions: 20,
      outputRoot: "output/playtests/campaign-play",
      execution: {
        kind: "live",
        providerId: "zai-coding-plan",
        models: { generator: "glm-5.2", judge: "glm-5.2", storyteller: "glm-5.2" },
        billing: {
          kind: "subscription",
          providerName: "Z.AI Coding Plan",
          planId: "pro",
          currency: "USD",
          monthlyListPriceMicros: 72_000_000,
          pricingSourceUrl: "https://z.ai/subscribe",
          quotaEndpoint: "https://api.z.ai/api/monitor/usage/quota/limit",
        },
        maximumInputTokens: 100_000,
        maximumOutputTokens: 32_768,
        maximumTurnDurationMs: 180_000,
      },
      operators: { runner: "runner", player: "manual-player", auditor: "auditor" },
    } as const;
    expect(campaignPlayRunConfigSchema.parse({
      ...base,
      restartAfterPlayerActions: [1, 5, 10, 20],
    }).restartAfterPlayerActions).toEqual([1, 5, 10, 20]);
    expect(() => campaignPlayRunConfigSchema.parse({
      ...base,
      restartAfterPlayerActions: [5, 20],
    })).toThrow("requires exactly 20 actions and reload checkpoints 1, 5, 10, and 20");
  });

  it("requires complete manifests to carry a terminal timestamp", () => {
    expect(() => campaignPlayManifestSchema.parse({
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: "run-one",
      campaignId: "campaign-one",
      worldSource: { kind: "fixture" },
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

  it("accepts the person-only first acceptance actor envelope before opening", () => {
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
      planIds: ["plan-a", "plan-b", "plan-c", "plan-d", "plan-e", "plan-f"],
      scheduleIds: ["schedule-a", "schedule-b", "schedule-c", "schedule-d", "schedule-e", "schedule-f"],
    };
    expect(() => campaignPlayEligibilitySchema.parse({
      ...base,
      activeActors: [
        { actorId: "actor-a", kind: "person", role: "key", placementId: "placement-a", goalIds: ["goal-a"], planId: "plan-a", scheduleId: "schedule-a" },
        { actorId: "actor-b", kind: "person", role: "support", placementId: "placement-b", goalIds: ["goal-b"], planId: "plan-b", scheduleId: "schedule-b" },
        { actorId: "actor-c", kind: "person", role: "support", placementId: "placement-c", goalIds: ["goal-c"], planId: "plan-c", scheduleId: "schedule-c" },
        { actorId: "actor-d", kind: "person", role: "background", placementId: "placement-d", goalIds: ["goal-d"], planId: "plan-d", scheduleId: "schedule-d" },
        { actorId: "actor-e", kind: "person", role: "background", placementId: "placement-e", goalIds: ["goal-e"], planId: "plan-e", scheduleId: "schedule-e" },
        { actorId: "actor-f", kind: "person", role: "key", placementId: "placement-f", goalIds: ["goal-f"], planId: "plan-f", scheduleId: "schedule-f" },
      ],
    })).not.toThrow();
  });

  it("accepts lazy schedules without plans and mixed planned/lazy schedules", () => {
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
      scheduleIds: ["schedule-a", "schedule-b", "schedule-c", "schedule-d", "schedule-e", "schedule-f"],
    };
    const lazyActors = [
      { actorId: "actor-a", kind: "person", role: "key", placementId: "placement-a", goalIds: ["goal-a"], planId: null, scheduleId: "schedule-a" },
      { actorId: "actor-b", kind: "person", role: "support", placementId: "placement-b", goalIds: ["goal-b"], planId: null, scheduleId: "schedule-b" },
      { actorId: "actor-c", kind: "person", role: "support", placementId: "placement-c", goalIds: ["goal-c"], planId: null, scheduleId: "schedule-c" },
      { actorId: "actor-d", kind: "person", role: "background", placementId: "placement-d", goalIds: ["goal-d"], planId: null, scheduleId: "schedule-d" },
      { actorId: "actor-e", kind: "person", role: "background", placementId: "placement-e", goalIds: ["goal-e"], planId: null, scheduleId: "schedule-e" },
      { actorId: "actor-f", kind: "person", role: "key", placementId: "placement-f", goalIds: ["goal-f"], planId: null, scheduleId: "schedule-f" },
    ] as const;

    expect(() => campaignPlayEligibilitySchema.parse({
      ...base,
      activeActors: lazyActors,
      planIds: [],
    })).not.toThrow();

    expect(() => campaignPlayEligibilitySchema.parse({
      ...base,
      activeActors: lazyActors.map((actor) => actor.actorId === "actor-a"
        ? { ...actor, planId: "plan-a" }
        : actor),
      planIds: ["plan-a"],
    })).not.toThrow();
  });

  it("rejects dangling plans and missing actor schedules", () => {
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
      planIds: ["plan-a"],
      scheduleIds: ["schedule-a", "schedule-b", "schedule-c", "schedule-d", "schedule-e", "schedule-f"],
    };
    const actors = [
      { actorId: "actor-a", kind: "person", role: "key", placementId: "placement-a", goalIds: ["goal-a"], planId: "plan-a", scheduleId: "schedule-a" },
      { actorId: "actor-b", kind: "person", role: "support", placementId: "placement-b", goalIds: ["goal-b"], planId: null, scheduleId: "schedule-b" },
      { actorId: "actor-c", kind: "person", role: "support", placementId: "placement-c", goalIds: ["goal-c"], planId: null, scheduleId: "schedule-c" },
      { actorId: "actor-d", kind: "person", role: "background", placementId: "placement-d", goalIds: ["goal-d"], planId: null, scheduleId: "schedule-d" },
      { actorId: "actor-e", kind: "person", role: "background", placementId: "placement-e", goalIds: ["goal-e"], planId: null, scheduleId: "schedule-e" },
      { actorId: "actor-f", kind: "person", role: "key", placementId: "placement-f", goalIds: ["goal-f"], planId: null, scheduleId: "schedule-f" },
    ] as const;

    expect(() => campaignPlayEligibilitySchema.parse({
      ...base,
      activeActors: actors.map((actor) => actor.actorId === "actor-a"
        ? { ...actor, planId: "plan-missing" }
        : actor),
    })).toThrow("Every person requires a persisted schedule and any non-null plan must be persisted.");

    expect(() => campaignPlayEligibilitySchema.parse({
      ...base,
      activeActors: actors.map((actor) => actor.actorId === "actor-f"
        ? { ...actor, scheduleId: "schedule-missing" }
        : actor),
    })).toThrow("Every person requires a persisted schedule and any non-null plan must be persisted.");
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
