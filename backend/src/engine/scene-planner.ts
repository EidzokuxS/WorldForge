import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger, withRole } from "../lib/index.js";
import type { NarrativeOutcomeBounds } from "./combat-envelope.js";
import type { GmRead } from "./gm-turn-read.js";
import type { GmTurnDecision } from "./gm-turn-decision.js";
import type { ScenePlannerBeatPlanProjection } from "./gm-beat-plan.js";
import type { OracleResult } from "./oracle.js";
import { buildScenePlannerPromptContract } from "./prompt-contracts.js";
import type { SceneFrame } from "./scene-frame.js";
import {
  buildModelFacingSceneDiagnostics,
  buildModelFacingScenePacket,
  buildModelFacingScenePromptView,
  oracleResultForModelPrompt,
  redactModelFacingJson,
  type ModelFacingPromptSafety,
  type ModelFacingScenePromptView,
} from "./model-facing-scene.js";
import {
  formatModelFacingPlayerActionText,
  formatModelFacingRecentConversation,
  sanitizeModelFacingConversationText,
  sanitizeModelFacingJson,
} from "./model-facing-conversation.js";
import {
  type ScenePlan,
} from "./scene-plan-schema.js";
import {
  SemanticScenePlanMappingError,
  semanticScenePlanSchema,
  semanticScenePlanToStrictPlan,
} from "./semantic-scene-plan-schema.js";

const log = createLogger("scene-planner");

export const SCENE_PLAN_TURN_ORDER = [
  "buildSceneFrame",
  "buildScopedForecastExcerpt",
  "runGmRead",
  "optional callOracle",
  "optional runGmToolLoop",
  "required actor decision pass",
  "buildNarratorPacket",
  "final narration",
  "commit staged world forecast",
] as const;

export const SCENE_PLAN_VISIBLE_CRITICAL_PATH_EXCLUSIONS = [
  "tickPresentNpcs",
] as const;

export const SCENE_PLAN_ROLLBACK_STAGES = [
  "runGmToolLoop",
  "retry",
  "rollback",
] as const;

export interface RunScenePlannerArgs {
  provider: ProviderConfig;
  frame: SceneFrame;
  playerAction: string;
  oracleResult?: (Pick<OracleResult, "outcome"> & Partial<OracleResult>) | null;
  gmDecision?: GmRead | GmTurnDecision;
  beatPlan?: ScenePlannerBeatPlanProjection;
  outcomeBounds?: NarrativeOutcomeBounds;
  recentConversation?: Array<{ role: string; content: string }>;
  forbiddenPrivateTerms?: string[];
  maxOutputTokens?: number;
}

function buildDefaultScenePlannerSystem(): string {
  return [
    "You are the local Scene Planner of Record.",
    "Return one semantic ScenePlan JSON object only. Do not write prose, dialogue, or markdown.",
    "GM decision path is binding for this turn. Oracle result is present only when requested and is binding. Do not choose or request a new Oracle outcome tier.",
    "GM decision rationale is advisory for current-beat intent; executable changes must still use concrete refs and allowed backend tools.",
    "Return actorRef values from allowed actor refs or labels; return toolName from ALLOWED TOOLS; backend will generate event/action/response/narrator IDs; do not output id/eventId/actionId/responseId/narratorFacts reference arrays.",
    "Return semantic local intent only: actionInterpretation actorRef/intent/method/targetRefs, responses actorRef/responseKind/visibleToPlayer/targetRefs, plannedActions actorRef/toolName/input, deferredHooks hookType/subjectRefs/reason, and hiddenRationale.",
  ].join(" ");
}

function formatActors(view: ModelFacingScenePromptView): string {
  const lines = view.visibleActors.map(
    (actor) => `- visible actorRef=${actor.ref} label=${actor.label} awareness=${actor.awareness}`,
  );

  return lines.length > 0 ? lines.join("\n") : "- none";
}

function formatRecentConversation(
  recentConversation?: readonly { role: string; content: string }[],
  safety?: ModelFacingPromptSafety,
  extraForbiddenTerms: readonly string[] = [],
): string {
  return formatModelFacingRecentConversation(recentConversation, {
    safety,
    extraForbiddenTerms,
  });
}

function buildDefaultScenePlannerPrompt(args: RunScenePlannerArgs): string {
  const scenePacket = buildModelFacingScenePacket(args.frame);
  const promptView = buildModelFacingScenePromptView(scenePacket.view);
  const oracleResult = oracleResultForModelPrompt(args.oracleResult);

  return [
    "MODEL-FACING SCENEPLAN CONTRACT",
    buildScenePlannerPromptContract({ allowedTools: args.frame.allowedTools }),
    "",
    "MODEL-FACING SCENE VIEW",
    JSON.stringify(promptView, null, 2),
    "",
    "GM READ",
    args.gmDecision
      ? JSON.stringify(redactModelFacingJson(args.gmDecision, scenePacket.safety), null, 2)
      : "- none provided",
    "",
    "GM BEAT PLAN PROJECTION",
    args.beatPlan
      ? JSON.stringify(redactModelFacingJson(args.beatPlan, scenePacket.safety), null, 2)
      : "- none provided",
    "",
    "ORACLE RESULT",
    oracleResult
      ? JSON.stringify(redactModelFacingJson(oracleResult, scenePacket.safety), null, 2)
      : "- none requested for this decision path",
    "",
    "ALLOWED ACTORS",
    formatActors(promptView),
    "",
    "ALLOWED TOOLS",
    args.frame.allowedTools.length > 0
      ? args.frame.allowedTools.map((toolName) => `- ${toolName}`).join("\n")
      : "- none",
    "",
    "OUTCOME BOUNDS",
    args.outcomeBounds
      ? JSON.stringify(redactModelFacingJson(args.outcomeBounds, scenePacket.safety), null, 2)
      : "- none",
    "",
    "RECENT CONVERSATION",
    formatRecentConversation(
      args.recentConversation,
      scenePacket.safety,
      args.forbiddenPrivateTerms ?? [],
    ),
    "",
    "SCENE PLAN TASK",
    `Player action: ${formatModelFacingPlayerActionText(args.playerAction, {
      safety: scenePacket.safety,
      extraForbiddenTerms: args.forbiddenPrivateTerms ?? [],
    })}`,
    "Honor the GM decision path. Direct, continue, and clarification may use plannedActions [] and no mutation. Tool/combat paths must use concrete refs/tools from candidates and ALLOWED TOOLS. Backend will map this to a strict ScenePlan before validation and execution.",
  ].join("\n");
}

function formatSemanticMappingIssues(error: SemanticScenePlanMappingError): string {
  if (error.issues.length === 0) {
    return "No semantic mapping issues.";
  }

  return error.issues
    .map((issue) => `- ${issue.path}: [${issue.code}] ${issue.message}`)
    .join("\n");
}

function parseSemanticScenePlan(candidate: unknown, frame: SceneFrame):
  | { success: true; plan: ScenePlan }
  | { success: false; issues: string } {
  try {
    return {
      success: true,
      plan: semanticScenePlanToStrictPlan(candidate, frame),
    };
  } catch (error) {
    if (error instanceof SemanticScenePlanMappingError) {
      return {
        success: false,
        issues: formatSemanticMappingIssues(error),
      };
    }

    return {
      success: false,
      issues: `- (root): ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function buildScenePlannerRepairPrompt(args: {
  candidate: unknown;
  issues: string;
  originalPrompt: string;
  safety: ModelFacingPromptSafety;
}): string {
  return [
    args.originalPrompt,
    "",
    "SEMANTIC SCENE PLAN REPAIR",
    "Reason: semantic-mapping-failed",
    "Validation issues:",
    sanitizeModelFacingConversationText(args.issues, {
      safety: args.safety,
      maxChars: 2000,
    }),
    "",
    "Candidate to repair:",
    JSON.stringify(
      sanitizeModelFacingJson(redactModelFacingJson(args.candidate, args.safety), {
        safety: args.safety,
        maxChars: 500,
      }),
      null,
      2,
    ),
    "",
    "Repair the semantic object shape once. Keep GM decision path and Oracle result binding. Return actorRef values from allowed actor refs or labels; return toolName from ALLOWED TOOLS; backend will generate event/action/response/narrator IDs.",
    "Do not add a roll request. ScenePlanner cannot trigger Oracle directly.",
  ].join("\n");
}

export async function runScenePlanner(
  args: RunScenePlannerArgs,
): Promise<ScenePlan> {
  const model = createModel(args.provider, { role: "judge" });
  const system = buildDefaultScenePlannerSystem();
  const prompt = buildDefaultScenePlannerPrompt(args);
  const scenePacket = buildModelFacingScenePacket(args.frame);
  log.event("model-facing.scene-packet", {
    source: "scene-planner",
    ...buildModelFacingSceneDiagnostics(scenePacket),
  });
  const result = await withRole("judge", () =>
    safeGenerateObject({
      model,
      schema: semanticScenePlanSchema,
      system,
      prompt,
      temperature: 0,
      maxOutputTokens: args.maxOutputTokens ?? 1400,
      retries: 1,
    }),
  );
  const parsed = parseSemanticScenePlan(result.object, args.frame);
  if (parsed.success) {
    return parsed.plan;
  }

  let repaired: { object: unknown };
  try {
    repaired = await withRole("judge", () =>
      safeGenerateObject({
        model,
        schema: semanticScenePlanSchema,
        system,
        prompt: buildScenePlannerRepairPrompt({
          candidate: result.object,
          issues: parsed.issues,
          originalPrompt: prompt,
          safety: scenePacket.safety,
        }),
        temperature: 0,
        maxOutputTokens: args.maxOutputTokens ?? 1400,
        retries: 1,
      }),
    );
  } catch (error) {
    throw new Error(
      `ScenePlan repair failed after semantic-mapping-failed.\nValidation issues:\n${parsed.issues}\nRepair error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!repaired || typeof repaired !== "object" || !("object" in repaired)) {
    throw new Error(
      `ScenePlan repair failed after semantic-mapping-failed.\nValidation issues:\n${parsed.issues}\nRepair error: repair call returned no object.`,
    );
  }
  const repairedParsed = parseSemanticScenePlan(repaired.object, args.frame);
  if (repairedParsed.success) {
    return repairedParsed.plan;
  }

  throw new Error(
    `ScenePlan repair failed after semantic-mapping-failed.\nValidation issues:\n${repairedParsed.issues}`,
  );
}
