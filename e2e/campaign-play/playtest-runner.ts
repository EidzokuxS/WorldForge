import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { writeCampaignPlayBundle } from "./bundle-writer.js";
import {
  campaignPlayRunConfigSchema,
  type CampaignPlayRunConfig,
} from "./contracts.js";
import { assertCampaignPlayBundle } from "./probes.js";
import { runSeededCampaignPlayReplay } from "./seeded-replay.js";

type DeterministicLane = "deterministic-10" | "deterministic-30" | "deterministic-60";

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} requires one value.`);
  return value;
}

function deterministicActionCount(lane: string): 10 | 30 | 60 {
  switch (lane) {
    case "deterministic-10": return 10;
    case "deterministic-30": return 30;
    case "deterministic-60": return 60;
    default: throw new Error(`Unsupported deterministic lane: ${lane}.`);
  }
}

function loadRunConfig(filePath: string): CampaignPlayRunConfig {
  return campaignPlayRunConfigSchema.parse(
    JSON.parse(fs.readFileSync(path.resolve(filePath), "utf8")) as unknown,
  );
}

function gitText(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

async function runDeterministicLane(config: CampaignPlayRunConfig): Promise<void> {
  if (config.execution.kind !== "deterministic") {
    throw new Error("The deterministic runner requires a deterministic execution config.");
  }
  const lane = config.lane as DeterministicLane;
  const playerActions = deterministicActionCount(lane);
  if (config.expectedPlayerActions !== playerActions) {
    throw new Error(`${lane} requires exactly ${playerActions} configured player actions.`);
  }
  const startedAt = Date.now();
  const options = {
    playerActions,
    policy: "peripheral" as const,
    restartAfterPlayerActions: config.restartAfterPlayerActions,
  };
  const first = await runSeededCampaignPlayReplay(options);
  process.stderr.write(`${lane}: first replay complete\n`);
  const second = await runSeededCampaignPlayReplay(options);
  process.stderr.write(`${lane}: second replay complete\n`);
  if (first.canonicalBytes !== second.canonicalBytes || first.replayHash !== second.replayHash) {
    throw new Error(`${lane} diverged across identical replays.`);
  }
  if (
    first.completedPlayerActions !== playerActions
    || first.openingTurns !== 1
    || first.integrity !== "ok"
    || first.foreignKeyViolations !== 0
    || !first.restartProjectionMatches
    || first.terminalStages.some((stage) => stage !== "completed")
  ) {
    throw new Error(`${lane} failed its deterministic promotion invariants.`);
  }

  const completedAt = Date.now();
  const bundleRoot = path.resolve(config.outputRoot, config.runId);
  writeCampaignPlayBundle({
    bundleRoot,
    runConfig: { ...config, campaignId: first.campaignId },
    replay: first,
    commit: gitText("rev-parse", "HEAD"),
    dirty: gitText("status", "--porcelain").length > 0,
    startedAt,
    completedAt,
  });
  const validation = assertCampaignPlayBundle(bundleRoot);
  process.stdout.write(`${JSON.stringify({
    lane,
    playerActions,
    openingTurn: 0,
    replayHash: first.replayHash,
    canonicalBytes: Buffer.byteLength(first.canonicalBytes, "utf8"),
    receipts: first.receiptCount,
    runtimeEvents: first.runtimeEventCount,
    turnEvents: first.turnEventCount,
    integrity: first.integrity,
    foreignKeyViolations: first.foreignKeyViolations,
    durationMs: completedAt - startedAt,
    bundleRoot,
    promotionEligible: validation.promotionEligible,
  })}\n`);
}

export async function runCampaignPlayCommand(): Promise<void> {
  const bundlePath = argumentValue("--validate");
  const runConfigPath = argumentValue("--run-config");
  if ((bundlePath === null) === (runConfigPath === null)) {
    throw new Error("Choose exactly one command: --validate <bundle> or --run-config <json>.");
  }
  if (bundlePath !== null) {
    const validation = assertCampaignPlayBundle(path.resolve(bundlePath));
    process.stdout.write(`${JSON.stringify(validation)}\n`);
    return;
  }
  await runDeterministicLane(loadRunConfig(runConfigPath!));
}

runCampaignPlayCommand().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
