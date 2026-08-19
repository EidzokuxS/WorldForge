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
  assertCampaignPlayChoiceClickProof,
  assertCoherentPlayerTurnTerminalReason,
  assertExactPlayerInput,
  assertCampaignPlayReadyChoiceMatchesApi,
  assertCampaignPlayRenderedChoiceCapture,
  authorizeCampaignPlayManualChoice,
  bindCampaignPlayManualDecision,
  bindCampaignPlayManualDecisionCoherent,
  cancelCampaignPlayManualDecision,
  captureCampaignPlayReloadBoundary,
  captureCampaignPlaySubscriptionQuota,
  campaignPlayLiveSessionRoot,
  prepareCampaignPlayLiveSession,
  stageCampaignPlayManualDecision,
  waitForCompletedPublicTurn,
} from "./live-session.js";
import {
  createSeededAcceptedCampaign,
  runAcceptedCampaignPlayReplay,
} from "./seeded-replay.js";
import { captureCampaignPlayReplay } from "./replay-report.js";

const roots: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  closeDb();
  delete process.env.GSD_CAMPAIGNS_ROOT;
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

function liveConfig(
  outputRoot: string,
  campaignId: string,
  expectedPlayerActions: number,
  restartAfterPlayerActions: number[] = [],
): CampaignPlayRunConfig {
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
    worldSource: { kind: "generated" },
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
      maximumOutputTokens: 32_768,
      maximumTurnDurationMs: 120_000,
    },
    restartAfterPlayerActions,
    operators: { runner: "runner", player: "manual-player", auditor: "auditor" },
  };
}

function subscriptionConfig(outputRoot: string, campaignId: string): CampaignPlayRunConfig {
  return {
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    runId: "first-playable-subscription",
    lane: "first-playable",
    campaignId,
    worldSource: { kind: "generated" },
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
      maximumOutputTokens: 32_768,
      maximumTurnDurationMs: 180_000,
    },
    restartAfterPlayerActions: [],
    operators: { runner: "runner", player: "manual-player", auditor: "auditor" },
  };
}

function writeLiveSessionFixture(
  config: CampaignPlayRunConfig,
  replay: ReturnType<typeof captureCampaignPlayReplay>,
): string {
  const sessionRoot = campaignPlayLiveSessionRoot(config);
  fs.mkdirSync(sessionRoot, { recursive: true });
  fs.writeFileSync(path.join(sessionRoot, "browser-actions.jsonl"), "", "utf8");
  fs.writeFileSync(path.join(sessionRoot, "manifest.json"), `${JSON.stringify({
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    runId: config.runId,
    campaignId: config.campaignId,
    worldSource: config.worldSource,
    commit: "0000000",
    dirty: true,
    startedAt: 1,
    acceptedSnapshotHash: replay.report.acceptedSnapshotHash,
    acceptedContentHash: replay.report.acceptedContentHash,
    eligibilityHash: replay.report.eligibility.hash,
    initialWorldVersion: replay.report.authority.worldVersion,
    initialWorldHash: replay.report.authority.worldHash,
    initialRuntimeRevision: replay.report.authority.runtimeRevision,
    initialRuntimeHash: replay.report.authority.runtimeHash,
  })}\n`, "utf8");
  return sessionRoot;
}

describe("Campaign Play live evidence session", () => {
  it("keeps the immutable signed decision after the pointer is lost", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-live-receipt-"));
    roots.push(root);
    process.env.GSD_CAMPAIGNS_ROOT = root;
    const campaignId = "d16b0000-0000-4000-8000-000000000002";
    const config = liveConfig(path.join(root, "evidence"), campaignId, 1);
    const sessionRoot = campaignPlayLiveSessionRoot(config);
    fs.mkdirSync(sessionRoot, { recursive: true });
    fs.writeFileSync(path.join(sessionRoot, "browser-actions.jsonl"), "", "utf8");
    fs.writeFileSync(path.join(sessionRoot, "manifest.json"), `${JSON.stringify({
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: config.runId,
      campaignId,
      worldSource: config.worldSource,
      commit: "0000000",
      dirty: true,
      startedAt: 1,
      acceptedSnapshotHash: "a".repeat(64),
      acceptedContentHash: "b".repeat(64),
      eligibilityHash: "c".repeat(64),
      initialWorldVersion: 1,
      initialWorldHash: "d".repeat(64),
      initialRuntimeRevision: 1,
      initialRuntimeHash: "e".repeat(64),
    })}\n`, "utf8");
    const projectionHash = "f".repeat(64);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      phase: "ready",
      projectionHash,
      activeTurn: null,
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const pending = await stageCampaignPlayManualDecision({
      runConfig: config,
      control: "freeform",
      chosenText: "I wait and listen.",
      choiceHandle: null,
      decisionNote: "Signed from the current rendered state.",
      signedAt: 100,
    });
    const receiptPath = path.join(sessionRoot, pending.decisionReceiptPath);
    expect(fs.existsSync(receiptPath)).toBe(true);
    fs.rmSync(path.join(sessionRoot, "pending-decision.json"));

    await expect(stageCampaignPlayManualDecision({
      runConfig: config,
      control: "freeform",
      chosenText: "I wait and listen.",
      choiceHandle: null,
      decisionNote: "A second signing must never replace the first receipt.",
      signedAt: 101,
    })).rejects.toThrow("already awaiting a durable turn");
    const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf8")) as {
      decisionDigest: string;
      pendingDecision: { decisionDigest: string; chosenText: string };
    };
    expect(receipt.decisionDigest).toBe(pending.decisionDigest);
    expect(receipt.pendingDecision).toMatchObject({
      decisionDigest: pending.decisionDigest,
      chosenText: pending.chosenText,
    });
  });

  it("accepts only coherent completed player-turn outcomes", () => {
    expect(assertCoherentPlayerTurnTerminalReason("action_resolved")).toBe("action_resolved");
    expect(assertCoherentPlayerTurnTerminalReason("clarification_requested")).toBe("clarification_requested");
    expect(() => assertCoherentPlayerTurnTerminalReason("terminal_failure")).toThrow(
      "does not have one coherent durable result",
    );
  });

  it("keeps reconciling a healthy turn past the historical 120-second window", async () => {
    vi.useFakeTimers();
    try {
      let ready = false;
      const turnId = "turn-wait-healthy";
      const projectionHash = "a".repeat(64);
      const fetchMock = vi.fn(async (input: unknown) => {
        const url = String(input);
        if (url.endsWith("/state")) {
          return new Response(JSON.stringify({
            phase: ready ? "ready" : "acting",
            activeTurn: ready ? null : { turnId, status: "processing" },
            projectionHash,
          }), { status: 200, headers: { "content-type": "application/json" } });
        }
        return new Response(JSON.stringify({
          turn: { turnId, status: ready ? "completed" : "processing" },
          result: ready
            ? {
                status: "completed",
                narration: { turnId, narrationId: "narration-wait-healthy" },
                narrationOperation: { turnId, operationId: "operation-wait-healthy" },
              }
            : { status: "pending", narration: null, narrationOperation: null },
        }), { status: 200, headers: { "content-type": "application/json" } });
      });
      vi.stubGlobal("fetch", fetchMock);

      let settled = false;
      const resultPromise = waitForCompletedPublicTurn("campaign-wait-healthy", turnId)
        .then((result) => {
          settled = true;
          return result;
        });
      await vi.advanceTimersByTimeAsync(120_000);
      expect(settled).toBe(false);
      expect(fetchMock.mock.calls.length).toBeGreaterThan(100);

      ready = true;
      await vi.advanceTimersByTimeAsync(1_000);
      const result = await resultPromise;
      expect(result.turn).toMatchObject({ turn: { turnId, status: "completed" } });
      expect(result.readyObservedAt).toBeGreaterThanOrEqual(120_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("freezes an accepted eligible campaign before character creation and signs the next visible decision", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-live-prepare-"));
    roots.push(root);
    process.env.GSD_CAMPAIGNS_ROOT = root;
    const campaignId = "d16b0000-0000-4000-8000-000000000001";
    createSeededAcceptedCampaign(root, campaignId);
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
    const initialized = openCampaignPlayDatabase(campaignId);
    try {
      expect(createCampaignPlayStateRepository(initialized).loadState()).toMatchObject({
        authority: {
          setupPhase: "character_required",
          runtimeRevision: 1,
        },
      });
    } finally {
      initialized.close();
    }
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

  it("signs and authorizes only the same rendered choice handle and control", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-live-choice-capture-"));
    roots.push(root);
    process.env.GSD_CAMPAIGNS_ROOT = root;
    const campaignId = "d16b0000-0000-4000-8000-000000000009";
    createSeededAcceptedCampaign(root, campaignId);
    const replay = (() => {
      const handle = openCampaignPlayDatabase(campaignId);
      try {
        createCampaignPlayStateRepository(handle).createState({
          eventId: "choice-capture-session-created",
          createdAt: 1_000,
        });
        return captureCampaignPlayReplay(handle);
      } finally {
        handle.close();
      }
    })();
    const config = liveConfig(path.join(root, "evidence"), campaignId, 1);
    const sessionRoot = writeLiveSessionFixture(config, replay);
    const projectionHash = replay.report.publicState.hash;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      phase: "ready",
      activeTurn: null,
      projectionHash,
      narration: {
        suggestedActions: [{
          choiceHandle: "opaque-choice-1",
          label: "Follow the visible signal.",
        }],
      },
      utilityActions: [],
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const capture = {
      playerActionNumber: 1,
      control: "choice" as const,
      enabled: true as const,
      ready: true as const,
      chosenText: "Follow the visible signal.",
      choiceHandle: "opaque-choice-1",
      choiceContainer: "suggested" as const,
      choiceOrdinal: 0,
      visibleLabel: "Follow the visible signal.",
      renderedControlIdentity: "campaign-play-choices:0",
      visibleStateHash: projectionHash,
      capturedAt: 1_200,
    };
    await expect(stageCampaignPlayManualDecision({
      runConfig: config,
      control: "choice",
      chosenText: capture.chosenText,
      choiceHandle: "manually-entered-handle",
      choiceCapture: capture,
      decisionNote: "A manually supplied handle must never become the signed choice.",
      signedAt: 1_200,
    })).rejects.toThrow("rendered capture");
    const pending = await stageCampaignPlayManualDecision({
      runConfig: config,
      control: "choice",
      chosenText: "",
      choiceHandle: null,
      choiceCapture: capture,
      decisionNote: "The visible enabled choice is the only signed player input.",
      signedAt: 1_201,
    });
    expect(pending).toMatchObject({
      control: "choice",
      chosenText: capture.chosenText,
      choiceHandle: capture.choiceHandle,
      choiceContainer: capture.choiceContainer,
      choiceOrdinal: capture.choiceOrdinal,
      visibleLabel: capture.visibleLabel,
      renderedControlIdentity: capture.renderedControlIdentity,
      choiceCaptureAt: capture.capturedAt,
    });
    expect(assertCampaignPlayRenderedChoiceCapture(capture)).toEqual(capture);

    await expect(authorizeCampaignPlayManualChoice({
      runConfig: config,
      capture: { ...capture, renderedControlIdentity: "campaign-play-choices:1" },
    })).rejects.toThrow("cancel the pending decision before clicking");
    expect(fs.existsSync(path.join(sessionRoot, "pending-decision.json"))).toBe(true);

    await expect(authorizeCampaignPlayManualChoice({
      runConfig: config,
      capture: { ...capture, choiceHandle: "another-handle" },
    })).rejects.toThrow("cancel the pending decision before clicking");
    const authorized = await authorizeCampaignPlayManualChoice({ runConfig: config, capture });
    expect(authorized.choiceHandle).toBe(capture.choiceHandle);
    expect(assertCampaignPlayChoiceClickProof({
      ...capture,
      clickDispatchedAt: 1_202,
      clickCompletedAt: 1_203,
    })).toMatchObject({
      choiceHandle: capture.choiceHandle,
      renderedControlIdentity: capture.renderedControlIdentity,
    });
    expect(() => assertCampaignPlayReadyChoiceMatchesApi({
      phase: "ready",
      activeTurn: null,
      projectionHash,
      narration: {
        suggestedActions: [
          { choiceHandle: capture.choiceHandle, label: capture.visibleLabel },
          { choiceHandle: capture.choiceHandle, label: "Duplicate" },
        ],
      },
      utilityActions: [],
      }, capture)).toThrow("duplicate choice handle");
    expect(() => assertCampaignPlayRenderedChoiceCapture({
      ...capture,
      enabled: false,
    })).toThrow("enabled-control scalar");
    expect(() => assertCampaignPlayReadyChoiceMatchesApi({
      phase: "ready",
      activeTurn: null,
      projectionHash,
      narration: {
        suggestedActions: [{
          choiceHandle: capture.choiceHandle,
          label: capture.visibleLabel,
        }],
      },
      utilityActions: [],
    }, {
      ...capture,
      choiceOrdinal: 1,
    })).toThrow("does not match");
    expect(() => assertCampaignPlayReadyChoiceMatchesApi({
      phase: "ready",
      activeTurn: null,
      projectionHash,
      narration: {
        suggestedActions: [{
          choiceHandle: capture.choiceHandle,
          label: "Changed visible label",
        }],
      },
      utilityActions: [],
    }, capture)).toThrow("does not match");
    expect(() => assertExactPlayerInput(
      JSON.stringify({ request: { source: "suggested", choiceHandle: "different-handle" } }),
      pending,
    )).toThrow("does not match the signed manual decision");
    expect(() => assertExactPlayerInput(
      JSON.stringify({ request: { source: "suggested", choiceHandle: capture.choiceHandle } }),
      pending,
    )).not.toThrow();
  });

  it("captures a declared completed-action checkpoint across a byte-stable reload", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-live-checkpoint-"));
    roots.push(root);
    process.env.GSD_CAMPAIGNS_ROOT = root;
    const campaignId = "d16b0000-0000-4000-8000-000000000004";
    createSeededAcceptedCampaign(root, campaignId);
    const handle = openCampaignPlayDatabase(campaignId);
    try {
      createCampaignPlayStateRepository(handle).createState({
        eventId: "checkpoint-session-created",
        createdAt: 1_000,
      });
    } finally {
      handle.close();
    }
    const outputRoot = path.join(root, "evidence");
    const config = liveConfig(outputRoot, campaignId, 1, [1]);
    const settings = createDefaultSettings();
    const pricing = config.execution.kind === "live" && config.execution.billing.kind === "metered"
      ? config.execution.billing.pricing
      : null;
    settings.providers.push({
      id: "provider",
      name: "Provider",
      baseUrl: "http://localhost:1234/v1",
      apiKey: "",
      defaultModel: "generator",
    });
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
    const replay = await runAcceptedCampaignPlayReplay(campaignId, {
      playerActions: 1,
      policy: "peripheral",
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      phase: "ready",
      projectionHash: replay.report.publicState.hash,
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await expect(captureCampaignPlayReloadBoundary(config, "before", 1)).resolves.toMatchObject({
      matches: null,
    });
    await expect(captureCampaignPlayReloadBoundary(config, "after", 1)).resolves.toMatchObject({
      matches: true,
    });
    expect(fs.existsSync(path.join(sessionRoot, "checkpoints", "action-1.json"))).toBe(true);
    expect(fs.existsSync(path.join(sessionRoot, "probes", "reload-action-1-proof.json"))).toBe(true);
    await expect(captureCampaignPlayReloadBoundary(config, "after", 1))
      .rejects.toThrow("already exists");
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
          { type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 1 },
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
    ))).toMatchObject({
      planId: "pro",
      tokensFiveHours: { percentage: 1, nextResetAt: null },
    });
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
      evidenceVersion: 3,
      runId: config.runId,
      campaignId,
      worldSource: config.worldSource,
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
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      phase: "ready",
      activeTurn: null,
      projectionHash: "c".repeat(64),
    }), { status: 200, headers: { "content-type": "application/json" } })));
    await stageCampaignPlayManualDecision({
      runConfig: config,
      control: "freeform",
      chosenText,
      choiceHandle: null,
      decisionNote: "The scene gives enough reason to stay peripheral and observe the pressure.",
      signedAt: Number(playerTurn.submitted_at) - 1,
    });

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
      evidenceVersion: 3,
      runId: config.runId,
      campaignId,
      worldSource: config.worldSource,
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
    const choiceLabel = "Wait at the visible edge.";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      phase: "ready",
      activeTurn: null,
      projectionHash: "d".repeat(64),
      narration: { suggestedActions: [{ choiceHandle: document.request.choiceHandle, label: choiceLabel }] },
      utilityActions: [],
    }), { status: 200, headers: { "content-type": "application/json" } })));
    await stageCampaignPlayManualDecision({
      runConfig: config,
      control: "choice",
      chosenText: choiceLabel,
      choiceHandle: null,
      choiceCapture: {
        playerActionNumber: 1,
        control: "choice",
        enabled: true,
        ready: true,
        chosenText: choiceLabel,
        choiceHandle: document.request.choiceHandle,
        choiceContainer: "suggested",
        choiceOrdinal: 0,
        visibleLabel: choiceLabel,
        renderedControlIdentity: `suggested:0:${document.request.choiceHandle}`,
        visibleStateHash: "d".repeat(64),
        capturedAt: Number(playerTurn.submitted_at) - 2,
      },
      decisionNote: "The visible scene supports waiting without assuming hidden information.",
      signedAt: Number(playerTurn.submitted_at) - 1,
    });

    const choiceEvidence = bindCampaignPlayManualDecision(config);
    expect(choiceEvidence).toMatchObject({
      control: "choice",
      choiceHandle: document.request.choiceHandle,
    });
  });

  it("reconciles one signed click after restart with exactly-once settlement and ledger evidence", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-live-reconcile-"));
    roots.push(root);
    process.env.GSD_CAMPAIGNS_ROOT = root;
    const campaignId = "d16b0000-0000-4000-8000-000000000006";
    createSeededAcceptedCampaign(root, campaignId);
    const replay = await runAcceptedCampaignPlayReplay(campaignId, {
      playerActions: 1,
      policy: "peripheral",
      inputControl: "choice",
    });
    const config = liveConfig(path.join(root, "evidence"), campaignId, 1);
    const sessionRoot = writeLiveSessionFixture(config, replay);
    const playerTurn = replay.report.tables.turns.find((row) => row.turn_kind === "player_action")!;
    const document = JSON.parse(String(playerTurn.input_json)) as {
      frame: {
        sourceMoment: { suggestedActions: Array<{ choiceHandle: string; label: string }> };
      };
      request: { choiceHandle: string };
    };
    const choice = document.frame.sourceMoment.suggestedActions.find((action) =>
      action.choiceHandle === document.request.choiceHandle);
    if (!choice) throw new Error("The deterministic replay did not retain the signed suggested action.");
    const operation = (() => {
      const handle = openCampaignPlayDatabase(campaignId);
      try {
        return handle.sqlite.prepare(`SELECT operation_id AS operationId, narration_id AS narrationId
          FROM campaign_play_narration_operations WHERE campaign_id = ? AND turn_id = ?`).get(
            campaignId,
            playerTurn.id,
          ) as { operationId: string; narrationId: string };
      } finally {
        handle.close();
      }
    })();
    const beforeState = {
      phase: "ready",
      activeTurn: null,
      projectionHash: replay.openingProjectionHash,
      narration: { suggestedActions: [{ choiceHandle: choice.choiceHandle, label: choice.label }] },
      utilityActions: [],
    };
    const afterState = {
      phase: "ready",
      activeTurn: null,
      projectionHash: replay.publicStateHash,
      worldVersion: replay.report.authority.worldVersion,
      runtimeRevision: replay.report.authority.runtimeRevision,
    };
    const completedTurn = {
      turn: { turnId: playerTurn.id, status: "completed" },
      result: {
        status: "completed",
        narration: { turnId: playerTurn.id, narrationId: operation.narrationId },
        narrationOperation: {
          turnId: playerTurn.id,
          operationId: operation.operationId,
          sourceKind: "model_accepted",
        },
      },
    };
    let beforeDispatch = true;
    const fetchMock = vi.fn(async (input: unknown, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/state")) {
        return new Response(JSON.stringify(beforeDispatch ? beforeState : afterState), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify(completedTurn), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const submittedAt = Number(playerTurn.submitted_at);
    const choiceCapture = {
      playerActionNumber: 1,
      control: "choice" as const,
      enabled: true,
      ready: true,
      chosenText: choice.label,
      choiceHandle: choice.choiceHandle,
      choiceContainer: "suggested" as const,
      choiceOrdinal: 0,
      visibleLabel: choice.label,
      renderedControlIdentity: `suggested:0:${choice.choiceHandle}`,
      visibleStateHash: replay.openingProjectionHash,
      capturedAt: submittedAt - 2,
    };
    const pending = await stageCampaignPlayManualDecision({
      runConfig: config,
      control: "choice",
      chosenText: choice.label,
      choiceHandle: null,
      choiceCapture,
      decisionNote: "The signed rendered action was clicked once before observer restart.",
      signedAt: submittedAt - 1,
    });
    const clickProofPath = path.join(sessionRoot, "probes", "click-proof.json");
    fs.mkdirSync(path.dirname(clickProofPath), { recursive: true });
    const clickProof = {
      ...choiceCapture,
      decisionDigest: pending.decisionDigest,
      clickDispatchedAt: submittedAt,
      clickCompletedAt: submittedAt + 1,
    };
    fs.writeFileSync(clickProofPath, `${JSON.stringify(clickProof)}\n`, "utf8");
    const renderProofPath = path.join(sessionRoot, "probes", "render-proof.json");
    fs.writeFileSync(renderProofPath, `${JSON.stringify({
      playerActionNumber: 1,
      turnId: playerTurn.id,
      ready: true,
      enabledChoiceCount: 1,
      beforeProjectionHash: replay.openingProjectionHash,
      afterProjectionHash: replay.publicStateHash,
      renderedNarrationId: operation.narrationId,
      renderedSceneIdentity: operation.narrationId,
      capturedAt: submittedAt + 2,
      decisionDigest: pending.decisionDigest,
    })}\n`, "utf8");
    fs.rmSync(path.join(sessionRoot, "pending-decision.json"));
    beforeDispatch = false;

    await expect(bindCampaignPlayManualDecisionCoherent({
      runConfig: config,
      renderProofPath,
      clickProofPath,
      injectFault: () => {
        throw new Error("observer stopped after settlement");
      },
    })).rejects.toThrow("observer stopped after settlement");
    const settlementPath = path.join(sessionRoot, "probes", "settlements", "action-1.json");
    expect(fs.existsSync(settlementPath)).toBe(true);
    expect(fs.readFileSync(path.join(sessionRoot, "browser-actions.jsonl"), "utf8")).toBe("");
    expect(fs.existsSync(path.join(sessionRoot, pending.decisionReceiptPath))).toBe(true);

    const firstBound = await bindCampaignPlayManualDecisionCoherent({
      runConfig: config,
      renderProofPath,
      clickProofPath,
    });
    expect(firstBound).toMatchObject({
      playerActionNumber: 1,
      turnId: playerTurn.id,
      decisionDigest: pending.decisionDigest,
    });
    const ledgerPath = path.join(sessionRoot, "browser-actions.jsonl");
    expect(fs.readFileSync(ledgerPath, "utf8").trim().split("\n")).toHaveLength(1);
    expect(fs.existsSync(path.join(sessionRoot, "pending-decision.json"))).toBe(false);

    const repeated = await bindCampaignPlayManualDecisionCoherent({
      runConfig: config,
      renderProofPath,
      clickProofPath,
    });
    expect(repeated).toEqual(firstBound);
    expect(fs.readFileSync(ledgerPath, "utf8").trim().split("\n")).toHaveLength(1);

    const settlement = JSON.parse(fs.readFileSync(settlementPath, "utf8")) as { decisionDigest: string };
    fs.writeFileSync(settlementPath, `${JSON.stringify({ ...settlement, decisionDigest: "0".repeat(64) })}\n`, "utf8");
    await expect(bindCampaignPlayManualDecisionCoherent({
      runConfig: config,
      renderProofPath,
      clickProofPath,
    })).rejects.toThrow("existing settlement proof conflicts");
    expect(fetchMock.mock.calls.every(([, init]) =>
      ((init as RequestInit | undefined)?.method ?? "GET").toUpperCase() === "GET")).toBe(true);
  });

  it("archives one unsubmitted decision with the current projection and permits restaging", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-live-cancel-"));
    roots.push(root);
    process.env.GSD_CAMPAIGNS_ROOT = root;
    const campaignId = "d16b0000-0000-4000-8000-000000000005";
    createSeededAcceptedCampaign(root, campaignId);
    const replay = (() => {
      const handle = openCampaignPlayDatabase(campaignId);
      try {
        createCampaignPlayStateRepository(handle).createState({
          eventId: "cancel-session-created",
          createdAt: 1_000,
        });
        return captureCampaignPlayReplay(handle);
      } finally {
        handle.close();
      }
    })();
    const config = liveConfig(path.join(root, "evidence"), campaignId, 1);
    const sessionRoot = writeLiveSessionFixture(config, replay);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      phase: "ready",
      activeTurn: null,
      projectionHash: replay.report.publicState.hash,
    }), { status: 200, headers: { "content-type": "application/json" } })));

    const pending = await stageCampaignPlayManualDecision({
      runConfig: config,
      control: "freeform",
      chosenText: "I watch the signal gate from the visible edge.",
      choiceHandle: null,
      decisionNote: "The visible pressure supports observing before acting.",
      signedAt: 1_200,
    });
    const pendingPath = path.join(sessionRoot, "pending-decision.json");
    const cancellation = await cancelCampaignPlayManualDecision({
      runConfig: config,
      reason: "The operator selected a different visible route before submission.",
      cancelledAt: 1_300,
    });

    expect(cancellation).toEqual({
      runId: config.runId,
      campaignId,
      pendingDecision: pending,
      reason: "The operator selected a different visible route before submission.",
      cancelledAt: 1_300,
      publicProjectionHash: replay.report.publicState.hash,
    });
    expect(fs.existsSync(pendingPath)).toBe(false);
    const cancellationDirectory = path.join(sessionRoot, "cancelled-decisions");
    const cancellationFiles = fs.readdirSync(cancellationDirectory);
    expect(cancellationFiles).toEqual(["action-1-signed-1200.json"]);
    expect(JSON.parse(fs.readFileSync(
      path.join(cancellationDirectory, cancellationFiles[0]!),
      "utf8",
    ))).toEqual(cancellation);

    const restaged = await stageCampaignPlayManualDecision({
      runConfig: config,
      control: "freeform",
      chosenText: "I move toward the lit platform once the route is clear.",
      choiceHandle: null,
      decisionNote: "The next choice follows the same current visible state.",
      signedAt: 1_400,
    });
    expect(restaged.playerActionNumber).toBe(1);
    expect(restaged.signedAt).toBe(1_400);
  });

  it("refuses to overwrite an immutable cancellation artifact", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-live-cancel-immutable-"));
    roots.push(root);
    process.env.GSD_CAMPAIGNS_ROOT = root;
    const campaignId = "d16b0000-0000-4000-8000-000000000007";
    createSeededAcceptedCampaign(root, campaignId);
    const replay = (() => {
      const handle = openCampaignPlayDatabase(campaignId);
      try {
        createCampaignPlayStateRepository(handle).createState({
          eventId: "cancel-immutable-session-created",
          createdAt: 1_000,
        });
        return captureCampaignPlayReplay(handle);
      } finally {
        handle.close();
      }
    })();
    const config = liveConfig(path.join(root, "evidence"), campaignId, 1);
    const sessionRoot = writeLiveSessionFixture(config, replay);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      phase: "ready",
      activeTurn: null,
      projectionHash: replay.report.publicState.hash,
    }), { status: 200, headers: { "content-type": "application/json" } })));

    await stageCampaignPlayManualDecision({
      runConfig: config,
      control: "freeform",
      chosenText: "I wait at the visible boundary.",
      choiceHandle: null,
      decisionNote: "The route remains legible but not urgent.",
      signedAt: 1_200,
    });
    await cancelCampaignPlayManualDecision({
      runConfig: config,
      reason: "The first visible route was superseded before submission.",
      cancelledAt: 1_300,
    });

    await stageCampaignPlayManualDecision({
      runConfig: config,
      control: "freeform",
      chosenText: "I wait at the visible boundary again.",
      choiceHandle: null,
      decisionNote: "The evidence is unchanged, so the choice is restaged for review.",
      signedAt: 1_200,
    });
    const pendingPath = path.join(sessionRoot, "pending-decision.json");
    const pendingBytes = fs.readFileSync(pendingPath, "utf8");
    await expect(cancelCampaignPlayManualDecision({
      runConfig: config,
      reason: "This must not replace the first cancellation record.",
      cancelledAt: 1_400,
    })).rejects.toThrow(/EEXIST|already exists/i);
    expect(fs.readFileSync(pendingPath, "utf8")).toBe(pendingBytes);
  });

  it("fails closed for blank reasons, non-ready or active state, and inconsistent numbering", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-live-cancel-boundaries-"));
    roots.push(root);
    process.env.GSD_CAMPAIGNS_ROOT = root;
    const campaignId = "d16b0000-0000-4000-8000-000000000008";
    createSeededAcceptedCampaign(root, campaignId);
    const replay = (() => {
      const handle = openCampaignPlayDatabase(campaignId);
      try {
        createCampaignPlayStateRepository(handle).createState({
          eventId: "cancel-boundaries-session-created",
          createdAt: 1_000,
        });
        return captureCampaignPlayReplay(handle);
      } finally {
        handle.close();
      }
    })();
    const config = liveConfig(path.join(root, "evidence"), campaignId, 1);
    const sessionRoot = writeLiveSessionFixture(config, replay);
    const projectionHash = replay.report.publicState.hash;
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      phase: "ready",
      activeTurn: null,
      projectionHash,
    }), { status: 200, headers: { "content-type": "application/json" } })));
    await stageCampaignPlayManualDecision({
      runConfig: config,
      control: "freeform",
      chosenText: "I keep the signal in sight.",
      choiceHandle: null,
      decisionNote: "A visible boundary is enough for this signed observation.",
      signedAt: 1_200,
    });
    const pendingPath = path.join(sessionRoot, "pending-decision.json");
    const originalBytes = fs.readFileSync(pendingPath, "utf8");

    await expect(cancelCampaignPlayManualDecision({
      runConfig: config,
      reason: "   ",
      cancelledAt: 1_300,
    })).rejects.toThrow("reason");
    expect(fs.readFileSync(pendingPath, "utf8")).toBe(originalBytes);

    for (const state of [
      { phase: "opening_required", activeTurn: null },
      { phase: "ready", activeTurn: { turnId: "turn-live", status: "processing" } },
    ]) {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
        ...state,
        projectionHash,
      }), { status: 200, headers: { "content-type": "application/json" } })));
      await expect(cancelCampaignPlayManualDecision({
        runConfig: config,
        reason: "The operator has a valid reason but the state is not cancellable.",
        cancelledAt: 1_300,
      })).rejects.toThrow("ready state");
      expect(fs.readFileSync(pendingPath, "utf8")).toBe(originalBytes);
    }

    fs.writeFileSync(pendingPath, `${JSON.stringify({
      ...JSON.parse(originalBytes),
      playerActionNumber: 2,
    })}\n`, "utf8");
    const inconsistentBytes = fs.readFileSync(pendingPath, "utf8");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      phase: "ready",
      activeTurn: null,
      projectionHash,
    }), { status: 200, headers: { "content-type": "application/json" } })));
    await expect(cancelCampaignPlayManualDecision({
      runConfig: config,
      reason: "The pending action number is intentionally inconsistent.",
      cancelledAt: 1_300,
    })).rejects.toThrow("not the next action");
    expect(fs.readFileSync(pendingPath, "utf8")).toBe(inconsistentBytes);
  });

  it("refuses cancellation when a failed durable player turn exists", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-live-cancel-failed-"));
    roots.push(root);
    process.env.GSD_CAMPAIGNS_ROOT = root;
    const campaignId = "d16b0000-0000-4000-8000-000000000009";
    createSeededAcceptedCampaign(root, campaignId);
    const replay = (() => {
      const handle = openCampaignPlayDatabase(campaignId);
      try {
        createCampaignPlayStateRepository(handle).createState({
          eventId: "cancel-failed-session-created",
          createdAt: 1_000,
        });
        handle.sqlite.prepare(`INSERT INTO campaign_play_turns (
              id, campaign_id, turn_kind, input_json, input_hash, idempotency_key,
              expected_world_version, expected_runtime_revision, base_world_version,
              stage, frame_hash, next_event_sequence, worker_epoch, model_selection_json,
              resume_eligible, mutation_audit_json, submitted_at, updated_at,
              final_world_version, error_code, completed_at
            ) VALUES (?, ?, 'player_action', ?, ?, ?, 1, 1, 1, 'failed', ?, 1, 0, '{}', 0, '{}',
              2_000, 2_000, 1, 'invalid_input', 2_001)`)
          .run(
            "turn-failed",
            campaignId,
            JSON.stringify({ turnKind: "player_action", request: {}, frame: {} }),
            "a".repeat(64),
            "idempotency-failed",
            "b".repeat(64),
          );
        return captureCampaignPlayReplay(handle);
      } finally {
        handle.close();
      }
    })();
    const config = liveConfig(path.join(root, "evidence"), campaignId, 1);
    const sessionRoot = writeLiveSessionFixture(config, replay);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
        phase: "ready",
        activeTurn: null,
        projectionHash: replay.report.publicState.hash,
    }), { status: 200, headers: { "content-type": "application/json" } })));
    await stageCampaignPlayManualDecision({
      runConfig: config,
      control: "freeform",
      chosenText: "I keep watching from the visible edge.",
      choiceHandle: null,
      decisionNote: "The current durable state is evidence for refusal, not submission.",
      signedAt: 1_200,
    });
    const pendingPath = path.join(sessionRoot, "pending-decision.json");
    const pendingBytes = fs.readFileSync(pendingPath, "utf8");
    await expect(cancelCampaignPlayManualDecision({
      runConfig: config,
      reason: "A durable player turn already corresponds to this action number.",
      cancelledAt: 1_300,
    })).rejects.toThrow("unbound durable player turn");
    expect(fs.readFileSync(pendingPath, "utf8")).toBe(pendingBytes);
  });
});
