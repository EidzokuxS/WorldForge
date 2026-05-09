/**
 * Turn processor: orchestrates the full GM decision -> optional Oracle -> Storyteller pipeline.
 *
 * Yields typed TurnEvents as an async generator, allowing the caller
 * (route handler) to stream events to the client as they happen.
 */

import { generateText } from "ai";
import { extractReasoningText, normalizeReasoningText } from "../ai/extract-reasoning-text.js";
import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
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
  collapseRepeatedNarrationBlocks,
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
} from "./turn-latency-trace.js";
import type { GmToolStepResult } from "./gm-tool-step.js";
import type {
  ExecutedScenePlan,
  ExecutedScenePlanActionResult,
} from "./scene-plan-executor.js";
import type { ScenePlan, SceneResponse } from "./scene-plan-schema.js";
import {
  buildNarratorPacket,
  summarizeRuntimeToolResultForNarrator,
  type CanonicalTurnPacket,
  type CanonicalTurnPacketEffect,
  type CanonicalTurnPacketEvent,
  type CanonicalTurnPacketResponse,
} from "./narrator-packet.js";
import { runVisibleNarrationWithPacketGuard } from "./visible-narration-output-guard.js";
import {
  buildScopedForecastExcerpt,
  loadWorldTrajectoryForecast,
  shouldRefreshWorldTrajectoryForecast,
  stageWorldTrajectoryForecast,
  writeStagedWorldTrajectoryForecast,
  type ScopedForecastExcerpt,
  type StagedWorldTrajectoryForecast,
} from "./world-forecast.js";
import { runWorldForecastBuilder } from "./world-forecast-builder.js";
import { cleanupTransientSceneObjects } from "./transient-scene-lifecycle.js";

const log = createLogger("turn-processor");
const VISIBLE_NARRATION_TRANSPORT_RETRY_LIMIT = 2;
const FINAL_VISIBLE_PACKET_GUARD_RECOVERY_ADDENDUM = [
  "The previous final visible narration failed packet visibility validation after its internal retries.",
  "Generate a fresh final narration from the same authoritative player-facing packet.",
  "Do not preserve wording from the failed draft.",
  "Omit any identity, fact marker, or private/source-boundary wording that is not explicitly player-visible in the packet.",
].join("\n");

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
    | "finalizing_turn"
    | "done"
    | "error";
  data: unknown;
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

/**
 * Patterns that match tool-call syntax leaked into prose by models like Gemini Flash.
 * Examples:
 *   print(default_api.offer_quick_actions(actions=[...]))
 *   default_api.set_condition(entity="player", delta=-1)
 */
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
  let text = raw;

  // 1. Strip tool-call syntax that leaked into prose
  for (const pattern of TOOL_CALL_LEAK_PATTERNS) {
    text = text.replace(pattern, "");
  }

  // 2. Find the earliest occurrence of any leaked header and truncate
  let earliestIdx = text.length;
  for (const header of LEAKED_HEADERS) {
    const idx = text.indexOf(header);
    if (idx !== -1 && idx < earliestIdx) {
      earliestIdx = idx;
    }
  }
  if (earliestIdx < text.length) {
    text = text.slice(0, earliestIdx);
  }

  // 3. Collapse excessive whitespace left by removals
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

type VisibleNarrationFailure =
  | "repeated_lead"
  | "residual_leak"
  | "instruction_echo"
  | "slop_cluster";

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
  return collapseRepeatedNarrationBlocks(sanitizeNarrative(raw));
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

  return /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|network error|fetch failed|socket hang up|connection (?:closed|terminated|reset|refused)|terminated)\b/i.test(message);
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
  usage?: Awaited<ReturnType<typeof generateText>>["usage"];
  response?: Awaited<ReturnType<typeof generateText>>["response"];
  finishReason?: Awaited<ReturnType<typeof generateText>>["finishReason"];
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
    for (let attempt = 1; attempt <= VISIBLE_NARRATION_TRANSPORT_RETRY_LIMIT; attempt += 1) {
      try {
        return await generateText({
          model: createModel(activeProvider, {
            role: "storyteller",
            familyHint: "baseline",
          }),
          system,
          prompt: promptText,
          temperature: storytellerTemperature,
          maxOutputTokens: storytellerMaxTokens,
        });
      } catch (error) {
        lastError = error;
        if (!isVisibleNarrationTransportError(error) || attempt >= VISIBLE_NARRATION_TRANSPORT_RETRY_LIMIT) {
          throw error;
        }
        log.warn(
          `Visible narration transport error; retrying storyteller pass ${attempt + 1}/${VISIBLE_NARRATION_TRANSPORT_RETRY_LIMIT}`,
          error,
        );
      }
    }

    throw lastError;
  }

  const initialResult = await runNarrationPass(provider, prompt);

  const initialText = applyVisibleNarrationFilters(initialResult.text);
  const initialReasoningText = normalizeReasoningText(extractReasoningText(initialResult));
  const initialFailures = detectVisibleNarrationFailures(initialText, { system, prompt });
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

  try {
    const retryResult = await runNarrationPass(provider, retryPrompt);
    const retryText = applyVisibleNarrationFilters(retryResult.text);
    const retryReasoningText = normalizeReasoningText(extractReasoningText(retryResult));
    const retryFailures = detectVisibleNarrationFailures(retryText, { system, prompt });

    if (scoreVisibleNarrationCandidate(retryText, retryFailures) >= scoreVisibleNarrationCandidate(initialText, initialFailures)) {
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

// -- Main processor -----------------------------------------------------------

function isScenePlanEnabled(): boolean {
  // Temporary Phase 70 rollback flag. SCENE_PLAN_ENABLED defaults true; only
  // exact string "false" isolates the legacy Phase 69 path. Remove this flag
  // once focused Phase 70 route/typecheck tests pass, or keep it only with a
  // dated follow-up naming the failing rollback evidence that blocks removal.
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
    summary: summarizeRuntimeToolResultForNarrator({
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

function buildCanonicalTurnPacketFromScenePlan(args: {
  frame: SceneFrame;
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
  const primaryResponseSummary =
    args.plan.plannedActions.length === 0
      ? `GM no-mutation direction: ${boundedPlanText(args.plan.actionInterpretation.intent, 220)}`
      : undefined;
  const responses = [
    sceneResponseToPacketResponse(args.frame, args.plan.primaryResponse, primaryResponseSummary),
    ...args.plan.supportResponses.map((response) =>
      sceneResponseToPacketResponse(args.frame, response),
    ),
  ];
  const actionResults = [
    ...args.executedPlan.actionResults,
    ...(args.actorActionResults ?? []),
  ];
  const narratorFacts = {
    ...args.plan.narratorFacts,
    actionIds: [
      ...args.plan.narratorFacts.actionIds,
      ...(args.actorActionResults ?? []).map((action) => action.actionId),
    ],
    toolResultRefs: [
      ...args.plan.narratorFacts.toolResultRefs,
      ...(args.actorActionResults ?? []).map((action) => ({
        actionId: action.actionId,
        toolName: action.toolName,
      })),
    ],
  };

  return {
    campaignId: args.frame.campaignId,
    tick: args.frame.tick,
    playerAction: args.frame.playerAction,
    oracleOutcome: args.oracleResult?.outcome ?? null,
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
  stepResults: readonly GmToolStepResult[];
}): ScenePlan {
  const actorId = primarySceneActorId(args.frame);
  const anchorEventId = randomUUID();
  const primaryResponseId = randomUUID();
  const successfulSteps = successfulToolStepResults(args.stepResults);
  const plannedActions = successfulSteps.map((result): ScenePlan["plannedActions"][number] => ({
    id: randomUUID(),
    actorId,
    toolName: result.toolName!,
    input: result.candidateInput!,
  }) as ScenePlan["plannedActions"][number]);

  return {
    actionInterpretation: {
      actorId,
      intent: boundedPlanText(args.intent, 160),
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
      `${args.gmRead.rationale} ${args.intent}`,
      280,
    ),
  };
}

function buildExecutedScenePlanFromGmToolLoop(args: {
  frame: SceneFrame;
  plan: ScenePlan;
  stepResults: readonly GmToolStepResult[];
}): ExecutedScenePlan {
  const validatedPlan = {
    frame: args.frame,
    plan: args.plan,
    issues: [],
  };
  const successfulSteps = successfulToolStepResults(args.stepResults);
  const actionResults = successfulSteps.map((stepResult, order): ExecutedScenePlanActionResult => {
    const action = args.plan.plannedActions[order]!;
    return {
      order,
      actionId: action.id,
      actionRef: stepResult.stepId,
      actorId: action.actorId,
      toolName: action.toolName,
      input: action.input,
      args: stepResult.candidateInput!,
      result: stepResult.result!,
    };
  });
  const successfulTravel = successfulSteps.reduce<SuccessfulTravel | null>(
    (travel, result) => travel ?? (
      result.toolName === "move_to" ? getSuccessfulMoveToolStepResult(result) : null
    ),
    null,
  );
  const emittedEvents: ExecutedScenePlan["emittedEvents"] = actionResults.map((actionResult) => {
    if (actionResult.toolName === "offer_quick_actions") {
      return { type: "quick_actions", data: actionResult.result };
    }
    if (actionResult.toolName === "move_to") {
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
        return {
          type: "state_update",
          data: {
            type: "location_change",
            locationId: moveResult.locationId,
            locationName: moveResult.locationName,
            travelCost: moveResult.travelCost,
            tickAdvance: moveResult.tickAdvance,
            path: moveResult.path,
          },
        };
      }
    }
    return { type: "state_update", data: actionResult };
  });

  return {
    plan: validatedPlan,
    validatedPlan,
    toolCallResults: actionResults,
    actionResults,
    emittedEvents,
    quickActionsEmitted: actionResults.some((action) => action.toolName === "offer_quick_actions"),
    successfulTravel,
    canonicalEvents: actionResults.map((actionResult) => ({
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

function textContainsForbiddenTerm(value: string, forbiddenTerms: readonly string[]): boolean {
  const normalized = value.toLocaleLowerCase();
  return forbiddenTerms.some((term) => {
    const trimmed = term.trim();
    return trimmed.length > 0 && normalized.includes(trimmed.toLocaleLowerCase());
  });
}

function safeClarificationPromptForFrame(
  prompt: string,
  frame: SceneFrame,
  scopedForecastExcerpt: ScopedForecastExcerpt,
): string {
  const forbiddenTerms = [
    ...scopedForecastExcerpt.forbiddenPrivateTerms,
    ...(frame.perception.forbiddenActorIds ?? []),
    ...(frame.perception.forbiddenActorLabels ?? []),
  ];

  if (!textContainsForbiddenTerm(prompt, forbiddenTerms)) {
    return prompt;
  }

  log.warn("Clarification prompt contained forbidden scoped term; replacing with generic prompt", {
    campaignId: frame.campaignId,
    tick: frame.tick,
  });
  return "I need one more concrete detail before I resolve that. What exactly do you try next?";
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
  provider: ProviderConfig,
  maxOutputTokens?: number,
): Promise<{
  excerpt: ScopedForecastExcerpt;
  stagedForecast: StagedWorldTrajectoryForecast | null;
}> {
  try {
    let forecast = loadWorldTrajectoryForecast(frame.campaignId);
    let stagedForecast: StagedWorldTrajectoryForecast | null = null;

    if (shouldRefreshWorldTrajectoryForecast(forecast, frame.tick)) {
      forecast = await runWorldForecastBuilder({
        provider,
        frame,
        priorForecast: forecast,
        maxOutputTokens,
      });
      stagedForecast = stageWorldTrajectoryForecast(forecast);
    }

    return {
      excerpt: buildScopedForecastExcerpt({
        forecast,
        localRefs: buildSceneFrameForecastRefs(frame),
      }),
      stagedForecast,
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
    durationMs,
  });
}

function hasVisibleDueWorldWork(result: ResolveDueWorldWorkForScopeResult): boolean {
  return result.executed.some((item) => item.status !== "waiting")
    || result.deferred.length > 0
    || result.worldThreads.executed.length > 0
    || result.worldThreads.deferred.length > 0;
}

export async function* processTurn(
  options: TurnOptions
): AsyncGenerator<TurnEvent> {
  if (!isScenePlanEnabled()) {
    yield* processTurnLegacy(options);
    return;
  }

  yield* processTurnScenePlan(options);
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
  const latencyTrace = createTurnLatencyTrace({
    turnId: randomUUID(),
    campaignId,
    tick: currentTick,
    turnClass: "normal",
  });
  const baseLatencyStages = [
    "pre_scene_frame_due_work",
    "scene_frame",
    "world_forecast",
    "gm_read",
  ] as const;
  const fullTurnLatencyStages = [
    ...baseLatencyStages,
    "actor_reactions",
    "pre_narrator_due_work",
    "narrator_packet",
    "final_prompt",
    "final_narration",
  ] as const;
  const finishLatencyTrace = (requiredStages: readonly string[] = fullTurnLatencyStages) => {
    finalizeTurnLatencyTrace(latencyTrace, {
      diagnosticOptions: {
        requiredStages,
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
  const forecastResult = await buildScopedForecastExcerptForFrame(
    sceneFrame,
    judgeProvider,
    storytellerMaxTokens,
  );
  const forecastEnded = Date.now();
  const { excerpt: scopedForecastExcerpt, stagedForecast } = forecastResult;
  recordTurnLatencyStage(latencyTrace, {
    stage: "world_forecast",
    startedAt: forecastStart,
    endedAt: forecastEnded,
    metadata: {
      refreshed: stagedForecast !== null,
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
  });

  yield {
    type: "scene-settling",
    data: {
      stage: "scene-settling",
      phase: "gm-read",
    },
  };

  const gmReadStart = Date.now();
  const gmRead = await runGmRead({
    provider: judgeProvider,
    playerAction,
    frame: sceneFrame,
    scopedForecastExcerpt,
    recentConversation: getChatHistory(campaignId).slice(-8),
    maxOutputTokens: storytellerMaxTokens,
  });
  const gmReadEnded = Date.now();
  recordTurnLatencyStage(latencyTrace, {
    stage: "gm_read",
    startedAt: gmReadStart,
    endedAt: gmReadEnded,
    metadata: {
      path: gmRead.path,
      evidenceRefCount: gmRead.evidenceRefs.length,
    },
  });
  recordSerializedLlmGroup(latencyTrace, {
    kind: "gm_read",
    label: "GM Read",
    startedAt: gmReadStart,
    endedAt: gmReadEnded,
    metadata: {
      path: gmRead.path,
      evidenceRefCount: gmRead.evidenceRefs.length,
    },
  });
  log.event("judge.gm-read.selected", {
    path: gmRead.path,
    evidenceRefCount: Array.isArray(gmRead.evidenceRefs) ? gmRead.evidenceRefs.length : 0,
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
  if (gmRead.path === "roll_oracle") {
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

  if (noMutationGmRead) {
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
      stepResults,
    });
    executedPlan = buildExecutedScenePlanFromGmToolLoop({
      frame: frameWithOracle,
      plan: scenePlan,
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

  if (gmRead.path === "clarification") {
    const narrativeText = safeClarificationPromptForFrame(
      gmRead.clarificationPrompt,
      frameWithOracle,
      scopedForecastExcerpt,
    );
    appendChatMessages(campaignId, [
      { role: "assistant", content: narrativeText },
    ]);
    yield { type: "narrative", data: { text: narrativeText } };

    if (onPostTurn) {
      yield {
        type: "finalizing_turn",
        data: { tick: currentTick, stage: "rollback_critical" },
      };
    }

    commitStagedWorldForecast(campaignId, stagedForecast);
    recordTurnLatencyStage(latencyTrace, {
      stage: "clarification_response",
      startedAt: gmReadEnded,
      metadata: { path: gmRead.path },
    });
    finishLatencyTrace([...baseLatencyStages, "clarification_response"]);
    yield { type: "done", data: { tick: currentTick } };
    return;
  }

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
    playerLocationId: frameWithOracle.currentLocationId,
    playerSceneScopeId: frameWithOracle.currentSceneScopeId,
    elapsedWorldTimeMinutes: 1,
    maxOutputTokens: storytellerMaxTokens,
  });
  const actorPassEnded = Date.now();
  const actorParallelPrepTrace = actorPass.parallelPrepTrace ?? [];
  recordTurnLatencyStage(latencyTrace, {
    stage: "actor_reactions",
    startedAt: actorPassStart,
    endedAt: actorPassEnded,
    metadata: {
      scheduledCount: actorPass.schedule.decisions.length,
      decisionCount: actorPass.decisions.length,
      actionResultCount: actorPass.actionResults.length,
      parallelPrepGroupCount: actorParallelPrepTrace.length,
    },
  });
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
  hiddenSummary.sceneAssembly = sceneAssembly;

  const finalPromptStart = Date.now();
  const finalNarrationPrompt = await assembleFinalNarrationPrompt({
    campaignId,
    contextWindow,
    sceneAssembly,
    narratorPacket,
    outcomeBounds: outcomeBounds ?? undefined,
    actionResult: oracleResult ?? undefined,
    embedderResult,
    playerAction,
    judgeRole: { provider: judgeProvider, temperature: 0.1, maxTokens: 1024 },
  });
  recordTurnLatencyStage(latencyTrace, {
    stage: "final_prompt",
    startedAt: finalPromptStart,
    metadata: {
      hasNarratorPacket: true,
    },
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
  let lastReasoningText: string | undefined;
  let lastVisibleFailures: VisibleNarrationFailure[] = [];
  let lastVisibleUsage: Awaited<ReturnType<typeof generateText>>["usage"] | undefined;
  let lastVisibleFinishReason: Awaited<ReturnType<typeof generateText>>["finishReason"] | undefined;
  let lastVisibleResponse: Awaited<ReturnType<typeof generateText>>["response"] | undefined;

  async function runFinalPacketGuardedNarration(recoveryAddendum: string | null) {
    return runVisibleNarrationWithPacketGuard({
      packet: narratorPacket,
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
          runVisibleNarrationWithGuard({
            label: "final",
            provider: storytellerProvider,
            system: finalNarrationPrompt.system,
            prompt: activePrompt,
            storytellerTemperature,
            storytellerMaxTokens,
          }),
        );
        lastReasoningText = result.reasoningText;
        lastVisibleFailures = result.failures;
        lastVisibleUsage = result.usage;
        lastVisibleFinishReason = result.finishReason;
        lastVisibleResponse = result.response;
        return result.text;
      },
      onUnsafeAttempt: ({ attempt, validation }) => {
        log.event("visible-narration.packet-guard", {
          stage: recoveryAddendum ? "recovery-unsafe-attempt" : "unsafe-attempt",
          attempt,
          violationCount: validation.violations.length,
          violationKinds: validation.violations.map((violation) => violation.kind),
        });
      },
    });
  }

  let guardedNarration: Awaited<ReturnType<typeof runVisibleNarrationWithPacketGuard>>;
  try {
    guardedNarration = await runFinalPacketGuardedNarration(null);
  } catch (error) {
    log.warn(
      "Final visible narration failed packet guard; regenerating storyteller output from the same packet before aborting turn",
      error,
    );
    log.event("visible-narration.packet-guard", {
      stage: "recovery-regenerate",
      reason: error instanceof Error ? error.message : String(error),
    });
    guardedNarration = await runFinalPacketGuardedNarration(
      FINAL_VISIBLE_PACKET_GUARD_RECOVERY_ADDENDUM,
    );
  }
  const visibleCallEnded = Date.now();
  const narrativeText = guardedNarration.text;
  const reasoningText = lastReasoningText;
  assertNonEmptyFinalVisibleNarration(narrativeText);
  recordTurnLatencyStage(latencyTrace, {
    stage: "final_narration",
    startedAt: visibleCallStart,
    endedAt: visibleCallEnded,
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
    startedAt: visibleCallStart,
    endedAt: visibleCallEnded,
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
    durationMs: visibleCallEnded - visibleCallStart,
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
    durationMs: visibleCallEnded - visibleCallStart,
  });
  log.info(
    `Visible narration complete: executedActions=${toolCallResults.length}, final=${narrativeText.length} chars, retried=${guardedNarration.retried}, failures=${lastVisibleFailures.join(",") || "none"}`,
  );

  if (narrativeText) {
    appendChatMessages(campaignId, [
      { role: "assistant", content: narrativeText },
    ]);
    yield { type: "narrative", data: { text: narrativeText } };
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
    sceneAssembly,
  };

  if (onPostTurn) {
    yield {
      type: "finalizing_turn",
      data: { tick: newTick, stage: "rollback_critical" },
    };

    await Promise.resolve(onPostTurn(summary));
  }

  yield {
    type: "scene-settling",
    data: { stage: "scene-settling", phase: "cleaning-transient-scene", tick: newTick },
  };
  const cleanupStart = Date.now();
  cleanupTransientSceneObjects(campaignId, newTick);
  recordTurnLatencyStage(latencyTrace, {
    stage: "transient_cleanup",
    startedAt: cleanupStart,
    metadata: { tick: newTick },
  });

  commitStagedWorldForecast(campaignId, stagedForecast);
  finishLatencyTrace();
  yield { type: "done", data: { tick: newTick } };
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
