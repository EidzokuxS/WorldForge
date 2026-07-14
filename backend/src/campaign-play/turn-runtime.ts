import crypto from "node:crypto";
import type { LanguageModel } from "ai";
import { z } from "zod";
import {
  CAMPAIGN_PLAY_LIMITS,
  type CampaignPlayActionContext,
  type CampaignPlayJournalEntry,
  type CampaignPlayNarration,
  type CampaignPlayNarratorPacket,
  type CampaignPlayTurnAdmissionRequest,
  type CampaignPlayTurnAdmissionResponse,
} from "@worldforge/shared";
import { createLogger } from "../lib/index.js";
import {
  CAMPAIGN_PLAY_COMMAND_METADATA,
  campaignPlayActionContextSchema,
  campaignPlayEntityRefSchema,
  campaignPlayGameMasterArtifactSchema,
  campaignPlayJournalEntrySchema,
  campaignPlayJudgeArtifactSchema,
  campaignPlayNarrationSchema,
  campaignPlayNarratorPacketSchema,
  campaignPlayTurnAdmissionRequestSchema,
  rulebookCommandBatchSchema,
  validateNarrationAgainstPacket,
  type CampaignPlayEntityRef,
  type CampaignPlayGameMasterArtifact,
  type CampaignPlayJudgeArtifact,
  type CampaignPlayJudgeRuling,
} from "./contracts.js";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import {
  canonicalizeCampaignPlayProjection,
  deriveCampaignPlayPublicHandle,
  hashCampaignPlayProjection,
  type CampaignPlayProjectionRecord,
} from "./campaign-play-projection.js";
import {
  CampaignPlayJudgeError,
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
} from "./narrator.js";
import {
  createCampaignPlayVisibilityService,
  type CampaignPlayVisibilityService,
} from "./visibility-service.js";

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
    kind: z.enum(["actor", "location", "route", "pressure"]),
  }).strict()).max(CAMPAIGN_PLAY_LIMITS.targets),
}).strict();

const handleBindingSchema = z.object({
  handle: line(CAMPAIGN_PLAY_LIMITS.handle),
  reference: campaignPlayEntityRefSchema,
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
  sourceNarrationId: line(CAMPAIGN_PLAY_LIMITS.id),
  sourceNarrationHash: hashSchema,
  sourcePacketHash: hashSchema,
  sourceNarration: campaignPlayNarrationSchema,
  sourcePacket: campaignPlayNarratorPacketSchema,
  player: z.object({
    actorId: line(CAMPAIGN_PLAY_LIMITS.id),
    actorHandle: line(CAMPAIGN_PLAY_LIMITS.handle),
    name: line(CAMPAIGN_PLAY_LIMITS.name),
  }).strict(),
  judgeInput: judgeInputSchema,
  visibleFacts: z.array(campaignPlayJudgeVisibleFactSchema).max(40),
  handleBindings: z.array(handleBindingSchema).max(40),
  choiceBindings: z.array(choiceBindingSchema).max(CAMPAIGN_PLAY_LIMITS.suggestedActions),
  authority: z.object({
    authorizedRefs: z.array(campaignPlayEntityRefSchema).max(40),
    witnessActorIds: z.array(line(CAMPAIGN_PLAY_LIMITS.id)).max(8),
    knownWorldEventIds: z.array(line(CAMPAIGN_PLAY_LIMITS.id)).max(MAXIMUM_VISIBLE_WORLD_EVENTS),
  }).strict(),
}).strict().superRefine((frame, context) => {
  if (
    frame.sourcePacket.campaignId !== frame.campaignId ||
    frame.sourcePacket.turnId !== frame.sourceTurnId ||
    frame.sourceNarration.turnId !== frame.sourceTurnId ||
    frame.sourceNarration.narrationId !== frame.sourceNarrationId ||
    frame.sourcePacket.acceptedWorldVersion !== frame.acceptedWorldVersion ||
    frame.sourcePacket.worldVersion !== frame.baseWorldVersion ||
    frame.sourcePacketHash !== hashCampaignPlayNarratorPacket(
      frame.sourceTurnId,
      frame.sourcePacket as unknown as CampaignPlayProjectionRecord,
    ) ||
    frame.sourceNarrationHash !== hashCampaignPlayProjection({
      domain: "campaign_play_source_narration",
      narration: frame.sourceNarration,
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
  uncertaintySeedKey: string;
  judgeModel: CampaignPlayTurnRuntimeStageModel;
  gameMasterModel: CampaignPlayTurnRuntimeStageModel;
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
  loadTurn(turnId: string): LoadedCampaignPlayTurn | null;
  loadTelemetry(turnId: string): CampaignPlayTurnTelemetry;
}

interface CompletedPublicMomentRow {
  sourceTurnId: string;
  sourceTurnStage: string;
  sourceTurnPacketHash: string | null;
  terminalReason: string;
  narrationId: string;
  narrationStatus: string;
  packetHash: string;
  packetJson: string;
  beatsJson: string | null;
  displayText: string | null;
  suggestedActionsJson: string | null;
  effectsJson: string | null;
  narrationCreatedAt: number;
  narrationCompletedAt: number | null;
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

function loadCompletedPublicMoment(
  handle: CampaignPlayDatabaseHandle,
): { packet: CampaignPlayNarratorPacket; narration: CampaignPlayNarration; row: CompletedPublicMomentRow } {
  const row = handle.sqlite.prepare(`SELECT
      turn.id AS sourceTurnId, turn.stage AS sourceTurnStage,
      turn.public_packet_hash AS sourceTurnPacketHash,
      result.terminal_reason AS terminalReason,
      narration.narration_id AS narrationId, narration.status AS narrationStatus,
      narration.packet_hash AS packetHash, narration.packet_json AS packetJson,
      narration.beats_json AS beatsJson, narration.display_text AS displayText,
      narration.suggested_actions_json AS suggestedActionsJson,
      narration.effects_json AS effectsJson,
      narration.created_at AS narrationCreatedAt,
      narration.completed_at AS narrationCompletedAt
    FROM campaign_play_turns turn
    JOIN campaign_play_turn_results result
      ON result.campaign_id = turn.campaign_id AND result.turn_id = turn.id
    JOIN campaign_play_narrations narration
      ON narration.campaign_id = turn.campaign_id AND narration.turn_id = turn.id
    WHERE turn.campaign_id = ? AND turn.stage = 'completed' AND narration.status = 'complete'
    ORDER BY narration.completed_at DESC, turn.id DESC LIMIT 1`).get(
      handle.campaignId,
    ) as CompletedPublicMomentRow | undefined;
  if (
    !row || row.sourceTurnStage !== "completed" || row.narrationStatus !== "complete" ||
    row.narrationCompletedAt === null || row.sourceTurnPacketHash !== row.packetHash ||
    row.beatsJson === null || row.displayText === null ||
    row.suggestedActionsJson === null || row.effectsJson === null
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_public_context_invalid",
      "Campaign Play action admission requires one exact completed public moment.",
    );
  }
  let packet: CampaignPlayNarratorPacket;
  let narration: CampaignPlayNarration;
  try {
    const parsedPacket = JSON.parse(row.packetJson) as unknown;
    packet = campaignPlayNarratorPacketSchema.parse(parsedPacket);
    narration = campaignPlayNarrationSchema.parse({
      narrationId: row.narrationId,
      turnId: row.sourceTurnId,
      beats: JSON.parse(row.beatsJson) as unknown,
      displayText: row.displayText,
      suggestedActions: JSON.parse(row.suggestedActionsJson) as unknown,
      effects: JSON.parse(row.effectsJson) as unknown,
      createdAt: row.narrationCreatedAt,
    });
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
    validateNarrationAgainstPacket(narration, packet);
  } catch (cause) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_public_context_invalid",
      "Campaign Play completed public moment is invalid.",
      { cause },
    );
  }
  return { packet, narration, row };
}

function humanPlayer(handle: CampaignPlayDatabaseHandle): HumanRow {
  const rows = handle.sqlite.prepare(`SELECT id AS actorId, kind, controller, role, name
    FROM actors WHERE campaign_id = ? AND controller = 'human' ORDER BY id`).all(
      handle.campaignId,
    ) as HumanRow[];
  if (
    rows.length !== 1 || rows[0]!.kind !== "person" || rows[0]!.role !== "player"
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_state_invalid",
      "Campaign Play action admission requires one canonical human player actor.",
    );
  }
  return rows[0]!;
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
  frame.acceptedWorld.locations.forEach((location) =>
    add("location", { kind: "location", id: location.id }));
  frame.acceptedWorld.routes.forEach((route) => add("route", { kind: "route", id: route.id }));
  frame.acceptedWorld.pressures.forEach((pressure) =>
    add("pressure", { kind: "pressure", id: pressure.id }));
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
  narration: CampaignPlayNarration;
  mechanicalFrame: CampaignPlayRulebookFrame;
  human: HumanRow;
  judgeInput: CampaignPlayJudgeInput;
}): Pick<CampaignPlayPlayerActionAdmissionFrame,
  "player" | "visibleFacts" | "handleBindings" | "choiceBindings" | "authority"> {
  const { handle, packet, narration, mechanicalFrame, human, judgeInput } = input;
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
  const choiceBindings = narration.suggestedActions.map((suggestion) => {
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
    ...packet.continuity,
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
    player: { actorId: human.actorId, actorHandle, name: human.name },
    visibleFacts,
    handleBindings,
    choiceBindings,
    authority: { authorizedRefs, witnessActorIds, knownWorldEventIds },
  };
}

function resolveJudgeInput(
  request: CampaignPlayTurnAdmissionRequest,
  packet: CampaignPlayNarratorPacket,
  narration: CampaignPlayNarration,
): CampaignPlayJudgeInput {
  if (request.source === "freeform") {
    return judgeInputSchema.parse({
      originalText: request.text,
      source: "freeform",
      choiceHandle: null,
    });
  }
  const suggestion = narration.suggestedActions.find((action) =>
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
  const judgeInput = resolveJudgeInput(input.request, moment.packet, moment.narration);
  const publicAuthority = buildPublicAuthority({
    handle: input.handle,
    packet: moment.packet,
    narration: moment.narration,
    mechanicalFrame,
    human,
    judgeInput,
  });
  return playerActionAdmissionFrameSchema.parse({
    campaignId: input.handle.campaignId,
    turnId: input.turnId,
    acceptedWorldVersion: state.authority.acceptedWorldVersion,
    acceptedContentHash: state.authority.acceptedContentHash,
    baseWorldVersion: state.authority.worldVersion,
    baseRuntimeRevision: state.authority.runtimeRevision,
    worldTimeMinutes: state.authority.worldTimeMinutes,
    sourceTurnId: moment.row.sourceTurnId,
    sourceNarrationId: moment.row.narrationId,
    sourceNarrationHash: hashCampaignPlayProjection({
      domain: "campaign_play_source_narration",
      narration: moment.narration,
    }),
    sourcePacketHash: moment.row.packetHash,
    sourceNarration: moment.narration,
    sourcePacket: moment.packet,
    judgeInput,
    ...publicAuthority,
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
    mechanical.human?.actorId !== admission.player.actorId
  ) {
    throw new CampaignPlayTurnRuntimeError(
      "turn_artifact_invalid",
      "Campaign Play admitted player-action frame lost its mechanical authority.",
    );
  }
  const rebuilt = buildPublicAuthority({
    handle,
    packet: admission.sourcePacket,
    narration: admission.sourceNarration,
    mechanicalFrame: mechanical,
    human: humanPlayer(handle),
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
      sourceMoment: admission.sourceNarration.displayText,
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

function assertSuggestedRuling(
  admission: CampaignPlayPlayerActionAdmissionFrame,
  ruling: CampaignPlayJudgeRuling,
): void {
  if (admission.judgeInput.source !== "suggested") return;
  const binding = admission.choiceBindings.find((choice) =>
    choice.handle === admission.judgeInput.choiceHandle);
  if (
    !binding || ruling.normalizedIntent.kind !== binding.kind ||
    canonicalizeCampaignPlayProjection(ruling.normalizedIntent.targets) !==
      canonicalizeCampaignPlayProjection(binding.targets)
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
  const judge = input.judge ?? createCampaignPlayJudge();
  const gameMaster = input.gameMaster ?? createCampaignPlayGameMaster();
  const actorScheduler = input.actorScheduler ?? createCampaignPlayActorScheduler(input.handle);
  const actorProposalService = input.actorProposalService ??
    createCampaignPlayActorProposalService(input.handle, { now });
  const actorReplanner = input.actorReplanner ?? createCampaignPlayActorReplanner(input.handle);
  const narrator = input.narrator ?? createCampaignPlayNarrator();
  const visibility = input.visibility ?? createCampaignPlayVisibilityService(input.handle);
  const frozenSelection = selection(input);

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
        AND model.kind = 'actor_replanner' AND model.worker_epoch = job.worker_epoch
        AND model.status = 'started'
      WHERE job.campaign_id = ? AND job.stage = 'claimed'
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

  const service: CampaignPlayTurnService = createCampaignPlayTurnService({
    handle: input.handle,
    owner: input.owner,
    leaseDurationMs: input.leaseDurationMs,
    heartbeatIntervalMs: input.heartbeatIntervalMs,
    clock: input.clock,
    resolveStage({ turn, stage, artifacts }) {
      if (turn.turnKind !== "player_action") return null;
      if (stage === "admitted") {
        return {
          kind: "external",
          async execute(context) {
            const startedAt = now();
            try {
              const admission = loadCampaignPlayPlayerActionAdmissionFrame(context.turn);
              const current = currentGameMasterFrame(input.handle, context.turn);
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
              const result = await judge.judge({
                frame: campaignPlayJudgeFrameSchema.parse({
                  campaignId: admission.campaignId,
                  turnId: admission.turnId,
                  playerActorHandle: admission.player.actorHandle,
                  locationHandle: admission.sourcePacket.currentLocation.handle,
                  worldTimeMinutes: admission.worldTimeMinutes,
                  sourceMoment: admission.sourceNarration.displayText,
                  visibleFacts: admission.visibleFacts,
                  actorContinuity: current.frame.actorContinuity,
                }),
                input: {
                  ...admission.judgeInput,
                  frozenChoice: frozenChoice
                    ? { kind: frozenChoice.kind, targets: frozenChoice.targets }
                    : null,
                },
                model: input.judgeModel.languageModel,
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
                model: input.gameMasterModel.languageModel,
                temperature: input.gameMasterModel.temperature,
                budget: modelBudget(input.gameMasterModel),
                signal: context.signal,
              });
              const artifact = campaignPlayGameMasterArtifactSchema.parse({
                judgeArtifactHash: storedJudge.artifactHash,
                batch: candidate.batch,
                batchHash: candidate.batchHash,
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
          ready: () => {
            const storedJudge = artifacts.load("judge");
            if (!storedJudge) return false;
            const artifact = parseJudgeArtifact(storedJudge.artifact);
            return artifact.primaryPlan.kind === "no_effect" || artifacts.load("game_master") !== null;
          },
          execute(context) {
            let deterministicCommitStarted = false;
            try {
              const storedJudge = context.artifacts.load("judge");
              if (!storedJudge) throw new Error("missing judge artifact");
              const acceptedJudge = parseJudgeArtifact(storedJudge.artifact);
              const committedAt = now();
              if (acceptedJudge.primaryPlan.kind === "no_effect") {
                if (context.artifacts.load("game_master") !== null) {
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
              const storedGameMaster = context.artifacts.load("game_master");
              if (!storedGameMaster) throw new Error("missing game master artifact");
              const acceptedGameMaster = parseGameMasterArtifact(storedGameMaster.artifact);
              if (acceptedGameMaster.judgeArtifactHash !== storedJudge.artifactHash) {
                throw new Error("game master references another judge artifact");
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
              if (acceptedActorReplanCount(context.turn.turnId) >= 1) {
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
                temperature: input.actorReplannerModel.temperature,
                maxOutputTokens: input.actorReplannerModel.maximumOutputTokens,
                maximumInputTokens: input.actorReplannerModel.maximumInputTokens,
                maximumOutputTokens: input.actorReplannerModel.maximumOutputTokens,
                maximumTotalTokens: input.actorReplannerModel.maximumTotalTokens,
                maximumCostMicros: input.actorReplannerModel.maximumCostMicros,
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
          ready: () => artifacts.load("judge") !== null,
          execute(context) {
            visibility.projectTurn({
              token: context.token,
              actionContext: playerActionContext(context.turn, repository),
              sourceMoment: loadCampaignPlayPlayerActionAdmissionFrame(context.turn)
                .sourceNarration.displayText,
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
        if (
          replay.turnKind !== "player_action" || replay.document.turnKind !== "player_action" ||
          canonicalizeCampaignPlayProjection(replay.document.request) !==
            canonicalizeCampaignPlayProjection(request) ||
          canonicalizeCampaignPlayProjection(replay.modelSelection) !==
            canonicalizeCampaignPlayProjection(frozenSelection)
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
      return repository.admitTurn({
        turnId,
        supersedesTurnId: null,
        document: {
          turnKind: "player_action",
          request,
          frame: frame as unknown as CampaignPlayProjectionRecord,
        },
        modelSelection: frozenSelection,
        mutationId: runtimeId("player-action-admitted", { turnId }),
        submittedAt: admission.submittedAt,
      });
    },
    async runNextStage(turnId) {
      interruptExpiredActorReplanner();
      return service.runNextStage(turnId);
    },
    async recoverActiveTurn() {
      interruptExpiredActorReplanner();
      const active = repository.loadActiveTurn();
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
      const token = repository.claimStage({
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
      });
      const outcome = await actorReplanner.replan({
        jobId: interruptedJob.jobId,
        token,
        model: input.actorReplannerModel.languageModel,
        temperature: input.actorReplannerModel.temperature,
        maxOutputTokens: input.actorReplannerModel.maximumOutputTokens,
        maximumInputTokens: input.actorReplannerModel.maximumInputTokens,
        maximumOutputTokens: input.actorReplannerModel.maximumOutputTokens,
        maximumTotalTokens: input.actorReplannerModel.maximumTotalTokens,
        maximumCostMicros: input.actorReplannerModel.maximumCostMicros,
        createdAt: now(),
      });
      releaseActorBoundary(token, interruptedJob.jobId, outcome.kind);
      const settledTurn = repository.loadTurn(turn.turnId)!;
      return {
        turn: settledTurn,
        recovery: repository.loadRecoveryState(turn.turnId, now()),
        telemetry: null,
      };
    },
    loadTurn: (turnId) => repository.loadTurn(turnId),
    loadTelemetry: (turnId) => repository.loadTurnTelemetry(turnId),
  };
}
