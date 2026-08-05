import crypto from "node:crypto";
import type { LanguageModel } from "ai";
import type {
  CampaignPlayCharacterDraftResponse,
  CampaignPlayCharacterResearchResponse,
  CampaignPlayGeneratePlayerDraftRequest,
  CampaignPlayJournalPage,
  CampaignPlayNarrationRecoveryRequest,
  CampaignPlayNarrationRecoveryResponse,
  CampaignPlayOpeningAdmissionRequest,
  CampaignPlayParsePlayerCardRequest,
  CampaignPlayPutPlayerRequest,
  CampaignPlayPutPlayerResponse,
  CampaignPlayResearchPlayerRequest,
  CampaignPlayResumeTurnRequest,
  CampaignPlaySseEvent,
  CampaignPlayState,
  CampaignPlayTurnAdmissionRequest,
  CampaignPlayTurnAdmissionResponse,
  CampaignPlayTurnReadResponse,
  CampaignPlayPublicErrorCode,
  Settings,
} from "@worldforge/shared";
import { isLocalProvider } from "@worldforge/shared";
import { createModel, resolveRoleModel, type ResolvedRole } from "../ai/index.js";
import { loadSettings } from "../settings/index.js";
import {
  openCampaignPlayDatabase,
  type CampaignPlayDatabaseHandle,
} from "./campaign-play-database.js";
import {
  campaignPlayCharacterDraftResponseSchema,
  campaignPlayOpeningAdmissionRequestSchema,
  campaignPlayNarrationRecoveryRequestSchema,
  campaignPlayNarrationRecoveryResponseSchema,
  campaignPlayPutPlayerRequestSchema,
  campaignPlayPutPlayerResponseSchema,
  campaignPlayResumeTurnRequestSchema,
  campaignPlayTurnAdmissionRequestSchema,
} from "./contracts.js";
import {
  campaignPlayCharacterService,
  CampaignPlayCharacterServiceError,
  type CampaignPlayCharacterContext,
  type CampaignPlayCharacterService,
} from "./character-service.js";
import {
  bootstrapCampaignPlayPlayer,
  CampaignPlayPlayerBootstrapError,
} from "./player-bootstrap.js";
import {
  createCampaignPlayStateRepository,
  CampaignPlayStateRepositoryError,
  type LoadedCampaignPlayState,
} from "./campaign-play-state-repository.js";
import {
  createCampaignPlayTurnRepository,
  CampaignPlayTurnRepositoryError,
  type CampaignPlayModelPricing,
  type CampaignPlayRequestedModel,
  type CampaignPlayTurnModelSelection,
  type LoadedCampaignPlayTurn,
} from "./campaign-play-turn-repository.js";
import {
  createCampaignPlayOpeningRuntime,
  CampaignPlayOpeningRuntimeError,
  type CampaignPlayOpeningRuntime,
} from "./opening-runtime.js";
import {
  createCampaignPlayTurnRuntime,
  CampaignPlayTurnRuntimeError,
  type CampaignPlayTurnRuntime,
  type CampaignPlayTurnRuntimeStageModel,
} from "./turn-runtime.js";
import {
  createCampaignPlayNarrationOperationRepository,
  CampaignPlayNarrationOperationError,
  type CampaignPlayNarrationAttemptToken,
} from "./narration-operation-repository.js";
import {
  canonicalizeCampaignPlayProjection,
  deriveCampaignPlayPublicHandle,
  hashCampaignPlayProjection,
  type CampaignPlayEligibilityRequirementCode,
} from "./campaign-play-projection.js";
import {
  createCampaignPlayReadModel,
  type CampaignPlayReadModel,
} from "./campaign-play-read-model.js";

const LEASE_DURATION_MS = 150_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const MAXIMUM_INPUT_TOKENS = 64_000;
export const CAMPAIGN_PLAY_MINIMUM_OUTPUT_TOKENS = 32_768;
const MAXIMUM_COST_MICROS = Number.MAX_SAFE_INTEGER;

const UNKNOWN_MODEL_PRICING: CampaignPlayModelPricing = Object.freeze({
  known: false,
  currency: "USD",
  tokenUnit: 1_000_000,
  inputCostMicros: 0,
  outputCostMicros: 0,
  rounding: "ceil",
});

export class CampaignPlayApplicationError extends Error {
  constructor(
    readonly publicCode: CampaignPlayPublicErrorCode,
    message: string,
    readonly unmetRequirements: CampaignPlayEligibilityRequirementCode[] = [],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignPlayApplicationError";
  }
}

interface CampaignPlayRuntimeFactory {
  createOpening(
    handle: CampaignPlayDatabaseHandle,
    selection?: CampaignPlayTurnModelSelection,
  ): CampaignPlayOpeningRuntime;
  createTurn(
    handle: CampaignPlayDatabaseHandle,
    selection?: CampaignPlayTurnModelSelection,
  ): CampaignPlayTurnRuntime;
}

interface CampaignPlayApplicationDependencies {
  openDatabase: typeof openCampaignPlayDatabase;
  loadSettings: typeof loadSettings;
  createModel: typeof createModel;
  characterService: CampaignPlayCharacterService;
  createReadModel: (handle: CampaignPlayDatabaseHandle) => CampaignPlayReadModel;
  runtimeFactory?: CampaignPlayRuntimeFactory;
  now: () => number;
  owner: string;
  uncertaintySeedKey: (campaignId: string, acceptedContentHash: string) => string;
  setTimer: (callback: () => void, delayMilliseconds: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
}

export interface CampaignPlayApplication {
  loadState(campaignId: string): CampaignPlayState;
  loadTurn(campaignId: string, turnId: string): CampaignPlayTurnReadResponse;
  loadJournal(campaignId: string, cursor: number, limit: number): CampaignPlayJournalPage;
  listTurnEvents(
    campaignId: string,
    turnId: string,
    afterSequence: number,
  ): CampaignPlaySseEvent[];
  parsePlayerCard(
    campaignId: string,
    request: CampaignPlayParsePlayerCardRequest,
  ): Promise<CampaignPlayCharacterDraftResponse>;
  generatePlayerDraft(
    campaignId: string,
    request: CampaignPlayGeneratePlayerDraftRequest,
  ): Promise<CampaignPlayCharacterDraftResponse>;
  researchPlayer(
    campaignId: string,
    request: CampaignPlayResearchPlayerRequest,
  ): Promise<CampaignPlayCharacterResearchResponse>;
  putPlayer(
    campaignId: string,
    request: CampaignPlayPutPlayerRequest,
  ): CampaignPlayPutPlayerResponse;
  admitOpening(
    campaignId: string,
    request: CampaignPlayOpeningAdmissionRequest,
  ): CampaignPlayTurnAdmissionResponse;
  admitTurn(
    campaignId: string,
    request: CampaignPlayTurnAdmissionRequest,
  ): CampaignPlayTurnAdmissionResponse;
  resumeTurn(
    campaignId: string,
    turnId: string,
    request: CampaignPlayResumeTurnRequest,
  ): CampaignPlayTurnAdmissionResponse;
  recoverNarration(
    campaignId: string,
    turnId: string,
    request: CampaignPlayNarrationRecoveryRequest,
  ): CampaignPlayNarrationRecoveryResponse;
  recoverCampaign(campaignId: string): Promise<void>;
  waitForIdle(campaignId: string): Promise<void>;
}

function fail(
  publicCode: CampaignPlayPublicErrorCode,
  message: string,
  cause?: unknown,
  unmetRequirements: CampaignPlayEligibilityRequirementCode[] = [],
): never {
  throw new CampaignPlayApplicationError(
    publicCode,
    message,
    unmetRequirements,
    cause === undefined ? undefined : { cause },
  );
}

function validateProvider(roleName: string, role: ResolvedRole): ResolvedRole {
  if (
    role.provider.id.length === 0 || role.provider.baseUrl.trim().length === 0 ||
    role.provider.model.trim().length === 0 ||
    (!isLocalProvider(role.provider.baseUrl) && role.provider.apiKey.trim().length === 0)
  ) {
    fail("service_unavailable", `${roleName} model is unavailable.`);
  }
  return role;
}

function currentRole(
  settings: Settings,
  roleName: string,
  role: Settings["generator"],
): ResolvedRole {
  try {
    return validateProvider(roleName, resolveRoleModel(role, settings.providers));
  } catch (cause) {
    if (cause instanceof CampaignPlayApplicationError) throw cause;
    return fail("service_unavailable", `${roleName} model is unavailable.`, cause);
  }
}

function frozenRole(
  settings: Settings,
  roleName: string,
  role: Settings["generator"],
  requested: CampaignPlayRequestedModel,
): ResolvedRole {
  const provider = settings.providers.find((candidate) => candidate.id === requested.providerId);
  if (!provider) {
    return fail("service_unavailable", `${roleName} provider is unavailable.`);
  }
  return validateProvider(roleName, {
    provider: {
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: requested.model,
    },
    temperature: role.temperature,
    maxTokens: role.maxTokens,
  });
}

function requestedModel(role: ResolvedRole): CampaignPlayRequestedModel {
  return resolveCampaignPlayRequestedModel(role);
}

export function campaignPlayMaximumOutputTokens(configuredTokens: number): number {
  return Math.max(CAMPAIGN_PLAY_MINIMUM_OUTPUT_TOKENS, configuredTokens);
}

export function resolveCampaignPlayRequestedModel(
  role: ResolvedRole,
): CampaignPlayRequestedModel {
  const pricing: CampaignPlayModelPricing = role.pricing
    ? {
        known: true,
        currency: role.pricing.currency,
        tokenUnit: role.pricing.tokenUnit,
        inputCostMicros: role.pricing.inputCostMicros,
        outputCostMicros: role.pricing.outputCostMicros,
        rounding: "ceil",
      }
    : UNKNOWN_MODEL_PRICING;
  return {
    providerId: role.provider.id,
    model: role.provider.model,
    strategy: "strict_object",
    pricing,
  };
}

function stageModel(
  role: ResolvedRole,
  requested: CampaignPlayRequestedModel,
  languageModel: LanguageModel,
): CampaignPlayTurnRuntimeStageModel {
  const maximumOutputTokens = campaignPlayMaximumOutputTokens(role.maxTokens);
  return {
    languageModel,
    requested,
    temperature: role.temperature,
    maximumInputTokens: MAXIMUM_INPUT_TOKENS,
    maximumOutputTokens,
    maximumTotalTokens: MAXIMUM_INPUT_TOKENS + maximumOutputTokens,
    maximumCostMicros: MAXIMUM_COST_MICROS,
  };
}

function stateEventId(campaignId: string): string {
  return `play-state:${hashCampaignPlayProjection({
    domain: "campaign_play_state_creation",
    campaignId,
  }).slice(0, 40)}`;
}

function assertExpectedVersions(
  state: LoadedCampaignPlayState,
  expected: { expectedWorldVersion: number; expectedRuntimeRevision: number },
): void {
  if (expected.expectedWorldVersion !== state.authority.worldVersion) {
    fail("stale_world_version", "Campaign Play world version is stale.");
  }
  if (expected.expectedRuntimeRevision !== state.authority.runtimeRevision) {
    fail("stale_runtime_revision", "Campaign Play runtime revision is stale.");
  }
}

function ensureState(
  handle: CampaignPlayDatabaseHandle,
  now: number,
): LoadedCampaignPlayState {
  const repository = createCampaignPlayStateRepository(handle);
  const loaded = repository.loadState();
  if (loaded) return loaded;
  try {
    return repository.createState({
      eventId: stateEventId(handle.campaignId),
      createdAt: now,
    });
  } catch (cause) {
    if (
      cause instanceof CampaignPlayStateRepositoryError &&
      cause.code === "play_state_exists"
    ) {
      const raced = repository.loadState();
      if (raced) return raced;
    }
    throw cause;
  }
}

function mapFailure(error: unknown): never {
  if (error instanceof CampaignPlayApplicationError) throw error;
  if (error instanceof CampaignPlayCharacterServiceError) {
    return fail(error.publicCode, "Campaign Play character request failed.", error);
  }
  if (error instanceof CampaignPlayPlayerBootstrapError) {
    if (error.code === "bootstrap_stale") {
      return fail("stale_runtime_revision", "Campaign Play character authority is stale.", error);
    }
    if (error.code === "bootstrap_state_invalid") {
      return fail("character_already_exists", "Campaign Play already has a player character.", error);
    }
    return fail("invalid_character", "Campaign Play character is invalid.", error);
  }
  if (error instanceof CampaignPlayStateRepositoryError) {
    if (error.code === "campaign_world_not_accepted") {
      return fail("world_not_accepted", "Campaign world must be accepted before play.", error);
    }
    return fail("service_unavailable", "Campaign Play state is unavailable.", error);
  }
  if (error instanceof CampaignPlayTurnRepositoryError) {
    if (error.code === "turn_not_found") return fail("turn_not_found", "Turn was not found.", error);
    if (error.code === "turn_idempotency_mismatch") {
      return fail("idempotency_conflict", "Idempotency key belongs to another request.", error);
    }
    if (error.code === "turn_in_progress") return fail("turn_in_progress", "A turn is active.", error);
    if (error.code === "turn_version_conflict") {
      return fail("stale_runtime_revision", "Campaign Play authority is stale.", error);
    }
    if (error.code === "turn_topology_ineligible") {
      return fail("world_not_playable", "Campaign world cannot enter play.", error);
    }
    return fail("service_unavailable", "Campaign Play turn service failed.", error);
  }
  if (error instanceof CampaignPlayOpeningRuntimeError) {
    if (error.code === "opening_idempotency_conflict") {
      return fail("idempotency_conflict", "Idempotency key belongs to another opening.", error);
    }
    if (error.code === "opening_request_invalid") {
      return fail("invalid_starting_conditions", "Opening conditions are invalid.", error);
    }
    if (error.code === "opening_state_invalid") {
      return fail("stale_runtime_revision", "Opening authority is stale.", error);
    }
    return fail("service_unavailable", "Campaign Play opening failed.", error);
  }
  if (error instanceof CampaignPlayTurnRuntimeError) {
    if (error.code === "turn_idempotency_conflict") {
      return fail("idempotency_conflict", "Idempotency key belongs to another action.", error);
    }
    if (error.code === "turn_request_invalid") {
      return fail("invalid_intent", "Player action is invalid.", error);
    }
    if (error.code === "turn_state_invalid") {
      return fail("service_unavailable", "Campaign Play action runtime is unavailable.", error);
    }
    return fail("service_unavailable", "Campaign Play action failed.", error);
  }
  if (error instanceof CampaignPlayNarrationOperationError) {
    if (
      error.code === "operation_not_found" || error.code === "operation_stale" ||
      error.code === "operation_not_recoverable" || error.code === "operation_fence_lost"
    ) {
      return fail("turn_not_resumable", "The proper scene can no longer be restored.", error);
    }
    return fail("service_unavailable", "Campaign Play narration operation is unavailable.", error);
  }
  return fail("service_unavailable", "Campaign Play service is unavailable.", error);
}

export function createCampaignPlayApplication(
  overrides: Partial<CampaignPlayApplicationDependencies> = {},
): CampaignPlayApplication {
  const dependencies: CampaignPlayApplicationDependencies = {
    openDatabase: openCampaignPlayDatabase,
    loadSettings,
    createModel,
    characterService: campaignPlayCharacterService,
    createReadModel: createCampaignPlayReadModel,
    now: Date.now,
    owner: `campaign-play-${process.pid}-${crypto.randomUUID()}`,
    uncertaintySeedKey: (campaignId, acceptedContentHash) =>
      process.env.CAMPAIGN_PLAY_UNCERTAINTY_SEED_KEY
      ?? hashCampaignPlayProjection({
        domain: "campaign_play_uncertainty_seed_key",
        campaignId,
        acceptedContentHash,
      }),
    setTimer: (callback, delayMilliseconds) => setTimeout(callback, delayMilliseconds),
    clearTimer: (timer) => clearTimeout(timer),
    ...overrides,
  };
  const drivers = new Map<string, { turnId: string; promise: Promise<void> }>();
  const narrationDrivers = new Map<string, { turnId: string; promise: Promise<void> }>();
  const recoveryWakeups = new Map<
    string,
    { expiresAt: number; timer: ReturnType<typeof setTimeout> }
  >();

  const createDefaultOpeningRuntime = (
    handle: CampaignPlayDatabaseHandle,
    selection?: CampaignPlayTurnModelSelection,
  ): CampaignPlayOpeningRuntime => {
    const settings = dependencies.loadSettings();
    const openingSelection = selection?.turnKind === "opening" ? selection : null;
    const generator = openingSelection
      ? frozenRole(settings, "Generator", settings.generator, openingSelection.openingPlanner)
      : currentRole(settings, "Generator", settings.generator);
    const storyteller = openingSelection
      ? frozenRole(settings, "Storyteller", settings.storyteller, openingSelection.narrator)
      : currentRole(settings, "Storyteller", settings.storyteller);
    const openingRequested = openingSelection?.openingPlanner ?? requestedModel(generator);
    const narratorRequested = openingSelection?.narrator ?? requestedModel(storyteller);
    const openingMaximumOutputTokens = campaignPlayMaximumOutputTokens(generator.maxTokens);
    const narratorMaximumOutputTokens = campaignPlayMaximumOutputTokens(storyteller.maxTokens);
    return createCampaignPlayOpeningRuntime({
      handle,
      owner: dependencies.owner,
      leaseDurationMs: LEASE_DURATION_MS,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      openingPlannerModel: {
        languageModel: dependencies.createModel(generator.provider, { role: "generator" }),
        requested: openingRequested,
        temperature: generator.temperature,
        maxOutputTokens: openingMaximumOutputTokens,
      },
      narratorModel: {
        languageModel: dependencies.createModel(storyteller.provider, { role: "storyteller" }),
        requested: narratorRequested,
        temperature: storyteller.temperature,
        maximumInputTokens: MAXIMUM_INPUT_TOKENS,
        maximumOutputTokens: narratorMaximumOutputTokens,
        maximumTotalTokens: MAXIMUM_INPUT_TOKENS + narratorMaximumOutputTokens,
        maximumCostMicros: MAXIMUM_COST_MICROS,
      },
    });
  };

  const createDefaultTurnRuntime = (
    handle: CampaignPlayDatabaseHandle,
    selection?: CampaignPlayTurnModelSelection,
  ): CampaignPlayTurnRuntime => {
    const settings = dependencies.loadSettings();
    const state = createCampaignPlayStateRepository(handle).loadState();
    if (!state) {
      return fail("service_unavailable", "Campaign Play state is unavailable.");
    }
    const turnSelection = selection?.turnKind === "player_action" ? selection : null;
    const judge = turnSelection
      ? frozenRole(settings, "Judge", settings.judge, turnSelection.judge)
      : currentRole(settings, "Judge", settings.judge);
    const generator = turnSelection
      ? frozenRole(settings, "Generator", settings.generator, turnSelection.gameMaster)
      : currentRole(settings, "Generator", settings.generator);
    const actorGenerator = turnSelection
      ? frozenRole(settings, "Generator", settings.generator, turnSelection.actorReplanner)
      : generator;
    const storyteller = turnSelection
      ? frozenRole(settings, "Storyteller", settings.storyteller, turnSelection.narrator)
      : currentRole(settings, "Storyteller", settings.storyteller);
    const judgeRequested = turnSelection?.judge ?? requestedModel(judge);
    const gameMasterRequested = turnSelection?.gameMaster ?? requestedModel(generator);
    const actorRequested = turnSelection?.actorReplanner ?? requestedModel(actorGenerator);
    const narratorRequested = turnSelection?.narrator ?? requestedModel(storyteller);
    return createCampaignPlayTurnRuntime({
      handle,
      owner: dependencies.owner,
      leaseDurationMs: LEASE_DURATION_MS,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      uncertaintySeedKey: dependencies.uncertaintySeedKey(
        handle.campaignId,
        state.authority.acceptedContentHash,
      ),
      judgeModel: stageModel(
        judge,
        judgeRequested,
        dependencies.createModel(judge.provider, { role: "judge" }),
      ),
      gameMasterModel: stageModel(
        generator,
        gameMasterRequested,
        dependencies.createModel(generator.provider, { role: "generator" }),
      ),
      certifiedGameMasterModel: stageModel(
        generator,
        gameMasterRequested,
        dependencies.createModel(generator.provider, { role: "generator", reasoningMode: "bypass" }),
      ),
      actorReplannerModel: stageModel(
        actorGenerator,
        actorRequested,
        dependencies.createModel(actorGenerator.provider, { role: "generator", reasoningMode: "bypass" }),
      ),
      narratorModel: stageModel(
        storyteller,
        narratorRequested,
        dependencies.createModel(storyteller.provider, { role: "storyteller", reasoningMode: "bypass" }),
      ),
    });
  };

  const runtimeFactory: CampaignPlayRuntimeFactory = dependencies.runtimeFactory ?? {
    createOpening: createDefaultOpeningRuntime,
    createTurn: createDefaultTurnRuntime,
  };

  const openState = (campaignId: string): {
    handle: CampaignPlayDatabaseHandle;
    state: LoadedCampaignPlayState;
  } => {
    const handle = dependencies.openDatabase(campaignId);
    try {
      return { handle, state: ensureState(handle, dependencies.now()) };
    } catch (error) {
      handle.close();
      return mapFailure(error);
    }
  };

  const characterContext = (campaignId: string): CampaignPlayCharacterContext => {
    const { handle, state } = openState(campaignId);
    try {
      const settings = dependencies.loadSettings();
      return {
        acceptedWorld: state.acceptedReview,
        generator: currentRole(settings, "Generator", settings.generator),
        settings,
      };
    } finally {
      handle.close();
    }
  };

  const runtimeForTurn = (
    handle: CampaignPlayDatabaseHandle,
    turn: LoadedCampaignPlayTurn,
  ): CampaignPlayOpeningRuntime | CampaignPlayTurnRuntime => turn.turnKind === "opening"
    ? runtimeFactory.createOpening(handle, turn.modelSelection)
    : runtimeFactory.createTurn(handle, turn.modelSelection);

  const replayAdmission = (
    handle: CampaignPlayDatabaseHandle,
    turnKind: LoadedCampaignPlayTurn["turnKind"],
    request: CampaignPlayOpeningAdmissionRequest | CampaignPlayTurnAdmissionRequest,
  ): CampaignPlayTurnAdmissionResponse | null => {
    const replay = createCampaignPlayTurnRepository(handle)
      .loadTurnByIdempotencyKey(request.idempotencyKey);
    if (!replay) return null;
    if (
      replay.turnKind !== turnKind ||
      canonicalizeCampaignPlayProjection(replay.document.request) !==
        canonicalizeCampaignPlayProjection(request)
    ) {
      return fail("idempotency_conflict", "Idempotency key belongs to another request.");
    }
    if (replay.stage !== "completed" && replay.stage !== "failed") {
      schedule(handle.campaignId, replay.turnId);
    }
    return { turnId: replay.turnId, sequence: 1 };
  };

  const assertPlayable = (state: LoadedCampaignPlayState): void => {
    if (state.eligibility.projection.eligible) return;
    fail(
      "world_not_playable",
      "Campaign world cannot enter play.",
      undefined,
      state.eligibility.projection.unmetRequirements,
    );
  };

  const drive = async (
    campaignId: string,
    turnId: string,
    resume: { interruptedStage: LoadedCampaignPlayTurn["interruptedStage"]; observedEpoch: number } | null,
  ): Promise<void> => {
    let pendingResume = resume;
    let automaticResumeAttempted = false;
    while (true) {
      const handle = dependencies.openDatabase(campaignId);
      try {
        const repository = createCampaignPlayTurnRepository(handle);
        const before = repository.loadTurn(turnId);
        if (!before || before.stage === "completed" || before.stage === "failed") return;
        if (before.stage === "interrupted" && pendingResume === null) return;
        const runtime = runtimeForTurn(handle, before);
        const wasResume = pendingResume !== null;
        const result = pendingResume
          ? await runtime.resumeInterruptedStage({
              turnId,
              interruptedStage: pendingResume.interruptedStage!,
              observedEpoch: pendingResume.observedEpoch,
            })
          : await runtime.runNextStage(turnId);
        pendingResume = null;
        if (
          !wasResume && !automaticResumeAttempted &&
          result.recovery.kind === "explicit_resume_required" &&
          result.recovery.errorCode === "provider_unavailable" &&
          result.recovery.attempt === 1
        ) {
          automaticResumeAttempted = true;
          pendingResume = {
            interruptedStage: result.recovery.interruptedStage,
            observedEpoch: result.recovery.workerEpoch,
          };
          continue;
        }
        if (result.recovery.kind === "completed" && result.turn.turnKind === "player_action") {
          scheduleNarration(campaignId, result.turn.turnId);
        }
        if (
          result.recovery.kind === "completed" ||
          result.recovery.kind === "terminal_failure" ||
          result.recovery.kind === "explicit_resume_required" ||
          result.recovery.kind === "external_in_flight" ||
          result.recovery.kind === "deterministic_in_flight"
        ) return;
        if (
          result.turn.stage === before.stage &&
          result.turn.workerEpoch === before.workerEpoch &&
          result.turn.nextEventSequence === before.nextEventSequence
        ) return;
      } finally {
        handle.close();
      }
    }
  };

  const driveNarration = async (
    campaignId: string,
    turnId: string,
    token: CampaignPlayNarrationAttemptToken | null,
  ): Promise<void> => {
    const handle = dependencies.openDatabase(campaignId);
    try {
      const turn = createCampaignPlayTurnRepository(handle).loadTurn(turnId);
      if (!turn || turn.turnKind !== "player_action" || turn.stage !== "completed") return;
      const runtime = runtimeFactory.createTurn(handle, turn.modelSelection);
      const operation = await runtime.runNarration(turnId, token ?? undefined);
      if (
        token !== null || operation === null || operation.status !== "failed" ||
        operation.attempt !== 1
      ) return;
      const failedOperation = handle.sqlite.prepare(`SELECT status,
          current_attempt AS currentAttempt, current_attempt_id AS currentAttemptId,
          error_code AS errorCode
        FROM campaign_play_narration_operations
        WHERE campaign_id = ? AND operation_id = ? AND turn_id = ?`).get(
          campaignId,
          operation.operationId,
          operation.turnId,
        ) as {
          status: string;
          currentAttempt: number;
          currentAttemptId: string | null;
          errorCode: string | null;
        } | undefined;
      if (
        failedOperation?.status !== "failed" || failedOperation.currentAttempt !== 1 ||
        failedOperation.currentAttemptId !== operation.attemptId ||
        failedOperation.errorCode !== "narration_invalid"
      ) return;
      // Rebuild only the recovery runtime so its Narrator uses the same selected
      // provider/model with normal reasoning; the first runtime and manual Restore
      // retain their existing bypass construction.
      const originalCreateModel = dependencies.createModel;
      let recoveryStorytellerModelCreated = false;
      dependencies.createModel = ((provider, options = {}) => {
        if (
          !recoveryStorytellerModelCreated &&
          options.role === "storyteller" &&
          options.reasoningMode === "bypass"
        ) {
          recoveryStorytellerModelCreated = true;
          const { reasoningMode: _reasoningMode, ...defaultReasoningOptions } = options;
          return originalCreateModel(provider, defaultReasoningOptions);
        }
        return originalCreateModel(provider, options);
      }) as typeof originalCreateModel;
      let recoveryRuntime: CampaignPlayTurnRuntime;
      try {
        recoveryRuntime = runtimeFactory.createTurn(handle, turn.modelSelection);
      } finally {
        dependencies.createModel = originalCreateModel;
      }
      const recoveryToken = recoveryRuntime.prepareNarrationRecovery({
        operationId: operation.operationId,
        resultId: operation.resultId,
        narrationId: operation.narrationId,
        packetHash: operation.packetHash,
        receiptIds: operation.receiptIds,
      });
      await recoveryRuntime.runNarration(turnId, recoveryToken);
    } finally {
      handle.close();
    }
  };

  function scheduleNarration(
    campaignId: string,
    turnId: string,
    token: CampaignPlayNarrationAttemptToken | null = null,
  ): void {
    const current = narrationDrivers.get(campaignId);
    if (current?.turnId === turnId && token === null) return;
    const running = (current?.promise ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => driveNarration(campaignId, turnId, token))
      .catch(() => undefined);
    const entry = { turnId, promise: running };
    narrationDrivers.set(campaignId, entry);
    void running.finally(() => {
      if (narrationDrivers.get(campaignId) === entry) narrationDrivers.delete(campaignId);
    });
  }

  const schedule = (
    campaignId: string,
    turnId: string,
    resume: { interruptedStage: LoadedCampaignPlayTurn["interruptedStage"]; observedEpoch: number } | null = null,
  ): void => {
    const current = drivers.get(campaignId);
    if (current?.turnId === turnId && resume === null) return;
    const running = (current?.promise ?? Promise.resolve())
      .catch(() => undefined)
      .then(() => drive(campaignId, turnId, resume))
      .catch(() => undefined);
    const entry = { turnId, promise: running };
    drivers.set(campaignId, entry);
    void running
      .finally(() => {
        if (drivers.get(campaignId) === entry) drivers.delete(campaignId);
      });
  };

  const recoverCampaign = async (campaignId: string): Promise<void> => {
    const pendingWakeup = recoveryWakeups.get(campaignId);
    if (pendingWakeup) {
      dependencies.clearTimer(pendingWakeup.timer);
      recoveryWakeups.delete(campaignId);
    }
    const scheduleRecoveryWakeup = (expiresAt: number): void => {
      const timer = dependencies.setTimer(() => {
        const current = recoveryWakeups.get(campaignId);
        if (!current || current.expiresAt !== expiresAt) return;
        recoveryWakeups.delete(campaignId);
        void recoverCampaign(campaignId).catch(() => {
          console.error(`Campaign Play recovery wake-up failed for ${campaignId}.`);
        });
      }, Math.max(0, expiresAt - dependencies.now()));
      recoveryWakeups.set(campaignId, { expiresAt, timer });
    };
    while (true) {
      const handle = dependencies.openDatabase(campaignId);
      try {
        const repository = createCampaignPlayTurnRepository(handle);
        const active = repository.loadActiveTurn();
        if (!active) {
          const narrationRepository = createCampaignPlayNarrationOperationRepository(handle);
          narrationRepository.interruptExpired(dependencies.now());
          const runningNarration = handle.sqlite.prepare(`SELECT lease_expires_at AS leaseExpiresAt
            FROM campaign_play_narration_operations
            WHERE campaign_id = ? AND status = 'running'
            ORDER BY lease_expires_at, operation_id LIMIT 1`).get(
              campaignId,
            ) as { leaseExpiresAt: number } | undefined;
          if (runningNarration) {
            scheduleRecoveryWakeup(runningNarration.leaseExpiresAt);
            return;
          }
          const pendingNarration = handle.sqlite.prepare(`SELECT turn_id AS turnId
            FROM campaign_play_narration_operations
            WHERE campaign_id = ? AND status = 'pending'
            ORDER BY created_at DESC, operation_id DESC LIMIT 1`).get(
              campaignId,
            ) as { turnId: string } | undefined;
          if (pendingNarration) scheduleNarration(campaignId, pendingNarration.turnId);
          return;
        }
        const runtime = runtimeForTurn(handle, active);
        const result = await runtime.recoverActiveTurn();
        if (!result) return;
        if (result.recovery.kind === "external_in_flight") {
          if (result.recovery.token.expiresAt > dependencies.now()) {
            scheduleRecoveryWakeup(result.recovery.token.expiresAt);
          }
          return;
        }
        if (result.recovery.kind === "external_ready") {
          schedule(campaignId, active.turnId);
          return;
        }
        if (
          result.recovery.kind !== "deterministic_ready" &&
          result.recovery.kind !== "deterministic_in_flight"
        ) return;
        if (
          result.turn.stage === active.stage &&
          result.turn.workerEpoch === active.workerEpoch &&
          result.turn.nextEventSequence === active.nextEventSequence
        ) {
          if (
            result.recovery.kind === "deterministic_in_flight" &&
            result.recovery.token.expiresAt > dependencies.now()
          ) {
            scheduleRecoveryWakeup(result.recovery.token.expiresAt);
          }
          return;
        }
      } catch (error) {
        mapFailure(error);
      } finally {
        handle.close();
      }
    }
  };

  return {
    loadState(campaignId) {
      const { handle } = openState(campaignId);
      try {
        return dependencies.createReadModel(handle).loadState();
      } catch (error) {
        return mapFailure(error);
      } finally {
        handle.close();
      }
    },
    loadTurn(campaignId, turnId) {
      const { handle } = openState(campaignId);
      try {
        return dependencies.createReadModel(handle).loadTurn(turnId);
      } catch (error) {
        return mapFailure(error);
      } finally {
        handle.close();
      }
    },
    loadJournal(campaignId, cursor, limit) {
      const { handle } = openState(campaignId);
      try {
        return dependencies.createReadModel(handle).loadJournal(cursor, limit);
      } catch (error) {
        return mapFailure(error);
      } finally {
        handle.close();
      }
    },
    listTurnEvents(campaignId, turnId, afterSequence) {
      const { handle } = openState(campaignId);
      try {
        return dependencies.createReadModel(handle).listTurnEvents(turnId, afterSequence);
      } catch (error) {
        return mapFailure(error);
      } finally {
        handle.close();
      }
    },
    async parsePlayerCard(campaignId, request) {
      try {
        const intake = await dependencies.characterService.parsePlayerCard(
          campaignId,
          request,
          characterContext(campaignId),
        );
        return campaignPlayCharacterDraftResponseSchema.parse({ draft: intake.draft });
      } catch (error) {
        return mapFailure(error);
      }
    },
    async generatePlayerDraft(campaignId, request) {
      try {
        const intake = await dependencies.characterService.generatePlayerDraft(
          campaignId,
          request,
          characterContext(campaignId),
        );
        return campaignPlayCharacterDraftResponseSchema.parse({ draft: intake.draft });
      } catch (error) {
        return mapFailure(error);
      }
    },
    async researchPlayer(campaignId, request) {
      try {
        const context = characterContext(campaignId);
        return dependencies.characterService.researchPlayer(
          request,
          context.generator,
          context.settings,
        );
      } catch (error) {
        return mapFailure(error);
      }
    },
    putPlayer(campaignId, requestValue) {
      const request = campaignPlayPutPlayerRequestSchema.parse(requestValue);
      const { handle, state } = openState(campaignId);
      try {
        assertPlayable(state);
        assertExpectedVersions(state, request);
        if (request.acceptedWorldVersion !== state.authority.acceptedWorldVersion) {
          return fail("stale_world_version", "Accepted Campaign World version is stale.");
        }
        if (state.authority.setupPhase !== "character_required") {
          return fail("character_already_exists", "Campaign Play already has a player character.");
        }
        const actorId = `player:${hashCampaignPlayProjection({
          domain: "campaign_play_player_actor",
          campaignId,
          character: request.character,
        }).slice(0, 40)}`;
        const character = dependencies.characterService.preparePlayerProfile({
          campaignId,
          actorId,
          character: request.character,
        });
        const bootstrapped = bootstrapCampaignPlayPlayer(handle, {
          character,
          expectedAcceptedWorldVersion: request.acceptedWorldVersion,
          expectedAcceptedContentHash: state.authority.acceptedContentHash,
          expectedWorldVersion: request.expectedWorldVersion,
          expectedRuntimeRevision: request.expectedRuntimeRevision,
          createdAt: dependencies.now(),
        });
        return campaignPlayPutPlayerResponseSchema.parse({
          acceptedWorldVersion: bootstrapped.state.authority.acceptedWorldVersion,
          worldVersion: bootstrapped.state.authority.worldVersion,
          runtimeRevision: bootstrapped.state.authority.runtimeRevision,
          actorHandle: deriveCampaignPlayPublicHandle("actor", campaignId, actorId),
        });
      } catch (error) {
        return mapFailure(error);
      } finally {
        handle.close();
      }
    },
    admitOpening(campaignId, requestValue) {
      const request = campaignPlayOpeningAdmissionRequestSchema.parse(requestValue);
      const { handle, state } = openState(campaignId);
      try {
        const replay = replayAdmission(handle, "opening", request);
        if (replay) return replay;
        assertPlayable(state);
        const admission = runtimeFactory.createOpening(handle).admitOpening({
          request,
          submittedAt: dependencies.now(),
        });
        schedule(campaignId, admission.turnId);
        return admission;
      } catch (error) {
        if (
          error instanceof CampaignPlayOpeningRuntimeError &&
          error.code === "opening_state_invalid"
        ) {
          assertExpectedVersions(state, request);
          if (state.authority.setupPhase === "character_required") {
            return fail("character_required", "Campaign Play requires a player character.");
          }
          if (state.authority.setupPhase === "ready") {
            return fail("opening_already_completed", "Campaign Play opening is complete.");
          }
        }
        return mapFailure(error);
      } finally {
        handle.close();
      }
    },
    admitTurn(campaignId, requestValue) {
      const request = campaignPlayTurnAdmissionRequestSchema.parse(requestValue);
      const { handle, state } = openState(campaignId);
      try {
        const replay = replayAdmission(handle, "player_action", request);
        if (replay) return replay;
        assertPlayable(state);
        const admission = runtimeFactory.createTurn(handle).admitAction({
          request,
          submittedAt: dependencies.now(),
        });
        schedule(campaignId, admission.turnId);
        return admission;
      } catch (error) {
        if (
          error instanceof CampaignPlayTurnRuntimeError &&
          error.code === "turn_state_invalid"
        ) {
          assertExpectedVersions(state, request);
          if (state.authority.setupPhase === "character_required") {
            return fail("character_required", "Campaign Play requires a player character.");
          }
          if (state.authority.setupPhase === "opening_required") {
            return fail("opening_required", "Campaign Play requires an opening turn.");
          }
        }
        return mapFailure(error);
      } finally {
        handle.close();
      }
    },
    resumeTurn(campaignId, turnId, requestValue) {
      const request = campaignPlayResumeTurnRequestSchema.parse(requestValue);
      const { handle, state } = openState(campaignId);
      try {
        assertExpectedVersions(state, request);
        const turn = createCampaignPlayTurnRepository(handle).loadTurn(turnId);
        if (!turn) return fail("turn_not_found", "Turn was not found.");
        const interruptedActorReplan = turn.stage === "primary_settled" &&
          handle.sqlite.prepare(`SELECT 1 AS interrupted FROM campaign_play_actor_jobs
            WHERE campaign_id = ? AND turn_id = ? AND stage = 'interrupted'
            LIMIT 1`).get(handle.campaignId, turnId) !== undefined;
        const interruptedStage = turn.stage === "interrupted" && turn.resumeEligible
          ? turn.interruptedStage
          : interruptedActorReplan ? "primary_settled" as const : null;
        if (interruptedStage === null) {
          return fail("turn_not_resumable", "Turn cannot be resumed.");
        }
        runtimeForTurn(handle, turn);
        schedule(campaignId, turnId, {
          interruptedStage,
          observedEpoch: turn.workerEpoch,
        });
        return { turnId, sequence: turn.nextEventSequence };
      } catch (error) {
        return mapFailure(error);
      } finally {
        handle.close();
      }
    },
    recoverNarration(campaignId, turnId, requestValue) {
      const request = campaignPlayNarrationRecoveryRequestSchema.parse(requestValue);
      const { handle } = openState(campaignId);
      try {
        const turn = createCampaignPlayTurnRepository(handle).loadTurn(turnId);
        if (!turn || turn.turnKind !== "player_action" || turn.stage !== "completed") {
          return fail("turn_not_found", "Committed player result was not found.");
        }
        const operation = createCampaignPlayNarrationOperationRepository(handle).loadByTurn(turnId);
        if (!operation || operation.operationId !== request.operationId) {
          throw new CampaignPlayNarrationOperationError(
            "operation_stale",
            "Narration operation does not belong to the requested turn.",
          );
        }
        const runtime = runtimeFactory.createTurn(handle, turn.modelSelection);
        const token = runtime.prepareNarrationRecovery(request);
        if (token.turnId !== turnId) {
          throw new CampaignPlayNarrationOperationError(
            "operation_stale",
            "Narration operation does not belong to the requested turn.",
          );
        }
        scheduleNarration(campaignId, turnId, token);
        return campaignPlayNarrationRecoveryResponseSchema.parse({
          operationId: token.operationId,
          attemptId: token.attemptId,
          attempt: token.attempt,
          status: "running",
        });
      } catch (error) {
        return mapFailure(error);
      } finally {
        handle.close();
      }
    },
    recoverCampaign,
    async waitForIdle(campaignId) {
      while (true) {
        const mechanics = drivers.get(campaignId);
        const narration = narrationDrivers.get(campaignId);
        if (!mechanics && !narration) return;
        await Promise.all([
          mechanics?.promise ?? Promise.resolve(),
          narration?.promise ?? Promise.resolve(),
        ]);
      }
    },
  };
}

export const campaignPlayApplication = createCampaignPlayApplication();
