import crypto from "node:crypto";
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../backend/src/db/schema.js";

import {
  openCampaignPlayDatabase,
  type CampaignPlayDatabaseHandle,
} from "../../backend/src/campaign-play/campaign-play-database.js";
import { hashCampaignPlayProjection } from "../../backend/src/campaign-play/campaign-play-projection.js";
import { createCampaignPlayStateRepository } from "../../backend/src/campaign-play/campaign-play-state-repository.js";
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
import { verifyCampaignWorldTemplatePackage } from "./world-template.js";

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
  choiceContainer: CampaignPlayChoiceContainer | null;
  choiceOrdinal: number | null;
  visibleLabel: string | null;
  renderedControlIdentity: string | null;
  choiceCaptureAt: number | null;
  visibleStateHash: string;
  chooser: string;
  signedAt: number;
  decisionNote: string;
  captureIdentity: string;
  captureHash: string;
  decisionDigest: string;
  decisionReceiptPath: string;
}

export interface CampaignPlaySignedDecisionReceipt {
  receiptVersion: 1;
  runId: string;
  campaignId: string;
  pendingDecision: PendingManualDecision;
  decisionDigest: string;
  signedAt: number;
}

export interface CampaignPlayCancelledDecision {
  runId: string;
  campaignId: string;
  pendingDecision: PendingManualDecision;
  reason: string;
  cancelledAt: number;
  publicProjectionHash: string;
}

const CAMPAIGN_PLAY_RENDER_CONTROL_LIMIT = 100;

/**
 * Browser input is only a bounded DOM observation.  It deliberately has no
 * projection hash: the repository-owned capture phase obtains that authority
 * from the public API after the observation.
 */
export interface CampaignPlaySettlementDomObservation {
  playerActionNumber: number;
  turnId: string;
  ready: true;
  enabledChoiceCount: number;
  renderedNarrationId: string;
  renderedSceneIdentity: string;
  suggestedControlHandles: string[];
  utilityControlHandles: string[];
  capturedAt: number;
  decisionDigest?: string;
}

export interface CampaignPlaySettlementTerminalSnapshot {
  capturedAt: number;
  projectionHash: string;
  worldVersion: number;
  runtimeRevision: number;
  ready: true;
  activeTurn: null;
  turnId: string;
  narrationId: string;
  properSceneNarrationId: string;
  narrationOperationId: string;
  narrationOperationStatus: "complete";
  narrationOperationCompletedAt: number;
  narrationOperationSourceKind: string;
  suggestedControlHandles: string[];
  utilityControlHandles: string[];
}

/**
 * A render proof contains the browser observation plus one bounded terminal
 * API tuple.  terminalSnapshot is optional only for historical proofs; the
 * coherent binder never lets such a proof authorize a new settlement.
 */
export interface CampaignPlaySettlementRenderProof {
  playerActionNumber: number;
  turnId: string;
  ready: boolean;
  enabledChoiceCount: number;
  beforeProjectionHash: string;
  afterProjectionHash: string;
  renderedNarrationId: string;
  renderedSceneIdentity: string;
  capturedAt: number;
  decisionDigest?: string;
  terminalSnapshot?: CampaignPlaySettlementTerminalSnapshot;
}

/**
 * The only accepted source for a suggested-action handle is the exact
 * enabled control observed in the original rendered tab.  The browser
 * runner writes this scalar capture from one DOM evaluation immediately
 * before signing; labels and cached API rows are never substituted.
 */
export interface CampaignPlayRenderedChoiceCapture {
  playerActionNumber: number;
  control: "choice";
  enabled: true;
  ready: true;
  chosenText: string;
  choiceHandle: string;
  choiceContainer: CampaignPlayChoiceContainer;
  choiceOrdinal: number;
  visibleLabel: string;
  renderedControlIdentity: string;
  visibleStateHash: string;
  capturedAt: number;
  decisionDigest?: string;
}

export type CampaignPlayChoiceContainer = "suggested" | "utility";

export interface CampaignPlayChoiceClickProof extends CampaignPlayRenderedChoiceCapture {
  clickDispatchedAt: number;
  clickCompletedAt: number;
}

interface CampaignPlayModelStageScalar {
  kind: string;
  attempt: number;
  status: string;
  workerEpoch: number;
  requestedProviderId: string;
  requestedModel: string;
  requestedStrategy: string;
  actualProviderId: string | null;
  actualModel: string | null;
  actualStrategy: string | null;
  durationMs: number | null;
  finishReason: string | null;
  schemaOutcome: string;
  errorCode: string | null;
  createdAt: number;
  completedAt: number | null;
}

export type CoherentPlayerTurnTerminalReason =
  | "action_resolved"
  | "action_impossible"
  | "clarification_requested";

interface CoherentSettlement {
  turnId: string;
  resultId: string;
  terminalReason: CoherentPlayerTurnTerminalReason;
  operationId: string;
  narrationId: string;
  narrationStatus: string;
  properSceneNarrationId: string;
  projectionHash: string;
  worldVersion: number;
  runtimeRevision: number;
  replayHash: string;
  turnSubmittedAt: number;
  turnCompletedAt: number;
  narrationOperationCompletedAt: number;
  readyObservedAt: number;
  modelStages: CampaignPlayModelStageScalar[];
  stateDbPath: string;
  stateDbSha256: string;
  readCopyPath: string;
  readCopySha256: string;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function decisionCaptureIdentity(pending: Pick<PendingManualDecision,
  "control" | "playerActionNumber" | "choiceHandle" | "choiceContainer" | "choiceOrdinal"
  | "visibleLabel" | "renderedControlIdentity" | "choiceCaptureAt" | "visibleStateHash">): string {
  return JSON.stringify({
    control: pending.control,
    playerActionNumber: pending.playerActionNumber,
    choiceHandle: pending.choiceHandle,
    choiceContainer: pending.choiceContainer,
    choiceOrdinal: pending.choiceOrdinal,
    visibleLabel: pending.visibleLabel,
    renderedControlIdentity: pending.renderedControlIdentity,
    choiceCaptureAt: pending.choiceCaptureAt,
    visibleStateHash: pending.visibleStateHash,
  });
}

function decisionDigestPayload(input: {
  runId: string;
  campaignId: string;
  pendingDecision: Omit<PendingManualDecision, "decisionDigest" | "decisionReceiptPath">;
}): string {
  return JSON.stringify({
    receiptVersion: 1,
    runId: input.runId,
    campaignId: input.campaignId,
    pendingDecision: input.pendingDecision,
  });
}

function signedDecisionDigest(
  runId: string,
  campaignId: string,
  pendingDecision: Omit<PendingManualDecision, "decisionDigest" | "decisionReceiptPath">,
): string {
  return sha256(decisionDigestPayload({ runId, campaignId, pendingDecision }));
}

function decisionReceiptRelativePath(
  pending: Pick<PendingManualDecision, "playerActionNumber" | "signedAt"> & { decisionDigest?: string },
): string {
  return path.posix.join(
    "signed-decisions",
    `action-${pending.playerActionNumber}-signed-${pending.signedAt}`
      + (pending.decisionDigest ? `-${pending.decisionDigest}` : "")
      + ".json",
  );
}

function safeSessionPath(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Signed decision receipt path escaped the session root.");
  }
  return resolved;
}

export function assertCoherentPlayerTurnTerminalReason(
  value: string,
): CoherentPlayerTurnTerminalReason {
  if (
    value !== "action_resolved"
    && value !== "action_impossible"
    && value !== "clarification_requested"
  ) {
    throw new Error("The exact player turn does not have one coherent durable result.");
  }
  return value;
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
  const manifestPath = path.resolve(config.worldSource.manifestPath);
  const packageDirectory = path.resolve(config.worldSource.packagePath);
  if (path.dirname(manifestPath) !== packageDirectory) {
    throw new Error("Template provenance manifest and package paths do not identify one package.");
  }
  if (sha256File(manifestPath) !== config.worldSource.manifestSha256) {
    throw new Error("Template provenance manifest bytes do not match the run configuration.");
  }
  const verified = verifyCampaignWorldTemplatePackage(packageDirectory);
  const template = verified.manifest;
  if (
    verified.manifestSha256 !== config.worldSource.manifestSha256
    || template.packageId !== config.worldSource.packageId
    || template.packagePath !== config.worldSource.packagePath
    || template.manifestPath !== config.worldSource.manifestPath
    || template.packageSha256 !== config.worldSource.packageSha256
    || template.schemaMigrationId !== config.worldSource.schemaMigrationId
    || template.sourceCampaignId !== config.worldSource.sourceCampaignId
    || template.sourceCommit !== config.worldSource.sourceCommit
    || template.acceptedWorldVersion !== config.worldSource.acceptedWorldVersion
    || template.acceptedContentHash !== config.worldSource.acceptedContentHash
    || template.files["state.db"] !== config.worldSource.stateDbSha256
    || template.files["config.json"] !== config.worldSource.configSha256
  ) {
    throw new Error("Run configuration does not identify the same immutable template package.");
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

function writeJsonExclusiveAtomic(filePath: string, value: unknown): void {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomBytes(8).toString("hex")}.tmp`;
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  let descriptor: number | null = null;
  try {
    descriptor = fs.openSync(temporaryPath, "wx");
    fs.writeFileSync(descriptor, contents, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    // A hard-link publish is atomic and remains exclusive if a prior proof
    // already occupies the destination.
    fs.linkSync(temporaryPath, filePath);
  } finally {
    if (descriptor !== null) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function readJsonLines<T>(filePath: string): T[] {
  const text = fs.readFileSync(filePath, "utf8");
  return text.split("\n").filter(Boolean).map((line) => JSON.parse(line) as T);
}

function normalizedRelativePath(root: string, filePath: string): string {
  return path.relative(path.resolve(root), path.resolve(filePath)).split(path.sep).join("/");
}

function assertPendingDecisionIntegrity(
  pending: PendingManualDecision,
  runId: string,
  campaignId: string,
): PendingManualDecision {
  if (
    !Number.isSafeInteger(pending.playerActionNumber)
    || pending.playerActionNumber < 1
    || (pending.control !== "choice" && pending.control !== "freeform")
    || !boundedScalar(pending.chosenText, 4_000)
    || !isHash(pending.visibleStateHash)
    || !boundedScalar(pending.chooser, 240)
    || !Number.isSafeInteger(pending.signedAt)
    || pending.signedAt < 0
    || !boundedScalar(pending.decisionNote, 1_000)
    || !boundedScalar(pending.captureIdentity, 1_000)
    || !isHash(pending.captureHash)
    || !isHash(pending.decisionDigest)
    || !isNonemptyString(pending.decisionReceiptPath)
    || pending.decisionReceiptPath !== decisionReceiptRelativePath(pending)
  ) {
    throw new Error("The signed manual decision receipt is malformed.");
  }
  if (pending.control === "choice") {
    if (
      !boundedScalar(pending.choiceHandle, 256)
      || (pending.choiceContainer !== "suggested" && pending.choiceContainer !== "utility")
      || pending.choiceOrdinal === null
      || !Number.isSafeInteger(pending.choiceOrdinal)
      || pending.choiceOrdinal < 0
      || !boundedScalar(pending.visibleLabel, 2_000)
      || !boundedScalar(pending.renderedControlIdentity, 512)
      || pending.choiceCaptureAt === null
      || !Number.isSafeInteger(pending.choiceCaptureAt)
      || pending.choiceCaptureAt < 0
      || pending.visibleLabel !== pending.chosenText
      || pending.captureIdentity !== pending.renderedControlIdentity
    ) throw new Error("The signed choice receipt is missing its exact rendered-control identity.");
  } else if (
    pending.choiceHandle !== null
    || pending.choiceContainer !== null
    || pending.choiceOrdinal !== null
    || pending.visibleLabel !== null
    || pending.renderedControlIdentity !== null
    || pending.choiceCaptureAt !== null
    || pending.captureIdentity !== `freeform:${pending.visibleStateHash}`
  ) {
    throw new Error("The signed freeform receipt carries a suggested-choice identity.");
  }
  const { decisionDigest: ignoredDigest, decisionReceiptPath: ignoredPath, ...withoutReceipt } = pending;
  if (pending.captureHash !== sha256(decisionCaptureIdentity(pending))) {
    throw new Error("The signed decision capture hash is invalid.");
  }
  if (pending.decisionDigest !== signedDecisionDigest(runId, campaignId, withoutReceipt)) {
    throw new Error("The signed decision digest is invalid.");
  }
  return pending;
}

function readSignedDecisionReceipt(
  root: string,
  receiptPath: string,
  runId: string,
  campaignId: string,
): PendingManualDecision {
  const absolutePath = safeSessionPath(root, receiptPath);
  const receipt = readJson<CampaignPlaySignedDecisionReceipt>(absolutePath);
  if (
    receipt.receiptVersion !== 1
    || receipt.runId !== runId
    || receipt.campaignId !== campaignId
    || receipt.signedAt !== receipt.pendingDecision.signedAt
    || receipt.decisionDigest !== receipt.pendingDecision.decisionDigest
  ) throw new Error("The signed decision receipt identity is inconsistent.");
  const pending = assertPendingDecisionIntegrity(receipt.pendingDecision, runId, campaignId);
  if (pending.decisionReceiptPath !== normalizedRelativePath(root, absolutePath)) {
    throw new Error("The signed decision receipt path is not immutable and path-qualified.");
  }
  return pending;
}

function readActiveManualDecision(
  root: string,
  runId: string,
  campaignId: string,
  expectedActionNumber: number,
): PendingManualDecision | null {
  const pendingPath = path.join(root, "pending-decision.json");
  if (fs.existsSync(pendingPath)) {
    const pointer = readJson<PendingManualDecision>(pendingPath);
    if (pointer.playerActionNumber !== expectedActionNumber) {
      throw new Error("The pending manual decision is not the next action.");
    }
    const pending = readSignedDecisionReceipt(
      root,
      pointer.decisionReceiptPath,
      runId,
      campaignId,
    );
    if (JSON.stringify(pointer) !== JSON.stringify(pending)) {
      throw new Error("The mutable pending pointer conflicts with the immutable signed decision receipt.");
    }
    return pending;
  }
  const receiptRoot = path.join(root, "signed-decisions");
  if (!fs.existsSync(receiptRoot)) return null;
  const cancelledDigests = new Set<string>();
  const cancellationRoot = path.join(root, "cancelled-decisions");
  if (fs.existsSync(cancellationRoot)) {
    for (const fileName of fs.readdirSync(cancellationRoot)) {
      if (!fileName.endsWith(".json")) continue;
      const cancellation = readJson<CampaignPlayCancelledDecision>(path.join(cancellationRoot, fileName));
      if (cancellation.pendingDecision?.decisionDigest) {
        cancelledDigests.add(cancellation.pendingDecision.decisionDigest);
      }
    }
  }
  const candidates: PendingManualDecision[] = [];
  for (const fileName of fs.readdirSync(receiptRoot)) {
    if (!fileName.endsWith(".json")) continue;
    const receiptPath = path.join(receiptRoot, fileName);
    const receipt = readJson<CampaignPlaySignedDecisionReceipt>(receiptPath);
    if (receipt.pendingDecision?.playerActionNumber !== expectedActionNumber) continue;
    const pending = readSignedDecisionReceipt(
      root,
      normalizedRelativePath(root, receiptPath),
      runId,
      campaignId,
    );
    if (!cancelledDigests.has(pending.decisionDigest)) candidates.push(pending);
  }
  if (candidates.length > 1) {
    throw new Error("Conflicting immutable signed decisions exist for the same action.");
  }
  return candidates[0] ?? null;
}

function writeSignedDecisionReceipt(
  root: string,
  runId: string,
  campaignId: string,
  pending: PendingManualDecision,
): void {
  const receiptPath = safeSessionPath(root, pending.decisionReceiptPath);
  fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
  const receipt: CampaignPlaySignedDecisionReceipt = {
    receiptVersion: 1,
    runId,
    campaignId,
    pendingDecision: pending,
    decisionDigest: pending.decisionDigest,
    signedAt: pending.signedAt,
  };
  writeJsonExclusive(receiptPath, receipt);
}

function removePendingDecisionPointer(root: string, pending: PendingManualDecision): void {
  const pendingPath = path.join(root, "pending-decision.json");
  if (!fs.existsSync(pendingPath)) return;
  const pointer = readJson<PendingManualDecision>(pendingPath);
  if (JSON.stringify(pointer) !== JSON.stringify(pending)) {
    throw new Error("The pending decision pointer conflicts with the immutable decision during settlement.");
  }
  fs.rmSync(pendingPath);
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

function campaignPlayApiBaseUrl(): string {
  return process.env.WF_CAMPAIGN_PLAY_API_URL ?? "http://localhost:3001";
}

async function loadPublicTurn(
  campaignId: string,
  turnId: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${campaignPlayApiBaseUrl()}/api/campaigns/${encodeURIComponent(campaignId)}/play/turns/${encodeURIComponent(turnId)}`,
  );
  if (!response.ok) throw new Error(`Campaign Play turn request failed with ${response.status}.`);
  return await response.json() as Record<string, unknown>;
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function assertBoundedControlHandles(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > CAMPAIGN_PLAY_RENDER_CONTROL_LIMIT) {
    throw new Error(`${label} must be a bounded ordered handle list.`);
  }
  const handles = value.map((handle) => {
    if (!boundedScalar(handle, 256)) {
      throw new Error(`${label} contains an invalid control handle.`);
    }
    return handle;
  });
  if (new Set(handles).size !== handles.length) {
    throw new Error(`${label} contains a duplicate control handle.`);
  }
  return handles;
}

export function assertCampaignPlaySettlementDomObservation(
  value: unknown,
): CampaignPlaySettlementDomObservation {
  if (!value || typeof value !== "object") {
    throw new Error("The settlement DOM observation is not an object.");
  }
  const observation = value as Partial<CampaignPlaySettlementDomObservation> & {
    afterProjectionHash?: unknown;
    projectionHash?: unknown;
  };
  if ("afterProjectionHash" in observation || "projectionHash" in observation) {
    throw new Error("The settlement DOM observation cannot supply a terminal projection hash.");
  }
  if (
    typeof observation.playerActionNumber !== "number"
    || !Number.isSafeInteger(observation.playerActionNumber)
    || observation.playerActionNumber < 1
    || !boundedScalar(observation.turnId, 512)
    || observation.ready !== true
    || typeof observation.enabledChoiceCount !== "number"
    || !Number.isSafeInteger(observation.enabledChoiceCount)
    || observation.enabledChoiceCount < 1
    || observation.enabledChoiceCount > CAMPAIGN_PLAY_RENDER_CONTROL_LIMIT
    || !boundedScalar(observation.renderedNarrationId, 512)
    || !boundedScalar(observation.renderedSceneIdentity, 512)
    || typeof observation.capturedAt !== "number"
    || !Number.isSafeInteger(observation.capturedAt)
    || observation.capturedAt < 0
  ) {
    throw new Error("The settlement DOM observation is missing a bounded ready-state identity.");
  }
  const suggestedControlHandles = assertBoundedControlHandles(
    observation.suggestedControlHandles,
    "The settlement suggested controls",
  );
  const utilityControlHandles = assertBoundedControlHandles(
    observation.utilityControlHandles,
    "The settlement utility controls",
  );
  if (new Set([...suggestedControlHandles, ...utilityControlHandles]).size
    !== suggestedControlHandles.length + utilityControlHandles.length) {
    throw new Error("The settlement DOM observation contains a duplicate control handle.");
  }
  return {
    playerActionNumber: observation.playerActionNumber,
    turnId: observation.turnId,
    ready: true,
    enabledChoiceCount: observation.enabledChoiceCount,
    renderedNarrationId: observation.renderedNarrationId,
    renderedSceneIdentity: observation.renderedSceneIdentity,
    suggestedControlHandles,
    utilityControlHandles,
    capturedAt: observation.capturedAt,
    ...(observation.decisionDigest === undefined
      ? {}
      : { decisionDigest: isHash(observation.decisionDigest) ? observation.decisionDigest : (() => {
          throw new Error("The settlement DOM decision digest is invalid.");
        })() }),
  };
}

function assertTerminalSnapshot(
  value: unknown,
): CampaignPlaySettlementTerminalSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error("The terminal render snapshot is not an object.");
  }
  const snapshot = value as Partial<CampaignPlaySettlementTerminalSnapshot>;
  if (
    typeof snapshot.capturedAt !== "number"
    || !Number.isSafeInteger(snapshot.capturedAt)
    || snapshot.capturedAt < 0
    || !isHash(snapshot.projectionHash)
    || typeof snapshot.worldVersion !== "number"
    || !Number.isSafeInteger(snapshot.worldVersion)
    || snapshot.worldVersion < 0
    || typeof snapshot.runtimeRevision !== "number"
    || !Number.isSafeInteger(snapshot.runtimeRevision)
    || snapshot.runtimeRevision < 0
    || snapshot.ready !== true
    || snapshot.activeTurn !== null
    || !boundedScalar(snapshot.turnId, 512)
    || !boundedScalar(snapshot.narrationId, 512)
    || !boundedScalar(snapshot.properSceneNarrationId, 512)
    || snapshot.properSceneNarrationId !== snapshot.narrationId
    || !boundedScalar(snapshot.narrationOperationId, 512)
    || snapshot.narrationOperationStatus !== "complete"
    || typeof snapshot.narrationOperationCompletedAt !== "number"
    || !Number.isSafeInteger(snapshot.narrationOperationCompletedAt)
    || snapshot.narrationOperationCompletedAt < 0
    || !boundedScalar(snapshot.narrationOperationSourceKind, 128)
  ) {
    throw new Error("The terminal render snapshot is incomplete or not bounded.");
  }
  const suggestedControlHandles = assertBoundedControlHandles(
    snapshot.suggestedControlHandles,
    "The terminal suggested controls",
  );
  const utilityControlHandles = assertBoundedControlHandles(
    snapshot.utilityControlHandles,
    "The terminal utility controls",
  );
  if (new Set([...suggestedControlHandles, ...utilityControlHandles]).size
    !== suggestedControlHandles.length + utilityControlHandles.length) {
    throw new Error("The terminal render snapshot contains a duplicate control handle.");
  }
  return {
    capturedAt: snapshot.capturedAt,
    projectionHash: snapshot.projectionHash,
    worldVersion: snapshot.worldVersion,
    runtimeRevision: snapshot.runtimeRevision,
    ready: true,
    activeTurn: null,
    turnId: snapshot.turnId,
    narrationId: snapshot.narrationId,
    properSceneNarrationId: snapshot.properSceneNarrationId,
    narrationOperationId: snapshot.narrationOperationId,
    narrationOperationStatus: "complete",
    narrationOperationCompletedAt: snapshot.narrationOperationCompletedAt,
    narrationOperationSourceKind: snapshot.narrationOperationSourceKind,
    suggestedControlHandles,
    utilityControlHandles,
  };
}

function terminalSnapshotIdentity(snapshot: CampaignPlaySettlementTerminalSnapshot): string {
  const { capturedAt: _capturedAt, ...identity } = snapshot;
  return JSON.stringify(identity);
}

function assertTerminalSnapshotMatches(
  expected: CampaignPlaySettlementTerminalSnapshot,
  actual: CampaignPlaySettlementTerminalSnapshot,
): void {
  if (terminalSnapshotIdentity(expected) !== terminalSnapshotIdentity(actual)) {
    throw new Error("The terminal public snapshot changed before settlement binding.");
  }
}

function assertRenderProof(value: unknown): CampaignPlaySettlementRenderProof {
  if (!value || typeof value !== "object") throw new Error("The render proof is not an object.");
  const proof = value as Partial<CampaignPlaySettlementRenderProof>;
  if (
    typeof proof.playerActionNumber !== "number"
    || !Number.isSafeInteger(proof.playerActionNumber)
    || proof.playerActionNumber < 1
    || !isNonemptyString(proof.turnId)
    || proof.ready !== true
    || typeof proof.enabledChoiceCount !== "number"
    || !Number.isSafeInteger(proof.enabledChoiceCount)
    || proof.enabledChoiceCount < 1
    || proof.enabledChoiceCount > CAMPAIGN_PLAY_RENDER_CONTROL_LIMIT
    || !isHash(proof.beforeProjectionHash)
    || !isHash(proof.afterProjectionHash)
    || !isNonemptyString(proof.renderedNarrationId)
    || !isNonemptyString(proof.renderedSceneIdentity)
    || typeof proof.capturedAt !== "number"
    || !Number.isSafeInteger(proof.capturedAt)
    || proof.capturedAt < 0
  ) {
    throw new Error("The render proof is missing a bounded ready-state scalar.");
  }
  const terminalSnapshot = proof.terminalSnapshot === undefined
    ? undefined
    : assertTerminalSnapshot(proof.terminalSnapshot);
  if (terminalSnapshot && terminalSnapshot.projectionHash !== proof.afterProjectionHash) {
    throw new Error("The render proof projection hash is not its terminal snapshot hash.");
  }
  return {
    playerActionNumber: proof.playerActionNumber as number,
    turnId: proof.turnId as string,
    ready: true,
    enabledChoiceCount: proof.enabledChoiceCount as number,
    beforeProjectionHash: proof.beforeProjectionHash as string,
    afterProjectionHash: proof.afterProjectionHash as string,
    renderedNarrationId: proof.renderedNarrationId as string,
    renderedSceneIdentity: proof.renderedSceneIdentity as string,
    capturedAt: proof.capturedAt as number,
    ...(proof.decisionDigest === undefined
      ? {}
      : { decisionDigest: isHash(proof.decisionDigest) ? proof.decisionDigest : (() => {
          throw new Error("The render proof decision digest is invalid.");
        })() }),
    ...(terminalSnapshot === undefined ? {} : { terminalSnapshot }),
  };
}

function boundedScalar(value: unknown, maximum: number): value is string {
  return isNonemptyString(value) && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value);
}

export function assertCampaignPlayRenderedChoiceCapture(
  value: unknown,
): CampaignPlayRenderedChoiceCapture {
  if (!value || typeof value !== "object") {
    throw new Error("The rendered choice capture is not an object.");
  }
  const capture = value as Partial<CampaignPlayRenderedChoiceCapture>;
  if (
    typeof capture.playerActionNumber !== "number"
    || !Number.isSafeInteger(capture.playerActionNumber)
    || capture.playerActionNumber < 1
    || capture.control !== "choice"
    || capture.enabled !== true
    || capture.ready !== true
    || !boundedScalar(capture.chosenText, 2_000)
    || !boundedScalar(capture.choiceHandle, 256)
    || (capture.choiceContainer !== "suggested" && capture.choiceContainer !== "utility")
    || typeof capture.choiceOrdinal !== "number"
    || !Number.isSafeInteger(capture.choiceOrdinal)
    || capture.choiceOrdinal < 0
    || capture.choiceOrdinal > 100
    || !boundedScalar(capture.visibleLabel, 2_000)
    || capture.visibleLabel !== capture.chosenText
    || !boundedScalar(capture.renderedControlIdentity, 512)
    || !isHash(capture.visibleStateHash)
    || typeof capture.capturedAt !== "number"
    || !Number.isSafeInteger(capture.capturedAt)
    || capture.capturedAt < 0
  ) {
    throw new Error("The rendered choice capture is missing a bounded enabled-control scalar.");
  }
  return {
    playerActionNumber: capture.playerActionNumber,
    control: "choice",
    enabled: true,
    ready: true,
    chosenText: capture.chosenText,
    choiceHandle: capture.choiceHandle,
    choiceContainer: capture.choiceContainer,
    choiceOrdinal: capture.choiceOrdinal,
    visibleLabel: capture.visibleLabel,
    renderedControlIdentity: capture.renderedControlIdentity,
    visibleStateHash: capture.visibleStateHash,
    capturedAt: capture.capturedAt,
    ...(capture.decisionDigest === undefined
      ? {}
      : { decisionDigest: isHash(capture.decisionDigest) ? capture.decisionDigest : (() => {
          throw new Error("The rendered choice decision digest is invalid.");
        })() }),
  };
}

export function assertCampaignPlayChoiceClickProof(
  value: unknown,
): CampaignPlayChoiceClickProof {
  if (!value || typeof value !== "object") {
    throw new Error("The choice click proof is not an object.");
  }
  const proof = value as Partial<CampaignPlayChoiceClickProof>;
  const capture = assertCampaignPlayRenderedChoiceCapture(proof);
  if (
    typeof proof.clickDispatchedAt !== "number"
    || !Number.isSafeInteger(proof.clickDispatchedAt)
    || proof.clickDispatchedAt < capture.capturedAt
    || typeof proof.clickCompletedAt !== "number"
    || !Number.isSafeInteger(proof.clickCompletedAt)
    || proof.clickCompletedAt < proof.clickDispatchedAt
  ) {
    throw new Error("The choice click proof is missing bounded dispatch timestamps.");
  }
  return {
    ...capture,
    clickDispatchedAt: proof.clickDispatchedAt,
    clickCompletedAt: proof.clickCompletedAt,
  };
}

/**
 * Verify that the captured DOM control is still the unique matching row in
 * the adjacent ready API projection.  The browser capture remains the source
 * of the opaque handle; the API is only a same-state identity cross-check.
 */
export function assertCampaignPlayReadyChoiceMatchesApi(
  state: Record<string, unknown>,
  capture: CampaignPlayRenderedChoiceCapture,
): void {
  const narration = state.narration;
  const suggestedActions = narration && typeof narration === "object"
    ? (narration as { suggestedActions?: unknown }).suggestedActions
    : undefined;
  const utilityActions = state.utilityActions;
  if (!Array.isArray(suggestedActions) || !Array.isArray(utilityActions)) {
    throw new Error("The ready API projection does not expose both choice containers.");
  }
  const rows: Array<{
    container: CampaignPlayChoiceContainer;
    ordinal: number;
    choiceHandle: string;
    label: string;
  }> = [];
  const appendRows = (container: CampaignPlayChoiceContainer, value: unknown): void => {
    for (const [ordinal, row] of (value as unknown[]).entries()) {
      if (!row || typeof row !== "object") {
        throw new Error("The ready API projection contains an invalid choice row.");
      }
      const choiceHandle = (row as { choiceHandle?: unknown }).choiceHandle;
      const label = (row as { label?: unknown }).label;
      if (!boundedScalar(choiceHandle, 256) || !boundedScalar(label, 2_000)) {
        throw new Error("The ready API projection contains an unbounded choice identity.");
      }
      rows.push({ container, ordinal, choiceHandle, label });
    }
  };
  appendRows("suggested", suggestedActions);
  appendRows("utility", utilityActions);
  const handles = new Set<string>();
  for (const row of rows) {
    if (handles.has(row.choiceHandle)) {
      throw new Error("The ready API projection contains a duplicate choice handle.");
    }
    handles.add(row.choiceHandle);
  }
  const row = rows.find((candidate) =>
    candidate.container === capture.choiceContainer && candidate.ordinal === capture.choiceOrdinal);
  if (
    !row
    || row.choiceHandle !== capture.choiceHandle
    || row.label !== capture.visibleLabel
  ) {
    throw new Error("The rendered choice does not match the current ready API projection.");
  }
}

export function readCampaignPlayRenderedChoiceCapture(
  filePath: string,
): CampaignPlayRenderedChoiceCapture {
  return assertCampaignPlayRenderedChoiceCapture(readJson<unknown>(path.resolve(filePath)));
}

export function readCampaignPlayChoiceClickProof(
  filePath: string,
): CampaignPlayChoiceClickProof {
  return assertCampaignPlayChoiceClickProof(readJson<unknown>(path.resolve(filePath)));
}

export function assertExactPlayerInput(
  inputJson: string,
  pending: PendingManualDecision,
): void {
  let document: {
    request?: {
      source?: unknown;
      choiceHandle?: unknown;
      text?: unknown;
    };
  };
  try {
    document = JSON.parse(inputJson) as typeof document;
  } catch {
    throw new Error("The durable player turn input is not valid JSON.");
  }
  const request = document.request;
  const expectedSource = pending.control === "choice" ? "suggested" : "freeform";
  if (request?.source !== expectedSource) {
    throw new Error("The durable turn used a different input control than the signed decision.");
  }
  if (
    pending.control === "freeform"
      ? request.text !== pending.chosenText
      : request.choiceHandle !== pending.choiceHandle
  ) {
    throw new Error("The durable turn does not match the signed manual decision.");
  }
}

async function backupCampaignPlayDatabase(
  sourcePath: string,
  destinationPath: string,
): Promise<void> {
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  if (fs.existsSync(destinationPath)) {
    return;
  }
  const source = new Database(sourcePath, { readonly: true, fileMustExist: true });
  try {
    await source.backup(destinationPath);
  } finally {
    source.close();
  }
}

export function inspectCoherentSettlementCopy(input: {
  copyPath: string;
  campaignId: string;
  turnId: string;
  pending: PendingManualDecision;
}): Omit<CoherentSettlement, "stateDbPath" | "stateDbSha256" | "readCopyPath" | "readCopySha256" | "readyObservedAt"> {
  const sqlite = new Database(input.copyPath, { readonly: true, fileMustExist: true });
  sqlite.pragma("query_only = ON");
  const handle = {
    campaignId: input.campaignId,
    databasePath: input.copyPath,
    sqlite,
    db: drizzle(sqlite, { schema }),
    close: () => sqlite.close(),
  } as unknown as CampaignPlayDatabaseHandle;
  try {
    const turn = sqlite.prepare(`
      SELECT id, campaign_id AS campaignId, turn_kind AS turnKind,
        input_json AS inputJson, stage, submitted_at AS submittedAt,
        completed_at AS completedAt, final_world_version AS finalWorldVersion
      FROM campaign_play_turns WHERE campaign_id = ? AND id = ?
    `).get(input.campaignId, input.turnId) as {
      id: string;
      campaignId: string;
      turnKind: string;
      inputJson: string;
      stage: string;
      submittedAt: number;
      completedAt: number | null;
      finalWorldVersion: number | null;
    } | undefined;
    if (!turn || turn.campaignId !== input.campaignId || turn.turnKind !== "player_action") {
      throw new Error("The task-owned SQLite copy does not contain the admitted player turn.");
    }
    if (turn.stage !== "completed" || turn.completedAt === null || turn.finalWorldVersion === null) {
      throw new Error("The exact player turn is not durably completed in the task-owned SQLite copy.");
    }
    if (input.pending.signedAt > turn.submittedAt) {
      throw new Error("The signed decision follows the durable turn submission.");
    }
    assertExactPlayerInput(turn.inputJson, input.pending);

    const results = sqlite.prepare(`
      SELECT turn_id AS turnId, campaign_id AS campaignId, terminal_reason AS terminalReason
      FROM campaign_play_turn_results WHERE campaign_id = ? AND turn_id = ?
    `).all(input.campaignId, input.turnId) as Array<{
      turnId: string;
      campaignId: string;
      terminalReason: string;
    }>;
    if (results.length !== 1) {
      throw new Error("The exact player turn does not have one coherent durable result.");
    }
    const terminalReason = assertCoherentPlayerTurnTerminalReason(results[0]!.terminalReason);
    const resultId = sqlite.prepare(`
      SELECT result_id AS resultId, operation_id AS operationId, narration_id AS narrationId,
        packet_hash AS packetHash, turn_id AS turnId, status, source_kind AS sourceKind,
        completed_at AS completedAt
      FROM campaign_play_narration_operations WHERE campaign_id = ? AND turn_id = ?
    `).all(input.campaignId, input.turnId) as Array<{
      resultId: string;
      operationId: string;
      narrationId: string;
      packetHash: string;
      turnId: string;
      status: string;
      sourceKind: string | null;
      completedAt: number | null;
    }>;
    if (
      resultId.length !== 1
      || resultId[0]!.turnId !== input.turnId
      || resultId[0]!.status !== "complete"
      || resultId[0]!.sourceKind !== "model_accepted"
      || resultId[0]!.completedAt === null
    ) {
      throw new Error("The exact player turn does not have one completed model-accepted narration operation.");
    }
    const operation = resultId[0]!;
    const narrations = sqlite.prepare(`
      SELECT narration_id AS narrationId, packet_hash AS packetHash, turn_id AS turnId,
        status, completed_at AS completedAt
      FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?
    `).all(input.campaignId, input.turnId) as Array<{
      narrationId: string;
      packetHash: string;
      turnId: string;
      status: string;
      completedAt: number | null;
    }>;
    if (
      narrations.length !== 1
      || narrations[0]!.narrationId !== operation.narrationId
      || narrations[0]!.packetHash !== operation.packetHash
      || narrations[0]!.turnId !== input.turnId
      || (narrations[0]!.status !== "pending" && narrations[0]!.status !== "complete")
    ) {
      throw new Error("The exact player turn does not have one coherent narration packet.");
    }
    const scenes = sqlite.prepare(`
      SELECT narration_id AS narrationId, operation_id AS operationId, turn_id AS turnId
      FROM campaign_play_proper_scenes WHERE campaign_id = ? AND turn_id = ?
    `).all(input.campaignId, input.turnId) as Array<{
      narrationId: string;
      operationId: string;
      turnId: string;
    }>;
    if (
      scenes.length !== 1
      || scenes[0]!.narrationId !== operation.narrationId
      || scenes[0]!.operationId !== operation.operationId
      || scenes[0]!.turnId !== input.turnId
    ) {
      throw new Error("The exact player turn does not have one proper scene.");
    }

    const modelStages = sqlite.prepare(`
      SELECT kind, attempt, status, worker_epoch AS workerEpoch,
        requested_provider_id AS requestedProviderId,
        requested_model AS requestedModel,
        requested_strategy AS requestedStrategy,
        actual_provider_id AS actualProviderId,
        actual_model AS actualModel,
        actual_strategy AS actualStrategy,
        duration_ms AS durationMs,
        finish_reason AS finishReason,
        schema_outcome AS schemaOutcome,
        error_code AS errorCode,
        created_at AS createdAt,
        completed_at AS completedAt
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ?
      ORDER BY created_at, attempt
    `).all(input.campaignId, input.turnId) as CampaignPlayModelStageScalar[];
    if (modelStages.some((stage) =>
      !isNonemptyString(stage.kind)
      || !Number.isSafeInteger(stage.attempt)
      || stage.attempt < 1
      || !isNonemptyString(stage.status)
      || !Number.isSafeInteger(stage.workerEpoch)
      || !isNonemptyString(stage.requestedProviderId)
      || !isNonemptyString(stage.requestedModel)
      || !isNonemptyString(stage.requestedStrategy)
      || (stage.actualProviderId !== null && !isNonemptyString(stage.actualProviderId))
      || (stage.actualModel !== null && !isNonemptyString(stage.actualModel))
      || (stage.actualStrategy !== null && !isNonemptyString(stage.actualStrategy))
      || (stage.durationMs !== null && (!Number.isSafeInteger(stage.durationMs) || stage.durationMs < 0))
      || !isNonemptyString(stage.schemaOutcome)
      || (stage.errorCode !== null && !isNonemptyString(stage.errorCode))
      || !Number.isSafeInteger(stage.createdAt)
      || (stage.completedAt !== null && !Number.isSafeInteger(stage.completedAt))
    )) {
      throw new Error("The exact player turn has an invalid model-stage scalar.");
    }

    const captured = captureCampaignPlayReplay(handle);
    if (captured.report.integrity !== "ok" || captured.report.foreignKeyViolations !== 0) {
      throw new Error("The task-owned SQLite settlement copy failed integrity checks.");
    }
    const projectionHash = captured.report.publicState.hash;
    if (!isHash(projectionHash)) throw new Error("The SQLite public projection hash is invalid.");
    return {
      turnId: input.turnId,
      resultId: operation.resultId,
      terminalReason,
      operationId: operation.operationId,
      narrationId: operation.narrationId,
      narrationStatus: narrations[0]!.status,
      properSceneNarrationId: scenes[0]!.narrationId,
      projectionHash,
      worldVersion: captured.report.authority.worldVersion,
      runtimeRevision: captured.report.authority.runtimeRevision,
      replayHash: captured.replayHash,
      turnSubmittedAt: turn.submittedAt,
      turnCompletedAt: turn.completedAt,
      narrationOperationCompletedAt: operation.completedAt!,
      modelStages,
    };
  } finally {
    handle.close();
  }
}

function apiControlHandles(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length > CAMPAIGN_PLAY_RENDER_CONTROL_LIMIT) {
    throw new Error(`${label} is not a bounded ordered control list.`);
  }
  return value.map((row, index) => {
    if (!row || typeof row !== "object") {
      throw new Error(`${label} contains an invalid control at ordinal ${index}.`);
    }
    const choiceHandle = (row as { choiceHandle?: unknown }).choiceHandle;
    const visibleLabel = (row as { label?: unknown }).label;
    if (!boundedScalar(choiceHandle, 256) || !boundedScalar(visibleLabel, 2_000)) {
      throw new Error(`${label} contains an unbounded control identity.`);
    }
    return choiceHandle;
  });
}

export async function readCampaignPlaySettlementTerminalSnapshot(
  campaignId: string,
  turnId: string,
): Promise<{
  state: Record<string, unknown>;
  turn: Record<string, unknown>;
  snapshot: CampaignPlaySettlementTerminalSnapshot;
}> {
  const state = await loadPublicState(campaignId);
  const turn = await loadPublicTurn(campaignId, turnId);
  const turnRecord = (turn.turn ?? {}) as Record<string, unknown>;
  const result = (turn.result ?? {}) as Record<string, unknown>;
  const status = turnRecord.status;
  if (status === "failed" || status === "interrupted") {
    throw new Error(`The exact player turn reached terminal ${String(status)}.`);
  }
  if (
    state.phase !== "ready"
    || state.activeTurn !== null
    || status !== "completed"
    || result.status !== "completed"
  ) {
    throw new Error("The public turn is not in a ready completed state.");
  }
  const apiNarration = (result.narration ?? {}) as Record<string, unknown>;
  const apiOperation = (result.narrationOperation ?? {}) as Record<string, unknown>;
  const stateNarration = (state.narration ?? {}) as Record<string, unknown>;
  const stateOperation = (state.narrationOperation ?? {}) as Record<string, unknown>;
  const completedAt = apiOperation.completedAt;
  if (
    !boundedScalar(turnRecord.turnId, 512)
    || turnRecord.turnId !== turnId
    || !boundedScalar(apiNarration.turnId, 512)
    || apiNarration.turnId !== turnId
    || !boundedScalar(apiNarration.narrationId, 512)
    || !boundedScalar(stateNarration.turnId, 512)
    || stateNarration.turnId !== turnId
    || stateNarration.narrationId !== apiNarration.narrationId
    || !boundedScalar(apiOperation.turnId, 512)
    || apiOperation.turnId !== turnId
    || !boundedScalar(apiOperation.operationId, 512)
    || apiOperation.narrationId !== apiNarration.narrationId
    || apiOperation.status !== "complete"
    || apiOperation.sourceKind !== "model_accepted"
    || !Number.isSafeInteger(completedAt)
    || (completedAt as number) < 0
    || stateOperation.operationId !== apiOperation.operationId
    || stateOperation.turnId !== turnId
    || stateOperation.narrationId !== apiOperation.narrationId
    || stateOperation.status !== "complete"
    || stateOperation.sourceKind !== apiOperation.sourceKind
    || stateOperation.completedAt !== completedAt
  ) {
    throw new Error("The public turn does not expose one completed proper narration operation.");
  }
  if (
    !isHash(state.projectionHash)
    || typeof state.worldVersion !== "number"
    || !Number.isSafeInteger(state.worldVersion)
    || state.worldVersion < 0
    || typeof state.runtimeRevision !== "number"
    || !Number.isSafeInteger(state.runtimeRevision)
    || state.runtimeRevision < 0
  ) {
    throw new Error("The terminal public state is missing bounded version or projection identity.");
  }
  const suggestedControlHandles = apiControlHandles(
    stateNarration.suggestedActions,
    "The terminal suggested controls",
  );
  const utilityControlHandles = apiControlHandles(
    state.utilityActions,
    "The terminal utility controls",
  );
  if (new Set([...suggestedControlHandles, ...utilityControlHandles]).size
    !== suggestedControlHandles.length + utilityControlHandles.length) {
    throw new Error("The terminal public state contains a duplicate control handle.");
  }
  const snapshot = assertTerminalSnapshot({
    capturedAt: Date.now(),
    projectionHash: state.projectionHash,
    worldVersion: state.worldVersion,
    runtimeRevision: state.runtimeRevision,
    ready: true,
    activeTurn: null,
    turnId,
    narrationId: apiNarration.narrationId,
    properSceneNarrationId: apiNarration.narrationId,
    narrationOperationId: apiOperation.operationId,
    narrationOperationStatus: "complete",
    narrationOperationCompletedAt: completedAt,
    narrationOperationSourceKind: apiOperation.sourceKind,
    suggestedControlHandles,
    utilityControlHandles,
  });
  return { state, turn, snapshot };
}

export async function waitForCompletedPublicTurn(
  campaignId: string,
  turnId: string,
  options: { pollIntervalMs?: number } = {},
): Promise<{
  state: Record<string, unknown>;
  turn: Record<string, unknown>;
  readyObservedAt: number;
}> {
  const pollIntervalMs = options.pollIntervalMs ?? 1_000;
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 0) {
    throw new Error("The settlement observation interval must be a non-negative integer.");
  }
  // This wait has no whole-action deadline. Production stage deadlines and
  // durable terminal states remain the only failure fences; healthy model work
  // may exceed the historical 120-second runner observation window.
  for (;;) {
    let state: Record<string, unknown>;
    let turn: Record<string, unknown>;
    try {
      state = await loadPublicState(campaignId);
      turn = await loadPublicTurn(campaignId, turnId);
    } catch (error) {
      if (error instanceof Error && /terminal (failed|interrupted)/.test(error.message)) throw error;
      // A transient HTTP/CDP boundary is observation noise; keep reconciling
      // the same admitted turn rather than clicking or binding again.
      await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
      continue;
    }
    const turnRecord = (turn.turn ?? {}) as Record<string, unknown>;
    const result = (turn.result ?? {}) as Record<string, unknown>;
    if (turnRecord.status === "failed" || turnRecord.status === "interrupted") {
      throw new Error(`The exact player turn reached terminal ${String(turnRecord.status)}.`);
    }
    if (
      state.phase === "ready"
      && state.activeTurn === null
      && turnRecord.status === "completed"
      && result.status === "completed"
    ) {
      try {
        const observed = await readCampaignPlaySettlementTerminalSnapshot(campaignId, turnId);
        return {
          state: observed.state,
          turn: observed.turn,
          readyObservedAt: observed.snapshot.capturedAt,
        };
      } catch (error) {
        const apiNarration = (result.narration ?? {}) as Record<string, unknown>;
        const apiOperation = (result.narrationOperation ?? {}) as Record<string, unknown>;
        const stateNarration = (state.narration ?? {}) as Record<string, unknown>;
        const stateOperation = (state.narrationOperation ?? {}) as Record<string, unknown>;
        const operationStillSettling =
          state.narration === null
          || result.narration === null
          || state.narrationOperation === null
          || result.narrationOperation === null
          || apiOperation.status === "pending"
          || apiOperation.status === "running"
          || stateOperation.status === "pending"
          || stateOperation.status === "running"
          || apiOperation.status === "complete" && !Number.isSafeInteger(apiOperation.completedAt)
          || stateOperation.status === "complete" && !Number.isSafeInteger(stateOperation.completedAt)
          || !boundedScalar(apiNarration.narrationId, 512)
          || !boundedScalar(stateNarration.narrationId, 512);
        if (!operationStillSettling) throw error;
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

export async function captureCampaignPlaySettlementRenderProof(input: {
  runConfig: CampaignPlayRunConfig;
  domObservation: unknown;
  renderProofPath: string;
  admittedTurnId?: string;
  pollIntervalMs?: number;
}): Promise<CampaignPlaySettlementRenderProof> {
  const config = assertLiveConfig(input.runConfig);
  const root = campaignPlayLiveSessionRoot(config);
  const manifest = sessionManifest(config);
  assertSessionOwnership(config, manifest);
  const observation = assertCampaignPlaySettlementDomObservation(input.domObservation);
  const actions = readJsonLines<CampaignPlayBrowserActionEvidence>(
    path.join(root, "browser-actions.jsonl"),
  );
  const pending = readActiveManualDecision(
    root,
    config.runId,
    config.campaignId,
    observation.playerActionNumber,
  );
  if (!pending) throw new Error("No immutable signed manual decision is awaiting terminal render capture.");
  const admittedTurnId = input.admittedTurnId ?? observation.turnId;
  if (
    observation.playerActionNumber !== pending.playerActionNumber
    || observation.turnId !== admittedTurnId
    || observation.decisionDigest !== undefined && observation.decisionDigest !== pending.decisionDigest
    || actions.length !== pending.playerActionNumber - 1
  ) {
    throw new Error("The terminal DOM observation does not belong to the signed decision and admitted turn.");
  }

  await waitForCompletedPublicTurn(config.campaignId, admittedTurnId, {
    pollIntervalMs: input.pollIntervalMs,
  });
  const first = await readCampaignPlaySettlementTerminalSnapshot(config.campaignId, admittedTurnId);
  const second = await readCampaignPlaySettlementTerminalSnapshot(config.campaignId, admittedTurnId);
  assertTerminalSnapshotMatches(first.snapshot, second.snapshot);
  const terminalSnapshot = assertTerminalSnapshot({
    ...second.snapshot,
    capturedAt: Date.now(),
  });
  if (
    observation.ready !== terminalSnapshot.ready
    || observation.turnId !== terminalSnapshot.turnId
    || observation.renderedNarrationId !== terminalSnapshot.narrationId
    || (observation.renderedSceneIdentity !== terminalSnapshot.properSceneNarrationId
      && observation.renderedSceneIdentity !== terminalSnapshot.narrationOperationId)
    || JSON.stringify(observation.suggestedControlHandles)
      !== JSON.stringify(terminalSnapshot.suggestedControlHandles)
    || JSON.stringify(observation.utilityControlHandles)
      !== JSON.stringify(terminalSnapshot.utilityControlHandles)
    || observation.enabledChoiceCount
      !== terminalSnapshot.suggestedControlHandles.length + terminalSnapshot.utilityControlHandles.length
  ) {
    throw new Error("The terminal DOM observation does not match the same public API snapshot.");
  }
  const capturedAt = terminalSnapshot.capturedAt;
  const proof: CampaignPlaySettlementRenderProof = {
    playerActionNumber: pending.playerActionNumber,
    turnId: admittedTurnId,
    ready: true,
    enabledChoiceCount: observation.enabledChoiceCount,
    beforeProjectionHash: pending.visibleStateHash,
    afterProjectionHash: terminalSnapshot.projectionHash,
    renderedNarrationId: observation.renderedNarrationId,
    renderedSceneIdentity: observation.renderedSceneIdentity,
    capturedAt,
    decisionDigest: pending.decisionDigest,
    terminalSnapshot,
  };
  const renderProofPath = safeSessionPath(root, input.renderProofPath);
  fs.mkdirSync(path.dirname(renderProofPath), { recursive: true });
  writeJsonExclusiveAtomic(renderProofPath, proof);
  return proof;
}

function assertRenderProofMatchesExistingSettlement(
  current: CampaignPlaySettlementRenderProof,
  stored: CampaignPlaySettlementRenderProof,
): void {
  if (
    current.playerActionNumber !== stored.playerActionNumber
    || current.turnId !== stored.turnId
    || current.ready !== stored.ready
    || current.enabledChoiceCount !== stored.enabledChoiceCount
    || current.beforeProjectionHash !== stored.beforeProjectionHash
    || current.afterProjectionHash !== stored.afterProjectionHash
    || current.renderedNarrationId !== stored.renderedNarrationId
    || current.renderedSceneIdentity !== stored.renderedSceneIdentity
    || current.decisionDigest !== stored.decisionDigest
    || (current.terminalSnapshot !== undefined
      && (stored.terminalSnapshot === undefined
        || terminalSnapshotIdentity(current.terminalSnapshot) !== terminalSnapshotIdentity(stored.terminalSnapshot)))
  ) {
    throw new Error("The existing settlement proof conflicts with the signed decision.");
  }
}

function assertPendingChoiceMatchesCapture(
  pending: PendingManualDecision,
  capture: CampaignPlayRenderedChoiceCapture,
  expectedActionNumber: number,
): void {
  if (
    pending.control !== "choice"
    || pending.playerActionNumber !== expectedActionNumber
    || pending.choiceHandle === null
    || pending.choiceContainer === null
    || pending.choiceOrdinal === null
    || pending.visibleLabel === null
    || pending.renderedControlIdentity === null
    || pending.choiceCaptureAt === null
    || pending.choiceHandle !== capture.choiceHandle
    || pending.choiceContainer !== capture.choiceContainer
    || pending.choiceOrdinal !== capture.choiceOrdinal
    || pending.visibleLabel !== capture.visibleLabel
    || pending.chosenText !== capture.chosenText
    || pending.renderedControlIdentity !== capture.renderedControlIdentity
    || pending.visibleStateHash !== capture.visibleStateHash
    || pending.choiceCaptureAt !== capture.capturedAt
    || (capture.decisionDigest !== undefined && capture.decisionDigest !== pending.decisionDigest)
  ) {
    throw new Error("The rendered choice changed; cancel the pending decision before clicking.");
  }
}

export async function authorizeCampaignPlayManualChoice(input: {
  runConfig: CampaignPlayRunConfig;
  capture: unknown;
}): Promise<CampaignPlayRenderedChoiceCapture> {
  const config = assertLiveConfig(input.runConfig);
  const root = campaignPlayLiveSessionRoot(config);
  const manifest = sessionManifest(config);
  assertSessionOwnership(config, manifest);
  const actions = readJsonLines<CampaignPlayBrowserActionEvidence>(path.join(root, "browser-actions.jsonl"));
  const pending = readActiveManualDecision(root, config.runId, config.campaignId, actions.length + 1);
  if (!pending) {
    throw new Error("No signed choice is awaiting its same-control click authorization.");
  }
  const capture = assertCampaignPlayRenderedChoiceCapture(input.capture);
  assertPendingChoiceMatchesCapture(pending, capture, actions.length + 1);
  const state = await loadPublicState(config.campaignId);
  if (
    state.phase !== "ready"
    || state.activeTurn !== null
    || state.projectionHash !== pending.visibleStateHash
  ) {
    throw new Error("The ready projection changed; cancel the pending decision before clicking.");
  }
  assertCampaignPlayReadyChoiceMatchesApi(state, capture);
  return { ...capture, decisionDigest: pending.decisionDigest };
}

function assertPendingChoiceMatchesClickProof(
  pending: PendingManualDecision,
  proof: CampaignPlayChoiceClickProof,
  expectedActionNumber: number,
): void {
  assertPendingChoiceMatchesCapture(pending, proof, expectedActionNumber);
  if (proof.clickDispatchedAt < pending.signedAt) {
    throw new Error("The DOM dispatch proof predates the signed decision.");
  }
  if (proof.clickCompletedAt < proof.clickDispatchedAt) {
    throw new Error("The DOM dispatch proof has a negative synchronous interval.");
  }
}

export async function bindCampaignPlayManualDecisionCoherent(input: {
  runConfig: CampaignPlayRunConfig;
  admittedTurnId?: string;
  renderProofPath: string;
  clickProofPath?: string;
  injectFault?: (point: "after_settlement_write") => void;
}): Promise<CampaignPlayBrowserActionEvidence> {
  const config = assertLiveConfig(input.runConfig);
  const root = campaignPlayLiveSessionRoot(config);
  const manifest = sessionManifest(config);
  assertSessionOwnership(config, manifest);
  const existing = readJsonLines<CampaignPlayBrowserActionEvidence>(
    path.join(root, "browser-actions.jsonl"),
  ).map((record) => campaignPlayBrowserActionEvidenceSchema.parse(record));
  const proof = assertRenderProof(readJson<unknown>(path.resolve(input.renderProofPath)));
  const pending = readActiveManualDecision(
    root,
    config.runId,
    config.campaignId,
    proof.playerActionNumber,
  );
  if (!pending) throw new Error("No immutable signed manual decision is awaiting coherent binding.");
  const admittedTurnId = input.admittedTurnId ?? proof.turnId;
  if (!isNonemptyString(admittedTurnId)) throw new Error("The render proof must identify the admitted turn.");
  if (
    proof.playerActionNumber !== pending.playerActionNumber
    || proof.turnId !== admittedTurnId
    || proof.beforeProjectionHash !== pending.visibleStateHash
    || proof.afterProjectionHash === proof.beforeProjectionHash
    || proof.decisionDigest !== pending.decisionDigest
  ) {
    throw new Error("The rendered proof does not belong to the signed decision and admitted turn.");
  }
  if (existing.length > pending.playerActionNumber) {
    throw new Error("Bound browser-action evidence contains a later action than the signed decision.");
  }
  const existingEvidence = existing[pending.playerActionNumber - 1];
  const settlementPath = path.join(
    root,
    "probes",
    "settlements",
    "action-" + pending.playerActionNumber + ".json",
  );
  if (existingEvidence) {
    if (
      existing.length !== pending.playerActionNumber
      || existingEvidence.playerActionNumber !== pending.playerActionNumber
      || existingEvidence.turnId !== admittedTurnId
      || existingEvidence.decisionDigest !== pending.decisionDigest
    ) {
      throw new Error("Conflicting or duplicate browser-action evidence exists for the signed decision.");
    }
    if (!fs.existsSync(settlementPath)) {
      throw new Error("Browser-action evidence exists without its durable settlement proof.");
    }
    const settled = readJson<Record<string, unknown>>(settlementPath);
    if (
      settled.playerActionNumber !== pending.playerActionNumber
      || settled.turnId !== admittedTurnId
      || settled.decisionDigest !== pending.decisionDigest
      || (settled.renderProof as { decisionDigest?: unknown } | undefined)?.decisionDigest !== pending.decisionDigest
    ) {
      throw new Error("The existing settlement proof conflicts with the signed decision.");
    }
    assertRenderProofMatchesExistingSettlement(
      proof,
      assertRenderProof((settled as { renderProof?: unknown }).renderProof),
    );
    removePendingDecisionPointer(root, pending);
    return existingEvidence;
  }
  if (existing.length !== pending.playerActionNumber - 1) {
    throw new Error("The signed manual decision is not the next action.");
  }
  if (proof.terminalSnapshot === undefined) {
    throw new Error("A legacy render proof cannot authorize a new settlement; capture a terminal proof first.");
  }
  let clickProof: CampaignPlayChoiceClickProof | null = null;
  if (pending.control === "choice") {
    if (input.clickProofPath === undefined) {
      throw new Error("Coherent choice binding requires --click-proof.");
    }
    clickProof = readCampaignPlayChoiceClickProof(input.clickProofPath);
    assertPendingChoiceMatchesClickProof(pending, clickProof, existing.length + 1);
    if (clickProof.decisionDigest !== pending.decisionDigest) {
      throw new Error("The DOM click proof is not bound to the immutable signed decision.");
    }
  }

  const completed = await readCampaignPlaySettlementTerminalSnapshot(
    config.campaignId,
    admittedTurnId,
  );
  assertTerminalSnapshotMatches(proof.terminalSnapshot, completed.snapshot);
  const turn = completed.turn;
  const turnRecord = (turn.turn ?? {}) as Record<string, unknown>;
  const result = (turn.result ?? {}) as Record<string, unknown>;
  const apiNarration = (result.narration ?? {}) as Record<string, unknown>;
  const apiOperation = (result.narrationOperation ?? {}) as Record<string, unknown>;
  if (
    turnRecord.turnId !== admittedTurnId
    || apiNarration.turnId !== admittedTurnId
    || apiOperation.turnId !== admittedTurnId
    || apiOperation.sourceKind !== "model_accepted"
    || !isNonemptyString(apiNarration.narrationId)
    || !isNonemptyString(apiOperation.operationId)
    || proof.renderedNarrationId !== completed.snapshot.narrationId
    || (proof.renderedSceneIdentity !== completed.snapshot.properSceneNarrationId
      && proof.renderedSceneIdentity !== completed.snapshot.narrationOperationId)
    || proof.enabledChoiceCount
      !== completed.snapshot.suggestedControlHandles.length
        + completed.snapshot.utilityControlHandles.length
  ) {
    throw new Error("The rendered and API narration identities do not match the admitted turn.");
  }
  if (proof.afterProjectionHash !== completed.snapshot.projectionHash) {
    throw new Error("The rendered and API projection hashes do not match.");
  }

  const sourceHandle = openCampaignPlayDatabase(config.campaignId);
  let settlement: CoherentSettlement;
  const turnEvidenceId = sha256(admittedTurnId).slice(0, 16);
  const copyPath = path.join(
    root,
    "probes",
    "settlements",
    `action-${pending.playerActionNumber}-${turnEvidenceId}.sqlite`,
  );
  try {
    await backupCampaignPlayDatabase(sourceHandle.databasePath, copyPath);
    const inspected = inspectCoherentSettlementCopy({
      copyPath,
      campaignId: config.campaignId,
      turnId: admittedTurnId,
      pending,
    });
    settlement = {
      ...inspected,
      readyObservedAt: completed.snapshot.capturedAt,
      stateDbPath: sourceHandle.databasePath,
      stateDbSha256: sha256File(sourceHandle.databasePath),
      readCopyPath: copyPath,
      readCopySha256: sha256File(copyPath),
    };
  } finally {
    sourceHandle.close();
  }

  const adjacentState = await loadPublicState(config.campaignId);
  const adjacentTurn = await loadPublicTurn(config.campaignId, admittedTurnId);
  const adjacentTurnRecord = (adjacentTurn.turn ?? {}) as Record<string, unknown>;
  const adjacentResult = (adjacentTurn.result ?? {}) as Record<string, unknown>;
  const adjacentOperation = (adjacentResult.narrationOperation ?? {}) as Record<string, unknown>;
  if (
    adjacentState.phase !== "ready"
    || adjacentState.activeTurn !== null
    || adjacentState.projectionHash !== settlement.projectionHash
    || adjacentState.worldVersion !== settlement.worldVersion
    || adjacentState.runtimeRevision !== settlement.runtimeRevision
    || adjacentTurnRecord.status !== "completed"
    || adjacentTurnRecord.turnId !== settlement.turnId
    || adjacentOperation.operationId !== settlement.operationId
    || adjacentOperation.sourceKind !== "model_accepted"
  ) {
    throw new Error("The adjacent API and SQLite settlement snapshots disagree.");
  }

  const clickDispatchedAt = clickProof?.clickDispatchedAt ?? pending.signedAt;
  const clickCompletedAt = clickProof?.clickCompletedAt ?? clickDispatchedAt;
  if (settlement.turnSubmittedAt < clickDispatchedAt) {
    throw new Error("The durable admission predates the DOM dispatch proof.");
  }
  const latencyMs = {
    signedToAdmission: settlement.turnSubmittedAt - pending.signedAt,
    clickToAdmission: settlement.turnSubmittedAt - clickDispatchedAt,
    clickToTurnComplete: settlement.turnCompletedAt - clickDispatchedAt,
    clickToNarration: settlement.narrationOperationCompletedAt - clickDispatchedAt,
    clickToReady: settlement.readyObservedAt - clickDispatchedAt,
  };
  if (Object.values(latencyMs).some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("The settlement timeline contains a negative or unbounded latency scalar.");
  }

  const evidence = campaignPlayBrowserActionEvidenceSchema.parse({
    runId: config.runId,
    campaignId: config.campaignId,
    playerActionNumber: pending.playerActionNumber,
    control: pending.control,
    visibleStateHash: pending.visibleStateHash,
    decisionDigest: pending.decisionDigest,
    chosenText: pending.chosenText,
    choiceHandle: pending.choiceHandle,
    turnId: settlement.turnId,
    chooser: pending.chooser,
    signedAt: pending.signedAt,
    decisionNote: pending.decisionNote,
  });
  fs.mkdirSync(path.join(root, "probes", "settlements"), { recursive: true });
  const settlementEvidence = {
    capturedAt: Date.now(),
    playerActionNumber: pending.playerActionNumber,
    turnId: settlement.turnId,
    decisionDigest: pending.decisionDigest,
    resultId: settlement.resultId,
    terminalReason: settlement.terminalReason,
    operationId: settlement.operationId,
    narrationId: settlement.narrationId,
    narrationStatus: settlement.narrationStatus,
    properSceneNarrationId: settlement.properSceneNarrationId,
    sourceKind: "model_accepted",
    projectionHash: settlement.projectionHash,
    beforeProjectionHash: proof.beforeProjectionHash,
    worldVersion: settlement.worldVersion,
    runtimeRevision: settlement.runtimeRevision,
    replayHash: settlement.replayHash,
    apiBaseUrl: campaignPlayApiBaseUrl(),
    stateDbPath: settlement.stateDbPath,
    stateDbSha256: settlement.stateDbSha256,
    readCopyPath: settlement.readCopyPath,
    readCopySha256: settlement.readCopySha256,
    renderProof: proof,
    clickProof,
    timeline: {
      signedAt: pending.signedAt,
      clickDispatchedAt,
      clickCompletedAt,
      turnSubmittedAt: settlement.turnSubmittedAt,
      turnCompletedAt: settlement.turnCompletedAt,
      narrationOperationCompletedAt: settlement.narrationOperationCompletedAt,
      readyObservedAt: settlement.readyObservedAt,
      latencyMs,
    },
    modelStages: settlement.modelStages,
    outcome: "model_accepted_coherent_settlement",
    integrity: "ok",
   foreignKeyViolations: 0,
  };
  if (fs.existsSync(settlementPath)) {
    const stored = readJson<Record<string, unknown>>(settlementPath);
    if (
      stored.playerActionNumber !== settlementEvidence.playerActionNumber
      || stored.turnId !== settlementEvidence.turnId
      || stored.decisionDigest !== settlementEvidence.decisionDigest
      || stored.operationId !== settlementEvidence.operationId
      || stored.narrationId !== settlementEvidence.narrationId
      || stored.projectionHash !== settlementEvidence.projectionHash
      || JSON.stringify(stored.renderProof) !== JSON.stringify(settlementEvidence.renderProof)
      || JSON.stringify(stored.clickProof) !== JSON.stringify(settlementEvidence.clickProof)
    ) {
      throw new Error("Conflicting settlement evidence exists for the signed decision.");
    }
  } else {
    writeJsonExclusive(settlementPath, settlementEvidence);
    input.injectFault?.("after_settlement_write");
  }
  const afterSettlement = readJsonLines<CampaignPlayBrowserActionEvidence>(
    path.join(root, "browser-actions.jsonl"),
  ).map((record) => campaignPlayBrowserActionEvidenceSchema.parse(record));
  if (afterSettlement.length > pending.playerActionNumber) {
    throw new Error("Browser-action ledger contains a conflicting later or duplicate row.");
  }
  if (afterSettlement.length === pending.playerActionNumber) {
    const row = afterSettlement[pending.playerActionNumber - 1]!;
    if (JSON.stringify(row) !== JSON.stringify(evidence)) {
      throw new Error("Conflicting browser-action ledger evidence exists for the signed decision.");
    }
    removePendingDecisionPointer(root, pending);
    return row;
  }
  if (afterSettlement.length !== pending.playerActionNumber - 1) {
    throw new Error("Browser-action ledger numbering is not contiguous at settlement.");
  }
  fs.appendFileSync(path.join(root, "browser-actions.jsonl"), JSON.stringify(evidence) + "\n", "utf8");
  const durableLedger = readJsonLines<CampaignPlayBrowserActionEvidence>(
    path.join(root, "browser-actions.jsonl"),
  ).map((record) => campaignPlayBrowserActionEvidenceSchema.parse(record));
  if (
    durableLedger.length !== pending.playerActionNumber
    || JSON.stringify(durableLedger[pending.playerActionNumber - 1]) !== JSON.stringify(evidence)
  ) {
    throw new Error("Browser-action ledger append did not produce one durable matching row.");
  }
  removePendingDecisionPointer(root, pending);
  return evidence;
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
    if (config.worldSource.kind === "generated") {
      const stateRepository = createCampaignPlayStateRepository(handle);
      if (!stateRepository.loadState()) {
        stateRepository.createState({
          eventId: `play-state:${hashCampaignPlayProjection({
            domain: "campaign_play_state_creation",
            campaignId: config.campaignId,
          }).slice(0, 40)}`,
          createdAt: input.startedAt,
        });
      }
    }
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
  choiceCapture?: unknown;
  decisionNote: string;
  signedAt: number;
}): Promise<PendingManualDecision> {
  const config = assertLiveConfig(input.runConfig);
  const manifest = sessionManifest(config);
  assertSessionOwnership(config, manifest);
  const root = campaignPlayLiveSessionRoot(config);
  const pendingPath = path.join(root, "pending-decision.json");
  const actions = readJsonLines<CampaignPlayBrowserActionEvidence>(
    path.join(root, "browser-actions.jsonl"),
  );
  if (readActiveManualDecision(root, config.runId, config.campaignId, actions.length + 1)) {
    throw new Error("A manual decision is already awaiting a durable turn.");
  }
  const state = await loadPublicState(config.campaignId);
  if (state.phase !== "ready" || typeof state.projectionHash !== "string") {
    throw new Error("A manual decision can only be signed from the ready player-visible state.");
  }
  let chosenText = input.chosenText.trim();
  const decisionNote = input.decisionNote.trim();
  if (!decisionNote) throw new Error("A manual decision note is required.");
  let choiceHandle: string | null = null;
  let choiceContainer: CampaignPlayChoiceContainer | null = null;
  let choiceOrdinal: number | null = null;
  let visibleLabel: string | null = null;
  let renderedControlIdentity: string | null = null;
  let choiceCaptureAt: number | null = null;
  if (input.control === "choice") {
    if (input.choiceHandle !== null) {
      throw new Error("A suggested choice must take its opaque handle from the rendered capture.");
    }
    const capture = assertCampaignPlayRenderedChoiceCapture(input.choiceCapture);
    if (
      capture.playerActionNumber !== actions.length + 1
      || capture.visibleStateHash !== state.projectionHash
    ) {
      throw new Error("The rendered choice capture is not from the current ready projection.");
    }
    assertCampaignPlayReadyChoiceMatchesApi(state, capture);
    if (input.chosenText && input.chosenText !== capture.chosenText) {
      throw new Error("A suggested-choice label must come from the same rendered capture as its handle.");
    }
    chosenText = capture.chosenText;
    choiceHandle = capture.choiceHandle;
    choiceContainer = capture.choiceContainer;
    choiceOrdinal = capture.choiceOrdinal;
    visibleLabel = capture.visibleLabel;
    renderedControlIdentity = capture.renderedControlIdentity;
    choiceCaptureAt = capture.capturedAt;
  } else {
    if (!chosenText || input.choiceHandle !== null || input.choiceCapture !== undefined) {
      throw new Error("Freeform input requires text and no suggested-choice capture.");
    }
  }
  const pendingUnsigned = {
    playerActionNumber: actions.length + 1,
    control: input.control,
    chosenText,
    choiceHandle,
    choiceContainer,
    choiceOrdinal,
    visibleLabel,
    renderedControlIdentity,
    choiceCaptureAt,
    visibleStateHash: state.projectionHash,
    chooser: config.operators.player!,
    signedAt: input.signedAt,
    decisionNote,
    captureIdentity: input.control === "choice"
      ? renderedControlIdentity!
      : "freeform:" + state.projectionHash,
    captureHash: "",
  };
  pendingUnsigned.captureHash = sha256(decisionCaptureIdentity(pendingUnsigned));
  const decisionDigest = signedDecisionDigest(config.runId, config.campaignId, pendingUnsigned);
  const pending: PendingManualDecision = {
    ...pendingUnsigned,
    decisionDigest,
    decisionReceiptPath: decisionReceiptRelativePath({ ...pendingUnsigned, decisionDigest }),
  };
  assertPendingDecisionIntegrity(pending, config.runId, config.campaignId);
  writeSignedDecisionReceipt(root, config.runId, config.campaignId, pending);
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
  const existing = readJsonLines<CampaignPlayBrowserActionEvidence>(
    path.join(root, "browser-actions.jsonl"),
  );
  const pending = readActiveManualDecision(root, config.runId, config.campaignId, existing.length + 1);
  if (!pending) throw new Error("No signed manual decision is awaiting a turn.");

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
      decisionDigest: pending.decisionDigest,
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
    removePendingDecisionPointer(root, pending);
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

  const actions = readJsonLines<CampaignPlayBrowserActionEvidence>(
    path.join(root, "browser-actions.jsonl"),
  ).map((record) => campaignPlayBrowserActionEvidenceSchema.parse(record));
  const pending = readActiveManualDecision(root, config.runId, config.campaignId, actions.length + 1);
  if (!pending) {
    throw new Error("No signed manual decision is awaiting cancellation.");
  }
  if (
    !Number.isSafeInteger(pending.playerActionNumber)
    || pending.playerActionNumber < 1
    || !Number.isFinite(pending.signedAt)
  ) {
    throw new Error("The pending manual decision has invalid action numbering or signature time.");
  }

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
  removePendingDecisionPointer(root, pending);
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
  const browserActions = readJsonLines<CampaignPlayBrowserActionEvidence>(
    path.join(root, "browser-actions.jsonl"),
  ).map((record) => campaignPlayBrowserActionEvidenceSchema.parse(record));
  if (readActiveManualDecision(root, config.runId, config.campaignId, browserActions.length + 1)) {
    throw new Error("The live session still has an unbound manual decision.");
  }
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
