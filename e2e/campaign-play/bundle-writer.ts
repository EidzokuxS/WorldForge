import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  CAMPAIGN_PLAY_EVIDENCE_VERSION,
  campaignPlayActorJobEvidenceSchema,
  campaignPlayBrowserActionEvidenceSchema,
  campaignPlayBudgetSchema,
  campaignPlayCheckpointSchema,
  campaignPlayEligibilitySchema,
  campaignPlayInputEvidenceSchema,
  campaignPlayManifestSchema,
  campaignPlayModelStageEvidenceSchema,
  campaignPlayNetworkEvidenceSchema,
  campaignPlayReceiptEvidenceSchema,
  campaignPlayRunConfigSchema,
  campaignPlayRuntimeEventEvidenceSchema,
  campaignPlayTurnEvidenceSchema,
  campaignPlayVisibilityEvidenceSchema,
  type CampaignPlayRunConfig,
} from "./contracts.js";
import { createCampaignPlayInventory } from "./probes.js";
import type { CampaignPlayCanonicalReport } from "./replay-report.js";
import { createCampaignPlayScorecard } from "./scorecard.js";

type RawRow = Record<string, unknown>;

export interface CampaignPlayBundleReplay {
  campaignId: string;
  completedPlayerActions: number;
  canonicalBytes: string;
  replayHash: string;
  restartProjectionMatches: boolean;
  unboundObservationHandles: string[];
  report: CampaignPlayCanonicalReport;
}

export interface WriteCampaignPlayBundleInput {
  bundleRoot: string;
  runConfig: CampaignPlayRunConfig;
  replay: CampaignPlayBundleReplay;
  commit: string;
  dirty: boolean;
  startedAt: number;
  completedAt: number;
  evidenceRoot?: string;
}

function hash(value: string | Buffer): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function value<T>(row: RawRow, key: string): T {
  if (!(key in row)) throw new Error(`Campaign Play evidence row is missing ${key}.`);
  return row[key] as T;
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeJsonLines(filePath: string, records: unknown[]): void {
  fs.writeFileSync(
    filePath,
    records.length === 0 ? "" : `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );
}

function readJsonLines(filePath: string): unknown[] {
  const text = fs.readFileSync(filePath, "utf8");
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as unknown);
}

function copyEvidenceDirectory(source: string, target: string): void {
  if (!fs.existsSync(source)) return;
  fs.cpSync(source, target, { recursive: true });
}

function actionNumberByTurn(turnRows: RawRow[]): Map<string, number> {
  const result = new Map<string, number>();
  let actionNumber = 0;
  for (const turn of turnRows) {
    if (value<string>(turn, "turn_kind") !== "player_action") continue;
    actionNumber += 1;
    result.set(value<string>(turn, "id"), actionNumber);
  }
  return result;
}

function terminalRuntimeRevision(runtimeRows: RawRow[], turnId: string): number {
  const revisions = runtimeRows
    .filter((row) => value<string | null>(row, "turn_id") === turnId)
    .map((row) => value<number>(row, "result_runtime_revision"));
  if (revisions.length === 0) throw new Error(`Turn ${turnId} has no runtime event.`);
  return Math.max(...revisions);
}

function playerActorId(report: CampaignPlayCanonicalReport): string {
  const record = report.mechanical.projection as { human?: { actorId?: unknown } };
  const actorId = record.human?.actorId;
  if (typeof actorId !== "string" || actorId.length === 0) {
    throw new Error("Campaign Play mechanical report lacks the human actor.");
  }
  return actorId;
}

function actorSource(command: RawRow, humanActorId: string): string {
  const source = JSON.parse(value<string>(command, "source_json")) as {
    kind?: string;
    actorId?: string;
    system?: string;
  };
  if (source.kind === "actor" && source.actorId) return source.actorId;
  return source.system ? `system:${source.system}` : humanActorId;
}

interface FrozenModelPricing {
  known: boolean;
  tokenUnit: number;
  inputCostMicros: number;
  outputCostMicros: number;
}

interface FrozenRequestedModel {
  pricing: FrozenModelPricing;
}

function requestedModelForStage(turn: RawRow, kind: string): FrozenRequestedModel {
  const selection = JSON.parse(value<string>(turn, "model_selection_json")) as {
    turnKind: "opening" | "player_action";
    openingPlanner?: FrozenRequestedModel;
    judge?: FrozenRequestedModel;
    gameMaster?: FrozenRequestedModel;
    actorReplanner?: FrozenRequestedModel;
    narrator: FrozenRequestedModel;
  };
  const requested = kind === "opening_planner"
    ? selection.openingPlanner
    : kind === "judge"
      ? selection.judge
      : kind === "game_master"
        ? selection.gameMaster
        : kind === "actor_replanner"
          ? selection.actorReplanner
          : kind === "narrator"
            ? selection.narrator
            : undefined;
  if (!requested) throw new Error(`Campaign Play model selection is missing ${kind}.`);
  return requested;
}

function modelCostMicros(inputTokens: number, outputTokens: number, pricing: FrozenModelPricing): number {
  if (!pricing.known) throw new Error("Campaign Play live evidence requires known frozen model pricing.");
  return Math.ceil(inputTokens * pricing.inputCostMicros / pricing.tokenUnit)
    + Math.ceil(outputTokens * pricing.outputCostMicros / pricing.tokenUnit);
}

export function writeCampaignPlayBundle(input: WriteCampaignPlayBundleInput): void {
  const config = campaignPlayRunConfigSchema.parse(input.runConfig);
  if (config.runId.length === 0 || config.campaignId !== null && config.campaignId !== input.replay.campaignId) {
    throw new Error("Campaign Play run config does not match the replay campaign.");
  }
  if (config.expectedPlayerActions !== input.replay.completedPlayerActions) {
    throw new Error("Campaign Play replay did not reach its configured action target.");
  }
  if (fs.existsSync(input.bundleRoot)) {
    throw new Error(`Campaign Play bundle already exists: ${input.bundleRoot}`);
  }
  for (const directory of ["build", "checkpoints", "probes", "screenshots"]) {
    fs.mkdirSync(path.join(input.bundleRoot, directory), { recursive: true });
  }

  const report = input.replay.report;
  const turnRows = report.tables.turns;
  const actionNumbers = actionNumberByTurn(turnRows);
  const runConfigBytes = JSON.stringify(config);
  writeJson(path.join(input.bundleRoot, "build", "run-config.json"), config);

  const accepted = JSON.parse(report.acceptedSnapshotJson) as {
    locations: Array<{ id: string; kind: string }>;
    actors: Array<{ id: string; kind: "person" | "collective"; role: "key" | "support" | "background" }>;
    goals: Array<{ id: string; actorId: string }>;
    placements: Array<{ id: string; actorId: string }>;
    pressures: Array<{ id: string }>;
  };
  const placementByActor = new Map(accepted.placements.map((placement) => [placement.actorId, placement.id]));
  const goalsByActor = new Map<string, string[]>();
  for (const goal of accepted.goals) {
    goalsByActor.set(goal.actorId, [...(goalsByActor.get(goal.actorId) ?? []), goal.id]);
  }
  const activeActors = accepted.actors
    .filter((actor): actor is typeof actor & { role: "key" | "support" } => actor.role !== "background")
    .map((actor) => ({
      actorId: actor.id,
      kind: actor.kind,
      role: actor.role,
      placementId: placementByActor.get(actor.id) ?? `missing:${actor.id}`,
      goalIds: goalsByActor.get(actor.id) ?? [],
    }));
  const eligibility = campaignPlayEligibilitySchema.parse({
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    campaignId: input.replay.campaignId,
    frozenAt: input.startedAt,
    acceptedWorldVersion: report.authority.acceptedWorldVersion,
    acceptedSnapshotHash: report.acceptedSnapshotHash,
    acceptedContentHash: report.acceptedContentHash,
    topologyHash: report.eligibility.hash,
    reachableLocationIds: accepted.locations.filter((location) => location.kind === "macro")
      .map((location) => location.id),
    activeActors,
    pressureAnchorIds: accepted.pressures.map((pressure) => pressure.id),
    openingCandidateIds: accepted.locations.filter((location) => location.kind === "macro")
      .map((location) => location.id),
    exposurePathIds: report.tables.exposures.map((row) => value<string>(row, "exposure_id")),
    planIds: report.tables.plans.map((row) => value<string>(row, "plan_id")),
    scheduleIds: report.tables.schedules.map((row) => value<string>(row, "schedule_id")),
  });
  writeJson(path.join(input.bundleRoot, "eligibility.json"), eligibility);
  const eligibilityHash = hash(JSON.stringify(eligibility));

  const manifest = campaignPlayManifestSchema.parse({
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    runId: config.runId,
    campaignId: input.replay.campaignId,
    parentCampaignId: null,
    lane: config.lane,
    commit: input.commit,
    dirty: input.dirty,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    openingTurn: 0,
    completedPlayerActions: input.replay.completedPlayerActions,
    status: "complete",
    runConfigHash: hash(runConfigBytes),
    eligibilityHash,
  });
  writeJson(path.join(input.bundleRoot, "manifest.json"), manifest);

  const turns = turnRows.map((row) => {
    const turnId = value<string>(row, "id");
    const turnKind = value<"opening" | "player_action">(row, "turn_kind");
    return campaignPlayTurnEvidenceSchema.parse({
      runId: config.runId,
      campaignId: input.replay.campaignId,
      turnId,
      turnKind,
      openingTurn: turnKind === "opening" ? 0 : null,
      playerActionNumber: turnKind === "player_action" ? actionNumbers.get(turnId) : null,
      status: value<string>(row, "stage"),
      worldVersion: value<number>(row, "final_world_version"),
      runtimeRevision: terminalRuntimeRevision(report.tables.runtimeEvents, turnId),
      eventCursor: value<number>(row, "next_event_sequence") - 1,
      submittedAt: value<number>(row, "submitted_at"),
      completedAt: value<number | null>(row, "completed_at"),
      publicResultHash: value<string | null>(row, "public_packet_hash"),
    });
  });
  writeJsonLines(path.join(input.bundleRoot, "turns.jsonl"), turns);

  const inputs = turnRows.flatMap((row) => {
    if (value<string>(row, "turn_kind") !== "player_action") return [];
    const turnId = value<string>(row, "id");
    const document = JSON.parse(value<string>(row, "input_json")) as {
      request: {
        idempotencyKey: string;
        source: "choice" | "freeform";
        choiceHandle?: string;
        text?: string;
      };
    };
    const request = document.request;
    return [campaignPlayInputEvidenceSchema.parse({
      runId: config.runId,
      campaignId: input.replay.campaignId,
      inputId: `input:${turnId}`,
      idempotencyKey: request.idempotencyKey,
      playerActionNumber: actionNumbers.get(turnId),
      source: request.source,
      choiceHandle: request.choiceHandle ?? null,
      text: request.text ?? null,
      visibleStateHash: value<string>(row, "frame_hash"),
      submittedAt: value<number>(row, "submitted_at"),
    })];
  });
  writeJsonLines(path.join(input.bundleRoot, "inputs.jsonl"), inputs);
  const browserActions = input.evidenceRoot
    ? readJsonLines(path.join(input.evidenceRoot, "browser-actions.jsonl"))
      .map((record) => campaignPlayBrowserActionEvidenceSchema.parse(record))
    : [];
  const networkTrace = input.evidenceRoot
    ? readJsonLines(path.join(input.evidenceRoot, "network-trace.jsonl"))
      .map((record) => campaignPlayNetworkEvidenceSchema.parse(record))
    : [];
  writeJsonLines(path.join(input.bundleRoot, "browser-actions.jsonl"), browserActions);
  writeJsonLines(path.join(input.bundleRoot, "network-trace.jsonl"), networkTrace);

  const turnById = new Map(turnRows.map((row) => [value<string>(row, "id"), row]));
  const modelStages = report.tables.modelStages
    .filter((row) => value<string>(row, "status") === "accepted")
    .map((row) => {
      const turnId = value<string>(row, "turn_id");
      const turn = turnById.get(turnId);
      if (!turn) throw new Error(`Campaign Play model stage belongs to missing turn ${turnId}.`);
      const stage = value<string>(row, "kind");
      const inputTokens = value<number>(row, "input_tokens");
      const outputTokens = value<number>(row, "output_tokens");
      const requested = requestedModelForStage(turn, stage);
      return campaignPlayModelStageEvidenceSchema.parse({
        runId: config.runId,
        campaignId: input.replay.campaignId,
        turnId,
        stage,
        workerEpoch: value<number>(row, "worker_epoch"),
        providerId: value<string>(row, "actual_provider_id"),
        model: value<string>(row, "actual_model"),
        strategy: value<string>(row, "actual_strategy"),
        attempts: value<number>(row, "attempt"),
        retryUsed: false,
        textFallbackUsed: false,
        inputTokens,
        outputTokens,
        costMicros: modelCostMicros(inputTokens, outputTokens, requested.pricing),
        durationMs: value<number>(row, "duration_ms"),
        artifactHash: value<string>(row, "artifact_hash"),
      });
    });
  writeJsonLines(path.join(input.bundleRoot, "model-stages.jsonl"), modelStages);

  const actualInputTokens = modelStages.reduce((total, stage) => total + stage.inputTokens, 0);
  const actualOutputTokens = modelStages.reduce((total, stage) => total + stage.outputTokens, 0);
  const durations = turns.map((turn) => (turn.completedAt ?? turn.submittedAt) - turn.submittedAt)
    .sort((left, right) => left - right);
  const percentile = (fraction: number) => durations[Math.max(0, Math.ceil(durations.length * fraction) - 1)] ?? 0;
  const maximumInputTokens = config.execution.kind === "live"
    ? config.execution.maximumInputTokens
    : Math.max(actualInputTokens, 1);
  const maximumOutputTokens = config.execution.kind === "live"
    ? config.execution.maximumOutputTokens
    : Math.max(actualOutputTokens, 1);
  const maximumCostMicros = config.execution.kind === "live"
    ? config.execution.maximumCostMicros
    : Math.max(modelStages.reduce((total, stage) => total + stage.costMicros, 0), 1);
  const actualCostMicros = modelStages.reduce((total, stage) => total + stage.costMicros, 0);
  writeJson(path.join(input.bundleRoot, "budget.json"), campaignPlayBudgetSchema.parse({
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    runId: config.runId,
    maximumInputTokens,
    maximumOutputTokens,
    maximumCostMicros,
    actualInputTokens,
    actualOutputTokens,
    actualCostMicros,
    p95TurnDurationMs: percentile(0.95),
    p99TurnDurationMs: percentile(0.99),
  }));

  const runtimeEvents = report.tables.runtimeEvents.map((row) =>
    campaignPlayRuntimeEventEvidenceSchema.parse({
      runId: config.runId,
      campaignId: input.replay.campaignId,
      sequence: value<number>(row, "sequence"),
      mutationKind: value<string>(row, "kind"),
      turnId: value<string | null>(row, "turn_id"),
      workerEpoch: value<number | null>(row, "worker_epoch"),
      worldVersion: value<number>(row, "world_version"),
      priorRuntimeRevision: value<number>(row, "prior_runtime_revision"),
      resultRuntimeRevision: value<number>(row, "result_runtime_revision"),
      priorRuntimeHash: value<string>(row, "prior_runtime_hash"),
      resultRuntimeHash: value<string>(row, "result_runtime_hash"),
      protectedPayloadHash: value<string>(row, "protected_payload_hash"),
    }));
  writeJsonLines(path.join(input.bundleRoot, "runtime-events.jsonl"), runtimeEvents);

  const humanActor = playerActorId(report);
  const commandById = new Map(report.tables.commands.map((row) => [value<string>(row, "command_id"), row]));
  const receipts = report.tables.receipts.map((row) => {
    const commandId = value<string>(row, "command_id");
    const command = commandById.get(commandId);
    if (!command) throw new Error(`Receipt command is missing: ${commandId}.`);
    return campaignPlayReceiptEvidenceSchema.parse({
      runId: config.runId,
      campaignId: input.replay.campaignId,
      turnId: value<string | null>(row, "turn_id") ?? "bootstrap",
      commandId,
      receiptId: value<string>(row, "receipt_id"),
      actorId: actorSource(command, humanActor),
      worldVersion: value<number>(row, "result_world_version"),
      eventIds: JSON.parse(value<string>(row, "causal_event_ids_json")) as string[],
      receiptHash: value<string>(row, "protected_payload_hash"),
    });
  });
  writeJsonLines(path.join(input.bundleRoot, "receipts.jsonl"), receipts);

  const jobs = report.tables.jobs.map((row) => campaignPlayActorJobEvidenceSchema.parse({
    runId: config.runId,
    campaignId: input.replay.campaignId,
    turnId: value<string>(row, "turn_id"),
    jobId: value<string>(row, "job_id"),
    actorId: value<string>(row, "actor_id"),
    stage: value<string>(row, "stage"),
    sourceWorldVersion: value<number>(row, "frozen_base_world_version"),
    settledWorldVersion: value<string>(row, "stage") === "settled"
      ? report.authority.worldVersion
      : null,
    proposalId: value<string | null>(row, "proposal_id"),
  }));
  writeJsonLines(path.join(input.bundleRoot, "actor-jobs.jsonl"), jobs);

  const exposureById = new Map(report.tables.exposures.map((row) => [value<string>(row, "exposure_id"), row]));
  const visibility = report.tables.observations.map((row) => {
    const exposureId = value<string>(row, "exposure_id");
    const exposure = exposureById.get(exposureId);
    if (!exposure) throw new Error(`Observation exposure is missing: ${exposureId}.`);
    return campaignPlayVisibilityEvidenceSchema.parse({
      runId: config.runId,
      campaignId: input.replay.campaignId,
      turnId: report.tables.worldEvents.find((event) =>
        value<string>(event, "event_id") === value<string>(row, "event_id"))
        ? value<string | null>(report.tables.worldEvents.find((event) =>
            value<string>(event, "event_id") === value<string>(row, "event_id"))!, "turn_id") ?? "opening"
        : "opening",
      eventId: value<string>(row, "event_id"),
      exposureId,
      observationId: value<string>(row, "observation_id"),
      channel: value<string>(exposure, "channel"),
      eligible: true,
      publicEntryHash: value<string>(row, "public_entry_hash"),
    });
  });
  writeJsonLines(path.join(input.bundleRoot, "visibility.jsonl"), visibility);

  const checkpoint = campaignPlayCheckpointSchema.parse({
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    runId: config.runId,
    campaignId: input.replay.campaignId,
    checkpointId: `action-${input.replay.completedPlayerActions}`,
    afterPlayerAction: input.replay.completedPlayerActions,
    recordedAt: input.completedAt,
    acceptedSnapshotHash: report.acceptedSnapshotHash,
    worldVersion: report.authority.worldVersion,
    worldHash: report.authority.worldHash,
    runtimeRevision: report.authority.runtimeRevision,
    runtimeHash: report.authority.runtimeHash,
    publicProjectionHash: report.publicState.hash,
    protectedAuditHash: report.protectedAudit.hash,
    eventCursor: runtimeEvents.length,
    sqliteIntegrity: report.integrity,
    foreignKeyViolations: report.foreignKeyViolations,
  });
  writeJson(path.join(input.bundleRoot, "checkpoints", `${checkpoint.checkpointId}.json`), checkpoint);
  writeJson(path.join(input.bundleRoot, "probes", "deterministic-replay.json"), {
    replayHash: input.replay.replayHash,
    canonicalBytes: Buffer.byteLength(input.replay.canonicalBytes, "utf8"),
    restartProjectionMatches: input.replay.restartProjectionMatches,
    unboundObservationHandles: input.replay.unboundObservationHandles,
  });
  writeJson(path.join(input.bundleRoot, "probes", "protected-report.json"), report);

  const transcript = report.tables.narrations
    .filter((row) => value<string>(row, "status") === "complete")
    .map((row, index) => `## ${index === 0 ? "Opening" : `Player action ${index}`}\n\n${value<string>(row, "display_text")}`)
    .join("\n\n");
  fs.writeFileSync(path.join(input.bundleRoot, "transcript.md"), `# Deterministic Campaign Play transcript\n\n${transcript}\n`, "utf8");
  if (input.evidenceRoot) {
    copyEvidenceDirectory(
      path.join(input.evidenceRoot, "screenshots"),
      path.join(input.bundleRoot, "screenshots"),
    );
    copyEvidenceDirectory(
      path.join(input.evidenceRoot, "probes"),
      path.join(input.bundleRoot, "probes"),
    );
    fs.copyFileSync(
      path.join(input.evidenceRoot, "human-notes.md"),
      path.join(input.bundleRoot, "human-notes.md"),
    );
    fs.copyFileSync(
      path.join(input.evidenceRoot, "browser-console.json"),
      path.join(input.bundleRoot, "browser-console.json"),
    );
    fs.copyFileSync(
      path.join(input.evidenceRoot, "network-errors.json"),
      path.join(input.bundleRoot, "network-errors.json"),
    );
  } else {
    fs.writeFileSync(
      path.join(input.bundleRoot, "human-notes.md"),
      "This deterministic lane proves runtime integrity. It is not manual prose or playability evidence.\n",
      "utf8",
    );
    writeJson(path.join(input.bundleRoot, "browser-console.json"), []);
    writeJson(path.join(input.bundleRoot, "network-errors.json"), []);
  }

  const scorecard = createCampaignPlayScorecard({
    runId: config.runId,
    lane: config.lane,
    completedPlayerActions: input.replay.completedPlayerActions,
    expectedPlayerActions: config.expectedPlayerActions,
    receiptBearingMutations: receipts.length,
    mechanicalMutations: receipts.length,
    runtimeEvents: runtimeEvents.length,
    runtimeRevisions: report.authority.runtimeRevision,
    turnOwnedRuntimeEvents: runtimeEvents.filter((event) => event.turnId !== null).length,
    turnOwnedRuntimeMutations: runtimeEvents.filter((event) => event.turnId !== null).length,
  });
  writeJson(path.join(input.bundleRoot, "scorecard.json"), scorecard);
  writeJson(path.join(input.bundleRoot, "inventory.json"),
    createCampaignPlayInventory(input.bundleRoot, config.runId));
}
