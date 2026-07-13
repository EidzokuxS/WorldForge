import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { writeCampaignPlayBundle } from "./bundle-writer.js";
import { openCampaignPlayDatabase } from "../../backend/src/campaign-play/campaign-play-database.js";
import {
  campaignPlayRunConfigSchema,
  type CampaignPlayRunConfig,
} from "./contracts.js";
import { assertCampaignPlayBundle } from "./probes.js";
import {
  bindCampaignPlayManualDecision,
  captureCampaignPlayReloadBoundary,
  captureCampaignPlaySubscriptionQuota,
  loadCampaignPlayLiveSession,
  prepareCampaignPlayLiveSession,
  stageCampaignPlayManualDecision,
} from "./live-session.js";
import { captureCampaignPlayReplay } from "./replay-report.js";
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

async function runLiveLane(config: CampaignPlayRunConfig, phase: string): Promise<void> {
  if (config.execution.kind !== "live" || config.campaignId === null) {
    throw new Error("A live runner phase requires live execution and a campaign ID.");
  }
  switch (phase) {
    case "prepare": {
      const root = await prepareCampaignPlayLiveSession({
        runConfig: config,
        commit: gitText("rev-parse", "HEAD"),
        dirty: gitText("status", "--porcelain").length > 0,
        startedAt: Date.now(),
      });
      process.stdout.write(`${JSON.stringify({ phase, root, campaignId: config.campaignId })}\n`);
      return;
    }
    case "decide": {
      const control = argumentValue("--control");
      if (control !== "choice" && control !== "freeform") {
        throw new Error("--control must be choice or freeform.");
      }
      const pending = await stageCampaignPlayManualDecision({
        runConfig: config,
        control,
        chosenText: argumentValue("--chosen-text") ?? "",
        choiceHandle: argumentValue("--choice-handle"),
        decisionNote: argumentValue("--decision-note") ?? "",
        signedAt: Date.now(),
      });
      process.stdout.write(`${JSON.stringify({ phase, pending })}\n`);
      return;
    }
    case "bind": {
      const evidence = bindCampaignPlayManualDecision(config);
      process.stdout.write(`${JSON.stringify({ phase, evidence })}\n`);
      return;
    }
    case "reload-before":
    case "reload-after": {
      const boundary = phase === "reload-before" ? "before" : "after";
      const checkpointArgument = argumentValue("--after-player-action");
      const afterPlayerAction = checkpointArgument === null
        ? null
        : Number.parseInt(checkpointArgument, 10);
      if (
        afterPlayerAction !== null
        && (!Number.isSafeInteger(afterPlayerAction) || afterPlayerAction < 0)
      ) {
        throw new Error("--after-player-action must be a nonnegative integer.");
      }
      const result = await captureCampaignPlayReloadBoundary(
        config,
        boundary,
        afterPlayerAction,
      );
      process.stdout.write(`${JSON.stringify({ phase, ...result })}\n`);
      return;
    }
    case "finalize": {
      await captureCampaignPlaySubscriptionQuota(config);
      const session = loadCampaignPlayLiveSession(config);
      if (!session.reloadMatches) throw new Error("The live UI reload did not preserve public state bytes.");
      if (session.browserActions.length !== config.expectedPlayerActions) {
        throw new Error("The live session does not contain one signed browser action per completed action.");
      }
      const handle = openCampaignPlayDatabase(config.campaignId);
      try {
        const captured = captureCampaignPlayReplay(handle);
        const completedPlayerActions = captured.report.tables.turns.filter((row) =>
          row.turn_kind === "player_action" && row.stage === "completed").length;
        if (completedPlayerActions !== config.expectedPlayerActions) {
          throw new Error("The live campaign did not reach its configured completed-action target.");
        }
        if (
          captured.report.acceptedSnapshotHash !== session.manifest.acceptedSnapshotHash
          || captured.report.acceptedContentHash !== session.manifest.acceptedContentHash
          || captured.report.eligibility.hash !== session.manifest.eligibilityHash
        ) {
          throw new Error("Accepted Campaign World provenance or eligibility drifted during live play.");
        }
        const bundleRoot = path.resolve(config.outputRoot, config.runId);
        writeCampaignPlayBundle({
          bundleRoot,
          runConfig: config,
          replay: {
            campaignId: config.campaignId,
            completedPlayerActions,
            canonicalBytes: captured.canonicalBytes,
            replayHash: captured.replayHash,
            restartProjectionMatches: true,
            unboundObservationHandles: captured.unboundObservationHandles,
            report: captured.report,
          },
          commit: session.manifest.commit,
          dirty: session.manifest.dirty,
          startedAt: session.manifest.startedAt,
          completedAt: Date.now(),
          evidenceRoot: session.root,
        });
        const validation = assertCampaignPlayBundle(bundleRoot);
        process.stdout.write(`${JSON.stringify({
          phase,
          bundleRoot,
          completedPlayerActions,
          replayHash: captured.replayHash,
          promotionEligible: validation.promotionEligible,
        })}\n`);
      } finally {
        handle.close();
      }
      return;
    }
    default:
      throw new Error("--live-phase must be prepare, decide, bind, reload-before, reload-after, or finalize.");
  }
}

export async function runCampaignPlayCommand(): Promise<void> {
  const bundlePath = argumentValue("--validate");
  const runConfigPath = argumentValue("--run-config");
  const declaredLane = argumentValue("--lane");
  if ((bundlePath === null) === (runConfigPath === null)) {
    throw new Error("Choose exactly one command: --validate <bundle> or --run-config <json>.");
  }
  if (bundlePath !== null) {
    const validation = assertCampaignPlayBundle(path.resolve(bundlePath));
    process.stdout.write(`${JSON.stringify(validation)}\n`);
    return;
  }
  const config = loadRunConfig(runConfigPath!);
  if (declaredLane !== null && declaredLane !== config.lane) {
    throw new Error("--lane does not match the run config.");
  }
  if (config.execution.kind === "deterministic") {
    await runDeterministicLane(config);
    return;
  }
  await runLiveLane(config, argumentValue("--live-phase") ?? "finalize");
}

runCampaignPlayCommand().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
