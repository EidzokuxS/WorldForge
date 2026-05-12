/**
 * Turn processor: orchestrates the full GM decision -> optional Oracle -> Storyteller pipeline.
 *
 * Yields typed TurnEvents as an async generator, allowing the caller
 * (route handler) to stream events to the client as they happen.
 */

import { generateText } from "ai";
import type { ChatMessage } from "@worldforge/shared";
import { extractReasoningText, normalizeReasoningText } from "../ai/extract-reasoning-text.js";
import {
  getSafeGenerateObjectErrorCode,
  safeGenerateObject as generateObject,
} from "../ai/generate-object-safe.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { callOracle, type OracleResult } from "./oracle.js";
import {
  assembleFinalNarrationPrompt,
  assembleJudgeAdjudicationPrompt,
} from "./prompt-assembler.js";
import {
  appendChatMessages,
  advanceCampaignTick,
  getChatHistory,
  incrementTick,
  readCampaignConfig,
} from "../campaign/index.js";
import { getDb } from "../db/index.js";
import { players, locations, npcs } from "../db/schema.js";
import type { ResolveResult } from "../ai/index.js";
import { createLogger, withRole } from "../lib/index.js";
import {
  hydrateStoredPlayerRecord,
  projectPlayerRecord,
} from "../character/record-adapters.js";
import { deriveRuntimeCharacterTags } from "../character/runtime-tags.js";
import {
  buildCombatEnvelope,
  buildNarrativeOutcomeBounds,
  isHostileCombatAction,
} from "./combat-envelope.js";
import { resolveActionTargetContext } from "./target-context.js";
import { buildMovementDetectionPromptContract } from "./prompt-contracts.js";
import { applyStartConditionEffects } from "./start-condition-runtime.js";
import {
  listConnectedPaths,
  loadLocationGraph,
  resolveLocationTarget,
  resolveTravelPath,
} from "./location-graph.js";
import {
  assembleAuthoritativeScene,
  buildSceneDirectionSeed,
  type SceneAssembly,
} from "./scene-assembly.js";
import {
  runWorldBrainSceneDirection,
  type WorldBrainSceneDirection,
} from "./world-brain.js";
import {
  executeAdjudicationPlan,
  runHiddenAdjudicationPlan,
  type SuccessfulTravelLike,
} from "./hidden-adjudication.js";
import {
  buildSceneFrame,
  buildSceneFrameCombatEnvelopeForConcreteTarget,
  buildSceneFrameOracleContextForCandidate,
  type SceneFrame,
  type SceneFrameOracleContext,
  type SceneFrameTargetCandidate,
} from "./scene-frame.js";
import { runGmRead, type GmRead } from "./gm-turn-read.js";
import { reviewGmReadClarification } from "./clarification-reviewer.js";
import { runGmToolLoop } from "./gm-tool-loop.js";
import { runRequiredActorDecisionPass } from "./actor-tools.js";
import {
  resolveDueWorldWorkForScope,
  type ResolveDueWorldWorkForScopeResult,
} from "./due-world-work.js";
import {
  addTurnLatencyProposalEffects,
  createTurnLatencyTrace,
  finalizeTurnLatencyTrace,
  recordParallelGroup,
  recordSerializedLlmGroup,
  recordTurnLatencyStage,
  type TurnLatencyRequiredStage,
} from "./turn-latency-trace.js";
import type { GmToolStepResult } from "./gm-tool-step.js";
import { isObservationToolResult } from "./tool-result.js";
import type {
  ExecutedScenePlan,
  ExecutedScenePlanActionResult,
} from "./scene-plan-executor.js";
import {
  scenePlanActionSchema,
  type ScenePlan,
  type ScenePlanAction,
  type SceneResponse,
} from "./scene-plan-schema.js";
import {
  buildNarratorPacket,
  summarizeRuntimeToolResultForNarrator,
  type CanonicalTurnPacket,
  type CanonicalTurnPacketEffect,
  type CanonicalTurnPacketEvent,
  type CanonicalTurnPacketResponse,
  type CanonicalTurnResolution,
  type NarratorPacket,
} from "./narrator-packet.js";
import {
  runVisibleNarrationWithPacketGuard,
  VisibleNarrationPacketGuardError,
  type VisibleNarrationPacketValidationResult,
} from "./visible-narration-output-guard.js";
import {
  buildGroundedSentenceDraftRepairAddendum,
  compileGroundedSentenceDraftToNarrationDraft,
  GROUNDED_SENTENCE_DRAFT_VERSION,
  groundedSentenceDraftSchema,
  type NarrationDraft,
} from "./narration-grounding-guard.js";
import { readWorldClock, syncWorldClockTurnBoundary } from "./living-world-authority.js";
import { playerBlockingStageLimit } from "./runtime-limits.js";
import {
  claimTurnSagaWorker,
  createTurnSaga,
  assertNoPendingNarrationBeforeNewTurn,
  findLatestSuccessfulNarratorAttempt,
  getSettledTurnPacket,
  getTurnSaga,
  heartbeatTurnSagaWorker,
  markTurnSagaFinalized,
  markTurnSagaFinalizedIfNeeded,
  mergeTurnSagaProvenance,
  persistOracleDecision,
  persistSettledTurnPacket,
  PendingSettledTurnNarrationError,
  PENDING_NARRATION_STATUSES,
  recordNarratorAttempt,
  releaseTurnSagaWorker,
  transitionTurnSagaStatus,
  updateNarratorAttemptOutcome,
  type SettledTurnPacketRecord,
  type TurnSagaRecord,
  type TurnSagaStatus,
} from "./turn-saga.js";
import {
  buildScopedForecastExcerpt,
  loadWorldTrajectoryForecast,
  shouldRefreshWorldTrajectoryForecast,
  writeStagedWorldTrajectoryForecast,
  type ScopedForecastExcerpt,
  type StagedWorldTrajectoryForecast,
} from "./world-forecast.js";
import { cleanupTransientSceneObjects } from "./transient-scene-lifecycle.js";

const log = createLogger("turn-processor");
const VISIBLE_NARRATION_TRANSPORT_RETRY_LIMIT = 2;
const VISIBLE_NARRATION_OPENING_TRANSPORT_RETRY_LIMIT = 1;
const VISIBLE_NARRATION_TIMEOUT_MS = playerBlockingStageLimit(
  "WORLDFORGE_VISIBLE_NARRATION_TIMEOUT_MS",
);
const VISIBLE_NARRATION_OPENING_TIMEOUT_MS = playerBlockingStageLimit(
  "WORLDFORGE_VISIBLE_NARRATION_OPENING_TIMEOUT_MS",
);
const VISIBLE_NARRATION_MAX_OUTPUT_TOKENS = 4_096;
const VISIBLE_NARRATION_OPENING_MAX_OUTPUT_TOKENS = 2_048;
const VISIBLE_NARRATION_DRAFT_CHANNEL_RETRY_LIMIT = 3;
const VISIBLE_NARRATION_DRAFT_TIMEOUT_MS = playerBlockingStageLimit(
  "WORLDFORGE_VISIBLE_NARRATION_DRAFT_TIMEOUT_MS",
);
const VISIBLE_NARRATION_DRAFT_MAX_OUTPUT_TOKENS = 2_048;
const VISIBLE_NARRATION_DRAFT_MODE = "native_json";
const VISIBLE_NARRATION_DRAFT_CONTRACT_RETRY_LIMIT = 0;
const PENDING_NARRATION_RESUME_CHECKPOINT_KEY = "pendingNarrationResume";
const PENDING_NARRATION_WORKER_STALE_AFTER_MS = 5 * 60_000;
const PENDING_NARRATION_WORKER_HEARTBEAT_MS = 60_000;
const GROUNDED_SENTENCE_DRAFT_CONTRACT_VERSION = GROUNDED_SENTENCE_DRAFT_VERSION;

type VisibleNarrationUsage = Awaited<ReturnType<typeof generateText>>["usage"];
type VisibleNarrationResponse = Awaited<ReturnType<typeof generateText>>["response"] | {
  id?: string;
  modelId?: string;
  timestamp?: string;
};
type VisibleNarrationFinishReason = Awaited<ReturnType<typeof generateText>>["finishReason"] | string;
interface NarrationDraftStructuredTrace {
  strategy: unknown;
  primaryStrategy: unknown;
  fallbackStrategy: unknown;
  fallbackReason: unknown;
  repairedFromStrategy: unknown;
  repair: unknown;
  finishReason: unknown;
  responseModel: string | null;
}

export class NarrationRepairExhaustedError extends Error {
  constructor(
    message: string,
    public readonly causeError?: unknown,
  ) {
    super(message);
    this.name = "NarrationRepairExhaustedError";
  }
}

// -- Types --------------------------------------------------------------------

export interface TurnEvent {
  type:
    | "oracle_result"
    | "scene-settling"
    | "narrative"
    | "reasoning"
    | "state_update"
    | "quick_actions"
    | "auto_checkpoint"
    | "turn_resolution"
    | "finalizing_turn"
    | "done"
    | "error";
  data: unknown;
}

type TurnProgressEventType = "scene-settling" | "finalizing_turn";

type SafeTurnStageId =
  | "resolving-action"
  | "checking-immediate-consequences"
  | "resolving-nearby-reactions"
  | "advancing-world-time"
  | "writing-scene"
  | "repairing-narration-grounding";

type SafeTurnStageCriticality = "L0" | "L1" | "L2";

interface SafeTurnStagePayload {
  stage: string;
  stageId: SafeTurnStageId;
  phase?: string;
  tick?: number;
  opening?: boolean;
  criticality: SafeTurnStageCriticality;
  criticalPath: true;
  executed?: number;
  deferred?: number;
  worldThreads?: number;
  resumed?: boolean;
}

export interface TurnOptions {
  campaignId: string;
  playerAction: string;
  intent: string;
  method: string;
  judgeProvider: ProviderConfig;
  storytellerProvider: ProviderConfig;
  storytellerTemperature: number;
  storytellerMaxTokens: number;
  embedderResult?: ResolveResult;
  contextWindow?: number;
  openingScene?: boolean;
  onBeforeVisibleNarration?: (summary: HiddenTurnSummary) => void | Promise<void>;
  onPostTurn?: (summary: TurnSummary) => void | Promise<void>;
}

export interface OpeningSceneOptions {
  campaignId: string;
  storytellerProvider: ProviderConfig;
  storytellerTemperature: number;
  storytellerMaxTokens: number;
  embedderResult?: ResolveResult;
  contextWindow?: number;
}

export interface ResumePendingNarrationOptions {
  campaignId: string;
  turnId: string;
  storytellerProvider: ProviderConfig;
  storytellerTemperature: number;
  storytellerMaxTokens: number;
  embedderResult?: ResolveResult;
  contextWindow?: number;
  onPostTurn?: (summary: TurnSummary) => void | Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

function inferSafeTurnStageId(args: {
  eventType: TurnProgressEventType;
  stage?: string;
  phase?: string;
}): SafeTurnStageId {
  const marker = `${args.stage ?? ""}:${args.phase ?? ""}`;
  if (/repair/i.test(marker)) {
    return "repairing-narration-grounding";
  }
  if (/final-narration|opening-final-narration/i.test(marker)) {
    return "writing-scene";
  }
  if (/actor-reactions/i.test(marker)) {
    return "resolving-nearby-reactions";
  }
  if (/offscreen-catch-up|world-time|due-work|local-present-scene|rollback_critical/i.test(marker)) {
    return "advancing-world-time";
  }
  if (/gm-read|oracle|judge-adjudication|judge-scene-plan/i.test(marker)) {
    return "resolving-action";
  }
  if (args.eventType === "finalizing_turn") {
    return "advancing-world-time";
  }
  return "checking-immediate-consequences";
}

function criticalityForSafeStage(stageId: SafeTurnStageId): SafeTurnStageCriticality {
  switch (stageId) {
    case "resolving-action":
    case "writing-scene":
    case "repairing-narration-grounding":
      return "L0";
    case "resolving-nearby-reactions":
    case "checking-immediate-consequences":
      return "L1";
    case "advancing-world-time":
      return "L2";
  }
}

function buildSafeTurnStagePayload(
  eventType: TurnProgressEventType,
  data: unknown,
): SafeTurnStagePayload {
  const record = isRecord(data) ? data : {};
  const stage = readOptionalString(record, "stage") ?? eventType;
  const phase = readOptionalString(record, "phase");
  const stageId = inferSafeTurnStageId({ eventType, stage, phase });
  const payload: SafeTurnStagePayload = {
    stage,
    stageId,
    criticality: criticalityForSafeStage(stageId),
    criticalPath: true,
  };
  const tick = readOptionalNumber(record, "tick");
  const opening = readOptionalBoolean(record, "opening");
  const executed = readOptionalNumber(record, "executed");
  const deferred = readOptionalNumber(record, "deferred");
  const worldThreads = readOptionalNumber(record, "worldThreads");
  const resumed = readOptionalBoolean(record, "resumed");

  if (phase) payload.phase = phase;
  if (tick !== undefined) payload.tick = tick;
  if (opening !== undefined) payload.opening = opening;
  if (executed !== undefined) payload.executed = executed;
  if (deferred !== undefined) payload.deferred = deferred;
  if (worldThreads !== undefined) payload.worldThreads = worldThreads;
  if (resumed !== undefined) payload.resumed = resumed;
  return payload;
}

export function withSafeTurnProgressPayload(event: TurnEvent): TurnEvent {
  if (event.type !== "scene-settling" && event.type !== "finalizing_turn") {
    return event;
  }
  return {
    ...event,
    data: buildSafeTurnStagePayload(event.type, event.data),
  };
}

export interface HiddenTurnSummary {
  currentTick: number;
  predictedTick: number;
  currentLocationId: string | null;
  currentSceneScopeId: string | null;
  oracleResult: OracleResult | null;
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  openingScene: boolean;
  sceneDirection?: WorldBrainSceneDirection;
  sceneAssembly?: SceneAssembly;
}

export interface TurnSummary {
  turnId?: string;
  sagaId?: string;
  narratorAttemptId?: string;
  idempotencyKey?: string;
  tick: number;
  oracleResult: OracleResult | null;
  toolCalls: Array<{ tool: string; args: unknown; result: unknown }>;
  narrativeText: string;
  sceneDirection?: WorldBrainSceneDirection;
  sceneAssembly?: SceneAssembly;
}

type TurnToolCallResult = TurnSummary["toolCalls"][number];

function persistPlayerRuntimeRecord(
  db: ReturnType<typeof getDb>,
  playerId: string,
  campaignId: string,
  record: ReturnType<typeof hydrateStoredPlayerRecord>,
) {
  const projection = projectPlayerRecord(record);
  db.update(players)
    .set({
      ...projection,
      campaignId,
    })
    .where(eq(players.id, playerId))
    .run();
  log.event("db.write", {
    table: "players",
    op: "update",
    rowId: playerId,
    rowName: record.identity?.displayName ?? null,
  });
}

type SuccessfulTravel = SuccessfulTravelLike;

function resolveSceneScopeId(
  currentLocationId: string | null | undefined,
  currentSceneLocationId: string | null | undefined,
): string | null {
  return currentSceneLocationId ?? null;
}

function syncPlayerRecordLocation(
  record: ReturnType<typeof hydrateStoredPlayerRecord>,
  locationId: string,
  locationName: string,
) {
  return {
    ...record,
    socialContext: {
      ...record.socialContext,
      currentLocationId: locationId,
      currentLocationName: locationName,
    },
  };
}

function ensurePlayerSceneScopeAlignment(
  db: ReturnType<typeof getDb>,
  player: typeof players.$inferSelect | undefined,
): string | null {
  if (!player) {
    return null;
  }

  const resolvedSceneScopeId = resolveSceneScopeId(
    player.currentLocationId,
    player.currentSceneLocationId,
  );

  if (
    player.currentLocationId
    && resolvedSceneScopeId
    && player.currentSceneLocationId !== resolvedSceneScopeId
    && typeof (db as { update?: unknown }).update === "function"
  ) {
    db.update(players)
      .set({ currentSceneLocationId: resolvedSceneScopeId })
      .where(eq(players.id, player.id))
      .run();
    log.event("db.write", {
      table: "players",
      op: "update",
      rowId: player.id,
      rowName: player.name ?? null,
    });
    player.currentSceneLocationId = resolvedSceneScopeId;
  }

  return resolvedSceneScopeId;
}

function persistPlayerLocation(
  db: ReturnType<typeof getDb>,
  player: typeof players.$inferSelect,
  locationId: string,
  locationName: string,
) {
  const updatedPlayer = hydrateStoredPlayerRecord(player, {
    currentLocationName: locationName,
  });

  db.update(players)
    .set(
      {
        ...projectPlayerRecord(syncPlayerRecordLocation(updatedPlayer, locationId, locationName)),
        currentSceneLocationId: locationId,
      },
    )
    .where(eq(players.id, player.id))
    .run();
  log.event("db.write", {
    table: "players",
    op: "update",
    rowId: player.id,
    rowName: player.name ?? null,
  });
}

function getPathNames(locationIds: string[], allLocations: readonly typeof locations.$inferSelect[]) {
  const nameById = new Map(allLocations.map((location) => [location.id, location.name]));
  return locationIds
    .map((locationId) => nameById.get(locationId))
    .filter((locationName): locationName is string => Boolean(locationName));
}

function predictNextTick(
  currentTick: number,
  successfulTravel: SuccessfulTravel | null,
): number {
  return successfulTravel && successfulTravel.tickAdvance > 0
    ? currentTick + successfulTravel.tickAdvance
    : currentTick + 1;
}

function logWorldBrainSceneDirection(
  source: "player-turn" | "opening-scene",
  direction: WorldBrainSceneDirection,
) {
  log.event("world-brain.scene-direction", {
    source,
    ran: true,
    focalActorCount: direction.focalActorNames.length,
    backgroundActorCount: direction.backgroundActorNames.length,
    presenceReasonCount: direction.presenceReasons.length,
    causalBeatCount: direction.causalBeats.length,
    perceivableBeatCount: direction.causalBeats.filter((beat) => beat.perceivable).length,
    situationSummaryLength: direction.situationSummary.length,
    sceneQuestionLength: direction.sceneQuestion.length,
  });
}

// -- Movement detection -------------------------------------------------------

const movementDetectionSchema = z.object({
  isMovement: z.boolean().describe("Whether the action is a movement/travel command"),
  destination: z.string().nullable().describe("The destination name if movement detected, null otherwise"),
});

/**
 * Detect if a player action is a movement command using LLM analysis.
 * Returns the destination name if matched, null otherwise.
 */
export async function detectMovement(
  action: string,
  judgeProvider: ProviderConfig,
): Promise<string | null> {
  try {
    const { object } = await generateObject({
      model: createModel(judgeProvider),
      schema: movementDetectionSchema,
      prompt: [
        buildMovementDetectionPromptContract(),
        "",
        `Is this player action a movement/travel command? If yes, extract the destination name.

Actions like "go to X", "head towards X", "visit X", "walk to X", "check out X", "travel to X", "let's go to X", "I want to visit X" are movement.
Actions like "attack", "talk to", "look around", "pick up", "search", "examine" are NOT movement.
Movement in any language counts (e.g. Russian "Пойдём на рынок" = movement to "рынок").

Player action: "${action.trim()}"`,
      ].join("\n"),
      temperature: 0.1,
    });

    const destination = object.isMovement && object.destination ? object.destination.trim() : null;
    log.event("movement.detect", {
      action,
      destination,
      isMovement: object.isMovement,
    });
    return destination;
  } catch (error) {
    log.warn("LLM movement detection failed, assuming no movement", error);
    log.event("movement.detect", {
      action,
      destination: null,
      isMovement: false,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

// -- Narrative sanitizer --------------------------------------------------------

/**
 * Remove metadata leaks from Storyteller narrative output.
 * Some LLMs (notably Gemini Flash) echo bracketed section headers and their
 * content into the narrative despite explicit instructions not to.
 * This function strips everything from the FIRST leaked header onward.
 */
const LEAKED_HEADERS = [
  "[NPC STATES]",
  "[ACTION RESULT]",
  "[NARRATION DIRECTIVE]",
  "[RECENT CONVERSATION]",
  "[SYSTEM RULES]",
  "[WORLD PREMISE]",
  "[SCENE]",
  "[PLAYER STATE]",
  "[WORLD STATE]",
  "[LORE CONTEXT]",
  "[EPISODIC MEMORY]",
  "[RELATIONSHIPS]",
];

const TOOL_CALL_LEAK_PATTERNS: RegExp[] = [
  // print(default_api.xxx(...)) — may span multiple lines
  /print\s*\(\s*default_api\.\w+\s*\([^)]*\)\s*\)/gs,
  // bare default_api.xxx(...) calls
  /default_api\.\w+\s*\([^)]*\)/gs,
  // generic tool-call-like syntax: known tool names with arguments
  /\b(?:offer_quick_actions|set_condition|log_event|spawn_npc|promote_npc|spawn_item|reveal_location|set_relationship|add_chronicle_entry|add_tag|remove_tag|transfer_item|move_to)\s*\([^)]*\)/g,
  // Catch-all: any word_word(param=value, ...) pattern that looks like a function call
  /\b[a-z_]+\s*\(\s*(?:[a-z_]+=|["'\[])[^)]*\)/gi,
  // Bare print(...) wrapping anything
  /print\s*\([^)]*\)/gs,
];

export function sanitizeNarrative(raw: string): string {
  return raw.replace(/\n{3,}/g, "\n\n").trim();
}

type VisibleNarrationFailure =
  | "repeated_lead"
  | "residual_leak"
  | "instruction_echo"
  | "slop_cluster";

const RETRY_PRIORITY_VISIBLE_NARRATION_FAILURES = new Set<VisibleNarrationFailure>([
  "residual_leak",
  "instruction_echo",
]);

const HIGH_SIGNAL_SLOP_PATTERNS: ReadonlyArray<{ code: string; pattern: RegExp }> = [
  {
    code: "announcement_opener",
    pattern:
      /\b(?:here'?s the thing|the truth is|let me be clear|make no mistake|let that sink in)\b/iu,
  },
  {
    code: "binary_contrast",
    pattern:
      /\b(?:the answer|the problem|the question|it(?:'s| is)|this)\s+(?:isn['’]?t|is not)\b[^.!?\n]{0,120}[.!?]\s*(?:it(?:'s| is)|but)\b/iu,
  },
  {
    code: "rhetorical_setup",
    pattern: /\b(?:think about it|here'?s what i mean|what if)\b/iu,
  },
];

function applyVisibleNarrationFilters(raw: string): string {
  return sanitizeNarrative(raw);
}

function normalizeNarrationFingerprint(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function extractLeadSentence(paragraph: string): string {
  const firstSentence = paragraph.match(/^(.{1,220}?[.!?…])(?:\s|$)/u)?.[1] ?? paragraph;
  return normalizeNarrationFingerprint(firstSentence).slice(0, 180);
}

function hasRepeatedLead(text: string): boolean {
  const paragraphs = extractParagraphs(text);
  if (paragraphs.length < 2) {
    return false;
  }

  const firstLead = extractLeadSentence(paragraphs[0] ?? "");
  if (!firstLead || firstLead.length < 20) {
    return false;
  }

  return paragraphs
    .slice(1)
    .some((paragraph) => extractLeadSentence(paragraph) === firstLead);
}

function hasResidualNarrativeLeak(text: string): boolean {
  if (LEAKED_HEADERS.some((header) => text.includes(header))) {
    return true;
  }

  return TOOL_CALL_LEAK_PATTERNS.some((pattern) => {
    const probe = new RegExp(pattern.source, pattern.flags);
    return probe.test(text);
  });
}

function extractInstructionEchoCandidates(...sources: Array<string | undefined>): string[] {
  return sources
    .flatMap((source) => (source ?? "").split(/\n+/))
    .map((line) => line.replace(/^[-*\d.)\s]+/, "").trim())
    .filter((line) => line.length >= 24 && line.length <= 220)
    .filter((line) =>
      /^(?:do not|don't|never|keep|prefer|use|advance|write|stay|avoid|limit|narrate|describe|let)\b/i.test(
        line,
      ),
    );
}

function hasInstructionEcho(
  text: string,
  promptContext: { system: string; prompt: string },
): boolean {
  const normalizedText = normalizeNarrationFingerprint(text);
  if (!normalizedText) {
    return false;
  }

  return extractInstructionEchoCandidates(promptContext.system, promptContext.prompt).some(
    (candidate) => {
      const normalizedCandidate = normalizeNarrationFingerprint(candidate);
      return normalizedCandidate.length >= 24 && normalizedText.includes(normalizedCandidate);
    },
  );
}

function hasHighSignalSlopCluster(text: string): boolean {
  const matchCount = HIGH_SIGNAL_SLOP_PATTERNS.reduce((count, { pattern }) => {
    const probe = new RegExp(pattern.source, pattern.flags);
    return count + (probe.test(text) ? 1 : 0);
  }, 0);
  return matchCount >= 2;
}

export function detectVisibleNarrationFailures(
  text: string,
  promptContext: { system: string; prompt: string },
): VisibleNarrationFailure[] {
  const failures: VisibleNarrationFailure[] = [];

  if (!text) {
    failures.push("residual_leak");
    return failures;
  }

  if (hasRepeatedLead(text)) {
    failures.push("repeated_lead");
  }
  if (hasResidualNarrativeLeak(text)) {
    failures.push("residual_leak");
  }
  if (hasInstructionEcho(text, promptContext)) {
    failures.push("instruction_echo");
  }
  if (hasHighSignalSlopCluster(text)) {
    failures.push("slop_cluster");
  }

  return failures;
}

function buildVisibleNarrationRetryAddendum(
  failures: readonly VisibleNarrationFailure[],
): string {
  const guidance: string[] = [
    "Reissue the final visible narration only once.",
    "Do not restart the scene from the top.",
  ];

  if (failures.includes("repeated_lead")) {
    guidance.push("Do not repeat the opening beat or first sentence in later paragraphs.");
  }
  if (failures.includes("residual_leak")) {
    guidance.push("Do not include headers, bracketed sections, or tool-call syntax in visible prose.");
  }
  if (failures.includes("instruction_echo")) {
    guidance.push("Do not quote or paraphrase narrator instructions inside the visible prose.");
  }
  if (failures.includes("slop_cluster")) {
    guidance.push("Cut announcement openers, rhetorical setups, and binary contrast phrasing.");
    guidance.push("Replace generic tension with one local action, object, gesture, sound, or interrupted task from the visible scene.");
    guidance.push("Write the next playable beat directly: concrete change first, interpretation only after visible evidence.");
  }

  return `\n\n[FINAL VISIBLE PASS CORRECTION]\n${guidance.map((line) => `- ${line}`).join("\n")}`;
}

function hasRetryPriorityVisibleNarrationFailure(
  failures: readonly VisibleNarrationFailure[],
): boolean {
  return failures.some((failure) => RETRY_PRIORITY_VISIBLE_NARRATION_FAILURES.has(failure));
}

function scoreVisibleNarrationCandidate(
  text: string,
  failures: readonly VisibleNarrationFailure[],
): number {
  return text.length - failures.length * 1000;
}

function shouldExposeReasoningSse(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.EXPOSE_LLM_REASONING === "true";
}

function assertNonEmptyFinalVisibleNarration(text: string): void {
  if (text.trim().length > 0) {
    return;
  }

  throw new Error(
    "Final visible narration was empty after validation; turn was not finalized.",
  );
}

function isVisibleNarrationTransportError(error: unknown): boolean {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "";

  return /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|network error|fetch failed|socket hang up|connection (?:closed|terminated|reset|refused)|terminated|timeout|timed out|abort(?:ed)?|AbortError)\b/i.test(message);
}

function isVisibleNarrationStructuredChannelError(error: unknown): boolean {
  const code = getSafeGenerateObjectErrorCode(error);
  return (
    code === "missing_structured_tool_call"
    || code === "invalid_structured_tool_call"
    || code === "native_output_unavailable"
    || code === "invalid_json"
  );
}

function isVisibleNarrationRetryableChannelError(error: unknown): boolean {
  return isVisibleNarrationTransportError(error) || isVisibleNarrationStructuredChannelError(error);
}

function visibleNarrationMaxOutputTokens(
  requested: number,
  cap = VISIBLE_NARRATION_MAX_OUTPUT_TOKENS,
): number {
  return Math.max(1, Math.min(requested, cap));
}

async function runVisibleNarrationWithGuard(args: {
  label: "final" | "opening";
  provider: ProviderConfig;
  system: string;
  prompt: string;
  storytellerTemperature: number;
  storytellerMaxTokens: number;
}): Promise<{
  text: string;
  reasoningText: string | undefined;
  retried: boolean;
  failures: VisibleNarrationFailure[];
  usage?: VisibleNarrationUsage;
  response?: VisibleNarrationResponse;
  finishReason?: VisibleNarrationFinishReason;
}> {
  const {
    label,
    provider,
    system,
    prompt,
    storytellerTemperature,
    storytellerMaxTokens,
  } = args;

  async function runNarrationPass(activeProvider: ProviderConfig, promptText: string) {
    let lastError: unknown;
    const transportRetryLimit = label === "opening"
      ? VISIBLE_NARRATION_OPENING_TRANSPORT_RETRY_LIMIT
      : VISIBLE_NARRATION_TRANSPORT_RETRY_LIMIT;
    const timeoutMs = label === "opening"
      ? VISIBLE_NARRATION_OPENING_TIMEOUT_MS
      : VISIBLE_NARRATION_TIMEOUT_MS;
    const outputTokenCap = label === "opening"
      ? VISIBLE_NARRATION_OPENING_MAX_OUTPUT_TOKENS
      : VISIBLE_NARRATION_MAX_OUTPUT_TOKENS;
    for (let attempt = 1; attempt <= transportRetryLimit; attempt += 1) {
      const startedAt = Date.now();
      const maxOutputTokens = visibleNarrationMaxOutputTokens(storytellerMaxTokens, outputTokenCap);
      log.event("storyteller.visible.call.start", {
        label,
        attempt,
        timeoutMs,
        requestedMaxOutputTokens: storytellerMaxTokens,
        maxOutputTokens,
      });
      try {
        const result = await generateText({
          model: createModel(activeProvider, {
            role: "storyteller",
            ...(label === "opening" ? { reasoningMode: "bypass" as const } : {}),
          }),
          system,
          prompt: promptText,
          temperature: storytellerTemperature,
          maxOutputTokens,
          timeout: { totalMs: timeoutMs },
        });
        log.event("storyteller.visible.call.end", {
          label,
          attempt,
          success: true,
          durationMs: Date.now() - startedAt,
          finishReason: result.finishReason ?? null,
          responseModel: result.response?.modelId ?? null,
          outputChars: result.text.length,
        });
        return result;
      } catch (error) {
        lastError = error;
        log.event("storyteller.visible.call.end", {
          label,
          attempt,
          success: false,
          durationMs: Date.now() - startedAt,
          error: errorMessage(error).slice(0, 500),
        });
        if (!isVisibleNarrationTransportError(error) || attempt >= transportRetryLimit) {
          throw error;
        }
        log.warn(
          `Visible narration transport error; retrying storyteller pass ${attempt + 1}/${transportRetryLimit}`,
          error,
        );
      }
    }

    throw lastError;
  }

  const initialResult = await runNarrationPass(provider, prompt);

  const initialText = applyVisibleNarrationFilters(initialResult.text);
  const initialReasoningText = normalizeReasoningText(extractReasoningText(initialResult));
  const initialFailures = detectVisibleNarrationFailures(initialResult.text, { system, prompt });
  if (initialFailures.length === 0) {
    return {
      text: initialText,
      reasoningText: initialReasoningText,
      retried: false,
      failures: [],
      usage: initialResult.usage,
      response: initialResult.response,
      finishReason: initialResult.finishReason,
    };
  }

  const retryPrompt = `${prompt}${buildVisibleNarrationRetryAddendum(initialFailures)}`;
  const initialHasRetryPriorityFailure = hasRetryPriorityVisibleNarrationFailure(initialFailures);

  try {
    const retryResult = await runNarrationPass(provider, retryPrompt);
    const retryText = applyVisibleNarrationFilters(retryResult.text);
    const retryReasoningText = normalizeReasoningText(extractReasoningText(retryResult));
    const retryFailures = detectVisibleNarrationFailures(retryResult.text, { system, prompt });
    const retryHasRetryPriorityFailure = hasRetryPriorityVisibleNarrationFailure(retryFailures);

    if (initialHasRetryPriorityFailure) {
      return {
        text: retryText,
        reasoningText: retryReasoningText,
        retried: true,
        failures: retryFailures,
        usage: retryResult.usage,
        response: retryResult.response,
        finishReason: retryResult.finishReason,
      };
    }

    if (
      !retryHasRetryPriorityFailure
      && scoreVisibleNarrationCandidate(retryText, retryFailures) >= scoreVisibleNarrationCandidate(initialText, initialFailures)
    ) {
      return {
        text: retryText,
        reasoningText: retryReasoningText,
        retried: true,
        failures: retryFailures,
        usage: retryResult.usage,
        response: retryResult.response,
        finishReason: retryResult.finishReason,
      };
    }
  } catch (retryError) {
    if (initialHasRetryPriorityFailure) {
      throw retryError;
    }
    log.warn("Visible narration quality retry failed; keeping first visible pass", retryError);
  }

  return {
    text: initialText,
    reasoningText: initialReasoningText,
    retried: true,
    failures: initialFailures,
    usage: initialResult.usage,
    response: initialResult.response,
    finishReason: initialResult.finishReason,
  };
}

async function runVisibleNarrationDraftWithGuard(args: {
  label: "final";
  provider: ProviderConfig;
  narratorPacket: NarratorPacket;
  system: string;
  prompt: string;
  storytellerTemperature: number;
  storytellerMaxTokens: number;
}): Promise<{
  text: string;
  draft: NarrationDraft;
  reasoningText: string | undefined;
  retried: boolean;
  failures: VisibleNarrationFailure[];
  usage?: VisibleNarrationUsage;
  response?: VisibleNarrationResponse;
  finishReason?: VisibleNarrationFinishReason;
  structuredTrace: NarrationDraftStructuredTrace;
}> {
  const {
    label,
    provider,
    narratorPacket,
    system,
    prompt,
    storytellerTemperature,
    storytellerMaxTokens,
  } = args;

  async function runNarrationDraftPass(activeProvider: ProviderConfig, promptText: string) {
    let lastError: unknown;
    let contractRepairAddendum: string | null = null;
    for (
      let contractAttempt = 1;
      contractAttempt <= VISIBLE_NARRATION_DRAFT_CONTRACT_RETRY_LIMIT + 1;
      contractAttempt += 1
    ) {
      const activePrompt = contractRepairAddendum
        ? `${promptText}\n\n[GROUNDING DRAFT CORRECTION]\n${contractRepairAddendum}`
        : promptText;
      let shouldRetryContract = false;
      for (let attempt = 1; attempt <= VISIBLE_NARRATION_DRAFT_CHANNEL_RETRY_LIMIT; attempt += 1) {
        const startedAt = Date.now();
        const maxOutputTokens = visibleNarrationMaxOutputTokens(
          storytellerMaxTokens,
          VISIBLE_NARRATION_DRAFT_MAX_OUTPUT_TOKENS,
        );
        log.event("storyteller.visible.call.start", {
          label,
          attempt,
          contractAttempt,
          structured: true,
          mode: VISIBLE_NARRATION_DRAFT_MODE,
          timeoutMs: VISIBLE_NARRATION_DRAFT_TIMEOUT_MS,
          requestedMaxOutputTokens: storytellerMaxTokens,
          maxOutputTokens,
          contractRepair: contractRepairAddendum !== null,
        });
        try {
          const result = await generateObject({
            model: createModel(activeProvider, {
              role: "storyteller",
              reasoningMode: "bypass",
            }),
            schema: groundedSentenceDraftSchema,
            system,
            prompt: activePrompt,
            temperature: storytellerTemperature,
            maxOutputTokens,
            timeout: { totalMs: VISIBLE_NARRATION_DRAFT_TIMEOUT_MS },
            mode: VISIBLE_NARRATION_DRAFT_MODE,
            retries: 1,
            allowTextFallback: false,
            allowRepair: false,
            strictSchema: true,
          });
          assertClosedStructuredNarrationDraftTrace(result.trace);
          const compiledDraft = compileGroundedSentenceDraftToNarrationDraft({
            packet: narratorPacket,
            draft: result.object,
          });
          log.event("storyteller.visible.call.end", {
            label,
            attempt,
            contractAttempt,
            structured: true,
            success: true,
            durationMs: Date.now() - startedAt,
            finishReason: result.trace.finishReason ?? null,
            responseModel: result.trace.response?.modelId ?? null,
            strategy: result.trace.strategy ?? null,
            primaryStrategy: result.trace.primaryStrategy ?? null,
            fallbackReason: result.trace.fallbackReason ?? null,
            outputChars: compiledDraft.prose.length,
            sentenceCount: result.object.sentences.length,
            contractRepair: contractRepairAddendum !== null,
          });
          return { draft: compiledDraft, trace: result.trace };
        } catch (error) {
          lastError = error;
          const message = errorMessage(error);
          log.event("storyteller.visible.call.end", {
            label,
            attempt,
            contractAttempt,
            structured: true,
            success: false,
            durationMs: Date.now() - startedAt,
            error: message.slice(0, 500),
            contractRepair: contractRepairAddendum !== null,
          });
          if (
            isGroundedSentenceDraftContractError(error)
            && contractAttempt <= VISIBLE_NARRATION_DRAFT_CONTRACT_RETRY_LIMIT
          ) {
            contractRepairAddendum = buildGroundedSentenceDraftRepairAddendum({
              packet: narratorPacket,
              failureReason: message,
            });
            log.event("storyteller.visible.draft-contract-retry", {
              label,
              contractAttempt,
              nextContractAttempt: contractAttempt + 1,
              reason: message.slice(0, 500),
            });
            shouldRetryContract = true;
            break;
          }
          if (
            !isVisibleNarrationRetryableChannelError(error)
            || attempt >= VISIBLE_NARRATION_DRAFT_CHANNEL_RETRY_LIMIT
          ) {
            throw error;
          }
          log.warn(
            `Visible structured narration channel error; retrying same contract pass ${attempt + 1}/${VISIBLE_NARRATION_DRAFT_CHANNEL_RETRY_LIMIT}`,
            error,
          );
        }
      }
      if (shouldRetryContract) {
        continue;
      }
      break;
    }

    throw lastError;
  }

  const initialResult = await runNarrationDraftPass(provider, prompt);
  const initialDraft = initialResult.draft;
  const initialReasoningText = normalizeReasoningText(initialResult.trace.reasoningText);
  const initialFailures = detectVisibleNarrationFailures(initialDraft.prose, { system, prompt });
  if (initialFailures.length === 0) {
    return {
      text: initialDraft.prose,
      draft: initialDraft,
      reasoningText: initialReasoningText,
      retried: false,
      failures: [],
        usage: initialResult.trace.usage as VisibleNarrationUsage | undefined,
        response: initialResult.trace.response,
        finishReason: initialResult.trace.finishReason,
        structuredTrace: summarizeNarrationDraftStructuredTrace(initialResult.trace),
      };
    }

  log.event("visible-narration.prose-filter", {
    label,
    status: "failed-closed",
    failures: initialFailures,
    finishReason: initialResult.trace.finishReason ?? null,
    responseModel: initialResult.trace.response?.modelId ?? null,
  });
  throw new Error(
    `Visible structured narration failed visible prose filters: ${initialFailures.join(", ")}`,
  );
}

function assertClosedStructuredNarrationDraftTrace(trace: {
  strategy?: unknown;
  fallbackReason?: unknown;
  repairedFromStrategy?: unknown;
  repair?: unknown;
}): void {
  const usedClosedStructuredStrategy =
    trace.strategy === "native_json" || trace.strategy === "tool_mode";

  if (
    usedClosedStructuredStrategy
    && trace.fallbackReason == null
    && trace.repairedFromStrategy == null
    && trace.repair == null
  ) {
    return;
  }

  throw new Error(
    `Final NarrationDraft generation left closed structured output path (strategy=${String(trace.strategy ?? "unknown")}); failing closed.`,
  );
}

function isGroundedSentenceDraftContractError(error: unknown): boolean {
  return /GroundedSentenceDraft/u.test(errorMessage(error));
}

function summarizeNarrationDraftStructuredTrace(trace: {
  strategy?: unknown;
  primaryStrategy?: unknown;
  fallbackStrategy?: unknown;
  fallbackReason?: unknown;
  repairedFromStrategy?: unknown;
  repair?: unknown;
  finishReason?: unknown;
  response?: { modelId?: string };
}): NarrationDraftStructuredTrace {
  return {
    strategy: trace.strategy ?? null,
    primaryStrategy: trace.primaryStrategy ?? null,
    fallbackStrategy: trace.fallbackStrategy ?? null,
    fallbackReason: trace.fallbackReason ?? null,
    repairedFromStrategy: trace.repairedFromStrategy ?? null,
    repair: trace.repair ?? null,
    finishReason: trace.finishReason ?? null,
    responseModel: trace.response?.modelId ?? null,
  };
}

// -- Main processor -----------------------------------------------------------

function isScenePlanEnabled(): boolean {
  // Phase 95: the legacy player-turn path lacks settled packet/structured
  // narration invariants, so the old rollback flag must fail closed.
  if (process.env.SCENE_PLAN_ENABLED === "false") {
    if (process.env.NODE_ENV === "test") {
      return false;
    }
    throw new Error(
      "SCENE_PLAN_ENABLED=false legacy player-turn path is disabled; scene-plan pipeline is required.",
    );
  }
  return !(process.env.SCENE_PLAN_ENABLED === "false");
}

function getSceneActorLabel(frame: SceneFrame, actorId: string): string {
  const actor = [
    ...frame.roster.active,
    ...frame.roster.support,
    ...frame.roster.background,
  ].find((entry) => entry.id === actorId || entry.actorId === actorId);

  if (!actor) {
    return "Unknown actor";
  }
  if (actor.awareness === "clear") {
    return actor.label;
  }
  return actor.awarenessHint ?? "A nearby presence";
}

function actorIsClearToPlayer(frame: SceneFrame, actorId: string | null | undefined): boolean {
  if (!actorId || actorId === frame.playerActorId) {
    return true;
  }

  const actor = [
    ...frame.roster.active,
    ...frame.roster.support,
    ...frame.roster.background,
  ].find((entry) => entry.id === actorId || entry.actorId === actorId);

  return actor?.awareness === "clear";
}

function sceneResponseToPacketResponse(
  frame: SceneFrame,
  response: SceneResponse,
  summaryOverride?: string,
): CanonicalTurnPacketResponse {
  return {
    id: response.id,
    actorId: response.actorId,
    responseKind: response.responseKind,
    eventId: response.eventId,
    summary: summaryOverride?.trim().length
      ? summaryOverride.trim()
      : `${getSceneActorLabel(frame, response.actorId)} response: ${response.responseKind}.`,
    visibleToPlayer: response.visibleToPlayer,
    targetIds: response.targetIds,
  };
}

function scenePlanAnchorToPacketEvent(args: {
  frame: SceneFrame;
  plan: ScenePlan;
  playerAction: string;
}): CanonicalTurnPacketEvent {
  return {
    id: args.plan.anchorEvent.id,
    actorId: args.plan.anchorEvent.actorId,
    kind: args.plan.anchorEvent.kind,
    summary: `Player action request: ${args.playerAction}`,
    perceivableByPlayer: true,
  };
}

function scenePlanActionToPacketEffect(
  action: ExecutedScenePlanActionResult,
): CanonicalTurnPacketEffect {
  return {
    id: `action-result:${action.actionId}`,
    actionId: action.actionId,
    actorId: action.actorId,
    toolName: action.toolName,
    summary: action.summary?.trim() || summarizeRuntimeToolResultForNarrator({
      toolName: action.toolName,
      actionId: action.actionId,
      toolInput: action.input,
      toolArgs: action.args,
      toolResult: action.result,
    }),
    perceivableByPlayer: true,
    toolResult: action.result,
  };
}

function gmReadRuntimeRequirementKind(gmRead: GmRead): string | null {
  if (gmRead.path !== "tool_plan") return null;
  const requirement = gmRead.runtimeRequirement;
  return requirement && requirement.kind !== "none" ? requirement.kind : null;
}

function canonicalTurnKindForGmRead(args: {
  gmRead: GmRead;
  outcomeBounds: ReturnType<typeof buildNarrativeOutcomeBounds> | null;
}): CanonicalTurnResolution["kind"] {
  if (args.gmRead.path === "combat_transition" || args.outcomeBounds) return "combat_transition";
  const requirementKind = gmReadRuntimeRequirementKind(args.gmRead);
  if (requirementKind === "observation_read") return "status_read";
  if (requirementKind === "dialogue_outcome") return "dialogue_outcome";
  if (requirementKind === "world_fact") return "world_fact";
  if (requirementKind === "scene_beat") return "scene_beat";
  if (requirementKind === "state_mutation") return "state_mutation";
  return "direct_noop";
}

function isCombatAuthorityTool(toolName: string | undefined): boolean {
  return toolName === "request_contested_outcome" || toolName === "set_condition";
}

function buildCanonicalTurnResolution(args: {
  gmRead: GmRead;
  actionResults: readonly ExecutedScenePlanActionResult[];
  outcomeBounds: ReturnType<typeof buildNarrativeOutcomeBounds> | null;
}): CanonicalTurnResolution {
  const successful = args.actionResults.filter((result) => result.result.success);
  const observationIds = successful
    .filter((result) => isObservationToolResult(result.result))
    .map((result) => `action-result:${result.actionId}`);
  const mutationIds = successful
    .filter((result) => !isObservationToolResult(result.result))
    .map((result) => `action-result:${result.actionId}`);
  const combatIntent =
    args.gmRead.path === "combat_transition"
    || Boolean(args.outcomeBounds)
    || successful.some((result) => isCombatAuthorityTool(result.toolName));
  const kind =
    !combatIntent && observationIds.length > 0 && mutationIds.length === 0
      ? "status_read"
      : canonicalTurnKindForGmRead({
          gmRead: args.gmRead,
          outcomeBounds: args.outcomeBounds,
        });
  const resolutionState: CanonicalTurnResolution["resolutionState"] =
    combatIntent && mutationIds.length === 0 && observationIds.length > 0
      ? "explicit_no_combat"
      : mutationIds.length > 0
        ? "mutated"
        : observationIds.length > 0
          ? "observation_grounded"
          : "explicit_no_change";
  const evidenceIds = [
    ...observationIds,
    ...mutationIds,
  ];

  return {
    kind,
    resolutionState,
    combatIntent,
    evidenceIds,
    consequenceIds: mutationIds,
    explicitNoCombatEvidenceIds:
      !combatIntent && observationIds.length > 0
        ? observationIds
        : resolutionState === "explicit_no_combat"
          ? observationIds
          : [],
    toolNames: [...new Set(successful.map((result) => result.toolName))],
  };
}

function buildCanonicalTurnPacketFromScenePlan(args: {
  frame: SceneFrame;
  gmRead: GmRead;
  plan: ScenePlan;
  executedPlan: { actionResults: ExecutedScenePlanActionResult[] };
  actorActionResults?: readonly ExecutedScenePlanActionResult[];
  oracleResult: OracleResult | null;
  outcomeBounds: ReturnType<typeof buildNarrativeOutcomeBounds> | null;
}): CanonicalTurnPacket {
  const anchorEvent = scenePlanAnchorToPacketEvent({
    frame: args.frame,
    plan: args.plan,
    playerAction: args.frame.playerAction,
  });
  const actionResults = [
    ...args.executedPlan.actionResults,
    ...(args.actorActionResults ?? []),
  ];
  const primaryResponseSummary =
    actionResults.length === 0
      ? `GM no-mutation direction: ${boundedPlanText(args.plan.actionInterpretation.intent, 220)}`
      : undefined;
  const responses = [
    sceneResponseToPacketResponse(args.frame, args.plan.primaryResponse, primaryResponseSummary),
    ...args.plan.supportResponses.map((response) =>
      sceneResponseToPacketResponse(args.frame, response),
    ),
  ];
  const narratorVisibleActorActionResults = (args.actorActionResults ?? []).filter((result) =>
    actorIsClearToPlayer(args.frame, result.actorId),
  );
  const packetActionIds = Array.from(new Set([
    ...args.plan.narratorFacts.actionIds,
    ...args.executedPlan.actionResults.map((action) => action.actionId),
    ...narratorVisibleActorActionResults.map((action) => action.actionId),
  ]));
  const packetToolResultRefs = Array.from(
    new Map(
      [
        ...args.plan.narratorFacts.toolResultRefs,
        ...args.executedPlan.actionResults.map((action) => ({
          actionId: action.actionId,
          toolName: action.toolName,
        })),
        ...narratorVisibleActorActionResults.map((action) => ({
          actionId: action.actionId,
          toolName: action.toolName,
        })),
      ].map((ref) => [`${ref.actionId}:${ref.toolName}`, ref]),
    ).values(),
  );
  const narratorFacts = {
    ...args.plan.narratorFacts,
    actionIds: packetActionIds,
    toolResultRefs: packetToolResultRefs,
  };
  const turnResolution = buildCanonicalTurnResolution({
    gmRead: args.gmRead,
    actionResults,
    outcomeBounds: args.outcomeBounds,
  });

  return {
    campaignId: args.frame.campaignId,
    tick: args.frame.tick,
    playerAction: args.frame.playerAction,
    oracleOutcome: args.oracleResult?.outcome ?? null,
    turnResolution,
    narratorFacts,
    anchorEvent,
    events: [anchorEvent],
    responses,
    effects: actionResults.map(scenePlanActionToPacketEffect),
    actionResults,
    guardrails: [
      "Narrate only committed player-perceivable packet facts.",
      ...(args.outcomeBounds?.prohibitions ?? []),
      ...(args.outcomeBounds?.ceilings ?? []),
    ],
    controlReturnReason: "The canonical local ScenePlan step has resolved and returned control to the player.",
    outcomeBounds: args.outcomeBounds ?? undefined,
  };
}

function primarySceneActorId(frame: SceneFrame): string {
  return (
    frame.roster.active.find((actor) => actor.id === frame.playerActorId)?.id
    ?? frame.roster.active[0]?.id
    ?? frame.playerActorId
  );
}

function boundedPlanText(value: string, max: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= max) {
    return trimmed;
  }

  return trimmed.slice(0, max).trim();
}

function buildNoMutationScenePlan(args: {
  frame: SceneFrame;
  gmRead: Extract<GmRead, { path: "direct" | "continue" | "clarification" }>;
}): ScenePlan {
  const actorId = primarySceneActorId(args.frame);
  const anchorEventId = randomUUID();
  const primaryResponseId = randomUUID();
  const decision = args.gmRead;
  const intent =
    decision.path === "direct"
      ? decision.directResolutionNotes
      : decision.path === "continue"
        ? decision.continuationGuidance
        : decision.clarificationPrompt;

  return {
    actionInterpretation: {
      actorId,
      intent: boundedPlanText(intent, 160),
      method: decision.path,
      targetIds: [],
    },
    anchorEvent: {
      id: anchorEventId,
      actorId,
      subjectIds: [],
      kind: decision.path === "clarification" ? "environment" : "player_action",
    },
    primaryResponse: {
      id: primaryResponseId,
      actorId,
      responseKind: decision.path === "clarification" ? "system" : "environment",
      eventId: anchorEventId,
      visibleToPlayer: true,
      targetIds: [],
    },
    supportResponses: [],
    plannedActions: [],
    deferredHooks: [],
    narratorFacts: {
      anchorEventId,
      eventIds: [anchorEventId],
      responseIds: [primaryResponseId],
      actionIds: [],
      toolResultRefs: [],
    },
    hiddenRationale: boundedPlanText(
      decision.rationale ?? `GM ${decision.path} decision produced a no-mutation ScenePlan artifact.`,
      280,
    ),
  };
}

function isNoMutationGmReadPath(
  gmRead: GmRead,
): gmRead is Extract<GmRead, { path: "direct" | "continue" | "clarification" }> {
  return gmRead.path === "direct" || gmRead.path === "continue" || gmRead.path === "clarification";
}

function buildNoMutationExecutedScenePlan(args: {
  frame: SceneFrame;
  plan: ScenePlan;
}): ExecutedScenePlan {
  const validatedPlan = {
    frame: args.frame,
    plan: args.plan,
    issues: [],
  };

  return {
    plan: validatedPlan,
    validatedPlan,
    toolCallResults: [],
    actionResults: [],
    emittedEvents: [],
    quickActionsEmitted: false,
    successfulTravel: null,
    canonicalEvents: [],
  };
}

function successfulToolStepResults(
  stepResults: readonly GmToolStepResult[],
): GmToolStepResult[] {
  return stepResults.filter((result) =>
    result.result?.success === true
    && result.toolName !== null
    && result.candidateInput !== null,
  );
}

function successfulStateChangingToolStepResults(
  stepResults: readonly GmToolStepResult[],
): GmToolStepResult[] {
  return successfulToolStepResults(stepResults).filter((result) =>
    result.result && !isObservationToolResult(result.result),
  );
}

function isObservationActionResult(
  actionResult: ExecutedScenePlanActionResult,
): boolean {
  return isObservationToolResult(actionResult.result);
}

function firstObservationLabel(entry: unknown): string | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return null;
  }
  const record = entry as Record<string, unknown>;
  for (const key of ["label", "name", "ref", "id"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function observationLabels(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const labels: string[] = [];
  for (const entry of value) {
    const label = firstObservationLabel(entry);
    if (label) labels.push(label);
    if (labels.length >= limit) break;
  }
  return labels;
}

function observationSummaries(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const summaries: string[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const summary = (entry as Record<string, unknown>).summary;
    if (typeof summary === "string" && summary.trim()) {
      summaries.push(summary.trim());
    }
    if (summaries.length >= limit) break;
  }
  return summaries;
}

function categoryRecord(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const entry = (value as Record<string, unknown>)[key];
  return entry && typeof entry === "object" && !Array.isArray(entry)
    ? entry as Record<string, unknown>
    : null;
}

function pushCategoryObservationPart(
  parts: string[],
  label: string,
  category: Record<string, unknown> | null,
): void {
  if (!category) return;
  const labels = [
    ...observationLabels(category.targets, 2),
    ...observationLabels(category.actors, 2),
  ];
  const summaries = observationSummaries(category.facts, 2);
  const absence = typeof category.absence === "string" && category.absence.trim()
    ? category.absence.trim()
    : null;
  const details = [...labels, ...summaries].slice(0, 3);
  if (details.length > 0) {
    parts.push(`${label} ${details.join("; ")}`);
  } else if (absence) {
    parts.push(`${label} ${absence}`);
  }
}

function summarizeObservationPayloadForPacket(
  toolName: string,
  payload: unknown,
): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const parts: string[] = [];
  const visibleActors = observationLabels(record.visibleActors, 3);
  const legalTargets = observationLabels(record.legalTargets, 3);
  const legalMovement = observationLabels(record.legalMovement, 3);
  const candidates = observationLabels(record.candidates, 4);
  const affordances = observationLabels(record.affordances, 4);
  const visibleFacts = observationSummaries(record.visibleFacts, 3);
  const categories = record.categories;
  pushCategoryObservationPart(parts, "personnel", categoryRecord(categories, "personnel"));
  pushCategoryObservationPart(parts, "barriers", categoryRecord(categories, "barriers"));
  pushCategoryObservationPart(parts, "exits/routes", { targets: (categories as Record<string, unknown> | undefined)?.exitsRoutes });
  pushCategoryObservationPart(parts, "physical options", { targets: (categories as Record<string, unknown> | undefined)?.physicalAffordances });
  pushCategoryObservationPart(parts, "witnesses", categoryRecord(categories, "witnesses"));
  pushCategoryObservationPart(parts, "cameras", categoryRecord(categories, "cameras"));
  if (visibleFacts.length > 0) parts.push(`facts ${visibleFacts.join("; ")}`);
  if (legalMovement.length > 0) parts.push(`routes ${legalMovement.join(", ")}`);
  if (affordances.length > 0) parts.push(`scene options ${affordances.join(", ")}`);
  if (candidates.length > 0) parts.push(`matches ${candidates.join(", ")}`);
  if (visibleActors.length > 0) parts.push(`actors ${visibleActors.join(", ")}`);
  if (legalTargets.length > 0) parts.push(`visible options ${legalTargets.join(", ")}`);
  if (parts.length > 0) {
    return `${observationToolPublicLabel(toolName)}: ${parts.join("; ")}`;
  }
  const count = typeof record.count === "number" ? record.count : null;
  if (count === null) return null;
  return count > 0
    ? `${observationToolPublicLabel(toolName)} confirms ${count} visible option${count === 1 ? "" : "s"}.`
    : `${observationToolPublicLabel(toolName)} confirms no matching visible option.`;
}

function observationToolPublicLabel(toolName: string): string {
  switch (toolName) {
    case "list_visible_affordances":
      return "Scene scan";
    case "list_navigation_options":
    case "check_route":
      return "Route check";
    case "find_location_candidates":
      return "Location check";
    case "find_object_candidates":
      return "Object check";
    case "find_actor_candidates":
      return "People check";
    case "find_poi_candidates":
      return "Local point check";
    case "inspect_known_fact":
      return "Known information check";
    default:
      return "Scene observation";
  }
}

function summarizeObservationToolStepResult(
  stepResult: GmToolStepResult,
  fallbackSummary?: string,
): string {
  const toolName = stepResult.toolName ?? "observation_tool";
  return boundedPlanText(
    summarizeObservationPayloadForPacket(toolName, stepResult.result?.result)
      ?? fallbackSummary
      ?? stepResult.visibleEffect
      ?? "A player-visible observation is confirmed without changing state.",
    640,
  );
}

function buildScenePlanActionFromToolStep(
  result: GmToolStepResult,
  actorId: string,
): ScenePlanAction {
  return scenePlanActionSchema.parse({
    id: randomUUID(),
    actorId,
    toolName: result.toolName,
    input: result.candidateInput,
  });
}

function getSuccessfulMoveToolStepResult(result: GmToolStepResult): SuccessfulTravel | null {
  const payload = result.result?.result;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const moveResult = payload as Record<string, unknown>;
  if (
    typeof moveResult.locationId !== "string"
    || typeof moveResult.locationName !== "string"
    || typeof moveResult.travelCost !== "number"
    || !Array.isArray(moveResult.path)
  ) {
    return null;
  }

  const tickAdvance = typeof moveResult.tickAdvance === "number"
    ? moveResult.tickAdvance
    : moveResult.travelCost;

  return {
    locationId: moveResult.locationId,
    locationName: moveResult.locationName,
    travelCost: moveResult.travelCost,
    tickAdvance,
    path: moveResult.path.filter((entry): entry is string => typeof entry === "string"),
  };
}

function buildScenePlanFromGmToolLoop(args: {
  frame: SceneFrame;
  gmRead: Extract<GmRead, { path: "tool_plan" | "roll_oracle" | "combat_transition" }>;
  intent: string;
  observationSummary?: string;
  stepResults: readonly GmToolStepResult[];
}): ScenePlan {
  const actorId = primarySceneActorId(args.frame);
  const anchorEventId = randomUUID();
  const primaryResponseId = randomUUID();
  const successfulSteps = successfulStateChangingToolStepResults(args.stepResults);
  const plannedActions = successfulSteps.map((result) =>
    buildScenePlanActionFromToolStep(result, actorId),
  );
  const intentWithObservation = args.observationSummary
    ? boundedPlanText(
      `${args.intent} Scene observation: ${args.observationSummary}`,
      420,
    )
    : args.intent;

  return {
    actionInterpretation: {
      actorId,
      intent: boundedPlanText(intentWithObservation, 420),
      method: args.gmRead.path,
      targetIds: [],
    },
    anchorEvent: {
      id: anchorEventId,
      actorId,
      subjectIds: [],
      kind: args.gmRead.path === "combat_transition" ? "oracle_outcome" : "player_action",
    },
    primaryResponse: {
      id: primaryResponseId,
      actorId,
      responseKind: "environment",
      eventId: anchorEventId,
      visibleToPlayer: true,
      targetIds: [],
    },
    supportResponses: [],
    plannedActions,
    deferredHooks: [],
    narratorFacts: {
      anchorEventId,
      eventIds: [anchorEventId],
      responseIds: [primaryResponseId],
      actionIds: plannedActions.map((action) => action.id),
      toolResultRefs: plannedActions.map((action) => ({
        actionId: action.id,
        toolName: action.toolName,
      })),
    },
    hiddenRationale: boundedPlanText(
      `${args.gmRead.rationale} ${intentWithObservation}`,
      280,
    ),
  };
}

function buildExecutedScenePlanFromGmToolLoop(args: {
  frame: SceneFrame;
  plan: ScenePlan;
  observationSummary?: string;
  stepResults: readonly GmToolStepResult[];
}): ExecutedScenePlan {
  const validatedPlan = {
    frame: args.frame,
    plan: args.plan,
    issues: [],
  };
  const successfulSteps = successfulToolStepResults(args.stepResults);
  let plannedActionIndex = 0;
  const actionResults = successfulSteps.map((stepResult, order): ExecutedScenePlanActionResult => {
    const isObservation = stepResult.result ? isObservationToolResult(stepResult.result) : false;
    const action = isObservation ? null : args.plan.plannedActions[plannedActionIndex++];
    if (!isObservation && !action) {
      throw new Error("GM tool loop execution produced more state-changing results than planned actions.");
    }
    return {
      order,
      actionId: action?.id ?? randomUUID(),
      actionRef: stepResult.stepId,
      actorId: action?.actorId ?? primarySceneActorId(args.frame),
      toolName: action?.toolName ?? stepResult.toolName!,
      input: action?.input ?? stepResult.candidateInput!,
      args: stepResult.candidateInput!,
      result: stepResult.result!,
      summary: isObservation
        ? summarizeObservationToolStepResult(stepResult, args.observationSummary)
        : undefined,
    };
  });
  const successfulTravel = successfulSteps.reduce<SuccessfulTravel | null>(
    (travel, result) => travel ?? (
      result.toolName === "move_to" || result.toolName === "move_actor"
        ? getSuccessfulMoveToolStepResult(result)
        : null
    ),
    null,
  );
  const emittedEvents: ExecutedScenePlan["emittedEvents"] = [];
  for (const actionResult of actionResults) {
    if (isObservationActionResult(actionResult)) {
      continue;
    }
    if (actionResult.toolName === "offer_quick_actions") {
      emittedEvents.push({ type: "quick_actions", data: actionResult.result });
      continue;
    }
    if (actionResult.toolName === "move_to" || actionResult.toolName === "move_actor") {
      const moveResult = getSuccessfulMoveToolStepResult({
        stepId: actionResult.actionRef,
        attempt: 1,
        status: "done",
        toolName: actionResult.toolName,
        candidateInput: actionResult.args,
        validationError: null,
        visibleEffect: "",
        privateGuardTerms: [],
        mutationRefs: [],
        settledAtTick: args.frame.tick,
        result: actionResult.result,
      });
      if (moveResult) {
        emittedEvents.push({
          type: "state_update",
          data: {
            type: "location_change",
            locationId: moveResult.locationId,
            locationName: moveResult.locationName,
            travelCost: moveResult.travelCost,
            tickAdvance: moveResult.tickAdvance,
            path: moveResult.path,
          },
        });
        continue;
      }
    }
    emittedEvents.push({ type: "state_update", data: actionResult });
  }

  return {
    plan: validatedPlan,
    validatedPlan,
    toolCallResults: actionResults,
    actionResults,
    emittedEvents,
    quickActionsEmitted: actionResults.some((action) => action.toolName === "offer_quick_actions"),
    successfulTravel,
    canonicalEvents: actionResults
      .filter((actionResult) => !isObservationActionResult(actionResult))
      .map((actionResult) => ({
        id: actionResult.actionId,
        actionId: actionResult.actionId,
        actorId: actionResult.actorId,
        toolName: actionResult.toolName,
        result: actionResult.result.result,
      })),
  };
}

function normalizeDecisionRef(ref: string): string {
  return ref.trim().toLowerCase();
}

function candidateRefs(candidate: SceneFrameTargetCandidate): string[] {
  return [
    candidate.id,
    candidate.actorId,
    candidate.itemId,
    candidate.locationId,
    candidate.factionId,
    candidate.label,
  ].filter((value): value is string => Boolean(value?.trim()));
}

function findTargetCandidateByDecisionRef(
  frame: SceneFrame,
  ref: string | undefined,
): SceneFrameTargetCandidate | null {
  if (!ref) {
    return null;
  }

  const normalized = normalizeDecisionRef(ref);
  return frame.targetCandidates.find((candidate) =>
    candidateRefs(candidate).some((candidateRef) => normalizeDecisionRef(candidateRef) === normalized),
  ) ?? null;
}

function buildOracleContextFromRollRequest(
  frame: SceneFrame,
  decision: Extract<GmRead, { path: "roll_oracle" }>,
): SceneFrameOracleContext | null {
  const targetCandidate = findTargetCandidateByDecisionRef(
    frame,
    decision.rollRequest.targetRef,
  );

  return targetCandidate ? buildSceneFrameOracleContextForCandidate(targetCandidate) : null;
}

function buildOracleContextFromCombatTransition(
  frame: SceneFrame,
  decision: Extract<GmRead, { path: "combat_transition" }>,
): SceneFrameOracleContext | null {
  const targetCandidate = findTargetCandidateByDecisionRef(frame, decision.targetRef);

  return targetCandidate ? buildSceneFrameOracleContextForCandidate(targetCandidate) : null;
}

function toTurnToolCallResults(
  actionResults: readonly ExecutedScenePlanActionResult[],
): TurnToolCallResult[] {
  return actionResults.map((action) => ({
    tool: action.toolName,
    args: action.input,
    result: action.result,
  }));
}

function logScenePlanFrame(frame: SceneFrame, durationMs: number): void {
  const visibleActorCount =
    frame.roster.active.length
    + frame.roster.support.filter((actor) => actor.awareness === "clear").length;
  const hiddenActorCount =
    frame.roster.background.length
    + frame.roster.support.filter((actor) => actor.awareness !== "clear").length;

  log.event("scene.frame", {
    actorCount:
      frame.roster.active.length
      + frame.roster.support.length
      + frame.roster.background.length,
    visibleActorCount,
    hiddenActorCount,
    targetCandidateCount: frame.targetCandidates.length,
    movementCandidateCount: frame.movementCandidates.length,
    localRecentEventCount: frame.recentEvents.filter((event) => event.perceivableByPlayer).length,
    allowedToolCount: frame.allowedTools.length,
    durationMs,
  });
}

function pushForecastRef(refs: string[], value?: string | null): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  refs.push(trimmed);
}

function buildSceneFrameForecastRefs(frame: SceneFrame): string[] {
  const refs: string[] = [];

  pushForecastRef(refs, frame.currentLocationId);
  pushForecastRef(refs, frame.currentSceneScopeId);
  pushForecastRef(refs, frame.currentLocationName);
  pushForecastRef(refs, frame.currentSceneScopeName);
  pushForecastRef(refs, frame.playerActorId);

  for (const actor of [...frame.roster.active, ...frame.roster.support]) {
    if (actor.awareness !== "clear") continue;
    pushForecastRef(refs, actor.id);
    pushForecastRef(refs, actor.actorId);
    pushForecastRef(refs, actor.label);
    pushForecastRef(refs, actor.locationId);
    pushForecastRef(refs, actor.sceneScopeId);
  }

  for (const candidate of frame.targetCandidates) {
    if (candidate.type === "location") continue;
    if (candidate.type === "actor" && candidate.awareness !== "clear") continue;
    pushForecastRef(refs, candidate.id);
    pushForecastRef(refs, candidate.label);
    pushForecastRef(refs, candidate.actorId);
    pushForecastRef(refs, candidate.itemId);
    pushForecastRef(refs, candidate.factionId);
  }

  return [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))];
}

async function buildScopedForecastExcerptForFrame(
  frame: SceneFrame,
): Promise<{
  excerpt: ScopedForecastExcerpt;
  stagedForecast: StagedWorldTrajectoryForecast | null;
  refreshDue: boolean;
}> {
  try {
    const forecast = loadWorldTrajectoryForecast(frame.campaignId);
    const refreshDue = shouldRefreshWorldTrajectoryForecast(forecast, frame.tick);
    if (refreshDue) {
      log.event("world-forecast.refresh-deferred", {
        campaignId: frame.campaignId,
        tick: frame.tick,
        hasPriorForecast: forecast !== null,
      });
    }

    return {
      excerpt: buildScopedForecastExcerpt({
        forecast,
        localRefs: buildSceneFrameForecastRefs(frame),
      }),
      stagedForecast: null,
      refreshDue,
    };
  } catch (error) {
    log.warn("Failed to load scoped world forecast; continuing without forecast pressure", {
      error: error instanceof Error ? error.message : String(error),
      campaignId: frame.campaignId,
    });
    return {
      excerpt: buildScopedForecastExcerpt({
        forecast: null,
        localRefs: [],
      }),
      stagedForecast: null,
      refreshDue: false,
    };
  }
}

function commitStagedWorldForecast(
  campaignId: string,
  stagedForecast: StagedWorldTrajectoryForecast | null,
): void {
  if (!stagedForecast) return;
  const forecast = writeStagedWorldTrajectoryForecast(campaignId, stagedForecast);
  log.event("world-forecast.committed", {
    baseTick: forecast.baseTick,
    generatedAtTick: forecast.generatedAtTick,
    expiresAtTick: forecast.expiresAtTick ?? null,
    entryCount: forecast.entries.length,
  });
}

function logScenePlanPacket(packet: ReturnType<typeof buildNarratorPacket>, durationMs: number): void {
  log.event("scene.packet", {
    visibleActorCount: packet.visibleActors.length,
    hintSignalCount: packet.hintSignals.length,
    eventCount: packet.perceivableEvents.length,
    responseCount: packet.perceivableResponses.length,
    effectCount: packet.perceivableEffects.length,
    forbiddenActorCount: packet.forbiddenActorNames.length,
    forbiddenFactMarkerCount: packet.forbiddenFactMarkers.length,
    durationMs,
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function diagnosticForbiddenTerms(packet: NarratorPacket): string[] {
  return uniqueRefs([
    ...(packet.forbiddenActorNames ?? []),
    ...(packet.forbiddenFactMarkers ?? []),
    ...(packet.forbiddenPrivateTerms ?? []),
  ]);
}

function redactDiagnosticText(value: string, packet: NarratorPacket): string {
  let redacted = value.replace(/\s+/gu, " ").trim();
  for (const term of diagnosticForbiddenTerms(packet)) {
    redacted = redacted.replace(
      new RegExp(escapeRegExp(term), "giu"),
      "[private term omitted]",
    );
  }
  return redacted;
}

function allowedEvidenceDiagnostics(packet: NarratorPacket) {
  return (packet.evidenceLedger ?? []).map((entry) => ({
    id: entry.id,
    category: entry.category,
    summary: redactDiagnosticText(entry.summary, packet),
  }));
}

function visibleNarrationValidationDiagnostics(args: {
  validation: VisibleNarrationPacketValidationResult;
  packet: NarratorPacket;
}) {
  const grounding = args.validation.grounding;
  return {
    ok: args.validation.ok,
    violationKinds: args.validation.violations.map((violation) => violation.kind),
    groundingViolationKinds: grounding?.violations.map((violation) => violation.kind) ?? [],
    groundingWarnings: grounding?.warnings?.map((warning) => warning.kind) ?? [],
    groundingViolations: grounding?.violations.map((violation) => ({
      kind: violation.kind,
      claimKind: violation.claimKind,
      evidenceRefCount: violation.evidenceRefs?.length ?? 0,
      missingEvidenceRefCount: violation.missingEvidenceRefs?.length ?? 0,
      requiredEvidenceCategories: violation.requiredEvidenceCategories ?? [],
    })) ?? [],
    groundingCoverage: args.validation.diagnostics?.grounding?.coverage ?? null,
    redactionAudit: args.validation.diagnostics?.redactionAudit ?? null,
    allowedEvidence: allowedEvidenceDiagnostics(args.packet),
  };
}

function failedNarratorGroundingResult(args: {
  error: unknown;
  recovered: boolean;
  packet: NarratorPacket;
}) {
  const base = {
    ok: false,
    stage: "packet_guard",
    recovered: args.recovered,
    narrationContractVersion: GROUNDED_SENTENCE_DRAFT_CONTRACT_VERSION,
  };

  if (!(args.error instanceof VisibleNarrationPacketGuardError)) {
    return base;
  }

  return {
    ...base,
    attempts: args.error.attempts,
    violationKinds: args.error.violations.map((violation) => violation.kind),
    validationDiagnostics: args.error.validation
      ? visibleNarrationValidationDiagnostics({
          validation: args.error.validation,
          packet: args.packet,
        })
      : null,
  };
}

function uniqueRefs(values: readonly (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const refs: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    refs.push(trimmed);
  }
  return refs;
}

function executedActionRefs(
  actionResults: readonly ExecutedScenePlanActionResult[],
): string[] {
  return uniqueRefs(
    actionResults.flatMap((result) => [
      result.actionRef,
      result.actionId,
      `${result.toolName}:${result.actionId}`,
    ]),
  );
}

function dueWorldRefs(result: ResolveDueWorldWorkForScopeResult): string[] {
  return uniqueRefs([
    ...result.executed.flatMap((entry) => [
      ...entry.eventIds,
      ...entry.stateDeltaRefs,
      entry.authority?.toolResultId,
    ]),
    ...result.deferred.map((entry) => entry.proposal.proposalId),
    ...result.worldThreads.executed.flatMap((entry) => [
      entry.thread.id,
      entry.event.id,
      entry.authority.toolResultId,
    ]),
    ...result.worldThreads.deferred.map((entry) => entry.thread.id),
  ]);
}

function oracleDecisionInputFromGmRead(args: {
  sagaId: string;
  gmRead: GmRead;
  oracleResult: OracleResult;
  targetContext: SceneFrameOracleContext | null;
  combatEnvelope: ReturnType<typeof buildCombatEnvelope> | null;
  baseWorldVersion: number;
  acceptedWorldVersion: number;
}) {
  const question = args.gmRead.path === "roll_oracle"
    ? args.gmRead.rollRequest.question
    : args.gmRead.path === "combat_transition"
      ? args.gmRead.combatFraming
      : args.gmRead.actionInterpretation.intent;
  const stakes = args.gmRead.path === "roll_oracle"
    ? args.gmRead.rollRequest.stakes
    : args.gmRead.rationale;

  return {
    sagaId: args.sagaId,
    question,
    stakes,
    outcome: args.oracleResult.outcome,
    reasoning: args.oracleResult.reasoning,
    mechanicalImplications: {
      gmPath: args.gmRead.path,
      actionInterpretation: args.gmRead.actionInterpretation,
      combatEnvelope: args.combatEnvelope,
    },
    visibilityImplications: {
      targetLabel: args.targetContext?.targetLabel ?? null,
      targetType: args.targetContext?.targetType ?? null,
      source: args.targetContext?.source ?? null,
      evidenceRefs: args.gmRead.evidenceRefs,
    },
    confidence: args.oracleResult.chance,
    chance: args.oracleResult.chance,
    requiresToolCommit: true,
    baseWorldVersion: args.baseWorldVersion,
    acceptedWorldVersion: args.acceptedWorldVersion,
    sourceRefs: args.gmRead.evidenceRefs,
    decision: {
      oracleResult: args.oracleResult,
      gmReadPath: args.gmRead.path,
      targetContext: args.targetContext,
    },
  } satisfies Parameters<typeof persistOracleDecision>[0];
}

function minimalSceneAssemblyFromNarratorPacket(packet: NarratorPacket): SceneAssembly {
  return {
    openingScene: false,
    openingState: null,
    currentScene: null,
    presentNpcNames: packet.visibleActors
      .filter((actor) => actor.type === "npc")
      .map((actor) => actor.label),
    sceneDirection: null,
    playerPerceivableSceneDirection: null,
    awareness: {
      contract: {
        clear: "Full present-scene actor context. Identity and direct interaction are justified.",
        hint: "Bounded indirect presence signal only. No identity leakage in player-facing surfaces.",
        none: "Outside encounter scope for this consumer. Omit from player-facing prompt surfaces.",
      },
      byNpcName: {},
      clearNpcNames: packet.visibleActors
        .filter((actor) => actor.type === "npc")
        .map((actor) => actor.label),
      hintSignals: packet.hintSignals,
    },
    recentContext: packet.perceivableEvents.map((event) => ({
      tick: packet.tick,
      summary: event.summary,
      source: "committed_event",
    })),
    sceneEffects: packet.perceivableEffects.map((effect) => ({
      id: effect.id,
      kind: "environment",
      source: "tool_call",
      summary: effect.summary,
      perceivable: true,
      actor: effect.actorId ?? null,
      target: null,
      locationId: null,
      causalDetail: effect.toolName ?? null,
    })),
    playerPerceivableConsequences: [
      ...packet.perceivableResponses.map((response) => response.summary),
      ...packet.perceivableEffects.map((effect) => effect.summary),
    ],
  };
}

function requireNarratorPacket(value: unknown): NarratorPacket {
  if (
    !value
    || typeof value !== "object"
    || Array.isArray(value)
    || typeof (value as { campaignId?: unknown }).campaignId !== "string"
    || typeof (value as { playerAction?: unknown }).playerAction !== "string"
    || !Array.isArray((value as { visibleActors?: unknown }).visibleActors)
  ) {
    throw new Error("SettledTurnPacket contains an invalid narrator packet.");
  }
  return value as NarratorPacket;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSuccessfulTravelFromToolResult(result: unknown): SuccessfulTravel | null {
  if (!isObjectRecord(result) || result.success !== true || !isObjectRecord(result.result)) {
    return null;
  }

  const payload = result.result;
  if (
    typeof payload.locationId !== "string"
    || typeof payload.locationName !== "string"
    || typeof payload.travelCost !== "number"
    || !Array.isArray(payload.path)
  ) {
    return null;
  }

  const tickAdvance = typeof payload.tickAdvance === "number"
    ? payload.tickAdvance
    : payload.travelCost;

  return {
    locationId: payload.locationId,
    locationName: payload.locationName,
    travelCost: payload.travelCost,
    tickAdvance,
    path: payload.path.filter((entry): entry is string => typeof entry === "string"),
  };
}

function getSuccessfulTravelFromCanonicalPacket(packet: unknown): SuccessfulTravel | null {
  if (!isObjectRecord(packet) || !Array.isArray(packet.actionResults)) {
    return null;
  }

  for (const actionResult of packet.actionResults) {
    if (!isObjectRecord(actionResult) || actionResult.toolName !== "move_to") {
      continue;
    }

    const travel = getSuccessfulTravelFromToolResult(actionResult.result);
    if (travel) {
      return travel;
    }
  }

  return null;
}

function getToolCallResultsFromCanonicalPacket(packet: unknown): TurnToolCallResult[] {
  if (!isObjectRecord(packet) || !Array.isArray(packet.actionResults)) {
    return [];
  }

  return packet.actionResults.flatMap((actionResult) => {
    if (!isObjectRecord(actionResult) || typeof actionResult.toolName !== "string") {
      return [];
    }

    return [{
      tool: actionResult.toolName,
      args: actionResult.args ?? actionResult.input ?? {},
      result: actionResult.result,
    }];
  });
}

function advanceNarrationTick(args: {
  campaignId: string;
  currentTick: number;
  successfulTravel: SuccessfulTravel | null;
  idempotentResume: boolean;
}): number {
  const storedTick = readCampaignConfig(args.campaignId).currentTick ?? args.currentTick;
  const worldClock = readWorldClock(args.campaignId);
  const baseTick = Math.max(
    args.currentTick,
    storedTick,
    worldClock.currentTick,
    worldClock.worldTimeMinutes,
  );
  if (args.idempotentResume) {
    if (storedTick > args.currentTick) {
      return baseTick;
    }
  }

  const tickAdvance = args.successfulTravel && args.successfulTravel.tickAdvance > 0
    ? args.successfulTravel.tickAdvance
    : 1;
  const targetTick = baseTick + tickAdvance;
  const deltaFromStoredTick = Math.max(0, targetTick - storedTick);

  if (deltaFromStoredTick === 0) {
    return storedTick;
  }
  if (deltaFromStoredTick === 1 && tickAdvance === 1) {
    return incrementTick(args.campaignId);
  }
  return advanceCampaignTick(args.campaignId, deltaFromStoredTick);
}

function applyPostNarrationStartConditionEffects(args: {
  db: ReturnType<typeof getDb>;
  campaignId: string;
  playerId?: string | null;
  lookupPlayerByCampaign: boolean;
  newTick: number;
  playerAction: string;
}): void {
  const storedPlayer = args.playerId
    ? args.db
      .select()
      .from(players)
      .where(eq(players.id, args.playerId))
      .get()
    : args.lookupPlayerByCampaign
      ? args.db
        .select()
        .from(players)
        .where(eq(players.campaignId, args.campaignId))
        .get()
      : null;

  if (!storedPlayer) {
    return;
  }

  const nextOpeningState = applyStartConditionEffects(
    hydrateStoredPlayerRecord(storedPlayer),
    {
      currentTick: args.newTick,
      currentLocationId: storedPlayer.currentLocationId,
      playerAction: args.playerAction,
    },
  );

  if (nextOpeningState.changed) {
    persistPlayerRuntimeRecord(
      args.db,
      storedPlayer.id,
      storedPlayer.campaignId,
      nextOpeningState.record,
    );
  }
}

async function* runPostNarrationFinalizationTail(args: {
  campaignId: string;
  turnId?: string;
  sagaId?: string;
  lockToken?: string;
  narratorAttemptId?: string;
  currentTick: number;
  playerId?: string | null;
  lookupPlayerByCampaign?: boolean;
  playerAction: string;
  successfulTravel: SuccessfulTravel | null;
  oracleResult: OracleResult | null;
  toolCallResults: TurnToolCallResult[];
  narrativeText: string;
  sceneAssembly?: SceneAssembly;
  onPostTurn?: (summary: TurnSummary) => void | Promise<void>;
  stagedForecast?: StagedWorldTrajectoryForecast | null;
  idempotentResume?: boolean;
  recordTransientCleanupStage?: (startedAt: number, tick: number) => void;
  finishLatencyTrace?: () => void;
}): AsyncGenerator<TurnEvent, { tick: number; summary: TurnSummary }, void> {
  const db = getDb();
  const heartbeat = () => {
    if (args.sagaId && args.lockToken) {
      heartbeatTurnSagaWorker({ sagaId: args.sagaId, lockToken: args.lockToken });
    }
  };
  heartbeat();
  const newTick = advanceNarrationTick({
    campaignId: args.campaignId,
    currentTick: args.currentTick,
    successfulTravel: args.successfulTravel,
    idempotentResume: args.idempotentResume ?? false,
  });
  syncWorldClockTurnBoundary({
    campaignId: args.campaignId,
    currentTick: newTick,
  });

  heartbeat();
  applyPostNarrationStartConditionEffects({
    db,
    campaignId: args.campaignId,
    playerId: args.playerId,
    lookupPlayerByCampaign: args.lookupPlayerByCampaign ?? false,
    newTick,
    playerAction: args.playerAction,
  });

  const summary: TurnSummary = {
    turnId: args.turnId,
    sagaId: args.sagaId,
    narratorAttemptId: args.narratorAttemptId,
    idempotencyKey: buildPostTurnIdempotencyKey({
      campaignId: args.campaignId,
      turnId: args.turnId,
      sagaId: args.sagaId,
      narratorAttemptId: args.narratorAttemptId,
      tick: newTick,
    }),
    tick: newTick,
    oracleResult: args.oracleResult,
    toolCalls: args.toolCallResults,
    narrativeText: args.narrativeText,
    sceneAssembly: args.sceneAssembly,
  };

  if (args.onPostTurn) {
    heartbeat();
    yield {
      type: "finalizing_turn",
      data: { tick: newTick, stage: "rollback_critical" },
    };

    await Promise.resolve(args.onPostTurn(summary));
    heartbeat();
  }

  heartbeat();
  yield {
    type: "scene-settling",
    data: { stage: "scene-settling", phase: "cleaning-transient-scene", tick: newTick },
  };
  const cleanupStart = Date.now();
  cleanupTransientSceneObjects(args.campaignId, newTick);
  args.recordTransientCleanupStage?.(cleanupStart, newTick);

  heartbeat();
  commitStagedWorldForecast(args.campaignId, args.stagedForecast ?? null);
  heartbeat();
  args.finishLatencyTrace?.();

  return { tick: newTick, summary };
}

async function renderSettledNarrationWithSaga(args: {
  saga: TurnSagaRecord;
  settledPacket: SettledTurnPacketRecord;
  campaignId: string;
  contextWindow: number;
  sceneAssembly: SceneAssembly;
  narratorPacket: NarratorPacket;
  outcomeBounds?: ReturnType<typeof buildNarrativeOutcomeBounds> | null;
  oracleResult?: OracleResult | null;
  embedderResult?: ResolveResult;
  playerAction: string;
  storytellerProvider: ProviderConfig;
  storytellerTemperature: number;
  storytellerMaxTokens: number;
  judgeProvider?: ProviderConfig;
  lockToken?: string;
  recordPromptAssemblyStage?: (startedAt: number, endedAt: number) => void;
  recordNarratorRepairStage?: (
    startedAt: number,
    endedAt: number,
    metadata: Record<string, unknown>,
  ) => void;
}) {
  let saga = args.saga;
  if (saga.status === "resolved_pending_narration") {
    saga = transitionTurnSagaStatus({
      sagaId: saga.id,
      toStatus: "narrator_rendering",
      reason: "Rendering final narration from settled packet.",
      lockToken: args.lockToken,
    });
  }

  const promptAssemblyStart = Date.now();
  const finalNarrationPrompt = await assembleFinalNarrationPrompt({
    campaignId: args.campaignId,
    contextWindow: args.contextWindow,
    sceneAssembly: args.sceneAssembly,
    narratorPacket: args.narratorPacket,
    outcomeBounds: args.outcomeBounds ?? undefined,
    actionResult: args.oracleResult ?? undefined,
    embedderResult: args.embedderResult,
    playerAction: args.playerAction,
    judgeRole: args.judgeProvider
      ? { provider: args.judgeProvider, temperature: 0.1, maxTokens: 1024 }
      : undefined,
  });
  const promptAssemblyEnded = Date.now();
  args.recordPromptAssemblyStage?.(promptAssemblyStart, promptAssemblyEnded);

  let lastReasoningText: string | undefined;
  let lastVisibleFailures: VisibleNarrationFailure[] = [];
  let lastVisibleUsage: VisibleNarrationUsage | undefined;
  let lastVisibleFinishReason: VisibleNarrationFinishReason | undefined;
  let lastVisibleResponse: VisibleNarrationResponse | undefined;
  let lastVisibleTextLength: number | undefined;
  let lastStructuredTrace: NarrationDraftStructuredTrace | null = null;

  async function runFinalPacketGuardedNarration(recoveryAddendum: string | null) {
    return runVisibleNarrationWithPacketGuard({
      packet: args.narratorPacket,
      generateNarration: async ({ guardAddendum }) => {
        const addenda = [
          recoveryAddendum
            ? `[PACKET VISIBILITY RECOVERY]\n${recoveryAddendum}`
            : null,
          guardAddendum
            ? `[PACKET VISIBILITY CORRECTION]\n${guardAddendum}`
            : null,
        ].filter((entry): entry is string => Boolean(entry));
        const activePrompt = addenda.length > 0
          ? `${finalNarrationPrompt.prompt}\n\n${addenda.join("\n\n")}`
          : finalNarrationPrompt.prompt;
        const result = await withRole("storyteller", () =>
          runVisibleNarrationDraftWithGuard({
            label: "final",
            provider: args.storytellerProvider,
            narratorPacket: args.narratorPacket,
            system: finalNarrationPrompt.system,
            prompt: activePrompt,
            storytellerTemperature: args.storytellerTemperature,
            storytellerMaxTokens: args.storytellerMaxTokens,
          }),
        );
        lastReasoningText = result.reasoningText;
        lastVisibleFailures = result.failures;
        lastVisibleUsage = result.usage;
        lastVisibleFinishReason = result.finishReason;
        lastVisibleResponse = result.response;
        lastVisibleTextLength = result.text.length;
        lastStructuredTrace = result.structuredTrace;
        return result.draft;
      },
      onUnsafeAttempt: ({ attempt, validation }) => {
        log.event("visible-narration.packet-guard", {
          stage: recoveryAddendum ? "recovery-unsafe-attempt" : "unsafe-attempt",
          attempt,
          violationCount: validation.violations.length,
          diagnostics: visibleNarrationValidationDiagnostics({
            validation,
            packet: args.narratorPacket,
          }),
          finishReason: lastVisibleFinishReason,
          responseModel: lastVisibleResponse?.modelId,
          textLength: lastVisibleTextLength,
          structuredTrace: lastStructuredTrace,
        });
      },
    });
  }

  let guardedNarration: Awaited<ReturnType<typeof runVisibleNarrationWithPacketGuard>>;
  let recovered = false;
  const narrationStartedAt = Date.now();
  let narrationEndedAt = narrationStartedAt;
  let activeNarratorAttempt = recordNarratorAttempt({
    sagaId: saga.id,
    settledTurnPacketId: args.settledPacket.id,
    status: "started",
    groundingResult: {
      stage: "packet_guard",
      recovered: false,
      narrationContractVersion: GROUNDED_SENTENCE_DRAFT_CONTRACT_VERSION,
      startedAt: narrationStartedAt,
    },
    lockToken: args.lockToken,
  });
  try {
    guardedNarration = await runFinalPacketGuardedNarration(null);
    narrationEndedAt = Date.now();
  } catch (error) {
    narrationEndedAt = Date.now();
    const failureReason = errorMessage(error);
    const failureGroundingResult = failedNarratorGroundingResult({
      error,
      recovered: false,
      packet: args.narratorPacket,
    });
    updateNarratorAttemptOutcome({
      id: activeNarratorAttempt.id,
      status: "failed",
      groundingResult: failureGroundingResult,
      failureReason,
      lockToken: args.lockToken,
    });
    const stage = error instanceof VisibleNarrationPacketGuardError
      ? "packet-guard-failed"
      : isVisibleNarrationTransportError(error)
        ? "transport-exhausted"
        : isVisibleNarrationStructuredChannelError(error)
          ? "structured-channel-exhausted"
        : "draft-contract-failed";
    log.warn(
      "Final visible narration failed; preserving settled packet without recovery regeneration",
      error,
    );
    log.event("visible-narration.packet-guard", {
      stage,
      reason: failureReason,
      diagnostics: failureGroundingResult,
    });
    throw new NarrationRepairExhaustedError(
      stage === "transport-exhausted"
        ? "Visible narration transport failed before packet validation; settled packet is pending narration."
        : stage === "structured-channel-exhausted"
          ? "Visible narration structured output channel failed before packet validation; settled packet is pending narration."
        : stage === "packet-guard-failed"
          ? "Visible narration violated packet visibility or grounding constraints; settled packet is pending narration."
          : "Visible narration structured contract failed before packet validation; settled packet is pending narration.",
      error,
    );
  }

  const narrativeText = guardedNarration.text;
  try {
    if (!guardedNarration.draft) {
      throw new Error("Final narration guard returned success without a NarrationDraft.");
    }
    assertNonEmptyFinalVisibleNarration(narrativeText);
  } catch (error) {
    updateNarratorAttemptOutcome({
      id: activeNarratorAttempt.id,
      status: "failed",
      groundingResult: failedNarratorGroundingResult({
        error,
        recovered,
        packet: args.narratorPacket,
      }),
      failureReason: errorMessage(error),
      lockToken: args.lockToken,
    });
    throw error;
  }
  const successAttempt = updateNarratorAttemptOutcome({
    id: activeNarratorAttempt.id,
    status: "succeeded",
    groundingResult: {
      ...guardedNarration.validation,
      narrationDraftAccepted: true,
      narrationContractVersion: GROUNDED_SENTENCE_DRAFT_CONTRACT_VERSION,
      structuredTrace: lastStructuredTrace,
      attempts: guardedNarration.attempts,
      retried: guardedNarration.retried,
      guardAddendum: guardedNarration.guardAddendum,
      visibleFailures: lastVisibleFailures,
    },
    finalText: narrativeText,
    lockToken: args.lockToken,
  });

  return {
    finalNarrationPrompt,
    guardedNarration,
    narrativeText,
    reasoningText: lastReasoningText,
    lastVisibleFailures,
    lastVisibleUsage,
    lastVisibleFinishReason,
    lastVisibleResponse,
    narratorAttemptId: successAttempt.id,
    narrationStartedAt,
    narrationEndedAt,
    finalizationReason: recovered
      ? "Final narration recovered from settled packet."
      : "Final narration completed from settled packet.",
  };
}

function logDueWorldWork(
  result: ResolveDueWorldWorkForScopeResult,
  durationMs: number,
): void {
  log.event("living-world.due-work", {
    phase: result.phase,
    executedCount: result.executed.length,
    completedCount: result.executed.filter((item) => item.status === "completed").length,
    failedCount: result.executed.filter((item) => item.status === "failed").length,
    staleRejectedCount: result.executed.filter((item) => item.status === "stale_rejected").length,
    deferredCount: result.deferred.length,
    skippedCount: result.skipped.length,
    worldThreadExecutedCount: result.worldThreads.executed.length,
    worldThreadDeferredCount: result.worldThreads.deferred.length,
    worldThreadSkippedCount: result.worldThreads.skipped.length,
    proposalPrepGroupCount: result.proposalPrepTrace.length,
    proposalPrepSerializedFallbackCount: result.proposalPrepTrace
      .reduce((total, group) => total + group.serializedFallbackCount, 0),
    durationMs,
  });
}

function hasVisibleDueWorldWork(result: ResolveDueWorldWorkForScopeResult): boolean {
  return result.executed.some((item) => item.status !== "waiting")
    || result.deferred.length > 0
    || result.worldThreads.executed.length > 0
    || result.worldThreads.deferred.length > 0;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function isNarrationDraftAcceptedAttempt(attempt: {
  groundingResult: unknown;
}): boolean {
  const grounding = asRecord(attempt.groundingResult);
  const trace = asRecord(grounding?.structuredTrace);
  const strategy = trace?.strategy;
  return grounding?.narrationDraftAccepted === true
    && grounding?.narrationContractVersion === GROUNDED_SENTENCE_DRAFT_CONTRACT_VERSION
    && grounding?.attempts === 1
    && grounding?.retried === false
    && grounding?.guardAddendum == null
    && (strategy === "native_json" || strategy === "tool_mode")
    && trace?.fallbackReason == null
    && trace?.repairedFromStrategy == null
    && trace?.repair == null;
}

function getResumeCheckpoint(
  saga: TurnSagaRecord,
  key: "assistantAppend" | "postNarrationTail",
  narratorAttemptId: string,
): Record<string, unknown> | null {
  const root = asRecord(saga.provenance[PENDING_NARRATION_RESUME_CHECKPOINT_KEY]);
  const checkpoint = asRecord(root?.[key]);
  return checkpoint?.narratorAttemptId === narratorAttemptId ? checkpoint : null;
}

function mergeResumeCheckpoint(input: {
  sagaId: string;
  key: "assistantAppend" | "postNarrationTail";
  narratorAttemptId: string;
  fields?: Record<string, unknown>;
  lockToken?: string;
}): TurnSagaRecord {
  return mergeTurnSagaProvenance({
    sagaId: input.sagaId,
    lockToken: input.lockToken,
    patch: {
      [PENDING_NARRATION_RESUME_CHECKPOINT_KEY]: {
        [input.key]: {
          narratorAttemptId: input.narratorAttemptId,
          completedAt: Date.now(),
          ...input.fields,
        },
      },
    },
  });
}

function startPendingNarrationWorkerHeartbeat(input: {
  sagaId: string;
  lockToken: string;
}): {
  stop: () => void;
  heartbeat: () => void;
  assertActive: () => void;
} {
  let lostLockError: unknown = null;
  const heartbeat = () => {
    if (lostLockError) {
      throw lostLockError;
    }
    try {
      heartbeatTurnSagaWorker(input);
    } catch (error) {
      lostLockError = error;
      throw error;
    }
  };
  // Heartbeat is abandoned-worker recovery, not a model/turn timeout: long live
  // storyteller calls keep refreshing the lock, but a crashed worker stops here.
  heartbeat();
  const timer = setInterval(() => {
    try {
      heartbeat();
    } catch (error) {
      log.warn(
        "Pending narration worker heartbeat lost saga lock; aborting fenced worker",
        error,
      );
    }
  }, PENDING_NARRATION_WORKER_HEARTBEAT_MS);
  if (typeof timer === "object" && "unref" in timer) {
    timer.unref();
  }
  return {
    stop: () => clearInterval(timer),
    heartbeat,
    assertActive: () => {
      if (lostLockError) {
        throw lostLockError;
      }
    },
  };
}

function chatMessageMatchesResumeNarrationKey(
  message: ChatMessage,
  sagaId: string,
  narratorAttemptId: string,
): boolean {
  return message.role === "assistant"
    && message.metadata?.resumeNarration?.sagaId === sagaId
    && message.metadata.resumeNarration.narratorAttemptId === narratorAttemptId;
}

function chatHistoryHasAssistantNarrationAppendKey(input: {
  campaignId: string;
  sagaId: string;
  narratorAttemptId: string;
}): boolean {
  return getChatHistory(input.campaignId).some((message) =>
    chatMessageMatchesResumeNarrationKey(
      message,
      input.sagaId,
      input.narratorAttemptId,
    ),
  );
}

function isPendingNarrationStatus(status: TurnSagaStatus): boolean {
  return PENDING_NARRATION_STATUSES.includes(
    status as typeof PENDING_NARRATION_STATUSES[number],
  );
}

function buildPendingSettledTurnEvent(saga: TurnSagaRecord): TurnEvent {
  return {
    type: "error",
    data: {
      error:
        "Turn resolution is already claimed but no settled narration packet is durable yet.",
      pendingNarration: true,
      pendingSettledTurnPacket: true,
      resumable: false,
      sagaId: saga.id,
      turnId: saga.turnId,
      status: saga.status,
    },
  };
}

function buildPostTurnIdempotencyKey(input: {
  campaignId: string;
  turnId?: string;
  sagaId?: string;
  narratorAttemptId?: string;
  tick: number;
}): string | undefined {
  if (!input.turnId || !input.sagaId || !input.narratorAttemptId) {
    return undefined;
  }

  return [
    "post-turn",
    input.campaignId,
    input.turnId,
    input.sagaId,
    input.narratorAttemptId,
    input.tick,
  ].join(":");
}

function appendAssistantNarrationForResume(input: {
  campaignId: string;
  saga: TurnSagaRecord;
  narratorAttemptId: string;
  narrativeText: string;
  lockToken?: string;
}): TurnSagaRecord {
  if (getResumeCheckpoint(input.saga, "assistantAppend", input.narratorAttemptId)) {
    return input.saga;
  }

  if (input.lockToken) {
    heartbeatTurnSagaWorker({ sagaId: input.saga.id, lockToken: input.lockToken });
  }

  const deduped = chatHistoryHasAssistantNarrationAppendKey({
    campaignId: input.campaignId,
    sagaId: input.saga.id,
    narratorAttemptId: input.narratorAttemptId,
  });
  if (!deduped) {
    appendChatMessages(input.campaignId, [
      {
        role: "assistant",
        content: input.narrativeText,
        metadata: {
          resumeNarration: {
            sagaId: input.saga.id,
            narratorAttemptId: input.narratorAttemptId,
          },
        },
      },
    ]);
  }

  return mergeResumeCheckpoint({
    sagaId: input.saga.id,
    key: "assistantAppend",
    narratorAttemptId: input.narratorAttemptId,
    lockToken: input.lockToken,
    fields: {
      deduped,
      finalTextTail: input.narrativeText.slice(-240),
    },
  });
}

export async function* processTurn(
  options: TurnOptions
): AsyncGenerator<TurnEvent> {
  const events = isScenePlanEnabled()
    ? processTurnScenePlan(options)
    : processTurnLegacy(options);

  for await (const event of events) {
    yield withSafeTurnProgressPayload(event);
  }
}

export async function* resumePendingTurnNarration(
  options: ResumePendingNarrationOptions,
): AsyncGenerator<TurnEvent> {
  const {
    campaignId,
    turnId,
    storytellerProvider,
    storytellerTemperature,
    storytellerMaxTokens,
    embedderResult,
    contextWindow = 8192,
    onPostTurn,
  } = options;
  const saga = getTurnSaga({ campaignId, turnId });
  if (!saga) {
    throw new Error(`Pending turn saga not found for campaign ${campaignId}, turn ${turnId}.`);
  }
  if (
    !isPendingNarrationStatus(saga.status)
    && saga.status !== "world_consequence_running"
  ) {
    throw new Error(
      `Turn ${turnId} is not pending narration; current status is ${saga.status}.`,
    );
  }

  const settledPacketBeforeClaim = saga.status === "world_consequence_running"
    ? getSettledTurnPacket({ campaignId, turnId })
    : null;
  if (saga.status === "world_consequence_running" && !settledPacketBeforeClaim) {
    yield buildPendingSettledTurnEvent(saga);
    return;
  }

  const claim = claimTurnSagaWorker({
    campaignId,
    turnId,
    workerId: `resume-pending-narration:${randomUUID()}`,
    allowStaleReclaim: true,
    staleAfterMs: PENDING_NARRATION_WORKER_STALE_AFTER_MS,
  });

  let workerHeartbeat: ReturnType<typeof startPendingNarrationWorkerHeartbeat> | null = null;
  try {
    workerHeartbeat = startPendingNarrationWorkerHeartbeat({
      sagaId: claim.saga.id,
      lockToken: claim.lockToken,
    });
    const lockedSaga = claim.saga;
    if (
      !isPendingNarrationStatus(lockedSaga.status)
      && lockedSaga.status !== "world_consequence_running"
    ) {
      throw new Error(
        `Turn ${turnId} is not pending narration; current status is ${lockedSaga.status}.`,
      );
    }
    const settledPacket = settledPacketBeforeClaim ?? getSettledTurnPacket({ campaignId, turnId });
    if (!settledPacket) {
      throw new Error(`SettledTurnPacket not found for pending turn ${turnId}.`);
    }
    const narratorPacket = requireNarratorPacket(settledPacket.narratorPacket);
    const sceneAssembly = minimalSceneAssemblyFromNarratorPacket(narratorPacket);
    let resumeSaga = lockedSaga.status === "world_consequence_running"
      ? transitionTurnSagaStatus({
          sagaId: lockedSaga.id,
          toStatus: "resolved_pending_narration",
          reason: "Recovered settled packet after stale world consequence boundary.",
          lockToken: claim.lockToken,
        })
      : lockedSaga;

    yield {
      type: "scene-settling",
      data: {
        stage: "scene-settling",
        phase: "final-narration",
        resumed: true,
      },
    };

    const latestSuccessfulAttempt = findLatestSuccessfulNarratorAttempt({
      sagaId: lockedSaga.id,
      settledTurnPacketId: settledPacket.id,
      campaignId,
    });
    const successfulAttempt =
      latestSuccessfulAttempt && isNarrationDraftAcceptedAttempt(latestSuccessfulAttempt)
        ? latestSuccessfulAttempt
        : null;
    const narration = successfulAttempt
      ? {
          narrativeText: successfulAttempt.finalText ?? "",
          reasoningText: undefined,
          narratorAttemptId: successfulAttempt.id,
          finalizationReason: "Final narration resumed from successful narrator attempt.",
        }
      : await renderSettledNarrationWithSaga({
          saga: resumeSaga,
          settledPacket,
          campaignId,
          contextWindow,
          sceneAssembly,
          narratorPacket,
          embedderResult,
          playerAction: narratorPacket.playerAction,
          storytellerProvider,
          storytellerTemperature,
          storytellerMaxTokens,
          lockToken: claim.lockToken,
        });

    if (successfulAttempt && resumeSaga.status === "resolved_pending_narration") {
      resumeSaga = transitionTurnSagaStatus({
        sagaId: resumeSaga.id,
        toStatus: "narrator_rendering",
        reason: "Reusing completed narrator attempt for finalization.",
        lockToken: claim.lockToken,
      });
    } else {
      resumeSaga = getTurnSaga({ sagaId: resumeSaga.id }) ?? resumeSaga;
    }

    resumeSaga = appendAssistantNarrationForResume({
      campaignId,
      saga: resumeSaga,
      narratorAttemptId: narration.narratorAttemptId,
      narrativeText: narration.narrativeText,
      lockToken: claim.lockToken,
    });
    yield { type: "narrative", data: { text: narration.narrativeText } };

    if (shouldExposeReasoningSse() && narration.reasoningText) {
      yield { type: "reasoning", data: { text: narration.reasoningText } };
    }

    let tick: number;
    const tailCheckpoint = getResumeCheckpoint(
      resumeSaga,
      "postNarrationTail",
      narration.narratorAttemptId,
    );
    if (tailCheckpoint) {
      tick = typeof tailCheckpoint.tick === "number"
        ? tailCheckpoint.tick
        : readCampaignConfig(campaignId).currentTick ?? narratorPacket.tick;
      syncWorldClockTurnBoundary({
        campaignId,
        currentTick: tick,
      });
    } else {
      workerHeartbeat.heartbeat();
      const tailResult = yield* runPostNarrationFinalizationTail({
        campaignId,
        turnId,
        sagaId: resumeSaga.id,
        lockToken: claim.lockToken,
        narratorAttemptId: narration.narratorAttemptId,
        currentTick: narratorPacket.tick,
        lookupPlayerByCampaign: true,
        playerAction: narratorPacket.playerAction,
        successfulTravel: getSuccessfulTravelFromCanonicalPacket(narratorPacket.canonicalTurnPacket),
        oracleResult: null,
        toolCallResults: getToolCallResultsFromCanonicalPacket(narratorPacket.canonicalTurnPacket),
        narrativeText: narration.narrativeText,
        sceneAssembly,
        onPostTurn,
        idempotentResume: true,
      });
      tick = tailResult.tick;
      resumeSaga = mergeResumeCheckpoint({
        sagaId: resumeSaga.id,
        key: "postNarrationTail",
        narratorAttemptId: narration.narratorAttemptId,
        lockToken: claim.lockToken,
        fields: { tick },
      });
    }

    workerHeartbeat.heartbeat();
    markTurnSagaFinalizedIfNeeded({
      sagaId: lockedSaga.id,
      narratorAttemptId: narration.narratorAttemptId,
      reason: narration.finalizationReason,
      lockToken: claim.lockToken,
    });
    yield { type: "done", data: { tick, resumed: true } };
  } finally {
    workerHeartbeat?.stop();
    try {
      releaseTurnSagaWorker({
        sagaId: claim.saga.id,
        lockToken: claim.lockToken,
      });
    } catch (error) {
      log.warn("Pending narration worker could not release saga lock", error);
    }
  }
}

async function* processTurnScenePlan(
  options: TurnOptions
): AsyncGenerator<TurnEvent> {
  const {
    campaignId,
    playerAction,
    intent,
    method,
    judgeProvider,
    storytellerProvider,
    storytellerTemperature,
    storytellerMaxTokens,
    embedderResult,
    contextWindow = 8192,
    onPostTurn,
  } = options;

  // 1. Query deterministic state before any LLM interpretation. Movement and
  // target interpretation are ScenePlan-owned on this path: detectMovement not
  // before buildSceneFrame; after SceneFrame from frame-owned candidates only.
  // The target-context classifier path (detectCandidateByClassifier source classifier)
  // is bypassed here; actual move_to mutation can only occur through validated
  // ScenePlan execution.
  const db = getDb();
  const config = readCampaignConfig(campaignId);
  const currentTick = config.currentTick ?? 0;
  const baseWorldClock = readWorldClock(campaignId);
  assertNoPendingNarrationBeforeNewTurn({ campaignId });
  const turnId = randomUUID();
  const latencyTrace = createTurnLatencyTrace({
    turnId,
    campaignId,
    tick: currentTick,
    turnClass: "normal",
  });
  let turnSaga = createTurnSaga({
    campaignId,
    turnId,
    actionText: playerAction,
    sourceAction: { playerAction, intent, method },
    baseWorldVersion: baseWorldClock.worldVersion,
    requiresNarration: false,
    provenance: { processor: "scene-plan", phase: "89-03" },
  });
  const advanceSaga = (
    toStatus: TurnSagaStatus,
    reason: string,
    resultWorldVersion?: number | null,
  ) => {
    turnSaga = transitionTurnSagaStatus({
      sagaId: turnSaga.id,
      toStatus,
      reason,
      resultWorldVersion,
    });
    return turnSaga;
  };
  advanceSaga("collecting_context", "Collecting deterministic turn context.");
  const baseLatencyStageDefinitions: readonly TurnLatencyRequiredStage[] = [
    { stage: "pre_scene_frame_due_work", criticality: "L2", blocksPlayerResponse: true, criticalPath: true },
    { stage: "scene_frame", criticality: "L0", blocksPlayerResponse: true, criticalPath: true },
    { stage: "world_forecast", criticality: "L2", blocksPlayerResponse: true, criticalPath: true },
    { stage: "gm_read", criticality: "L0", blocksPlayerResponse: true, criticalPath: true },
  ];
  const fullTurnLatencyStageDefinitions: readonly TurnLatencyRequiredStage[] = [
    ...baseLatencyStageDefinitions,
    { stage: "actor_reactions", criticality: "L1", blocksPlayerResponse: true, criticalPath: true },
    { stage: "pre_narrator_due_work", criticality: "L2", blocksPlayerResponse: true, criticalPath: true },
    { stage: "narrator_packet", criticality: "L0", blocksPlayerResponse: true, criticalPath: true },
    { stage: "final_prompt", criticality: "L0", blocksPlayerResponse: true, criticalPath: true },
    { stage: "final_narration", criticality: "L0", blocksPlayerResponse: true, criticalPath: true },
  ];
  const finishLatencyTrace = (
    requiredStageDefinitions: readonly TurnLatencyRequiredStage[] = fullTurnLatencyStageDefinitions,
  ) => {
    finalizeTurnLatencyTrace(latencyTrace, {
      diagnosticOptions: {
        requiredStageDefinitions,
      },
    });
    log.event("turn.latency.trace", latencyTrace);
  };
  const player = db
    .select()
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();
  const initialSceneScopeId = ensurePlayerSceneScopeAlignment(db, player ?? undefined);

  let actorTags: string[] = [];
  let environmentTags: string[] = [];
  let sceneContext = "";
  let runtimePlayerRecord: ReturnType<typeof hydrateStoredPlayerRecord> | null = null;
  let oracleLocationId: string | null = player?.currentLocationId ?? null;
  let currentSceneScopeId: string | null = initialSceneScopeId;
  let successfulTravel: SuccessfulTravel | null = null;

  if (player) {
    const openingState = applyStartConditionEffects(
      hydrateStoredPlayerRecord(player),
      {
        currentTick,
        currentLocationId: player.currentLocationId,
      },
    );
    runtimePlayerRecord = openingState.record;
    actorTags = deriveRuntimeCharacterTags(runtimePlayerRecord);
    oracleLocationId = runtimePlayerRecord.socialContext.currentLocationId;

    if (openingState.changed) {
      persistPlayerRuntimeRecord(db, player.id, campaignId, runtimePlayerRecord);
    }

    if (runtimePlayerRecord.state.hp < 5) {
      sceneContext += ` Actor HP: ${runtimePlayerRecord.state.hp}/5.`;
    }

    if (oracleLocationId) {
      const location = db
        .select()
        .from(locations)
        .where(eq(locations.id, oracleLocationId))
        .get();

      if (location) {
        try {
          environmentTags = JSON.parse(location.tags) as string[];
        } catch {
          environmentTags = [];
        }
        sceneContext = `${location.name}: ${location.description}`;
      }
    }

    for (const line of openingState.effects.sceneContextLines) {
      sceneContext += `${sceneContext ? "\n" : ""}${line}`;
    }
  }

  advanceSaga("pre_turn_catchup", "Resolving pre-turn catch-up work.");
  const preFrameDueWorkStart = Date.now();
  const preFrameDueWork = resolveDueWorldWorkForScope({
    campaignId,
    tick: currentTick,
    playerLocationId: oracleLocationId,
    playerSceneScopeId: currentSceneScopeId,
    elapsedWorldTimeMinutes: 1,
    phase: "pre_scene_frame",
  });
  const preFrameDueWorkEnded = Date.now();
  recordTurnLatencyStage(latencyTrace, {
    stage: "pre_scene_frame_due_work",
    startedAt: preFrameDueWorkStart,
    endedAt: preFrameDueWorkEnded,
    metadata: {
      executed: preFrameDueWork.executed.length,
      deferred: preFrameDueWork.deferred.length,
      worldThreads: preFrameDueWork.worldThreads.executed.length,
      proposalPrepGroupCount: preFrameDueWork.proposalPrepTrace.length,
      proposalPrepSerializedFallbackCount: preFrameDueWork.proposalPrepTrace
        .reduce((total, group) => total + group.serializedFallbackCount, 0),
    },
  });
  addTurnLatencyProposalEffects(latencyTrace, {
    deferred: preFrameDueWork.deferred.length + preFrameDueWork.worldThreads.deferred.length,
  });
  logDueWorldWork(preFrameDueWork, preFrameDueWorkEnded - preFrameDueWorkStart);
  if (hasVisibleDueWorldWork(preFrameDueWork)) {
    yield {
      type: "scene-settling",
      data: {
        stage: "scene-settling",
        phase: "offscreen-catch-up",
        executed: preFrameDueWork.executed.length,
        deferred: preFrameDueWork.deferred.length,
        worldThreads: preFrameDueWork.worldThreads.executed.length,
      },
    };
  }

  const frameStart = Date.now();
  const sceneFrame = await buildSceneFrame({
    campaignId,
    tick: currentTick,
    playerActorId: player?.id,
    currentLocationId: oracleLocationId,
    currentSceneScopeId,
    playerAction,
    intent,
    method,
    elapsedWorldTimeMinutes: 1,
  });
  const frameEnded = Date.now();
  recordTurnLatencyStage(latencyTrace, {
    stage: "scene_frame",
    startedAt: frameStart,
    endedAt: frameEnded,
    metadata: {
      actorCount:
        sceneFrame.roster.active.length
        + sceneFrame.roster.support.length
        + sceneFrame.roster.background.length,
      movementCandidateCount: sceneFrame.movementCandidates.length,
      targetCandidateCount: sceneFrame.targetCandidates.length,
    },
  });
  logScenePlanFrame(sceneFrame, frameEnded - frameStart);
  const forecastStart = Date.now();
  const forecastResult = await buildScopedForecastExcerptForFrame(sceneFrame);
  const forecastEnded = Date.now();
  const { excerpt: scopedForecastExcerpt, stagedForecast, refreshDue } = forecastResult;
  recordTurnLatencyStage(latencyTrace, {
    stage: "world_forecast",
    startedAt: forecastStart,
    endedAt: forecastEnded,
    metadata: {
      refreshed: stagedForecast !== null,
      refreshDue,
      entryCount: scopedForecastExcerpt.entries.length,
    },
  });
  if (stagedForecast) {
    recordSerializedLlmGroup(latencyTrace, {
      kind: "world_forecast",
      label: "world forecast refresh",
      startedAt: forecastStart,
      endedAt: forecastEnded,
      metadata: {
        entryCount: stagedForecast.forecast.entries.length,
      },
    });
    addTurnLatencyProposalEffects(latencyTrace, { cacheMisses: 1 });
  } else {
    addTurnLatencyProposalEffects(latencyTrace, { cacheHits: 1 });
  }
  log.event("world-forecast.scoped", {
    entryCount: scopedForecastExcerpt.entries.length,
    forbiddenPrivateTermCount: scopedForecastExcerpt.forbiddenPrivateTerms.length,
    baseTick: scopedForecastExcerpt.baseTick,
    refreshStaged: stagedForecast !== null,
    refreshDue,
  });

  advanceSaga("gm_reading", "Running GM Read.");
  yield {
    type: "scene-settling",
    data: {
      stage: "scene-settling",
      phase: "gm-read",
    },
  };

  const gmReadStart = Date.now();
  let gmRead = await runGmRead({
    provider: judgeProvider,
    playerAction,
    frame: sceneFrame,
    scopedForecastExcerpt,
    recentConversation: getChatHistory(campaignId).slice(-8),
  });
  const originalGmReadPath = gmRead.path;
  let clarificationReviewMetadata: {
    reviewed: boolean;
    repaired: boolean;
    reason: string | null;
    parserLikePattern: string | null;
    bridgeCandidateCount: number;
  } = {
    reviewed: false,
    repaired: false,
    reason: null,
    parserLikePattern: null,
    bridgeCandidateCount: 0,
  };

  if (gmRead.path === "clarification") {
    const clarificationReview = await reviewGmReadClarification({
      provider: judgeProvider,
      playerAction,
      frame: sceneFrame,
      gmRead,
      scopedForecastExcerpt,
      recentConversation: getChatHistory(campaignId).slice(-8),
    });
    clarificationReviewMetadata = {
      reviewed: true,
      repaired: clarificationReview.repaired,
      reason: clarificationReview.reason,
      parserLikePattern: clarificationReview.parserLikePattern,
      bridgeCandidateCount: clarificationReview.bridgeCandidateCount,
    };
    if (clarificationReview.repaired) {
      gmRead = clarificationReview.gmRead;
    }
    log.event("judge.gm-read.clarification-review.selected", {
      reviewed: clarificationReviewMetadata.reviewed,
      repaired: clarificationReviewMetadata.repaired,
      reason: clarificationReviewMetadata.reason,
      parserLikePattern: clarificationReviewMetadata.parserLikePattern,
      bridgeCandidateCount: clarificationReviewMetadata.bridgeCandidateCount,
      originalPath: originalGmReadPath,
      selectedPath: gmRead.path,
    });
  }
  const gmReadEnded = Date.now();
  recordTurnLatencyStage(latencyTrace, {
    stage: "gm_read",
    startedAt: gmReadStart,
    endedAt: gmReadEnded,
    metadata: {
      path: gmRead.path,
      originalPath: originalGmReadPath,
      evidenceRefCount: gmRead.evidenceRefs.length,
      clarificationReviewed: clarificationReviewMetadata.reviewed,
      clarificationRepaired: clarificationReviewMetadata.repaired,
      clarificationReviewReason: clarificationReviewMetadata.reason,
      clarificationParserLikePattern: clarificationReviewMetadata.parserLikePattern,
      clarificationBridgeCandidateCount: clarificationReviewMetadata.bridgeCandidateCount,
    },
  });
  recordSerializedLlmGroup(latencyTrace, {
    kind: "gm_read",
    label: "GM Read",
    startedAt: gmReadStart,
    endedAt: gmReadEnded,
    metadata: {
      path: gmRead.path,
      originalPath: originalGmReadPath,
      evidenceRefCount: gmRead.evidenceRefs.length,
      clarificationReviewed: clarificationReviewMetadata.reviewed,
      clarificationRepaired: clarificationReviewMetadata.repaired,
      clarificationReviewReason: clarificationReviewMetadata.reason,
      clarificationParserLikePattern: clarificationReviewMetadata.parserLikePattern,
      clarificationBridgeCandidateCount: clarificationReviewMetadata.bridgeCandidateCount,
    },
  });
  log.event("judge.gm-read.selected", {
    path: gmRead.path,
    originalPath: originalGmReadPath,
    evidenceRefCount: Array.isArray(gmRead.evidenceRefs) ? gmRead.evidenceRefs.length : 0,
    clarificationReviewed: clarificationReviewMetadata.reviewed,
    clarificationRepaired: clarificationReviewMetadata.repaired,
  });

  const targetContext =
    gmRead.path === "roll_oracle"
      ? buildOracleContextFromRollRequest(sceneFrame, gmRead)
      : gmRead.path === "combat_transition"
        ? buildOracleContextFromCombatTransition(sceneFrame, gmRead)
        : null;

  if (targetContext) {
    log.event("target.context", {
      targetTags: targetContext.targetTags,
      targetLabel: targetContext.targetLabel,
      targetType: targetContext.targetType,
      hasCombatSnapshot: false,
      source: "gm_read",
      fallbackReason: targetContext.fallbackReason,
    });
  }

  const combatEnvelope =
    gmRead.path === "combat_transition" && player && targetContext?.actorId
      ? buildSceneFrameCombatEnvelopeForConcreteTarget({
          player,
          npcRows: db
            .select()
            .from(npcs)
            .where(eq(npcs.campaignId, campaignId))
            .all(),
          targetActorId: targetContext.actorId,
          hostileAction: true,
          actionText: gmRead.combatFraming,
        })
      : null;
  let oracleResult: OracleResult | null = null;
  let oracleDecisionId: string | null = null;
  if (gmRead.path === "roll_oracle") {
    advanceSaga("oracle_adjudicating", "Oracle adjudication requested by GM Read.");
    const oracleStart = Date.now();
    oracleResult = await callOracle(
      {
        intent: gmRead.rollRequest.question,
        method: gmRead.rollRequest.stakes,
        actorTags,
        targetTags: targetContext?.targetTags ?? [],
        environmentTags,
        sceneContext,
        ...(combatEnvelope ? { combatEnvelope } : {}),
      },
      judgeProvider,
    );
    const oracleEnded = Date.now();
    recordTurnLatencyStage(latencyTrace, {
      stage: "oracle",
      startedAt: oracleStart,
      endedAt: oracleEnded,
      metadata: {
        outcome: oracleResult.outcome,
        chance: oracleResult.chance,
      },
    });
    recordSerializedLlmGroup(latencyTrace, {
      kind: "oracle",
      label: "Oracle",
      startedAt: oracleStart,
      endedAt: oracleEnded,
      metadata: {
        outcome: oracleResult.outcome,
        chance: oracleResult.chance,
      },
    });
    const acceptedWorldVersion = readWorldClock(campaignId).worldVersion;
    const oracleDecision = persistOracleDecision(
      oracleDecisionInputFromGmRead({
        sagaId: turnSaga.id,
        gmRead,
        oracleResult,
        targetContext,
        combatEnvelope,
        baseWorldVersion: baseWorldClock.worldVersion,
        acceptedWorldVersion,
      }),
    );
    oracleDecisionId = oracleDecision.id;
  } else {
    advanceSaga("oracle_adjudicating", "Oracle adjudication not required for GM Read path.");
  }

  if (oracleResult) {
    yield { type: "oracle_result", data: oracleResult };
  }

  const frameWithOracle: SceneFrame = oracleResult || combatEnvelope
    ? {
        ...sceneFrame,
        oracleContext: targetContext ?? undefined,
        combatEnvelope: combatEnvelope ?? undefined,
        oracle: {
          outcome: oracleResult?.outcome ?? "combat_transition",
          confidence: oracleResult?.chance,
          rationale: oracleResult?.reasoning ?? gmRead.rationale,
        },
      }
    : sceneFrame;

  const outcomeBounds = combatEnvelope
    ? buildNarrativeOutcomeBounds(combatEnvelope, oracleResult?.outcome ?? "combat_transition")
    : null;

  appendChatMessages(campaignId, [{ role: "user", content: playerAction }]);

  const noMutationGmRead = isNoMutationGmReadPath(gmRead);
  yield {
    type: "scene-settling",
    data: {
      stage: "scene-settling",
      phase: gmRead.path === "roll_oracle"
        ? "oracle"
        : noMutationGmRead
          ? "settled-packet"
          : "gm-tool-loop",
    },
  };

  let scenePlan: ScenePlan;
  let executedPlan: ExecutedScenePlan;

  if (isNoMutationGmReadPath(gmRead)) {
    advanceSaga("tool_loop_running", "GM tool loop not required for no-mutation path.");
    scenePlan = buildNoMutationScenePlan({ frame: frameWithOracle, gmRead });
    executedPlan = buildNoMutationExecutedScenePlan({ frame: frameWithOracle, plan: scenePlan });
    log.event("judge.scene-plan", {
      gmReadPath: gmRead.path,
      skippedPlanner: true,
      plannedActionCount: 0,
      supportResponseCount: 0,
      deferredHookCount: 0,
      hiddenRationaleLength: scenePlan.hiddenRationale.length,
      durationMs: 0,
    });
    log.event("scene.plan.validation", {
      ok: true,
      skipped: true,
      reason: "no_mutation_gm_read",
      issueCount: 0,
      issueCodes: [],
      durationMs: 0,
    });
    log.event("scene.plan.execution", {
      skipped: true,
      reason: "no_mutation_gm_read",
      plannedActionCount: 0,
      executedActionCount: 0,
      canonicalEventCount: 0,
      durationMs: 0,
    });
  } else {
    advanceSaga("tool_loop_running", "Running GM tool loop.");
    latencyTrace.turnClass = "heavy";
    const executionStart = Date.now();
    const gmToolLoop = await runGmToolLoop({
      campaignId,
      provider: judgeProvider,
      tick: currentTick,
      playerAction,
      frame: frameWithOracle,
      gmRead,
      oracleResult,
      scopedForecastExcerpt,
      recentConversation: getChatHistory(campaignId).slice(-8),
      maxOutputTokens: storytellerMaxTokens,
    });
    const stepResults = gmToolLoop.stepResults;
    if (
      stepResults.some(
        (result) =>
          result.status === "done" &&
          result.toolName === "reveal_location",
      )
    ) {
      yield {
        type: "scene-settling",
        data: { stage: "scene-settling", phase: "creating-local-scene" },
      };
    }
    if (
      stepResults.some(
        (result) =>
          result.status === "done" &&
          result.toolName === "spawn_npc",
      )
    ) {
      yield {
        type: "scene-settling",
        data: { stage: "scene-settling", phase: "spawning-support-npc" },
      };
    }
    if (
      stepResults.some(
        (result) =>
          result.status === "done" &&
          result.toolName === "promote_npc",
      )
    ) {
      yield {
        type: "scene-settling",
        data: { stage: "scene-settling", phase: "promoting-support-npc" },
      };
    }
    if (stepResults.length > 0) {
      yield {
        type: "scene-settling",
        data: { stage: "scene-settling", phase: "settling-tool-observation" },
      };
    }
    scenePlan = buildScenePlanFromGmToolLoop({
      frame: frameWithOracle,
      gmRead,
      intent: gmToolLoop.intent,
      observationSummary: gmToolLoop.observationSummary,
      stepResults,
    });
    executedPlan = buildExecutedScenePlanFromGmToolLoop({
      frame: frameWithOracle,
      plan: scenePlan,
      observationSummary: gmToolLoop.observationSummary,
      stepResults,
    });
    log.event("scene.gm-tool-loop.execution", {
      stepCount: stepResults.length,
      doneCount: stepResults.filter((result) => result.status === "done").length,
      revisedCount: stepResults.filter((result) => result.status === "revised").length,
      skippedCount: stepResults.filter((result) => result.status === "skipped").length,
      executedActionCount: executedPlan.toolCallResults.length,
      canonicalEventCount: executedPlan.canonicalEvents.length,
      durationMs: Date.now() - executionStart,
    });
    recordTurnLatencyStage(latencyTrace, {
      stage: "gm_tool_loop",
      startedAt: executionStart,
      metadata: {
        stepCount: stepResults.length,
        successfulToolCount: stepResults.filter((result) => result.status === "done").length,
        executedActionCount: executedPlan.toolCallResults.length,
      },
    });
    recordSerializedLlmGroup(latencyTrace, {
      kind: "gm_tool_loop",
      label: "GM tool loop",
      startedAt: executionStart,
      outputChars: gmToolLoop.text.length,
      metadata: {
        stepCount: stepResults.length,
        rawToolCallCount: gmToolLoop.rawToolCalls.length,
        successfulToolCount: stepResults.filter((result) => result.status === "done").length,
      },
    });
  }

  successfulTravel = executedPlan.successfulTravel ?? successfulTravel;
  let toolCallResults = toTurnToolCallResults(executedPlan.toolCallResults);
  let actorActionResults: ExecutedScenePlanActionResult[] = [];

  for (const event of executedPlan.emittedEvents) {
    yield event;
  }

  advanceSaga("local_reaction_running", "Running local actor reaction pass.");
  yield {
    type: "scene-settling",
    data: {
      stage: "scene-settling",
      phase: "actor-reactions",
    },
  };
  const actorPassStart = Date.now();
  const actorPass = await runRequiredActorDecisionPass({
    campaignId,
    tick: currentTick,
    provider: judgeProvider,
    sceneFrame: frameWithOracle,
    playerAction,
    playerLocationId: frameWithOracle.currentLocationId,
    playerSceneScopeId: frameWithOracle.currentSceneScopeId,
    elapsedWorldTimeMinutes: 1,
    maxOutputTokens: storytellerMaxTokens,
  });
  const actorPassEnded = Date.now();
  const actorFrameRetrievalTrace = actorPass.parallelFrameRetrievalTrace ?? [];
  const actorParallelPrepTrace = actorPass.parallelPrepTrace ?? [];
  recordTurnLatencyStage(latencyTrace, {
    stage: "actor_reactions",
    startedAt: actorPassStart,
    endedAt: actorPassEnded,
    metadata: {
      scheduledCount: actorPass.schedule.decisions.length,
      decisionCount: actorPass.decisions.length,
      actionResultCount: actorPass.actionResults.length,
      parallelFrameRetrievalGroupCount: actorFrameRetrievalTrace.length,
      parallelPrepGroupCount: actorParallelPrepTrace.length,
    },
  });
  for (const group of actorFrameRetrievalTrace) {
    recordParallelGroup(latencyTrace, {
      groupId: `actor-frame-retrieval-${group.groupIndex + 1}`,
      label: "actor frame retrieval",
      startedAt: group.startedAt,
      endedAt: group.endedAt,
      jobCount: group.jobCount,
      writeScopes: group.writeScopes,
      serializedFallbackCount: group.serializedFallbackCount,
      metadata: {
        readOnly: true,
        frameType: "ActorFrame",
      },
    });
  }
  for (const group of actorParallelPrepTrace) {
    recordParallelGroup(latencyTrace, {
      groupId: `actor-prep-${group.groupIndex + 1}`,
      label: "actor decision prep",
      startedAt: group.startedAt,
      endedAt: group.endedAt,
      jobCount: group.jobCount,
      writeScopes: group.writeScopes,
      serializedFallbackCount: group.serializedFallbackCount,
    });
  }
  if (actorPass.decisions.length > 0) {
    latencyTrace.turnClass = "heavy";
    recordSerializedLlmGroup(latencyTrace, {
      kind: "actor_decision",
      label: "required actor decisions",
      startedAt: actorPassStart,
      endedAt: actorPassEnded,
      llmCallCount: actorPass.decisions.length,
      metadata: {
        decisionCount: actorPass.decisions.length,
        actionResultCount: actorPass.actionResults.length,
      },
    });
  }
  actorActionResults = actorPass.actionResults;
  if (actorActionResults.length > 0) {
    toolCallResults = [
      ...toolCallResults,
      ...toTurnToolCallResults(actorActionResults),
    ];
  }
  log.event("scene.actor-required-pass", {
    scheduledCount: actorPass.schedule.decisions.length,
    decisionCount: actorPass.decisions.length,
    actionResultCount: actorActionResults.length,
  });

  const hpDropped = toolCallResults.some((tc) => {
    if (tc.tool !== "set_condition") return false;
    const output = tc.result as Record<string, unknown> | undefined;
    const inner = output?.result as Record<string, unknown> | undefined;
    const newHp = inner?.newHp as number | undefined;
    return newHp !== undefined && newHp <= 2 && newHp > 0;
  });

  if (hpDropped) {
    yield { type: "auto_checkpoint", data: { reason: "HP dropped to danger zone" } };
  }

  const predictedTick = predictNextTick(currentTick, successfulTravel);
  const currentLocationId =
    successfulTravel?.locationId
    ?? db
      .select({ currentLocationId: players.currentLocationId })
      .from(players)
      .where(eq(players.campaignId, campaignId))
      .get()?.currentLocationId
    ?? null;
  currentSceneScopeId =
    successfulTravel?.locationId
    ?? db
      .select({ currentSceneLocationId: players.currentSceneLocationId })
      .from(players)
      .where(eq(players.campaignId, campaignId))
      .get()?.currentSceneLocationId
    ?? null;

  advanceSaga("world_consequence_running", "Resolving world consequences before narrator packet.");
  const preNarratorDueWorkStart = Date.now();
  const preNarratorDueWork = resolveDueWorldWorkForScope({
    campaignId,
    tick: currentTick,
    playerLocationId: currentLocationId,
    playerSceneScopeId: currentSceneScopeId,
    elapsedWorldTimeMinutes: successfulTravel?.travelCost ?? 1,
    phase: "pre_narrator_packet",
  });
  const preNarratorDueWorkEnded = Date.now();
  recordTurnLatencyStage(latencyTrace, {
    stage: "pre_narrator_due_work",
    startedAt: preNarratorDueWorkStart,
    endedAt: preNarratorDueWorkEnded,
    metadata: {
      executed: preNarratorDueWork.executed.length,
      deferred: preNarratorDueWork.deferred.length,
      worldThreads: preNarratorDueWork.worldThreads.executed.length,
      proposalPrepGroupCount: preNarratorDueWork.proposalPrepTrace.length,
      proposalPrepSerializedFallbackCount: preNarratorDueWork.proposalPrepTrace
        .reduce((total, group) => total + group.serializedFallbackCount, 0),
    },
  });
  addTurnLatencyProposalEffects(latencyTrace, {
    deferred: preNarratorDueWork.deferred.length + preNarratorDueWork.worldThreads.deferred.length,
  });
  logDueWorldWork(preNarratorDueWork, preNarratorDueWorkEnded - preNarratorDueWorkStart);
  if (hasVisibleDueWorldWork(preNarratorDueWork)) {
    yield {
      type: "scene-settling",
      data: {
        stage: "scene-settling",
        phase: "offscreen-catch-up",
        executed: preNarratorDueWork.executed.length,
        deferred: preNarratorDueWork.deferred.length,
        worldThreads: preNarratorDueWork.worldThreads.executed.length,
      },
    };
  }

  let narratorFrame: SceneFrame = frameWithOracle;
  if (
    preNarratorDueWork.executed.some((result) => result.status === "completed")
    || preNarratorDueWork.worldThreads.executed.length > 0
  ) {
    const narratorFrameStart = Date.now();
    const refreshedNarratorFrame = await buildSceneFrame({
      campaignId,
      tick: currentTick,
      playerActorId: player?.id,
      currentLocationId,
      currentSceneScopeId,
      playerAction,
      intent,
      method,
      elapsedWorldTimeMinutes: successfulTravel?.travelCost ?? 1,
    });
    narratorFrame = {
      ...refreshedNarratorFrame,
      oracleContext: frameWithOracle.oracleContext,
      combatEnvelope: frameWithOracle.combatEnvelope,
      oracle: frameWithOracle.oracle,
    };
    const narratorFrameEnded = Date.now();
    recordTurnLatencyStage(latencyTrace, {
      stage: "narrator_frame_refresh",
      startedAt: narratorFrameStart,
      endedAt: narratorFrameEnded,
      metadata: {
        visibleActorCount:
          refreshedNarratorFrame.roster.active.length
          + refreshedNarratorFrame.roster.support.length,
        eventCount: refreshedNarratorFrame.recentEvents.length,
      },
    });
    log.event("scene.frame.refreshed", {
      reason: "pre_narrator_due_world_work",
      durationMs: narratorFrameEnded - narratorFrameStart,
      visibleActorCount:
        refreshedNarratorFrame.roster.active.length
        + refreshedNarratorFrame.roster.support.length,
      eventCount: refreshedNarratorFrame.recentEvents.length,
    });
  }

  yield {
    type: "scene-settling",
    data: {
      stage: "scene-settling",
      phase: options.openingScene ? "opening-local-scene" : "settled-packet",
      tick: predictedTick,
    },
  };

  const playerLabel =
    runtimePlayerRecord?.identity?.displayName
    ?? player?.name
    ?? "Player";
  const sceneAssembly = assembleAuthoritativeScene({
    campaignId,
    currentLocationId,
    currentSceneScopeId,
    pendingEventTicks: [currentTick, predictedTick],
    toolCalls: toolCallResults,
    openingScene: options.openingScene ?? false,
    playerLabel,
  });

  const hiddenSummary: HiddenTurnSummary = {
    currentTick,
    predictedTick,
    currentLocationId,
    currentSceneScopeId,
    oracleResult,
    toolCalls: toolCallResults,
    openingScene: options.openingScene ?? false,
    sceneAssembly,
  };

  const packetStart = Date.now();
  const canonicalTurnPacket = buildCanonicalTurnPacketFromScenePlan({
    frame: narratorFrame,
    gmRead,
    plan: scenePlan,
    executedPlan,
    actorActionResults,
    oracleResult,
    outcomeBounds,
  });
  const narratorPacket = buildNarratorPacket({
    frame: narratorFrame,
    canonicalTurnPacket,
    forbiddenPrivateTerms: scopedForecastExcerpt.forbiddenPrivateTerms,
  });
  const packetEnded = Date.now();
  recordTurnLatencyStage(latencyTrace, {
    stage: "narrator_packet",
    startedAt: packetStart,
    endedAt: packetEnded,
    metadata: {
      visibleActorCount: narratorPacket.visibleActors.length,
      eventCount: narratorPacket.perceivableEvents.length,
      responseCount: narratorPacket.perceivableResponses.length,
      effectCount: narratorPacket.perceivableEffects.length,
    },
  });
  logScenePlanPacket(narratorPacket, packetEnded - packetStart);
  log.event("turn.resolution", canonicalTurnPacket.turnResolution);
  hiddenSummary.sceneAssembly = sceneAssembly;
  const liveClaim = claimTurnSagaWorker({
    sagaId: turnSaga.id,
    workerId: `live-turn-narration:${randomUUID()}`,
    allowStaleReclaim: false,
  });
  const liveHeartbeat = startPendingNarrationWorkerHeartbeat({
    sagaId: liveClaim.saga.id,
    lockToken: liveClaim.lockToken,
  });
  let liveSettledPacket: SettledTurnPacketRecord | null = null;
  try {
    turnSaga = liveClaim.saga;
    const settledPacket = persistSettledTurnPacket({
      sagaId: turnSaga.id,
      lockToken: liveClaim.lockToken,
      oracleDecisionId,
      canonicalTurnPacket,
      narratorPacket,
      sourceRefs: uniqueRefs([
        ...gmRead.evidenceRefs,
        ...canonicalTurnPacket.narratorFacts.eventIds,
        ...canonicalTurnPacket.narratorFacts.responseIds,
        ...canonicalTurnPacket.narratorFacts.actionIds,
      ]),
      acceptedToolResultRefs: executedActionRefs(executedPlan.actionResults),
      acceptedActorResultRefs: executedActionRefs(actorActionResults),
      dueWorldRefs: uniqueRefs([
        ...dueWorldRefs(preFrameDueWork),
        ...dueWorldRefs(preNarratorDueWork),
      ]),
      requiresNarration: true,
      baseWorldVersion: baseWorldClock.worldVersion,
      resultWorldVersion: readWorldClock(campaignId).worldVersion,
    });
    liveSettledPacket = settledPacket;
    turnSaga = getTurnSaga({ sagaId: turnSaga.id }) ?? turnSaga;

    yield {
      type: "turn_resolution",
      data: canonicalTurnPacket.turnResolution,
    };

    yield {
      type: "scene-settling",
      data: {
        stage: "scene-settling",
        phase: options.openingScene ? "opening-final-narration" : "final-narration",
        opening: options.openingScene ?? false,
      },
    };

    const narration = await renderSettledNarrationWithSaga({
      saga: turnSaga,
      settledPacket,
      campaignId,
      contextWindow,
      sceneAssembly,
      narratorPacket,
      outcomeBounds,
      oracleResult,
      embedderResult,
      playerAction,
      storytellerProvider,
      storytellerTemperature,
      storytellerMaxTokens,
      judgeProvider,
      lockToken: liveClaim.lockToken,
      recordPromptAssemblyStage: (startedAt, endedAt) => {
        recordTurnLatencyStage(latencyTrace, {
          stage: "final_prompt",
          startedAt,
          endedAt,
          metadata: {
            hasNarratorPacket: true,
          },
        });
      },
      recordNarratorRepairStage: (startedAt, endedAt, metadata) => {
        recordTurnLatencyStage(latencyTrace, {
          stage: "narrator_repair",
          startedAt,
          endedAt,
          metadata,
        });
      },
    });
    liveHeartbeat.heartbeat();
    const {
      guardedNarration,
      narrativeText,
      reasoningText,
      lastVisibleFailures,
      lastVisibleUsage,
      lastVisibleFinishReason,
      lastVisibleResponse,
    } = narration;
    recordTurnLatencyStage(latencyTrace, {
      stage: "final_narration",
      startedAt: narration.narrationStartedAt,
      endedAt: narration.narrationEndedAt,
      metadata: {
        attempts: guardedNarration.attempts,
        retried: guardedNarration.retried,
        outputChars: narrativeText.length,
        finishReason: lastVisibleFinishReason ?? null,
        responseModel: lastVisibleResponse?.modelId ?? null,
      },
    });
    recordSerializedLlmGroup(latencyTrace, {
      kind: "storyteller",
      label: "final visible narration",
      startedAt: narration.narrationStartedAt,
      endedAt: narration.narrationEndedAt,
      llmCallCount: guardedNarration.attempts,
      retryCount: Math.max(0, guardedNarration.attempts - 1),
      usage: lastVisibleUsage,
      outputChars: narrativeText.length,
      metadata: {
        retried: guardedNarration.retried,
        finishReason: lastVisibleFinishReason ?? null,
        responseModel: lastVisibleResponse?.modelId ?? null,
        failures: lastVisibleFailures,
      },
    });
    log.event("visible-narration.packet-guard", {
      stage: "passed",
      attempts: guardedNarration.attempts,
      retried: guardedNarration.retried,
      violationCount: guardedNarration.validation.violations.length,
      durationMs: narration.narrationEndedAt - narration.narrationStartedAt,
    });
    log.event("storyteller.visible.call", {
      label: "final",
      initialLen: narrativeText.length,
      retried: guardedNarration.retried,
      failures: lastVisibleFailures,
      reasoningLen: reasoningText?.length ?? 0,
      finishReason: lastVisibleFinishReason ?? null,
      responseModel: lastVisibleResponse?.modelId ?? null,
      usage: lastVisibleUsage ?? null,
      durationMs: narration.narrationEndedAt - narration.narrationStartedAt,
    });
    log.info(
      `Visible narration complete: executedActions=${toolCallResults.length}, final=${narrativeText.length} chars, retried=${guardedNarration.retried}, failures=${lastVisibleFailures.join(",") || "none"}`,
    );

    if (narrativeText) {
      turnSaga = appendAssistantNarrationForResume({
        campaignId,
        saga: turnSaga,
        narratorAttemptId: narration.narratorAttemptId,
        narrativeText,
        lockToken: liveClaim.lockToken,
      });
      yield { type: "narrative", data: { text: narrativeText } };
    }

    if (shouldExposeReasoningSse() && reasoningText) {
      yield { type: "reasoning", data: { text: reasoningText } };
    }

    const { tick: newTick } = yield* runPostNarrationFinalizationTail({
      campaignId,
      turnId: turnSaga.turnId,
      sagaId: turnSaga.id,
      lockToken: liveClaim.lockToken,
      narratorAttemptId: narration.narratorAttemptId,
      currentTick,
      playerId: player?.id ?? null,
      playerAction,
      successfulTravel,
      oracleResult,
      toolCallResults,
      narrativeText,
      sceneAssembly,
      onPostTurn,
      stagedForecast,
      recordTransientCleanupStage: (startedAt, tick) => {
        recordTurnLatencyStage(latencyTrace, {
          stage: "transient_cleanup",
          startedAt,
          metadata: { tick },
        });
      },
      finishLatencyTrace,
    });
    liveHeartbeat.heartbeat();
    markTurnSagaFinalized({
      sagaId: turnSaga.id,
      narratorAttemptId: narration.narratorAttemptId,
      reason: narration.finalizationReason,
      lockToken: liveClaim.lockToken,
    });
    yield { type: "done", data: { tick: newTick } };
  } catch (error) {
    const latestSaga = getTurnSaga({ sagaId: liveClaim.saga.id }) ?? turnSaga;
    if (
      !(error instanceof NarrationRepairExhaustedError)
      && (
        liveSettledPacket !== null
        || latestSaga.settledTurnPacketId !== null
        || isPendingNarrationStatus(latestSaga.status)
      )
    ) {
      throw new PendingSettledTurnNarrationError(latestSaga, error);
    }
    throw error;
  } finally {
    liveHeartbeat.stop();
    try {
      releaseTurnSagaWorker({
        sagaId: liveClaim.saga.id,
        lockToken: liveClaim.lockToken,
      });
    } catch (error) {
      log.warn("Live narration worker could not release saga lock", error);
    }
  }
}

async function* processTurnLegacy(
  options: TurnOptions
): AsyncGenerator<TurnEvent> {
  const {
    campaignId,
    playerAction,
    intent,
    method,
    judgeProvider,
    storytellerProvider,
    storytellerTemperature,
    storytellerMaxTokens,
    embedderResult,
    contextWindow = 8192,
    onPostTurn,
  } = options;

  // 1. Query game state
  const db = getDb();
  const config = readCampaignConfig(campaignId);
  const currentTick = config.currentTick ?? 0;
  const player = db
    .select()
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();
  const initialSceneScopeId = ensurePlayerSceneScopeAlignment(db, player ?? undefined);

  let actorTags: string[] = [];
  let environmentTags: string[] = [];
  let sceneContext = "";
  let runtimePlayerRecord: ReturnType<typeof hydrateStoredPlayerRecord> | null = null;
  let oracleLocationId: string | null = player?.currentLocationId ?? null;
  let currentSceneScopeId: string | null = initialSceneScopeId;
  let successfulTravel: SuccessfulTravel | null = null;

  if (player) {
    const openingState = applyStartConditionEffects(
      hydrateStoredPlayerRecord(player),
      {
        currentTick,
        currentLocationId: player.currentLocationId,
      },
    );
    runtimePlayerRecord = openingState.record;
    actorTags = deriveRuntimeCharacterTags(runtimePlayerRecord);
    oracleLocationId = runtimePlayerRecord.socialContext.currentLocationId;

    if (openingState.changed) {
      persistPlayerRuntimeRecord(db, player.id, campaignId, runtimePlayerRecord);
    }

    // Include HP status in scene context for Oracle to factor in
    if (runtimePlayerRecord.state.hp < 5) {
      sceneContext += ` Actor HP: ${runtimePlayerRecord.state.hp}/5.`;
    }

    if (oracleLocationId) {
      const location = db
        .select()
        .from(locations)
        .where(eq(locations.id, oracleLocationId))
        .get();

      if (location) {
        try {
          environmentTags = JSON.parse(location.tags) as string[];
        } catch {
          environmentTags = [];
        }
        sceneContext = `${location.name}: ${location.description}`;
      }
    }

    for (const line of openingState.effects.sceneContextLines) {
      sceneContext += `${sceneContext ? "\n" : ""}${line}`;
    }
  }

  // 1b. Detect movement and handle location change
  const movementDestination = await detectMovement(playerAction, judgeProvider);
  if (movementDestination && player) {
    const allLocations = db
      .select()
      .from(locations)
      .where(eq(locations.campaignId, campaignId))
      .all();
    const locationGraph = loadLocationGraph({ campaignId });
    const destination = resolveLocationTarget({
      targetName: movementDestination,
      locations: allLocations,
      currentTick,
    });

    if (destination && player.currentLocationId) {
      if (destination.locationId === player.currentLocationId) {
        const noOpNarrative = `You remain at ${destination.locationName}.`;
        appendChatMessages(campaignId, [{ role: "user", content: playerAction }]);
        appendChatMessages(campaignId, [{ role: "assistant", content: noOpNarrative }]);
        yield { type: "narrative", data: { text: noOpNarrative } };
        yield { type: "done", data: { tick: currentTick } };
        return;
      }

      const travelPath = resolveTravelPath({
        campaignId,
        fromLocationId: player.currentLocationId,
        toLocationId: destination.locationId,
        edges: locationGraph.edges,
        locations: allLocations,
        currentTick,
      });

      const destinationLocation = allLocations.find((location) => location.id === destination.locationId);
      if (travelPath && destinationLocation) {
        persistPlayerLocation(db, player, destinationLocation.id, destinationLocation.name);
        player.currentLocationId = destinationLocation.id;
        player.currentSceneLocationId = destinationLocation.id;
        oracleLocationId = destinationLocation.id;
        currentSceneScopeId = destinationLocation.id;
        if (runtimePlayerRecord) {
          runtimePlayerRecord = syncPlayerRecordLocation(
            runtimePlayerRecord,
            destinationLocation.id,
            destinationLocation.name,
          );
        }

        successfulTravel = {
          locationId: destinationLocation.id,
          locationName: destinationLocation.name,
          travelCost: travelPath.totalTravelCost,
          tickAdvance: travelPath.totalTravelCost,
          path: getPathNames(travelPath.locationIds, allLocations),
        };

        yield {
          type: "state_update",
          data: {
            type: "location_change",
            locationId: successfulTravel.locationId,
            locationName: successfulTravel.locationName,
            travelCost: successfulTravel.travelCost,
            tickAdvance: successfulTravel.tickAdvance,
            path: successfulTravel.path,
          },
        };

        sceneContext = `${destinationLocation.name}: ${destinationLocation.description}`;
        try {
          environmentTags = JSON.parse(destinationLocation.tags) as string[];
        } catch {
          environmentTags = [];
        }
      } else {
        const reachableNames = listConnectedPaths({
          campaignId,
          fromLocationId: player.currentLocationId,
          edges: locationGraph.edges,
          locations: allLocations,
          currentTick,
        }).map((path) => `${path.locationName} (${path.travelCost})`);

        if (reachableNames.length > 0) {
          sceneContext += `\nAvailable paths from here: ${reachableNames.join(", ")}`;
        }
      }
    }
    // If destination not found at all -- pass through to Oracle/Storyteller (might reveal_location)
  }

  const targetContext = await resolveActionTargetContext({
    campaignId,
    playerAction,
    intent,
    method,
    judgeProvider,
    movementDestination,
  });

  log.event("target.context", {
    targetTags: targetContext.targetTags ?? [],
    targetLabel: targetContext.targetLabel ?? null,
    targetType: targetContext.targetType,
    hasCombatSnapshot: Boolean(targetContext.combatSnapshot),
    source: targetContext.source,
    fallbackReason: targetContext.fallbackReason,
  });

  const hostileAction = isHostileCombatAction({
    actionText: playerAction,
    intent,
    method,
  });

  let combatEnvelope = null;
  let combatEnvelopeReason: string | null = null;

  if (!hostileAction) {
    combatEnvelopeReason = "non_hostile_action";
  } else if (targetContext.targetType !== "character") {
    combatEnvelopeReason = "non_character_target";
  } else if (!runtimePlayerRecord?.powerStats) {
    combatEnvelopeReason = "missing_actor_power";
  } else if (!targetContext.combatSnapshot?.powerStats) {
    combatEnvelopeReason = "missing_target_power";
  } else {
    combatEnvelope = buildCombatEnvelope({
      actor: {
        label: runtimePlayerRecord.identity?.displayName ?? player?.name ?? "Player",
        powerStats: runtimePlayerRecord.powerStats,
      },
      target: targetContext.combatSnapshot,
      hostileAction,
      actionText: [playerAction, intent, method].filter(Boolean).join(" "),
    });
    if (!combatEnvelope) {
      combatEnvelopeReason = "builder_returned_null";
    }
  }

  log.event("combat.envelope", {
    source: "player",
    hostileAction,
    built: Boolean(combatEnvelope),
    reason: combatEnvelopeReason,
    targetLabel: targetContext.targetLabel ?? null,
    matchup: combatEnvelope?.matchup ?? null,
    durabilityTierGap: combatEnvelope?.durabilityTierGap ?? null,
    actorBypassesTarget: combatEnvelope?.actorBypassesTarget ?? null,
    targetBypassesActor: combatEnvelope?.targetBypassesActor ?? null,
  });

  // 2. Call Oracle
  const oracleResult = await callOracle(
    {
      intent,
      method,
      actorTags,
      targetTags: targetContext.targetTags,
      environmentTags,
      sceneContext,
      ...(combatEnvelope ? { combatEnvelope } : {}),
    },
    judgeProvider
  );

  yield { type: "oracle_result", data: oracleResult };

  const playerLabel =
    runtimePlayerRecord?.identity?.displayName
    ?? player?.name
    ?? "Player";
  const sceneDirectionSeedAssembly = assembleAuthoritativeScene({
    campaignId,
    currentLocationId: oracleLocationId,
    currentSceneScopeId,
    pendingEventTicks: [currentTick],
    toolCalls: [],
    openingScene: options.openingScene ?? false,
    playerLabel,
  });
  const sceneDirection = await runWorldBrainSceneDirection({
    provider: judgeProvider,
    seed: buildSceneDirectionSeed(sceneDirectionSeedAssembly, {
      runSource: "player-turn",
      playerLabel,
      playerAction,
      intent,
      method,
      oracleOutcome: oracleResult.outcome,
      targetLabel: targetContext.targetLabel ?? null,
    }),
  });

  const outcomeBounds = combatEnvelope
    ? buildNarrativeOutcomeBounds(combatEnvelope, oracleResult.outcome)
    : null;

  if (outcomeBounds) {
    log.event("combat.bounds.derived", {
      source: "player",
      targetLabel: targetContext.targetLabel ?? null,
      outcome: oracleResult.outcome,
      matchup: combatEnvelope?.matchup ?? null,
      summary: outcomeBounds.summary,
      ceilingCount: outcomeBounds.ceilings.length,
      floorCount: outcomeBounds.floors.length,
      prohibitionCount: outcomeBounds.prohibitions.length,
    });
  }

  const adjudicationPrompt = await assembleJudgeAdjudicationPrompt({
    campaignId,
    contextWindow,
    actionResult: oracleResult,
    embedderResult,
    playerAction,
    judgeRole: { provider: judgeProvider, temperature: 0.1, maxTokens: 1024 },
    worldBrainDirection: sceneDirection,
    outcomeBounds: outcomeBounds ?? undefined,
  });

  // 5. Persist user message
  appendChatMessages(campaignId, [{ role: "user", content: playerAction }]);

  yield {
    type: "scene-settling",
    data: {
      stage: "scene-settling",
      phase: "judge-adjudication",
    },
  };

  const toolCallResults: Array<{
    tool: string;
    args: unknown;
    result: unknown;
  }> = [];
  try {
    const planStart = Date.now();
    const adjudicationResult = await withRole("judge", () =>
      runHiddenAdjudicationPlan({
        provider: judgeProvider,
        system: adjudicationPrompt.system,
        messages: adjudicationPrompt.messages,
        maxOutputTokens: storytellerMaxTokens,
      }),
    );
    const adjudicationPlan = adjudicationResult;
    log.event("judge.hidden.plan", {
      actionCount: adjudicationPlan.actions.length,
      rationaleLen: adjudicationPlan.rationale.length,
      rationale: adjudicationPlan.rationale,
      actionTools: adjudicationPlan.actions.map((action) => action.toolName),
      providerReasoningLen: adjudicationResult.trace?.reasoningText?.length ?? 0,
      responseModel: adjudicationResult.trace?.response?.modelId ?? null,
      usage: adjudicationResult.trace?.usage ?? null,
      durationMs: Date.now() - planStart,
    });

    if (adjudicationResult.trace?.reasoningText) {
      log.event("judge.reasoning", {
        source: "hidden-adjudication",
        reasoningText: adjudicationResult.trace.reasoningText,
        responseModel: adjudicationResult.trace.response?.modelId ?? null,
        usage: adjudicationResult.trace.usage ?? null,
      });
    }

    const executionStart = Date.now();
    const executedPlan = await executeAdjudicationPlan({
      campaignId,
      tick: currentTick,
      outcomeTier: oracleResult.outcome,
      plan: adjudicationPlan,
    });
    log.event("judge.hidden.execution", {
      plannedActionCount: adjudicationPlan.actions.length,
      executedActionCount: executedPlan.toolCallResults.length,
      durationMs: Date.now() - executionStart,
    });

    successfulTravel = executedPlan.successfulTravel ?? successfulTravel;
    toolCallResults.push(...executedPlan.toolCallResults);

    for (const event of executedPlan.emittedEvents) {
      yield event;
    }
  } catch (hiddenPassError) {
    throw new Error("Judge hidden adjudication failed before visible narration could be generated.");
  }

  // 10c. Reactive auto-checkpoint if HP dropped to danger zone (2 or below) during turn
  const hpDropped = toolCallResults.some((tc) => {
    if (tc.tool !== "set_condition") return false;
    const output = tc.result as Record<string, unknown> | undefined;
    const inner = output?.result as Record<string, unknown> | undefined;
    const newHp = inner?.newHp as number | undefined;
    return newHp !== undefined && newHp <= 2 && newHp > 0; // >0 because HP=0 is game over, not checkpoint
  });

  if (hpDropped) {
    yield { type: "auto_checkpoint", data: { reason: "HP dropped to danger zone" } };
  }

  const predictedTick = predictNextTick(currentTick, successfulTravel);
  const currentLocationId =
    successfulTravel?.locationId
    ?? db
      .select({ currentLocationId: players.currentLocationId })
      .from(players)
      .where(eq(players.campaignId, campaignId))
      .get()?.currentLocationId
    ?? null;
  currentSceneScopeId =
    successfulTravel?.locationId
    ?? db
      .select({ currentSceneLocationId: players.currentSceneLocationId })
      .from(players)
      .where(eq(players.campaignId, campaignId))
      .get()?.currentSceneLocationId
    ?? null;

  yield {
    type: "scene-settling",
    data: {
      stage: "scene-settling",
      phase: options.openingScene ? "opening-local-scene" : "local-present-scene",
      tick: predictedTick,
    },
  };

  const hiddenSummary: HiddenTurnSummary = {
    currentTick,
    predictedTick,
    currentLocationId,
    currentSceneScopeId,
    oracleResult,
    toolCalls: toolCallResults,
    openingScene: options.openingScene ?? false,
    sceneDirection,
  };

  if (options.onBeforeVisibleNarration) {
    // The chat route injects tickPresentNpcs() here so present-scene settlement
    // happens before the final narration pass instead of during post-turn finalization.
    await Promise.resolve(options.onBeforeVisibleNarration(hiddenSummary));
  }

  const sceneAssembly = assembleAuthoritativeScene({
    campaignId,
    currentLocationId,
    currentSceneScopeId,
    pendingEventTicks: [currentTick, predictedTick],
    toolCalls: toolCallResults,
    openingScene: options.openingScene ?? false,
    playerLabel,
    sceneDirection,
  });
  if (sceneAssembly.sceneDirection) {
    logWorldBrainSceneDirection("player-turn", sceneAssembly.sceneDirection);
  }
  hiddenSummary.sceneAssembly = sceneAssembly;

  const finalNarrationPrompt = await assembleFinalNarrationPrompt({
    campaignId,
    contextWindow,
    sceneAssembly,
    outcomeBounds: outcomeBounds ?? undefined,
    actionResult: oracleResult,
    embedderResult,
    playerAction,
    judgeRole: { provider: judgeProvider, temperature: 0.1, maxTokens: 1024 },
  });

  yield {
    type: "scene-settling",
    data: {
      stage: "scene-settling",
      phase: options.openingScene ? "opening-final-narration" : "final-narration",
      opening: options.openingScene ?? false,
    },
  };

  const visibleCallStart = Date.now();
  const finalNarration = await withRole("storyteller", () =>
    runVisibleNarrationWithGuard({
      label: "final",
      provider: storytellerProvider,
      system: finalNarrationPrompt.system,
      prompt: finalNarrationPrompt.prompt,
      storytellerTemperature,
      storytellerMaxTokens,
    }),
  );
  const narrativeText = finalNarration.text;
  const reasoningText = finalNarration.reasoningText;
  assertNonEmptyFinalVisibleNarration(narrativeText);
  log.event("storyteller.visible.call", {
    label: "final",
    initialLen: narrativeText.length,
    retried: finalNarration.retried,
    failures: finalNarration.failures,
    reasoningLen: reasoningText?.length ?? 0,
    finishReason: finalNarration.finishReason ?? null,
    responseModel: finalNarration.response?.modelId ?? null,
    usage: finalNarration.usage ?? null,
    durationMs: Date.now() - visibleCallStart,
  });
  log.info(
    `Visible narration complete: executedActions=${toolCallResults.length}, final=${narrativeText.length} chars, retried=${finalNarration.retried}, failures=${finalNarration.failures.join(",") || "none"}`,
  );

  if (narrativeText) {
    yield { type: "narrative", data: { text: narrativeText } };
    appendChatMessages(campaignId, [
      { role: "assistant", content: narrativeText },
    ]);
  }

  if (reasoningText) {
    log.event("storyteller.reasoning", {
      label: "final",
      reasoningText,
      responseModel: finalNarration.response?.modelId ?? null,
      usage: finalNarration.usage ?? null,
    });
  }

  if (shouldExposeReasoningSse() && reasoningText) {
    yield { type: "reasoning", data: { text: reasoningText } };
  }

  const newTick =
    successfulTravel && successfulTravel.tickAdvance > 0
      ? advanceCampaignTick(campaignId, successfulTravel.tickAdvance)
      : incrementTick(campaignId);

  if (player) {
    const storedPlayer = db
      .select()
      .from(players)
      .where(eq(players.id, player.id))
      .get();

    if (storedPlayer) {
      const nextOpeningState = applyStartConditionEffects(
        hydrateStoredPlayerRecord(storedPlayer),
        {
          currentTick: newTick,
          currentLocationId: storedPlayer.currentLocationId,
          playerAction,
        },
      );

      if (nextOpeningState.changed) {
        persistPlayerRuntimeRecord(
          db,
          storedPlayer.id,
          storedPlayer.campaignId,
          nextOpeningState.record,
        );
      }
    }
  }

  const summary: TurnSummary = {
    tick: newTick,
    oracleResult,
    toolCalls: toolCallResults,
    narrativeText,
    sceneDirection: sceneAssembly.sceneDirection ?? undefined,
    sceneAssembly,
  };

  if (onPostTurn) {
    yield {
      type: "finalizing_turn",
      data: { tick: newTick, stage: "rollback_critical" },
    };

    await Promise.resolve(onPostTurn(summary));
  }

  yield { type: "done", data: { tick: newTick } };
}

export async function* processOpeningScene(
  options: OpeningSceneOptions,
): AsyncGenerator<TurnEvent> {
  const {
    campaignId,
    storytellerProvider,
    storytellerTemperature,
    storytellerMaxTokens,
    embedderResult,
    contextWindow = 8192,
  } = options;

  const db = getDb();
  const player = db
    .select()
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();
  const syncedSceneScopeId = ensurePlayerSceneScopeAlignment(db, player ?? undefined);
  const currentTick = readCampaignConfig(campaignId).currentTick ?? 0;
  const playerLabel = player?.name ?? "Player";

  yield {
    type: "scene-settling",
    data: {
      stage: "scene-settling",
      phase: "opening",
    },
  };

  const sceneDirectionSeedAssembly = assembleAuthoritativeScene({
    campaignId,
    currentSceneScopeId: syncedSceneScopeId,
    pendingEventTicks: [currentTick],
    toolCalls: [],
    openingScene: true,
    playerLabel,
  });
  const sceneDirection = await runWorldBrainSceneDirection({
    provider: storytellerProvider,
    seed: buildSceneDirectionSeed(sceneDirectionSeedAssembly, {
      runSource: "opening-scene",
      playerLabel,
    }),
  });

  if (sceneDirection.focalActorNames.length === 0) {
    throw new Error("Opening world-brain pass returned no valid focal actors.");
  }

  const sceneAssembly = assembleAuthoritativeScene({
    campaignId,
    currentSceneScopeId: player?.currentSceneLocationId ?? null,
    pendingEventTicks: [currentTick],
    toolCalls: [],
    openingScene: true,
    playerLabel,
    sceneDirection,
  });
  if (sceneAssembly.sceneDirection) {
    logWorldBrainSceneDirection("opening-scene", sceneAssembly.sceneDirection);
  }

  const finalNarrationPrompt = await assembleFinalNarrationPrompt({
    campaignId,
    contextWindow,
    sceneAssembly,
    embedderResult,
  });

  yield {
    type: "scene-settling",
    data: {
      stage: "scene-settling",
      phase: "opening-final-narration",
      opening: true,
    },
  };

  const openingCallStart = Date.now();
  const openingNarration = await withRole("storyteller", () =>
    runVisibleNarrationWithGuard({
      label: "opening",
      provider: storytellerProvider,
      system: finalNarrationPrompt.system,
      prompt: finalNarrationPrompt.prompt,
      storytellerTemperature,
      storytellerMaxTokens,
    }),
  );
  const narrativeText = openingNarration.text;
  const reasoningText = openingNarration.reasoningText;
  log.event("storyteller.visible.call", {
    label: "opening",
    initialLen: narrativeText.length,
    retried: openingNarration.retried,
    failures: openingNarration.failures,
    reasoningLen: reasoningText?.length ?? 0,
    finishReason: openingNarration.finishReason ?? null,
    responseModel: openingNarration.response?.modelId ?? null,
    usage: openingNarration.usage ?? null,
    durationMs: Date.now() - openingCallStart,
  });

  log.info(
    `Opening narration complete: final=${narrativeText.length} chars, retried=${openingNarration.retried}, failures=${openingNarration.failures.join(",") || "none"}`,
  );
  assertNonEmptyFinalVisibleNarration(narrativeText);

  if (narrativeText) {
    appendChatMessages(campaignId, [{ role: "assistant", content: narrativeText }]);
    yield { type: "narrative", data: { text: narrativeText } };
  }

  if (reasoningText) {
    log.event("storyteller.reasoning", {
      label: "opening",
      reasoningText,
      responseModel: openingNarration.response?.modelId ?? null,
      usage: openingNarration.usage ?? null,
    });
  }

  if (shouldExposeReasoningSse() && reasoningText) {
    yield { type: "reasoning", data: { text: reasoningText } };
  }

  yield { type: "done", data: { tick: currentTick, opening: true } };
}
