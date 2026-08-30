import crypto from "node:crypto";
import { setTimeout as waitForTimer } from "node:timers/promises";
import type { LanguageModel } from "ai";
import { z } from "zod";
import {
  CAMPAIGN_PLAY_DEFAULT_WAIT_MINUTES,
  CAMPAIGN_PLAY_LIMITS,
  type CampaignPlayActionContext,
  type CampaignPlayCommitmentBinding,
  type CampaignPlayDecisionBinding,
  type CampaignPlayDecisionOutcome,
  type CampaignPlayObligationBinding,
  type CampaignPlayJournalEntry,
  type CampaignPlayNarration,
  type CampaignPlayNarrationOperation,
  type CampaignPlayNarrationRecoveryRequest,
  type CampaignPlayNarratorPacket,
  type CampaignPlayTurnAdmissionRequest,
  type CampaignPlayTurnAdmissionResponse,
} from "@worldforge/shared";
import { createLogger } from "../lib/index.js";
import {
  CAMPAIGN_PLAY_COMMAND_METADATA,
  campaignPlayActionExecutionRouteSchema,
  campaignPlayActionContextSchema,
  campaignPlayDecisionBindingSchema,
  campaignPlayCommitmentBindingSchema,
  campaignPlayObligationBindingSchema,
  campaignPlayCertifiedCommitmentSchema,
  campaignPlayCertifiedObligationSchema,
  campaignPlayCertifiedContactSchema,
  campaignPlayCertifiedDecisionSchema,
  campaignPlayCertifiedMoveSchema,
  campaignPlayCertifiedObserveSchema,
  campaignPlayCertifiedWaitSchema,
  campaignPlayEntityRefSchema,
  campaignPlayGameMasterArtifactSchema,
  campaignPlayJournalEntrySchema,
  campaignPlayJudgeArtifactSchema,
  campaignPlayNarrationSchema,
  campaignPlayNarratorPacketSchema,
  campaignPlayPlayerProfileAuthoritySchema,
  campaignPlaySuggestedActionSchema,
  buildCampaignPlaySuggestedActionLabel,
  campaignPlaySuggestedActionLabelPrefix,
  campaignPlayTurnAdmissionRequestSchema,
  rulebookCommandBatchSchema,
  validateNarrationAgainstPacket,
  type CampaignPlayEntityRef,
  type CampaignPlayCertifiedCommitment,
  type CampaignPlayCertifiedObligation,
  type CampaignPlayCertifiedContact,
  type CampaignPlayCertifiedDecision,
  type CampaignPlayCertifiedMove,
  type CampaignPlayCertifiedObserve,
  type CampaignPlayCertifiedWait,
  type CampaignPlayGameMasterArtifact,
  type CampaignPlayJudgeArtifact,
  type CampaignPlayJudgeRuling,
} from "./contracts.js";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import {
  canonicalizeCampaignPlayProjection,
  deriveCampaignPlayPossessionId,
  deriveCampaignPlayPossessionKey,
  deriveCampaignPlayPublicHandle,
  deriveCampaignPlayObligationId,
  deriveCampaignPlayUtilityActions,
  hashCampaignPlayProjection,
  type CampaignPlayProjectionRecord,
} from "./campaign-play-projection.js";
import {
  CampaignPlayJudgeError,
  campaignPlaySuggestedTargetsAreAuthorized,
  campaignPlayJudgeFrameSchema,
  campaignPlayJudgeVisibleFactSchema,
  createCampaignPlayJudge,
  getCampaignPlayJudgeRecoveryFeedback,
  resolveCampaignPlayUncertainty,
  validateCampaignPlayUncertaintyResolution,
  type CampaignPlayJudgeFrame,
  type CampaignPlayJudgeInput,
  type CampaignPlayModelBudget,
  type CampaignPlayModelEvidence,
  type CampaignPlayJudgeRecoveryFeedback,
} from "./judge.js";
import {
  CampaignPlayGameMasterError,
  createCampaignPlayGameMaster,
  getCampaignPlayGameMasterContractFailureDiagnostic,
  getCampaignPlayGameMasterRecoveryFeedback,
  type CampaignPlayCommitmentAuthority,
  type CampaignPlayGameMasterFrame,
  type CampaignPlayGameMasterRecoveryFeedback,
} from "./game-master.js";
import { loadCampaignPlayActorContinuity } from "./actor-continuity.js";
import {
  executeCampaignPlayRulebookBatch,
  deriveCampaignPlayCommandId,
  deriveCampaignPlayCommitmentId,
  preflightCampaignPlayRulebook,
  type CampaignPlayRulebookAuthority,
  type CampaignPlayRulebookFaultPoint,
  type CampaignPlayRulebookFrame,
} from "./rulebook.js";
import {
  createCampaignPlayStateRepository,
  loadCampaignPlayRulebookFrame,
} from "./campaign-play-state-repository.js";
import {
  CampaignPlayTurnRepositoryError,
  createCampaignPlayTurnRepository,
  hashCampaignPlayNarratorPacket,
  type CampaignPlayExternalInterruptionEvidence,
  type CampaignPlayModelExecutionEvidence,
  type CampaignPlayRequestedModel,
  type CampaignPlayTurnModelSelection,
  type CampaignPlayTurnTelemetry,
  type CampaignPlayWorkerLeaseToken,
  type LoadedCampaignPlayTurn,
} from "./campaign-play-turn-repository.js";

import {
  CampaignPlayExternalStageInterruption,
  createCampaignPlayTurnService,
  type CampaignPlayTurnService,
  type CampaignPlayTurnServiceClock,
  type CampaignPlayTurnServiceResult,
  type ResumeCampaignPlayTurnInput,
} from "./turn-service.js";
import {
  createCampaignPlayActorScheduler,
  type CampaignPlayActorScheduler,
} from "./actor-scheduler.js";
import {
  createCampaignPlayActorProposalService,
  type CampaignPlayActorProposalService,
} from "./actor-proposal-service.js";
import {
  createCampaignPlayActorReplanner,
  type CampaignPlayActorReplanner,
} from "./actor-replanner.js";
import { campaignPlayOpeningArtifactSchema } from "./opening-planner.js";
import {
  CampaignPlayNarratorError,
  createCampaignPlayNarrator,
  type CampaignPlayNarrator,
  type CampaignPlayNarratorModelEvidence,
  type CampaignPlayNarratorRecoveryFeedback,
} from "./narrator.js";
import {
  createCampaignPlayVisibilityService,
  type CampaignPlayVisibilityService,
} from "./visibility-service.js";
import {
  createCampaignPlayNarrationOperationRepository,
  type CampaignPlayNarrationRecoveryKind,
  type CampaignPlayNarrationAttemptToken,
  type CampaignPlayNarrationOperationWithRecovery,
} from "./narration-operation-repository.js";
import { campaignPlayResponseModelMatches } from "./model-identity.js";

const log = createLogger("campaign-play-turn-runtime");

const line = (maximum: number) => z.string().min(1).max(maximum)
  .refine((value) => value === value.trim())
  .refine((value) => !value.includes("\n") && !value.includes("\r"));
const hashSchema = z.string().length(64).refine((value) => [...value].every((character) =>
  (character >= "0" && character <= "9") || (character >= "a" && character <= "f")
));

const judgeInputSchema = z.object({
  originalText: z.string().min(1).max(CAMPAIGN_PLAY_LIMITS.playerInput)
    .refine((value) => value === value.trim()),
  source: z.enum(["freeform", "suggested"]),
  choiceHandle: line(CAMPAIGN_PLAY_LIMITS.handle).nullable(),
  decisionBinding: campaignPlayDecisionBindingSchema.optional(),
  commitmentBinding: campaignPlayCommitmentBindingSchema.optional(),
  obligationBinding: campaignPlayObligationBindingSchema.optional(),
}).strict().superRefine((value, context) => {
  if ((value.source === "suggested") !== (value.choiceHandle !== null)) {
    context.addIssue({
      code: "custom",
      path: ["choiceHandle"],
      message: "Choice handle must match the admitted input source.",
    });
  }
  const bindingCount = [
    value.decisionBinding,
    value.commitmentBinding,
    value.obligationBinding,
  ].filter((binding) => binding !== undefined).length;
  if (bindingCount > 1) {
    context.addIssue({
      code: "custom",
      path: ["obligationBinding"],
      message: "A suggested action cannot carry more than one typed binding.",
    });
  }
});

type CampaignPlayAdmissionJudgeInput = CampaignPlayJudgeInput & {
  decisionBinding?: CampaignPlayDecisionBinding;
  commitmentBinding?: CampaignPlayCommitmentBinding;
  obligationBinding?: CampaignPlayObligationBinding;
};

const choiceBindingSchema = z.object({
  handle: line(CAMPAIGN_PLAY_LIMITS.handle),
  label: line(CAMPAIGN_PLAY_LIMITS.label),
  kind: z.enum(["observe", "move", "contact", "wait", "attempt"]),
  targets: z.array(z.object({
    handle: line(CAMPAIGN_PLAY_LIMITS.handle),
    kind: z.enum(["actor", "location", "route", "pressure", "possession"]),
  }).strict()).max(CAMPAIGN_PLAY_LIMITS.targets),
  decisionBinding: campaignPlayDecisionBindingSchema.optional(),
  commitmentBinding: campaignPlayCommitmentBindingSchema.optional(),
  obligationBinding: campaignPlayObligationBindingSchema.optional(),
}).strict();

const handleBindingSchema = z.object({
  handle: line(CAMPAIGN_PLAY_LIMITS.handle),
  reference: campaignPlayEntityRefSchema,
}).strict();

const publicMomentSchema = z.object({
  kind: z.enum(["proper_scene", "concise_result"]),
  momentId: line(CAMPAIGN_PLAY_LIMITS.id),
  turnId: line(CAMPAIGN_PLAY_LIMITS.id),
  displayText: z.string().min(1).max(CAMPAIGN_PLAY_LIMITS.narrationText),
  suggestedActions: z.array(campaignPlaySuggestedActionSchema)
    .max(CAMPAIGN_PLAY_LIMITS.suggestedActions),
  utilityActions: z.array(campaignPlaySuggestedActionSchema).max(1),
  createdAt: z.number().int().safe().nonnegative(),
}).strict();

const MAXIMUM_VISIBLE_WORLD_EVENTS =
  CAMPAIGN_PLAY_LIMITS.newObservations + CAMPAIGN_PLAY_LIMITS.continuityEntries;

const playerActionAdmissionFrameSchema = z.object({
  campaignId: line(CAMPAIGN_PLAY_LIMITS.id),
  turnId: line(CAMPAIGN_PLAY_LIMITS.id),
  acceptedWorldVersion: z.number().int().safe().positive(),
  acceptedContentHash: hashSchema,
  baseWorldVersion: z.number().int().safe().positive(),
  baseRuntimeRevision: z.number().int().safe().positive(),
  worldTimeMinutes: z.number().int().safe().min(0).max(CAMPAIGN_PLAY_LIMITS.worldTimeMinutes),
  sourceTurnId: line(CAMPAIGN_PLAY_LIMITS.id),
  sourceMomentId: line(CAMPAIGN_PLAY_LIMITS.id),
  sourceMomentHash: hashSchema,
  sourcePacketHash: hashSchema,
  sourceMoment: publicMomentSchema,
  sourcePacket: campaignPlayNarratorPacketSchema,
  player: z.object({
    actorId: line(CAMPAIGN_PLAY_LIMITS.id),
    actorHandle: line(CAMPAIGN_PLAY_LIMITS.handle),
    name: line(CAMPAIGN_PLAY_LIMITS.name),
    profileDigest: hashSchema,
    profile: campaignPlayPlayerProfileAuthoritySchema,
  }).strict(),
  judgeInput: judgeInputSchema,
  visibleFacts: z.array(campaignPlayJudgeVisibleFactSchema).max(40),
  handleBindings: z.array(handleBindingSchema).max(40),
  choiceBindings: z.array(choiceBindingSchema)
    .max(CAMPAIGN_PLAY_LIMITS.suggestedActions + 1),
  authority: z.object({
    authorizedRefs: z.array(campaignPlayEntityRefSchema).max(40),
    witnessActorIds: z.array(line(CAMPAIGN_PLAY_LIMITS.id)).max(8),
    knownWorldEventIds: z.array(line(CAMPAIGN_PLAY_LIMITS.id)).max(MAXIMUM_VISIBLE_WORLD_EVENTS),
  }).strict(),
  executionRoute: campaignPlayActionExecutionRouteSchema.optional()
    .default({ kind: "full_authority" }),
}).strict().superRefine((frame, context) => {
  if (
    frame.sourcePacket.campaignId !== frame.campaignId ||
    frame.sourcePacket.turnId !== frame.sourceTurnId ||
    frame.sourceMoment.turnId !== frame.sourceTurnId ||
    frame.sourceMoment.momentId !== frame.sourceMomentId ||
    frame.sourcePacket.acceptedWorldVersion !== frame.acceptedWorldVersion ||
    frame.sourcePacket.worldVersion !== frame.baseWorldVersion ||
    frame.sourcePacketHash !== hashCampaignPlayNarratorPacket(
      frame.sourceTurnId,
      frame.sourcePacket as unknown as CampaignPlayProjectionRecord,
    ) ||
    frame.sourceMomentHash !== hashCampaignPlayProjection({
      domain: "campaign_play_source_moment",
      moment: frame.sourceMoment,
    })
  ) {
    context.addIssue({
      code: "custom",
      path: ["sourcePacket"],
      message: "Player action source narration identity is invalid.",
    });
  }
  const factHandles = frame.visibleFacts.map((fact) => fact.handle);
  const bindingHandles = frame.handleBindings.map((binding) => binding.handle);
  const choiceHandles = frame.choiceBindings.map((binding) => binding.handle);
  if (
    new Set(factHandles).size !== factHandles.length ||
    new Set(bindingHandles).size !== bindingHandles.length ||
    new Set(choiceHandles).size !== choiceHandles.length
  ) {
    context.addIssue({
      code: "custom",
      path: ["visibleFacts"],
      message: "Player action public and protected handles must be unique.",
    });
  }
  const visible = new Set(factHandles);
  if (
    frame.handleBindings.some((binding) => !visible.has(binding.handle)) ||
    frame.choiceBindings.some((binding) =>
      !visible.has(binding.handle) || binding.targets.some((target) => !visible.has(target.handle)))
  ) {
    context.addIssue({
      code: "custom",
      path: ["handleBindings"],
      message: "Bindings must reference only the frozen visible fact set.",
    });
  }
});

const playerCharacterRecordProjectionSchema = z.object({
  identity: z.object({
    id: line(CAMPAIGN_PLAY_LIMITS.id),
    campaignId: line(CAMPAIGN_PLAY_LIMITS.id),
    displayName: line(CAMPAIGN_PLAY_LIMITS.name),
    role: z.literal("player"),
    behavioralCore: z.object({
      motives: z.array(line(CAMPAIGN_PLAY_LIMITS.label))
        .max(CAMPAIGN_PLAY_LIMITS.characterList),
    }).passthrough().optional(),
  }).passthrough(),
  profile: z.object({
    backgroundSummary: z.string().min(1).max(CAMPAIGN_PLAY_LIMITS.text)
      .refine((value) => value === value.trim()),
    personaSummary: z.string().min(1).max(CAMPAIGN_PLAY_LIMITS.text)
      .refine((value) => value === value.trim()),
  }).passthrough(),
  motivations: z.object({
    shortTermGoals: z.array(line(CAMPAIGN_PLAY_LIMITS.label))
      .max(CAMPAIGN_PLAY_LIMITS.characterList),
    longTermGoals: z.array(line(CAMPAIGN_PLAY_LIMITS.label))
      .max(CAMPAIGN_PLAY_LIMITS.characterList),
    drives: z.array(line(CAMPAIGN_PLAY_LIMITS.label))
      .max(CAMPAIGN_PLAY_LIMITS.characterList),
  }).passthrough(),
  capabilities: z.object({
    traits: z.array(line(CAMPAIGN_PLAY_LIMITS.label))
      .max(CAMPAIGN_PLAY_LIMITS.characterList).optional(),
    skills: campaignPlayPlayerProfileAuthoritySchema.shape.skills,
    specialties: campaignPlayPlayerProfileAuthoritySchema.shape.specialties,
  }).passthrough(),
}).passthrough();

export type CampaignPlayPlayerActionAdmissionFrame = z.infer<
  typeof playerActionAdmissionFrameSchema
>;

export type CampaignPlayTurnRuntimeErrorCode =
  | "turn_request_invalid"
  | "turn_idempotency_conflict"
  | "turn_state_invalid"
  | "turn_public_context_invalid"
  | "turn_judge_invalid"
  | "turn_game_master_invalid"
  | "turn_artifact_invalid";

export class CampaignPlayTurnRuntimeError extends Error {
  constructor(
    readonly code: CampaignPlayTurnRuntimeErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignPlayTurnRuntimeError";
  }
}

export interface CampaignPlayTurnRuntimeStageModel {
  languageModel: LanguageModel;
  reasoningModel?: LanguageModel;
  requested: CampaignPlayRequestedModel;
  temperature: number;
  maximumInputTokens: number;
  maximumOutputTokens: number;
  maximumTotalTokens: number;
  maximumCostMicros: number;
}

interface CampaignPlayJudgeRuntime {
  judge: ReturnType<typeof createCampaignPlayJudge>["judge"];
}

interface CampaignPlayGameMasterRuntime {
  plan: ReturnType<typeof createCampaignPlayGameMaster>["plan"];
}

export interface CreateCampaignPlayTurnRuntimeInput {
  handle: CampaignPlayDatabaseHandle;
  owner: string;
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
  externalOperationDeadlineMs?: number;
  gameMasterOperationDeadlineMs?: number;
  actorReplannerOperationDeadlineMs?: number;
  actorCriticalPathReplanLimit?: number;
  uncertaintySeedKey: string;
  judgeModel: CampaignPlayTurnRuntimeStageModel;
  gameMasterModel: CampaignPlayTurnRuntimeStageModel;
  certifiedGameMasterModel?: CampaignPlayTurnRuntimeStageModel;
  actorReplannerModel: CampaignPlayTurnRuntimeStageModel;
  narratorModel: CampaignPlayTurnRuntimeStageModel;
  clock?: CampaignPlayTurnServiceClock;
  judge?: CampaignPlayJudgeRuntime;
  gameMaster?: CampaignPlayGameMasterRuntime;
  actorScheduler?: CampaignPlayActorScheduler;
  actorProposalService?: CampaignPlayActorProposalService;
  actorReplanner?: CampaignPlayActorReplanner;
  narrator?: CampaignPlayNarrator;
  visibility?: CampaignPlayVisibilityService;
  injectRulebookFault?: (point: CampaignPlayRulebookFaultPoint) => void;
  injectNarratorFault?: (point: "after_provider_return" | "during_terminal_commit") => void;
  judgeRecoveryFeedback?: CampaignPlayJudgeRecoveryFeedback;
  onJudgeRecoveryFeedback?: (feedback: CampaignPlayJudgeRecoveryFeedback) => void;
  gameMasterRecoveryFeedback?: CampaignPlayGameMasterRecoveryFeedback;
  onGameMasterRecoveryFeedback?: (feedback: CampaignPlayGameMasterRecoveryFeedback) => void;
}

export interface AdmitCampaignPlayPlayerActionInput {
  request: CampaignPlayTurnAdmissionRequest;
  submittedAt: number;
}

export interface CampaignPlayTurnRuntime {
  admitAction(input: AdmitCampaignPlayPlayerActionInput): CampaignPlayTurnAdmissionResponse;
  runNextStage(turnId: string): Promise<CampaignPlayTurnServiceResult>;
  recoverActiveTurn(): Promise<CampaignPlayTurnServiceResult | null>;
  resumeInterruptedStage(input: ResumeCampaignPlayTurnInput): Promise<CampaignPlayTurnServiceResult>;
  runNarration(
    turnId: string,
    claimedToken?: CampaignPlayNarrationAttemptToken,
    recoveryFeedback?: CampaignPlayNarratorRecoveryFeedback,
    structuredOutputMode?: "auto" | "tool",
  ): Promise<CampaignPlayNarrationExecution | null>;
  prepareNarrationRecovery(
    request: CampaignPlayNarrationRecoveryRequest,
    kind?: CampaignPlayNarrationRecoveryKind,
  ): CampaignPlayNarrationAttemptToken;
  loadTurn(turnId: string): LoadedCampaignPlayTurn | null;
  loadTelemetry(turnId: string): CampaignPlayTurnTelemetry;
}

export type CampaignPlayNarrationExecution = CampaignPlayNarrationOperationWithRecovery;

interface CompletedPublicMomentRow {
  sourceTurnId: string;
  sourceTurnStage: string;
  sourceTurnPacketHash: string | null;
  terminalReason: string;
  narrationId: string;
  packetHash: string;
  packetJson: string;
  narrationCreatedAt: number;
  narrationSourceKind: string | null;
}

interface PendingNarrationRow {
  narrationId: string;
  packetHash: string;
  packetJson: string;
  status: string;
  createdAt: number;
}

function validateCompletedPublicNarration(
  narration: CampaignPlayNarration,
  packet: CampaignPlayNarratorPacket,
  sourceKind: string | null,
): void {
  const effect = narration.effects[0];
  if (
    sourceKind !== "deterministic_continuity" || narration.effects.length !== 1 ||
    effect === undefined || effect.kind !== "fade"
  ) {
    validateNarrationAgainstPacket(narration, packet);
    return;
  }

  const beat = narration.beats.length === 1 ? narration.beats[0] : undefined;
  const expectedSuggestedActions = packet.availableIntents.slice(0, 4).map((intent) => ({
    choiceHandle: intent.handle,
    label: intent.kind === "move" || intent.kind === "wait"
      ? buildCampaignPlaySuggestedActionLabel(packet, intent, null)
      : buildCampaignPlaySuggestedActionLabel(packet, intent, intent.label),
  }));
  if (
    packet.turnKind !== "player_action" || packet.sourceMoment === null ||
    beat === undefined || beat.text !== packet.sourceMoment ||
    narration.displayText !== packet.sourceMoment ||
    canonicalizeCampaignPlayProjection(narration.suggestedActions) !==
      canonicalizeCampaignPlayProjection(expectedSuggestedActions) ||
    effect.beatId !== beat.beatId
  ) {
    throw new Error("historical deterministic continuity scene shape");
  }

  // Older continuity rows used the pre-contract fade effect. Validate the
  // exact historical shape through the current generic contract in memory;
  // the persisted artifact is never rewritten.
  validateNarrationAgainstPacket({
    ...narration,
    effects: [{ ...effect, kind: "flash" }],
  }, packet);
}

interface HumanRow {
  actorId: string;
  kind: string;
  controller: string;
  role: string;
  name: string;
  profileDigest: string;
  profile: z.infer<typeof campaignPlayPlayerProfileAuthoritySchema>;
}

interface ObservationBindingRow {
  eventId: string;
  publicEntryJson: string;
}

interface HistoricalObservationRow extends ObservationBindingRow {
  observationId: string;
  worldTimeMinutes: number;
}

const RELEVANT_HISTORY_LIMIT = 6;
const historySegmenter = new Intl.Segmenter("und", { granularity: "word" });

function historyTerms(value: string): ReadonlySet<string> {
  const terms = new Set<string>();
  for (const part of historySegmenter.segment(value.normalize("NFKC").toLowerCase())) {
    if (!part.isWordLike) continue;
    const term = part.segment;
    if (term.length < 3) continue;
    terms.add(term);
    if (term.length >= 7) terms.add(term.slice(0, 5));
  }
  return terms;
}

function relevantPlayerHistory(input: {
  handle: CampaignPlayDatabaseHandle;
  mechanicalFrame: CampaignPlayRulebookFrame;
  human: HumanRow;
  judgeInput: CampaignPlayJudgeInput;
}): CampaignPlayJournalEntry[] {
  const currentLocationId = input.mechanicalFrame.placements.find((placement) =>
    placement.actorId === input.human.actorId && placement.placementKind === "present")?.locationId;
  if (!currentLocationId) return [];
  const rows = input.handle.sqlite.prepare(`SELECT observation_id AS observationId,
      event_id AS eventId, world_time_minutes AS worldTimeMinutes,
      public_entry_json AS publicEntryJson
    FROM campaign_play_observations
    WHERE campaign_id = ? AND human_actor_id = ? AND source_location_id = ?
      AND json_extract(public_entry_json, '$.consequence.causalCue') = 'your_action'
    ORDER BY world_time_minutes, observation_id`).all(
      input.handle.campaignId,
      input.human.actorId,
      currentLocationId,
    ) as HistoricalObservationRow[];
  if (rows.length === 0) return [];

  const queryTerms = historyTerms(input.judgeInput.originalText);
  if (queryTerms.size === 0) return [];
  const candidates = rows.map((row) => {
    const entry = campaignPlayJournalEntrySchema.parse(JSON.parse(row.publicEntryJson));
    return { row, entry, terms: historyTerms(`${entry.title} ${entry.text}`) };
  });
  const documentFrequency = new Map<string, number>();
  for (const term of queryTerms) {
    documentFrequency.set(term, candidates.filter((candidate) => candidate.terms.has(term)).length);
  }
  const discriminatingTerms = [...queryTerms].filter((term) => {
    const frequency = documentFrequency.get(term) ?? 0;
    return frequency > 0 && (candidates.length < 4 || frequency * 5 < candidates.length * 4);
  });
  if (discriminatingTerms.length === 0) return [];
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: discriminatingTerms.reduce((total, term) => candidate.terms.has(term)
        ? total + candidates.length - (documentFrequency.get(term) ?? 0) + 1
        : total, 0),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score
      || left.row.worldTimeMinutes - right.row.worldTimeMinutes
      || left.row.observationId.localeCompare(right.row.observationId))
    .slice(0, RELEVANT_HISTORY_LIMIT)
    .sort((left, right) => left.row.worldTimeMinutes - right.row.worldTimeMinutes
      || left.row.observationId.localeCompare(right.row.observationId))
    .map((candidate) => candidate.entry);
}

function runtimeId(domain: string, value: unknown): string {
  return `${domain}:${hashCampaignPlayProjection({ domain, value }).slice(0, 40)}`;
}

function referenceKey(reference: CampaignPlayEntityRef): string {
  return `${reference.kind}\u0000${reference.id}`;
}

function assertRuntimeModel(model: CampaignPlayTurnRuntimeStageModel): void {
  const integers = [
    model.maximumInputTokens,
    model.maximumOutputTokens,
    model.maximumTotalTokens,
    model.maximumCostMicros,
  ];
  if (
    !model.languageModel || !Number.isFinite(model.temperature) ||
    model.temperature < 0 || model.temperature > 2 ||
    integers.some((value) => !Number.isSafeInteger(value) || value < 0)
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_state_invalid",
      "Campaign Play player-action model configuration is invalid.",
    );
  }
}

function modelBudget(model: CampaignPlayTurnRuntimeStageModel): CampaignPlayModelBudget {
  return {
    maximumInputTokens: model.maximumInputTokens,
    maximumOutputTokens: model.maximumOutputTokens,
    maximumTotalTokens: model.maximumTotalTokens,
    maximumCostMicros: model.maximumCostMicros,
    inputCostMicrosPerMillionTokens: model.requested.pricing.inputCostMicros,
    outputCostMicrosPerMillionTokens: model.requested.pricing.outputCostMicros,
  };
}

function selection(input: CreateCampaignPlayTurnRuntimeInput): CampaignPlayTurnModelSelection {
  return {
    turnKind: "player_action",
    judge: input.judgeModel.requested,
    gameMaster: input.gameMasterModel.requested,
    actorReplanner: input.actorReplannerModel.requested,
    narrator: input.narratorModel.requested,
  };
}

function selectionForRoute(
  base: CampaignPlayTurnModelSelection,
  routeKind: "full_authority" | "certified_move" | "certified_wait" | "certified_contact" |
    "certified_decision" | "certified_observe" | "certified_commitment" |
    "certified_obligation",
  certifiedGameMaster: CampaignPlayRequestedModel,
): CampaignPlayTurnModelSelection {
  if (base.turnKind !== "player_action") return base;
  return routeKind === "certified_contact"
    ? { ...base, routeKind, gameMaster: certifiedGameMaster }
    : { ...base, routeKind };
}

function loadCompletedPublicMoment(
  handle: CampaignPlayDatabaseHandle,
): { packet: CampaignPlayNarratorPacket; moment: z.infer<typeof publicMomentSchema>; row: CompletedPublicMomentRow } {
  const row = handle.sqlite.prepare(`SELECT
      turn.id AS sourceTurnId, turn.stage AS sourceTurnStage,
      turn.public_packet_hash AS sourceTurnPacketHash,
      result.terminal_reason AS terminalReason,
      narration.narration_id AS narrationId,
      narration.packet_hash AS packetHash, narration.packet_json AS packetJson,
      narration.created_at AS narrationCreatedAt,
      (SELECT operation.source_kind
       FROM campaign_play_narration_operations operation
       WHERE operation.campaign_id = turn.campaign_id
         AND operation.turn_id = turn.id
         AND operation.packet_hash = narration.packet_hash
         AND operation.narration_id = narration.narration_id
         AND operation.status = 'complete'
       LIMIT 1) AS narrationSourceKind
    FROM campaign_play_turns turn
    JOIN campaign_play_turn_results result
      ON result.campaign_id = turn.campaign_id AND result.turn_id = turn.id
    JOIN campaign_play_narrations narration
      ON narration.campaign_id = turn.campaign_id AND narration.turn_id = turn.id
    JOIN campaign_play_runtime_events runtime_event
      ON runtime_event.campaign_id = turn.campaign_id AND runtime_event.turn_id = turn.id
      AND runtime_event.kind = 'turn_completed'
    WHERE turn.campaign_id = ? AND turn.stage = 'completed'
    ORDER BY runtime_event.sequence DESC LIMIT 1`).get(
      handle.campaignId,
    ) as CompletedPublicMomentRow | undefined;
  if (
    !row || row.sourceTurnStage !== "completed" ||
    row.sourceTurnPacketHash !== row.packetHash
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_public_context_invalid",
      "Campaign Play action admission requires one exact completed public moment.",
    );
  }
  let packet: CampaignPlayNarratorPacket;
  let moment: z.infer<typeof publicMomentSchema>;
  try {
    const parsedPacket = JSON.parse(row.packetJson) as unknown;
    packet = campaignPlayNarratorPacketSchema.parse(parsedPacket);
    const properScene = handle.sqlite.prepare(`SELECT narration_id AS narrationId,
        display_text AS displayText, suggested_actions_json AS suggestedActionsJson,
        created_at AS createdAt
      FROM campaign_play_proper_scenes
      WHERE campaign_id = ? AND turn_id = ? AND packet_hash = ?`).get(
        handle.campaignId,
        row.sourceTurnId,
        row.packetHash,
      ) as {
        narrationId: string;
        displayText: string;
        suggestedActionsJson: string;
        createdAt: number;
      } | undefined;
    const legacyScene = properScene ? undefined : handle.sqlite.prepare(`SELECT
        narration_id AS narrationId, display_text AS displayText,
        suggested_actions_json AS suggestedActionsJson, created_at AS createdAt
      FROM campaign_play_narrations
      WHERE campaign_id = ? AND turn_id = ? AND packet_hash = ? AND status = 'complete'`).get(
        handle.campaignId,
        row.sourceTurnId,
        row.packetHash,
      ) as {
        narrationId: string;
        displayText: string;
        suggestedActionsJson: string;
        createdAt: number;
      } | undefined;
    const concise = properScene || legacyScene ? undefined : handle.sqlite.prepare(`SELECT
        result_id AS resultId, concise_display_text AS displayText,
        concise_suggested_actions_json AS suggestedActionsJson, created_at AS createdAt
      FROM campaign_play_narration_operations
      WHERE campaign_id = ? AND turn_id = ? AND packet_hash = ?`).get(
        handle.campaignId,
        row.sourceTurnId,
        row.packetHash,
      ) as {
        resultId: string;
        displayText: string;
        suggestedActionsJson: string;
        createdAt: number;
      } | undefined;
    const scene = properScene ?? legacyScene;
    if (scene) {
      moment = publicMomentSchema.parse({
        kind: "proper_scene",
        momentId: scene.narrationId,
        turnId: row.sourceTurnId,
        displayText: scene.displayText,
        suggestedActions: JSON.parse(scene.suggestedActionsJson) as unknown,
        utilityActions: deriveCampaignPlayUtilityActions(packet),
        createdAt: scene.createdAt,
      });
    } else if (concise) {
      moment = publicMomentSchema.parse({
        kind: "concise_result",
        momentId: concise.resultId,
        turnId: row.sourceTurnId,
        displayText: concise.displayText,
        suggestedActions: JSON.parse(concise.suggestedActionsJson) as unknown,
        utilityActions: deriveCampaignPlayUtilityActions(packet),
        createdAt: concise.createdAt,
      });
    } else {
      throw new Error("missing public moment presentation");
    }
    if (
      canonicalizeCampaignPlayProjection(packet) !== row.packetJson ||
      packet.campaignId !== handle.campaignId || packet.turnId !== row.sourceTurnId ||
      hashCampaignPlayNarratorPacket(
        row.sourceTurnId,
        parsedPacket as CampaignPlayProjectionRecord,
      ) !== row.packetHash
    ) {
      throw new Error("public moment identity");
    }
    if (moment.kind === "proper_scene") {
      const narration = handle.sqlite.prepare(`SELECT beats_json AS beatsJson,
          effects_json AS effectsJson FROM campaign_play_proper_scenes
        WHERE campaign_id = ? AND turn_id = ? AND narration_id = ?
        UNION ALL SELECT beats_json AS beatsJson, effects_json AS effectsJson
        FROM campaign_play_narrations
        WHERE campaign_id = ? AND turn_id = ? AND narration_id = ? AND status = 'complete'
        LIMIT 1`).get(
          handle.campaignId,
          row.sourceTurnId,
          moment.momentId,
          handle.campaignId,
          row.sourceTurnId,
          moment.momentId,
        ) as { beatsJson: string; effectsJson: string } | undefined;
      if (!narration) throw new Error("missing proper scene artifact");
      const completedNarration: CampaignPlayNarration = campaignPlayNarrationSchema.parse({
        narrationId: moment.momentId,
        turnId: row.sourceTurnId,
        beats: JSON.parse(narration.beatsJson) as unknown,
        displayText: moment.displayText,
        suggestedActions: moment.suggestedActions,
        effects: JSON.parse(narration.effectsJson) as unknown,
        createdAt: moment.createdAt,
      });
      validateCompletedPublicNarration(completedNarration, packet, row.narrationSourceKind);
    }
  } catch (cause) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_public_context_invalid",
      "Campaign Play completed public moment is invalid.",
      { cause },
    );
  }
  return { packet, moment, row };
}

function humanPlayer(handle: CampaignPlayDatabaseHandle): HumanRow {
  const rows = handle.sqlite.prepare(`SELECT a.id AS actorId, a.kind, a.controller,
      a.role, a.name, c.record_hash AS recordHash, c.record_json AS recordJson
    FROM actors a
    LEFT JOIN campaign_play_characters c
      ON c.actor_id = a.id AND c.campaign_id = a.campaign_id
    WHERE a.campaign_id = ? AND a.controller = 'human' ORDER BY a.id`).all(
      handle.campaignId,
    ) as Array<{
      actorId: string;
      kind: string;
      controller: string;
      role: string;
      name: string;
      recordHash: string | null;
      recordJson: string | null;
    }>;
  if (
    rows.length !== 1 || rows[0]!.kind !== "person" || rows[0]!.role !== "player"
    || rows[0]!.recordHash === null || rows[0]!.recordJson === null
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_state_invalid",
      "Campaign Play action admission requires one canonical human player actor.",
    );
  }
  const row = rows[0]!;
  let stored: unknown;
  try {
    stored = JSON.parse(row.recordJson!) as unknown;
  } catch (cause) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_state_invalid",
      "Campaign Play action admission requires a valid human player CharacterRecord.",
      { cause },
    );
  }
  const record = playerCharacterRecordProjectionSchema.safeParse(stored);
  if (
    !record.success
    || record.data.identity.id !== row.actorId
    || record.data.identity.campaignId !== handle.campaignId
    || record.data.identity.displayName !== row.name
    || hashCampaignPlayProjection({
      domain: "campaign_play_character_profile",
      record: stored as CampaignPlayProjectionRecord,
    }) !== row.recordHash
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_state_invalid",
      "Campaign Play action admission requires a canonical human player CharacterRecord.",
      { cause: record.success ? undefined : record.error },
    );
  }
  const motivations = [...new Set([
    ...(record.data.identity.behavioralCore?.motives ?? []),
    ...record.data.motivations.shortTermGoals,
    ...record.data.motivations.longTermGoals,
    ...record.data.motivations.drives,
  ])];
  return {
    actorId: row.actorId,
    kind: row.kind,
    controller: row.controller,
    role: row.role,
    name: row.name,
    profileDigest: row.recordHash!,
    profile: campaignPlayPlayerProfileAuthoritySchema.parse({
      backgroundSummary: record.data.profile.backgroundSummary,
      personaSummary: record.data.profile.personaSummary,
      traits: record.data.capabilities.traits ?? [],
      skills: record.data.capabilities.skills,
      specialties: record.data.capabilities.specialties,
      motivations,
    }),
  };
}

function candidateBindings(
  handle: CampaignPlayDatabaseHandle,
  frame: CampaignPlayRulebookFrame,
): Map<string, CampaignPlayEntityRef> {
  const candidates = new Map<string, CampaignPlayEntityRef>();
  const add = (publicKind: string, reference: CampaignPlayEntityRef) => {
    const publicId = reference.kind === "world_event"
      ? null
      : deriveCampaignPlayPublicHandle(publicKind, handle.campaignId, reference.id);
    if (publicId !== null) candidates.set(publicId, reference);
  };
  if (frame.human) add("actor", { kind: "actor", id: frame.human.actorId });
  frame.acceptedWorld.actors.forEach((actor) => add("actor", { kind: "actor", id: actor.id }));
  frame.runtimeActors.forEach((actor) => add("actor", { kind: "actor", id: actor.id }));
  frame.acceptedWorld.locations.forEach((location) =>
    add("location", { kind: "location", id: location.id }));
  frame.acceptedWorld.routes.forEach((route) => add("route", { kind: "route", id: route.id }));
  frame.runtimeLocations.forEach((location) =>
    add("location", { kind: "location", id: location.id }));
  frame.runtimeRoutes.forEach((route) => add("route", { kind: "route", id: route.id }));
  frame.acceptedWorld.pressures.forEach((pressure) =>
    add("pressure", { kind: "pressure", id: pressure.id }));
  frame.possessions.forEach((possession) =>
    add("possession", { kind: "possession", id: possession.possessionId }));
  frame.obligations.forEach((obligation) =>
    add("obligation", { kind: "obligation", id: obligation.obligationId }));
  const observations = handle.sqlite.prepare(`SELECT event_id AS eventId,
      public_entry_json AS publicEntryJson FROM campaign_play_observations
    WHERE campaign_id = ? ORDER BY observation_id`).all(
      handle.campaignId,
    ) as ObservationBindingRow[];
  observations.forEach((observation) => {
    const publicEntry = campaignPlayJournalEntrySchema.parse(
      JSON.parse(observation.publicEntryJson) as unknown,
    );
    candidates.set(
      publicEntry.observationHandle,
      { kind: "world_event", id: observation.eventId },
    );
  });
  return candidates;
}

function buildPublicAuthority(input: {
  handle: CampaignPlayDatabaseHandle;
  packet: CampaignPlayNarratorPacket;
  moment: z.infer<typeof publicMomentSchema>;
  mechanicalFrame: CampaignPlayRulebookFrame;
  human: HumanRow;
  judgeInput: CampaignPlayAdmissionJudgeInput;
}): Pick<CampaignPlayPlayerActionAdmissionFrame,
  "player" | "visibleFacts" | "handleBindings" | "choiceBindings" | "authority"> {
  const { handle, packet, moment, mechanicalFrame, human, judgeInput } = input;
  const candidates = candidateBindings(handle, mechanicalFrame);
  const visibleFacts: CampaignPlayJudgeFrame["visibleFacts"] = [];
  const factByHandle = new Map<string, CampaignPlayJudgeFrame["visibleFacts"][number]>();
  const addFact = (fact: CampaignPlayJudgeFrame["visibleFacts"][number]) => {
    if (factByHandle.has(fact.handle)) return;
    const parsed = campaignPlayJudgeVisibleFactSchema.parse(fact);
    factByHandle.set(parsed.handle, parsed);
    visibleFacts.push(parsed);
  };
  const actorHandle = deriveCampaignPlayPublicHandle("actor", handle.campaignId, human.actorId);
  addFact({ handle: actorHandle, kind: "actor", summary: human.name });
  addFact({
    handle: packet.currentLocation.handle,
    kind: "location",
    summary: `${packet.currentLocation.name}: ${packet.currentLocation.description}`,
  });
  packet.visibleRoutes.forEach((route) => addFact({
    handle: route.destinationHandle,
    kind: "location",
    summary: route.destinationName,
  }));
  packet.visibleActors.forEach((actor) => addFact({
    handle: actor.handle,
    kind: "actor",
    summary: `${actor.name}: ${actor.descriptor}`,
  }));
  packet.visibleRoutes.forEach((route) => addFact({
    handle: route.handle,
    kind: "route",
    summary: `${route.destinationName}; ${route.state}; ${route.travelTimeLabel}`,
  }));
  packet.visiblePressures.forEach((pressure) => addFact({
    handle: pressure.handle,
    kind: "pressure",
    summary: `${pressure.label}: ${pressure.summary}`,
  }));
  packet.possessions.forEach((possession) => addFact({
    handle: possession.handle,
    kind: "possession",
    summary: `${possession.name}: ${possession.quantity}`,
  }));
  packet.obligations.forEach((obligation) => addFact({
    handle: obligation.handle,
    kind: "obligation",
    summary: obligation.direction === "payable"
      ? `You owe ${obligation.counterpartyName}: ${obligation.outstandingAmount} ${obligation.unitKey}`
      : `${obligation.counterpartyName} owes you: ${obligation.outstandingAmount} ${obligation.unitKey}`,
  }));
  const actions = [
    ...moment.suggestedActions,
    ...moment.utilityActions.filter((utility) =>
      !moment.suggestedActions.some((suggestion) =>
        suggestion.choiceHandle === utility.choiceHandle)),
  ];
  const choiceBindings = actions.map((suggestion) => {
    const available = packet.availableIntents.find((intent) =>
      intent.handle === suggestion.choiceHandle);
    if (!available) {
      throw new CampaignPlayTurnRuntimeError(
        "turn_public_context_invalid",
        "Campaign Play rendered suggestion lacks its exact public intent binding.",
      );
    }
    addFact({ handle: available.handle, kind: "choice", summary: suggestion.label });
    return choiceBindingSchema.parse({ ...available, label: suggestion.label });
  });
  const observations = [
    ...relevantPlayerHistory({ handle, mechanicalFrame, human, judgeInput }),
    ...packet.newObservations,
  ];
  const openingDecision = packet.turnKind === "opening"
    ? packet.openingContext?.decision ?? null
    : null;
  const decisionObservationBindings = new Map<string, CampaignPlayEntityRef>();
  observations.forEach((observation) => {
    const marker = observation.decision;
    if (marker === undefined) return;
    if (packet.turnKind === "opening" && (openingDecision === null || (
      marker.decisionKey !== openingDecision.decisionKey ||
      marker.actorName !== openingDecision.actorName ||
      marker.actorHandle !== openingDecision.actorHandle ||
      marker.kind !== openingDecision.kind ||
      marker.summary !== openingDecision.summary ||
      marker.acceptLabel !== openingDecision.acceptLabel ||
      marker.declineLabel !== openingDecision.declineLabel
    ))) {
      throw new CampaignPlayTurnRuntimeError(
        "turn_public_context_invalid",
        "Campaign Play opening decision observation does not match its exact decision authority.",
      );
    }
    const persistedDecision = mechanicalFrame.pendingDecisions?.find((candidate) =>
      candidate.decisionKey === marker.decisionKey);
    const persistedActor = [
      ...mechanicalFrame.runtimeActors,
      ...mechanicalFrame.acceptedWorld.actors,
    ].find((actor) => actor.id === persistedDecision?.actorId);
    const actorBinding = candidates.get(marker.actorHandle);
    if (
      !persistedDecision ||
      persistedDecision.actorHandle !== marker.actorHandle ||
      persistedDecision.kind !== marker.kind ||
      persistedDecision.summary !== marker.summary ||
      persistedDecision.acceptLabel !== marker.acceptLabel ||
      persistedDecision.declineLabel !== marker.declineLabel ||
      !persistedActor ||
      persistedActor.name !== marker.actorName ||
      actorBinding?.kind !== "actor" ||
      actorBinding.id !== persistedDecision.actorId
    ) {
      throw new CampaignPlayTurnRuntimeError(
        "turn_public_context_invalid",
        "Campaign Play decision observation does not match its exact persisted decision authority.",
      );
    }
    if (persistedDecision.status === "open") {
      decisionObservationBindings.set(observation.observationHandle, {
        kind: "decision",
        id: marker.decisionKey,
      });
    }
  });
  let admittedObservationCount = 0;
  for (const observation of observations) {
    if (
      visibleFacts.length >= 40
      || admittedObservationCount >= CAMPAIGN_PLAY_LIMITS.newObservations
        + CAMPAIGN_PLAY_LIMITS.continuityEntries
    ) break;
    if (factByHandle.has(observation.observationHandle)) continue;
    addFact({
      handle: observation.observationHandle,
      kind: "observation",
      summary: `${observation.title}: ${observation.text}`,
    });
    admittedObservationCount += 1;
  }
  const visibleHandles = new Set(visibleFacts.map((fact) => fact.handle));
  for (const choice of choiceBindings) {
    if (choice.targets.some((target) => !visibleHandles.has(target.handle))) {
      throw new CampaignPlayTurnRuntimeError(
        "turn_public_context_invalid",
        "Campaign Play rendered suggestion targets an omitted visible fact.",
      );
    }
  }
  const handleBindings = visibleFacts
    .filter((fact) => fact.kind !== "choice")
    .map((fact) => {
      const reference = decisionObservationBindings.get(fact.handle)
        ?? candidates.get(fact.handle);
      if (!reference) {
        throw new CampaignPlayTurnRuntimeError(
          "turn_public_context_invalid",
          "Campaign Play public fact has no exact protected entity binding.",
        );
      }
      return handleBindingSchema.parse({ handle: fact.handle, reference });
    });
  const authorizedRefs: CampaignPlayEntityRef[] = [];
  const seenRefs = new Set<string>();
  for (const binding of handleBindings) {
    const key = referenceKey(binding.reference);
    if (!seenRefs.has(key)) {
      seenRefs.add(key);
      authorizedRefs.push(binding.reference);
    }
  }
  if (judgeInput.decisionBinding !== undefined) {
    const decisionRef: CampaignPlayEntityRef = {
      kind: "decision",
      id: judgeInput.decisionBinding.decisionKey,
    };
    const key = referenceKey(decisionRef);
    if (!seenRefs.has(key)) {
      seenRefs.add(key);
      authorizedRefs.push(decisionRef);
    }
  }
  const witnessActorIds = handleBindings
    .filter((binding) => binding.reference.kind === "actor" && binding.reference.id !== human.actorId)
    .map((binding) => binding.reference.id);
  const knownWorldEventIds = authorizedRefs
    .filter((reference) => reference.kind === "world_event")
    .map((reference) => reference.id);
  return {
    player: {
      actorId: human.actorId,
      actorHandle,
      name: human.name,
      profileDigest: human.profileDigest,
      profile: human.profile,
    },
    visibleFacts,
    handleBindings,
    choiceBindings,
    authority: { authorizedRefs, witnessActorIds, knownWorldEventIds },
  };
}

function resolveJudgeInput(
  request: CampaignPlayTurnAdmissionRequest,
  packet: CampaignPlayNarratorPacket,
  moment: z.infer<typeof publicMomentSchema>,
): CampaignPlayAdmissionJudgeInput {
  if (request.source === "freeform") {
    return judgeInputSchema.parse({
      originalText: request.text,
      source: "freeform",
      choiceHandle: null,
    });
  }
  const suggestion = [
    ...moment.suggestedActions,
    ...moment.utilityActions,
  ].find((action) =>
    action.choiceHandle === request.choiceHandle);
  const available = packet.availableIntents.find((intent) =>
    intent.handle === request.choiceHandle);
  if (!suggestion || !available) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_request_invalid",
      "Campaign Play suggested action is stale or was not rendered.",
    );
  }
  const suggestionBinding = suggestion.decisionBinding;
  const availableBinding = available.decisionBinding;
  const requestedBinding = request.decisionBinding;
  const bindingsMatch = suggestionBinding !== undefined &&
    availableBinding !== undefined && requestedBinding !== undefined &&
    suggestionBinding.decisionKey === availableBinding.decisionKey &&
    suggestionBinding.actorHandle === availableBinding.actorHandle &&
    suggestionBinding.kind === availableBinding.kind &&
    suggestionBinding.disposition === availableBinding.disposition &&
    requestedBinding.decisionKey === suggestionBinding.decisionKey &&
    requestedBinding.actorHandle === suggestionBinding.actorHandle &&
    requestedBinding.kind === suggestionBinding.kind &&
    requestedBinding.disposition === suggestionBinding.disposition;
  if ((suggestionBinding === undefined || availableBinding === undefined)
    ? requestedBinding !== undefined || suggestionBinding !== availableBinding
    : !bindingsMatch) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_request_invalid",
      "Campaign Play decision binding is missing or does not match the rendered decision.",
    );
  }
  const suggestionCommitmentBinding = suggestion.commitmentBinding;
  const availableCommitmentBinding = available.commitmentBinding;
  const requestedCommitmentBinding = request.commitmentBinding;
  const commitmentBindingsMatch = suggestionCommitmentBinding !== undefined &&
    availableCommitmentBinding !== undefined && requestedCommitmentBinding !== undefined &&
    canonicalizeCampaignPlayProjection(suggestionCommitmentBinding) ===
      canonicalizeCampaignPlayProjection(availableCommitmentBinding) &&
    canonicalizeCampaignPlayProjection(requestedCommitmentBinding) ===
      canonicalizeCampaignPlayProjection(suggestionCommitmentBinding);
  if ((suggestionCommitmentBinding === undefined || availableCommitmentBinding === undefined)
    ? requestedCommitmentBinding !== undefined ||
      suggestionCommitmentBinding !== availableCommitmentBinding
    : !commitmentBindingsMatch) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_request_invalid",
      "Campaign Play commitment binding is missing or does not match the rendered intent.",
    );
  }
  const suggestionObligationBinding = suggestion.obligationBinding;
  const availableObligationBinding = available.obligationBinding;
  const requestedObligationBinding = request.obligationBinding;
  const obligationBindingsMatch = suggestionObligationBinding !== undefined &&
    availableObligationBinding !== undefined && requestedObligationBinding !== undefined &&
    canonicalizeCampaignPlayProjection(suggestionObligationBinding) ===
      canonicalizeCampaignPlayProjection(availableObligationBinding) &&
    canonicalizeCampaignPlayProjection(requestedObligationBinding) ===
      canonicalizeCampaignPlayProjection(suggestionObligationBinding);
  if ((suggestionObligationBinding === undefined || availableObligationBinding === undefined)
    ? requestedObligationBinding !== undefined ||
      suggestionObligationBinding !== availableObligationBinding
    : !obligationBindingsMatch) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_request_invalid",
      "Campaign Play receivable binding is missing or does not match the rendered obligation.",
    );
  }
  return judgeInputSchema.parse({
    originalText: suggestion.label,
    source: "suggested",
    choiceHandle: suggestion.choiceHandle,
    ...(suggestionBinding === undefined ? {} : { decisionBinding: suggestionBinding }),
    ...(suggestionCommitmentBinding === undefined
      ? {}
      : { commitmentBinding: suggestionCommitmentBinding }),
    ...(suggestionObligationBinding === undefined
      ? {}
      : { obligationBinding: suggestionObligationBinding }),
  });
}

function certifiedMoveHash(certificate: CampaignPlayCertifiedMove): string {
  return hashCampaignPlayProjection({
    domain: "campaign_play_certified_move",
    certificate,
  });
}

function certifiedWaitHash(certificate: CampaignPlayCertifiedWait): string {
  return hashCampaignPlayProjection({
    domain: "campaign_play_certified_wait",
    certificate,
  });
}

function certifiedContactHash(certificate: CampaignPlayCertifiedContact): string {
  return hashCampaignPlayProjection({
    domain: "campaign_play_certified_contact",
    certificate,
  });
}

function certifiedDecisionHash(certificate: CampaignPlayCertifiedDecision): string {
  return hashCampaignPlayProjection({
    domain: "campaign_play_certified_decision",
    certificate,
  });
}

function certifiedObserveHash(certificate: CampaignPlayCertifiedObserve): string {
  return hashCampaignPlayProjection({
    domain: "campaign_play_certified_observe",
    certificate,
  });
}

function certifiedCommitmentHash(certificate: CampaignPlayCertifiedCommitment): string {
  return hashCampaignPlayProjection({
    domain: "campaign_play_certified_commitment",
    certificate,
  });
}

function certifiedObligationHash(certificate: CampaignPlayCertifiedObligation): string {
  return hashCampaignPlayProjection({
    domain: "campaign_play_certified_obligation",
    certificate,
  });
}

function isCertifiedRoute(
  route: CampaignPlayPlayerActionAdmissionFrame["executionRoute"],
): route is Exclude<CampaignPlayPlayerActionAdmissionFrame["executionRoute"], { kind: "full_authority" }> {
  return route.kind === "certified_move" ||
    route.kind === "certified_wait" ||
    route.kind === "certified_contact" ||
    route.kind === "certified_decision" ||
    route.kind === "certified_observe" ||
    route.kind === "certified_commitment" ||
    route.kind === "certified_obligation";
}

function usesCodeOwnedCertifiedPlan(
  route: CampaignPlayPlayerActionAdmissionFrame["executionRoute"],
): route is Extract<
  CampaignPlayPlayerActionAdmissionFrame["executionRoute"],
  { kind: "certified_move" | "certified_wait" | "certified_decision" |
    "certified_commitment" | "certified_obligation" }
> {
  return isCertifiedRoute(route) &&
    route.kind !== "certified_contact" &&
    route.kind !== "certified_observe";
}

function certifyPureRenderedMove(input: {
  campaignId: string;
  turnId: string;
  acceptedWorldVersion: number;
  baseWorldVersion: number;
  baseRuntimeRevision: number;
  sourceTurnId: string;
  sourceMomentId: string;
  sourceMomentHash: string;
  sourcePacketHash: string;
  packet: CampaignPlayNarratorPacket;
  moment: z.infer<typeof publicMomentSchema>;
  mechanicalFrame: CampaignPlayRulebookFrame;
  publicAuthority: Pick<CampaignPlayPlayerActionAdmissionFrame,
    "player" | "visibleFacts" | "handleBindings" | "choiceBindings" | "authority">;
  judgeInput: CampaignPlayJudgeInput;
}): CampaignPlayCertifiedMove | null {
  const { judgeInput, packet, moment, mechanicalFrame, publicAuthority } = input;
  if (judgeInput.source !== "suggested" || judgeInput.choiceHandle === null) return null;
  const suggestion = moment.suggestedActions.find((candidate) =>
    candidate.choiceHandle === judgeInput.choiceHandle);
  const intent = packet.availableIntents.find((candidate) =>
    candidate.handle === judgeInput.choiceHandle);
  const choice = publicAuthority.choiceBindings.find((candidate) =>
    candidate.handle === judgeInput.choiceHandle);
  const moveLabelPrefix = intent?.kind === "move"
    ? campaignPlaySuggestedActionLabelPrefix(packet, intent)
    : null;
  const moveDetail = moveLabelPrefix !== null && suggestion?.label.startsWith(`${moveLabelPrefix}: `)
    ? suggestion.label.slice(moveLabelPrefix.length + 2)
    : null;
  if (
    !suggestion || !intent || !choice || intent.kind !== "move" ||
    suggestion.label !== judgeInput.originalText ||
    (suggestion.label !== moveLabelPrefix && (
      moveDetail === null || moveDetail.length === 0 || moveDetail !== moveDetail.trim() ||
      moveDetail.includes("\n") || moveDetail.includes("\r")
    )) ||
    canonicalizeCampaignPlayProjection(choice) !== canonicalizeCampaignPlayProjection({
      ...intent,
      label: suggestion.label,
    })
  ) return null;
  const routeTargets = intent.targets.filter((target) => target.kind === "route");
  if (intent.targets.length !== 1 || routeTargets.length !== 1) return null;
  const routeHandle = routeTargets[0]!.handle;
  const visibleRoute = packet.visibleRoutes.find((candidate) =>
    candidate.handle === routeHandle);
  if (!visibleRoute || visibleRoute.state !== "open") return null;
  const destinationHandle = visibleRoute.destinationHandle;
  const routeBinding = publicAuthority.handleBindings.find((binding) =>
    binding.handle === routeHandle && binding.reference.kind === "route");
  const destinationBinding = publicAuthority.handleBindings.find((binding) =>
    binding.handle === destinationHandle && binding.reference.kind === "location");
  const currentLocationBinding = publicAuthority.handleBindings.find((binding) =>
    binding.handle === packet.currentLocation.handle && binding.reference.kind === "location");
  if (!routeBinding || !destinationBinding || !currentLocationBinding) return null;
  const canonicalRoute = mechanicalFrame.runtimeRoutes.find((candidate) =>
    candidate.id === routeBinding.reference.id)
    ?? mechanicalFrame.acceptedWorld.routes.find((candidate) =>
      candidate.id === routeBinding.reference.id);
  const liveRouteState = mechanicalFrame.routeStates.find((candidate) =>
    candidate.routeId === routeBinding.reference.id)?.state ?? "open";
  const playerPlacement = mechanicalFrame.placements.find((placement) =>
    placement.actorId === publicAuthority.player.actorId &&
    placement.placementKind === "present");
  const playerHasActiveCondition = mechanicalFrame.actorConditions.some((condition) =>
    condition.actorId === publicAuthority.player.actorId && condition.present);
  const authorized = (kind: CampaignPlayEntityRef["kind"], id: string) =>
    publicAuthority.authority.authorizedRefs.some((reference) =>
      reference.kind === kind && reference.id === id);
  if (
    !canonicalRoute || liveRouteState !== "open" ||
    canonicalRoute.fromLocationId !== currentLocationBinding.reference.id ||
    canonicalRoute.toLocationId !== destinationBinding.reference.id ||
    playerPlacement?.locationId !== canonicalRoute.fromLocationId ||
    playerHasActiveCondition ||
    !authorized("actor", publicAuthority.player.actorId) ||
    !authorized("route", canonicalRoute.id) ||
    !authorized("location", canonicalRoute.fromLocationId) ||
    !authorized("location", canonicalRoute.toLocationId)
  ) return null;
  return campaignPlayCertifiedMoveSchema.parse({
    actionSchemaVersion: 1,
    resolver: "game_master",
    campaignId: input.campaignId,
    turnId: input.turnId,
    sourceTurnId: input.sourceTurnId,
    sourceMomentId: input.sourceMomentId,
    sourceMomentHash: input.sourceMomentHash,
    sourcePacketHash: input.sourcePacketHash,
    acceptedWorldVersion: input.acceptedWorldVersion,
    baseWorldVersion: input.baseWorldVersion,
    baseRuntimeRevision: input.baseRuntimeRevision,
    actorId: publicAuthority.player.actorId,
    actorHandle: publicAuthority.player.actorHandle,
    choiceHandle: intent.handle,
    label: suggestion.label,
    routeHandle,
    routeId: canonicalRoute.id,
    fromLocationId: canonicalRoute.fromLocationId,
    destinationHandle,
    destinationLocationId: canonicalRoute.toLocationId,
    travelCost: canonicalRoute.travelCost,
    ruling: {
      disposition: "deterministic",
      normalizedIntent: {
        originalText: suggestion.label,
        source: "suggested",
        choiceHandle: intent.handle,
        kind: "move",
        targets: intent.targets,
        method: moveDetail,
        stakes: null,
      },
      movementRouteHandle: routeHandle,
      possessionEffectAuthority: { kind: "none" },
      requiredObligationEffect: { kind: "none" },
      citedVisibleFactHandles: [routeHandle, destinationHandle],
      resultBounds: { minimum: "success", maximum: "success" },
      elapsedBounds: {
        minimumMinutes: canonicalRoute.travelCost,
        maximumMinutes: canonicalRoute.travelCost,
      },
      uncertainty: { kind: "none" },
      reason: moveDetail === null
        ? "Current rendered move is fully determined by the open canonical route."
        : "Current rendered move keeps a player-visible purpose while the open canonical route determines travel.",
      clarificationQuestion: null,
    },
    resolution: { kind: "deterministic", result: "success" },
    publicResult: {
      intentKind: "move",
      disposition: "deterministic",
      result: "success",
      clarificationQuestion: null,
    },
  });
}

function certifyPureRenderedWait(input: {
  campaignId: string;
  turnId: string;
  acceptedWorldVersion: number;
  baseWorldVersion: number;
  baseRuntimeRevision: number;
  sourceTurnId: string;
  sourceMomentId: string;
  sourceMomentHash: string;
  sourcePacketHash: string;
  packet: CampaignPlayNarratorPacket;
  moment: z.infer<typeof publicMomentSchema>;
  publicAuthority: Pick<CampaignPlayPlayerActionAdmissionFrame,
    "player" | "visibleFacts" | "handleBindings" | "choiceBindings" | "authority">;
  judgeInput: CampaignPlayJudgeInput;
}): CampaignPlayCertifiedWait | null {
  const { judgeInput, packet, moment, publicAuthority } = input;
  if (judgeInput.source !== "suggested" || judgeInput.choiceHandle === null) return null;
  const suggestion = moment.utilityActions.find((candidate) =>
    candidate.choiceHandle === judgeInput.choiceHandle);
  const intent = packet.availableIntents.find((candidate) =>
    candidate.handle === judgeInput.choiceHandle);
  const choice = publicAuthority.choiceBindings.find((candidate) =>
    candidate.handle === judgeInput.choiceHandle);
  const match = suggestion?.label.match(/^Wait ([1-9][0-9]*) minutes?$/);
  if (!match) return null;
  const waitMinutes = Number(match[1]);
  if (
    !suggestion || !intent || !choice || intent.kind !== "wait" ||
    intent.targets.length !== 0 || suggestion.label !== judgeInput.originalText ||
    suggestion.label !== `Wait ${CAMPAIGN_PLAY_DEFAULT_WAIT_MINUTES} minutes` ||
    waitMinutes !== CAMPAIGN_PLAY_DEFAULT_WAIT_MINUTES ||
    !Number.isSafeInteger(waitMinutes) || waitMinutes > CAMPAIGN_PLAY_LIMITS.elapsedMinutes ||
    canonicalizeCampaignPlayProjection(choice) !== canonicalizeCampaignPlayProjection({
      ...intent,
      label: suggestion.label,
    })
  ) return null;
  const authorized = (kind: CampaignPlayEntityRef["kind"], id: string) =>
    publicAuthority.authority.authorizedRefs.some((reference) =>
      reference.kind === kind && reference.id === id);
  if (!authorized("actor", publicAuthority.player.actorId)) return null;
  return campaignPlayCertifiedWaitSchema.parse({
    actionSchemaVersion: 1,
    resolver: "game_master",
    campaignId: input.campaignId,
    turnId: input.turnId,
    sourceTurnId: input.sourceTurnId,
    sourceMomentId: input.sourceMomentId,
    sourceMomentHash: input.sourceMomentHash,
    sourcePacketHash: input.sourcePacketHash,
    acceptedWorldVersion: input.acceptedWorldVersion,
    baseWorldVersion: input.baseWorldVersion,
    baseRuntimeRevision: input.baseRuntimeRevision,
    actorId: publicAuthority.player.actorId,
    actorHandle: publicAuthority.player.actorHandle,
    choiceHandle: intent.handle,
    label: suggestion.label,
    waitMinutes,
    ruling: {
      disposition: "deterministic",
      normalizedIntent: {
        originalText: suggestion.label,
        source: "suggested",
        choiceHandle: intent.handle,
        kind: "wait",
        targets: [],
        method: null,
        stakes: null,
      },
      movementRouteHandle: null,
      possessionEffectAuthority: { kind: "none" },
      requiredObligationEffect: { kind: "none" },
      citedVisibleFactHandles: [],
      resultBounds: { minimum: "success", maximum: "success" },
      elapsedBounds: { minimumMinutes: waitMinutes, maximumMinutes: waitMinutes },
      uncertainty: { kind: "none" },
      reason: "Current rendered wait has one exact public duration and no targets.",
      clarificationQuestion: null,
    },
    resolution: { kind: "deterministic", result: "success" },
    publicResult: {
      intentKind: "wait",
      disposition: "deterministic",
      result: "success",
      clarificationQuestion: null,
    },
  });
}

function certifyPureRenderedDecision(input: {
  campaignId: string;
  turnId: string;
  acceptedWorldVersion: number;
  baseWorldVersion: number;
  baseRuntimeRevision: number;
  sourceTurnId: string;
  sourceMomentId: string;
  sourceMomentHash: string;
  sourcePacketHash: string;
  packet: CampaignPlayNarratorPacket;
  moment: z.infer<typeof publicMomentSchema>;
  mechanicalFrame: CampaignPlayRulebookFrame;
  publicAuthority: Pick<CampaignPlayPlayerActionAdmissionFrame,
    "player" | "visibleFacts" | "handleBindings" | "choiceBindings" | "authority">;
  judgeInput: CampaignPlayAdmissionJudgeInput;
}): CampaignPlayCertifiedDecision | null {
  const { judgeInput, packet, moment, mechanicalFrame, publicAuthority } = input;
  if (
    judgeInput.source !== "suggested" || judgeInput.choiceHandle === null ||
    judgeInput.decisionBinding === undefined
  ) return null;
  const suggestion = moment.suggestedActions.find((candidate) =>
    candidate.choiceHandle === judgeInput.choiceHandle);
  const intent = packet.availableIntents.find((candidate) =>
    candidate.handle === judgeInput.choiceHandle);
  const choice = publicAuthority.choiceBindings.find((candidate) =>
    candidate.handle === judgeInput.choiceHandle);
  const binding = judgeInput.decisionBinding;
  const sameBinding = (candidate: CampaignPlayDecisionBinding | undefined) =>
    candidate !== undefined &&
    candidate.decisionKey === binding.decisionKey &&
    candidate.actorHandle === binding.actorHandle &&
    candidate.kind === binding.kind &&
    candidate.disposition === binding.disposition;
  if (
    !suggestion || !intent || !choice || intent.kind !== "contact" ||
    intent.targets.length !== 1 || intent.targets[0]?.kind !== "actor" ||
    intent.targets[0]?.handle !== binding.actorHandle ||
    !sameBinding(suggestion.decisionBinding) ||
    !sameBinding(intent.decisionBinding) ||
    !sameBinding(choice.decisionBinding) ||
    suggestion.label !== judgeInput.originalText ||
    canonicalizeCampaignPlayProjection(choice) !== canonicalizeCampaignPlayProjection({
      ...intent,
      label: suggestion.label,
    })
  ) return null;
  const decision = mechanicalFrame.pendingDecisions?.find((candidate) =>
    candidate.decisionKey === binding.decisionKey);
  if (
    !decision || decision.status !== "open" ||
    decision.actorHandle !== binding.actorHandle || decision.kind !== binding.kind ||
    decision.sourceTurnId.length === 0 ||
    !publicAuthority.visibleFacts.some((fact) =>
      fact.handle === binding.actorHandle && fact.kind === "actor")
  ) return null;
  const actorBinding = publicAuthority.handleBindings.find((candidate) =>
    candidate.handle === binding.actorHandle && candidate.reference.kind === "actor");
  const currentLocationBinding = publicAuthority.handleBindings.find((candidate) =>
    candidate.handle === packet.currentLocation.handle && candidate.reference.kind === "location");
  if (!actorBinding || !currentLocationBinding || actorBinding.reference.id !== decision.actorId) return null;
  const playerPlacement = mechanicalFrame.placements.find((placement) =>
    placement.actorId === publicAuthority.player.actorId &&
    placement.placementKind === "present" &&
    placement.locationId === currentLocationBinding.reference.id);
  const decisionActorPlacement = mechanicalFrame.placements.find((placement) =>
    placement.actorId === decision.actorId &&
    placement.placementKind === "present" &&
    placement.locationId === currentLocationBinding.reference.id);
  const authorized = (kind: CampaignPlayEntityRef["kind"], id: string) =>
    publicAuthority.authority.authorizedRefs.some((reference) =>
      reference.kind === kind && reference.id === id);
  if (
    !playerPlacement || !decisionActorPlacement ||
    !authorized("actor", publicAuthority.player.actorId) ||
    !authorized("actor", decision.actorId) ||
    !authorized("location", currentLocationBinding.reference.id) ||
    !authorized("decision", decision.decisionKey)
  ) return null;
  return campaignPlayCertifiedDecisionSchema.parse({
    actionSchemaVersion: 1,
    resolver: "code_owned",
    campaignId: input.campaignId,
    turnId: input.turnId,
    sourceTurnId: input.sourceTurnId,
    sourceMomentId: input.sourceMomentId,
    sourceMomentHash: input.sourceMomentHash,
    sourcePacketHash: input.sourcePacketHash,
    acceptedWorldVersion: input.acceptedWorldVersion,
    baseWorldVersion: input.baseWorldVersion,
    baseRuntimeRevision: input.baseRuntimeRevision,
    actorId: publicAuthority.player.actorId,
    actorHandle: publicAuthority.player.actorHandle,
    choiceHandle: intent.handle,
    label: suggestion.label,
    decisionBinding: binding,
    decisionActorId: decision.actorId,
    decisionSourceTurnId: decision.sourceTurnId,
    decisionStatus: "open",
    decisionSummary: decision.summary,
    acceptLabel: decision.acceptLabel,
    declineLabel: decision.declineLabel,
    acceptEffect: decision.acceptEffect ?? null,
    ruling: {
      disposition: "deterministic",
      normalizedIntent: {
        originalText: suggestion.label,
        source: "suggested",
        choiceHandle: intent.handle,
        kind: "contact",
        targets: intent.targets,
        method: null,
        stakes: null,
      },
      movementRouteHandle: null,
      possessionEffectAuthority: { kind: "none" },
      requiredObligationEffect: { kind: "none" },
      citedVisibleFactHandles: [binding.actorHandle],
      resultBounds: { minimum: "success", maximum: "success" },
      elapsedBounds: { minimumMinutes: 1, maximumMinutes: 1 },
      uncertainty: { kind: "none" },
      reason: "Current rendered decision binding selects one open code-owned decision disposition.",
      clarificationQuestion: null,
    },
    resolution: { kind: "deterministic", result: "success" },
    publicResult: {
      intentKind: "contact",
      disposition: "deterministic",
      result: "success",
      clarificationQuestion: null,
    },
  });
}

function certifyPureRenderedContact(input: {
  campaignId: string;
  turnId: string;
  acceptedWorldVersion: number;
  baseWorldVersion: number;
  baseRuntimeRevision: number;
  sourceTurnId: string;
  sourceMomentId: string;
  sourceMomentHash: string;
  sourcePacketHash: string;
  packet: CampaignPlayNarratorPacket;
  moment: z.infer<typeof publicMomentSchema>;
  mechanicalFrame: CampaignPlayRulebookFrame;
  publicAuthority: Pick<CampaignPlayPlayerActionAdmissionFrame,
    "player" | "visibleFacts" | "handleBindings" | "choiceBindings" | "authority">;
  judgeInput: CampaignPlayJudgeInput;
}): CampaignPlayCertifiedContact | null {
  const { judgeInput, packet, moment, mechanicalFrame, publicAuthority } = input;
  if (judgeInput.source !== "suggested" || judgeInput.choiceHandle === null) return null;
  const suggestion = moment.suggestedActions.find((candidate) =>
    candidate.choiceHandle === judgeInput.choiceHandle);
  const intent = packet.availableIntents.find((candidate) =>
    candidate.handle === judgeInput.choiceHandle);
  const choice = publicAuthority.choiceBindings.find((candidate) =>
    candidate.handle === judgeInput.choiceHandle);
  if (
    !suggestion || !intent || !choice || intent.kind !== "contact" ||
    intent.targets.length !== 1 || intent.targets[0]?.kind !== "actor" ||
    suggestion.label !== judgeInput.originalText
  ) return null;
  const targetActorHandle = intent.targets[0]!.handle;
  const visibleActor = packet.visibleActors.find((candidate) =>
    candidate.handle === targetActorHandle);
  if (!visibleActor) return null;
  const renderedSpeechPrefixes = [
    campaignPlaySuggestedActionLabelPrefix(packet, intent),
    `Ask ${visibleActor.name}: `,
    `Tell ${visibleActor.name}: `,
  ];
  const renderedSpeechPrefix = renderedSpeechPrefixes.find((candidate) =>
    suggestion.label.startsWith(`${candidate}“`) && suggestion.label.endsWith("”")
  );
  const renderedDetail = renderedSpeechPrefix === undefined
    ? null
    : suggestion.label.slice(renderedSpeechPrefix.length + 1, -1);
  const terminalPunctuation = renderedDetail?.at(-1);
  if (
    renderedDetail === null ||
    renderedDetail.length === 0 ||
    renderedDetail !== renderedDetail.trim() ||
    renderedDetail.includes("\n") || renderedDetail.includes("\r") ||
    ![".", "?", "!"].includes(terminalPunctuation ?? "") ||
    canonicalizeCampaignPlayProjection(choice) !== canonicalizeCampaignPlayProjection({
      ...intent,
      label: suggestion.label,
    })
  ) return null;
  const targetActorBinding = publicAuthority.handleBindings.find((binding) =>
    binding.handle === targetActorHandle && binding.reference.kind === "actor");
  const currentLocationBinding = publicAuthority.handleBindings.find((binding) =>
    binding.handle === packet.currentLocation.handle && binding.reference.kind === "location");
  if (!targetActorBinding || !currentLocationBinding) return null;
  const targetActorId = targetActorBinding.reference.id;
  const currentLocationId = currentLocationBinding.reference.id;
  const playerPlacement = mechanicalFrame.placements.find((placement) =>
    placement.actorId === publicAuthority.player.actorId &&
    placement.placementKind === "present" &&
    placement.locationId === currentLocationId);
  const targetPlacement = mechanicalFrame.placements.find((placement) =>
    placement.actorId === targetActorId &&
    placement.placementKind === "present" &&
    placement.locationId === currentLocationId);
  const hasActiveCondition = (actorId: string) => mechanicalFrame.actorConditions.some((condition) =>
    condition.actorId === actorId && condition.present);
  const authorized = (kind: CampaignPlayEntityRef["kind"], id: string) =>
    publicAuthority.authority.authorizedRefs.some((reference) =>
      reference.kind === kind && reference.id === id);
  if (
    !playerPlacement || !targetPlacement ||
    hasActiveCondition(publicAuthority.player.actorId) || hasActiveCondition(targetActorId) ||
    !authorized("actor", publicAuthority.player.actorId) ||
    !authorized("actor", targetActorId) ||
    !authorized("location", currentLocationId)
  ) return null;
  return campaignPlayCertifiedContactSchema.parse({
    actionSchemaVersion: 1,
    resolver: "game_master",
    campaignId: input.campaignId,
    turnId: input.turnId,
    sourceTurnId: input.sourceTurnId,
    sourceMomentId: input.sourceMomentId,
    sourceMomentHash: input.sourceMomentHash,
    sourcePacketHash: input.sourcePacketHash,
    acceptedWorldVersion: input.acceptedWorldVersion,
    baseWorldVersion: input.baseWorldVersion,
    baseRuntimeRevision: input.baseRuntimeRevision,
    actorId: publicAuthority.player.actorId,
    actorHandle: publicAuthority.player.actorHandle,
    choiceHandle: intent.handle,
    label: suggestion.label,
    targetActorId,
    targetActorHandle,
    detail: renderedDetail,
    ruling: {
      disposition: "deterministic",
      normalizedIntent: {
        originalText: suggestion.label,
        source: "suggested",
        choiceHandle: intent.handle,
        kind: "contact",
        targets: intent.targets,
        method: renderedDetail,
        stakes: null,
      },
      movementRouteHandle: null,
      possessionEffectAuthority: { kind: "none" },
      requiredObligationEffect: { kind: "none" },
      citedVisibleFactHandles: [],
      resultBounds: { minimum: "success", maximum: "success" },
      elapsedBounds: { minimumMinutes: 1, maximumMinutes: 1 },
      uncertainty: { kind: "none" },
      reason: "Current rendered contact action carries one exact player-facing utterance to one visible actor.",
      clarificationQuestion: null,
    },
    resolution: { kind: "deterministic", result: "success" },
    publicResult: {
      intentKind: "contact",
      disposition: "deterministic",
      result: "success",
      clarificationQuestion: null,
    },
  });
}

function certifyPureRenderedObserve(input: {
  campaignId: string;
  turnId: string;
  acceptedWorldVersion: number;
  baseWorldVersion: number;
  baseRuntimeRevision: number;
  sourceTurnId: string;
  sourceMomentId: string;
  sourceMomentHash: string;
  sourcePacketHash: string;
  packet: CampaignPlayNarratorPacket;
  moment: z.infer<typeof publicMomentSchema>;
  mechanicalFrame: CampaignPlayRulebookFrame;
  publicAuthority: Pick<CampaignPlayPlayerActionAdmissionFrame,
    "player" | "visibleFacts" | "handleBindings" | "choiceBindings" | "authority">;
  judgeInput: CampaignPlayJudgeInput;
}): CampaignPlayCertifiedObserve | null {
  const { judgeInput, packet, moment, mechanicalFrame, publicAuthority } = input;
  if (judgeInput.source !== "suggested" || judgeInput.choiceHandle === null) return null;
  const suggestion = moment.suggestedActions.find((candidate) =>
    candidate.choiceHandle === judgeInput.choiceHandle);
  const intent = packet.availableIntents.find((candidate) =>
    candidate.handle === judgeInput.choiceHandle);
  const choice = publicAuthority.choiceBindings.find((candidate) =>
    candidate.handle === judgeInput.choiceHandle);
  if (
    !suggestion || !intent || !choice || intent.kind !== "observe" ||
    intent.targets.length !== 1 || intent.targets[0]?.kind !== "location" ||
    suggestion.label !== judgeInput.originalText
  ) return null;
  const locationHandle = intent.targets[0]!.handle;
  if (locationHandle !== packet.currentLocation.handle) return null;
  const prefix = campaignPlaySuggestedActionLabelPrefix(packet, intent);
  const detail = suggestion.label.startsWith(prefix)
    ? suggestion.label.slice(prefix.length)
    : suggestion.label;
  const detailWords = detail.split(/\s+/u);
  if (
    detail.length === 0 || detail !== detail.trim() || detail.includes("\n") || detail.includes("\r") ||
    detailWords.length < 3 || detailWords.length > 8 ||
    canonicalizeCampaignPlayProjection(choice) !== canonicalizeCampaignPlayProjection({
      ...intent,
      label: suggestion.label,
    })
  ) return null;
  const locationBinding = publicAuthority.handleBindings.find((binding) =>
    binding.handle === locationHandle && binding.reference.kind === "location");
  if (!locationBinding) return null;
  const playerPlacement = mechanicalFrame.placements.find((placement) =>
    placement.actorId === publicAuthority.player.actorId &&
    placement.placementKind === "present" &&
    placement.locationId === locationBinding.reference.id);
  const playerHasActiveCondition = mechanicalFrame.actorConditions.some((condition) =>
    condition.actorId === publicAuthority.player.actorId && condition.present);
  const authorized = (kind: CampaignPlayEntityRef["kind"], id: string) =>
    publicAuthority.authority.authorizedRefs.some((reference) =>
      reference.kind === kind && reference.id === id);
  if (
    !playerPlacement || playerHasActiveCondition ||
    !authorized("actor", publicAuthority.player.actorId) ||
    !authorized("location", locationBinding.reference.id) ||
    !publicAuthority.visibleFacts.some((fact) => fact.handle === locationHandle)
  ) return null;
  return campaignPlayCertifiedObserveSchema.parse({
    actionSchemaVersion: 1,
    resolver: "game_master",
    campaignId: input.campaignId,
    turnId: input.turnId,
    sourceTurnId: input.sourceTurnId,
    sourceMomentId: input.sourceMomentId,
    sourceMomentHash: input.sourceMomentHash,
    sourcePacketHash: input.sourcePacketHash,
    acceptedWorldVersion: input.acceptedWorldVersion,
    baseWorldVersion: input.baseWorldVersion,
    baseRuntimeRevision: input.baseRuntimeRevision,
    actorId: publicAuthority.player.actorId,
    actorHandle: publicAuthority.player.actorHandle,
    choiceHandle: intent.handle,
    label: suggestion.label,
    locationId: locationBinding.reference.id,
    locationHandle,
    detail,
    ruling: {
      disposition: "deterministic",
      normalizedIntent: {
        originalText: suggestion.label,
        source: "suggested",
        choiceHandle: intent.handle,
        kind: "observe",
        targets: intent.targets,
        method: detail,
        stakes: null,
      },
      movementRouteHandle: null,
      possessionEffectAuthority: { kind: "none" },
      requiredObligationEffect: { kind: "none" },
      citedVisibleFactHandles: [locationHandle],
      resultBounds: { minimum: "success", maximum: "success" },
      elapsedBounds: { minimumMinutes: 1, maximumMinutes: 1 },
      uncertainty: { kind: "none" },
      reason: "Current rendered inspection is bound to the player's visible current location.",
      clarificationQuestion: null,
    },
    resolution: { kind: "deterministic", result: "success" },
    publicResult: {
      intentKind: "observe",
      disposition: "deterministic",
      result: "success",
      clarificationQuestion: null,
    },
  });
}

function certifyPureRenderedCommitment(input: {
  campaignId: string;
  turnId: string;
  acceptedWorldVersion: number;
  baseWorldVersion: number;
  baseRuntimeRevision: number;
  sourceTurnId: string;
  sourceMomentId: string;
  sourceMomentHash: string;
  sourcePacketHash: string;
  packet: CampaignPlayNarratorPacket;
  moment: z.infer<typeof publicMomentSchema>;
  mechanicalFrame: CampaignPlayRulebookFrame;
  publicAuthority: Pick<CampaignPlayPlayerActionAdmissionFrame,
    "player" | "visibleFacts" | "handleBindings" | "choiceBindings" | "authority">;
  judgeInput: CampaignPlayJudgeInput;
}): CampaignPlayCertifiedCommitment | null {
  const { judgeInput, packet, moment, mechanicalFrame, publicAuthority } = input;
  const binding = judgeInput.commitmentBinding;
  if (judgeInput.source !== "suggested" || judgeInput.choiceHandle === null || binding === undefined) {
    return null;
  }
  const suggestion = moment.suggestedActions.find((candidate) =>
    candidate.choiceHandle === judgeInput.choiceHandle);
  const intent = packet.availableIntents.find((candidate) =>
    candidate.handle === judgeInput.choiceHandle);
  const choice = publicAuthority.choiceBindings.find((candidate) =>
    candidate.handle === judgeInput.choiceHandle);
  if (!suggestion || !intent || !choice || suggestion.label !== judgeInput.originalText) return null;
  const suggestionBinding = suggestion.commitmentBinding;
  const intentBinding = intent.commitmentBinding;
  if (
    suggestionBinding === undefined || intentBinding === undefined ||
    canonicalizeCampaignPlayProjection(suggestionBinding) !==
      canonicalizeCampaignPlayProjection(binding) ||
    canonicalizeCampaignPlayProjection(intentBinding) !==
      canonicalizeCampaignPlayProjection(binding) ||
    choice.commitmentBinding === undefined ||
    canonicalizeCampaignPlayProjection(choice.commitmentBinding) !==
      canonicalizeCampaignPlayProjection(binding)
  ) return null;
  const commitment = mechanicalFrame.commitments.find((candidate) =>
    deriveCampaignPlayPublicHandle("commitment", input.campaignId, candidate.commitmentId) ===
      binding.commitmentHandle);
  if (
    !commitment || commitment.status !== "active" ||
    (commitment.kind !== "paid_delivery" && commitment.kind !== "unpaid_delivery") ||
    commitment.performerActorId !== publicAuthority.player.actorId ||
    commitment.subjectName !== binding.subjectName ||
    commitment.destinationHandle !== binding.destinationHandle
  ) return null;
  const counterparty = [...mechanicalFrame.acceptedWorld.actors, ...mechanicalFrame.runtimeActors]
    .find((candidate) => candidate.id === commitment.counterpartyActorId);
  const destination = [...mechanicalFrame.acceptedWorld.locations, ...mechanicalFrame.runtimeLocations]
    .find((candidate) =>
      deriveCampaignPlayPublicHandle("location", input.campaignId, candidate.id) ===
        binding.destinationHandle);
  if (
    !counterparty || counterparty.kind !== "person" || counterparty.controller !== "agent" ||
    !destination ||
    deriveCampaignPlayPublicHandle("actor", input.campaignId, counterparty.id) !==
      binding.counterpartyHandle ||
    deriveCampaignPlayPublicHandle("location", input.campaignId, destination.id) !==
      binding.destinationHandle
  ) return null;
  const counterpartyBinding = publicAuthority.handleBindings.find((candidate) =>
    candidate.handle === binding.counterpartyHandle && candidate.reference.kind === "actor");
  const destinationBinding = publicAuthority.handleBindings.find((candidate) =>
    candidate.handle === binding.destinationHandle && candidate.reference.kind === "location");
  const currentLocationBinding = publicAuthority.handleBindings.find((candidate) =>
    candidate.handle === packet.currentLocation.handle && candidate.reference.kind === "location");
  if (
    !currentLocationBinding || currentLocationBinding.reference.id !==
      (mechanicalFrame.placements.find((placement) =>
        placement.actorId === publicAuthority.player.actorId && placement.placementKind === "present")
        ?.locationId ?? "")
  ) return null;
  const playerPlacement = mechanicalFrame.placements.find((placement) =>
    placement.actorId === publicAuthority.player.actorId && placement.placementKind === "present");
  const counterpartyPlacement = mechanicalFrame.placements.find((placement) =>
    placement.actorId === commitment.counterpartyActorId && placement.placementKind === "present");
  const expectedPossessionKey = deriveCampaignPlayPossessionKey(commitment.subjectName);
  const expectedPossessionId = deriveCampaignPlayPossessionId(
    input.campaignId,
    publicAuthority.player.actorId,
    expectedPossessionKey,
  );
  const possession = mechanicalFrame.possessions.find((candidate) =>
    candidate.actorId === publicAuthority.player.actorId &&
    candidate.possessionId === expectedPossessionId &&
    candidate.possessionKey === expectedPossessionKey &&
    candidate.name === commitment.subjectName);
  const action = binding.action;
  const expectedLabel = action === "collect"
    ? `Ask ${counterparty.name} for ${commitment.subjectName}`
    : `Deliver ${commitment.subjectName} at ${destination.name}`;
  const authorized = (kind: CampaignPlayEntityRef["kind"], id: string) =>
    publicAuthority.authority.authorizedRefs.some((reference) =>
      reference.kind === kind && reference.id === id);
  const visibleCounterparty = publicAuthority.visibleFacts.some((fact) =>
    fact.handle === binding.counterpartyHandle && fact.kind === "actor");
  const playerHasActiveCondition = mechanicalFrame.actorConditions.some((condition) =>
    condition.actorId === publicAuthority.player.actorId && condition.present);
  const counterpartyHasActiveCondition = mechanicalFrame.actorConditions.some((condition) =>
    condition.actorId === commitment.counterpartyActorId && condition.present);
  if (
    intent.targets.length !== 1 ||
    (action === "collect"
      ? intent.kind !== "contact" || intent.targets[0]?.kind !== "actor" ||
        intent.targets[0]?.handle !== binding.counterpartyHandle ||
        !visibleCounterparty || !counterpartyBinding ||
        counterpartyBinding.reference.id !== commitment.counterpartyActorId ||
        !playerPlacement || !counterpartyPlacement ||
        playerPlacement.locationId !== counterpartyPlacement.locationId ||
        playerPlacement.locationId !== currentLocationBinding.reference.id ||
        playerHasActiveCondition || counterpartyHasActiveCondition ||
        (possession !== undefined && possession.quantity > 0) ||
        suggestion.label !== expectedLabel ||
        !authorized("actor", commitment.counterpartyActorId) ||
        !authorized("location", currentLocationBinding.reference.id)
      : intent.kind !== "attempt" || intent.targets[0]?.kind !== "location" ||
        intent.targets[0]?.handle !== binding.destinationHandle ||
        !destinationBinding || destinationBinding.reference.id !== destination.id ||
        !playerPlacement || playerPlacement.locationId !== destination.id ||
        currentLocationBinding.reference.id !== destination.id ||
        playerHasActiveCondition || possession === undefined || possession.quantity < 1 ||
        suggestion.label !== expectedLabel ||
        !authorized("location", destination.id))
  ) return null;
  if (!authorized("actor", publicAuthority.player.actorId)) return null;
  const certificateBase = {
    actionSchemaVersion: 1,
    resolver: "code_owned",
    campaignId: input.campaignId,
    turnId: input.turnId,
    sourceTurnId: input.sourceTurnId,
    sourceMomentId: input.sourceMomentId,
    sourceMomentHash: input.sourceMomentHash,
    sourcePacketHash: input.sourcePacketHash,
    acceptedWorldVersion: input.acceptedWorldVersion,
    baseWorldVersion: input.baseWorldVersion,
    baseRuntimeRevision: input.baseRuntimeRevision,
    actorId: publicAuthority.player.actorId,
    actorHandle: publicAuthority.player.actorHandle,
    choiceHandle: intent.handle,
    label: suggestion.label,
    commitmentId: commitment.commitmentId,
    commitmentHandle: binding.commitmentHandle,
    action,
    commitmentBinding: binding,
    counterpartyActorId: commitment.counterpartyActorId,
    counterpartyActorHandle: binding.counterpartyHandle,
    subjectName: commitment.subjectName,
    destinationLocationId: destination.id,
    destinationHandle: binding.destinationHandle,
    commitmentWorldVersion: commitment.worldVersion,
    commitmentSourceDecisionKey: commitment.sourceDecisionKey,
    commitmentSourceTurnId: commitment.sourceTurnId,
    commitmentSourceReceiptId: commitment.sourceReceiptId,
    possessionId: action === "collect" ? null : possession?.possessionId ?? null,
    possessionHandle: action === "collect" || possession === undefined
      ? null
      : deriveCampaignPlayPublicHandle("possession", input.campaignId, possession.possessionId),
  };
  return campaignPlayCertifiedCommitmentSchema.parse(
    commitment.kind === "paid_delivery"
      ? { ...certificateBase, feeUnit: "copper", feeAmount: commitment.feeAmount }
      : certificateBase,
  );
}

function certifyPureRenderedObligation(input: {
  campaignId: string;
  turnId: string;
  acceptedWorldVersion: number;
  baseWorldVersion: number;
  baseRuntimeRevision: number;
  sourceTurnId: string;
  sourceMomentId: string;
  sourceMomentHash: string;
  sourcePacketHash: string;
  packet: CampaignPlayNarratorPacket;
  moment: z.infer<typeof publicMomentSchema>;
  mechanicalFrame: CampaignPlayRulebookFrame;
  publicAuthority: Pick<CampaignPlayPlayerActionAdmissionFrame,
    "player" | "visibleFacts" | "handleBindings" | "choiceBindings" | "authority">;
  judgeInput: CampaignPlayAdmissionJudgeInput;
}): CampaignPlayCertifiedObligation | null {
  const { judgeInput, packet, moment, mechanicalFrame, publicAuthority } = input;
  const binding = judgeInput.obligationBinding;
  if (judgeInput.source !== "suggested" || judgeInput.choiceHandle === null || binding === undefined) {
    return null;
  }
  const suggestion = [
    ...moment.suggestedActions,
    ...moment.utilityActions,
  ].find((candidate) => candidate.choiceHandle === judgeInput.choiceHandle);
  const intent = packet.availableIntents.find((candidate) =>
    candidate.handle === judgeInput.choiceHandle);
  const choice = publicAuthority.choiceBindings.find((candidate) =>
    candidate.handle === judgeInput.choiceHandle);
  if (!suggestion || !intent || !choice || suggestion.label !== judgeInput.originalText) return null;
  const suggestionBinding = suggestion.obligationBinding;
  const intentBinding = intent.obligationBinding;
  if (
    suggestionBinding === undefined || intentBinding === undefined ||
    canonicalizeCampaignPlayProjection(suggestionBinding) !==
      canonicalizeCampaignPlayProjection(binding) ||
    canonicalizeCampaignPlayProjection(intentBinding) !==
      canonicalizeCampaignPlayProjection(binding) ||
    choice.obligationBinding === undefined ||
    canonicalizeCampaignPlayProjection(choice.obligationBinding) !==
      canonicalizeCampaignPlayProjection(binding)
  ) return null;
  const visibleObligation = packet.obligations.find((candidate) =>
    candidate.handle === binding.obligationHandle);
  const visibleDebtorActor = packet.visibleActors.find((candidate) =>
    candidate.handle === binding.debtorHandle);
  if (
    intent.kind !== "contact" || intent.targets.length !== 1 ||
    intent.targets[0]?.kind !== "actor" ||
    intent.targets[0]?.handle !== binding.debtorHandle ||
    binding.creditorHandle !== publicAuthority.player.actorHandle ||
    visibleObligation === undefined ||
    visibleObligation.direction !== "receivable" ||
    visibleObligation.counterpartyHandle !== binding.debtorHandle ||
    visibleObligation.unitKey !== "copper" ||
    visibleObligation.outstandingAmount !== binding.amount ||
    visibleDebtorActor === undefined ||
    suggestion.label !== `Collect ${binding.amount} copper from ${visibleDebtorActor.name}`
  ) return null;
  const obligation = mechanicalFrame.obligations.find((candidate) =>
      deriveCampaignPlayPublicHandle("obligation", input.campaignId, candidate.obligationId) ===
        binding.obligationHandle);
  if (!obligation) return null;
  const debtor = [
    ...mechanicalFrame.acceptedWorld.actors,
    ...mechanicalFrame.runtimeActors,
  ].find((candidate) => candidate.id === obligation.debtorActorId);
  const creditor = mechanicalFrame.human?.actorId === publicAuthority.player.actorId
    ? mechanicalFrame.human
    : null;
  const expectedObligationId = deriveCampaignPlayObligationId(
    input.campaignId,
    obligation.debtorActorId,
    obligation.creditorActorId,
    obligation.unitKey,
  );
  const debtorHandle = deriveCampaignPlayPublicHandle(
    "actor",
    input.campaignId,
    obligation.debtorActorId,
  );
  const creditorHandle = deriveCampaignPlayPublicHandle(
    "actor",
    input.campaignId,
    obligation.creditorActorId,
  );
  const obligationBinding = publicAuthority.handleBindings.find((candidate) =>
    candidate.handle === binding.obligationHandle && candidate.reference.kind === "obligation");
  const debtorBinding = publicAuthority.handleBindings.find((candidate) =>
    candidate.handle === binding.debtorHandle && candidate.reference.kind === "actor");
  const currentLocationBinding = publicAuthority.handleBindings.find((candidate) =>
    candidate.handle === packet.currentLocation.handle && candidate.reference.kind === "location");
  const visibleDebtor = publicAuthority.visibleFacts.some((fact) =>
    fact.handle === binding.debtorHandle && fact.kind === "actor");
  const playerPlacement = mechanicalFrame.placements.find((placement) =>
    placement.actorId === publicAuthority.player.actorId && placement.placementKind === "present");
  const debtorPlacement = mechanicalFrame.placements.find((placement) =>
    placement.actorId === obligation.debtorActorId && placement.placementKind === "present");
  const authorized = (kind: CampaignPlayEntityRef["kind"], id: string) =>
    publicAuthority.authority.authorizedRefs.some((reference) =>
      reference.kind === kind && reference.id === id);
  const possessionId = deriveCampaignPlayPossessionId(
    input.campaignId,
    publicAuthority.player.actorId,
    "copper",
  );
  if (
    debtor === undefined || debtor.kind !== "person" || debtor.controller !== "agent" ||
    creditor === null || obligation.debtorActorId === obligation.creditorActorId ||
    obligation.obligationId !== expectedObligationId ||
    obligation.creditorActorId !== publicAuthority.player.actorId ||
    obligation.unitKey !== "copper" || obligation.outstandingAmount !== binding.amount ||
    binding.obligationHandle !== deriveCampaignPlayPublicHandle(
      "obligation", input.campaignId, obligation.obligationId) ||
    binding.debtorHandle !== debtorHandle || binding.creditorHandle !== creditorHandle ||
    debtor.name !== visibleDebtorActor.name ||
    !obligationBinding || obligationBinding.reference.id !== obligation.obligationId ||
    !debtorBinding || debtorBinding.reference.id !== obligation.debtorActorId ||
    !currentLocationBinding || !visibleDebtor || !playerPlacement || !debtorPlacement ||
    playerPlacement.locationId !== debtorPlacement.locationId ||
    playerPlacement.locationId !== currentLocationBinding.reference.id ||
    !authorized("actor", publicAuthority.player.actorId) ||
    !authorized("actor", obligation.debtorActorId) ||
    !authorized("obligation", obligation.obligationId) ||
    !authorized("location", playerPlacement.locationId)
  ) return null;
  return campaignPlayCertifiedObligationSchema.parse({
    actionSchemaVersion: 1,
    resolver: "code_owned",
    campaignId: input.campaignId,
    turnId: input.turnId,
    sourceTurnId: input.sourceTurnId,
    sourceMomentId: input.sourceMomentId,
    sourceMomentHash: input.sourceMomentHash,
    sourcePacketHash: input.sourcePacketHash,
    acceptedWorldVersion: input.acceptedWorldVersion,
    baseWorldVersion: input.baseWorldVersion,
    baseRuntimeRevision: input.baseRuntimeRevision,
    actorId: publicAuthority.player.actorId,
    actorHandle: publicAuthority.player.actorHandle,
    choiceHandle: intent.handle,
    label: suggestion.label,
    obligationId: obligation.obligationId,
    obligationHandle: binding.obligationHandle,
    obligationBinding: binding,
    debtorActorId: obligation.debtorActorId,
    debtorActorHandle: binding.debtorHandle,
    debtorName: debtor.name,
    creditorActorId: obligation.creditorActorId,
    creditorActorHandle: binding.creditorHandle,
    unitKey: "copper",
    amount: obligation.outstandingAmount,
    locationId: playerPlacement.locationId,
    locationHandle: currentLocationBinding.handle,
    creditorPossessionId: possessionId,
    creditorPossessionKey: "copper",
    creditorPossessionName: "Copper",
  });
}

function buildAdmissionFrame(input: {
  handle: CampaignPlayDatabaseHandle;
  turnId: string;
  request: CampaignPlayTurnAdmissionRequest;
}): CampaignPlayPlayerActionAdmissionFrame {
  const state = createCampaignPlayStateRepository(input.handle).loadState();
  if (
    !state || state.authority.setupPhase !== "ready" ||
    !state.eligibility.projection.eligible || state.authority.worldTimeMinutes === null ||
    input.request.expectedWorldVersion !== state.authority.worldVersion ||
    input.request.expectedRuntimeRevision !== state.authority.runtimeRevision
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_state_invalid",
      "Campaign Play action request does not match current ready authority.",
    );
  }
  const moment = loadCompletedPublicMoment(input.handle);
  if (
    moment.packet.acceptedWorldVersion !== state.authority.acceptedWorldVersion ||
    moment.packet.worldVersion !== state.authority.worldVersion
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_public_context_invalid",
      "Campaign Play current public moment does not match mechanical authority.",
    );
  }
  const mechanicalFrame = loadCampaignPlayRulebookFrame(input.handle);
  const human = humanPlayer(input.handle);
  const judgeInput = resolveJudgeInput(input.request, moment.packet, moment.moment);
  const hasCommitmentBinding = judgeInput.commitmentBinding !== undefined;
  const hasObligationBinding = judgeInput.obligationBinding !== undefined;
  const publicAuthority = buildPublicAuthority({
    handle: input.handle,
    packet: moment.packet,
    moment: moment.moment,
    mechanicalFrame,
    human,
    judgeInput,
  });
  const baseFrame = {
    campaignId: input.handle.campaignId,
    turnId: input.turnId,
    acceptedWorldVersion: state.authority.acceptedWorldVersion,
    acceptedContentHash: state.authority.acceptedContentHash,
    baseWorldVersion: state.authority.worldVersion,
    baseRuntimeRevision: state.authority.runtimeRevision,
    worldTimeMinutes: state.authority.worldTimeMinutes,
    sourceTurnId: moment.row.sourceTurnId,
    sourceMomentId: moment.moment.momentId,
    sourceMomentHash: hashCampaignPlayProjection({
      domain: "campaign_play_source_moment",
      moment: moment.moment,
    }),
    sourcePacketHash: moment.row.packetHash,
    sourceMoment: moment.moment,
    sourcePacket: moment.packet,
    judgeInput,
    ...publicAuthority,
  };
  const obligationCertificate = hasObligationBinding
    ? certifyPureRenderedObligation({
      campaignId: baseFrame.campaignId,
      turnId: baseFrame.turnId,
      acceptedWorldVersion: baseFrame.acceptedWorldVersion,
      baseWorldVersion: baseFrame.baseWorldVersion,
      baseRuntimeRevision: baseFrame.baseRuntimeRevision,
      sourceTurnId: baseFrame.sourceTurnId,
      sourceMomentId: baseFrame.sourceMomentId,
      sourceMomentHash: baseFrame.sourceMomentHash,
      sourcePacketHash: baseFrame.sourcePacketHash,
      packet: baseFrame.sourcePacket,
      moment: baseFrame.sourceMoment,
      mechanicalFrame,
      publicAuthority,
      judgeInput,
    })
    : null;
  if (hasObligationBinding && obligationCertificate === null) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_request_invalid",
      "Campaign Play receivable action no longer matches the signed obligation authority.",
    );
  }
  const commitmentCertificate = hasCommitmentBinding && !hasObligationBinding
    ? certifyPureRenderedCommitment({
      campaignId: baseFrame.campaignId,
      turnId: baseFrame.turnId,
      acceptedWorldVersion: baseFrame.acceptedWorldVersion,
      baseWorldVersion: baseFrame.baseWorldVersion,
      baseRuntimeRevision: baseFrame.baseRuntimeRevision,
      sourceTurnId: baseFrame.sourceTurnId,
      sourceMomentId: baseFrame.sourceMomentId,
      sourceMomentHash: baseFrame.sourceMomentHash,
      sourcePacketHash: baseFrame.sourcePacketHash,
      packet: baseFrame.sourcePacket,
      moment: baseFrame.sourceMoment,
      mechanicalFrame,
      publicAuthority,
      judgeInput,
    })
    : null;
  if (hasCommitmentBinding && commitmentCertificate === null) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_request_invalid",
      "Campaign Play commitment action no longer matches the signed delivery authority.",
    );
  }
  const moveCertificate = hasCommitmentBinding || hasObligationBinding ? null : certifyPureRenderedMove({
    campaignId: baseFrame.campaignId,
    turnId: baseFrame.turnId,
    acceptedWorldVersion: baseFrame.acceptedWorldVersion,
    baseWorldVersion: baseFrame.baseWorldVersion,
    baseRuntimeRevision: baseFrame.baseRuntimeRevision,
    sourceTurnId: baseFrame.sourceTurnId,
    sourceMomentId: baseFrame.sourceMomentId,
    sourceMomentHash: baseFrame.sourceMomentHash,
    sourcePacketHash: baseFrame.sourcePacketHash,
    packet: baseFrame.sourcePacket,
    moment: baseFrame.sourceMoment,
    mechanicalFrame,
    publicAuthority,
    judgeInput,
  });
  const waitCertificate = moveCertificate === null && !hasCommitmentBinding && !hasObligationBinding ? certifyPureRenderedWait({
    campaignId: baseFrame.campaignId,
    turnId: baseFrame.turnId,
    acceptedWorldVersion: baseFrame.acceptedWorldVersion,
    baseWorldVersion: baseFrame.baseWorldVersion,
    baseRuntimeRevision: baseFrame.baseRuntimeRevision,
    sourceTurnId: baseFrame.sourceTurnId,
    sourceMomentId: baseFrame.sourceMomentId,
    sourceMomentHash: baseFrame.sourceMomentHash,
    sourcePacketHash: baseFrame.sourcePacketHash,
    packet: baseFrame.sourcePacket,
    moment: baseFrame.sourceMoment,
    publicAuthority,
    judgeInput,
  }) : null;
  const submittedChoiceHandle = input.request.source === "suggested"
    ? input.request.choiceHandle
    : null;
  const utilitySubmission = submittedChoiceHandle !== null &&
    moment.moment.utilityActions.some((action) =>
      action.choiceHandle === submittedChoiceHandle);
  if (utilitySubmission && waitCertificate === null) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_request_invalid",
      "Campaign Play utility action no longer matches the current wait certificate.",
    );
  }
  const decisionCertificate = !hasCommitmentBinding && !hasObligationBinding && moveCertificate === null && waitCertificate === null
    ? certifyPureRenderedDecision({
      campaignId: baseFrame.campaignId,
      turnId: baseFrame.turnId,
      acceptedWorldVersion: baseFrame.acceptedWorldVersion,
      baseWorldVersion: baseFrame.baseWorldVersion,
      baseRuntimeRevision: baseFrame.baseRuntimeRevision,
      sourceTurnId: baseFrame.sourceTurnId,
      sourceMomentId: baseFrame.sourceMomentId,
      sourceMomentHash: baseFrame.sourceMomentHash,
      sourcePacketHash: baseFrame.sourcePacketHash,
      packet: baseFrame.sourcePacket,
      moment: baseFrame.sourceMoment,
      mechanicalFrame,
      publicAuthority,
      judgeInput,
    }) : null;
  const requestedDecisionBinding = input.request.source === "suggested"
    ? input.request.decisionBinding
    : undefined;
  if (requestedDecisionBinding !== undefined && decisionCertificate === null) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_request_invalid",
      "Campaign Play decision binding no longer matches an open rendered decision.",
    );
  }
  const contactCertificate = !hasCommitmentBinding && !hasObligationBinding && moveCertificate === null && waitCertificate === null &&
    decisionCertificate === null
    ? certifyPureRenderedContact({
      campaignId: baseFrame.campaignId,
      turnId: baseFrame.turnId,
      acceptedWorldVersion: baseFrame.acceptedWorldVersion,
      baseWorldVersion: baseFrame.baseWorldVersion,
      baseRuntimeRevision: baseFrame.baseRuntimeRevision,
      sourceTurnId: baseFrame.sourceTurnId,
      sourceMomentId: baseFrame.sourceMomentId,
      sourceMomentHash: baseFrame.sourceMomentHash,
      sourcePacketHash: baseFrame.sourcePacketHash,
      packet: baseFrame.sourcePacket,
      moment: baseFrame.sourceMoment,
      mechanicalFrame,
      publicAuthority,
      judgeInput,
    }) : null;
  const observeCertificate = !hasCommitmentBinding && !hasObligationBinding && moveCertificate === null && waitCertificate === null &&
    decisionCertificate === null && contactCertificate === null
    ? certifyPureRenderedObserve({
      campaignId: baseFrame.campaignId,
      turnId: baseFrame.turnId,
      acceptedWorldVersion: baseFrame.acceptedWorldVersion,
      baseWorldVersion: baseFrame.baseWorldVersion,
      baseRuntimeRevision: baseFrame.baseRuntimeRevision,
      sourceTurnId: baseFrame.sourceTurnId,
      sourceMomentId: baseFrame.sourceMomentId,
      sourceMomentHash: baseFrame.sourceMomentHash,
      sourcePacketHash: baseFrame.sourcePacketHash,
      packet: baseFrame.sourcePacket,
      moment: baseFrame.sourceMoment,
      mechanicalFrame,
      publicAuthority,
      judgeInput,
    })
    : null;
  return playerActionAdmissionFrameSchema.parse({
    ...baseFrame,
    executionRoute: obligationCertificate !== null
      ? {
          kind: "certified_obligation",
          certificate: obligationCertificate,
          certificateHash: certifiedObligationHash(obligationCertificate),
        }
      : commitmentCertificate !== null
      ? {
          kind: "certified_commitment",
          certificate: commitmentCertificate,
          certificateHash: certifiedCommitmentHash(commitmentCertificate),
        }
      : moveCertificate !== null
      ? {
          kind: "certified_move",
          certificate: moveCertificate,
          certificateHash: certifiedMoveHash(moveCertificate),
        }
      : waitCertificate !== null
        ? {
          kind: "certified_wait",
            certificate: waitCertificate,
          certificateHash: certifiedWaitHash(waitCertificate),
        }
      : decisionCertificate !== null
        ? {
            kind: "certified_decision",
            certificate: decisionCertificate,
            certificateHash: certifiedDecisionHash(decisionCertificate),
          }
        : contactCertificate !== null
          ? {
              kind: "certified_contact",
              certificate: contactCertificate,
              certificateHash: certifiedContactHash(contactCertificate),
            }
          : observeCertificate !== null
            ? {
                kind: "certified_observe",
                certificate: observeCertificate,
                certificateHash: certifiedObserveHash(observeCertificate),
              }
        : { kind: "full_authority" },
  });
}

export function loadCampaignPlayPlayerActionAdmissionFrame(
  turn: LoadedCampaignPlayTurn,
): CampaignPlayPlayerActionAdmissionFrame {
  if (turn.turnKind !== "player_action" || turn.document.turnKind !== "player_action") {
    throw new CampaignPlayTurnRuntimeError(
      "turn_artifact_invalid",
      "Campaign Play player-action runtime received another turn kind.",
    );
  }
  const frame = playerActionAdmissionFrameSchema.parse(turn.document.frame);
  if (frame.turnId !== turn.turnId || frame.campaignId !== turn.campaignId) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_artifact_invalid",
      "Campaign Play admitted player-action frame has another durable identity.",
    );
  }
  return frame;
}

function rulebookAuthority(
  turnId: string,
  frame: CampaignPlayPlayerActionAdmissionFrame,
): CampaignPlayRulebookAuthority {
  if (frame.executionRoute.kind === "certified_commitment") {
    const certificate = frame.executionRoute.certificate;
    const isPaidDelivery = "feeAmount" in certificate;
    const authorizedRefs: CampaignPlayEntityRef[] = [
      { kind: "actor", id: certificate.actorId },
      { kind: "actor", id: certificate.counterpartyActorId },
      { kind: "commitment", id: certificate.commitmentId },
      { kind: "location", id: certificate.destinationLocationId },
    ];
    if (certificate.action === "collect") {
      const currentLocationBinding = frame.handleBindings.find((binding) =>
        binding.handle === frame.sourcePacket.currentLocation.handle);
      if (!currentLocationBinding || currentLocationBinding.reference.kind !== "location") {
        throw new CampaignPlayTurnRuntimeError(
          "turn_artifact_invalid",
          "Certified collect commitment lost its current-location authority.",
        );
      }
      if (!authorizedRefs.some((reference) =>
        reference.kind === "location" && reference.id === currentLocationBinding.reference.id)) {
        authorizedRefs.push({
          kind: "location",
          id: currentLocationBinding.reference.id,
        });
      }
    }
    if (isPaidDelivery && certificate.action === "deliver") {
      authorizedRefs.push({
        kind: "possession",
        id: deriveCampaignPlayPossessionId(
          frame.campaignId,
          certificate.actorId,
          "copper",
        ),
      });
    }
    if (certificate.possessionId !== null) {
      authorizedRefs.push({ kind: "possession", id: certificate.possessionId });
    }
    return {
      purpose: "commitment_execution",
      turnId,
      actorId: certificate.actorId,
      rootParent: { kind: "turn", turnId },
      authorizedRefs,
      witnessActorIds: [],
      knownWorldEventIds: [],
        commitmentExecution: isPaidDelivery
          ? {
              action: certificate.action,
              commitmentKind: "paid_delivery",
              commitmentId: certificate.commitmentId,
              performerActorId: certificate.actorId,
              counterpartyActorId: certificate.counterpartyActorId,
              subjectName: certificate.subjectName,
              destinationLocationId: certificate.destinationLocationId,
              destinationHandle: certificate.destinationHandle,
              feeUnit: certificate.feeUnit,
              feeAmount: certificate.feeAmount,
              possessionId: certificate.possessionId,
              sourceDecisionKey: certificate.commitmentSourceDecisionKey,
              sourceTurnId: certificate.commitmentSourceTurnId,
              sourceReceiptId: certificate.commitmentSourceReceiptId,
              commitmentWorldVersion: certificate.commitmentWorldVersion,
            }
          : {
              action: certificate.action,
              commitmentKind: "unpaid_delivery",
              commitmentId: certificate.commitmentId,
              performerActorId: certificate.actorId,
              counterpartyActorId: certificate.counterpartyActorId,
              subjectName: certificate.subjectName,
              destinationLocationId: certificate.destinationLocationId,
              destinationHandle: certificate.destinationHandle,
              possessionId: certificate.possessionId,
              sourceDecisionKey: certificate.commitmentSourceDecisionKey,
              sourceTurnId: certificate.commitmentSourceTurnId,
              sourceReceiptId: certificate.commitmentSourceReceiptId,
              commitmentWorldVersion: certificate.commitmentWorldVersion,
            },
    };
  }
  if (frame.executionRoute.kind === "certified_obligation") {
    const certificate = frame.executionRoute.certificate;
    return {
      purpose: "player_action",
      turnId,
      actorId: certificate.actorId,
      rootParent: { kind: "turn", turnId },
      authorizedRefs: [
        { kind: "actor", id: certificate.actorId },
        { kind: "actor", id: certificate.debtorActorId },
        { kind: "obligation", id: certificate.obligationId },
        { kind: "location", id: certificate.locationId },
        { kind: "possession", id: certificate.creditorPossessionId },
      ],
      witnessActorIds: [certificate.debtorActorId],
      knownWorldEventIds: [],
    };
  }
  return {
    purpose: "player_action",
    turnId,
    actorId: frame.player.actorId,
    rootParent: { kind: "turn", turnId },
    authorizedRefs: frame.authority.authorizedRefs,
    witnessActorIds: frame.authority.witnessActorIds,
    knownWorldEventIds: frame.authority.knownWorldEventIds,
  };
}

function commitmentAuthorityForAdmission(input: {
  handle: CampaignPlayDatabaseHandle;
  admission: CampaignPlayPlayerActionAdmissionFrame;
  mechanical: CampaignPlayRulebookFrame;
}): CampaignPlayCommitmentAuthority | undefined {
  const binding = input.admission.judgeInput.commitmentBinding;
  if (binding === undefined) return undefined;
  const commitment = input.mechanical.commitments.find((candidate) =>
    deriveCampaignPlayPublicHandle("commitment", input.handle.campaignId, candidate.commitmentId)
      === binding.commitmentHandle);
  const destination = [
    ...input.mechanical.acceptedWorld.locations,
    ...input.mechanical.runtimeLocations,
  ].find((candidate) =>
    deriveCampaignPlayPublicHandle("location", input.handle.campaignId, candidate.id)
      === binding.destinationHandle);
  const counterparty = commitment === undefined
    ? undefined
    : [...input.mechanical.acceptedWorld.actors, ...input.mechanical.runtimeActors]
      .find((candidate) => candidate.id === commitment.counterpartyActorId);
  const counterpartyHandle = commitment === undefined
    ? null
    : deriveCampaignPlayPublicHandle(
      "actor",
      input.handle.campaignId,
      commitment.counterpartyActorId,
    );
  const counterpartyBinding = counterpartyHandle === null
    ? undefined
    : input.admission.handleBindings.find((candidate) =>
      candidate.handle === counterpartyHandle && candidate.reference.kind === "actor");
  const destinationBinding = input.admission.handleBindings.find((candidate) =>
    candidate.handle === binding.destinationHandle && candidate.reference.kind === "location");
  const expectedPossessionKey = commitment === undefined
    ? null
    : deriveCampaignPlayPossessionKey(commitment.subjectName);
  const expectedPossessionId = expectedPossessionKey === null
    ? null
    : deriveCampaignPlayPossessionId(
      input.handle.campaignId,
      input.admission.player.actorId,
      expectedPossessionKey,
    );
  const possession = expectedPossessionId === null
    ? undefined
    : input.mechanical.possessions.find((candidate) =>
      candidate.possessionId === expectedPossessionId &&
      candidate.actorId === input.admission.player.actorId);
  const playerPlacement = input.mechanical.placements.find((candidate) =>
    candidate.actorId === input.admission.player.actorId && candidate.placementKind === "present");
  if (
    commitment === undefined ||
    commitment.status !== "active" ||
    (commitment.kind !== "paid_delivery" && commitment.kind !== "unpaid_delivery") ||
    commitment.performerActorId !== input.admission.player.actorId ||
    counterparty?.kind !== "person" ||
    counterparty.controller !== "agent" ||
    counterpartyHandle !== binding.counterpartyHandle ||
    (binding.action === "collect" && (
      counterpartyBinding === undefined ||
      counterpartyBinding.reference.id !== commitment.counterpartyActorId
    )) ||
    destination === undefined ||
    (binding.action === "deliver" && (
      destinationBinding === undefined || destinationBinding.reference.id !== destination.id
    )) ||
    commitment.subjectName !== binding.subjectName ||
    commitment.destinationHandle !== binding.destinationHandle ||
    (binding.action === "collect"
      ? possession !== undefined && possession.quantity > 0
      : playerPlacement?.locationId !== destination.id || (possession?.quantity ?? 0) < 1)
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_artifact_invalid",
      "Campaign Play commitment binding is stale or no longer matches mechanical authority.",
    );
  }
  const authorityBase = {
    binding,
    commitmentId: commitment.commitmentId,
    action: binding.action,
    performerActorId: commitment.performerActorId,
    counterpartyActorId: commitment.counterpartyActorId,
    counterpartyHandle: binding.counterpartyHandle,
    subjectName: commitment.subjectName,
    destinationHandle: commitment.destinationHandle,
    possessionId: possession?.possessionId ?? null,
    possessionHandle: possession === undefined
      ? null
      : deriveCampaignPlayPublicHandle("possession", input.handle.campaignId, possession.possessionId),
  };
  return commitment.kind === "paid_delivery"
    ? { ...authorityBase, commitmentKind: "paid_delivery" as const, feeAmount: commitment.feeAmount }
    : { ...authorityBase, commitmentKind: "unpaid_delivery" as const };
}

function currentGameMasterFrame(
  handle: CampaignPlayDatabaseHandle,
  turn: LoadedCampaignPlayTurn,
): { admission: CampaignPlayPlayerActionAdmissionFrame; frame: CampaignPlayGameMasterFrame } {
  const admission = loadCampaignPlayPlayerActionAdmissionFrame(turn);
  const mechanical = loadCampaignPlayRulebookFrame(handle);
  if (
    mechanical.campaignId !== admission.campaignId ||
    mechanical.acceptedWorldVersion !== admission.acceptedWorldVersion ||
    mechanical.acceptedContentHash !== admission.acceptedContentHash ||
    mechanical.worldVersion !== admission.baseWorldVersion ||
    mechanical.worldTimeMinutes !== admission.worldTimeMinutes ||
    mechanical.human?.actorId !== admission.player.actorId ||
    mechanical.human.recordHash !== admission.player.profileDigest
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_artifact_invalid",
      "Campaign Play admitted player-action frame lost its mechanical authority.",
    );
  }
  const rebuilt = buildPublicAuthority({
    handle,
    packet: admission.sourcePacket,
    moment: admission.sourceMoment,
    mechanicalFrame: mechanical,
    human: {
      actorId: admission.player.actorId,
      kind: "person",
      controller: "human",
      role: "player",
      name: admission.player.name,
      profileDigest: admission.player.profileDigest,
      profile: admission.player.profile,
    },
    judgeInput: admission.judgeInput,
  });
  if (
    canonicalizeCampaignPlayProjection(rebuilt) !== canonicalizeCampaignPlayProjection({
      player: admission.player,
      visibleFacts: admission.visibleFacts,
      handleBindings: admission.handleBindings,
      choiceBindings: admission.choiceBindings,
      authority: admission.authority,
    })
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_artifact_invalid",
      "Campaign Play admitted public bindings changed before settlement.",
    );
  }
  const commitmentAuthority = commitmentAuthorityForAdmission({
    handle,
    admission,
    mechanical,
  });
  const frozenChoice = admission.judgeInput.source === "suggested"
    ? admission.choiceBindings.find((choice) =>
        choice.handle === admission.judgeInput.choiceHandle)
    : null;
  if (admission.judgeInput.source === "suggested" && frozenChoice === undefined) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_artifact_invalid",
      "Campaign Play suggested action lost its frozen binding.",
    );
  }
  return {
    admission,
    frame: {
      sourceMoment: admission.sourceMoment.displayText,
      playerProfile: admission.player.profile,
      visibleFacts: admission.visibleFacts,
      handleBindings: admission.handleBindings,
      actorContinuity: loadCampaignPlayActorContinuity(
        handle,
        admission.handleBindings.flatMap((binding) =>
          binding.reference.kind === "actor"
          && admission.authority.witnessActorIds.includes(binding.reference.id)
            ? [{ actorHandle: binding.handle, actorId: binding.reference.id }]
            : []),
        mechanical.worldVersion,
      ),
      rulebookFrame: mechanical,
      authority: rulebookAuthority(turn.turnId, admission),
      ...(commitmentAuthority === undefined ? {} : { commitmentAuthority }),
      ...(frozenChoice === undefined || frozenChoice === null
        ? {}
        : { admittedIntentTargets: frozenChoice.targets }),
    },
  };
}

function revalidateCertifiedRoute(
  handle: CampaignPlayDatabaseHandle,
  turn: LoadedCampaignPlayTurn,
): CampaignPlayCertifiedMove | CampaignPlayCertifiedWait | CampaignPlayCertifiedContact |
  CampaignPlayCertifiedDecision | CampaignPlayCertifiedObserve | CampaignPlayCertifiedCommitment |
  CampaignPlayCertifiedObligation {
  const current = currentGameMasterFrame(handle, turn);
  const admission = current.admission;
  if (!isCertifiedRoute(admission.executionRoute)) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_artifact_invalid",
      "Campaign Play turn has no certified route authority.",
    );
  }
  const publicAuthority = {
    player: admission.player,
    visibleFacts: admission.visibleFacts,
    handleBindings: admission.handleBindings,
    choiceBindings: admission.choiceBindings,
    authority: admission.authority,
  };
  const fresh = admission.executionRoute.kind === "certified_move"
    ? certifyPureRenderedMove({
    campaignId: admission.campaignId,
    turnId: admission.turnId,
    acceptedWorldVersion: admission.acceptedWorldVersion,
    baseWorldVersion: admission.baseWorldVersion,
    baseRuntimeRevision: admission.baseRuntimeRevision,
    sourceTurnId: admission.sourceTurnId,
    sourceMomentId: admission.sourceMomentId,
    sourceMomentHash: admission.sourceMomentHash,
    sourcePacketHash: admission.sourcePacketHash,
    packet: admission.sourcePacket,
    moment: admission.sourceMoment,
    mechanicalFrame: current.frame.rulebookFrame,
    publicAuthority,
    judgeInput: admission.judgeInput,
    })
    : admission.executionRoute.kind === "certified_wait"
      ? certifyPureRenderedWait({
      campaignId: admission.campaignId,
      turnId: admission.turnId,
      acceptedWorldVersion: admission.acceptedWorldVersion,
      baseWorldVersion: admission.baseWorldVersion,
      baseRuntimeRevision: admission.baseRuntimeRevision,
      sourceTurnId: admission.sourceTurnId,
      sourceMomentId: admission.sourceMomentId,
      sourceMomentHash: admission.sourceMomentHash,
      sourcePacketHash: admission.sourcePacketHash,
      packet: admission.sourcePacket,
      moment: admission.sourceMoment,
      publicAuthority,
      judgeInput: admission.judgeInput,
      })
      : admission.executionRoute.kind === "certified_contact"
        ? certifyPureRenderedContact({
        campaignId: admission.campaignId,
        turnId: admission.turnId,
        acceptedWorldVersion: admission.acceptedWorldVersion,
        baseWorldVersion: admission.baseWorldVersion,
        baseRuntimeRevision: admission.baseRuntimeRevision,
        sourceTurnId: admission.sourceTurnId,
        sourceMomentId: admission.sourceMomentId,
        sourceMomentHash: admission.sourceMomentHash,
        sourcePacketHash: admission.sourcePacketHash,
        packet: admission.sourcePacket,
        moment: admission.sourceMoment,
        mechanicalFrame: current.frame.rulebookFrame,
        publicAuthority,
        judgeInput: admission.judgeInput,
        })
        : admission.executionRoute.kind === "certified_decision"
          ? certifyPureRenderedDecision({
          campaignId: admission.campaignId,
          turnId: admission.turnId,
          acceptedWorldVersion: admission.acceptedWorldVersion,
          baseWorldVersion: admission.baseWorldVersion,
          baseRuntimeRevision: admission.baseRuntimeRevision,
          sourceTurnId: admission.sourceTurnId,
          sourceMomentId: admission.sourceMomentId,
          sourceMomentHash: admission.sourceMomentHash,
          sourcePacketHash: admission.sourcePacketHash,
          packet: admission.sourcePacket,
          moment: admission.sourceMoment,
          mechanicalFrame: current.frame.rulebookFrame,
          publicAuthority,
          judgeInput: admission.judgeInput,
          })
          : admission.executionRoute.kind === "certified_commitment"
            ? certifyPureRenderedCommitment({
            campaignId: admission.campaignId,
            turnId: admission.turnId,
            acceptedWorldVersion: admission.acceptedWorldVersion,
            baseWorldVersion: admission.baseWorldVersion,
            baseRuntimeRevision: admission.baseRuntimeRevision,
            sourceTurnId: admission.sourceTurnId,
            sourceMomentId: admission.sourceMomentId,
            sourceMomentHash: admission.sourceMomentHash,
            sourcePacketHash: admission.sourcePacketHash,
            packet: admission.sourcePacket,
            moment: admission.sourceMoment,
            mechanicalFrame: current.frame.rulebookFrame,
            publicAuthority,
            judgeInput: admission.judgeInput,
            })
            : admission.executionRoute.kind === "certified_obligation"
              ? certifyPureRenderedObligation({
              campaignId: admission.campaignId,
              turnId: admission.turnId,
              acceptedWorldVersion: admission.acceptedWorldVersion,
              baseWorldVersion: admission.baseWorldVersion,
              baseRuntimeRevision: admission.baseRuntimeRevision,
              sourceTurnId: admission.sourceTurnId,
              sourceMomentId: admission.sourceMomentId,
              sourceMomentHash: admission.sourceMomentHash,
              sourcePacketHash: admission.sourcePacketHash,
              packet: admission.sourcePacket,
              moment: admission.sourceMoment,
              mechanicalFrame: current.frame.rulebookFrame,
              publicAuthority,
              judgeInput: admission.judgeInput,
              })
              : certifyPureRenderedObserve({
          campaignId: admission.campaignId,
          turnId: admission.turnId,
          acceptedWorldVersion: admission.acceptedWorldVersion,
          baseWorldVersion: admission.baseWorldVersion,
          baseRuntimeRevision: admission.baseRuntimeRevision,
          sourceTurnId: admission.sourceTurnId,
          sourceMomentId: admission.sourceMomentId,
          sourceMomentHash: admission.sourceMomentHash,
          sourcePacketHash: admission.sourcePacketHash,
          packet: admission.sourcePacket,
          moment: admission.sourceMoment,
          mechanicalFrame: current.frame.rulebookFrame,
          publicAuthority,
          judgeInput: admission.judgeInput,
        });
  const hash = fresh === null
    ? null
    : admission.executionRoute.kind === "certified_move"
      ? certifiedMoveHash(fresh as CampaignPlayCertifiedMove)
      : admission.executionRoute.kind === "certified_wait"
        ? certifiedWaitHash(fresh as CampaignPlayCertifiedWait)
        : admission.executionRoute.kind === "certified_contact"
          ? certifiedContactHash(fresh as CampaignPlayCertifiedContact)
          : admission.executionRoute.kind === "certified_decision"
            ? certifiedDecisionHash(fresh as CampaignPlayCertifiedDecision)
            : admission.executionRoute.kind === "certified_commitment"
              ? certifiedCommitmentHash(fresh as CampaignPlayCertifiedCommitment)
              : admission.executionRoute.kind === "certified_obligation"
                ? certifiedObligationHash(fresh as CampaignPlayCertifiedObligation)
                : certifiedObserveHash(fresh as CampaignPlayCertifiedObserve);
  if (
    fresh === null ||
    hash !== admission.executionRoute.certificateHash ||
    canonicalizeCampaignPlayProjection(fresh) !==
      canonicalizeCampaignPlayProjection(admission.executionRoute.certificate)
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_artifact_invalid",
      "Campaign Play certified route no longer matches current authority.",
    );
  }
  return fresh;
}

function compileCertifiedRouteBatch(
  handle: CampaignPlayDatabaseHandle,
  turn: LoadedCampaignPlayTurn,
): { batch: ReturnType<typeof rulebookCommandBatchSchema.parse>; batchHash: string } {
  const current = currentGameMasterFrame(handle, turn);
  const certificate = revalidateCertifiedRoute(handle, turn);
  const frame = current.frame.rulebookFrame;
  const playerRef = { kind: "actor" as const, id: certificate.actorId };
  const isCommitment = current.admission.executionRoute.kind === "certified_commitment";
  const isObligation = current.admission.executionRoute.kind === "certified_obligation";
  const source = isCommitment
    ? { kind: "system" as const, system: "commitment_executor" as const }
    : { kind: "actor" as const, actorId: certificate.actorId };
  const ruling = isCommitment || isObligation
    ? null
    : (certificate as CampaignPlayCertifiedMove | CampaignPlayCertifiedWait |
      CampaignPlayCertifiedContact | CampaignPlayCertifiedDecision | CampaignPlayCertifiedObserve).ruling;
  const commandArguments: Array<Record<string, unknown>> = isCommitment || isObligation ? [] : [{
    kind: "advance_world_time",
    elapsedMinutes: ruling!.elapsedBounds.maximumMinutes,
    readScope: [],
    writeScope: [],
    exposure: { mode: "protected" },
  }];
  if (isObligation) {
    const obligation = certificate as CampaignPlayCertifiedObligation;
    const debtorRef = { kind: "actor" as const, id: obligation.debtorActorId };
    const obligationRef = { kind: "obligation" as const, id: obligation.obligationId };
    const locationRef = { kind: "location" as const, id: obligation.locationId };
    const possessionRef = { kind: "possession" as const, id: obligation.creditorPossessionId };
    commandArguments.push({
      kind: "settle_player_receivable",
      debtorActorId: obligation.debtorActorId,
      creditorActorId: obligation.creditorActorId,
      obligationId: obligation.obligationId,
      creditorPossessionId: obligation.creditorPossessionId,
      creditorPossessionKey: obligation.creditorPossessionKey,
      creditorPossessionName: obligation.creditorPossessionName,
      unitKey: obligation.unitKey,
      amount: obligation.amount,
      summary: obligation.label,
      affectedRefs: [debtorRef, playerRef, possessionRef, obligationRef, locationRef],
      readScope: [debtorRef, playerRef, possessionRef, obligationRef],
      writeScope: [possessionRef, obligationRef],
      exposure: { mode: "protected" },
    });
  } else if (isCommitment) {
    const commitment = certificate as CampaignPlayCertifiedCommitment;
    const commitmentRef = { kind: "commitment" as const, id: commitment.commitmentId };
    const counterpartyRef = { kind: "actor" as const, id: commitment.counterpartyActorId };
    const destinationRef = { kind: "location" as const, id: commitment.destinationLocationId };
    const possessionId = commitment.possessionId ?? deriveCampaignPlayPossessionId(
      turn.campaignId,
      commitment.actorId,
      deriveCampaignPlayPossessionKey(commitment.subjectName),
    );
    const possessionKey = deriveCampaignPlayPossessionKey(commitment.subjectName);
    const possessionRef = { kind: "possession" as const, id: possessionId };
    const isPaidDelivery = "feeAmount" in commitment;
    const paymentPossessionId = isPaidDelivery
      ? deriveCampaignPlayPossessionId(
          turn.campaignId,
          commitment.actorId,
          "copper",
        )
      : null;
    const paymentPossessionRef = paymentPossessionId === null
      ? null
      : { kind: "possession" as const, id: paymentPossessionId };
    if (commitment.action === "collect") {
      const currentLocationBinding = current.frame.handleBindings.find((binding) =>
        binding.handle === current.admission.sourcePacket.currentLocation.handle &&
        binding.reference.kind === "location");
      const playerPlacement = frame.placements.find((placement) =>
        placement.actorId === commitment.actorId && placement.placementKind === "present");
      const counterpartyPlacement = frame.placements.find((placement) =>
        placement.actorId === commitment.counterpartyActorId && placement.placementKind === "present");
      const counterparty = [...frame.acceptedWorld.actors, ...frame.runtimeActors]
        .find((actor) => actor.id === commitment.counterpartyActorId);
      if (
        !currentLocationBinding || currentLocationBinding.reference.kind !== "location" ||
        !playerPlacement || !counterpartyPlacement ||
        playerPlacement.locationId !== currentLocationBinding.reference.id ||
        counterpartyPlacement.locationId !== currentLocationBinding.reference.id ||
        !counterparty || counterparty.kind !== "person" || counterparty.controller !== "agent"
      ) {
        throw new CampaignPlayTurnRuntimeError(
          "turn_artifact_invalid",
          "Certified collect commitment lost its exact pickup authority.",
        );
      }
      const currentLocationRef = {
        kind: "location" as const,
        id: currentLocationBinding.reference.id,
      };
      const pickupGroundingRefs = currentLocationRef.id === destinationRef.id
        ? []
        : [currentLocationRef];
      commandArguments.push({
        kind: "adjust_actor_possession",
        actorId: commitment.actorId,
        possessionId,
        possessionKey,
        name: commitment.subjectName,
        quantityDelta: 1,
        summary: `Collected ${commitment.subjectName} from ${counterparty.name}.`,
        affectedRefs: [
          playerRef,
          possessionRef,
          counterpartyRef,
          commitmentRef,
          destinationRef,
          ...pickupGroundingRefs,
        ],
        readScope: [
          playerRef,
          possessionRef,
          counterpartyRef,
          commitmentRef,
          destinationRef,
          ...pickupGroundingRefs,
        ],
        writeScope: [possessionRef],
        exposure: {
          mode: "projectable",
          predicates: [{
            channel: "direct_perception",
            locationId: currentLocationBinding.reference.id,
          }],
        },
      });
    } else {
      if (commitment.possessionId === null) {
        throw new CampaignPlayTurnRuntimeError(
          "turn_artifact_invalid",
          "Certified delivery commitment lost its exact possession.",
        );
      }
      commandArguments.push({
        kind: "adjust_actor_possession",
        actorId: commitment.actorId,
        possessionId: commitment.possessionId,
        possessionKey,
        name: commitment.subjectName,
        quantityDelta: -1,
        summary: commitment.label,
        affectedRefs: [playerRef, possessionRef, commitmentRef, destinationRef],
        readScope: [playerRef, possessionRef, commitmentRef, destinationRef],
        writeScope: [possessionRef],
        exposure: { mode: "protected" },
      });
      if (isPaidDelivery && paymentPossessionId !== null && paymentPossessionRef !== null) {
        commandArguments.push({
          kind: "adjust_actor_possession",
          actorId: commitment.actorId,
          possessionId: paymentPossessionId,
          possessionKey: "copper",
          name: "Copper",
          quantityDelta: commitment.feeAmount,
          summary: `Paid ${commitment.feeAmount} Copper on completion of ${commitment.subjectName} delivery.`,
          affectedRefs: [playerRef, paymentPossessionRef, counterpartyRef, commitmentRef, destinationRef],
          readScope: [playerRef, paymentPossessionRef, counterpartyRef, commitmentRef, destinationRef],
          writeScope: [paymentPossessionRef],
          exposure: {
            mode: "projectable",
            predicates: [{ channel: "direct_perception", locationId: commitment.destinationLocationId }],
          },
        });
      }
      commandArguments.push({
        kind: "complete_player_commitment",
        commitmentId: commitment.commitmentId,
        performerActorId: commitment.actorId,
        counterpartyActorId: commitment.counterpartyActorId,
        deliveryPossessionId: commitment.possessionId,
        destinationHandle: commitment.destinationHandle,
        destinationLocationId: commitment.destinationLocationId,
        affectedRefs: [
          commitmentRef,
          playerRef,
          counterpartyRef,
          possessionRef,
          destinationRef,
        ],
        readScope: [
          commitmentRef,
          playerRef,
          counterpartyRef,
          possessionRef,
          destinationRef,
        ],
        writeScope: [possessionRef, commitmentRef],
        exposure: { mode: "protected" },
      });
    }
  }
  if (!isCommitment && !isObligation && ruling!.normalizedIntent.kind === "move") {
    const move = certificate as CampaignPlayCertifiedMove;
    const routeRef = { kind: "route" as const, id: move.routeId };
    const fromRef = { kind: "location" as const, id: move.fromLocationId };
    const destinationRef = { kind: "location" as const, id: move.destinationLocationId };
    commandArguments.push({
      kind: "move_actor",
      actorId: move.actorId,
      routeId: move.routeId,
      fromLocationId: move.fromLocationId,
      toLocationId: move.destinationLocationId,
      observableTrace: move.label,
      readScope: [playerRef, routeRef, fromRef, destinationRef],
      writeScope: [playerRef, fromRef, destinationRef],
      exposure: {
        mode: "projectable",
        predicates: [{ channel: "direct_perception", locationId: move.destinationLocationId }],
      },
    });
  } else if (!isCommitment && !isObligation && "decisionBinding" in certificate) {
    const decision = certificate as CampaignPlayCertifiedDecision;
    const currentLocation = current.frame.handleBindings.find((binding) =>
      binding.handle === current.admission.sourcePacket.currentLocation.handle &&
      binding.reference.kind === "location");
    if (!currentLocation) {
      throw new CampaignPlayTurnRuntimeError(
        "turn_artifact_invalid",
        "Certified decision action lost its current-location authority.",
      );
    }
    const decisionRef = { kind: "decision" as const, id: decision.decisionBinding.decisionKey };
    commandArguments.push({
      kind: "decision_resolve",
      decisionKey: decision.decisionBinding.decisionKey,
      actorId: decision.decisionActorId,
      actorHandle: decision.decisionBinding.actorHandle,
      decisionKind: decision.decisionBinding.kind,
      sourceTurnId: decision.decisionSourceTurnId,
      summary: decision.decisionSummary,
      selectedLabel: decision.decisionBinding.disposition === "accept"
        ? decision.acceptLabel
        : decision.declineLabel,
      disposition: decision.decisionBinding.disposition,
      readScope: [{ kind: "actor" as const, id: decision.decisionActorId }, decisionRef],
      writeScope: [decisionRef],
      exposure: {
        mode: "projectable",
        predicates: [{
          channel: "direct_perception",
          locationId: currentLocation.reference.id,
        }],
      },
    });
    if (decision.decisionBinding.disposition === "accept" && decision.acceptEffect) {
      const acceptEffect = decision.acceptEffect;
      if (acceptEffect.kind === "grant_player_possession") {
        const possessionKey = deriveCampaignPlayPossessionKey(acceptEffect.name);
        const possessionId = deriveCampaignPlayPossessionId(
          turn.campaignId,
          decision.actorId,
          possessionKey,
        );
        const possessionRef = { kind: "possession" as const, id: possessionId };
        commandArguments.push({
          kind: "adjust_actor_possession",
          actorId: decision.actorId,
          possessionId,
          possessionKey,
          name: acceptEffect.name,
          quantityDelta: 1,
          summary: decision.decisionSummary,
          affectedRefs: [playerRef, possessionRef],
          readScope: [playerRef, possessionRef],
          writeScope: [possessionRef],
          exposure: { mode: "protected" },
        });
      } else {
        switch (acceptEffect.kind) {
        case "paid_delivery":
        case "unpaid_delivery": {
        const commitmentId = deriveCampaignPlayCommitmentId(
          turn.campaignId,
          decision.decisionBinding.decisionKey,
        );
        const commitmentRef = { kind: "commitment" as const, id: commitmentId };
        const counterpartyRef = { kind: "actor" as const, id: decision.decisionActorId };
        const destinationBinding = current.frame.handleBindings.find((candidate) =>
          candidate.handle === acceptEffect.destinationHandle &&
          candidate.reference.kind === "location");
        if (!destinationBinding) {
          throw new CampaignPlayTurnRuntimeError(
            "turn_artifact_invalid",
            "Delivery decision lost its exact destination authority.",
          );
        }
        if (frame.worldTimeMinutes === null) {
          throw new CampaignPlayTurnRuntimeError(
            "turn_state_invalid",
            "Delivery acceptance requires a canonical world time.",
          );
        }
        const acceptedWorldTimeMinutes = frame.worldTimeMinutes +
          ruling!.elapsedBounds.maximumMinutes;
        const dueWorldTimeMinutes = acceptEffect.dueInMinutes === undefined
          ? null
          : acceptedWorldTimeMinutes + acceptEffect.dueInMinutes;
        const commitmentArguments = {
          kind: "create_player_commitment",
          commitmentId,
          sourceDecisionKey: decision.decisionBinding.decisionKey,
          sourceTurnId: decision.decisionSourceTurnId,
          performerActorId: decision.actorId,
          counterpartyActorId: decision.decisionActorId,
          commitmentKind: acceptEffect.kind,
          title: acceptEffect.title,
          subjectName: acceptEffect.subjectName,
          destinationHandle: acceptEffect.destinationHandle,
          destinationLocationId: destinationBinding.reference.id,
          acceptedWorldTimeMinutes,
          dueWorldTimeMinutes,
          affectedRefs: [
            commitmentRef,
            playerRef,
            counterpartyRef,
            decisionRef,
            destinationBinding.reference,
          ],
          readScope: [playerRef, counterpartyRef, decisionRef, destinationBinding.reference],
          writeScope: [commitmentRef],
          exposure: { mode: "protected" },
        };
        commandArguments.push(acceptEffect.kind === "paid_delivery"
          ? {
              ...commitmentArguments,
              feeUnit: "copper" as const,
              feeAmount: acceptEffect.feeAmount,
              paymentTiming: "on_completion" as const,
            }
          : commitmentArguments);
        break;
        }
        default:
          throw new CampaignPlayTurnRuntimeError(
            "turn_artifact_invalid",
            "Decision acceptance has an unsupported mechanical effect.",
          );
        }
      }
    }
  }
  const batchId = `batch:${hashCampaignPlayProjection({
    domain: "campaign_play_certified_action_batch",
    campaignId: turn.campaignId,
    turnId: turn.turnId,
    certificate,
    commandArguments,
  }).slice(0, 32)}`;
  let expectedWorldVersion = frame.worldVersion;
  const commands = commandArguments.map((argumentsValue, order) => {
    const commandId = deriveCampaignPlayCommandId(
      turn.campaignId,
      turn.turnId,
      batchId,
      order,
    );
    const command = {
      ...argumentsValue,
      commandId,
      batchId,
      order,
      causalParent: order === 0
        ? current.frame.authority.rootParent
        : {
            kind: "command" as const,
            commandId: deriveCampaignPlayCommandId(
              turn.campaignId,
              turn.turnId,
              batchId,
              order - 1,
            ),
          },
      source: isCommitment
        ? source
        : argumentsValue.kind === "create_player_commitment"
          || argumentsValue.kind === "complete_player_commitment"
          ? { kind: "system" as const, system: "game_master" as const }
          : source,
      expectedWorldVersion,
    };
    if (
      typeof argumentsValue.kind === "string" &&
      argumentsValue.kind in CAMPAIGN_PLAY_COMMAND_METADATA &&
      CAMPAIGN_PLAY_COMMAND_METADATA[
        argumentsValue.kind as keyof typeof CAMPAIGN_PLAY_COMMAND_METADATA
      ].mechanicalMutation
    ) {
      expectedWorldVersion += 1;
    }
    return command;
  });
  const batch = rulebookCommandBatchSchema.parse({
    batchId,
    baseWorldVersion: frame.worldVersion,
    commands,
  });
  return { batch, batchHash: hashCampaignPlayProjection(batch) };
}

function assertSuggestedRuling(
  admission: CampaignPlayPlayerActionAdmissionFrame,
  ruling: CampaignPlayJudgeRuling,
): void {
  if (admission.judgeInput.source !== "suggested") return;
  const binding = admission.choiceBindings.find((choice) =>
    choice.handle === admission.judgeInput.choiceHandle);
  const frozenRouteHandles = binding?.targets
    .filter((target) => target.kind === "route")
    .map((target) => target.handle) ?? [];
  const expectedMovementRouteHandle = (binding?.kind === "move" || binding?.kind === "attempt")
    && frozenRouteHandles.length === 1
    ? frozenRouteHandles[0]!
    : null;
  if (
    !binding || ruling.normalizedIntent.kind !== binding.kind ||
    ruling.movementRouteHandle !== expectedMovementRouteHandle ||
    (binding.kind === "wait" && (
      ruling.disposition !== "deterministic" ||
      ruling.elapsedBounds.minimumMinutes !== CAMPAIGN_PLAY_DEFAULT_WAIT_MINUTES ||
      ruling.elapsedBounds.maximumMinutes !== CAMPAIGN_PLAY_DEFAULT_WAIT_MINUTES
    )) ||
    !campaignPlaySuggestedTargetsAreAuthorized({
      frozenTargets: binding.targets,
      proposedTargets: ruling.normalizedIntent.targets,
      visibleFacts: admission.visibleFacts,
      playerActorHandle: admission.player.actorHandle,
    })
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_judge_invalid",
      "Campaign Play Judge reinterpreted the frozen suggested action.",
    );
  }
}

function judgeArtifact(input: {
  admission: CampaignPlayPlayerActionAdmissionFrame;
  ruling: CampaignPlayJudgeRuling;
  uncertaintySeedKey: string;
}): CampaignPlayJudgeArtifact {
  assertSuggestedRuling(input.admission, input.ruling);
  const uncertaintyAuthority = input.ruling.disposition === "uncertain"
    ? {
        seedMaterial: crypto.createHmac("sha256", input.uncertaintySeedKey)
          .update(canonicalizeCampaignPlayProjection({
            domain: "campaign_play_uncertainty_seed",
            campaignId: input.admission.campaignId,
            turnId: input.admission.turnId,
            sourcePacketHash: input.admission.sourcePacketHash,
            judgeInput: input.admission.judgeInput,
          }))
          .digest("hex"),
        modifier: 0,
      }
    : null;
  const resolution = uncertaintyAuthority === null
    ? resolveCampaignPlayUncertainty({
        ruling: input.ruling,
        seedMaterial: input.admission.turnId,
        modifier: 0,
      })
    : resolveCampaignPlayUncertainty({ ruling: input.ruling, ...uncertaintyAuthority });
  validateCampaignPlayUncertaintyResolution(input.ruling, resolution, uncertaintyAuthority);
  return campaignPlayJudgeArtifactSchema.parse({
    ruling: input.ruling,
    resolution,
    uncertaintyAuthority,
    publicResult: {
      intentKind: input.ruling.normalizedIntent.kind,
      disposition: input.ruling.disposition,
      result: resolution.result,
      clarificationQuestion: input.ruling.clarificationQuestion,
    },
    primaryPlan: input.ruling.disposition === "impossible" ||
        input.ruling.disposition === "clarification_required"
      ? { kind: "no_effect", reason: input.ruling.disposition, commands: [] }
      : { kind: "game_master_required" },
  });
}

function acceptedEvidence(
  requested: CampaignPlayRequestedModel,
  evidence: CampaignPlayModelEvidence,
): CampaignPlayModelExecutionEvidence {
  const actualProviderId = evidence.actualProviderId;
  const responseModel = evidence.responseModel;
  if (
    actualProviderId !== requested.providerId ||
    evidence.actualStrategy === null || evidence.totalAttempts !== 1 ||
    evidence.repairUsed || evidence.retryUsed || evidence.textFallbackUsed ||
    responseModel === null ||
    !campaignPlayResponseModelMatches({
      providerId: requested.providerId,
      requestedModel: requested.model,
      responseModel,
    }) || evidence.finishReason === null ||
    evidence.inputTokens === null || evidence.outputTokens === null ||
    evidence.errorCode !== null
  ) {
    throw new CampaignPlayExternalStageInterruption(interruptionEvidence({
      requested,
      evidence,
      durationMs: evidence.durationMs,
      schemaOutcome: "invalid",
      errorCode: "model_contract_invalid",
    }));
  }
  return {
    actualProviderId,
    actualModel: responseModel,
    actualStrategy: "strict_object",
    inputTokens: evidence.inputTokens,
    outputTokens: evidence.outputTokens,
    durationMs: evidence.durationMs,
    finishReason: evidence.finishReason,
  };
}

function interruptionEvidence(input: {
  requested: CampaignPlayRequestedModel;
  evidence: CampaignPlayModelEvidence | CampaignPlayNarratorModelEvidence | null;
  durationMs: number;
  errorCode: CampaignPlayExternalInterruptionEvidence["errorCode"];
  schemaOutcome: CampaignPlayExternalInterruptionEvidence["schemaOutcome"];
}): CampaignPlayExternalInterruptionEvidence {
  const hasActual = input.evidence?.actualProviderId !== null &&
    input.evidence?.actualProviderId !== undefined &&
    input.evidence?.responseModel !== null &&
    input.evidence?.responseModel !== undefined &&
    input.evidence?.actualStrategy !== null &&
    input.evidence?.actualStrategy !== undefined;
  return hasActual
    ? {
        actualProviderId: input.evidence!.actualProviderId,
        actualModel: input.evidence!.responseModel,
        actualStrategy: "strict_object",
        inputTokens: input.evidence?.inputTokens ?? null,
        outputTokens: input.evidence?.outputTokens ?? null,
        durationMs: input.durationMs,
        finishReason: input.evidence?.finishReason ?? null,
        schemaOutcome: input.schemaOutcome,
        errorCode: input.errorCode,
      }
    : {
        actualProviderId: null,
        actualModel: null,
        actualStrategy: null,
        inputTokens: input.evidence?.inputTokens ?? null,
        outputTokens: input.evidence?.outputTokens ?? null,
        durationMs: input.durationMs,
        finishReason: input.evidence?.finishReason ?? null,
        schemaOutcome: input.schemaOutcome,
        errorCode: input.errorCode,
      };
}

function judgeInterruption(
  requested: CampaignPlayRequestedModel,
  cause: unknown,
  durationMs: number,
  recoveryFeedback?: CampaignPlayJudgeRecoveryFeedback,
): CampaignPlayExternalStageInterruption {
  const evidence = cause instanceof CampaignPlayJudgeError ? cause.modelEvidence : null;
  const budget = cause instanceof CampaignPlayJudgeError && cause.code === "stage_budget_exceeded";
  const timeout = cause instanceof CampaignPlayJudgeError && cause.code === "stage_timeout";
  const contract = cause instanceof CampaignPlayJudgeError &&
    cause.code !== "transport_interrupted" && cause.code !== "stage_timeout";
  const contractFailureDiagnostic = contract && recoveryFeedback !== undefined
    ? { owner: "judge" as const, issues: recoveryFeedback.issues }
    : null;
  const interruption = interruptionEvidence({
    requested,
    evidence,
    durationMs: evidence?.durationMs ?? durationMs,
    errorCode: timeout ? "stage_timeout" : budget ? "stage_budget_exceeded"
      : contract ? "model_contract_invalid" : "provider_unavailable",
    schemaOutcome: contract ? "invalid" : "transport_error",
  });
  return new CampaignPlayExternalStageInterruption(
    contractFailureDiagnostic === null
      ? interruption
      : { ...interruption, contractFailureDiagnostic },
    "Campaign Play Judge requires explicit resume.",
    { cause },
  );
}

function gameMasterInterruption(
  requested: CampaignPlayRequestedModel,
  cause: unknown,
  durationMs: number,
): CampaignPlayExternalStageInterruption {
  const modelEvidence = cause instanceof CampaignPlayGameMasterError ? cause.modelEvidence : null;
  const budget = cause instanceof CampaignPlayGameMasterError && cause.code === "stage_budget_exceeded";
  const timeout = cause instanceof CampaignPlayGameMasterError && cause.code === "stage_timeout";
  const denied = cause instanceof CampaignPlayGameMasterError && cause.code === "rulebook_denied";
  const contract = cause instanceof CampaignPlayGameMasterError &&
    cause.code !== "transport_interrupted" && cause.code !== "stage_timeout";
  const interruption = interruptionEvidence({
    requested,
    evidence: modelEvidence,
    durationMs: modelEvidence?.durationMs ?? durationMs,
    errorCode: timeout ? "stage_timeout" : budget ? "stage_budget_exceeded"
      : denied ? "rulebook_denied"
      : contract ? "model_contract_invalid" : "provider_unavailable",
    schemaOutcome: contract ? "invalid" : "transport_error",
  });
  const contractFailureDiagnostic = contract && !denied && cause instanceof CampaignPlayGameMasterError
    ? getCampaignPlayGameMasterContractFailureDiagnostic(cause) ?? null
    : null;
  return new CampaignPlayExternalStageInterruption(
    contractFailureDiagnostic === null
      ? interruption
      : { ...interruption, contractFailureDiagnostic },
    "Campaign Play Game Master requires explicit resume.",
    { cause },
  );
}

function parseJudgeArtifact(value: unknown): CampaignPlayJudgeArtifact {
  try {
    const artifact = campaignPlayJudgeArtifactSchema.parse(value);
    validateCampaignPlayUncertaintyResolution(
      artifact.ruling,
      artifact.resolution,
      artifact.uncertaintyAuthority,
    );
    return artifact;
  } catch (cause) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_artifact_invalid",
      "Campaign Play accepted Judge artifact is invalid.",
      { cause },
    );
  }
}

function parseGameMasterArtifact(value: unknown): CampaignPlayGameMasterArtifact {
  try {
    const artifact = campaignPlayGameMasterArtifactSchema.parse(value);
    rulebookCommandBatchSchema.parse(artifact.batch);
    if (hashCampaignPlayProjection(artifact.batch) !== artifact.batchHash) {
      throw new Error("game master batch hash");
    }
    return artifact;
  } catch (cause) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_artifact_invalid",
      "Campaign Play accepted Game Master artifact is invalid.",
      { cause },
    );
  }
}

function playerActionContext(
  turn: LoadedCampaignPlayTurn,
  repository: ReturnType<typeof createCampaignPlayTurnRepository>,
): CampaignPlayActionContext {
  const admission = loadCampaignPlayPlayerActionAdmissionFrame(turn);
  if (isCertifiedRoute(admission.executionRoute) && admission.executionRoute.kind !== "certified_observe") {
    const certificateHash = admission.executionRoute.kind === "certified_move"
      ? certifiedMoveHash(admission.executionRoute.certificate)
      : admission.executionRoute.kind === "certified_wait"
        ? certifiedWaitHash(admission.executionRoute.certificate)
        : admission.executionRoute.kind === "certified_contact"
          ? certifiedContactHash(admission.executionRoute.certificate)
          : admission.executionRoute.kind === "certified_decision"
          ? certifiedDecisionHash(admission.executionRoute.certificate)
            : admission.executionRoute.kind === "certified_commitment"
              ? certifiedCommitmentHash(admission.executionRoute.certificate)
              : admission.executionRoute.kind === "certified_obligation"
                ? certifiedObligationHash(admission.executionRoute.certificate)
              : (() => {
                  throw new CampaignPlayTurnRuntimeError(
                    "turn_artifact_invalid",
                    "Campaign Play certified route has no certificate hash.",
                  );
                })();
    if (
      certificateHash !== admission.executionRoute.certificateHash ||
      repository.loadAcceptedModelArtifact(turn.turnId, "judge") !== null
    ) {
      throw new CampaignPlayTurnRuntimeError(
        "turn_artifact_invalid",
        "Campaign Play visibility rejected invalid certified route authority.",
      );
    }
    if (admission.executionRoute.kind === "certified_decision") {
      const certificate = admission.executionRoute.certificate;
      const decisionOutcome: CampaignPlayDecisionOutcome = {
        decisionKey: certificate.decisionBinding.decisionKey,
        actorHandle: certificate.decisionBinding.actorHandle,
        kind: certificate.decisionBinding.kind,
        disposition: certificate.decisionBinding.disposition,
        status: certificate.decisionBinding.disposition === "accept" ? "accepted" : "declined",
        sourceTurnId: certificate.decisionSourceTurnId,
        summary: certificate.decisionSummary,
        acceptEffect: certificate.acceptEffect ?? null,
      };
      return campaignPlayActionContextSchema.parse({
        submittedText: admission.judgeInput.originalText,
        ...certificate.publicResult,
        decisionBinding: certificate.decisionBinding,
        decisionOutcome,
      });
    }
    if (admission.executionRoute.kind === "certified_commitment") {
      const certificate = admission.executionRoute.certificate;
      return campaignPlayActionContextSchema.parse({
        submittedText: admission.judgeInput.originalText,
        intentKind: certificate.action === "collect" ? "contact" : "attempt",
        disposition: "deterministic",
        result: "success",
        clarificationQuestion: null,
      });
    }
    if (admission.executionRoute.kind === "certified_obligation") {
      const certificate = admission.executionRoute.certificate;
      return campaignPlayActionContextSchema.parse({
        submittedText: admission.judgeInput.originalText,
        intentKind: "contact",
        disposition: "deterministic",
        result: "success",
        clarificationQuestion: null,
        obligationSettlement: {
          obligationHandle: certificate.obligationHandle,
          debtorHandle: certificate.debtorActorHandle,
          creditorHandle: certificate.creditorActorHandle,
          unitKey: certificate.unitKey,
          amount: certificate.amount,
          status: "settled",
          sourceTurnId: certificate.turnId,
          summary: certificate.label,
        },
      });
    }
    const certificate = admission.executionRoute.certificate;
    return campaignPlayActionContextSchema.parse({
      submittedText: admission.judgeInput.originalText,
      ...certificate.publicResult,
    });
  }
  const storedJudge = repository.loadAcceptedModelArtifact(turn.turnId, "judge");
  if (!storedJudge) {
    if (turn.mutationAudit.kind === "control_budget_continuity") {
      const binding = admission.judgeInput.choiceHandle === null
        ? null
        : admission.choiceBindings.find((choice) =>
          choice.handle === admission.judgeInput.choiceHandle);
      return campaignPlayActionContextSchema.parse({
        submittedText: admission.judgeInput.originalText,
        intentKind: binding?.kind ?? "attempt",
        disposition: "uncertain",
        result: "no_effect",
        clarificationQuestion: null,
      });
    }
    throw new CampaignPlayTurnRuntimeError(
      "turn_artifact_invalid",
      "Campaign Play visibility requires the accepted Judge artifact.",
    );
  }
  const judgeArtifactValue = parseJudgeArtifact(storedJudge.artifact);
  return campaignPlayActionContextSchema.parse({
    submittedText: admission.judgeInput.originalText,
    ...judgeArtifactValue.publicResult,
  });
}

function pendingPlayerNarration(
  handle: CampaignPlayDatabaseHandle,
  turn: LoadedCampaignPlayTurn,
  repository: ReturnType<typeof createCampaignPlayTurnRepository>,
): PendingNarrationRow & { packet: CampaignPlayNarratorPacket } {
  const row = handle.sqlite.prepare(`SELECT narration_id AS narrationId,
      packet_hash AS packetHash, packet_json AS packetJson, status,
      created_at AS createdAt
    FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`).get(
      handle.campaignId,
      turn.turnId,
    ) as PendingNarrationRow | undefined;
  if (
    !row || row.status !== "pending" || row.packetHash !== turn.publicPacketHash
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_artifact_invalid",
      "Campaign Play player action lacks its exact pending narration packet.",
    );
  }
  let packet: CampaignPlayNarratorPacket;
  try {
    const parsed = JSON.parse(row.packetJson) as unknown;
    packet = campaignPlayNarratorPacketSchema.parse(parsed);
    if (
      canonicalizeCampaignPlayProjection(packet) !== row.packetJson ||
      packet.turnId !== turn.turnId || packet.turnKind !== "player_action" ||
      canonicalizeCampaignPlayProjection(packet.actionContext) !==
        canonicalizeCampaignPlayProjection(playerActionContext(turn, repository)) ||
      hashCampaignPlayNarratorPacket(
        turn.turnId,
        parsed as CampaignPlayProjectionRecord,
      ) !== row.packetHash
    ) {
      throw new Error("player narration packet identity");
    }
  } catch (cause) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_artifact_invalid",
      "Campaign Play player-action narrator packet failed its durable identity check.",
      { cause },
    );
  }
  return { ...row, packet };
}

function acceptedNarratorEvidence(
  requested: CampaignPlayRequestedModel,
  evidence: CampaignPlayNarratorModelEvidence,
): CampaignPlayModelExecutionEvidence {
  const actualProviderId = evidence.actualProviderId;
  const responseModel = evidence.responseModel;
  if (
    actualProviderId !== requested.providerId ||
    evidence.actualStrategy === null || evidence.totalAttempts !== 1 ||
    evidence.repairUsed || evidence.retryUsed || evidence.textFallbackUsed ||
    responseModel === null ||
    !campaignPlayResponseModelMatches({
      providerId: requested.providerId,
      requestedModel: requested.model,
      responseModel,
    }) || evidence.finishReason === null ||
    evidence.inputTokens === null || evidence.outputTokens === null ||
    evidence.errorCode !== null
  ) {
    throw new CampaignPlayExternalStageInterruption(
      interruptionEvidence({
        requested,
        evidence,
        durationMs: evidence.durationMs,
        errorCode: "model_contract_invalid",
        schemaOutcome: "invalid",
      }),
      "Campaign Play narrator evidence disagrees with its frozen execution contract.",
    );
  }
  return {
    actualProviderId,
    actualModel: responseModel,
    actualStrategy: "strict_object",
    inputTokens: evidence.inputTokens,
    outputTokens: evidence.outputTokens,
    durationMs: evidence.durationMs,
    finishReason: evidence.finishReason,
  };
}

function narratorInterruption(
  requested: CampaignPlayRequestedModel,
  cause: unknown,
  durationMs: number,
): CampaignPlayExternalStageInterruption {
  const evidence = cause instanceof CampaignPlayNarratorError ? cause.modelEvidence : null;
  const timeout = cause instanceof CampaignPlayNarratorError && cause.code === "stage_timeout";
  const budget = cause instanceof CampaignPlayNarratorError &&
    cause.code === "stage_budget_exceeded";
  const contract = cause instanceof CampaignPlayNarratorError &&
    cause.code !== "transport_interrupted" && cause.code !== "stage_timeout" &&
    cause.code !== "stage_budget_exceeded";
  return new CampaignPlayExternalStageInterruption(
    interruptionEvidence({
      requested,
      evidence,
      durationMs: evidence?.durationMs ?? durationMs,
      errorCode: timeout ? "stage_timeout" : budget ? "stage_budget_exceeded"
        : contract ? "narration_invalid" : "provider_unavailable",
      schemaOutcome: contract ? "invalid" : "transport_error",
    }),
    "Campaign Play narrator requires explicit resume.",
    { cause },
  );
}

export function createCampaignPlayTurnRuntime(
  input: CreateCampaignPlayTurnRuntimeInput,
): CampaignPlayTurnRuntime {
  assertRuntimeModel(input.judgeModel);
  assertRuntimeModel(input.gameMasterModel);
  if (input.certifiedGameMasterModel) assertRuntimeModel(input.certifiedGameMasterModel);
  assertRuntimeModel(input.actorReplannerModel);
  assertRuntimeModel(input.narratorModel);
  if (
    input.uncertaintySeedKey.length < 32 || input.uncertaintySeedKey.length > 512 ||
    input.uncertaintySeedKey !== input.uncertaintySeedKey.trim()
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_state_invalid",
      "Campaign Play uncertainty seed key is invalid.",
    );
  }
  const repository = createCampaignPlayTurnRepository(input.handle);
  const now = (): number => {
    const value = input.clock?.now() ?? Date.now();
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new CampaignPlayTurnRuntimeError(
        "turn_state_invalid",
        "Campaign Play player-action clock returned an invalid timestamp.",
      );
    }
    return value;
  };
  const waitForHeartbeat = async (delayMs: number, signal: AbortSignal): Promise<void> => {
    if (input.clock) {
      await input.clock.wait(delayMs, signal);
      return;
    }
    await waitForTimer(delayMs, undefined, { signal });
  };
  const judge = input.judge ?? createCampaignPlayJudge();
  const gameMaster = input.gameMaster ?? createCampaignPlayGameMaster();
  const actorScheduler = input.actorScheduler ?? createCampaignPlayActorScheduler(input.handle);
  const actorProposalService = input.actorProposalService ??
    createCampaignPlayActorProposalService(input.handle, { now });
  const actorReplanner = input.actorReplanner ?? createCampaignPlayActorReplanner(input.handle);
  const narrator = input.narrator ?? createCampaignPlayNarrator();
  const visibility = input.visibility ?? createCampaignPlayVisibilityService(input.handle);
  const narrationOperations = createCampaignPlayNarrationOperationRepository(input.handle);
  const frozenSelection = selection(input);
  const externalOperationDeadlineMs = input.externalOperationDeadlineMs ?? 90_000;
  const gameMasterOperationDeadlineMs = input.gameMasterOperationDeadlineMs
    ?? externalOperationDeadlineMs;
  const actorReplannerOperationDeadlineMs = input.actorReplannerOperationDeadlineMs ?? 90_000;
  const actorCriticalPathReplanLimit = input.actorCriticalPathReplanLimit ?? 1;
  const certifiedGameMasterModel = input.certifiedGameMasterModel ?? input.gameMasterModel;
  if (!Number.isSafeInteger(externalOperationDeadlineMs) || externalOperationDeadlineMs <= 0) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_state_invalid",
      "Campaign Play player-action provider deadline is invalid.",
    );
  }
  if (
    !Number.isSafeInteger(gameMasterOperationDeadlineMs) ||
    gameMasterOperationDeadlineMs <= 0
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_state_invalid",
      "Campaign Play Game Master provider deadline is invalid.",
    );
  }
  if (
    !Number.isSafeInteger(actorReplannerOperationDeadlineMs) ||
    actorReplannerOperationDeadlineMs <= 0
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_state_invalid",
      "Campaign Play Actor Replanner provider deadline is invalid.",
    );
  }
  if (!Number.isSafeInteger(actorCriticalPathReplanLimit) || actorCriticalPathReplanLimit < 0) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_state_invalid",
      "Campaign Play actor critical-path replan limit is invalid.",
    );
  }

  const terminalActorReplanCount = (turnId: string): number =>
    (input.handle.sqlite.prepare(`SELECT count(DISTINCT stage_id) AS count
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ?
        AND kind = 'actor_replanner'
        AND status IN ('accepted', 'interrupted', 'failed')`).get(
          input.handle.campaignId,
          turnId,
        ) as { count: number }).count;

  const modelForExternalAttempt = (
    _turnId: string,
    _kind: "judge" | "game_master",
    _attempt: number,
    model: CampaignPlayTurnRuntimeStageModel,
  ): LanguageModel => model.languageModel;

  const modelForJudgeAttempt = (
    turnId: string,
    attempt: number,
    model: CampaignPlayTurnRuntimeStageModel,
    recoveryFeedback: CampaignPlayJudgeRecoveryFeedback | undefined,
  ): LanguageModel => {
    if (attempt > 1 && recoveryFeedback !== undefined) return model.languageModel;
    return modelForExternalAttempt(turnId, "judge", attempt, model);
  };

  const modelForGameMasterAttempt = (
    turnId: string,
    attempt: number,
    model: CampaignPlayTurnRuntimeStageModel,
    recoveryFeedback: CampaignPlayGameMasterRecoveryFeedback | undefined,
  ): LanguageModel => {
    if (attempt > 1 && recoveryFeedback !== undefined) return model.languageModel;
    return modelForExternalAttempt(turnId, "game_master", attempt, model);
  };

  const structuredOutputModeForExternalAttempt = (
    turnId: string,
    kind: "judge" | "game_master",
    attempt: number,
  ): "auto" | "tool" => {
    if (attempt <= 1) return "auto";
    if (kind === "judge") {
      return "auto";
    }
    const previous = input.handle.sqlite.prepare(`SELECT error_code AS errorCode
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = ? AND attempt = ?`).get(
        input.handle.campaignId,
        turnId,
        kind,
        attempt - 1,
      ) as { errorCode: string | null } | undefined;
    return previous?.errorCode === "model_contract_invalid" || previous?.errorCode === "stage_timeout"
      ? "auto"
      : "tool";
  };

  const releaseActorBoundary = (
    token: CampaignPlayWorkerLeaseToken,
    jobId: string,
    outcome: string,
  ): void => {
    const observedAt = now();
    const durableTurn = repository.loadTurn(token.turnId);
    const committedAt = Math.max(observedAt, durableTurn?.updatedAt ?? observedAt);
    if (outcome === "interrupted") {
      const turn = repository.loadTurn(token.turnId);
      const job = actorScheduler.listTurnJobs(token.turnId).find((candidate) =>
        candidate.jobId === jobId);
      if (
        turn?.stage === "primary_settled" && turn.workerLeaseOwner === token.owner &&
        turn.workerEpoch === token.epoch && turn.workerLeaseExpiresAt === token.expiresAt &&
        committedAt >= token.expiresAt && job?.stage === "claimed"
      ) {
        actorReplanner.interruptExpired({
          jobId,
          observedWorkerEpoch: job.workerEpoch,
          observedTurnWorkerEpoch: token.epoch,
          observedTurnOwner: token.owner,
          observedTurnLeaseExpiresAt: token.expiresAt,
          observedAt: committedAt,
        });
      }
      return;
    }
    repository.commitDeterministic({
      token,
      transition: "actor_job_transitioned",
      worldVersionAdvance: 0,
      committedAt,
      mutationId: runtimeId("actor-boundary-released", {
        turnId: token.turnId,
        epoch: token.epoch,
        jobId,
        outcome,
      }),
    });
  };

  const interruptExpiredActorReplanner = (): void => {
    const observedAt = now();
    const expired = input.handle.sqlite.prepare(`SELECT
        job.job_id AS jobId, job.worker_epoch AS workerEpoch,
        turn.id AS turnId, turn.worker_epoch AS turnWorkerEpoch,
        turn.worker_lease_owner AS turnOwner,
        turn.worker_lease_expires_at AS turnLeaseExpiresAt
      FROM campaign_play_actor_jobs job
      JOIN campaign_play_turns turn
        ON turn.id = job.turn_id AND turn.campaign_id = job.campaign_id
      JOIN campaign_play_model_stages model
        ON model.campaign_id = job.campaign_id AND model.turn_id = job.turn_id
        AND model.kind = 'actor_replanner' AND model.status = 'started'
      LEFT JOIN campaign_play_actor_replan_attempts attempt
        ON attempt.model_stage_row_id = model.id AND attempt.job_id = job.job_id
      WHERE job.campaign_id = ? AND job.stage = 'claimed'
        AND (model.worker_epoch = job.worker_epoch OR (
          attempt.attempt_number IN (1, 2, 3)
          AND attempt.actor_job_worker_epoch = job.worker_epoch
          AND attempt.claim_turn_worker_epoch = job.claim_turn_worker_epoch
        ))
        AND turn.stage = 'primary_settled'
        AND turn.worker_lease_owner IS NOT NULL
        AND turn.worker_lease_expires_at IS NOT NULL
        AND turn.worker_lease_expires_at <= ?
      ORDER BY turn.worker_lease_expires_at, job.created_at, job.job_id
      LIMIT 1`).get(input.handle.campaignId, observedAt) as {
        jobId: string;
        workerEpoch: number;
        turnId: string;
        turnWorkerEpoch: number;
        turnOwner: string;
        turnLeaseExpiresAt: number;
      } | undefined;
    if (!expired) return;
    actorReplanner.interruptExpired({
      jobId: expired.jobId,
      observedWorkerEpoch: expired.workerEpoch,
      observedTurnWorkerEpoch: expired.turnWorkerEpoch,
      observedTurnOwner: expired.turnOwner,
      observedTurnLeaseExpiresAt: expired.turnLeaseExpiresAt,
      observedAt,
    });
  };

  const claimNarration = (turnId: string): CampaignPlayNarrationAttemptToken | null => {
    const claimedAt = now();
    const leaseExpiresAt = claimedAt + input.leaseDurationMs;
    if (!Number.isSafeInteger(leaseExpiresAt)) {
      throw new CampaignPlayTurnRuntimeError(
        "turn_state_invalid",
        "Campaign Play narration lease exceeds the timestamp range.",
      );
    }
    return narrationOperations.claim({
      turnId,
      owner: input.owner,
      requested: input.narratorModel.requested,
      claimedAt,
      leaseExpiresAt,
    });
  };

  const executeNarration = async (
    initialToken: CampaignPlayNarrationAttemptToken,
    recoveryFeedback?: CampaignPlayNarratorRecoveryFeedback,
    structuredOutputMode: "auto" | "tool" = "tool",
  ): Promise<CampaignPlayNarrationExecution> => {
    let token = initialToken;
    let providerReturned = false;
    let heartbeatStopped = false;
    let deadlineTriggered = false;
    const controller = new AbortController();
    const deadlineTimerController = new AbortController();
    const heartbeat = (async () => {
      while (!heartbeatStopped) {
        try {
          await waitForHeartbeat(input.heartbeatIntervalMs, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) return;
          throw error;
        }
        if (heartbeatStopped) return;
        const renewedAt = now();
        const leaseExpiresAt = renewedAt + input.leaseDurationMs;
        if (!Number.isSafeInteger(leaseExpiresAt)) {
          throw new CampaignPlayTurnRuntimeError(
            "turn_state_invalid",
            "Campaign Play narration lease renewal exceeds the timestamp range.",
          );
        }
        token = narrationOperations.renew(token, renewedAt, leaseExpiresAt);
      }
    })();
    const heartbeatFailure = new Promise<never>((_resolve, reject) => {
      void heartbeat.catch(reject);
    });
    const startedAt = now();
    const remainingDeadlineMs = initialToken.deadlineAt - startedAt;
    const deadlineFailure = new Promise<never>((_resolve, reject) => {
      const trigger = () => {
        if (deadlineTimerController.signal.aborted) return;
        deadlineTriggered = true;
        controller.abort();
        reject(new CampaignPlayNarratorError("stage_timeout", null));
      };
      if (remainingDeadlineMs <= 0) {
        trigger();
        return;
      }
      void waitForHeartbeat(remainingDeadlineMs, deadlineTimerController.signal).then(
        trigger,
        (error) => {
          if (!deadlineTimerController.signal.aborted) reject(error);
        },
      );
    });
    void deadlineFailure.catch(() => undefined);
    try {
      const turn = repository.loadTurn(token.turnId);
      if (!turn || turn.stage !== "completed" || turn.turnKind !== "player_action") {
        throw new CampaignPlayTurnRuntimeError(
          "turn_state_invalid",
          "Campaign Play narration operation requires its committed player result.",
        );
      }
      const pending = pendingPlayerNarration(input.handle, turn, repository);
      if (
        pending.narrationId !== token.narrationId || pending.packetHash !== token.packetHash ||
        pending.packetJson !== token.packetJson
      ) {
        throw new CampaignPlayTurnRuntimeError(
          "turn_artifact_invalid",
          "Campaign Play narration operation disagrees with its immutable visible packet.",
        );
      }
      if (now() >= token.deadlineAt) {
        deadlineTriggered = true;
        throw new CampaignPlayNarratorError("stage_timeout", null);
      }
      const request = narrator.narrate({
        narrationId: token.narrationId,
        packetBytes: token.packetJson,
        createdAt: token.createdAt,
        model: input.narratorModel.languageModel,
        temperature: input.narratorModel.temperature,
        budget: modelBudget(input.narratorModel),
        structuredOutputMode,
        ...(recoveryFeedback === undefined
          ? initialToken.recoveryFeedback === undefined
            ? {}
            : { recoveryFeedback: initialToken.recoveryFeedback }
          : { recoveryFeedback }),
        signal: controller.signal,
      });
      void request.catch(() => undefined);
      const candidate = await Promise.race([request, heartbeatFailure, deadlineFailure]);
      validateNarrationAgainstPacket(candidate.narration, pending.packet);
      const evidence = acceptedNarratorEvidence(
        input.narratorModel.requested,
        candidate.modelEvidence,
      );
      providerReturned = true;
      input.injectNarratorFault?.("after_provider_return");
      const acceptedAt = now();
      if (acceptedAt >= token.deadlineAt) {
        deadlineTriggered = true;
        controller.abort();
        throw new CampaignPlayNarratorError("stage_timeout", null);
      }
      input.injectNarratorFault?.("during_terminal_commit");
      return narrationOperations.accept({
        token,
        narration: candidate.narration,
        evidence,
        acceptedAt,
      });
    } catch (cause) {
      const deadlineExpired = deadlineTriggered || now() >= token.deadlineAt;
      if (providerReturned && !deadlineExpired) throw cause;
      const interruption = cause instanceof CampaignPlayExternalStageInterruption
        ? cause
        : narratorInterruption(
          input.narratorModel.requested,
          deadlineExpired
            ? new CampaignPlayNarratorError("stage_timeout", null, { cause })
            : cause,
          Math.max(0, now() - startedAt),
        );
      const failedOperation = narrationOperations.failAttempt({
        token,
        evidence: interruption.evidence,
        failedAt: now(),
        recoveryFeedback: !deadlineExpired &&
            cause instanceof CampaignPlayNarratorError &&
            (cause.code === "narration_invalid" || cause.code === "model_contract_failed")
          ? cause.recoveryFeedback
          : null,
      });
      return failedOperation;
    } finally {
      heartbeatStopped = true;
      controller.abort();
      deadlineTimerController.abort();
      await heartbeat.catch(() => undefined);
    }
  };

  const service: CampaignPlayTurnService = createCampaignPlayTurnService({
    handle: input.handle,
    owner: input.owner,
    leaseDurationMs: input.leaseDurationMs,
    heartbeatIntervalMs: input.heartbeatIntervalMs,
    externalOperationDeadlineMs,
    clock: input.clock,
    resolveStage({ turn, stage, artifacts }) {
      if (turn.turnKind !== "player_action") return null;
      if (stage === "admitted") {
        const admitted = loadCampaignPlayPlayerActionAdmissionFrame(turn);
        const executionRoute = admitted.executionRoute;
        if (usesCodeOwnedCertifiedPlan(executionRoute)) {
          return {
            kind: "deterministic",
            ready: () => artifacts.load("judge") === null && artifacts.load("game_master") === null,
            execute(context) {
              let deterministicCommitStarted = false;
              try {
                revalidateCertifiedRoute(input.handle, context.turn);
                if (
                  context.artifacts.load("judge") !== null ||
                  context.artifacts.load("game_master") !== null
                ) {
                  throw new CampaignPlayTurnRuntimeError(
                    "turn_artifact_invalid",
                    "Campaign Play certified planning cannot retain model authority.",
                  );
                }
                deterministicCommitStarted = true;
                repository.commitDeterministic({
                  token: context.token,
                  transition: "certified_planned",
                  worldVersionAdvance: 0,
                  committedAt: now(),
                  mutationId: runtimeId("certified-action-planned", {
                    turnId: context.turn.turnId,
                    epoch: context.token.epoch,
                    routeKind: executionRoute.kind,
                    certificateHash: executionRoute.certificateHash,
                  }),
                });
              } catch (cause) {
                if (deterministicCommitStarted || cause instanceof CampaignPlayTurnRepositoryError) {
                  throw cause;
                }
                repository.failTurn({
                  token: context.token,
                  errorCode: "stale_artifact",
                  publicErrorCode: "turn_failed",
                  mutationAudit: {
                    stage: "admitted",
                    routeKind: executionRoute.kind,
                    cause: cause instanceof CampaignPlayTurnRuntimeError
                      ? cause.code
                      : "invalid_certificate",
                  },
                  modelEvidence: null,
                  failedAt: now(),
                  mutationId: runtimeId("certified-action-planning-failed", {
                    turnId: context.turn.turnId,
                    epoch: context.token.epoch,
                  }),
                });
              }
            },
          };
        }
        return {
          kind: "external",
          externalOperationDeadlineMs: executionRoute.kind === "certified_contact"
            ? gameMasterOperationDeadlineMs
            : externalOperationDeadlineMs,
          async execute(context) {
            const startedAt = now();
            let routeKind: CampaignPlayPlayerActionAdmissionFrame["executionRoute"]["kind"] =
              "full_authority";
            try {
              const admission = loadCampaignPlayPlayerActionAdmissionFrame(context.turn);
              if (admission.executionRoute.kind === "certified_observe") {
                revalidateCertifiedRoute(input.handle, context.turn);
              }
              routeKind = admission.executionRoute.kind;
              const current = currentGameMasterFrame(input.handle, context.turn);
              if (admission.executionRoute.kind === "certified_contact") {
                const certificate = revalidateCertifiedRoute(input.handle, context.turn) as CampaignPlayCertifiedContact;
                const candidate = await gameMaster.plan({
                  frame: current.frame,
                  ruling: certificate.ruling,
                  resolution: certificate.resolution,
                  uncertaintyAuthority: null,
                  model: modelForGameMasterAttempt(
                    context.turn.turnId,
                    context.attempt,
                    certifiedGameMasterModel,
                    input.gameMasterRecoveryFeedback,
                  ),
                  structuredOutputMode: structuredOutputModeForExternalAttempt(
                    context.turn.turnId,
                    "game_master",
                    context.attempt,
                  ),
                  temperature: certifiedGameMasterModel.temperature,
                  budget: modelBudget(certifiedGameMasterModel),
                  contract: "certified_contact",
                  signal: context.signal,
                  ...(input.gameMasterRecoveryFeedback === undefined || context.attempt <= 1
                    ? {}
                    : { recoveryFeedback: input.gameMasterRecoveryFeedback }),
                });
                const artifact = campaignPlayGameMasterArtifactSchema.parse({
                  certifiedContactHash: admission.executionRoute.certificateHash,
                  batch: candidate.batch,
                  batchHash: candidate.batchHash,
                  semanticReview: candidate.semanticReview,
                });
                if (hashCampaignPlayProjection(artifact.batch) !== artifact.batchHash) {
                  throw new CampaignPlayTurnRuntimeError(
                    "turn_game_master_invalid",
                    "Campaign Play Game Master candidate has an invalid batch hash.",
                  );
                }
                const evidence = acceptedEvidence(
                  certifiedGameMasterModel.requested,
                  candidate.modelEvidence,
                );
                return {
                  commit({ token, completedAt }) {
                    try {
                      repository.acceptModelArtifact({
                        token,
                        artifact,
                        evidence,
                        mutationDomain: "runtime",
                        acceptedAt: completedAt,
                        mutationId: runtimeId("game-master-accepted", {
                          turnId: token.turnId,
                          epoch: token.epoch,
                        }),
                      });
                    } catch (cause) {
                      if (cause instanceof CampaignPlayTurnRepositoryError) throw cause;
                      throw new CampaignPlayExternalStageInterruption(
                        interruptionEvidence({
                          requested: certifiedGameMasterModel.requested,
                          evidence: candidate.modelEvidence,
                          durationMs: candidate.modelEvidence.durationMs,
                          errorCode: "persistence_failed",
                          schemaOutcome: "transport_error",
                        }),
                        "Campaign Play Game Master artifact persistence requires explicit resume.",
                        { cause },
                      );
                    }
                    return undefined;
                  },
                };
              }
              const frozenChoice = admission.judgeInput.source === "suggested"
                ? admission.choiceBindings.find((choice) =>
                    choice.handle === admission.judgeInput.choiceHandle)
                : null;
              if (admission.judgeInput.source === "suggested" && !frozenChoice) {
                throw new CampaignPlayTurnRuntimeError(
                  "turn_artifact_invalid",
                  "Campaign Play suggested action lost its frozen binding.",
                );
              }
              const judgeVisibleRoutes = admission.sourcePacket.visibleRoutes.map((route) => {
                const routeBinding = admission.handleBindings.find((binding) =>
                  binding.handle === route.handle && binding.reference.kind === "route");
                const canonicalRoute = routeBinding === undefined
                  ? undefined
                  : current.frame.rulebookFrame.runtimeRoutes.find((candidate) =>
                      candidate.id === routeBinding.reference.id)
                    ?? current.frame.rulebookFrame.acceptedWorld.routes.find((candidate) =>
                      candidate.id === routeBinding.reference.id);
                if (canonicalRoute === undefined) {
                  throw new CampaignPlayTurnRuntimeError(
                    "turn_artifact_invalid",
                    "Campaign Play visible route lost its canonical travel cost.",
                  );
                }
                return {
                  handle: route.handle,
                  destinationHandle: route.destinationHandle,
                  travelCost: canonicalRoute.travelCost,
                  state: route.state,
                };
              });
              const result = await judge.judge({
                frame: campaignPlayJudgeFrameSchema.parse({
                  campaignId: admission.campaignId,
                  turnId: admission.turnId,
                  playerActorHandle: admission.player.actorHandle,
                  locationHandle: admission.sourcePacket.currentLocation.handle,
                  visibleRoutes: judgeVisibleRoutes,
                  worldTimeMinutes: admission.worldTimeMinutes,
                  sourceMoment: admission.sourceMoment.displayText,
                  playerProfile: admission.player.profile,
                  visibleFacts: admission.visibleFacts,
                  depletedPlayerPossessions: current.frame.rulebookFrame.possessions
                    .filter((possession) =>
                      possession.actorId === admission.player.actorId
                      && possession.quantity === 0)
                    .map((possession) => possession.name),
                  actorContinuity: current.frame.actorContinuity,
                }),
                input: {
                  ...admission.judgeInput,
                  frozenChoice: frozenChoice
                    ? { kind: frozenChoice.kind, targets: frozenChoice.targets }
                    : null,
                  ...(current.frame.commitmentAuthority === undefined
                    ? {}
                    : current.frame.commitmentAuthority.commitmentKind === "paid_delivery"
                      ? {
                          commitmentFeeAmount: current.frame.commitmentAuthority.feeAmount,
                          commitmentPossessionHandle:
                            current.frame.commitmentAuthority.possessionHandle,
                        }
                      : {
                          commitmentPossessionHandle:
                            current.frame.commitmentAuthority.possessionHandle,
                        }),
                },
                model: modelForJudgeAttempt(
                  context.turn.turnId,
                  context.attempt,
                  input.judgeModel,
                  input.judgeRecoveryFeedback,
                ),
                temperature: input.judgeModel.temperature,
                budget: modelBudget(input.judgeModel),
                structuredOutputMode: structuredOutputModeForExternalAttempt(
                  context.turn.turnId,
                  "judge",
                  context.attempt,
                ),
                attempt: context.attempt,
                workerEpoch: context.token.epoch,
                signal: context.signal,
                ...(input.judgeRecoveryFeedback === undefined || context.attempt <= 1
                  ? {}
                  : { recoveryFeedback: input.judgeRecoveryFeedback }),
              });
              const artifact = judgeArtifact({
                admission,
                ruling: result.ruling,
                uncertaintySeedKey: input.uncertaintySeedKey,
              });
              if (
                routeKind === "certified_observe" &&
                artifact.primaryPlan.kind !== "game_master_required"
              ) {
                throw new CampaignPlayTurnRuntimeError(
                  "turn_artifact_invalid",
                  "Campaign Play certified observe Judge result must require Game Master planning.",
                );
              }
              const evidence = acceptedEvidence(input.judgeModel.requested, result.modelEvidence);
              return {
                commit({ token, completedAt }) {
                  try {
                    repository.acceptModelArtifact({
                      token,
                      artifact,
                      evidence,
                      mutationDomain: "runtime",
                      acceptedAt: completedAt,
                      mutationId: runtimeId("judge-accepted", {
                        turnId: token.turnId,
                        epoch: token.epoch,
                      }),
                    });
                  } catch (cause) {
                    if (cause instanceof CampaignPlayTurnRepositoryError) throw cause;
                    throw new CampaignPlayExternalStageInterruption(
                      interruptionEvidence({
                        requested: input.judgeModel.requested,
                        evidence: result.modelEvidence,
                        durationMs: result.modelEvidence.durationMs,
                        errorCode: "persistence_failed",
                        schemaOutcome: "transport_error",
                      }),
                      "Campaign Play Judge artifact persistence requires explicit resume.",
                      { cause },
                    );
                  }
                  return undefined;
                },
              };
            } catch (cause) {
              if (cause instanceof CampaignPlayExternalStageInterruption) throw cause;
              if (routeKind === "certified_contact") {
                const gameMasterRecoveryFeedback = getCampaignPlayGameMasterRecoveryFeedback(cause);
                if (gameMasterRecoveryFeedback !== undefined) {
                  input.onGameMasterRecoveryFeedback?.(gameMasterRecoveryFeedback);
                }
                throw gameMasterInterruption(
                  certifiedGameMasterModel.requested,
                  cause,
                  now() - startedAt,
                );
              }
              const recoveryFeedback = getCampaignPlayJudgeRecoveryFeedback(cause);
              if (recoveryFeedback !== undefined) {
                input.onJudgeRecoveryFeedback?.(recoveryFeedback);
              }
              log.warn("Judge stage failed before artifact acceptance.", {
                code: cause instanceof CampaignPlayJudgeError ? cause.code : null,
                stack: cause instanceof Error ? cause.stack : String(cause),
              });
              throw judgeInterruption(
                input.judgeModel.requested,
                cause,
                now() - startedAt,
                recoveryFeedback,
              );
            }
          },
        };
      }
      if (stage === "judged") {
        return {
          kind: "external",
          externalOperationDeadlineMs: gameMasterOperationDeadlineMs,
          async execute(context) {
            const startedAt = now();
            try {
              const storedJudge = context.turn.turnId
                ? repository.loadAcceptedModelArtifact(context.turn.turnId, "judge")
                : null;
              if (!storedJudge) {
                throw new CampaignPlayTurnRuntimeError(
                  "turn_artifact_invalid",
                  "Campaign Play Game Master requires the accepted Judge artifact.",
                );
              }
              const judgeArtifactValue = parseJudgeArtifact(storedJudge.artifact);
              if (judgeArtifactValue.primaryPlan.kind !== "game_master_required") {
                throw new CampaignPlayTurnRuntimeError(
                  "turn_game_master_invalid",
                  "Campaign Play no-effect judgment cannot invoke the Game Master.",
                );
              }
              const current = currentGameMasterFrame(input.handle, context.turn);
              const candidate = await gameMaster.plan({
                frame: current.frame,
                ruling: judgeArtifactValue.ruling,
                resolution: judgeArtifactValue.resolution,
                uncertaintyAuthority: judgeArtifactValue.uncertaintyAuthority,
                model: modelForGameMasterAttempt(
                  context.turn.turnId,
                  context.attempt,
                  input.gameMasterModel,
                  input.gameMasterRecoveryFeedback,
                ),
                structuredOutputMode: structuredOutputModeForExternalAttempt(
                  context.turn.turnId,
                  "game_master",
                  context.attempt,
                ),
                temperature: input.gameMasterModel.temperature,
                budget: modelBudget(input.gameMasterModel),
                signal: context.signal,
                ...(input.gameMasterRecoveryFeedback === undefined || context.attempt <= 1
                  ? {}
                  : { recoveryFeedback: input.gameMasterRecoveryFeedback }),
              });
              const artifact = campaignPlayGameMasterArtifactSchema.parse({
                judgeArtifactHash: storedJudge.artifactHash,
                batch: candidate.batch,
                batchHash: candidate.batchHash,
                semanticReview: candidate.semanticReview,
              });
              if (hashCampaignPlayProjection(artifact.batch) !== artifact.batchHash) {
                throw new CampaignPlayTurnRuntimeError(
                  "turn_game_master_invalid",
                  "Campaign Play Game Master candidate has an invalid batch hash.",
                );
              }
              const evidence = acceptedEvidence(
                input.gameMasterModel.requested,
                candidate.modelEvidence,
              );
              return {
                commit({ token, completedAt }) {
                  try {
                    repository.acceptModelArtifact({
                      token,
                      artifact,
                      evidence,
                      mutationDomain: "runtime",
                      acceptedAt: completedAt,
                      mutationId: runtimeId("game-master-accepted", {
                        turnId: token.turnId,
                        epoch: token.epoch,
                      }),
                    });
                  } catch (cause) {
                    if (cause instanceof CampaignPlayTurnRepositoryError) throw cause;
                    throw new CampaignPlayExternalStageInterruption(
                      interruptionEvidence({
                        requested: input.gameMasterModel.requested,
                        evidence: candidate.modelEvidence,
                        durationMs: candidate.modelEvidence.durationMs,
                        errorCode: "persistence_failed",
                        schemaOutcome: "transport_error",
                      }),
                      "Campaign Play Game Master artifact persistence requires explicit resume.",
                      { cause },
                    );
                  }
                  return undefined;
                },
              };
            } catch (cause) {
              if (cause instanceof CampaignPlayExternalStageInterruption) throw cause;
              const gameMasterRecoveryFeedback = getCampaignPlayGameMasterRecoveryFeedback(cause);
              if (gameMasterRecoveryFeedback !== undefined) {
                input.onGameMasterRecoveryFeedback?.(gameMasterRecoveryFeedback);
              }
              throw gameMasterInterruption(
                input.gameMasterModel.requested,
                cause,
                now() - startedAt,
              );
            }
          },
        };
      }
      if (stage === "planned") {
        return {
          kind: "deterministic",
          ready: ({ turn: currentTurn }) => {
            const admission = loadCampaignPlayPlayerActionAdmissionFrame(currentTurn);
            if (usesCodeOwnedCertifiedPlan(admission.executionRoute)) {
              return artifacts.load("judge") === null && artifacts.load("game_master") === null;
            }
            if (admission.executionRoute.kind === "certified_contact") {
              return artifacts.load("judge") === null && artifacts.load("game_master") !== null;
            }
            const storedJudge = artifacts.load("judge");
            if (!storedJudge) return false;
            const artifact = parseJudgeArtifact(storedJudge.artifact);
            return artifact.primaryPlan.kind === "no_effect" || artifacts.load("game_master") !== null;
          },
          execute(context) {
            let deterministicCommitStarted = false;
            try {
              const admission = loadCampaignPlayPlayerActionAdmissionFrame(context.turn);
              const committedAt = now();
              const storedGameMaster = context.artifacts.load("game_master");
              let acceptedPlan: Pick<CampaignPlayGameMasterArtifact, "batch" | "batchHash">;
              if (usesCodeOwnedCertifiedPlan(admission.executionRoute)) {
                if (context.artifacts.load("judge") !== null || storedGameMaster !== null) {
                  throw new Error("certified route retained model authority evidence");
                }
                acceptedPlan = compileCertifiedRouteBatch(input.handle, context.turn);
              } else if (admission.executionRoute.kind === "certified_contact") {
                if (context.artifacts.load("judge") !== null || !storedGameMaster) {
                  throw new Error("certified contact has invalid model authority evidence");
                }
                revalidateCertifiedRoute(input.handle, context.turn);
                const acceptedGameMaster = parseGameMasterArtifact(storedGameMaster.artifact);
                if (
                  !("certifiedContactHash" in acceptedGameMaster) ||
                  acceptedGameMaster.certifiedContactHash !== admission.executionRoute.certificateHash
                ) {
                  throw new Error("certified contact references another certificate");
                }
                acceptedPlan = acceptedGameMaster;
              } else {
                const storedJudge = context.artifacts.load("judge");
                if (!storedJudge) throw new Error("missing judge artifact");
                const acceptedJudge = parseJudgeArtifact(storedJudge.artifact);
                if (acceptedJudge.primaryPlan.kind === "no_effect") {
                  if (storedGameMaster !== null) {
                    throw new Error("no-effect turn has a Game Master artifact");
                  }
                  deterministicCommitStarted = true;
                  repository.commitDeterministic({
                    token: context.token,
                    transition: "primary_settled",
                    worldVersionAdvance: 0,
                    committedAt,
                    mutationId: runtimeId("primary-settled", {
                      turnId: context.turn.turnId,
                      epoch: context.token.epoch,
                      branch: acceptedJudge.primaryPlan.reason,
                    }),
                  });
                  return;
                }
                if (!storedGameMaster) throw new Error("missing game master artifact");
                acceptedPlan = parseGameMasterArtifact(storedGameMaster.artifact);
                if (
                  !("judgeArtifactHash" in acceptedPlan) ||
                  acceptedPlan.judgeArtifactHash !== storedJudge.artifactHash
                ) {
                  throw new Error("game master references another judge artifact");
                }
              }
              const current = currentGameMasterFrame(input.handle, context.turn);
              const preflight = preflightCampaignPlayRulebook({
                frame: current.frame.rulebookFrame,
                authority: current.frame.authority,
                batch: acceptedPlan.batch,
              });
              if (!preflight.accepted) {
                repository.failTurn({
                  token: context.token,
                  errorCode: "rulebook_denied",
                  publicErrorCode: "turn_failed",
                  mutationAudit: {
                    stage: "planned",
                    denial: preflight.denial as unknown as CampaignPlayProjectionRecord,
                    batchHash: acceptedPlan.batchHash,
                  },
                  modelEvidence: null,
                  failedAt: committedAt,
                  mutationId: runtimeId("primary-settlement-failed", {
                    turnId: context.turn.turnId,
                    epoch: context.token.epoch,
                    code: "rulebook_denied",
                  }),
                });
                return;
              }
              const worldVersionAdvance = preflight.batch.commands.filter((command) =>
                CAMPAIGN_PLAY_COMMAND_METADATA[command.kind].mechanicalMutation).length;
              deterministicCommitStarted = true;
              repository.commitDeterministic({
                token: context.token,
                transition: "primary_settled",
                worldVersionAdvance,
                committedAt,
                mutationId: runtimeId("primary-settled", {
                  turnId: context.turn.turnId,
                  epoch: context.token.epoch,
                  batchHash: acceptedPlan.batchHash,
                }),
                mutate(mutationContext) {
                  executeCampaignPlayRulebookBatch({
                    frame: current.frame.rulebookFrame,
                    accepted: preflight,
                    context: mutationContext,
                    turnId: context.turn.turnId,
                    createdAt: committedAt,
                    injectFault: input.injectRulebookFault,
                  });
                },
              });
            } catch (cause) {
              if (deterministicCommitStarted || cause instanceof CampaignPlayTurnRepositoryError) {
                throw cause;
              }
              const stillActive = repository.loadTurn(context.turn.turnId);
              if (
                stillActive?.stage === "planned" &&
                stillActive.workerEpoch === context.token.epoch &&
                stillActive.workerLeaseOwner === context.token.owner
              ) {
                repository.failTurn({
                  token: context.token,
                  errorCode: "stale_artifact",
                  publicErrorCode: "turn_failed",
                  mutationAudit: {
                    stage: "planned",
                    cause: cause instanceof CampaignPlayTurnRuntimeError ? cause.code : "invalid_artifact",
                  },
                  modelEvidence: null,
                  failedAt: now(),
                  mutationId: runtimeId("primary-settlement-failed", {
                    turnId: context.turn.turnId,
                    epoch: context.token.epoch,
                    code: "stale_artifact",
                  }),
                });
                return;
              }
              throw cause;
            }
          },
        };
      }
      if (stage === "primary_settled") {
        return {
          kind: "deterministic",
          ready: ({ turn: currentTurn }) => {
            const dueSet = actorScheduler.loadDueSet(currentTurn.turnId);
            if (!dueSet) return true;
            const jobs = actorScheduler.listTurnJobs(currentTurn.turnId);
            if (jobs.some((job) => job.stage === "interrupted")) return false;
            if (jobs.some((job) =>
              ["queued", "claimed", "proposed"].includes(job.stage))) return true;
            actorScheduler.validateTurnSettlement(currentTurn.turnId);
            return true;
          },
          async execute(context) {
            const dueSet = actorScheduler.loadDueSet(context.turn.turnId);
            if (!dueSet) {
              const admission = loadCampaignPlayPlayerActionAdmissionFrame(context.turn);
              if (!isCertifiedRoute(admission.executionRoute) ||
                admission.executionRoute.kind === "certified_observe") {
                const storedJudge = context.artifacts.load("judge");
                if (!storedJudge) {
                  throw new CampaignPlayTurnRuntimeError(
                    "turn_artifact_invalid",
                    "Campaign Play actor scheduling requires the accepted Judge artifact.",
                  );
                }
                const acceptedJudge = parseJudgeArtifact(storedJudge.artifact);
                if (acceptedJudge.primaryPlan.kind === "no_effect") {
                  repository.commitDeterministic({
                    token: context.token,
                    transition: "actors_settled",
                    worldVersionAdvance: 0,
                    committedAt: now(),
                    mutationId: runtimeId("actors-settled", {
                      turnId: context.turn.turnId,
                      epoch: context.token.epoch,
                      noEffectReason: acceptedJudge.primaryPlan.reason,
                    }),
                  });
                  return;
                }
              }
              const state = createCampaignPlayStateRepository(input.handle).loadState();
              if (!state || state.authority.worldTimeMinutes === null) {
                throw new CampaignPlayTurnRuntimeError(
                  "turn_state_invalid",
                  "Campaign Play actor scheduling requires settled mechanical authority.",
                );
              }
              const frozen = actorScheduler.freezeDueSet({
                turnId: context.turn.turnId,
                expectedWorldVersion: state.authority.worldVersion,
                expectedRuntimeRevision: state.authority.runtimeRevision,
              });
              const committedAt = now();
              repository.commitDeterministic({
                token: context.token,
                transition: "actor_job_transitioned",
                worldVersionAdvance: 0,
                committedAt,
                mutationId: runtimeId("actor-due-set-admitted", {
                  turnId: context.turn.turnId,
                  epoch: context.token.epoch,
                  dueSetHash: hashCampaignPlayProjection(frozen),
                }),
                mutate(mutationContext) {
                  actorScheduler.admitDueSet({
                    dueSet: frozen,
                    context: mutationContext,
                    createdAt: committedAt,
                  });
                },
              });
              return;
            }
            const next = actorScheduler.listTurnJobs(context.turn.turnId).find((job) =>
              ["queued", "claimed", "interrupted", "proposed"].includes(job.stage));
            if (!next) {
              actorScheduler.validateTurnSettlement(context.turn.turnId);
              repository.commitDeterministic({
                token: context.token,
                transition: "actors_settled",
                worldVersionAdvance: 0,
                committedAt: now(),
                mutationId: runtimeId("actors-settled", {
                  turnId: context.turn.turnId,
                  epoch: context.token.epoch,
                  dueSetHash: hashCampaignPlayProjection(dueSet),
                }),
                mutate(mutationContext) {
                  actorScheduler.validateTurnSettlement(context.turn.turnId, mutationContext);
                },
              });
              return;
            }
            if (next.stage === "interrupted") {
              throw new CampaignPlayTurnRuntimeError(
                "turn_state_invalid",
                "Campaign Play interrupted actor replanning requires explicit resume.",
              );
            }
            const outcome = actorProposalService.processNext({
              turnId: context.turn.turnId,
              token: context.token,
              createdAt: now(),
              openingExposureSeed: (() => {
                const openingTurn = input.handle.sqlite.prepare(`SELECT id
                  FROM campaign_play_turns
                  WHERE campaign_id = ? AND turn_kind = 'opening' AND stage = 'completed'`).get(
                    input.handle.campaignId,
                  ) as { id: string } | undefined;
                if (!openingTurn) {
                  throw new CampaignPlayTurnRuntimeError(
                    "turn_state_invalid",
                    "Campaign Play actor settlement requires the completed opening provenance.",
                  );
                }
                const storedOpening = repository.loadAcceptedModelArtifact(
                  openingTurn.id,
                  "opening_planner",
                );
                if (!storedOpening) {
                  throw new CampaignPlayTurnRuntimeError(
                    "turn_artifact_invalid",
                    "Campaign Play actor settlement requires the accepted opening artifact.",
                  );
                }
                return campaignPlayOpeningArtifactSchema.parse(storedOpening.artifact).exposureSeed;
              })(),
            });
            if (!outcome) {
              throw new CampaignPlayTurnRuntimeError(
                "turn_state_invalid",
                "Campaign Play actor settlement returned no due actor boundary.",
              );
            }
            if (outcome.kind === "replan_required") {
              const replanningStartedAt = now();
              const actorControlDeadlineAt = replanningStartedAt + actorReplannerOperationDeadlineMs;
              if (!Number.isSafeInteger(actorControlDeadlineAt)) {
                throw new CampaignPlayTurnRuntimeError(
                  "turn_state_invalid",
                  "Campaign Play actor deadline exceeds the timestamp range.",
                );
              }
              const executionRoute = loadCampaignPlayPlayerActionAdmissionFrame(
                context.turn,
              ).executionRoute;
              const criticalPathReplanLimit = executionRoute.kind === "full_authority" ||
                  executionRoute.kind === "certified_wait"
                ? actorCriticalPathReplanLimit
                : 0;
              if (terminalActorReplanCount(context.turn.turnId) >= criticalPathReplanLimit) {
                const deferred = actorProposalService.deferReplan({
                  jobId: outcome.jobId,
                  token: context.token,
                  createdAt: replanningStartedAt,
                  reason: "replan_capacity",
                });
                releaseActorBoundary(context.token, outcome.jobId, deferred.kind);
                return;
              }
              const replanned = await actorReplanner.replan({
                jobId: outcome.jobId,
                token: context.token,
                model: input.actorReplannerModel.languageModel,
                recoveryModel: input.actorReplannerModel.reasoningModel,
                temperature: input.actorReplannerModel.temperature,
                maxOutputTokens: input.actorReplannerModel.maximumOutputTokens,
                maximumInputTokens: input.actorReplannerModel.maximumInputTokens,
                maximumOutputTokens: input.actorReplannerModel.maximumOutputTokens,
                maximumTotalTokens: input.actorReplannerModel.maximumTotalTokens,
                maximumCostMicros: input.actorReplannerModel.maximumCostMicros,
                externalOperationDeadlineMs: actorReplannerOperationDeadlineMs,
                controlDeadlineAt: actorControlDeadlineAt,
                deferOnControlBudgetExhaustion: true,
                signal: context.signal,
                createdAt: replanningStartedAt,
              });
              releaseActorBoundary(context.token, outcome.jobId, replanned.kind);
              return;
            }
            releaseActorBoundary(context.token, outcome.jobId, outcome.kind);
          },
        };
      }
      if (stage === "actors_settled") {
        return {
          kind: "deterministic",
          ready: ({ turn: currentTurn }) => {
            const admission = loadCampaignPlayPlayerActionAdmissionFrame(currentTurn);
            if (admission.executionRoute.kind === "certified_contact") {
              return artifacts.load("judge") === null && artifacts.load("game_master") !== null;
            }
            return isCertifiedRoute(admission.executionRoute) &&
              admission.executionRoute.kind !== "certified_observe"
              ? artifacts.load("judge") === null && artifacts.load("game_master") === null
              : artifacts.load("judge") !== null;
          },
          execute(context) {
            visibility.projectTurn({
              token: context.token,
              actionContext: playerActionContext(context.turn, repository),
              sourceMoment: loadCampaignPlayPlayerActionAdmissionFrame(context.turn)
                .sourceMoment.displayText,
              committedAt: now(),
              mutationId: runtimeId("player-visibility-projected", {
                turnId: context.turn.turnId,
                epoch: context.token.epoch,
              }),
            });
          },
        };
      }
      if (stage === "visibility_projected") {
        return {
          kind: "external",
          async execute(context) {
            const startedAt = now();
            let providerReturned = false;
            try {
              const pending = pendingPlayerNarration(input.handle, context.turn, repository);
              const candidate = await narrator.narrate({
                narrationId: pending.narrationId,
                packetBytes: pending.packetJson,
                createdAt: pending.createdAt,
                model: input.narratorModel.languageModel,
                temperature: input.narratorModel.temperature,
                budget: modelBudget(input.narratorModel),
                structuredOutputMode: "tool",
                signal: context.signal,
              });
              validateNarrationAgainstPacket(candidate.narration, pending.packet);
              const executionEvidence = acceptedNarratorEvidence(
                input.narratorModel.requested,
                candidate.modelEvidence,
              );
              providerReturned = true;
              input.injectNarratorFault?.("after_provider_return");
              return {
                commit({ token, completedAt }) {
                  repository.acceptModelArtifact({
                    token,
                    artifact: candidate.narration,
                    evidence: executionEvidence,
                    mutationDomain: "narration",
                    publicPacketHash: pending.packetHash,
                    acceptedAt: completedAt,
                    mutationId: runtimeId("player-narration-completed", {
                      turnId: token.turnId,
                      epoch: token.epoch,
                    }),
                    mutate(mutationContext) {
                      input.injectNarratorFault?.("during_terminal_commit");
                      const narration = candidate.narration;
                      const updated = mutationContext.sqlite.prepare(`UPDATE campaign_play_narrations
                        SET status = 'complete', beats_json = ?, display_text = ?,
                          suggested_actions_json = ?, effects_json = ?, completed_at = ?
                        WHERE narration_id = ? AND campaign_id = ? AND turn_id = ?
                          AND status = 'pending' AND packet_hash = ? AND packet_json = ?`).run(
                            canonicalizeCampaignPlayProjection(narration.beats),
                            narration.displayText,
                            canonicalizeCampaignPlayProjection(narration.suggestedActions),
                            canonicalizeCampaignPlayProjection(narration.effects),
                            completedAt,
                            narration.narrationId,
                            input.handle.campaignId,
                            token.turnId,
                            pending.packetHash,
                            pending.packetJson,
                          );
                      if (updated.changes !== 1) {
                        throw new CampaignPlayTurnRuntimeError(
                          "turn_artifact_invalid",
                          "Campaign Play player narration lost its atomic completion boundary.",
                        );
                      }
                    },
                  });
                  return undefined;
                },
              };
            } catch (cause) {
              if (providerReturned) throw cause;
              if (cause instanceof CampaignPlayExternalStageInterruption) throw cause;
              throw narratorInterruption(
                input.narratorModel.requested,
                cause,
                now() - startedAt,
              );
            }
          },
        };
      }
      return null;
    },
  });

  return {
    admitAction(admission) {
      let request: CampaignPlayTurnAdmissionRequest;
      try {
        request = campaignPlayTurnAdmissionRequestSchema.parse(admission.request);
      } catch (cause) {
        throw new CampaignPlayTurnRuntimeError(
          "turn_request_invalid",
          "Campaign Play player-action request is invalid.",
          { cause },
        );
      }
      if (!Number.isSafeInteger(admission.submittedAt) || admission.submittedAt < 0) {
        throw new CampaignPlayTurnRuntimeError(
          "turn_request_invalid",
          "Campaign Play player-action submission time is invalid.",
        );
      }
      const turnId = runtimeId("turn-player-action", {
        campaignId: input.handle.campaignId,
        idempotencyKey: request.idempotencyKey,
      });
      const replay = repository.loadTurn(turnId);
      if (replay) {
        const replayFrame = loadCampaignPlayPlayerActionAdmissionFrame(replay);
        const expectedSelection = replay.modelSelection.turnKind === "player_action" &&
            replay.modelSelection.routeKind === undefined
          ? frozenSelection
          : selectionForRoute(
            frozenSelection,
            replayFrame.executionRoute.kind,
            certifiedGameMasterModel.requested,
          );
        if (
          replay.turnKind !== "player_action" || replay.document.turnKind !== "player_action" ||
          canonicalizeCampaignPlayProjection(replay.document.request) !==
            canonicalizeCampaignPlayProjection(request) ||
          canonicalizeCampaignPlayProjection(replay.modelSelection) !==
            canonicalizeCampaignPlayProjection(expectedSelection)
        ) {
          throw new CampaignPlayTurnRuntimeError(
            "turn_idempotency_conflict",
            "Campaign Play idempotency key belongs to another player action.",
          );
        }
        return repository.admitTurn({
          turnId: replay.turnId,
          supersedesTurnId: null,
          document: replay.document,
          modelSelection: replay.modelSelection,
          mutationId: runtimeId("player-action-admitted", { turnId: replay.turnId }),
          submittedAt: replay.submittedAt,
        });
      }
      const frame = buildAdmissionFrame({ handle: input.handle, turnId, request });
      const modelSelection = selectionForRoute(
        frozenSelection,
        frame.executionRoute.kind,
        certifiedGameMasterModel.requested,
      );
      return repository.admitTurn({
        turnId,
        supersedesTurnId: null,
        document: {
          turnKind: "player_action",
          request,
          frame: frame as unknown as CampaignPlayProjectionRecord,
        },
        modelSelection,
        mutationId: runtimeId("player-action-admitted", { turnId }),
        submittedAt: admission.submittedAt,
      });
    },
    async runNextStage(turnId) {
      interruptExpiredActorReplanner();
      const current = repository.loadTurn(turnId);
      if (current?.turnKind === "player_action" && current.stage === "visibility_projected") {
        narrationOperations.commitVisibleResult(turnId, now());
        const completed = repository.loadTurn(turnId)!;
        return {
          turn: completed,
          recovery: repository.loadRecoveryState(turnId, now()),
          telemetry: {
            turnId,
            stage: "visibility_projected",
            progress: "narrating",
            workerEpoch: current.workerEpoch,
            attempt: null,
            queueTimeMs: 0,
            stageTimeMs: completed.completedAt! - current.updatedAt,
            leaseRenewals: 0,
            outcome: "advanced",
          },
        };
      }
      return service.runNextStage(turnId);
    },
    async recoverActiveTurn() {
      interruptExpiredActorReplanner();
      const active = repository.loadActiveTurn();
      if (active?.turnKind === "player_action" && active.stage === "visibility_projected") {
        narrationOperations.commitVisibleResult(active.turnId, now());
        const completed = repository.loadTurn(active.turnId)!;
        return {
          turn: completed,
          recovery: repository.loadRecoveryState(active.turnId, now()),
          telemetry: null,
        };
      }
      if (active?.stage === "primary_settled") {
        const next = actorScheduler.listTurnJobs(active.turnId).find((job) =>
          ["queued", "claimed", "proposed"].includes(job.stage));
        if (
          next?.stage === "queued" &&
          actorScheduler.buildActorFrame(next.jobId).selection.kind === "replan_required" &&
          terminalActorReplanCount(active.turnId) === 0
        ) {
          return {
            turn: active,
            recovery: repository.loadRecoveryState(active.turnId, now()),
            telemetry: null,
          };
        }
      }
      return service.recoverActiveTurn();
    },
    async resumeInterruptedStage(resume) {
      interruptExpiredActorReplanner();
      const turn = repository.loadTurn(resume.turnId);
      const interruptedJob = turn?.stage === "primary_settled"
        ? actorScheduler.listTurnJobs(resume.turnId).find((job) => job.stage === "interrupted")
        : undefined;
      if (!turn || !interruptedJob || resume.interruptedStage !== "primary_settled") {
        return service.resumeInterruptedStage(resume);
      }
      if (loadCampaignPlayPlayerActionAdmissionFrame(turn).executionRoute.kind === "certified_contact") {
        throw new CampaignPlayTurnRuntimeError(
          "turn_state_invalid",
          "Campaign Play certified contact turns cannot resume interrupted actor replanning.",
        );
      }
      if (turn.workerEpoch !== resume.observedEpoch) {
        throw new CampaignPlayTurnRepositoryError(
          "turn_fence_lost",
          "Campaign Play actor resume observed another main-turn epoch.",
        );
      }
      const resumedAt = now();
      const expiresAt = resumedAt + input.leaseDurationMs;
      if (!Number.isSafeInteger(expiresAt)) {
        throw new CampaignPlayTurnRuntimeError(
          "turn_state_invalid",
          "Campaign Play actor resume lease exceeds the timestamp range.",
        );
      }
      const token = {
        ...repository.claimStage({
          turnId: turn.turnId,
          expectedStage: "primary_settled",
          observedEpoch: turn.workerEpoch,
          consumeExplicitResume: (resume.origin ?? "explicit") === "explicit",
          owner: input.owner,
          claimedAt: resumedAt,
          leaseExpiresAt: expiresAt,
          mutationId: runtimeId("actor-replan-resumed", {
            turnId: turn.turnId,
            jobId: interruptedJob.jobId,
            epoch: turn.workerEpoch + 1,
          }),
        }),
      };
      const controller = new AbortController();
      let heartbeatStopped = false;
      let renewalCount = 0;
      const heartbeat = (async () => {
        while (!heartbeatStopped) {
          try {
            await waitForHeartbeat(input.heartbeatIntervalMs, controller.signal);
          } catch (error) {
            if (controller.signal.aborted) return;
            throw error;
          }
          if (heartbeatStopped) return;
          const renewedAt = now();
          if (renewedAt >= token.expiresAt) {
            throw new CampaignPlayTurnRepositoryError(
              "turn_fence_lost",
              "Campaign Play actor resume heartbeat reached an expired lease.",
            );
          }
          const renewedLeaseExpiresAt = renewedAt + input.leaseDurationMs;
          if (!Number.isSafeInteger(renewedLeaseExpiresAt)) {
            throw new CampaignPlayTurnRuntimeError(
              "turn_state_invalid",
              "Campaign Play actor resume lease renewal exceeds the timestamp range.",
            );
          }
          const renewed = repository.renewLease({
            token,
            renewedAt,
            leaseExpiresAt: renewedLeaseExpiresAt,
            mutationId: runtimeId("actor-replan-resume-heartbeat", {
              turnId: turn.turnId,
              jobId: interruptedJob.jobId,
              epoch: token.epoch,
              ordinal: renewalCount + 1,
            }),
          });
          token.expiresAt = renewed.expiresAt;
          renewalCount += 1;
        }
      })();
      const heartbeatFailure = new Promise<never>((_resolve, reject) => {
        void heartbeat.catch(reject);
      });
      const replanning = actorReplanner.replan({
        jobId: interruptedJob.jobId,
        token,
        model: input.actorReplannerModel.languageModel,
        recoveryModel: input.actorReplannerModel.reasoningModel,
        temperature: input.actorReplannerModel.temperature,
        maxOutputTokens: input.actorReplannerModel.maximumOutputTokens,
        maximumInputTokens: input.actorReplannerModel.maximumInputTokens,
        maximumOutputTokens: input.actorReplannerModel.maximumOutputTokens,
        maximumTotalTokens: input.actorReplannerModel.maximumTotalTokens,
        maximumCostMicros: input.actorReplannerModel.maximumCostMicros,
        externalOperationDeadlineMs: actorReplannerOperationDeadlineMs,
        controlDeadlineAt: resumedAt + actorReplannerOperationDeadlineMs,
        deferOnControlBudgetExhaustion: true,
        signal: controller.signal,
        createdAt: resumedAt,
      });
      void replanning.catch(() => undefined);
      let outcome: Awaited<typeof replanning>;
      try {
        outcome = await Promise.race([replanning, heartbeatFailure]);
      } finally {
        heartbeatStopped = true;
        controller.abort();
        await heartbeat.catch(() => undefined);
      }
      releaseActorBoundary(token, interruptedJob.jobId, outcome.kind);
      const settledTurn = repository.loadTurn(turn.turnId)!;
      return {
        turn: settledTurn,
        recovery: repository.loadRecoveryState(turn.turnId, now()),
        telemetry: null,
      };
    },
    async runNarration(
      turnId,
      claimedToken,
      recoveryFeedback,
      structuredOutputMode = "auto",
    ) {
      const token = claimedToken ?? claimNarration(turnId);
      return token
        ? executeNarration(token, recoveryFeedback, structuredOutputMode)
        : narrationOperations.loadByTurn(turnId);
    },
    prepareNarrationRecovery(request, kind = "manual") {
      const operation = narrationOperations.prepareRecovery(request, now(), kind);
      const token = claimNarration(operation.turnId);
      if (!token) {
        throw new CampaignPlayTurnRuntimeError(
          "turn_state_invalid",
          "Campaign Play narration recovery could not claim its new attempt.",
        );
      }
      return token;
    },
    loadTurn: (turnId) => repository.loadTurn(turnId),
    loadTelemetry: (turnId) => repository.loadTurnTelemetry(turnId),
  };
}
