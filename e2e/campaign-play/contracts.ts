import { z } from "zod";
import { MODEL_OUTPUT_TOKEN_MINIMUM } from "@worldforge/shared";

export const CAMPAIGN_PLAY_EVIDENCE_VERSION = 3 as const;

export const CAMPAIGN_PLAY_LANES = [
  "deterministic-10",
  "deterministic-30",
  "deterministic-60",
  "paired-intervene",
  "paired-peripheral",
  "full-path",
  "clone-provenance",
  "first-playable",
  "causal-20",
  "diagnostic-30",
  "pristine-60",
  "provenance-60",
  "soak-300",
  "longplay-600",
] as const;

export const CAMPAIGN_PLAY_REQUIRED_FILES = [
  "manifest.json",
  "eligibility.json",
  "turns.jsonl",
  "inputs.jsonl",
  "browser-actions.jsonl",
  "network-trace.jsonl",
  "model-stages.jsonl",
  "budget.json",
  "runtime-events.jsonl",
  "receipts.jsonl",
  "actor-jobs.jsonl",
  "visibility.jsonl",
  "transcript.md",
  "scorecard.json",
  "human-notes.md",
  "browser-console.json",
  "network-errors.json",
  "inventory.json",
] as const;

export const CAMPAIGN_PLAY_REQUIRED_DIRECTORIES = [
  "build",
  "checkpoints",
  "probes",
  "screenshots",
] as const;

export const CAMPAIGN_PLAY_HARD_FAILURE_KEYS = [
  "replayDivergence",
  "partialCommit",
  "missingTerminal",
  "hiddenStateLeak",
  "duplicateInput",
  "staleExecution",
  "activeDonorCall",
  "inventoryMismatch",
  "receiptCoverageGap",
  "runtimeEventGap",
  "turnEventGap",
  "provenanceDrift",
  "sqliteIntegrityFailure",
] as const;

const hashSchema = z.string().length(64).refine(
  (value) => [...value].every((character) => "0123456789abcdef".includes(character)),
  "Expected a lowercase SHA-256 hash.",
);
const nonnegativeIntegerSchema = z.number().int().nonnegative();
const positiveIntegerSchema = z.number().int().positive();
const timestampSchema = nonnegativeIntegerSchema;
const identifierSchema = z.string().min(1).max(240);

function isSafeRelativePath(value: string): boolean {
  if (value.startsWith("/") || value.includes("\\")) return false;
  const segments = value.split("/");
  return segments.length > 0 && segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

export const campaignPlayLaneSchema = z.enum(CAMPAIGN_PLAY_LANES);

const deterministicExecutionSchema = z.object({
  kind: z.literal("deterministic"),
  fixtureId: identifierSchema,
  seed: identifierSchema,
}).strict();

const liveModelPricingSchema = z.object({
  currency: z.literal("USD"),
  tokenUnit: z.literal(1_000_000),
  inputCostMicros: nonnegativeIntegerSchema,
  outputCostMicros: nonnegativeIntegerSchema,
}).strict();

const meteredBillingSchema = z.object({
  kind: z.literal("metered"),
  pricing: z.object({
    generator: liveModelPricingSchema,
    judge: liveModelPricingSchema,
    storyteller: liveModelPricingSchema,
  }).strict(),
  maximumCostMicros: positiveIntegerSchema,
}).strict();

const subscriptionBillingSchema = z.object({
  kind: z.literal("subscription"),
  providerName: identifierSchema,
  planId: identifierSchema,
  currency: z.literal("USD"),
  monthlyListPriceMicros: positiveIntegerSchema,
  pricingSourceUrl: z.string().url(),
  quotaEndpoint: z.string().url(),
}).strict();

const liveExecutionSchema = z.object({
  kind: z.literal("live"),
  providerId: identifierSchema,
  models: z.object({
    generator: identifierSchema,
    judge: identifierSchema,
    storyteller: identifierSchema,
  }).strict(),
  billing: z.discriminatedUnion("kind", [meteredBillingSchema, subscriptionBillingSchema]),
  maximumInputTokens: positiveIntegerSchema,
  maximumOutputTokens: positiveIntegerSchema.min(MODEL_OUTPUT_TOKEN_MINIMUM),
  maximumTurnDurationMs: positiveIntegerSchema,
}).strict();

const fixtureWorldSourceSchema = z.object({
  kind: z.literal("fixture"),
}).strict();

const generatedWorldSourceSchema = z.object({
  kind: z.literal("generated"),
}).strict();

const templateWorldSourceSchema = z.object({
  kind: z.literal("template"),
  templateId: identifierSchema,
  sourceCampaignId: identifierSchema,
  sourceCommit: z.string().min(7).max(64),
  acceptedWorldVersion: positiveIntegerSchema,
  acceptedContentHash: hashSchema,
  stateDbSha256: hashSchema,
  configSha256: hashSchema,
}).strict();

export const campaignPlayWorldSourceSchema = z.discriminatedUnion("kind", [
  fixtureWorldSourceSchema,
  generatedWorldSourceSchema,
  templateWorldSourceSchema,
]);

export const campaignPlayRunConfigSchema = z.object({
  evidenceVersion: z.literal(CAMPAIGN_PLAY_EVIDENCE_VERSION),
  runId: identifierSchema,
  lane: campaignPlayLaneSchema,
  campaignId: identifierSchema.nullable(),
  worldSource: campaignPlayWorldSourceSchema,
  expectedPlayerActions: nonnegativeIntegerSchema,
  outputRoot: z.string().min(1),
  execution: z.discriminatedUnion("kind", [
    deterministicExecutionSchema,
    liveExecutionSchema,
  ]),
  restartAfterPlayerActions: z.array(nonnegativeIntegerSchema),
  operators: z.object({
    runner: identifierSchema,
    player: identifierSchema.nullable(),
    auditor: identifierSchema,
  }).strict(),
}).strict().superRefine((value, context) => {
  const uniqueRestarts = new Set(value.restartAfterPlayerActions);
  if (uniqueRestarts.size !== value.restartAfterPlayerActions.length) {
    context.addIssue({ code: "custom", path: ["restartAfterPlayerActions"], message: "Restart checkpoints must be unique." });
  }
  if (value.restartAfterPlayerActions.some((action) => action > value.expectedPlayerActions)) {
    context.addIssue({ code: "custom", path: ["restartAfterPlayerActions"], message: "Restart checkpoints cannot exceed the action target." });
  }
  if (
    value.lane === "causal-20"
    && (
      value.expectedPlayerActions !== 20
      || JSON.stringify(value.restartAfterPlayerActions) !== JSON.stringify([1, 5, 10, 20])
    )
  ) {
    context.addIssue({
      code: "custom",
      path: ["restartAfterPlayerActions"],
      message: "The causal-20 lane requires exactly 20 actions and reload checkpoints 1, 5, 10, and 20.",
    });
  }
  if (value.execution.kind === "deterministic" && value.worldSource.kind !== "fixture") {
    context.addIssue({ code: "custom", path: ["worldSource"], message: "Deterministic runs require fixture world provenance." });
  }
  if (value.execution.kind === "live" && value.worldSource.kind === "fixture") {
    context.addIssue({ code: "custom", path: ["worldSource"], message: "Live runs require generated or template world provenance." });
  }
});

export const campaignPlayManifestSchema = z.object({
  evidenceVersion: z.literal(CAMPAIGN_PLAY_EVIDENCE_VERSION),
  runId: identifierSchema,
  campaignId: identifierSchema,
  worldSource: campaignPlayWorldSourceSchema,
  parentCampaignId: identifierSchema.nullable(),
  lane: campaignPlayLaneSchema,
  commit: z.string().min(7).max(64),
  dirty: z.boolean(),
  startedAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
  openingTurn: z.literal(0),
  completedPlayerActions: nonnegativeIntegerSchema,
  status: z.enum(["complete", "failed", "aborted"]),
  runConfigHash: hashSchema,
  eligibilityHash: hashSchema,
}).strict().superRefine((value, context) => {
  if (value.status === "complete" && value.completedAt === null) {
    context.addIssue({ code: "custom", path: ["completedAt"], message: "A complete run requires a completion timestamp." });
  }
  if (value.completedAt !== null && value.completedAt < value.startedAt) {
    context.addIssue({ code: "custom", path: ["completedAt"], message: "Completion cannot precede the run start." });
  }
});

const actorEligibilitySchema = z.object({
  actorId: identifierSchema,
  kind: z.literal("person"),
  role: z.enum(["key", "support", "background"]),
  placementId: identifierSchema,
  goalIds: z.array(identifierSchema).min(1),
  planId: identifierSchema,
  scheduleId: identifierSchema,
}).strict();

export const campaignPlayEligibilitySchema = z.object({
  evidenceVersion: z.literal(CAMPAIGN_PLAY_EVIDENCE_VERSION),
  campaignId: identifierSchema,
  frozenAt: timestampSchema,
  acceptedWorldVersion: positiveIntegerSchema,
  acceptedSnapshotHash: hashSchema,
  acceptedContentHash: hashSchema,
  topologyHash: hashSchema,
  reachableLocationIds: z.array(identifierSchema).min(3),
  activeActors: z.array(actorEligibilitySchema).min(6),
  pressureAnchorIds: z.array(identifierSchema).min(2),
  openingCandidateIds: z.array(identifierSchema).min(1),
  exposurePathIds: z.array(identifierSchema).min(1),
  planIds: z.array(identifierSchema).min(6),
  scheduleIds: z.array(identifierSchema).min(6),
}).strict().superRefine((value, context) => {
  const roleCounts = value.activeActors.reduce((counts, actor) => {
    counts[actor.role] += 1;
    return counts;
  }, { key: 0, support: 0, background: 0 });
  if (roleCounts.key < 1 || roleCounts.support < 2 || roleCounts.background < 2) {
    context.addIssue({ code: "custom", path: ["activeActors"], message: "Eligibility requires at least one key, two support, and two background people." });
  }
  if (new Set(value.activeActors.map((actor) => actor.actorId)).size !== value.activeActors.length) {
    context.addIssue({ code: "custom", path: ["activeActors"], message: "Eligibility requires one entry per person." });
  }
  value.activeActors.forEach((actor, index) => {
    if (!value.planIds.includes(actor.planId) || !value.scheduleIds.includes(actor.scheduleId)) {
      context.addIssue({
        code: "custom",
        path: ["activeActors", index],
        message: "Every person requires a persisted plan and schedule.",
      });
    }
  });
  if (new Set(value.scheduleIds).size !== value.scheduleIds.length) {
    context.addIssue({ code: "custom", path: ["scheduleIds"], message: "Schedule IDs must be unique." });
  }
});

export const campaignPlayCheckpointSchema = z.object({
  evidenceVersion: z.literal(CAMPAIGN_PLAY_EVIDENCE_VERSION),
  runId: identifierSchema,
  campaignId: identifierSchema,
  checkpointId: identifierSchema,
  afterPlayerAction: nonnegativeIntegerSchema,
  recordedAt: timestampSchema,
  acceptedSnapshotHash: hashSchema,
  worldVersion: positiveIntegerSchema,
  worldHash: hashSchema,
  runtimeRevision: nonnegativeIntegerSchema,
  runtimeHash: hashSchema,
  publicProjectionHash: hashSchema,
  protectedAuditHash: hashSchema,
  eventCursor: nonnegativeIntegerSchema,
  sqliteIntegrity: z.literal("ok"),
  foreignKeyViolations: z.literal(0),
}).strict();

export const campaignPlayReloadProofSchema = z.object({
  evidenceVersion: z.literal(CAMPAIGN_PLAY_EVIDENCE_VERSION),
  runId: identifierSchema,
  campaignId: identifierSchema,
  afterPlayerAction: nonnegativeIntegerSchema,
  beforePublicStateHash: hashSchema,
  afterPublicStateHash: hashSchema,
  beforeReplayHash: hashSchema,
  afterReplayHash: hashSchema,
  beforeCheckpointHash: hashSchema,
  afterCheckpointHash: hashSchema,
  matches: z.boolean(),
}).strict();

const campaignPlayBudgetBaseShape = {
  evidenceVersion: z.literal(CAMPAIGN_PLAY_EVIDENCE_VERSION),
  runId: identifierSchema,
  maximumInputTokens: nonnegativeIntegerSchema,
  maximumOutputTokens: nonnegativeIntegerSchema,
  actualInputTokens: nonnegativeIntegerSchema,
  actualOutputTokens: nonnegativeIntegerSchema,
  p95TurnDurationMs: nonnegativeIntegerSchema,
  p99TurnDurationMs: nonnegativeIntegerSchema,
} as const;

export const campaignPlaySubscriptionQuotaSnapshotSchema = z.object({
  capturedAt: timestampSchema,
  planId: identifierSchema,
  tokensFiveHours: z.object({
    percentage: nonnegativeIntegerSchema.max(100),
    nextResetAt: timestampSchema.nullable(),
  }).strict(),
  tokensWeekly: z.object({
    percentage: nonnegativeIntegerSchema.max(100),
    nextResetAt: timestampSchema,
  }).strict(),
  toolsMonthly: z.object({
    limit: nonnegativeIntegerSchema,
    used: nonnegativeIntegerSchema,
    remaining: nonnegativeIntegerSchema,
    percentage: nonnegativeIntegerSchema.max(100),
    nextResetAt: timestampSchema,
  }).strict(),
}).strict();

const meteredBudgetSchema = z.object({
  ...campaignPlayBudgetBaseShape,
  billingKind: z.literal("metered"),
  maximumCostMicros: nonnegativeIntegerSchema,
  actualCostMicros: nonnegativeIntegerSchema,
}).strict();

const subscriptionBudgetSchema = z.object({
  ...campaignPlayBudgetBaseShape,
  billingKind: z.literal("subscription"),
  providerName: identifierSchema,
  planId: identifierSchema,
  currency: z.literal("USD"),
  monthlyListPriceMicros: positiveIntegerSchema,
  attributableCostMicros: z.null(),
  quotaBefore: campaignPlaySubscriptionQuotaSnapshotSchema,
  quotaAfter: campaignPlaySubscriptionQuotaSnapshotSchema,
}).strict().superRefine((value, context) => {
  if (value.quotaBefore.planId !== value.planId || value.quotaAfter.planId !== value.planId) {
    context.addIssue({ code: "custom", path: ["planId"], message: "Quota snapshots must match the frozen subscription plan." });
  }
  if (value.quotaAfter.capturedAt < value.quotaBefore.capturedAt) {
    context.addIssue({ code: "custom", path: ["quotaAfter", "capturedAt"], message: "The final quota snapshot cannot precede the initial snapshot." });
  }
});

export const campaignPlayBudgetSchema = z.discriminatedUnion("billingKind", [
  meteredBudgetSchema,
  subscriptionBudgetSchema,
]);

export const campaignPlayTurnEvidenceSchema = z.object({
  runId: identifierSchema,
  campaignId: identifierSchema,
  turnId: identifierSchema,
  turnKind: z.enum(["opening", "player_action"]),
  openingTurn: z.literal(0).nullable(),
  playerActionNumber: positiveIntegerSchema.nullable(),
  status: z.enum(["completed", "interrupted", "failed"]),
  worldVersion: positiveIntegerSchema,
  runtimeRevision: nonnegativeIntegerSchema,
  eventCursor: positiveIntegerSchema,
  submittedAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
  publicResultHash: hashSchema.nullable(),
}).strict().superRefine((value, context) => {
  const validCount = value.turnKind === "opening"
    ? value.openingTurn === 0 && value.playerActionNumber === null
    : value.openingTurn === null && value.playerActionNumber !== null;
  if (!validCount) {
    context.addIssue({ code: "custom", message: "Opening and player action counters must use separate fields." });
  }
  if (value.status === "completed" && (value.completedAt === null || value.publicResultHash === null)) {
    context.addIssue({ code: "custom", message: "A completed turn requires terminal time and public result hash." });
  }
});

export const campaignPlayInputEvidenceSchema = z.object({
  runId: identifierSchema,
  campaignId: identifierSchema,
  inputId: identifierSchema,
  idempotencyKey: identifierSchema,
  playerActionNumber: positiveIntegerSchema,
  source: z.enum(["choice", "freeform"]),
  choiceHandle: identifierSchema.nullable(),
  text: z.string().min(1).max(4_000).nullable(),
  visibleStateHash: hashSchema,
  submittedAt: timestampSchema,
}).strict().superRefine((value, context) => {
  if (value.source === "choice" && (value.choiceHandle === null || value.text !== null)) {
    context.addIssue({ code: "custom", message: "Choice input requires only a choice handle." });
  }
  if (value.source === "freeform" && (value.text === null || value.choiceHandle !== null)) {
    context.addIssue({ code: "custom", message: "Freeform input requires only text." });
  }
});

export const campaignPlayBrowserActionEvidenceSchema = z.object({
  runId: identifierSchema,
  campaignId: identifierSchema,
  playerActionNumber: positiveIntegerSchema,
  control: z.enum(["choice", "freeform"]),
  visibleStateHash: hashSchema,
  chosenText: z.string().min(1).max(4_000),
  choiceHandle: identifierSchema.nullable(),
  turnId: identifierSchema,
  chooser: identifierSchema.nullable(),
  signedAt: timestampSchema.nullable(),
  decisionNote: z.string().min(1).max(1_000).nullable(),
}).strict();

export const campaignPlayNetworkEvidenceSchema = z.object({
  runId: identifierSchema,
  campaignId: identifierSchema,
  sequence: positiveIntegerSchema,
  method: z.string().min(3).max(12),
  path: z.string().min(1).max(2_000),
  status: z.number().int().min(100).max(599),
  requestBodyHash: hashSchema.nullable(),
  responseBodyHash: hashSchema.nullable(),
  playerActionNumber: positiveIntegerSchema.nullable(),
}).strict();

export const campaignPlayModelStageEvidenceSchema = z.object({
  runId: identifierSchema,
  campaignId: identifierSchema,
  turnId: identifierSchema,
  stage: identifierSchema,
  workerEpoch: positiveIntegerSchema,
  providerId: identifierSchema,
  model: identifierSchema,
  strategy: z.literal("strict_object"),
  attempts: positiveIntegerSchema,
  retryUsed: z.boolean(),
  textFallbackUsed: z.literal(false),
  inputTokens: nonnegativeIntegerSchema,
  outputTokens: nonnegativeIntegerSchema,
  costMicros: nonnegativeIntegerSchema.nullable(),
  durationMs: nonnegativeIntegerSchema,
  artifactHash: hashSchema,
}).strict().superRefine((value, context) => {
  if (value.retryUsed !== (value.attempts > 1)) {
    context.addIssue({
      code: "custom",
      path: ["retryUsed"],
      message: "Retry evidence must match the accepted model-stage attempt number.",
    });
  }
});

export const campaignPlayRuntimeEventEvidenceSchema = z.object({
  runId: identifierSchema,
  campaignId: identifierSchema,
  sequence: positiveIntegerSchema,
  mutationKind: identifierSchema,
  turnId: identifierSchema.nullable(),
  workerEpoch: positiveIntegerSchema.nullable(),
  worldVersion: positiveIntegerSchema,
  priorRuntimeRevision: nonnegativeIntegerSchema,
  resultRuntimeRevision: positiveIntegerSchema,
  priorRuntimeHash: hashSchema,
  resultRuntimeHash: hashSchema,
  protectedPayloadHash: hashSchema,
}).strict().superRefine((value, context) => {
  if (value.resultRuntimeRevision !== value.priorRuntimeRevision + 1) {
    context.addIssue({ code: "custom", message: "Runtime evidence must advance exactly one revision." });
  }
});

export const campaignPlayReceiptEvidenceSchema = z.object({
  runId: identifierSchema,
  campaignId: identifierSchema,
  turnId: identifierSchema,
  commandId: identifierSchema,
  receiptId: identifierSchema,
  actorId: identifierSchema,
  worldVersion: positiveIntegerSchema,
  eventIds: z.array(identifierSchema).min(1),
  receiptHash: hashSchema,
}).strict();

export const campaignPlayActorJobEvidenceSchema = z.object({
  runId: identifierSchema,
  campaignId: identifierSchema,
  turnId: identifierSchema,
  jobId: identifierSchema,
  actorId: identifierSchema,
  stage: identifierSchema,
  sourceWorldVersion: positiveIntegerSchema,
  settledWorldVersion: positiveIntegerSchema.nullable(),
  proposalId: identifierSchema.nullable(),
}).strict();

export const campaignPlayVisibilityEvidenceSchema = z.object({
  runId: identifierSchema,
  campaignId: identifierSchema,
  turnId: identifierSchema,
  eventId: identifierSchema,
  exposureId: identifierSchema,
  observationId: identifierSchema.nullable(),
  channel: z.enum(["direct_perception", "local_aftermath", "route_state", "witness_report"]),
  eligible: z.boolean(),
  publicEntryHash: hashSchema.nullable(),
}).strict();

const hardFailureCountsShape = Object.fromEntries(
  CAMPAIGN_PLAY_HARD_FAILURE_KEYS.map((key) => [key, nonnegativeIntegerSchema]),
) as Record<(typeof CAMPAIGN_PLAY_HARD_FAILURE_KEYS)[number], typeof nonnegativeIntegerSchema>;

export const campaignPlayScorecardSchema = z.object({
  evidenceVersion: z.literal(CAMPAIGN_PLAY_EVIDENCE_VERSION),
  runId: identifierSchema,
  lane: campaignPlayLaneSchema,
  completedPlayerActions: nonnegativeIntegerSchema,
  expectedPlayerActions: nonnegativeIntegerSchema,
  receiptCoverage: z.number().min(0).max(1),
  runtimeEventCoverage: z.number().min(0).max(1),
  turnEventCoverage: z.number().min(0).max(1),
  hardFailures: z.object(hardFailureCountsShape).strict(),
  promotionEligible: z.boolean(),
  findings: z.array(z.object({
    code: identifierSchema,
    message: z.string().min(1).max(1_000),
    evidencePaths: z.array(z.string().refine(isSafeRelativePath)).min(1),
  }).strict()),
}).strict().superRefine((value, context) => {
  const hardFailureTotal = CAMPAIGN_PLAY_HARD_FAILURE_KEYS.reduce(
    (total, key) => total + value.hardFailures[key],
    0,
  );
  const shouldPromote = hardFailureTotal === 0
    && value.completedPlayerActions === value.expectedPlayerActions
    && value.receiptCoverage === 1
    && value.runtimeEventCoverage === 1
    && value.turnEventCoverage === 1
    && value.findings.length === 0;
  if (value.promotionEligible !== shouldPromote) {
    context.addIssue({ code: "custom", path: ["promotionEligible"], message: "Promotion eligibility does not match the measured gate." });
  }
});

export const campaignPlayInventoryEntrySchema = z.object({
  path: z.string().refine(isSafeRelativePath, "Inventory paths must be safe bundle-relative paths."),
  bytes: nonnegativeIntegerSchema,
  sha256: hashSchema,
}).strict();

export const campaignPlayInventorySchema = z.object({
  evidenceVersion: z.literal(CAMPAIGN_PLAY_EVIDENCE_VERSION),
  runId: identifierSchema,
  entries: z.array(campaignPlayInventoryEntrySchema),
}).strict().superRefine((value, context) => {
  const paths = value.entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    context.addIssue({ code: "custom", path: ["entries"], message: "Inventory paths must be unique." });
  }
  const sorted = [...paths].sort((left, right) => left.localeCompare(right));
  if (paths.some((entry, index) => entry !== sorted[index])) {
    context.addIssue({ code: "custom", path: ["entries"], message: "Inventory entries must use canonical path order." });
  }
  if (paths.includes("inventory.json")) {
    context.addIssue({ code: "custom", path: ["entries"], message: "Inventory cannot hash itself." });
  }
});

export type CampaignPlayRunConfig = z.infer<typeof campaignPlayRunConfigSchema>;
export type CampaignPlayManifest = z.infer<typeof campaignPlayManifestSchema>;
export type CampaignPlayWorldSource = z.infer<typeof campaignPlayWorldSourceSchema>;
export type CampaignPlayEligibility = z.infer<typeof campaignPlayEligibilitySchema>;
export type CampaignPlayCheckpoint = z.infer<typeof campaignPlayCheckpointSchema>;
export type CampaignPlayReloadProof = z.infer<typeof campaignPlayReloadProofSchema>;
export type CampaignPlayBudget = z.infer<typeof campaignPlayBudgetSchema>;
export type CampaignPlayTurnEvidence = z.infer<typeof campaignPlayTurnEvidenceSchema>;
export type CampaignPlayInputEvidence = z.infer<typeof campaignPlayInputEvidenceSchema>;
export type CampaignPlayBrowserActionEvidence = z.infer<typeof campaignPlayBrowserActionEvidenceSchema>;
export type CampaignPlayNetworkEvidence = z.infer<typeof campaignPlayNetworkEvidenceSchema>;
export type CampaignPlayModelStageEvidence = z.infer<typeof campaignPlayModelStageEvidenceSchema>;
export type CampaignPlayRuntimeEventEvidence = z.infer<typeof campaignPlayRuntimeEventEvidenceSchema>;
export type CampaignPlayReceiptEvidence = z.infer<typeof campaignPlayReceiptEvidenceSchema>;
export type CampaignPlayActorJobEvidence = z.infer<typeof campaignPlayActorJobEvidenceSchema>;
export type CampaignPlayVisibilityEvidence = z.infer<typeof campaignPlayVisibilityEvidenceSchema>;
export type CampaignPlayScorecard = z.infer<typeof campaignPlayScorecardSchema>;
export type CampaignPlayInventory = z.infer<typeof campaignPlayInventorySchema>;
