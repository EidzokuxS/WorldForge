import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CAMPAIGN_PLAY_EVIDENCE_VERSION, type CampaignPlayRunConfig } from "./contracts.js";
import { createCampaignPlayInventory, validateCampaignPlayBundle } from "./probes.js";
import { runSeededCampaignPlayReplay } from "./seeded-replay.js";
import { writeCampaignPlayBundle } from "./bundle-writer.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

describe("Campaign Play evidence bundle writer", () => {
  it("writes a promotion-eligible deterministic bundle and detects later tampering", async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-play-bundle-"));
    roots.push(outputRoot);
    const bundleRoot = path.join(outputRoot, "deterministic-one");
    const replay = await runSeededCampaignPlayReplay({ playerActions: 1, policy: "peripheral" });
    const runConfig: CampaignPlayRunConfig = {
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: "deterministic-one",
      lane: "deterministic-10",
      campaignId: replay.campaignId,
      worldSource: { kind: "fixture" },
      expectedPlayerActions: 1,
      outputRoot,
      execution: { kind: "deterministic", fixtureId: "bell-island", seed: "campaign-play-v1" },
      restartAfterPlayerActions: [],
      operators: { runner: "vitest", player: null, auditor: "campaign-play-validator" },
    };

    writeCampaignPlayBundle({
      bundleRoot,
      runConfig,
      replay,
      commit: "0000000",
      dirty: true,
      startedAt: 1_000,
      completedAt: 2_000,
    });

    const validation = validateCampaignPlayBundle(bundleRoot);
    expect(validation.issues).toEqual([]);
    expect(validation.valid).toBe(true);
    expect(validation.promotionEligible).toBe(true);
    const budget = JSON.parse(fs.readFileSync(path.join(bundleRoot, "budget.json"), "utf8")) as {
      actualCostMicros: number;
    };
    expect(budget.actualCostMicros).toBeGreaterThan(0);

    fs.appendFileSync(path.join(bundleRoot, "transcript.md"), "tampered\n", "utf8");
    const tampered = validateCampaignPlayBundle(bundleRoot);
    expect(tampered.valid).toBe(false);
    expect(tampered.issues).toContain(
      "inventory.json does not match the bundle files, byte counts, or SHA-256 hashes.",
    );
  });

  it("merges signed browser evidence into a valid first-playable bundle", async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-live-bundle-"));
    roots.push(outputRoot);
    const bundleRoot = path.join(outputRoot, "first-playable-one");
    const evidenceRoot = path.join(outputRoot, "first-playable-one.session");
    fs.mkdirSync(path.join(evidenceRoot, "screenshots"), { recursive: true });
    fs.mkdirSync(path.join(evidenceRoot, "probes"), { recursive: true });
    const replay = await runSeededCampaignPlayReplay({ playerActions: 1, policy: "peripheral" });
    const playerTurn = replay.report.tables.turns.find((row) => row.turn_kind === "player_action")!;
    fs.writeFileSync(path.join(evidenceRoot, "browser-actions.jsonl"), `${JSON.stringify({
      runId: "first-playable-one",
      campaignId: replay.campaignId,
      playerActionNumber: 1,
      control: "freeform",
      visibleStateHash: "a".repeat(64),
      chosenText: "I remain at the gate and listen.",
      choiceHandle: null,
      turnId: playerTurn.id,
      chooser: "manual-player",
      signedAt: Number(playerTurn.submitted_at) - 1,
      decisionNote: "The visible pressure makes waiting an informed peripheral action.",
    })}\n`, "utf8");
    fs.writeFileSync(path.join(evidenceRoot, "network-trace.jsonl"), "", "utf8");
    fs.writeFileSync(path.join(evidenceRoot, "human-notes.md"), "# Review\n\nThe scene remained legible.\n", "utf8");
    fs.writeFileSync(path.join(evidenceRoot, "browser-console.json"), "[]\n", "utf8");
    fs.writeFileSync(path.join(evidenceRoot, "network-errors.json"), "[]\n", "utf8");
    fs.writeFileSync(path.join(evidenceRoot, "screenshots", "ready.png"), "image", "utf8");
    fs.writeFileSync(path.join(evidenceRoot, "probes", "reload-proof.json"), "{\"matches\":true}\n", "utf8");
    const quotaSnapshot = (capturedAt: number, percentage: number) => ({
      capturedAt,
      planId: "pro",
      tokensFiveHours: { percentage, nextResetAt: 10_000 },
      tokensWeekly: { percentage: 9, nextResetAt: 20_000 },
      toolsMonthly: { limit: 1_000, used: 0, remaining: 1_000, percentage: 0, nextResetAt: 30_000 },
    });
    fs.writeFileSync(
      path.join(evidenceRoot, "probes", "subscription-quota-before.json"),
      `${JSON.stringify(quotaSnapshot(900, 1))}\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(evidenceRoot, "probes", "subscription-quota-after.json"),
      `${JSON.stringify(quotaSnapshot(2_100, 2))}\n`,
      "utf8",
    );
    const runConfig: CampaignPlayRunConfig = {
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: "first-playable-one",
      lane: "first-playable",
      campaignId: replay.campaignId,
      worldSource: {
        kind: "template",
        templateId: "accepted-world-template",
        sourceCampaignId: replay.campaignId,
        sourceCommit: "0000000",
        acceptedWorldVersion: replay.report.authority.acceptedWorldVersion,
        acceptedContentHash: replay.report.acceptedContentHash,
        stateDbSha256: "a".repeat(64),
        configSha256: "b".repeat(64),
      },
      expectedPlayerActions: 1,
      outputRoot,
      execution: {
        kind: "live",
        providerId: "provider",
        models: { generator: "generator", judge: "judge", storyteller: "storyteller" },
        billing: {
          kind: "subscription",
          providerName: "Z.AI Coding Plan",
          planId: "pro",
          currency: "USD",
          monthlyListPriceMicros: 72_000_000,
          pricingSourceUrl: "https://z.ai/subscribe",
          quotaEndpoint: "https://api.z.ai/api/monitor/usage/quota/limit",
        },
        maximumInputTokens: 10_000,
        maximumOutputTokens: 10_000,
        maximumTurnDurationMs: 120_000,
      },
      restartAfterPlayerActions: [],
      operators: { runner: "runner", player: "manual-player", auditor: "auditor" },
    };

    writeCampaignPlayBundle({
      bundleRoot,
      runConfig,
      replay,
      commit: "0000000",
      dirty: true,
      startedAt: 1_000,
      completedAt: 2_000,
      evidenceRoot,
    });

    const validation = validateCampaignPlayBundle(bundleRoot);
    expect(validation.issues).toEqual([]);
    expect(validation.valid).toBe(true);
    expect(validation.promotionEligible).toBe(true);
    expect(fs.readFileSync(path.join(bundleRoot, "human-notes.md"), "utf8"))
      .toContain("scene remained legible");
    expect(fs.existsSync(path.join(bundleRoot, "screenshots", "ready.png"))).toBe(true);
    const budget = JSON.parse(fs.readFileSync(path.join(bundleRoot, "budget.json"), "utf8")) as {
      billingKind: string;
      attributableCostMicros: number | null;
    };
    expect(budget).toMatchObject({ billingKind: "subscription", attributableCostMicros: null });
    const modelStages = fs.readFileSync(path.join(bundleRoot, "model-stages.jsonl"), "utf8")
      .split("\n").filter(Boolean).map((line) => JSON.parse(line) as { costMicros: number | null });
    expect(modelStages.every((stage) => stage.costMicros === null)).toBe(true);

    const manifestPath = path.join(bundleRoot, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      worldSource: { acceptedContentHash: string };
    };
    manifest.worldSource.acceptedContentHash = "c".repeat(64);
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    fs.writeFileSync(
      path.join(bundleRoot, "inventory.json"),
      `${JSON.stringify(createCampaignPlayInventory(bundleRoot, runConfig.runId), null, 2)}\n`,
      "utf8",
    );
    expect(validateCampaignPlayBundle(bundleRoot).issues).toContain(
      "Template provenance does not match the eligible accepted world.",
    );
  });
});
