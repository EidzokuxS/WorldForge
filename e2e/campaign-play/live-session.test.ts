import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { closeDb } from "../../backend/src/db/index.js";
import { openCampaignPlayDatabase } from "../../backend/src/campaign-play/campaign-play-database.js";
import { createCampaignPlayStateRepository } from "../../backend/src/campaign-play/campaign-play-state-repository.js";
import { CAMPAIGN_PLAY_EVIDENCE_VERSION, type CampaignPlayRunConfig } from "./contracts.js";
import { createDefaultSettings } from "@worldforge/shared";
import {
  bindCampaignPlayManualDecision,
  captureCampaignPlaySubscriptionQuota,
  campaignPlayLiveSessionRoot,
  prepareCampaignPlayLiveSession,
  stageCampaignPlayManualDecision,
} from "./live-session.js";
import {
  createSeededAcceptedCampaign,
  runAcceptedCampaignPlayReplay,
} from "./seeded-replay.js";

const roots: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  closeDb();
  delete process.env.GSD_CAMPAIGNS_ROOT;
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

function liveConfig(outputRoot: string, campaignId: string, expectedPlayerActions: number): CampaignPlayRunConfig {
  const pricing = {
    currency: "USD" as const,
    tokenUnit: 1_000_000 as const,
    inputCostMicros: 1_000,
    outputCostMicros: 2_000,
  };
  return {
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    runId: `first-playable-${expectedPlayerActions}`,
    lane: "first-playable",
    campaignId,
    expectedPlayerActions,
    outputRoot,
    execution: {
      kind: "live",
      providerId: "provider",
      models: { generator: "generator", judge: "judge", storyteller: "storyteller" },
      billing: {
        kind: "metered",
        pricing: { generator: pricing, judge: pricing, storyteller: pricing },
        maximumCostMicros: 1_000_000,
      },
      maximumInputTokens: 10_000,
      maximumOutputTokens: 10_000,
      maximumTurnDurationMs: 120_000,
    },
    restartAfterPlayerActions: [],
    operators: { runner: "runner", player: "manual-player", auditor: "auditor" },
  };
}

function subscriptionConfig(outputRoot: string, campaignId: string): CampaignPlayRunConfig {
  return {
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    runId: "first-playable-subscription",
    lane: "first-playable",
    campaignId,
    expectedPlayerActions: 2,
    outputRoot,
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
      maximumOutputTokens: 20_000,
      maximumTurnDurationMs: 180_000,
    },
    restartAfterPlayerActions: [],
    operators: { runner: "runner", player: "manual-player", auditor: "auditor" },
  };
}

describe("Campaign Play live evidence session", () => {
  it("freezes an accepted eligible campaign before character creation and signs the next visible decision", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-live-prepare-"));
    roots.push(root);
    process.env.GSD_CAMPAIGNS_ROOT = root;
    const campaignId = "d16b0000-0000-4000-8000-000000000001";
    createSeededAcceptedCampaign(root, campaignId);
    const handle = openCampaignPlayDatabase(campaignId);
    try {
      createCampaignPlayStateRepository(handle).createState({
        eventId: "live-session-created",
        createdAt: 1_000,
      });
    } finally {
      handle.close();
    }
    const outputRoot = path.join(root, "evidence");
    const config = liveConfig(outputRoot, campaignId, 2);
    const settings = createDefaultSettings();
    const localProvider = {
      id: "provider",
      name: "Provider",
      baseUrl: "http://localhost:1234/v1",
      apiKey: "",
      defaultModel: "generator",
    };
    const pricing = config.execution.kind === "live" && config.execution.billing.kind === "metered"
      ? config.execution.billing.pricing
      : null;
    settings.providers.push(localProvider);
    settings.generator = { ...settings.generator, providerId: "provider", model: "generator", pricing: pricing?.generator };
    settings.judge = { ...settings.judge, providerId: "provider", model: "judge", pricing: pricing?.judge };
    settings.storyteller = { ...settings.storyteller, providerId: "provider", model: "storyteller", pricing: pricing?.storyteller };
    const sessionRoot = await prepareCampaignPlayLiveSession({
      runConfig: config,
      commit: "0000000",
      dirty: true,
      startedAt: 1_100,
      settings,
    });
    expect(sessionRoot).toBe(campaignPlayLiveSessionRoot(config));
    expect(fs.existsSync(path.join(sessionRoot, "probes", "eligibility-freeze.json"))).toBe(true);
    await expect(prepareCampaignPlayLiveSession({
      runConfig: config,
      commit: "0000000",
      dirty: true,
      startedAt: 1_100,
      settings,
    })).rejects.toThrow("already exists");

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      phase: "ready",
      projectionHash: "a".repeat(64),
    }), { status: 200, headers: { "content-type": "application/json" } })));
    const pending = await stageCampaignPlayManualDecision({
      runConfig: config,
      control: "freeform",
      chosenText: "I listen at the gate before deciding whether to intervene.",
      choiceHandle: null,
      decisionNote: "The visible pressure is audible, but its source is still unclear.",
      signedAt: 1_200,
    });
    expect(pending.playerActionNumber).toBe(1);
    expect(pending.chooser).toBe("manual-player");
    await expect(stageCampaignPlayManualDecision({
      runConfig: config,
      control: "freeform",
      chosenText: "A second unsigned action.",
      choiceHandle: null,
      decisionNote: "This must wait for the first durable turn.",
      signedAt: 1_201,
    })).rejects.toThrow("already awaiting");
  });

  it("captures Coding Plan quota before and after a subscription-backed live session", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-live-subscription-"));
    roots.push(root);
    process.env.GSD_CAMPAIGNS_ROOT = root;
    const campaignId = "d16b0000-0000-4000-8000-000000000003";
    createSeededAcceptedCampaign(root, campaignId);
    const handle = openCampaignPlayDatabase(campaignId);
    try {
      createCampaignPlayStateRepository(handle).createState({
        eventId: "subscription-session-created",
        createdAt: 1_000,
      });
    } finally {
      handle.close();
    }
    const config = subscriptionConfig(path.join(root, "evidence"), campaignId);
    const settings = createDefaultSettings();
    settings.providers.push({
      id: "zai-coding-plan",
      name: "Z.AI Coding Plan",
      baseUrl: "https://api.z.ai/api/coding/paas/v4",
      apiKey: "test-key",
      defaultModel: "glm-5.2",
    });
    settings.generator = { ...settings.generator, providerId: "zai-coding-plan", model: "glm-5.2" };
    settings.judge = { ...settings.judge, providerId: "zai-coding-plan", model: "glm-5.2" };
    settings.storyteller = { ...settings.storyteller, providerId: "zai-coding-plan", model: "glm-5.2" };
    const quotaResponse = {
      code: 200,
      success: true,
      data: {
        level: "pro",
        limits: [
          { type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 1, nextResetTime: 10_000 },
          { type: "TOKENS_LIMIT", unit: 6, number: 1, percentage: 9, nextResetTime: 20_000 },
          { type: "TIME_LIMIT", unit: 5, number: 1, usage: 1_000, currentValue: 0, remaining: 1_000, percentage: 0, nextResetTime: 30_000 },
        ],
      },
    };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(quotaResponse), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const unsafeConfig = structuredClone(config);
    if (unsafeConfig.execution.kind !== "live" || unsafeConfig.execution.billing.kind !== "subscription") {
      throw new Error("The fixture must use subscription billing.");
    }
    unsafeConfig.runId = "first-playable-unsafe-quota";
    unsafeConfig.execution.billing.quotaEndpoint = "https://example.invalid/collect";
    await expect(prepareCampaignPlayLiveSession({
      runConfig: unsafeConfig,
      commit: "0000000",
      dirty: false,
      startedAt: 1_050,
      settings,
    })).rejects.toThrow("configured provider origin");
    expect(fetchMock).not.toHaveBeenCalled();

    const sessionRoot = await prepareCampaignPlayLiveSession({
      runConfig: config,
      commit: "0000000",
      dirty: false,
      startedAt: 1_100,
      settings,
    });
    await captureCampaignPlaySubscriptionQuota(config, settings);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fs.readFileSync(
      path.join(sessionRoot, "probes", "subscription-quota-before.json"), "utf8",
    ))).toMatchObject({ planId: "pro", tokensFiveHours: { percentage: 1 } });
    expect(fs.existsSync(path.join(
      sessionRoot,
      "probes",
      "subscription-quota-after.json",
    ))).toBe(true);
  });

  it("binds a signed freeform decision to the exact completed durable turn", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-live-bind-"));
    roots.push(root);
    process.env.GSD_CAMPAIGNS_ROOT = root;
    const campaignId = "d16b0000-0000-4000-8000-000000000002";
    createSeededAcceptedCampaign(root, campaignId);
    const replay = await runAcceptedCampaignPlayReplay(campaignId, {
      playerActions: 1,
      policy: "peripheral",
    });
    const outputRoot = path.join(root, "evidence");
    const config = liveConfig(outputRoot, campaignId, 1);
    const sessionRoot = campaignPlayLiveSessionRoot(config);
    fs.mkdirSync(sessionRoot, { recursive: true });
    fs.writeFileSync(path.join(sessionRoot, "browser-actions.jsonl"), "", "utf8");
    fs.writeFileSync(path.join(sessionRoot, "manifest.json"), JSON.stringify({
      evidenceVersion: 1,
      runId: config.runId,
      campaignId,
      commit: "0000000",
      dirty: true,
      startedAt: 1,
      acceptedSnapshotHash: replay.acceptedSnapshotHash,
      acceptedContentHash: replay.report.acceptedContentHash,
      eligibilityHash: replay.report.eligibility.hash,
      initialWorldVersion: 1,
      initialWorldHash: replay.acceptedSnapshotHash,
      initialRuntimeRevision: 1,
      initialRuntimeHash: "b".repeat(64),
    }), "utf8");
    const playerTurn = replay.report.tables.turns.find((row) => row.turn_kind === "player_action")!;
    const chosenText = "I remain at the visible edge of the signal gate and watch change 1.";
    fs.writeFileSync(path.join(sessionRoot, "pending-decision.json"), JSON.stringify({
      playerActionNumber: 1,
      control: "freeform",
      chosenText,
      choiceHandle: null,
      visibleStateHash: "c".repeat(64),
      chooser: "manual-player",
      signedAt: Number(playerTurn.submitted_at) - 1,
      decisionNote: "The scene gives enough reason to stay peripheral and observe the pressure.",
    }), "utf8");

    const evidence = bindCampaignPlayManualDecision(config);
    expect(evidence.turnId).toBe(playerTurn.id);
    expect(evidence.chosenText).toBe(chosenText);
    expect(fs.existsSync(path.join(sessionRoot, "pending-decision.json"))).toBe(false);
    expect(() => bindCampaignPlayManualDecision(config)).toThrow("No signed manual decision");
  });

  it("binds a signed choice to a completed durable suggested-action turn", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-live-bind-choice-"));
    roots.push(root);
    process.env.GSD_CAMPAIGNS_ROOT = root;
    const campaignId = "d16b0000-0000-4000-8000-000000000004";
    createSeededAcceptedCampaign(root, campaignId);
    const replay = await runAcceptedCampaignPlayReplay(campaignId, {
      playerActions: 1,
      policy: "peripheral",
      inputControl: "choice",
    });
    const config = liveConfig(path.join(root, "evidence"), campaignId, 1);
    const sessionRoot = campaignPlayLiveSessionRoot(config);
    fs.mkdirSync(sessionRoot, { recursive: true });
    fs.writeFileSync(path.join(sessionRoot, "browser-actions.jsonl"), "", "utf8");
    fs.writeFileSync(path.join(sessionRoot, "manifest.json"), JSON.stringify({
      evidenceVersion: 1,
      runId: config.runId,
      campaignId,
      commit: "0000000",
      dirty: true,
      startedAt: 1,
      acceptedSnapshotHash: replay.acceptedSnapshotHash,
      acceptedContentHash: replay.report.acceptedContentHash,
      eligibilityHash: replay.report.eligibility.hash,
      initialWorldVersion: 1,
      initialWorldHash: replay.acceptedSnapshotHash,
      initialRuntimeRevision: 1,
      initialRuntimeHash: "b".repeat(64),
    }), "utf8");
    const playerTurn = replay.report.tables.turns.find((row) => row.turn_kind === "player_action")!;
    const document = JSON.parse(String(playerTurn.input_json)) as {
      request: { source: string; choiceHandle: string };
    };
    expect(document.request.source).toBe("suggested");
    fs.writeFileSync(path.join(sessionRoot, "pending-decision.json"), JSON.stringify({
      playerActionNumber: 1,
      control: "choice",
      chosenText: "Wait at the visible edge.",
      choiceHandle: document.request.choiceHandle,
      visibleStateHash: "d".repeat(64),
      chooser: "manual-player",
      signedAt: Number(playerTurn.submitted_at) - 1,
      decisionNote: "The visible scene supports waiting without assuming hidden information.",
    }), "utf8");

    const choiceEvidence = bindCampaignPlayManualDecision(config);
    expect(choiceEvidence).toMatchObject({
      control: "choice",
      choiceHandle: document.request.choiceHandle,
    });
  });
});
