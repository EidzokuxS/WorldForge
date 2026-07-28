import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { openCampaignPlayDatabase } from "../../backend/src/campaign-play/campaign-play-database.js";
import { resolveRoleModel } from "../../backend/src/ai/resolve-role-model.js";
import { loadSettings } from "../../backend/src/settings/index.js";
import { isLocalProvider, type Settings } from "@worldforge/shared";
import {
  CAMPAIGN_PLAY_EVIDENCE_VERSION,
  campaignPlayBrowserActionEvidenceSchema,
  campaignPlayCheckpointSchema,
  campaignPlayReloadProofSchema,
  campaignPlayRunConfigSchema,
  campaignPlaySubscriptionQuotaSnapshotSchema,
  type CampaignPlayBrowserActionEvidence,
  type CampaignPlayCheckpoint,
  type CampaignPlayRunConfig,
  type CampaignPlayWorldSource,
} from "./contracts.js";
import { captureCampaignPlayReplay } from "./replay-report.js";

export interface CampaignPlayLiveSessionManifest {
  evidenceVersion: typeof CAMPAIGN_PLAY_EVIDENCE_VERSION;
  runId: string;
  campaignId: string;
  worldSource: CampaignPlayWorldSource;
  commit: string;
  dirty: boolean;
  startedAt: number;
  acceptedSnapshotHash: string;
  acceptedContentHash: string;
  eligibilityHash: string;
  initialWorldVersion: number;
  initialWorldHash: string;
  initialRuntimeRevision: number;
  initialRuntimeHash: string;
}

export interface PendingManualDecision {
  playerActionNumber: number;
  control: "choice" | "freeform";
  chosenText: string;
  choiceHandle: string | null;
  visibleStateHash: string;
  chooser: string;
  signedAt: number;
  decisionNote: string;
}

export interface CampaignPlayCancelledDecision {
  runId: string;
  campaignId: string;
  pendingDecision: PendingManualDecision;
  reason: string;
  cancelledAt: number;
  publicProjectionHash: string;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function verifyTemplateWorldSource(
  config: ReturnType<typeof assertLiveConfig>,
): void {
  if (config.worldSource.kind !== "template") return;
  if (config.worldSource.sourceCampaignId !== config.campaignId) {
    throw new Error("Template provenance does not own the configured campaign.");
  }
  const campaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  if (!campaignsRoot) {
    throw new Error("Template-backed live evidence requires an isolated GSD_CAMPAIGNS_ROOT.");
  }
  const root = path.resolve(campaignsRoot);
  const campaignDirectory = path.resolve(root, config.campaignId);
  const relative = path.relative(root, campaignDirectory);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Template campaign path escaped GSD_CAMPAIGNS_ROOT.");
  }
  const stateDbPath = path.join(campaignDirectory, "state.db");
  const configPath = path.join(campaignDirectory, "config.json");
  if (
    sha256File(stateDbPath) !== config.worldSource.stateDbSha256
    || sha256File(configPath) !== config.worldSource.configSha256
  ) {
    throw new Error("Materialized world does not match its frozen template file hashes.");
  }
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeJsonExclusive(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
  });
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function readJsonLines<T>(filePath: string): T[] {
  const text = fs.readFileSync(filePath, "utf8");
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}

function assertLiveConfig(input: CampaignPlayRunConfig): CampaignPlayRunConfig & {
  campaignId: string;
  execution: Extract<CampaignPlayRunConfig["execution"], { kind: "live" }>;
} {
  const config = campaignPlayRunConfigSchema.parse(input);
  if (config.execution.kind !== "live" || config.campaignId === null) {
    throw new Error("A live Campaign Play session requires live execution and a campaign ID.");
  }
  if (config.operators.player === null) {
    throw new Error("A live Campaign Play session requires a named human player operator.");
  }
  return config as CampaignPlayRunConfig & {
    campaignId: string;
    execution: Extract<CampaignPlayRunConfig["execution"], { kind: "live" }>;
  };
}

function assertLiveModelAuthority(
  config: ReturnType<typeof assertLiveConfig>,
  settings: Settings = loadSettings(),
): { apiKey: string; baseUrl: string } {
  let authority: { apiKey: string; baseUrl: string } | null = null;
  for (const roleName of ["generator", "judge", "storyteller"] as const) {
    const resolved = resolveRoleModel(settings[roleName], settings.providers);
    const expectedPricing = config.execution.billing.kind === "metered"
      ? config.execution.billing.pricing[roleName]
      : null;
    const pricingMatches = expectedPricing === null
      ? !resolved.pricing
      : Boolean(resolved.pricing) && JSON.stringify(resolved.pricing) === JSON.stringify(expectedPricing);
    if (
      resolved.provider.id !== config.execution.providerId
      || resolved.provider.model !== config.execution.models[roleName]
      || !pricingMatches
      || (!isLocalProvider(resolved.provider.baseUrl) && resolved.provider.apiKey.trim().length === 0)
    ) {
      throw new Error(`Live ${roleName} provider, model, credentials, or billing authority do not match the run config.`);
    }
    authority ??= { apiKey: resolved.provider.apiKey, baseUrl: resolved.provider.baseUrl };
  }
  return authority!;
}

interface ZaiQuotaLimit {
  type: string;
  unit: number;
  number: number;
  percentage: number;
  nextResetTime: number;
  usage?: number;
  currentValue?: number;
  remaining?: number;
}

async function requestSubscriptionQuota(
  config: ReturnType<typeof assertLiveConfig>,
  authority: { apiKey: string; baseUrl: string },
): Promise<ReturnType<typeof campaignPlaySubscriptionQuotaSnapshotSchema.parse>> {
  if (config.execution.billing.kind !== "subscription") {
    throw new Error("Subscription quota capture requires subscription billing.");
  }
  const quotaUrl = new URL(config.execution.billing.quotaEndpoint);
  const providerUrl = new URL(authority.baseUrl);
  if (quotaUrl.protocol !== "https:" || quotaUrl.origin !== providerUrl.origin) {
    throw new Error("Subscription quota endpoint must use HTTPS on the configured provider origin.");
  }
  const response = await fetch(quotaUrl, {
    headers: { Authorization: `Bearer ${authority.apiKey}` },
  });
  if (!response.ok) throw new Error(`Subscription quota request failed with ${response.status}.`);
  const payload = await response.json() as {
    code?: number;
    success?: boolean;
    data?: { level?: string; limits?: ZaiQuotaLimit[] };
  };
  if (payload.code !== 200 || payload.success !== true || !payload.data?.limits) {
    throw new Error("Subscription quota response did not carry the expected successful contract.");
  }
  const fiveHours = payload.data.limits.find((limit) =>
    limit.type === "TOKENS_LIMIT" && limit.unit === 3 && limit.number === 5);
  const weekly = payload.data.limits.find((limit) =>
    limit.type === "TOKENS_LIMIT" && limit.unit === 6 && limit.number === 1);
  const monthlyTools = payload.data.limits.find((limit) =>
    limit.type === "TIME_LIMIT" && limit.unit === 5 && limit.number === 1);
  if (!fiveHours || !weekly || !monthlyTools) {
    throw new Error("Subscription quota response is missing the five-hour, weekly, or monthly limit.");
  }
  if (payload.data.level !== config.execution.billing.planId) {
    throw new Error("Subscription quota response does not match the frozen plan.");
  }
  return campaignPlaySubscriptionQuotaSnapshotSchema.parse({
    capturedAt: Date.now(),
    planId: payload.data.level,
    tokensFiveHours: {
      percentage: fiveHours.percentage,
      nextResetAt: fiveHours.nextResetTime ?? null,
    },
    tokensWeekly: { percentage: weekly.percentage, nextResetAt: weekly.nextResetTime },
    toolsMonthly: {
      limit: monthlyTools.usage,
      used: monthlyTools.currentValue,
      remaining: monthlyTools.remaining,
      percentage: monthlyTools.percentage,
      nextResetAt: monthlyTools.nextResetTime,
    },
  });
}

export function campaignPlayLiveSessionRoot(config: CampaignPlayRunConfig): string {
  return path.resolve(config.outputRoot, `${config.runId}.session`);
}

function sessionManifest(config: CampaignPlayRunConfig): CampaignPlayLiveSessionManifest {
  return readJson(path.join(campaignPlayLiveSessionRoot(config), "manifest.json"));
}

function assertSessionOwnership(
  config: ReturnType<typeof assertLiveConfig>,
  manifest: CampaignPlayLiveSessionManifest,
): void {
  if (manifest.runId !== config.runId || manifest.campaignId !== config.campaignId) {
    throw new Error("The live evidence session belongs to another run or campaign.");
  }
}

async function loadPublicState(campaignId: string): Promise<Record<string, unknown>> {
  const baseUrl = process.env.WF_CAMPAIGN_PLAY_API_URL ?? "http://localhost:3001";
  const response = await fetch(`${baseUrl}/api/campaigns/${encodeURIComponent(campaignId)}/play/state`);
  if (!response.ok) throw new Error(`Campaign Play state request failed with ${response.status}.`);
  return await response.json() as Record<string, unknown>;
}

export async function prepareCampaignPlayLiveSession(input: {
  runConfig: CampaignPlayRunConfig;
  commit: string;
  dirty: boolean;
  startedAt: number;
  settings?: Settings;
}): Promise<string> {
  const config = assertLiveConfig(input.runConfig);
  const authority = assertLiveModelAuthority(config, input.settings);
  const root = campaignPlayLiveSessionRoot(config);
  if (fs.existsSync(root) || fs.existsSync(path.resolve(config.outputRoot, config.runId))) {
    throw new Error(`Campaign Play live evidence path already exists for ${config.runId}.`);
  }
  verifyTemplateWorldSource(config);
  const handle = openCampaignPlayDatabase(config.campaignId);
  try {
    const captured = captureCampaignPlayReplay(handle);
    if (captured.report.authority.setupPhase !== "character_required") {
      throw new Error("Live evidence must freeze eligibility before character creation.");
    }
    if (captured.report.tables.turns.length !== 0) {
      throw new Error("Live evidence must begin before opening or player turns exist.");
    }
    if (captured.report.integrity !== "ok" || captured.report.foreignKeyViolations !== 0) {
      throw new Error("Live evidence cannot begin from an invalid campaign database.");
    }
    if (!captured.report.eligibility.projection.eligible) {
      throw new Error(
        `Live evidence requires playable accepted topology: ${captured.report.eligibility.projection.unmetRequirements.join(", ")}.`,
      );
    }
    if (
      config.worldSource.kind === "template"
      && (
        config.worldSource.acceptedWorldVersion !== captured.report.authority.acceptedWorldVersion
        || config.worldSource.acceptedContentHash !== captured.report.acceptedContentHash
      )
    ) {
      throw new Error("Materialized world content does not match its frozen template provenance.");
    }
    const quotaBefore = config.execution.billing.kind === "subscription"
      ? await requestSubscriptionQuota(config, authority)
      : null;
    for (const directory of ["build", "checkpoints", "probes", "screenshots"]) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
    }
    writeJson(path.join(root, "build", "run-config.json"), config);
    writeJson(path.join(root, "manifest.json"), {
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: config.runId,
      campaignId: config.campaignId,
      worldSource: config.worldSource,
      commit: input.commit,
      dirty: input.dirty,
      startedAt: input.startedAt,
      acceptedSnapshotHash: captured.report.acceptedSnapshotHash,
      acceptedContentHash: captured.report.acceptedContentHash,
      eligibilityHash: captured.report.eligibility.hash,
      initialWorldVersion: captured.report.authority.worldVersion,
      initialWorldHash: captured.report.authority.worldHash,
      initialRuntimeRevision: captured.report.authority.runtimeRevision,
      initialRuntimeHash: captured.report.authority.runtimeHash,
    } satisfies CampaignPlayLiveSessionManifest);
    writeJson(path.join(root, "probes", "eligibility-freeze.json"), {
      acceptedSnapshotHash: captured.report.acceptedSnapshotHash,
      acceptedContentHash: captured.report.acceptedContentHash,
      eligibility: captured.report.eligibility,
      authority: captured.report.authority,
    });
    if (quotaBefore) {
      writeJson(path.join(root, "probes", "subscription-quota-before.json"), quotaBefore);
    }
    fs.writeFileSync(path.join(root, "browser-actions.jsonl"), "", "utf8");
    fs.writeFileSync(path.join(root, "network-trace.jsonl"), "", "utf8");
    writeJson(path.join(root, "browser-console.json"), []);
    writeJson(path.join(root, "network-errors.json"), []);
    fs.writeFileSync(
      path.join(root, "human-notes.md"),
      "# First playable review\n\nManual review is pending.\n",
      "utf8",
    );
    return root;
  } finally {
    handle.close();
  }
}

export async function captureCampaignPlaySubscriptionQuota(
  input: CampaignPlayRunConfig,
  settings?: Settings,
): Promise<void> {
  const config = assertLiveConfig(input);
  if (config.execution.billing.kind !== "subscription") return;
  const root = campaignPlayLiveSessionRoot(config);
  const manifest = sessionManifest(config);
  assertSessionOwnership(config, manifest);
  const authority = assertLiveModelAuthority(config, settings);
  const quotaAfter = await requestSubscriptionQuota(config, authority);
  writeJson(path.join(root, "probes", "subscription-quota-after.json"), quotaAfter);
}

export async function stageCampaignPlayManualDecision(input: {
  runConfig: CampaignPlayRunConfig;
  control: "choice" | "freeform";
  chosenText: string;
  choiceHandle: string | null;
  decisionNote: string;
  signedAt: number;
}): Promise<PendingManualDecision> {
  const config = assertLiveConfig(input.runConfig);
  const manifest = sessionManifest(config);
  assertSessionOwnership(config, manifest);
  const pendingPath = path.join(campaignPlayLiveSessionRoot(config), "pending-decision.json");
  if (fs.existsSync(pendingPath)) throw new Error("A manual decision is already awaiting a durable turn.");
  const actions = readJsonLines<CampaignPlayBrowserActionEvidence>(
    path.join(campaignPlayLiveSessionRoot(config), "browser-actions.jsonl"),
  );
  const state = await loadPublicState(config.campaignId);
  if (state.phase !== "ready" || typeof state.projectionHash !== "string") {
    throw new Error("A manual decision can only be signed from the ready player-visible state.");
  }
  const chosenText = input.chosenText.trim();
  const decisionNote = input.decisionNote.trim();
  if (!chosenText || !decisionNote) throw new Error("Manual choice text and decision note are required.");
  if ((input.control === "choice") !== (input.choiceHandle !== null)) {
    throw new Error("A suggested choice requires its opaque handle; freeform input does not.");
  }
  const pending: PendingManualDecision = {
    playerActionNumber: actions.length + 1,
    control: input.control,
    chosenText,
    choiceHandle: input.choiceHandle,
    visibleStateHash: state.projectionHash,
    chooser: config.operators.player!,
    signedAt: input.signedAt,
    decisionNote,
  };
  writeJson(pendingPath, pending);
  return pending;
}

export function bindCampaignPlayManualDecision(
  runConfig: CampaignPlayRunConfig,
): CampaignPlayBrowserActionEvidence {
  const config = assertLiveConfig(runConfig);
  const root = campaignPlayLiveSessionRoot(config);
  const manifest = sessionManifest(config);
  assertSessionOwnership(config, manifest);
  const pendingPath = path.join(root, "pending-decision.json");
  if (!fs.existsSync(pendingPath)) throw new Error("No signed manual decision is awaiting a turn.");
  const pending = readJson<PendingManualDecision>(pendingPath);
  const existing = readJsonLines<CampaignPlayBrowserActionEvidence>(
    path.join(root, "browser-actions.jsonl"),
  );
  if (pending.playerActionNumber !== existing.length + 1) {
    throw new Error("The pending manual decision is not the next action.");
  }

  const handle = openCampaignPlayDatabase(config.campaignId);
  try {
    const captured = captureCampaignPlayReplay(handle);
    const playerTurns = captured.report.tables.turns.filter((row) => row.turn_kind === "player_action");
    if (playerTurns.length !== pending.playerActionNumber) {
      throw new Error("Bind the manual decision immediately after exactly one new player turn.");
    }
    const turn = playerTurns[pending.playerActionNumber - 1]!;
    if (turn.stage !== "completed") throw new Error("The manual decision has no completed durable turn.");
    if (pending.signedAt > Number(turn.submitted_at)) {
      throw new Error("The manual decision was signed after its durable turn was submitted.");
    }
    const document = JSON.parse(String(turn.input_json)) as {
      request: { source: "suggested" | "freeform"; choiceHandle?: string; text?: string };
    };
    const expectedSource = pending.control === "choice" ? "suggested" : "freeform";
    if (document.request.source !== expectedSource) {
      throw new Error("The durable turn used a different input control than the signed decision.");
    }
    if (
      pending.control === "freeform"
        ? document.request.text !== pending.chosenText
        : document.request.choiceHandle !== pending.choiceHandle
    ) {
      throw new Error("The durable turn does not match the signed manual decision.");
    }
    const evidence = campaignPlayBrowserActionEvidenceSchema.parse({
      runId: config.runId,
      campaignId: config.campaignId,
      playerActionNumber: pending.playerActionNumber,
      control: pending.control,
      visibleStateHash: pending.visibleStateHash,
      chosenText: pending.chosenText,
      choiceHandle: pending.choiceHandle,
      turnId: String(turn.id),
      chooser: pending.chooser,
      signedAt: pending.signedAt,
      decisionNote: pending.decisionNote,
    });
    fs.appendFileSync(
      path.join(root, "browser-actions.jsonl"),
      `${JSON.stringify(evidence)}\n`,
      "utf8",
    );
    fs.rmSync(pendingPath);
    return evidence;
  } finally {
    handle.close();
  }
}

export async function cancelCampaignPlayManualDecision(input: {
  runConfig: CampaignPlayRunConfig;
  reason: string;
  cancelledAt?: number;
}): Promise<CampaignPlayCancelledDecision> {
  const config = assertLiveConfig(input.runConfig);
  const root = campaignPlayLiveSessionRoot(config);
  const manifest = sessionManifest(config);
  assertSessionOwnership(config, manifest);
  const reason = input.reason.trim();
  if (!reason) throw new Error("A cancellation reason is required.");
  const cancelledAt = input.cancelledAt ?? Date.now();
  if (!Number.isSafeInteger(cancelledAt) || cancelledAt < 0) {
    throw new Error("Cancellation time must be a nonnegative safe integer.");
  }

  const pendingPath = path.join(root, "pending-decision.json");
  if (!fs.existsSync(pendingPath)) {
    throw new Error("No signed manual decision is awaiting cancellation.");
  }
  const pending = readJson<PendingManualDecision>(pendingPath);
  if (
    !Number.isSafeInteger(pending.playerActionNumber)
    || pending.playerActionNumber < 1
    || !Number.isFinite(pending.signedAt)
  ) {
    throw new Error("The pending manual decision has invalid action numbering or signature time.");
  }

  const actions = readJsonLines<CampaignPlayBrowserActionEvidence>(
    path.join(root, "browser-actions.jsonl"),
  ).map((record) => campaignPlayBrowserActionEvidenceSchema.parse(record));
  if (actions.some((action, index) => action.playerActionNumber !== index + 1)) {
    throw new Error("Bound browser actions are not numbered contiguously.");
  }
  if (pending.playerActionNumber !== actions.length + 1) {
    throw new Error("The pending manual decision is not the next action.");
  }

  const state = await loadPublicState(config.campaignId);
  if (
    state.phase !== "ready"
    || typeof state.projectionHash !== "string"
    || state.projectionHash.length === 0
    || state.activeTurn !== null
  ) {
    throw new Error("A pending manual decision can only be cancelled from ready state without an active turn.");
  }

  const handle = openCampaignPlayDatabase(config.campaignId);
  try {
    const captured = captureCampaignPlayReplay(handle);
    const playerTurns = captured.report.tables.turns.filter((row) => row.turn_kind === "player_action");
    if (playerTurns.length !== actions.length) {
      throw new Error("A pending manual decision cannot be cancelled after an unbound durable player turn.");
    }
    if (captured.report.publicState.hash !== state.projectionHash) {
      throw new Error("The live API projection hash does not match SQLite public-state authority.");
    }
  } finally {
    handle.close();
  }

  const cancellation: CampaignPlayCancelledDecision = {
    runId: config.runId,
    campaignId: config.campaignId,
    pendingDecision: pending,
    reason,
    cancelledAt,
    publicProjectionHash: state.projectionHash,
  };
  const cancellationRoot = path.join(root, "cancelled-decisions");
  const cancellationPath = path.join(
    cancellationRoot,
    `action-${pending.playerActionNumber}-signed-${pending.signedAt}.json`,
  );
  fs.mkdirSync(cancellationRoot, { recursive: true });
  writeJsonExclusive(cancellationPath, cancellation);
  fs.rmSync(pendingPath);
  return cancellation;
}

interface CampaignPlayReloadCapture {
  capturedAt: number;
  afterPlayerAction: number;
  publicStateHash: string;
  replayHash: string;
  checkpointHash: string;
  checkpoint: CampaignPlayCheckpoint;
  state: Record<string, unknown>;
}

function checkpointStateHash(checkpoint: CampaignPlayCheckpoint): string {
  return sha256(JSON.stringify({ ...checkpoint, recordedAt: 0 }));
}

async function captureReloadState(
  config: ReturnType<typeof assertLiveConfig>,
  requestedPlayerAction: number | null,
): Promise<CampaignPlayReloadCapture> {
  const state = await loadPublicState(config.campaignId);
  if (state.phase !== "ready" || typeof state.projectionHash !== "string") {
    throw new Error("Reload evidence requires the ready player-visible state.");
  }
  const handle = openCampaignPlayDatabase(config.campaignId);
  try {
    const captured = captureCampaignPlayReplay(handle);
    const playerTurns = captured.report.tables.turns.filter((row) => row.turn_kind === "player_action");
    const completedPlayerActions = playerTurns.filter((row) => row.stage === "completed").length;
    if (playerTurns.length !== completedPlayerActions) {
      throw new Error("Reload evidence cannot be captured while a player turn is unfinished.");
    }
    const afterPlayerAction = requestedPlayerAction ?? completedPlayerActions;
    if (afterPlayerAction !== completedPlayerActions) {
      throw new Error(
        `Reload evidence expected action ${afterPlayerAction}, but the campaign has ${completedPlayerActions} completed actions.`,
      );
    }
    if (state.projectionHash !== captured.report.publicState.hash) {
      throw new Error("The live API projection hash does not match SQLite public-state authority.");
    }
    const recordedAt = Date.now();
    const checkpoint = campaignPlayCheckpointSchema.parse({
      evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
      runId: config.runId,
      campaignId: config.campaignId,
      checkpointId: `action-${afterPlayerAction}`,
      afterPlayerAction,
      recordedAt,
      acceptedSnapshotHash: captured.report.acceptedSnapshotHash,
      worldVersion: captured.report.authority.worldVersion,
      worldHash: captured.report.authority.worldHash,
      runtimeRevision: captured.report.authority.runtimeRevision,
      runtimeHash: captured.report.authority.runtimeHash,
      publicProjectionHash: captured.report.publicState.hash,
      protectedAuditHash: captured.report.protectedAudit.hash,
      eventCursor: captured.report.tables.runtimeEvents.length,
      sqliteIntegrity: captured.report.integrity,
      foreignKeyViolations: captured.report.foreignKeyViolations,
    });
    return {
      capturedAt: recordedAt,
      afterPlayerAction,
      publicStateHash: sha256(JSON.stringify(state)),
      replayHash: captured.replayHash,
      checkpointHash: checkpointStateHash(checkpoint),
      checkpoint,
      state,
    };
  } finally {
    handle.close();
  }
}

export async function captureCampaignPlayReloadBoundary(
  runConfig: CampaignPlayRunConfig,
  boundary: "before" | "after",
  afterPlayerAction: number | null = null,
): Promise<{ hash: string; matches: boolean | null }> {
  const config = assertLiveConfig(runConfig);
  const root = campaignPlayLiveSessionRoot(config);
  const manifest = sessionManifest(config);
  assertSessionOwnership(config, manifest);
  if (
    afterPlayerAction !== null
    && !config.restartAfterPlayerActions.includes(afterPlayerAction)
  ) {
    throw new Error(`Action ${afterPlayerAction} is not a declared reload checkpoint.`);
  }
  const record = await captureReloadState(config, afterPlayerAction);
  const checkpointed = afterPlayerAction !== null;
  const stem = checkpointed ? `reload-action-${record.afterPlayerAction}` : "reload";
  const boundaryPath = path.join(root, "probes", `${stem}-${boundary}.json`);
  if (fs.existsSync(boundaryPath)) {
    throw new Error(`Reload ${boundary} evidence already exists for action ${record.afterPlayerAction}.`);
  }
  writeJson(boundaryPath, record);
  if (boundary === "before") return { hash: record.publicStateHash, matches: null };
  const beforePath = path.join(root, "probes", `${stem}-before.json`);
  if (!fs.existsSync(beforePath)) {
    throw new Error(`Reload before evidence is missing for action ${record.afterPlayerAction}.`);
  }
  const before = readJson<CampaignPlayReloadCapture>(beforePath);
  const proof = campaignPlayReloadProofSchema.parse({
    evidenceVersion: CAMPAIGN_PLAY_EVIDENCE_VERSION,
    runId: config.runId,
    campaignId: config.campaignId,
    afterPlayerAction: record.afterPlayerAction,
    beforePublicStateHash: before.publicStateHash,
    afterPublicStateHash: record.publicStateHash,
    beforeReplayHash: before.replayHash,
    afterReplayHash: record.replayHash,
    beforeCheckpointHash: before.checkpointHash,
    afterCheckpointHash: record.checkpointHash,
    matches:
      before.afterPlayerAction === record.afterPlayerAction
      && before.publicStateHash === record.publicStateHash
      && before.replayHash === record.replayHash
      && before.checkpointHash === record.checkpointHash,
  });
  writeJson(path.join(root, "probes", `${stem}-proof.json`), proof);
  if (checkpointed && proof.matches) {
    writeJson(
      path.join(root, "checkpoints", `${record.checkpoint.checkpointId}.json`),
      record.checkpoint,
    );
  }
  return { hash: record.publicStateHash, matches: proof.matches };
}

export function loadCampaignPlayLiveSession(input: CampaignPlayRunConfig): {
  root: string;
  manifest: CampaignPlayLiveSessionManifest;
  browserActions: CampaignPlayBrowserActionEvidence[];
  reloadMatches: boolean;
} {
  const config = assertLiveConfig(input);
  const root = campaignPlayLiveSessionRoot(config);
  const manifest = sessionManifest(config);
  assertSessionOwnership(config, manifest);
  if (fs.existsSync(path.join(root, "pending-decision.json"))) {
    throw new Error("The live session still has an unbound manual decision.");
  }
  const browserActions = readJsonLines<CampaignPlayBrowserActionEvidence>(
    path.join(root, "browser-actions.jsonl"),
  ).map((record) => campaignPlayBrowserActionEvidenceSchema.parse(record));
  const reloadMatches = config.restartAfterPlayerActions.length === 0
    ? readJson<{ matches: boolean }>(path.join(root, "probes", "reload-proof.json")).matches
    : config.restartAfterPlayerActions.every((afterPlayerAction) => {
        const proof = campaignPlayReloadProofSchema.parse(readJson(
          path.join(root, "probes", `reload-action-${afterPlayerAction}-proof.json`),
        ));
        campaignPlayCheckpointSchema.parse(readJson(
          path.join(root, "checkpoints", `action-${afterPlayerAction}.json`),
        ));
        return proof.afterPlayerAction === afterPlayerAction && proof.matches;
      });
  return { root, manifest, browserActions, reloadMatches };
}
