import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CAMPAIGN_PLAY_EVIDENCE_VERSION, type CampaignPlayRunConfig } from "./contracts.js";
import { createCampaignPlayInventory, validateCampaignPlayBundle } from "./probes.js";
import type { CampaignPlayCanonicalReport } from "./replay-report.js";
import { runSeededCampaignPlayReplay } from "./seeded-replay.js";
import { writeCampaignPlayBundle } from "./bundle-writer.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { force: true, recursive: true });
});

describe("Campaign Play evidence bundle writer", () => {
  it("serializes nine actor schedules and four plans with truthful lazy nulls", () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-lazy-bundle-"));
    roots.push(outputRoot);
    const bundleRoot = path.join(outputRoot, "lazy-schedules-one");
    const actorRows = [
      { id: "actor-a", kind: "person" as const, role: "key" as const },
      { id: "actor-b", kind: "person" as const, role: "support" as const },
      { id: "actor-c", kind: "person" as const, role: "support" as const },
      { id: "actor-d", kind: "person" as const, role: "background" as const },
      { id: "actor-e", kind: "person" as const, role: "background" as const },
      { id: "actor-f", kind: "person" as const, role: "key" as const },
      { id: "actor-g", kind: "person" as const, role: "support" as const },
      { id: "actor-h", kind: "person" as const, role: "background" as const },
      { id: "actor-i", kind: "person" as const, role: "background" as const },
    ];
    const planRows = ["plan-a", "plan-b", "plan-c", "plan-d"]
      .map((planId) => ({ plan_id: planId }));
    const scheduleRows = actorRows.map((actor, index) => ({
      actor_id: actor.id,
      schedule_id: `schedule-${index + 1}`,
      plan_id: index < planRows.length ? planRows[index]!.plan_id : null,
    }));
    const acceptedSnapshot = {
      locations: ["location-a", "location-b", "location-c"].map((id) => ({ id, kind: "macro" })),
      actors: actorRows,
      goals: actorRows.map((actor, index) => ({ id: `goal-${index + 1}`, actorId: actor.id })),
      placements: actorRows.map((actor, index) => ({ id: `placement-${index + 1}`, actorId: actor.id })),
      pressures: [{ id: "pressure-a" }, { id: "pressure-b" }],
    };
    const emptyTables = {
      runtimeEvents: [], turns: [], turnResults: [], turnEvents: [], modelStages: [], narrations: [],
      commands: [], receipts: [], worldEvents: [], exposures: [{ exposure_id: "exposure-a", channel: "direct" }],
      routeStates: [], actorConditions: [], pressureStates: [], plans: planRows, schedules: scheduleRows,
      dueSets: [], jobs: [], proposals: [], knowledge: [], observations: [],
    };
    const report = {
      campaignId: "campaign-one",
      acceptedSnapshotJson: JSON.stringify(acceptedSnapshot),
      acceptedSnapshotHash: "a".repeat(64),
      acceptedContentHash: "b".repeat(64),
      authority: { acceptedWorldVersion: 1, worldVersion: 1, runtimeRevision: 0, worldHash: "c".repeat(64), runtimeHash: "d".repeat(64) },
      eligibility: { hash: "e".repeat(64) },
      mechanical: { projection: { human: { actorId: "player-one" } } },
      publicState: { hash: "f".repeat(64) },
      protectedAudit: { hash: "1".repeat(64) },
      tables: emptyTables,
      integrity: "ok",
      foreignKeyViolations: 0,
    } as unknown as CampaignPlayCanonicalReport;
    const runConfig: CampaignPlayRunConfig = {
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: "lazy-schedules-one",
      lane: "deterministic-10",
      campaignId: "campaign-one",
      worldSource: { kind: "fixture" },
      expectedPlayerActions: 0,
      outputRoot,
      execution: { kind: "deterministic", fixtureId: "bell-island", seed: "campaign-play-v1" },
      restartAfterPlayerActions: [],
      operators: { runner: "vitest", player: null, auditor: "campaign-play-validator" },
    };

    writeCampaignPlayBundle({
      bundleRoot,
      runConfig,
      replay: {
        campaignId: "campaign-one",
        completedPlayerActions: 0,
        canonicalBytes: "{}",
        replayHash: "2".repeat(64),
        restartProjectionMatches: true,
        unboundObservationHandles: [],
        report,
      },
      commit: "0000000",
      dirty: true,
      startedAt: 1_000,
      completedAt: 2_000,
    });

    const eligibility = JSON.parse(fs.readFileSync(path.join(bundleRoot, "eligibility.json"), "utf8")) as {
      activeActors: Array<{ planId: string | null; scheduleId: string }>;
      planIds: string[];
      scheduleIds: string[];
    };
    expect(eligibility.planIds).toHaveLength(4);
    expect(eligibility.scheduleIds).toHaveLength(9);
    expect(eligibility.activeActors.map((actor) => actor.planId)).toEqual([
      "plan-a", "plan-b", "plan-c", "plan-d", null, null, null, null, null,
    ]);
    expect(JSON.stringify(eligibility)).not.toContain("missing:");
  });

  it("writes a promotion-eligible deterministic bundle and detects later tampering", async () => {
    const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-play-bundle-"));
    roots.push(outputRoot);
    const bundleRoot = path.join(outputRoot, "deterministic-one");
    const replay = await runSeededCampaignPlayReplay({
      playerActions: 1,
      policy: "peripheral",
      inputControl: "choice",
    });
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
    const input = fs.readFileSync(path.join(bundleRoot, "inputs.jsonl"), "utf8")
      .split("\n").filter(Boolean).map((line) => JSON.parse(line) as { source: string })[0];
    expect(input?.source).toBe("choice");
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
    fs.mkdirSync(path.join(evidenceRoot, "checkpoints"), { recursive: true });
    fs.mkdirSync(path.join(evidenceRoot, "probes"), { recursive: true });
    const replay = await runSeededCampaignPlayReplay({ playerActions: 1, policy: "peripheral" });
    const playerTurn = replay.report.tables.turns.find((row) => row.turn_kind === "player_action")!;
    fs.writeFileSync(path.join(evidenceRoot, "browser-actions.jsonl"), `${JSON.stringify({
      runId: "first-playable-one",
      campaignId: replay.campaignId,
      playerActionNumber: 1,
      control: "freeform",
      visibleStateHash: "a".repeat(64),
      decisionDigest: "e".repeat(64),
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
    const checkpoint = {
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: "first-playable-one",
      campaignId: replay.campaignId,
      checkpointId: "action-1",
      afterPlayerAction: 1,
      recordedAt: 1_900,
      acceptedSnapshotHash: replay.report.acceptedSnapshotHash,
      worldVersion: replay.report.authority.worldVersion,
      worldHash: replay.report.authority.worldHash,
      runtimeRevision: replay.report.authority.runtimeRevision,
      runtimeHash: replay.report.authority.runtimeHash,
      publicProjectionHash: replay.report.publicState.hash,
      protectedAuditHash: replay.report.protectedAudit.hash,
      eventCursor: replay.report.tables.runtimeEvents.length,
      sqliteIntegrity: replay.report.integrity,
      foreignKeyViolations: replay.report.foreignKeyViolations,
    };
    fs.writeFileSync(
      path.join(evidenceRoot, "checkpoints", "action-1.json"),
      `${JSON.stringify(checkpoint)}\n`,
      "utf8",
    );
    const checkpointHash = crypto.createHash("sha256")
      .update(JSON.stringify({ ...checkpoint, recordedAt: 0 }))
      .digest("hex");
    fs.writeFileSync(path.join(evidenceRoot, "probes", "reload-action-1-proof.json"), `${JSON.stringify({
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: "first-playable-one",
      campaignId: replay.campaignId,
      afterPlayerAction: 1,
      beforePublicStateHash: "d".repeat(64),
      afterPublicStateHash: "d".repeat(64),
      beforeReplayHash: replay.replayHash,
      afterReplayHash: replay.replayHash,
      beforeCheckpointHash: checkpointHash,
      afterCheckpointHash: checkpointHash,
      matches: true,
    })}\n`, "utf8");
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
        packageId: "accepted-world-template",
        packagePath: path.join(outputRoot, "template"),
        manifestPath: path.join(outputRoot, "template", "template.json"),
        manifestSha256: "c".repeat(64),
        packageSha256: "d".repeat(64),
        schemaMigrationId: "sqlite-schema-test",
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
        maximumOutputTokens: 32_768,
        maximumTurnDurationMs: 120_000,
      },
      restartAfterPlayerActions: [1],
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
    const bundledCheckpoint = JSON.parse(
      fs.readFileSync(path.join(bundleRoot, "checkpoints", "action-1.json"), "utf8"),
    ) as { recordedAt: number };
    expect(bundledCheckpoint.recordedAt).toBe(1_900);
    const budget = JSON.parse(fs.readFileSync(path.join(bundleRoot, "budget.json"), "utf8")) as {
      billingKind: string;
      attributableCostMicros: number | null;
    };
    expect(budget).toMatchObject({ billingKind: "subscription", attributableCostMicros: null });
    const modelStages = fs.readFileSync(path.join(bundleRoot, "model-stages.jsonl"), "utf8")
      .split("\n").filter(Boolean).map((line) => JSON.parse(line) as { costMicros: number | null });
    expect(modelStages.every((stage) => stage.costMicros === null)).toBe(true);

    const reloadProofPath = path.join(bundleRoot, "probes", "reload-action-1-proof.json");
    const reloadProof = JSON.parse(fs.readFileSync(reloadProofPath, "utf8")) as { matches: boolean };
    fs.writeFileSync(reloadProofPath, `${JSON.stringify({ ...reloadProof, matches: false }, null, 2)}\n`, "utf8");
    fs.writeFileSync(
      path.join(bundleRoot, "inventory.json"),
      `${JSON.stringify(createCampaignPlayInventory(bundleRoot, runConfig.runId), null, 2)}\n`,
      "utf8",
    );
    expect(validateCampaignPlayBundle(bundleRoot).issues).toContain(
      "Reload proof for action 1 is invalid or divergent.",
    );
    fs.writeFileSync(reloadProofPath, `${JSON.stringify(reloadProof, null, 2)}\n`, "utf8");

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
