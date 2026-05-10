import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger, withRole } from "../lib/index.js";
import {
  BRIDGE_LOOKUP_TOOL_NAMES,
  type BridgeLookupToolName,
} from "./bridge-candidate-tools.js";
import {
  BRIDGE_STATE_TOOL_NAMES,
  type BridgeStateToolName,
} from "./bridge-state-tools.js";
import {
  buildModelFacingScenePacket,
  type ModelFacingSceneView,
} from "./model-facing-scene.js";
import {
  gmReadSchema,
  validateGmReadForFrame,
  type GmRead,
} from "./gm-turn-read.js";
import { buildGmReadPromptContract } from "./prompt-contracts.js";
import type { SceneFrame } from "./scene-frame.js";
import type { ScopedForecastExcerpt } from "./world-forecast.js";

const log = createLogger("clarification-reviewer");

type ClarificationGmRead = Extract<GmRead, { path: "clarification" }>;
type RepairableGmRead = GmRead;

export type ClarificationParserLikePattern =
  | "connected_location"
  | "exact_location_or_route"
  | "exact_target_or_id"
  | "backend_target"
  | "russian_location"
  | "russian_exact_route"
  | "russian_connected_location";

export type ClarificationReviewReason =
  | "not_parser_like"
  | "materially_different_risk_or_cost"
  | "high_impact_or_irreversible"
  | "contradictory_intent"
  | "identity_critical_ambiguity"
  | "no_fair_bridge"
  | "bridgeable_parser_like_clarification"
  | "repair_returned_clarification";

export interface ClarificationBridgeAnalysis {
  bridgeCandidateCount: number;
  allowedLookupTools: BridgeLookupToolName[];
  allowedStateTools: BridgeStateToolName[];
  hasNavigationIntent: boolean;
  hasSearchOrServiceIntent: boolean;
  hasPublicRoleIntent: boolean;
}

export interface ClarificationReviewKeep {
  reviewed: true;
  repaired: false;
  reason: ClarificationReviewReason;
  parserLikePattern: ClarificationParserLikePattern | null;
  bridgeCandidateCount: number;
  gmRead: ClarificationGmRead;
}

export interface ClarificationReviewRepair {
  reviewed: true;
  repaired: true;
  reason: ClarificationReviewReason;
  parserLikePattern: ClarificationParserLikePattern;
  bridgeCandidateCount: number;
  originalGmRead: ClarificationGmRead;
  gmRead: RepairableGmRead;
}

export type ClarificationReviewResult = ClarificationReviewKeep | ClarificationReviewRepair;

export interface ReviewGmReadClarificationArgs {
  provider: ProviderConfig;
  playerAction: string;
  frame: SceneFrame;
  gmRead: ClarificationGmRead;
  scopedForecastExcerpt?: ScopedForecastExcerpt | null;
  recentConversation?: Array<{ role: string; content: string }>;
  maxOutputTokens?: number;
}

const parserLikePatterns: ReadonlyArray<{
  code: ClarificationParserLikePattern;
  pattern: RegExp;
}> = [
  {
    code: "connected_location",
    pattern: /\bwhich\s+(?:connected\s+)?location\b/i,
  },
  {
    code: "exact_location_or_route",
    pattern: /\bwhich\s+exact\s+(?:location|route|path|destination|way)\b/i,
  },
  {
    code: "exact_target_or_id",
    pattern: /\b(?:which|what|provide|give|need|requires?)\s+(?:the\s+)?exact\s+(?:target|id|name|location|route)\b/i,
  },
  {
    code: "backend_target",
    pattern: /\b(?:backend|route|location)\s+(?:target|ref|id|string)\b/i,
  },
  {
    code: "russian_location",
    pattern: /какая\s+локаци[яю]|какую\s+локаци[яю]/iu,
  },
  {
    code: "russian_exact_route",
    pattern: /какой\s+точн(?:ый|ого)?\s+маршрут|какой\s+именно\s+маршрут/iu,
  },
  {
    code: "russian_connected_location",
    pattern: /уточните\s+connected\s+location|connected\s+location/iu,
  },
];

const navigationIntentPattern =
  /\b(?:go|walk|head|move|travel|continue|route|path|follow|leave|enter)\b|(?:иду|пойду|идти|двигаюсь|двигаться|маршрут|дальше|дорог[аеуы]|путь)/iu;

const searchOrServiceIntentPattern =
  /\b(?:find|search|look\s+for|browse|shop|stall|vendor|tea|courier|desk|counter|service|clerk|market|kiosk)\b|(?:ищу|найти|поиск|чай|чайную|лавк|рынок|киоск|курьер|стойк|прилавок|продавец|служащ)/iu;

const publicRoleIntentPattern =
  /\b(?:vendor|clerk|guard|attendant|witness|local|crowd|courier|porter|service\s+worker)\b|(?:продавец|служащ|охранник|свидетел|местн|курьер|носильщик|толп)/iu;

const highImpactPattern =
  /\b(?:attack|kill|stab|shoot|poison|burn|destroy|steal|rob|kidnap|execute|sacrifice|detonate|irreversible|permanent)\b|(?:атак|уби(?:ть|ваю)|зарез|стрел|яд|отрав|сжечь|укра|ограб|похит|казн|взорв|навсегда|необрат)/iu;

const contradictoryIntentPattern =
  /\b(?:go|walk|move|leave|enter)\b.{0,80}\b(?:stay|wait|remain)\b|\b(?:stay|wait|remain)\b.{0,80}\b(?:go|walk|move|leave|enter)\b|(?:иду|пойду|двигаюсь).{0,80}(?:остаюсь|жду)|(?:остаюсь|жду).{0,80}(?:иду|пойду|двигаюсь)/iu;

const identityCriticalPattern =
  /\b(?:attack|strike|shoot|steal|pickpocket|poison|give|hand|use|unlock|restrain|follow)\b|(?:атак|удар|стрел|укра|отрав|дать|передать|использ|отпер|связ|след)/iu;

function findParserLikePattern(text: string): ClarificationParserLikePattern | null {
  for (const { code, pattern } of parserLikePatterns) {
    if (pattern.test(text)) return code;
  }
  return null;
}

function allowedBridgeTools(frame: SceneFrame): {
  lookup: BridgeLookupToolName[];
  state: BridgeStateToolName[];
} {
  const allowed = new Set(frame.allowedTools);
  return {
    lookup: BRIDGE_LOOKUP_TOOL_NAMES.filter((toolName) => allowed.has(toolName)),
    state: BRIDGE_STATE_TOOL_NAMES.filter((toolName) => allowed.has(toolName)),
  };
}

function hasAny(values: readonly string[], allowed: ReadonlySet<string>): boolean {
  return values.some((value) => allowed.has(value));
}

function countConnectedMovementCandidates(frame: SceneFrame): number {
  return frame.movementCandidates.filter((candidate) => candidate.connected !== false).length;
}

function hasMateriallyDifferentMovementCost(frame: SceneFrame): boolean {
  const costs = new Set(
    frame.movementCandidates
      .map((candidate) => candidate.travelCost)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
  );
  return costs.size > 1;
}

function actionText(args: {
  playerAction: string;
  gmRead: ClarificationGmRead;
}): string {
  return [
    args.playerAction,
    args.gmRead.actionInterpretation.intent,
    args.gmRead.actionInterpretation.method ?? "",
    args.gmRead.clarificationPrompt,
  ].join("\n");
}

export function analyzeClarificationBridge(args: {
  playerAction: string;
  frame: SceneFrame;
  gmRead: ClarificationGmRead;
}): ClarificationBridgeAnalysis {
  const text = actionText(args);
  const tools = allowedBridgeTools(args.frame);
  const allowedToolNames = new Set([...tools.lookup, ...tools.state]);
  const hasNavigationIntent = navigationIntentPattern.test(text);
  const hasSearchOrServiceIntent = searchOrServiceIntentPattern.test(text);
  const hasPublicRoleIntent = publicRoleIntentPattern.test(text);
  let bridgeCandidateCount = 0;

  if (
    hasNavigationIntent
    && hasAny(
      ["list_navigation_options", "find_location_candidates", "check_route", "move_actor"],
      allowedToolNames,
    )
  ) {
    bridgeCandidateCount += countConnectedMovementCandidates(args.frame);
  }

  if (
    hasSearchOrServiceIntent
    && hasAny(
      ["list_visible_affordances", "find_location_candidates", "find_object_candidates", "find_actor_candidates", "find_poi_candidates", "inspect_known_fact", "start_search"],
      allowedToolNames,
    )
  ) {
    bridgeCandidateCount += args.frame.targetCandidates.length;
  }

  if (
    hasSearchOrServiceIntent
    && hasAny(["find_poi_candidates", "create_minor_poi", "start_search"], allowedToolNames)
  ) {
    bridgeCandidateCount += 1;
  }

  if (hasPublicRoleIntent && allowedToolNames.has("create_scene_extra")) {
    bridgeCandidateCount += 1;
  }

  return {
    bridgeCandidateCount,
    allowedLookupTools: tools.lookup,
    allowedStateTools: tools.state,
    hasNavigationIntent,
    hasSearchOrServiceIntent,
    hasPublicRoleIntent,
  };
}

export function classifyClarificationReview(args: {
  playerAction: string;
  frame: SceneFrame;
  gmRead: ClarificationGmRead;
}): ClarificationReviewKeep | (Omit<ClarificationReviewRepair, "gmRead"> & { gmRead?: never }) {
  const parserLikePattern = findParserLikePattern(args.gmRead.clarificationPrompt);
  const bridge = analyzeClarificationBridge(args);
  const keep = (
    reason: ClarificationReviewReason,
  ): ClarificationReviewKeep => ({
    reviewed: true,
    repaired: false,
    reason,
    parserLikePattern,
    bridgeCandidateCount: bridge.bridgeCandidateCount,
    gmRead: args.gmRead,
  });

  if (!parserLikePattern) return keep("not_parser_like");

  const text = actionText(args);
  if (highImpactPattern.test(text)) return keep("high_impact_or_irreversible");
  if (contradictoryIntentPattern.test(text)) return keep("contradictory_intent");
  if (
    parserLikePattern === "connected_location"
    || parserLikePattern === "exact_location_or_route"
    || parserLikePattern === "russian_location"
    || parserLikePattern === "russian_exact_route"
    || parserLikePattern === "russian_connected_location"
  ) {
    if (args.frame.movementCandidates.length > 1 && hasMateriallyDifferentMovementCost(args.frame)) {
      return keep("materially_different_risk_or_cost");
    }
  }
  if (
    parserLikePattern === "exact_target_or_id"
    && args.frame.targetCandidates.length > 1
    && identityCriticalPattern.test(text)
  ) {
    return keep("identity_critical_ambiguity");
  }
  if (bridge.bridgeCandidateCount <= 0) return keep("no_fair_bridge");

  return {
    reviewed: true,
    repaired: true,
    reason: "bridgeable_parser_like_clarification",
    parserLikePattern,
    bridgeCandidateCount: bridge.bridgeCandidateCount,
    originalGmRead: args.gmRead,
  };
}

function candidateLabels(view: ModelFacingSceneView, frame: SceneFrame): string[] {
  const labels = [
    ...view.legalMovement.map((candidate) => candidate.label),
    ...view.legalTargets.map((candidate) => candidate.label),
    ...view.visibleActors.map((actor) => actor.label),
    frame.currentLocationName,
    frame.currentSceneScopeName,
  ];
  const seen = new Set<string>();
  return labels
    .map((label) => label?.trim())
    .filter((label): label is string => Boolean(label))
    .filter((label) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function groundedChoiceCount(text: string, frame: SceneFrame): number {
  const view = buildModelFacingScenePacket(frame).view;
  const normalized = text.toLowerCase();
  return candidateLabels(view, frame).filter((label) =>
    normalized.includes(label.toLowerCase()),
  ).length;
}

function isBoundedGroundedClarification(read: GmRead, frame: SceneFrame): boolean {
  if (read.path !== "clarification") return true;
  const count = groundedChoiceCount(read.clarificationPrompt, frame);
  return count >= 2 && count <= 3 && read.clarificationPrompt.includes("?");
}

export function buildClarificationRepairPrompt(
  args: ReviewGmReadClarificationArgs,
  classification: Omit<ClarificationReviewRepair, "gmRead"> & { gmRead?: never },
): string {
  const scenePacket = buildModelFacingScenePacket(args.frame);
  const bridge = analyzeClarificationBridge(args);
  return [
    "MODEL-FACING GM READ CLARIFICATION REPAIR",
    buildGmReadPromptContract({ allowedTools: args.frame.allowedTools }),
    "",
    "REVIEW FINDING",
    `parserLikePattern: ${classification.parserLikePattern}`,
    `bridgeCandidateCount: ${classification.bridgeCandidateCount}`,
    `allowedLookupTools: ${bridge.allowedLookupTools.join(", ") || "none"}`,
    `allowedStateTools: ${bridge.allowedStateTools.join(", ") || "none"}`,
    "",
    "REPAIR TASK",
    "Return one corrected GM Read JSON object.",
    "The current clarification asks for backend-like specificity even though the turn is bridgeable.",
    "Do not invent state, hidden facts, new refs, backend IDs, or concrete tool payloads.",
    "All state changes must still go through later bridge tools and existing backend validation.",
    "Preferred repair: choose tool_plan when lookup/state bridge tools should advance fuzzy low-risk movement, search, minor POI, support-extra, or intent recording.",
    "Allowed direct repair: answer with a diegetic bounded 2-3 choice response only when every option is grounded in listed visible candidates and no state is claimed.",
    "Allowed clarification repair: ask a bounded diegetic 2-3 choice question only when risk/cost/identity genuinely differs and each option is grounded in listed candidates.",
    "Do not ask for exact ids, backend targets, route ids, connected-location names, or raw backend strings.",
    "If legal candidates are materially similar, choose the best grounded candidate and proceed instead of asking the player to name backend details.",
    "",
    "PLAYER ACTION RAW TEXT",
    args.playerAction,
    "",
    "INVALID GM READ CLARIFICATION JSON",
    JSON.stringify(args.gmRead, null, 2),
    "",
    "MODEL-FACING SCENE VIEW",
    JSON.stringify(scenePacket.view, null, 2),
    "",
    "SCOPED FORECAST EXCERPT ONLY",
    JSON.stringify(args.scopedForecastExcerpt ?? null, null, 2),
    "",
    "RECENT CONVERSATION",
    args.recentConversation?.slice(-8).map((entry) => `- ${entry.role}: ${entry.content}`).join("\n")
      || "- none",
  ].join("\n");
}

export async function reviewGmReadClarification(
  args: ReviewGmReadClarificationArgs,
): Promise<ClarificationReviewResult> {
  const classification = classifyClarificationReview(args);
  if (!classification.repaired) {
    log.event("judge.gm-read.clarification-review", {
      reviewed: true,
      repaired: false,
      reason: classification.reason,
      parserLikePattern: classification.parserLikePattern,
      bridgeCandidateCount: classification.bridgeCandidateCount,
    });
    return classification;
  }

  const model = createModel(args.provider, { role: "judge" });
  const prompt = buildClarificationRepairPrompt(args, classification);
  const startedAt = Date.now();
  const result = await withRole("judge", () =>
    safeGenerateObject({
      model,
      schema: gmReadSchema,
      system: [
        "You repair one GM Read clarification after a parser-like clarification review.",
        "Return JSON only.",
        "Prefer a tool_plan for bridgeable low-risk fuzzy intent.",
        "No concrete runtime tool calls, no hidden facts, no backend IDs, no state invention.",
      ].join(" "),
      prompt,
      temperature: 0,
      maxOutputTokens: args.maxOutputTokens ?? 1500,
      retries: 1,
    }),
  );
  const repaired = result.object;
  const issues = validateGmReadForFrame(repaired, args.frame, args.playerAction);
  const repairedParserPattern =
    repaired.path === "clarification"
      ? findParserLikePattern(repaired.clarificationPrompt)
      : null;
  const boundedClarification = isBoundedGroundedClarification(repaired, args.frame);

  log.event("judge.gm-read.clarification-repair", {
    success: issues.length === 0 && !repairedParserPattern && boundedClarification,
    repairedPath: repaired.path,
    originalParserLikePattern: classification.parserLikePattern,
    repairedParserLikePattern: repairedParserPattern,
    bridgeCandidateCount: classification.bridgeCandidateCount,
    issueCount: issues.length,
    boundedClarification,
    strategy: result.trace?.strategy ?? null,
    primaryStrategy: result.trace?.primaryStrategy ?? null,
    fallbackStrategy: result.trace?.fallbackStrategy ?? null,
    fallbackReason: result.trace?.fallbackReason ?? null,
    responseModel: result.trace?.response?.modelId ?? null,
    usage: result.trace?.usage ?? null,
    latencyMs: Date.now() - startedAt,
  });

  if (issues.length > 0) {
    throw new Error(
      `GM Read clarification repair failed validation:\n${issues
        .map((issue) => `- ${issue.path}: ${issue.message}`)
        .join("\n")}`,
    );
  }
  if (repairedParserPattern) {
    throw new Error(
      `GM Read clarification repair still returned parser-like clarification: ${repairedParserPattern}`,
    );
  }
  if (!boundedClarification) {
    throw new Error("GM Read clarification repair returned an ungrounded or unbounded choice.");
  }

  return {
    reviewed: true,
    repaired: true,
    reason: repaired.path === "clarification"
      ? "repair_returned_clarification"
      : "bridgeable_parser_like_clarification",
    parserLikePattern: classification.parserLikePattern,
    bridgeCandidateCount: classification.bridgeCandidateCount,
    originalGmRead: args.gmRead,
    gmRead: repaired,
  };
}

export const clarificationReviewerTestHooks = {
  findParserLikePattern,
  groundedChoiceCount,
  parserLikePatterns,
};
