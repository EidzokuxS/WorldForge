import type { LanguageModel } from "ai";
import { z } from "zod";
import type {
  CampaignPlayNarratorPacket,
  CampaignPlayOpeningAdmissionRequest,
  CampaignPlayTurnAdmissionResponse,
} from "@worldforge/shared";
import { CAMPAIGN_PLAY_LIMITS } from "@worldforge/shared";
import {
  CAMPAIGN_PLAY_COMMAND_METADATA,
  campaignPlayNarratorPacketSchema,
  campaignPlayOpeningAdmissionRequestSchema,
  validateNarrationAgainstPacket,
  type CampaignPlayEntityRef,
} from "./contracts.js";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import {
  canonicalizeCampaignPlayProjection,
  hashCampaignPlayProjection,
  type CampaignPlayProjectionRecord,
} from "./campaign-play-projection.js";
import { resolveCampaignPlayStartingConditions } from "./opening-options.js";
import {
  CampaignPlayOpeningPlannerError,
  campaignPlayOpeningArtifactSchema,
  campaignPlayResolvedStartingConditionsSchema,
  createCampaignPlayOpeningPlanner,
  type CampaignPlayOpeningArtifact,
  type CampaignPlayOpeningFrame,
  type CampaignPlayOpeningModelEvidence,
  type CampaignPlayOpeningPlanner,
  type CampaignPlayResolvedStartingConditions,
} from "./opening-planner.js";
import {
  CAMPAIGN_PLAY_OPENING_NARRATOR_MAX_OUTPUT_TOKENS,
  CampaignPlayNarratorError,
  createCampaignPlayNarrator,
  type CampaignPlayNarrator,
  type CampaignPlayNarratorBudget,
  type CampaignPlayNarratorModelEvidence,
} from "./narrator.js";
import {
  createCampaignPlayActorScheduler,
  type CampaignPlayActorScheduler,
} from "./actor-scheduler.js";
import {
  createCampaignPlayActorProposalService,
  type CampaignPlayActorProposalService,
} from "./actor-proposal-service.js";
import {
  executeCampaignPlayRulebookBatch,
  preflightCampaignPlayRulebook,
  type CampaignPlayRulebookAuthority,
  type CampaignPlayRulebookFrame,
} from "./rulebook.js";
import {
  createCampaignPlayStateRepository,
  loadCampaignPlayRulebookFrame,
  type LoadedCampaignPlayState,
} from "./campaign-play-state-repository.js";
import {
  createCampaignPlayTurnRepository,
  hashCampaignPlayNarratorPacket,
  type CampaignPlayExternalInterruptionEvidence,
  type CampaignPlayModelExecutionEvidence,
  type CampaignPlayRequestedModel,
  type CampaignPlayTurnModelSelection,
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
  createCampaignPlayVisibilityService,
  type CampaignPlayVisibilityService,
} from "./visibility-service.js";

const text = (maximum: number) => z.string().min(1).max(maximum)
  .refine((value) => value === value.trim());
const line = (maximum: number) => text(maximum)
  .refine((value) => !value.includes("\n") && !value.includes("\r"));
const hashSchema = z.string().length(64).refine((value) => [...value].every((character) =>
  (character >= "0" && character <= "9") || (character >= "a" && character <= "f")
));

const openingAdmissionFrameSchema = z.object({
  campaignId: line(256),
  turnId: line(256),
  acceptedWorldVersion: z.number().int().safe().positive(),
  acceptedContentHash: hashSchema,
  baseWorldVersion: z.number().int().safe().positive(),
  player: z.object({
    actorId: line(256),
    profileDigest: hashSchema,
    name: line(200),
    summary: text(2_000),
    traits: z.array(line(200)).max(32),
    tags: z.array(line(200)).max(32),
    motivations: z.array(line(CAMPAIGN_PLAY_LIMITS.label))
      .max(CAMPAIGN_PLAY_LIMITS.characterList * 2),
  }).strict(),
  startingConditions: campaignPlayResolvedStartingConditionsSchema,
}).strict();

type CampaignPlayOpeningAdmissionFrame = z.infer<typeof openingAdmissionFrameSchema>;

export type CampaignPlayOpeningRuntimeErrorCode =
  | "opening_request_invalid"
  | "opening_idempotency_conflict"
  | "opening_state_invalid"
  | "opening_player_invalid"
  | "opening_artifact_invalid"
  | "opening_narration_invalid";

export class CampaignPlayOpeningRuntimeError extends Error {
  constructor(
    readonly code: CampaignPlayOpeningRuntimeErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignPlayOpeningRuntimeError";
  }
}

export interface CampaignPlayOpeningRuntimeModel {
  languageModel: LanguageModel;
  requested: CampaignPlayRequestedModel;
  temperature: number;
  maxOutputTokens: number;
}

export interface CampaignPlayOpeningNarratorRuntimeModel {
  languageModel: LanguageModel;
  requested: CampaignPlayRequestedModel;
  temperature: number;
  maximumInputTokens: number;
  maximumOutputTokens: number;
  maximumTotalTokens: number;
  maximumCostMicros: number;
}

export interface CreateCampaignPlayOpeningRuntimeInput {
  handle: CampaignPlayDatabaseHandle;
  owner: string;
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
  externalOperationDeadlineMs?: number;
  openingPlannerModel: CampaignPlayOpeningRuntimeModel;
  narratorModel: CampaignPlayOpeningNarratorRuntimeModel;
  clock?: CampaignPlayTurnServiceClock;
  openingPlanner?: CampaignPlayOpeningPlanner;
  narrator?: CampaignPlayNarrator;
  visibility?: CampaignPlayVisibilityService;
  actorScheduler?: CampaignPlayActorScheduler;
  actorProposalService?: CampaignPlayActorProposalService;
}

export interface AdmitCampaignPlayOpeningInput {
  request: CampaignPlayOpeningAdmissionRequest;
  submittedAt: number;
}

export interface CampaignPlayOpeningRuntime {
  admitOpening(input: AdmitCampaignPlayOpeningInput): CampaignPlayTurnAdmissionResponse;
  runNextStage(turnId: string): Promise<CampaignPlayTurnServiceResult>;
  recoverActiveTurn(): Promise<CampaignPlayTurnServiceResult | null>;
  resumeInterruptedStage(input: ResumeCampaignPlayTurnInput): Promise<CampaignPlayTurnServiceResult>;
  loadTurn(turnId: string): LoadedCampaignPlayTurn | null;
}

interface PlayerRow {
  actorId: string;
  profileDigest: string;
  name: string;
  summary: string;
  traitsJson: string;
  tagsJson: string;
  recordJson: string;
}

interface PendingNarrationRow {
  narrationId: string;
  packetHash: string;
  packetJson: string;
  status: string;
  createdAt: number;
}

function runtimeId(domain: string, value: unknown): string {
  return `${domain}:${hashCampaignPlayProjection({ domain, value }).slice(0, 40)}`;
}

function modelSelection(input: CreateCampaignPlayOpeningRuntimeInput): CampaignPlayTurnModelSelection {
  return {
    turnKind: "opening",
    openingPlanner: input.openingPlannerModel.requested,
    narrator: input.narratorModel.requested,
  };
}

function assertModel(model: CampaignPlayOpeningRuntimeModel): void {
  if (
    model.requested.providerId.length === 0 || model.requested.model.length === 0 ||
    model.requested.strategy !== "strict_object" ||
    !Number.isFinite(model.temperature) ||
    !Number.isSafeInteger(model.maxOutputTokens) || model.maxOutputTokens < 1
  ) {
    throw new CampaignPlayOpeningRuntimeError(
      "opening_request_invalid",
      "Campaign Play opening model configuration is invalid.",
    );
  }
}

function assertNarratorModel(model: CampaignPlayOpeningNarratorRuntimeModel): void {
  const limits = [
    model.maximumInputTokens,
    model.maximumOutputTokens,
    model.maximumTotalTokens,
    model.maximumCostMicros,
  ];
  if (
    model.requested.providerId.length === 0 || model.requested.model.length === 0 ||
    model.requested.strategy !== "strict_object" || !Number.isFinite(model.temperature) ||
    limits.some((value) => !Number.isSafeInteger(value) || value < 1)
  ) {
    throw new CampaignPlayOpeningRuntimeError(
      "opening_request_invalid",
      "Campaign Play opening narrator configuration is invalid.",
    );
  }
}

function narratorBudget(
  model: CampaignPlayOpeningNarratorRuntimeModel,
): CampaignPlayNarratorBudget {
  const maximumOutputTokens = Math.min(
    model.maximumOutputTokens,
    CAMPAIGN_PLAY_OPENING_NARRATOR_MAX_OUTPUT_TOKENS,
  );
  return {
    maximumInputTokens: model.maximumInputTokens,
    maximumOutputTokens,
    maximumTotalTokens: Math.min(
      model.maximumTotalTokens,
      model.maximumInputTokens + maximumOutputTokens,
    ),
    maximumCostMicros: model.maximumCostMicros,
    inputCostMicrosPerMillionTokens: model.requested.pricing.inputCostMicros,
    outputCostMicrosPerMillionTokens: model.requested.pricing.outputCostMicros,
  };
}

function parseStringArray(value: string, label: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.some((entry) =>
      typeof entry !== "string" || entry.length === 0 || entry !== entry.trim()
    )) {
      throw new Error(label);
    }
    return parsed;
  } catch (cause) {
    throw new CampaignPlayOpeningRuntimeError(
      "opening_player_invalid",
      `Campaign Play player ${label} are invalid.`,
      { cause },
    );
  }
}

const openingPlayerRecordProjectionSchema = z.object({
  identity: z.object({
    id: line(CAMPAIGN_PLAY_LIMITS.id),
    campaignId: line(CAMPAIGN_PLAY_LIMITS.id),
    behavioralCore: z.object({
      motives: z.array(line(CAMPAIGN_PLAY_LIMITS.label))
        .max(CAMPAIGN_PLAY_LIMITS.characterList),
    }).passthrough().optional(),
  }).passthrough(),
  motivations: z.object({
    drives: z.array(line(CAMPAIGN_PLAY_LIMITS.label))
      .max(CAMPAIGN_PLAY_LIMITS.characterList),
  }).passthrough(),
}).passthrough();

function parsePlayerMotivations(row: PlayerRow, campaignId: string): string[] {
  let stored: unknown;
  try {
    stored = JSON.parse(row.recordJson) as unknown;
  } catch (cause) {
    throw new CampaignPlayOpeningRuntimeError(
      "opening_player_invalid",
      "Campaign Play player CharacterRecord is invalid.",
      { cause },
    );
  }
  const result = openingPlayerRecordProjectionSchema.safeParse(stored);
  if (
    !result.success
    || result.data.identity.id !== row.actorId
    || result.data.identity.campaignId !== campaignId
  ) {
    throw new CampaignPlayOpeningRuntimeError(
      "opening_player_invalid",
      "Campaign Play player CharacterRecord does not match its durable actor.",
      { cause: result.success ? undefined : result.error },
    );
  }
  return [...new Set([
    ...(result.data.identity.behavioralCore?.motives ?? []),
    ...result.data.motivations.drives,
  ])];
}

function loadPlayer(handle: CampaignPlayDatabaseHandle): CampaignPlayOpeningAdmissionFrame["player"] {
  const rows = handle.sqlite.prepare(`SELECT a.id AS actorId,
      c.record_hash AS profileDigest, a.name, a.summary,
      a.traits AS traitsJson, a.tags AS tagsJson,
      c.record_json AS recordJson
    FROM actors a
    JOIN campaign_play_characters c
      ON c.actor_id = a.id AND c.campaign_id = a.campaign_id
    WHERE a.campaign_id = ? AND a.kind = 'person' AND a.controller = 'human'
    ORDER BY a.id`).all(handle.campaignId) as PlayerRow[];
  if (rows.length !== 1) {
    throw new CampaignPlayOpeningRuntimeError(
      "opening_player_invalid",
      "Campaign Play opening requires one durable human player.",
    );
  }
  const row = rows[0]!;
  return openingAdmissionFrameSchema.shape.player.parse({
    actorId: row.actorId,
    profileDigest: row.profileDigest,
    name: row.name,
    summary: row.summary,
    traits: parseStringArray(row.traitsJson, "traits"),
    tags: parseStringArray(row.tagsJson, "tags"),
    motivations: parsePlayerMotivations(row, handle.campaignId),
  });
}

function resolveStartingConditions(
  request: CampaignPlayOpeningAdmissionRequest,
  state: LoadedCampaignPlayState,
): CampaignPlayResolvedStartingConditions {
  try {
    return campaignPlayResolvedStartingConditionsSchema.parse(
      resolveCampaignPlayStartingConditions(state, request.startingConditions),
    );
  } catch (cause) {
    throw new CampaignPlayOpeningRuntimeError(
      "opening_request_invalid",
      "Chosen opening conditions do not match the current Campaign Play options.",
      { cause },
    );
  }
}

function allRulebookRefs(frame: CampaignPlayRulebookFrame): CampaignPlayEntityRef[] {
  const values: CampaignPlayEntityRef[] = [
    ...(frame.human ? [{ kind: "actor" as const, id: frame.human.actorId }] : []),
    ...frame.acceptedWorld.actors.map((actor) => ({ kind: "actor" as const, id: actor.id })),
    ...frame.acceptedWorld.locations.map((location) => ({ kind: "location" as const, id: location.id })),
    ...frame.acceptedWorld.routes.map((route) => ({ kind: "route" as const, id: route.id })),
    ...frame.relations.map((relation) => ({ kind: "relation" as const, id: relation.relationId })),
    ...frame.goals.map((goal) => ({ kind: "goal" as const, id: goal.goalId })),
    ...frame.pressureStates.map((pressure) => ({ kind: "pressure" as const, id: pressure.pressureId })),
    ...frame.acceptedWorld.pressures.map((pressure) => ({ kind: "pressure" as const, id: pressure.id })),
  ];
  const unique = new Map(values.map((reference) => [
    `${reference.kind}\u0000${reference.id}`,
    reference,
  ]));
  return [...unique.values()];
}

function openingAuthority(
  frame: CampaignPlayRulebookFrame,
  turnId: string,
): CampaignPlayRulebookAuthority {
  if (!frame.human) {
    throw new CampaignPlayOpeningRuntimeError(
      "opening_player_invalid",
      "Campaign Play opening Rulebook frame lacks player authority.",
    );
  }
  return {
    purpose: "opening",
    turnId,
    actorId: frame.human.actorId,
    rootParent: { kind: "turn", turnId },
    authorizedRefs: allRulebookRefs(frame),
    witnessActorIds: [],
    knownWorldEventIds: [],
  };
}

function acceptedPlannerExecutionEvidence(
  requested: CampaignPlayRequestedModel,
  evidence: CampaignPlayOpeningModelEvidence,
  durationMs: number,
): CampaignPlayModelExecutionEvidence {
  if (
    evidence.actualStrategy === null || evidence.responseModel === null ||
    evidence.responseModel !== requested.model || evidence.totalAttempts !== 1 ||
    evidence.inputTokens === null || evidence.outputTokens === null ||
    evidence.finishReason === null || evidence.repairUsed || evidence.retryUsed ||
    evidence.textFallbackUsed || evidence.errorCode !== null
  ) {
    throw new CampaignPlayExternalStageInterruption({
      actualProviderId: requested.providerId,
      actualModel: evidence.responseModel ?? requested.model,
      actualStrategy: "strict_object",
      inputTokens: evidence.inputTokens,
      outputTokens: evidence.outputTokens,
      durationMs,
      finishReason: evidence.finishReason,
      schemaOutcome: "invalid",
      errorCode: "model_contract_invalid",
    });
  }
  return {
    actualProviderId: requested.providerId,
    actualModel: evidence.responseModel,
    actualStrategy: "strict_object",
    inputTokens: evidence.inputTokens,
    outputTokens: evidence.outputTokens,
    durationMs,
    finishReason: evidence.finishReason,
  };
}

function acceptedNarratorExecutionEvidence(
  requested: CampaignPlayRequestedModel,
  evidence: CampaignPlayNarratorModelEvidence,
): CampaignPlayModelExecutionEvidence {
  if (
    evidence.actualProviderId !== requested.providerId ||
    evidence.responseModel !== requested.model || evidence.totalAttempts !== 1 ||
    evidence.actualStrategy === null || evidence.inputTokens === null ||
    evidence.outputTokens === null || evidence.finishReason === null ||
    evidence.repairUsed || evidence.retryUsed || evidence.textFallbackUsed ||
    evidence.errorCode !== null
  ) {
    const hasActualIdentity = evidence.actualProviderId !== null &&
      evidence.responseModel !== null;
    throw new CampaignPlayExternalStageInterruption({
      actualProviderId: hasActualIdentity ? evidence.actualProviderId : null,
      actualModel: hasActualIdentity ? evidence.responseModel : null,
      actualStrategy: hasActualIdentity ? "strict_object" : null,
      inputTokens: evidence.inputTokens,
      outputTokens: evidence.outputTokens,
      durationMs: evidence.durationMs,
      finishReason: evidence.finishReason,
      schemaOutcome: "invalid",
      errorCode: "model_contract_invalid",
    });
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

function interruptionEvidence(
  requested: CampaignPlayRequestedModel,
  evidence: CampaignPlayOpeningModelEvidence | CampaignPlayNarratorModelEvidence | null,
  durationMs: number,
  errorCode: CampaignPlayExternalInterruptionEvidence["errorCode"],
): CampaignPlayExternalInterruptionEvidence {
  const narratorProvider = evidence !== null && "actualProviderId" in evidence
    ? evidence.actualProviderId
    : evidence === null
      ? null
      : requested.providerId;
  const hasActualIdentity = evidence?.actualStrategy !== null &&
    evidence?.actualStrategy !== undefined && narratorProvider !== null &&
    evidence.responseModel !== null;
  const measuredDuration = evidence !== null && "durationMs" in evidence
    ? evidence.durationMs
    : durationMs;
  return hasActualIdentity
    ? {
        actualProviderId: narratorProvider,
        actualModel: evidence.responseModel,
        actualStrategy: "strict_object",
        inputTokens: evidence.inputTokens,
        outputTokens: evidence.outputTokens,
        durationMs: measuredDuration,
        finishReason: evidence.finishReason,
        schemaOutcome: errorCode === "model_contract_invalid" || errorCode === "narration_invalid"
          ? "invalid"
          : "transport_error",
        errorCode,
      }
    : {
        actualProviderId: null,
        actualModel: null,
        actualStrategy: null,
        inputTokens: evidence?.inputTokens ?? null,
        outputTokens: evidence?.outputTokens ?? null,
        durationMs: measuredDuration,
        finishReason: evidence?.finishReason ?? null,
        schemaOutcome: errorCode === "model_contract_invalid" || errorCode === "narration_invalid"
          ? "invalid"
          : "transport_error",
        errorCode,
      };
}

function pendingNarration(
  handle: CampaignPlayDatabaseHandle,
  turn: LoadedCampaignPlayTurn,
): PendingNarrationRow & { packet: CampaignPlayNarratorPacket } {
  const row = handle.sqlite.prepare(`SELECT narration_id AS narrationId,
      packet_hash AS packetHash, packet_json AS packetJson, status,
      created_at AS createdAt
    FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?`).get(
      handle.campaignId,
      turn.turnId,
    ) as PendingNarrationRow | undefined;
  if (!row || row.status !== "pending" || row.packetHash !== turn.publicPacketHash) {
    throw new CampaignPlayOpeningRuntimeError(
      "opening_narration_invalid",
      "Campaign Play opening lacks its exact pending narration packet.",
    );
  }
  const parsed = JSON.parse(row.packetJson) as unknown;
  const packet = campaignPlayNarratorPacketSchema.parse(parsed);
  if (
    canonicalizeCampaignPlayProjection(packet) !== row.packetJson ||
    packet.turnId !== turn.turnId || packet.turnKind !== "opening" ||
    hashCampaignPlayNarratorPacket(
      turn.turnId,
      parsed as CampaignPlayProjectionRecord,
    ) !== row.packetHash
  ) {
    throw new CampaignPlayOpeningRuntimeError(
      "opening_narration_invalid",
      "Campaign Play opening narrator packet failed its durable identity check.",
    );
  }
  return { ...row, packet };
}

export function createCampaignPlayOpeningRuntime(
  input: CreateCampaignPlayOpeningRuntimeInput,
): CampaignPlayOpeningRuntime {
  assertModel(input.openingPlannerModel);
  assertNarratorModel(input.narratorModel);
  const externalOperationDeadlineMs = input.externalOperationDeadlineMs ?? 90_000;
  if (!Number.isSafeInteger(externalOperationDeadlineMs) || externalOperationDeadlineMs <= 0) {
    throw new CampaignPlayOpeningRuntimeError(
      "opening_state_invalid",
      "Campaign Play opening requires a positive external operation deadline.",
    );
  }
  const repository = createCampaignPlayTurnRepository(input.handle);
  const stateRepository = createCampaignPlayStateRepository(input.handle);
  const scheduler = input.actorScheduler ?? createCampaignPlayActorScheduler(input.handle);
  const planner = input.openingPlanner ?? createCampaignPlayOpeningPlanner();
  const narrator = input.narrator ?? createCampaignPlayNarrator();
  const visibility = input.visibility ?? createCampaignPlayVisibilityService(input.handle);
  const selection = modelSelection(input);
  const now = (): number => {
    const value = input.clock?.now() ?? Date.now();
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new CampaignPlayOpeningRuntimeError(
        "opening_state_invalid",
        "Campaign Play opening clock returned an invalid timestamp.",
      );
    }
    return value;
  };
  const actorProposalService = input.actorProposalService ??
    createCampaignPlayActorProposalService(input.handle, { now });

  const releaseActorBoundary = (
    token: CampaignPlayWorkerLeaseToken,
    jobId: string,
    outcome: string,
  ): void => {
    const committedAt = now();
    repository.commitDeterministic({
      token,
      transition: "actor_job_transitioned",
      worldVersionAdvance: 0,
      committedAt,
      mutationId: runtimeId("opening-actor-boundary-released", {
        turnId: token.turnId,
        epoch: token.epoch,
        jobId,
        outcome,
      }),
    });
  };

  const loadAdmissionFrame = (turn: LoadedCampaignPlayTurn): CampaignPlayOpeningAdmissionFrame => {
    if (turn.turnKind !== "opening" || turn.document.turnKind !== "opening") {
      throw new CampaignPlayOpeningRuntimeError(
        "opening_state_invalid",
        "Campaign Play opening runtime received another turn kind.",
      );
    }
    return openingAdmissionFrameSchema.parse(turn.document.frame);
  };

  const loadPlannerFrame = (turn: LoadedCampaignPlayTurn): {
    frame: CampaignPlayOpeningFrame;
    startingConditions: CampaignPlayResolvedStartingConditions;
  } => {
    const admitted = loadAdmissionFrame(turn);
    const state = stateRepository.loadState();
    if (
      !state || state.authority.acceptedWorldVersion !== admitted.acceptedWorldVersion ||
      state.authority.acceptedContentHash !== admitted.acceptedContentHash ||
      state.authority.worldVersion !== admitted.baseWorldVersion ||
      canonicalizeCampaignPlayProjection(loadPlayer(input.handle)) !==
        canonicalizeCampaignPlayProjection(admitted.player)
    ) {
      throw new CampaignPlayOpeningRuntimeError(
        "opening_state_invalid",
        "Campaign Play opening planner frame no longer matches durable authority.",
      );
    }
    return {
      frame: {
        campaignId: admitted.campaignId,
        turnId: admitted.turnId,
        acceptedWorldVersion: admitted.acceptedWorldVersion,
        acceptedContentHash: admitted.acceptedContentHash,
        baseWorldVersion: admitted.baseWorldVersion,
        player: admitted.player,
        acceptedWorld: state.acceptedReview,
      },
      startingConditions: admitted.startingConditions,
    };
  };

  const preflightArtifact = (artifact: CampaignPlayOpeningArtifact) => {
    const frame = loadCampaignPlayRulebookFrame(input.handle);
    if (
      frame.setupPhase !== "opening_required" || frame.worldTimeMinutes !== null ||
      frame.worldVersion !== artifact.baseWorldVersion ||
      frame.campaignId !== artifact.campaignId
    ) {
      throw new CampaignPlayOpeningRuntimeError(
        "opening_artifact_invalid",
        "Campaign Play opening artifact does not match pre-settlement Rulebook authority.",
      );
    }
    const first = artifact.bootstrapCommands[0];
    const batch = {
      batchId: first?.batchId ?? "",
      baseWorldVersion: artifact.baseWorldVersion,
      commands: artifact.bootstrapCommands,
    };
    const result = preflightCampaignPlayRulebook({
      frame,
      authority: openingAuthority(frame, artifact.turnId),
      batch,
    });
    if (!result.accepted) {
      throw new CampaignPlayOpeningRuntimeError(
        "opening_artifact_invalid",
        `Campaign Play opening Rulebook denied ${result.denial.code}.`,
      );
    }
    return { frame, accepted: result };
  };

  const service: CampaignPlayTurnService = createCampaignPlayTurnService({
    handle: input.handle,
    owner: input.owner,
    leaseDurationMs: input.leaseDurationMs,
    heartbeatIntervalMs: input.heartbeatIntervalMs,
    externalOperationDeadlineMs,
    clock: input.clock,
    resolveStage({ turn, stage, artifacts }) {
      if (turn.turnKind !== "opening") return null;
      if (stage === "admitted") {
        return {
          kind: "external",
          async execute(context) {
            const startedAt = now();
            try {
              const admitted = loadPlannerFrame(context.turn);
              const candidate = await planner.plan({
                frame: admitted.frame,
                startingConditions: admitted.startingConditions,
                model: input.openingPlannerModel.languageModel,
                temperature: input.openingPlannerModel.temperature,
                maxOutputTokens: input.openingPlannerModel.maxOutputTokens,
                signal: context.signal,
              });
              preflightArtifact(candidate.artifact);
              return {
                commit({ token, completedAt }) {
                  const evidence = acceptedPlannerExecutionEvidence(
                    input.openingPlannerModel.requested,
                    candidate.modelEvidence,
                    completedAt - startedAt,
                  );
                  repository.acceptModelArtifact({
                    token,
                    artifact: candidate.artifact,
                    evidence,
                    mutationDomain: "runtime",
                    acceptedAt: completedAt,
                    mutationId: runtimeId("opening-planner-accepted", {
                      turnId: token.turnId,
                      epoch: token.epoch,
                    }),
                  });
                  return undefined;
                },
              };
            } catch (cause) {
              if (cause instanceof CampaignPlayExternalStageInterruption) throw cause;
              const modelEvidence = cause instanceof CampaignPlayOpeningPlannerError
                ? cause.modelEvidence
                : null;
              const plannerError = cause instanceof CampaignPlayOpeningPlannerError
                ? cause
                : null;
              const errorCode = plannerError?.code === "transport_interrupted"
                ? "provider_unavailable"
                : plannerError || cause instanceof CampaignPlayOpeningRuntimeError
                  ? "model_contract_invalid"
                  : "provider_unavailable";
              throw new CampaignPlayExternalStageInterruption(
                interruptionEvidence(
                  input.openingPlannerModel.requested,
                  modelEvidence,
                  now() - startedAt,
                  errorCode,
                ),
                "Campaign Play opening planner requires explicit resume.",
                { cause },
              );
            }
          },
        };
      }
      if (stage === "planned") {
        return {
          kind: "deterministic",
          ready: () => artifacts.load("opening_planner") !== null,
          execute(context) {
            const stored = context.artifacts.load("opening_planner");
            let artifact: CampaignPlayOpeningArtifact;
            try {
              artifact = campaignPlayOpeningArtifactSchema.parse(stored?.artifact);
              if (
                artifact.turnId !== context.turn.turnId ||
                artifact.campaignId !== input.handle.campaignId
              ) {
                throw new Error("opening artifact identity");
              }
              const { frame, accepted } = preflightArtifact(artifact);
              const committedAt = now();
              repository.commitDeterministic({
                token: context.token,
                transition: "primary_settled",
                worldVersionAdvance: artifact.bootstrapCommands.filter((command) =>
                  CAMPAIGN_PLAY_COMMAND_METADATA[command.kind].mechanicalMutation).length,
                committedAt,
                mutationId: runtimeId("opening-primary-settled", {
                  turnId: context.turn.turnId,
                  epoch: context.token.epoch,
                }),
                mutate(mutationContext) {
                  executeCampaignPlayRulebookBatch({
                    frame,
                    accepted,
                    context: mutationContext,
                    turnId: context.turn.turnId,
                    createdAt: committedAt,
                  });
                  scheduler.initializeOpeningActors({
                    plans: artifact.actorPlans,
                    schedules: artifact.actorSchedules,
                    context: mutationContext,
                    createdAt: committedAt,
                  });
                  const stateUpdate = mutationContext.sqlite.prepare(`UPDATE campaign_play_states
                    SET setup_phase = 'ready', opened_at = ?
                    WHERE campaign_id = ? AND setup_phase = 'opening_required'
                      AND world_time_minutes = 0 AND opened_at IS NULL`).run(
                        committedAt,
                        input.handle.campaignId,
                      );
                  if (stateUpdate.changes !== 1) {
                    throw new CampaignPlayOpeningRuntimeError(
                      "opening_state_invalid",
                      "Campaign Play opening lost its mechanical-ready boundary.",
                    );
                  }
                },
              });
            } catch (cause) {
              if (cause instanceof Error && cause.name === "CampaignPlayTurnRepositoryError") {
                throw cause;
              }
              repository.failTurn({
                token: context.token,
                errorCode: "stale_artifact",
                publicErrorCode: "turn_failed",
                mutationAudit: {
                  worldVersionAdvance: 0,
                  commands: 0,
                  receipts: 0,
                  actorPlans: 0,
                  actorSchedules: 0,
                },
                modelEvidence: null,
                failedAt: now(),
                mutationId: runtimeId("opening-pre-settlement-failed", {
                  turnId: context.turn.turnId,
                  epoch: context.token.epoch,
                }),
              });
            }
          },
        };
      }
      if (stage === "primary_settled") {
        return {
          kind: "deterministic",
          ready: ({ turn: currentTurn }) => {
            const stored = artifacts.load("opening_planner");
            if (stored === null) return false;
            const artifact = campaignPlayOpeningArtifactSchema.parse(stored.artifact);
            if (artifact.actorPlans.length === 0) return true;
            const dueSet = scheduler.loadDueSet(currentTurn.turnId);
            if (!dueSet) return true;
            const jobs = scheduler.listTurnJobs(currentTurn.turnId);
            if (jobs.some((job) => job.stage === "interrupted")) return false;
            if (jobs.some((job) =>
              ["queued", "claimed", "proposed"].includes(job.stage))) return true;
            scheduler.validateTurnSettlement(currentTurn.turnId);
            return true;
          },
          execute(context) {
            const artifact = campaignPlayOpeningArtifactSchema.parse(
              context.artifacts.load("opening_planner")?.artifact,
            );
            if (artifact.actorPlans.length === 0) {
              const committedAt = now();
              repository.commitDeterministic({
                token: context.token,
                transition: "actors_settled",
                worldVersionAdvance: 0,
                committedAt,
                mutationId: runtimeId("opening-actors-deferred", {
                  turnId: context.turn.turnId,
                  epoch: context.token.epoch,
                }),
                mutate(mutationContext) {
                  scheduler.validateOpeningActors({
                    plans: artifact.actorPlans,
                    schedules: artifact.actorSchedules,
                    turnId: context.turn.turnId,
                    context: mutationContext,
                  });
                },
              });
              return;
            }
            const dueSet = scheduler.loadDueSet(context.turn.turnId);
            if (!dueSet) {
              const state = stateRepository.loadState();
              if (!state || state.authority.worldTimeMinutes === null) {
                throw new CampaignPlayOpeningRuntimeError(
                  "opening_state_invalid",
                  "Campaign Play opening actor scheduling requires settled world time.",
                );
              }
              const frozen = scheduler.freezeOpeningDueSet({
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
                mutationId: runtimeId("opening-actor-due-set-admitted", {
                  turnId: context.turn.turnId,
                  epoch: context.token.epoch,
                  dueSetHash: hashCampaignPlayProjection(frozen),
                }),
                mutate(mutationContext) {
                  scheduler.validateOpeningActors({
                    plans: artifact.actorPlans,
                    schedules: artifact.actorSchedules,
                    turnId: context.turn.turnId,
                    context: mutationContext,
                  });
                  scheduler.admitDueSet({
                    dueSet: frozen,
                    context: mutationContext,
                    createdAt: committedAt,
                  });
                },
              });
              return;
            }
            const next = scheduler.listTurnJobs(context.turn.turnId).find((job) =>
              ["queued", "claimed", "proposed"].includes(job.stage));
            if (next) {
              const outcome = actorProposalService.processNext({
                turnId: context.turn.turnId,
                token: context.token,
                createdAt: now(),
                openingExposureSeed: artifact.exposureSeed,
              });
              if (!outcome || outcome.kind === "replan_required") {
                throw new CampaignPlayOpeningRuntimeError(
                  "opening_artifact_invalid",
                  "Campaign Play opening actor plan requires an unplanned replacement.",
                );
              }
              releaseActorBoundary(context.token, outcome.jobId, outcome.kind);
              return;
            }
            const jobs = scheduler.validateTurnSettlement(context.turn.turnId);
            if (jobs.some((job) => job.stage !== "settled")) {
              throw new CampaignPlayOpeningRuntimeError(
                "opening_artifact_invalid",
                "Campaign Play opening requires every admitted actor action to settle.",
              );
            }
            repository.commitDeterministic({
              token: context.token,
              transition: "actors_settled",
              worldVersionAdvance: 0,
              committedAt: now(),
              mutationId: runtimeId("opening-actors-settled", {
                turnId: context.turn.turnId,
                epoch: context.token.epoch,
                dueSetHash: hashCampaignPlayProjection(dueSet),
              }),
              mutate(mutationContext) {
                scheduler.validateTurnSettlement(context.turn.turnId, mutationContext);
              },
            });
          },
        };
      }
      if (stage === "actors_settled") {
        return {
          kind: "deterministic",
          ready: () => artifacts.load("opening_planner") !== null,
          execute(context) {
            const committedAt = now();
            visibility.projectTurn({
              token: context.token,
              actionContext: null,
              sourceMoment: null,
              committedAt,
              mutationId: runtimeId("opening-visibility-projected", {
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
            try {
              const pending = pendingNarration(input.handle, context.turn);
              const candidate = await narrator.narrate({
                narrationId: pending.narrationId,
                packetBytes: pending.packetJson,
                createdAt: pending.createdAt,
                model: input.narratorModel.languageModel,
                temperature: input.narratorModel.temperature,
                budget: narratorBudget(input.narratorModel),
                signal: context.signal,
              });
              validateNarrationAgainstPacket(candidate.narration, pending.packet);
              const executionEvidence = acceptedNarratorExecutionEvidence(
                input.narratorModel.requested,
                candidate.modelEvidence,
              );
              return {
                commit({ token, completedAt }) {
                  repository.acceptModelArtifact({
                    token,
                    artifact: candidate.narration,
                    evidence: executionEvidence,
                    mutationDomain: "narration",
                    publicPacketHash: pending.packetHash,
                    acceptedAt: completedAt,
                    mutationId: runtimeId("opening-narration-completed", {
                      turnId: token.turnId,
                      epoch: token.epoch,
                    }),
                    mutate(mutationContext) {
                      const narration = candidate.narration;
                      const narrationUpdate = mutationContext.sqlite.prepare(`UPDATE campaign_play_narrations
                        SET status = 'complete', beats_json = ?, display_text = ?,
                          suggested_actions_json = ?, effects_json = ?, completed_at = ?
                        WHERE narration_id = ? AND campaign_id = ? AND turn_id = ?
                          AND status = 'pending' AND packet_hash = ? AND packet_json = ?`)
                        .run(
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
                      if (narrationUpdate.changes !== 1) {
                        throw new CampaignPlayOpeningRuntimeError(
                          "opening_narration_invalid",
                          "Campaign Play opening narration lost its atomic completion boundary.",
                        );
                      }
                    },
                  });
                  return undefined;
                },
              };
            } catch (cause) {
              if (cause instanceof CampaignPlayExternalStageInterruption) throw cause;
              const modelEvidence = cause instanceof CampaignPlayNarratorError
                ? cause.modelEvidence
                : null;
              const narratorError = cause instanceof CampaignPlayNarratorError ? cause : null;
              const errorCode = narratorError?.code === "stage_timeout"
                ? "stage_timeout"
                : narratorError?.code === "stage_budget_exceeded"
                  ? "stage_budget_exceeded"
                  : narratorError?.code === "transport_interrupted"
                    ? "provider_unavailable"
                    : narratorError || cause instanceof CampaignPlayOpeningRuntimeError
                      ? "narration_invalid"
                      : "provider_unavailable";
              throw new CampaignPlayExternalStageInterruption(
                interruptionEvidence(
                  input.narratorModel.requested,
                  modelEvidence,
                  now() - startedAt,
                  errorCode,
                ),
                "Campaign Play narrator requires explicit resume.",
                { cause },
              );
            }
          },
        };
      }
      return null;
    },
  });

  return {
    admitOpening(admission) {
      let request: CampaignPlayOpeningAdmissionRequest;
      try {
        request = campaignPlayOpeningAdmissionRequestSchema.parse(admission.request);
      } catch (cause) {
        throw new CampaignPlayOpeningRuntimeError(
          "opening_request_invalid",
          "Campaign Play opening request is invalid.",
          { cause },
        );
      }
      if (!Number.isSafeInteger(admission.submittedAt) || admission.submittedAt < 0) {
        throw new CampaignPlayOpeningRuntimeError(
          "opening_request_invalid",
          "Campaign Play opening submission time is invalid.",
        );
      }
      const turnId = runtimeId("turn-opening", {
        campaignId: input.handle.campaignId,
        idempotencyKey: request.idempotencyKey,
      });
      const replay = repository.loadTurn(turnId);
      if (replay) {
        if (
          replay.turnKind !== "opening" || replay.document.turnKind !== "opening" ||
          canonicalizeCampaignPlayProjection(replay.document.request) !==
            canonicalizeCampaignPlayProjection(request) ||
          canonicalizeCampaignPlayProjection(replay.modelSelection) !==
            canonicalizeCampaignPlayProjection(selection)
        ) {
          throw new CampaignPlayOpeningRuntimeError(
            "opening_idempotency_conflict",
            "Campaign Play idempotency key belongs to another opening request.",
          );
        }
        return repository.admitTurn({
          turnId: replay.turnId,
          supersedesTurnId: replay.supersedesTurnId,
          document: replay.document,
          modelSelection: replay.modelSelection,
          mutationId: runtimeId("opening-admitted", { turnId: replay.turnId }),
          submittedAt: replay.submittedAt,
        });
      }
      const state = stateRepository.loadState();
      if (
        !state || state.authority.setupPhase !== "opening_required" ||
        !state.eligibility.projection.eligible ||
        request.expectedWorldVersion !== state.authority.worldVersion ||
        request.expectedRuntimeRevision !== state.authority.runtimeRevision
      ) {
        throw new CampaignPlayOpeningRuntimeError(
          "opening_state_invalid",
          "Campaign Play opening request does not match current play authority.",
        );
      }
      const startingConditions = resolveStartingConditions(
        request,
        state,
      );
      const frame = openingAdmissionFrameSchema.parse({
        campaignId: input.handle.campaignId,
        turnId,
        acceptedWorldVersion: state.authority.acceptedWorldVersion,
        acceptedContentHash: state.authority.acceptedContentHash,
        baseWorldVersion: state.authority.worldVersion,
        player: loadPlayer(input.handle),
        startingConditions,
      });
      const superseded = repository.loadSupersedableOpening();
      return repository.admitTurn({
        turnId,
        supersedesTurnId: superseded?.turnId ?? null,
        document: {
          turnKind: "opening",
          request,
          frame: frame as unknown as CampaignPlayProjectionRecord,
        },
        modelSelection: selection,
        mutationId: runtimeId("opening-admitted", { turnId }),
        submittedAt: admission.submittedAt,
      });
    },
    runNextStage: (turnId) => service.runNextStage(turnId),
    recoverActiveTurn: () => service.recoverActiveTurn(),
    resumeInterruptedStage: (resume) => service.resumeInterruptedStage(resume),
    loadTurn: (turnId) => repository.loadTurn(turnId),
  };
}
