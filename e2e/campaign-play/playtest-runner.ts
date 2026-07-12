import { assertCampaignPlayBundle } from "./probes.js";
import { runSeededCampaignPlayReplay } from "./seeded-replay.js";

type DeterministicLane = "deterministic-10" | "deterministic-30" | "deterministic-60";

function argumentValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${name} requires one value.`);
  }
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

async function runDeterministicLane(lane: DeterministicLane): Promise<void> {
  const playerActions = deterministicActionCount(lane);
  const startedAt = Date.now();
  const first = await runSeededCampaignPlayReplay({ playerActions, policy: "peripheral" });
  process.stderr.write(`${lane}: first replay complete\n`);
  const second = await runSeededCampaignPlayReplay({ playerActions, policy: "peripheral" });
  process.stderr.write(`${lane}: second replay complete\n`);
  if (first.canonicalBytes !== second.canonicalBytes || first.replayHash !== second.replayHash) {
    throw new Error(`${lane} diverged across identical replays.`);
  }
  if (
    first.completedPlayerActions !== playerActions
    || first.openingTurns !== 1
    || first.integrity !== "ok"
    || first.foreignKeyViolations !== 0
    || first.terminalStages.some((stage) => stage !== "completed")
  ) {
    throw new Error(`${lane} failed its deterministic promotion invariants.`);
  }
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
    durationMs: Date.now() - startedAt,
  })}\n`);
}

export async function runCampaignPlayCommand(): Promise<void> {
  const bundlePath = argumentValue("--validate");
  const lane = argumentValue("--lane");
  if ((bundlePath === null) === (lane === null)) {
    throw new Error("Choose exactly one command: --validate <bundle> or --lane <deterministic lane>.");
  }
  if (bundlePath !== null) {
    const validation = assertCampaignPlayBundle(bundlePath);
    process.stdout.write(`${JSON.stringify(validation)}\n`);
    return;
  }
  await runDeterministicLane(lane as DeterministicLane);
}

runCampaignPlayCommand().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
