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
      pricing: { generator: pricing, judge: pricing, storyteller: pricing },
      maximumInputTokens: 10_000,
      maximumOutputTokens: 10_000,
      maximumCostMicros: 1_000_000,
      maximumTurnDurationMs: 120_000,
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
    const pricing = config.execution.kind === "live" ? config.execution.pricing : null;
    settings.providers.push(localProvider);
    settings.generator = { ...settings.generator, providerId: "provider", model: "generator", pricing: pricing?.generator };
    settings.judge = { ...settings.judge, providerId: "provider", model: "judge", pricing: pricing?.judge };
    settings.storyteller = { ...settings.storyteller, providerId: "provider", model: "storyteller", pricing: pricing?.storyteller };
    const sessionRoot = prepareCampaignPlayLiveSession({
      runConfig: config,
      commit: "0000000",
      dirty: true,
      startedAt: 1_100,
      settings,
    });
    expect(sessionRoot).toBe(campaignPlayLiveSessionRoot(config));
    expect(fs.existsSync(path.join(sessionRoot, "probes", "eligibility-freeze.json"))).toBe(true);
    expect(() => prepareCampaignPlayLiveSession({
      runConfig: config,
      commit: "0000000",
      dirty: true,
      startedAt: 1_100,
      settings,
    })).toThrow("already exists");

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
});
