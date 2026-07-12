import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CAMPAIGN_PLAY_EVIDENCE_VERSION, type CampaignPlayRunConfig } from "./contracts.js";
import { validateCampaignPlayBundle } from "./probes.js";
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

    fs.appendFileSync(path.join(bundleRoot, "transcript.md"), "tampered\n", "utf8");
    const tampered = validateCampaignPlayBundle(bundleRoot);
    expect(tampered.valid).toBe(false);
    expect(tampered.issues).toContain(
      "inventory.json does not match the bundle files, byte counts, or SHA-256 hashes.",
    );
  });
});
