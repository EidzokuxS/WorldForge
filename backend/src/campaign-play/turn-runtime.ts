import crypto from "node:crypto";
import { setTimeout as waitForTimer } from "node:timers/promises";
import type { LanguageModel } from "ai";
import { z } from "zod";
import {
  CAMPAIGN_PLAY_DEFAULT_WAIT_MINUTES,
  CAMPAIGN_PLAY_LIMITS,
  type CampaignPlayActionContext,
  type CampaignPlayJournalEntry,
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
  campaignPlayCertifiedContactSchema,
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
  campaignPlaySuggestedActionLabelPrefix,
  campaignPlayTurnAdmissionRequestSchema,
  rulebookCommandBatchSchema,
  validateNarrationAgainstPacket,
  type CampaignPlayEntityRef,
  type CampaignPlayCertifiedContact,
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
  deriveCampaignPlayPublicHandle,
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
  resolveCampaignPlayUncertainty,
  validateCampaignPlayUncertaintyResolution,
  type CampaignPlayJudgeFrame,
  type CampaignPlayJudgeInput,
  type CampaignPlayModelBudget,
  type CampaignPlayModelEvidence,
} from "./judge.js";
import {
  CampaignPlayGameMasterError,
  createCampaignPlayGameMaster,
  type CampaignPlayGameMasterFrame,
} from "./game-master.js";
import { loadCampaignPlayActorContinuity } from "./actor-continuity.js";
import {
  executeCampaignPlayRulebookBatch,
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
} from "./narration-operation-repository.js";

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
}).strict().superRefine((value, context) => {
  if ((value.source === "suggested") !== (value.choiceHandle !== null)) {
    context.addIssue({
      code: "custom",
      path: ["choiceHandle"],
      message: "Choice handle must match the admitted input source.",
    });
  }
});

const choiceBindingSchema = z.object({
  handle: line(CAMPAIGN_PLAY_LIMITS.handle),
  label: line(CAMPAIGN_PLAY_LIMITS.label),
  kind: z.enum(["observe", "move", "contact", "wait", "attempt"]),
  targets: z.array(z.object({
    handle: line(CAMPAIGN_PLAY_LIMITS.handle),
    kind: z.enum(["actor", "location", "route", "pressure", "possession"]),
  }).strict()).max(CAMPAIGN_PLAY_LIMITS.targets),
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
  ): Promise<CampaignPlayNarrationExecution | null>;
  prepareNarrationRecovery(
    request: CampaignPlayNarrationRecoveryRequest,
    kind?: CampaignPlayNarrationRecoveryKind,
  ): CampaignPlayNarrationAttemptToken;
  loadTurn(turnId: string): LoadedCampaignPlayTurn | null;
  loadTelemetry(turnId: string): CampaignPlayTurnTelemetry;
}

export type CampaignPlayNarrationExecution = CampaignPlayNarrationOperation & {
  recoveryFeedback?: CampaignPlayNarratorRecoveryFeedback;
};

interface CompletedPublicMomentRow {
  sourceTurnId: string;
  sourceTurnStage: string;
  sourceTurnPacketHash: string | null;
  terminalReason: string;
  narrationId: string;
  packetHash: string;
  packetJson: string;
  narrationCreatedAt: number;
}

interface PendingNarrationRow {
  narrationId: string;
  packetHash: string;
  packetJson: string;
  status: string;
  createdAt: number;
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
    "certified_observe",
): CampaignPlayTurnModelSelection {
  if (base.turnKind !== "player_action") return base;
  return { ...base, routeKind };
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
      narration.created_at AS narrationCreatedAt
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
      validateNarrationAgainstPacket(campaignPlayNarrationSchema.parse({
        narrationId: moment.momentId,
        turnId: row.sourceTurnId,
        beats: JSON.parse(narration.beatsJson) as unknown,
        displayText: moment.displayText,
        suggestedActions: moment.suggestedActions,
        effects: JSON.parse(narration.effectsJson) as unknown,
        createdAt: moment.createdAt,
      }), packet);
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
  judgeInput: CampaignPlayJudgeInput;
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
      const reference = candidates.get(fact.handle);
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
): CampaignPlayJudgeInput {
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
  return judgeInputSchema.parse({
    originalText: suggestion.label,
    source: "suggested",
    choiceHandle: suggestion.choiceHandle,
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

function certifiedObserveHash(certificate: CampaignPlayCertifiedObserve): string {
  return hashCampaignPlayProjection({
    domain: "campaign_play_certified_observe",
    certificate,
  });
}

function isCertifiedRoute(
  route: CampaignPlayPlayerActionAdmissionFrame["executionRoute"],
): route is Exclude<CampaignPlayPlayerActionAdmissionFrame["executionRoute"], { kind: "full_authority" }> {
  return route.kind === "certified_move" ||
    route.kind === "certified_wait" ||
    route.kind === "certified_contact" ||
    route.kind === "certified_observe";
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
  if (
    !suggestion || !intent || !choice || intent.kind !== "move" ||
    suggestion.label !== judgeInput.originalText ||
    suggestion.label !== campaignPlaySuggestedActionLabelPrefix(packet, intent) ||
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
        method: null,
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
      reason: "Current rendered move is fully determined by the open canonical route.",
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
  const prefix = campaignPlaySuggestedActionLabelPrefix(packet, intent);
  if (!suggestion.label.startsWith(prefix)) return null;
  const detail = suggestion.label.slice(prefix.length);
  if (!/^ask (?:about|what|who|where|when|why|how|whether|if) [^\r\n]+$/.test(detail)) {
    return null;
  }
  if (
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
    detail,
    ruling: {
      disposition: "deterministic",
      normalizedIntent: {
        originalText: suggestion.label,
        source: "suggested",
        choiceHandle: intent.handle,
        kind: "contact",
        targets: intent.targets,
        method: detail,
        stakes: null,
      },
      movementRouteHandle: null,
      possessionEffectAuthority: { kind: "none" },
      requiredObligationEffect: { kind: "none" },
      citedVisibleFactHandles: [],
      resultBounds: { minimum: "success", maximum: "success" },
      elapsedBounds: { minimumMinutes: 1, maximumMinutes: 1 },
      uncertainty: { kind: "none" },
      reason: "Current rendered question is authorized for delivery without a response claim.",
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
  if (!suggestion.label.startsWith(prefix)) return null;
  const detail = suggestion.label.slice(prefix.length);
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
  const moveCertificate = certifyPureRenderedMove({
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
  const waitCertificate = moveCertificate === null ? certifyPureRenderedWait({
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
  const contactCertificate = moveCertificate === null && waitCertificate === null
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
  const observeCertificate = moveCertificate === null && waitCertificate === null &&
    contactCertificate === null
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
    executionRoute: moveCertificate !== null
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
    },
  };
}

function revalidateCertifiedRoute(
  handle: CampaignPlayDatabaseHandle,
  turn: LoadedCampaignPlayTurn,
): CampaignPlayCertifiedMove | CampaignPlayCertifiedWait | CampaignPlayCertifiedContact |
  CampaignPlayCertifiedObserve {
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
  if (
    evidence.actualProviderId !== requested.providerId ||
    evidence.actualStrategy === null || evidence.totalAttempts !== 1 ||
    evidence.repairUsed || evidence.retryUsed || evidence.textFallbackUsed ||
    evidence.responseModel !== requested.model || evidence.finishReason === null ||
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
    actualProviderId: evidence.actualProviderId,
    actualModel: evidence.responseModel,
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
): CampaignPlayExternalStageInterruption {
  const evidence = cause instanceof CampaignPlayJudgeError ? cause.modelEvidence : null;
  const budget = cause instanceof CampaignPlayJudgeError && cause.code === "stage_budget_exceeded";
  const timeout = cause instanceof CampaignPlayJudgeError && cause.code === "stage_timeout";
  const contract = cause instanceof CampaignPlayJudgeError &&
    cause.code !== "transport_interrupted" && cause.code !== "stage_timeout";
  return new CampaignPlayExternalStageInterruption(
    interruptionEvidence({
      requested,
      evidence,
      durationMs: evidence?.durationMs ?? durationMs,
      errorCode: timeout ? "stage_timeout" : budget ? "stage_budget_exceeded"
        : contract ? "model_contract_invalid" : "provider_unavailable",
      schemaOutcome: contract ? "invalid" : "transport_error",
    }),
    "Campaign Play Judge requires explicit resume.",
    { cause },
  );
}

function gameMasterInterruption(
  requested: CampaignPlayRequestedModel,
  cause: unknown,
  durationMs: number,
): CampaignPlayExternalStageInterruption {
  const evidence = cause instanceof CampaignPlayGameMasterError ? cause.modelEvidence : null;
  const budget = cause instanceof CampaignPlayGameMasterError && cause.code === "stage_budget_exceeded";
  const timeout = cause instanceof CampaignPlayGameMasterError && cause.code === "stage_timeout";
  const denied = cause instanceof CampaignPlayGameMasterError && cause.code === "rulebook_denied";
  const contract = cause instanceof CampaignPlayGameMasterError &&
    cause.code !== "transport_interrupted" && cause.code !== "stage_timeout";
  return new CampaignPlayExternalStageInterruption(
    interruptionEvidence({
      requested,
      evidence,
      durationMs: evidence?.durationMs ?? durationMs,
      errorCode: timeout ? "stage_timeout" : budget ? "stage_budget_exceeded"
        : denied ? "rulebook_denied"
        : contract ? "model_contract_invalid" : "provider_unavailable",
      schemaOutcome: contract ? "invalid" : "transport_error",
    }),
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
  if (isCertifiedRoute(admission.executionRoute)) {
    const certificateHash = admission.executionRoute.kind === "certified_move"
      ? certifiedMoveHash(admission.executionRoute.certificate)
      : admission.executionRoute.kind === "certified_wait"
        ? certifiedWaitHash(admission.executionRoute.certificate)
        : admission.executionRoute.kind === "certified_contact"
          ? certifiedContactHash(admission.executionRoute.certificate)
          : certifiedObserveHash(admission.executionRoute.certificate);
    if (
      certificateHash !== admission.executionRoute.certificateHash ||
      repository.loadAcceptedModelArtifact(turn.turnId, "judge") !== null
    ) {
      throw new CampaignPlayTurnRuntimeError(
        "turn_artifact_invalid",
        "Campaign Play visibility rejected invalid certified route authority.",
      );
    }
    return campaignPlayActionContextSchema.parse({
      submittedText: admission.judgeInput.originalText,
      ...admission.executionRoute.certificate.publicResult,
    });
  }
  const storedJudge = repository.loadAcceptedModelArtifact(turn.turnId, "judge");
  if (!storedJudge) {
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
  if (
    evidence.actualProviderId !== requested.providerId ||
    evidence.actualStrategy === null || evidence.totalAttempts !== 1 ||
    evidence.repairUsed || evidence.retryUsed || evidence.textFallbackUsed ||
    evidence.responseModel !== requested.model || evidence.finishReason === null ||
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
    actualProviderId: evidence.actualProviderId,
    actualModel: evidence.responseModel,
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
  const certifiedGameMasterModel = input.certifiedGameMasterModel ?? input.gameMasterModel;
  const externalOperationDeadlineMs = input.externalOperationDeadlineMs ?? 90_000;
  const gameMasterOperationDeadlineMs = input.gameMasterOperationDeadlineMs
    ?? externalOperationDeadlineMs;
  const actorReplannerOperationDeadlineMs = input.actorReplannerOperationDeadlineMs ?? 90_000;
  const actorCriticalPathReplanLimit = input.actorCriticalPathReplanLimit ?? 1;
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

  const acceptedActorReplanCount = (turnId: string): number =>
    (input.handle.sqlite.prepare(`SELECT count(*) AS count
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ?
        AND kind = 'actor_replanner' AND status = 'accepted'`).get(
          input.handle.campaignId,
          turnId,
        ) as { count: number }).count;

  const releaseActorBoundary = (
    token: CampaignPlayWorkerLeaseToken,
    jobId: string,
    outcome: string,
  ): void => {
    const committedAt = now();
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
          attempt.attempt_number IN (1, 2)
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
        ...(recoveryFeedback === undefined ? {} : { recoveryFeedback }),
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
      });
      const safeRecoveryFeedback = !deadlineExpired &&
          cause instanceof CampaignPlayNarratorError &&
          cause.code === "narration_invalid"
        ? cause.recoveryFeedback
        : null;
      return safeRecoveryFeedback === null
        ? failedOperation
        : { ...failedOperation, recoveryFeedback: safeRecoveryFeedback };
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
        return {
          kind: "external",
          externalOperationDeadlineMs: isCertifiedRoute(admitted.executionRoute)
            ? gameMasterOperationDeadlineMs
            : externalOperationDeadlineMs,
          async execute(context) {
            const startedAt = now();
            let routeKind: "full_authority" | "certified_move" | "certified_wait" |
              "certified_contact" | "certified_observe" = "full_authority";
            try {
              const admission = loadCampaignPlayPlayerActionAdmissionFrame(context.turn);
              routeKind = admission.executionRoute.kind;
              const current = currentGameMasterFrame(input.handle, context.turn);
              if (isCertifiedRoute(admission.executionRoute)) {
                const certificate = revalidateCertifiedRoute(input.handle, context.turn);
                const candidate = await gameMaster.plan({
                  frame: current.frame,
                  ruling: certificate.ruling,
                  resolution: certificate.resolution,
                  uncertaintyAuthority: null,
                  model: context.attempt > 1 && certifiedGameMasterModel.reasoningModel
                    ? certifiedGameMasterModel.reasoningModel
                    : certifiedGameMasterModel.languageModel,
                  temperature: certifiedGameMasterModel.temperature,
                  budget: modelBudget(certifiedGameMasterModel),
                  signal: context.signal,
                });
                const artifact = campaignPlayGameMasterArtifactSchema.parse({
                  ...(admission.executionRoute.kind === "certified_move"
                    ? { certifiedMoveHash: admission.executionRoute.certificateHash }
                    : admission.executionRoute.kind === "certified_wait"
                      ? { certifiedWaitHash: admission.executionRoute.certificateHash }
                      : admission.executionRoute.kind === "certified_contact"
                        ? { certifiedContactHash: admission.executionRoute.certificateHash }
                        : { certifiedObserveHash: admission.executionRoute.certificateHash }),
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
                },
                model: context.attempt > 1 && input.judgeModel.reasoningModel !== undefined
                  ? input.judgeModel.reasoningModel
                  : input.judgeModel.languageModel,
                temperature: input.judgeModel.temperature,
                budget: modelBudget(input.judgeModel),
                signal: context.signal,
              });
              const artifact = judgeArtifact({
                admission,
                ruling: result.ruling,
                uncertaintySeedKey: input.uncertaintySeedKey,
              });
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
              if (routeKind !== "full_authority") {
                throw gameMasterInterruption(
                  input.gameMasterModel.requested,
                  cause,
                  now() - startedAt,
                );
              }
              log.warn("Judge stage failed before artifact acceptance.", {
                code: cause instanceof CampaignPlayJudgeError ? cause.code : null,
                stack: cause instanceof Error ? cause.stack : String(cause),
              });
              throw judgeInterruption(
                input.judgeModel.requested,
                cause,
                now() - startedAt,
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
                model: context.attempt > 1 && input.gameMasterModel.reasoningModel !== undefined
                  ? input.gameMasterModel.reasoningModel
                  : input.gameMasterModel.languageModel,
                temperature: input.gameMasterModel.temperature,
                budget: modelBudget(input.gameMasterModel),
                signal: context.signal,
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
            if (isCertifiedRoute(admission.executionRoute)) {
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
              let acceptedGameMaster: CampaignPlayGameMasterArtifact;
              if (isCertifiedRoute(admission.executionRoute)) {
                if (context.artifacts.load("judge") !== null || !storedGameMaster) {
                  throw new Error("certified route has invalid model authority evidence");
                }
                const certificate = revalidateCertifiedRoute(input.handle, context.turn);
                acceptedGameMaster = parseGameMasterArtifact(storedGameMaster.artifact);
                const certificateHash = admission.executionRoute.kind === "certified_move"
                  ? certifiedMoveHash(certificate as CampaignPlayCertifiedMove)
                  : admission.executionRoute.kind === "certified_wait"
                    ? certifiedWaitHash(certificate as CampaignPlayCertifiedWait)
                    : admission.executionRoute.kind === "certified_contact"
                      ? certifiedContactHash(certificate as CampaignPlayCertifiedContact)
                      : certifiedObserveHash(certificate as CampaignPlayCertifiedObserve);
                const artifactReferencesCertificate = admission.executionRoute.kind === "certified_move"
                  ? "certifiedMoveHash" in acceptedGameMaster &&
                    acceptedGameMaster.certifiedMoveHash === certificateHash
                  : admission.executionRoute.kind === "certified_wait"
                    ? "certifiedWaitHash" in acceptedGameMaster &&
                      acceptedGameMaster.certifiedWaitHash === certificateHash
                    : admission.executionRoute.kind === "certified_contact"
                      ? "certifiedContactHash" in acceptedGameMaster &&
                        acceptedGameMaster.certifiedContactHash === certificateHash
                      : "certifiedObserveHash" in acceptedGameMaster &&
                        acceptedGameMaster.certifiedObserveHash === certificateHash;
                if (!artifactReferencesCertificate) {
                  throw new Error("game master references another certified route");
                }
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
                acceptedGameMaster = parseGameMasterArtifact(storedGameMaster.artifact);
                if (
                  !("judgeArtifactHash" in acceptedGameMaster) ||
                  acceptedGameMaster.judgeArtifactHash !== storedJudge.artifactHash
                ) {
                  throw new Error("game master references another judge artifact");
                }
              }
              const current = currentGameMasterFrame(input.handle, context.turn);
              const preflight = preflightCampaignPlayRulebook({
                frame: current.frame.rulebookFrame,
                authority: current.frame.authority,
                batch: acceptedGameMaster.batch,
              });
              if (!preflight.accepted) {
                repository.failTurn({
                  token: context.token,
                  errorCode: "rulebook_denied",
                  publicErrorCode: "turn_failed",
                  mutationAudit: {
                    stage: "planned",
                    denial: preflight.denial as unknown as CampaignPlayProjectionRecord,
                    batchHash: acceptedGameMaster.batchHash,
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
                  batchHash: acceptedGameMaster.batchHash,
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
              if (!isCertifiedRoute(admission.executionRoute)) {
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
              if (acceptedActorReplanCount(context.turn.turnId) >= actorCriticalPathReplanLimit) {
                const deferred = actorProposalService.deferReplan({
                  jobId: outcome.jobId,
                  token: context.token,
                  createdAt: now(),
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
                signal: context.signal,
                createdAt: now(),
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
            return isCertifiedRoute(admission.executionRoute)
              ? artifacts.load("judge") === null && artifacts.load("game_master") !== null
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
          : selectionForRoute(frozenSelection, replayFrame.executionRoute.kind);
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
      const modelSelection = selectionForRoute(frozenSelection, frame.executionRoute.kind);
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
          acceptedActorReplanCount(active.turnId) === 0
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
        signal: controller.signal,
        createdAt: now(),
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
    async runNarration(turnId, claimedToken, recoveryFeedback) {
      const token = claimedToken ?? claimNarration(turnId);
      return token
        ? executeNarration(token, recoveryFeedback)
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
