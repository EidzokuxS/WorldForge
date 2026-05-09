import { z } from "zod";

import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger, withRole } from "../lib/index.js";
import type { GmTurnDecision } from "./gm-turn-decision.js";
import {
  buildModelFacingSceneDiagnostics,
  buildModelFacingScenePacket,
  redactModelFacingJson,
  shouldDropModelFacingText,
  type ModelFacingScenePacket,
} from "./model-facing-scene.js";
import type { SceneFrame } from "./scene-frame.js";
import { runtimeToolInputSchemas, type RuntimeToolName } from "./tool-schemas.js";
import type { ScopedForecastExcerpt } from "./world-forecast.js";

const log = createLogger("gm-beat-plan");

export const GM_BEAT_PLAN_VERSION = "gm-beat-plan.v1";
export const GM_BEAT_PLAN_TEXT_MAX = 420;
export const GM_BEAT_PLAN_SHORT_TEXT_MAX = 180;
export const GM_BEAT_PLAN_REF_MAX = 160;
export const GM_BEAT_PLAN_REF_LIMIT = 8;
export const GM_BEAT_PLAN_ALTERNATIVE_LIMIT = 4;

const runtimeToolNames = Object.keys(runtimeToolInputSchemas) as [
  RuntimeToolName,
  ...RuntimeToolName[],
];

const runtimeToolNameSet = new Set<RuntimeToolName>(runtimeToolNames);

export const gmBeatPlanToolCategorySchema = z.enum([
  "memory",
  "relationship",
  "state",
  "world",
  "movement",
  "inventory",
  "contest",
  "ui",
]);

export const gmBeatPlanToolExecutionSchema = z.enum([
  "forbid_tools",
  "oracle_first",
  "require_tools",
  "combat_transition",
]);

const beatText = (max = GM_BEAT_PLAN_TEXT_MAX) => z.string().trim().min(1).max(max);
const beatRef = z.string().trim().min(1).max(GM_BEAT_PLAN_REF_MAX);

const executableKeyNames = new Set([
  "actionpayload",
  "conditiondelta",
  "durableevent",
  "hpdelta",
  "input",
  "inputpayload",
  "inventoryadd",
  "inventoryremove",
  "locationid",
  "narratorfacts",
  "parameters",
  "payload",
  "plannedactions",
  "plannedtools",
  "relationshipdelta",
  "runtimetool",
  "runtimetoolinput",
  "statedelta",
  "targetlocationid",
  "toolinput",
  "toolpayload",
  "worlddelta",
]);

function normalizeGuardKey(key: string): string {
  return key.replace(/[\s_-]/g, "").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function clippedText(
  value: unknown,
  fallback: string,
  max = GM_BEAT_PLAN_TEXT_MAX,
): string {
  const text = asString(value) ?? fallback;
  return text.length > max ? text.slice(0, max).trim() : text;
}

function stringArray(value: unknown, maxItems = GM_BEAT_PLAN_REF_LIMIT): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => asString(entry))
      .filter((entry): entry is string => Boolean(entry))
      .slice(0, maxItems)
      .map((entry) => clippedText(entry, entry, GM_BEAT_PLAN_REF_MAX));
  }

  const text = asString(value);
  return text ? [clippedText(text, text, GM_BEAT_PLAN_REF_MAX)] : [];
}

function enumValue<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  aliases: Record<string, T> = {},
): T {
  const text = asString(value)?.toLowerCase().replace(/[\s-]+/g, "_");
  if (!text) return fallback;
  if ((allowed as readonly string[]).includes(text)) return text as T;
  return aliases[text] ?? fallback;
}

function addExecutablePayloadIssues(
  value: unknown,
  ctx: z.RefinementCtx,
  path: Array<string | number> = [],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => addExecutablePayloadIssues(entry, ctx, [...path, index]));
    return;
  }

  if (!isRecord(value)) return;

  const normalizedKeys = new Set(Object.keys(value).map(normalizeGuardKey));
  if (
    (normalizedKeys.has("toolname") && normalizedKeys.has("input"))
    || (normalizedKeys.has("action") && normalizedKeys.has("payload"))
    || (normalizedKeys.has("operation") && normalizedKeys.has("payload"))
  ) {
    ctx.addIssue({
      code: "custom",
      message: "BeatPlan cannot contain executable tool/action payload objects.",
      path,
    });
  }

  for (const [key, nested] of Object.entries(value)) {
    if (executableKeyNames.has(normalizeGuardKey(key))) {
      ctx.addIssue({
        code: "custom",
        message: `BeatPlan cannot contain executable field "${key}".`,
        path: [...path, key],
      });
    }
    addExecutablePayloadIssues(nested, ctx, [...path, key]);
  }
}

function rejectExecutablePayloads<T extends z.ZodType>(schema: T): z.ZodPipe<z.ZodUnknown, T> {
  return z.unknown().superRefine(addExecutablePayloadIssues).pipe(schema);
}

const forecastInfluenceRefSchema = z
  .object({
    entryId: beatRef,
    influence: beatText(GM_BEAT_PLAN_SHORT_TEXT_MAX),
    force: z.enum(["pressure_only", "local_hint", "defer"]).default("pressure_only"),
  })
  .strict();

const beatLocalFocusSchema = z
  .object({
    actorRefs: z.array(beatRef).max(GM_BEAT_PLAN_REF_LIMIT).default([]),
    locationRefs: z.array(beatRef).max(GM_BEAT_PLAN_REF_LIMIT).default([]),
    sceneRefs: z.array(beatRef).max(GM_BEAT_PLAN_REF_LIMIT).default([]),
    evidenceRefs: z.array(beatRef).min(1).max(GM_BEAT_PLAN_REF_LIMIT),
  })
  .strict();

const revealBudgetSchema = z
  .object({
    mode: z.enum(["none", "hint", "reveal_local", "defer"]),
    playerFacingSummary: beatText(GM_BEAT_PLAN_SHORT_TEXT_MAX).optional(),
    privateRationale: beatText(GM_BEAT_PLAN_SHORT_TEXT_MAX),
  })
  .strict();

const agencyGuardrailsSchema = z
  .object({
    ifPlayerDoesNothing: beatText(GM_BEAT_PLAN_SHORT_TEXT_MAX),
    alternativesOpen: z
      .array(beatText(GM_BEAT_PLAN_SHORT_TEXT_MAX))
      .min(1)
      .max(GM_BEAT_PLAN_ALTERNATIVE_LIMIT),
    nonForcingGuidance: beatText(GM_BEAT_PLAN_SHORT_TEXT_MAX),
  })
  .strict();

const toolPostureSchema = z
  .object({
    execution: gmBeatPlanToolExecutionSchema,
    allowedCategories: z.array(gmBeatPlanToolCategorySchema).max(4).default([]),
    candidateTools: z.array(z.enum(runtimeToolNames)).max(runtimeToolNames.length).default([]),
  })
  .strict();

const narratorGuidanceSchema = z
  .object({
    playerFacingBeat: beatText(),
    settledFactsOnly: beatText(GM_BEAT_PLAN_SHORT_TEXT_MAX),
    tone: beatText(GM_BEAT_PLAN_SHORT_TEXT_MAX),
  })
  .strict();

const gmBeatPlanBaseSchema = z
  .object({
    version: z.literal(GM_BEAT_PLAN_VERSION),
    beatIntent: beatText(),
    whyNow: beatText(),
    localFocus: beatLocalFocusSchema,
    pacing: z.enum(["breathe", "press", "escalate", "resolve", "clarify"]),
    tensionPosture: z.enum(["low", "rising", "high", "release", "uncertain"]),
    revealBudget: revealBudgetSchema,
    forecastInfluenceRefs: z
      .array(forecastInfluenceRefSchema)
      .max(GM_BEAT_PLAN_REF_LIMIT)
      .default([]),
    agencyGuardrails: agencyGuardrailsSchema,
    toolPosture: toolPostureSchema,
    narratorGuidance: narratorGuidanceSchema,
    privateRationale: beatText(),
  })
  .strict();

function normalizeLocalFocus(value: unknown): z.input<typeof beatLocalFocusSchema> {
  if (isRecord(value)) {
    const evidenceRefs = stringArray(value.evidenceRefs);
    const descriptionRef = asString(value.description);
    return {
      actorRefs: stringArray(value.actorRefs),
      locationRefs: stringArray(value.locationRefs),
      sceneRefs: stringArray(value.sceneRefs),
      evidenceRefs: evidenceRefs.length > 0
        ? evidenceRefs
        : [clippedText(descriptionRef, "player_action", GM_BEAT_PLAN_REF_MAX)],
    };
  }

  return {
    actorRefs: [],
    locationRefs: [],
    sceneRefs: [],
    evidenceRefs: [clippedText(value, "player_action", GM_BEAT_PLAN_REF_MAX)],
  };
}

function normalizeRevealBudget(value: unknown): z.input<typeof revealBudgetSchema> {
  if (isRecord(value)) {
    return {
      mode: enumValue(value.mode, ["none", "hint", "reveal_local", "defer"], "hint", {
        ambient: "hint",
        describe: "hint",
        local: "reveal_local",
        reveal: "reveal_local",
        pressure_only: "hint",
        no_reveal: "none",
      }),
      playerFacingSummary: asString(value.playerFacingSummary)
        ? clippedText(value.playerFacingSummary, "", GM_BEAT_PLAN_SHORT_TEXT_MAX)
        : undefined,
      privateRationale: clippedText(
        value.privateRationale ?? value.rationale ?? value.description,
        "Keep reveal bounded to player-visible local facts.",
        GM_BEAT_PLAN_SHORT_TEXT_MAX,
      ),
    };
  }

  return {
    mode: "hint",
    playerFacingSummary: asString(value)
      ? clippedText(value, "", GM_BEAT_PLAN_SHORT_TEXT_MAX)
      : undefined,
    privateRationale: "Keep reveal bounded to player-visible local facts.",
  };
}

function normalizeAgencyGuardrails(value: unknown): z.input<typeof agencyGuardrailsSchema> {
  const fallbackAlternatives = [
    "Continue observing.",
    "Ask a follow-up question.",
    "Choose another action.",
  ];

  if (isRecord(value)) {
    return {
      ifPlayerDoesNothing: clippedText(
        value.ifPlayerDoesNothing ?? value.description ?? value.summary,
        "The scene remains open while local pressure continues.",
        GM_BEAT_PLAN_SHORT_TEXT_MAX,
      ),
      alternativesOpen: stringArray(value.alternativesOpen, GM_BEAT_PLAN_ALTERNATIVE_LIMIT)
        .map((entry) => clippedText(entry, entry, GM_BEAT_PLAN_SHORT_TEXT_MAX))
        .slice(0, GM_BEAT_PLAN_ALTERNATIVE_LIMIT)
        .concat(fallbackAlternatives)
        .slice(0, GM_BEAT_PLAN_ALTERNATIVE_LIMIT),
      nonForcingGuidance: clippedText(
        value.nonForcingGuidance ?? value.guidance ?? value.rules,
        "Do not force a route; keep the player's next choice open.",
        GM_BEAT_PLAN_SHORT_TEXT_MAX,
      ),
    };
  }

  return {
    ifPlayerDoesNothing: clippedText(
      value,
      "The scene remains open while local pressure continues.",
      GM_BEAT_PLAN_SHORT_TEXT_MAX,
    ),
    alternativesOpen: fallbackAlternatives,
    nonForcingGuidance: "Do not force a route; keep the player's next choice open.",
  };
}

function normalizeToolPosture(value: unknown): unknown {
  if (!isRecord(value)) return value;

  return {
    execution: enumValue(
      value.execution,
      ["forbid_tools", "oracle_first", "require_tools", "combat_transition"],
      "forbid_tools",
      {
        forbid: "forbid_tools",
        no_tools: "forbid_tools",
        tools_forbidden: "forbid_tools",
        require: "require_tools",
        tools_required: "require_tools",
        oracle: "oracle_first",
        roll: "oracle_first",
        combat: "combat_transition",
      },
    ),
    allowedCategories: stringArray(value.allowedCategories, 4),
    candidateTools: stringArray(value.candidateTools, runtimeToolNames.length),
  };
}

function normalizeNarratorGuidance(value: unknown): z.input<typeof narratorGuidanceSchema> {
  if (isRecord(value)) {
    return {
      playerFacingBeat: clippedText(
        value.playerFacingBeat ?? value.description ?? value.summary,
        "Resolve the immediate visible beat in concrete scene prose.",
      ),
      settledFactsOnly: clippedText(
        value.settledFactsOnly ?? value.factsOnly,
        "Only narrate settled player-visible facts.",
        GM_BEAT_PLAN_SHORT_TEXT_MAX,
      ),
      tone: clippedText(value.tone, "Grounded and concrete.", GM_BEAT_PLAN_SHORT_TEXT_MAX),
    };
  }

  return {
    playerFacingBeat: clippedText(
      value,
      "Resolve the immediate visible beat in concrete scene prose.",
    ),
    settledFactsOnly: "Only narrate settled player-visible facts.",
    tone: "Grounded and concrete.",
  };
}

function normalizeForecastInfluenceRefs(value: unknown): z.input<typeof forecastInfluenceRefSchema>[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, GM_BEAT_PLAN_REF_LIMIT)
    .flatMap((entry) => {
      if (isRecord(entry)) {
        const entryId = asString(entry.entryId ?? entry.id);
        if (!entryId) return [];
        return [{
          entryId: clippedText(entryId, entryId, GM_BEAT_PLAN_REF_MAX),
          influence: clippedText(
            entry.influence ?? entry.summary ?? entry.description,
            "Use as advisory pressure only.",
            GM_BEAT_PLAN_SHORT_TEXT_MAX,
          ),
          force: enumValue(
            entry.force,
            ["pressure_only", "local_hint", "defer"] as const,
            "pressure_only",
          ),
        }];
      }

      const entryId = asString(entry);
      if (!entryId) return [];
      return [{
        entryId: clippedText(entryId, entryId, GM_BEAT_PLAN_REF_MAX),
        influence: "Use as advisory pressure only.",
        force: "pressure_only" as const,
      }];
    });
}

function normalizeBeatPlanInput(value: unknown): unknown {
  if (!isRecord(value)) return value;

  return {
    version: GM_BEAT_PLAN_VERSION,
    beatIntent: asString(value.beatIntent ?? value.intent ?? value.summary)
      ? clippedText(value.beatIntent ?? value.intent ?? value.summary, "")
      : undefined,
    whyNow: asString(value.whyNow ?? value.rationale ?? value.reason)
      ? clippedText(value.whyNow ?? value.rationale ?? value.reason, "")
      : undefined,
    localFocus: Object.hasOwn(value, "localFocus")
      ? normalizeLocalFocus(value.localFocus)
      : undefined,
    pacing: enumValue(value.pacing, ["breathe", "press", "escalate", "resolve", "clarify"], "breathe", {
      descriptive: "breathe",
      describe: "breathe",
      explore: "breathe",
      exploratory: "breathe",
      continue: "press",
      advance: "press",
      answer: "resolve",
    }),
    tensionPosture: enumValue(value.tensionPosture, ["low", "rising", "high", "release", "uncertain"], "low", {
      calm: "low",
      quiet: "low",
      low_to_moderate: "rising",
      moderate: "rising",
      tense: "rising",
      ambiguous: "uncertain",
    }),
    revealBudget: Object.hasOwn(value, "revealBudget")
      ? normalizeRevealBudget(value.revealBudget)
      : undefined,
    forecastInfluenceRefs: normalizeForecastInfluenceRefs(value.forecastInfluenceRefs),
    agencyGuardrails: Object.hasOwn(value, "agencyGuardrails")
      ? normalizeAgencyGuardrails(value.agencyGuardrails)
      : undefined,
    toolPosture: Object.hasOwn(value, "toolPosture")
      ? normalizeToolPosture(value.toolPosture)
      : undefined,
    narratorGuidance: Object.hasOwn(value, "narratorGuidance")
      ? normalizeNarratorGuidance(value.narratorGuidance)
      : undefined,
    privateRationale: asString(value.privateRationale ?? value.rationale ?? value.whyNow)
      ? clippedText(value.privateRationale ?? value.rationale ?? value.whyNow, "")
      : undefined,
  };
}

export const gmBeatPlanSchema = rejectExecutablePayloads(
  z.preprocess(normalizeBeatPlanInput, gmBeatPlanBaseSchema),
);

export type GmBeatPlan = z.infer<typeof gmBeatPlanSchema>;
export type GmBeatPlanToolCategory = z.infer<typeof gmBeatPlanToolCategorySchema>;
export type GmBeatPlanToolExecution = z.infer<typeof gmBeatPlanToolExecutionSchema>;

export interface BeatPlanValidationIssue {
  code:
    | "tool_posture_mismatch"
    | "tool_category_mismatch"
    | "tool_not_allowed"
    | "forecast_ref_out_of_scope"
    | "private_forecast_term";
  path: string;
  message: string;
}

export interface ValidateBeatPlanForFrameArgs {
  beatPlan: GmBeatPlan;
  frame: SceneFrame;
  gmDecision: GmTurnDecision;
  scopedForecastExcerpt?: ScopedForecastExcerpt | null;
}

export interface RunGmBeatPlanArgs {
  provider: ProviderConfig;
  playerAction: string;
  frame: SceneFrame;
  gmDecision: GmTurnDecision;
  scopedForecastExcerpt?: ScopedForecastExcerpt | null;
  modelFacingScenePacket?: ModelFacingScenePacket;
  recentConversation?: Array<{ role: string; content: string }>;
  maxOutputTokens?: number;
}

export interface ScenePlannerBeatPlanProjection {
  version: typeof GM_BEAT_PLAN_VERSION;
  beatIntent: string;
  whyNow: string;
  localFocus: GmBeatPlan["localFocus"];
  pacing: GmBeatPlan["pacing"];
  tensionPosture: GmBeatPlan["tensionPosture"];
  forecastInfluenceRefs: GmBeatPlan["forecastInfluenceRefs"];
  agencyGuardrails: GmBeatPlan["agencyGuardrails"];
  toolPosture: GmBeatPlan["toolPosture"];
}

export interface NarratorBeatPlanProjection {
  version: typeof GM_BEAT_PLAN_VERSION;
  beatIntent: string;
  pacing: GmBeatPlan["pacing"];
  tensionPosture: GmBeatPlan["tensionPosture"];
  revealMode: GmBeatPlan["revealBudget"]["mode"];
  playerFacingReveal?: string;
  playerFacingBeat: string;
  settledFactsOnly: string;
  tone: string;
  agency: {
    ifPlayerDoesNothing: string;
    alternativesOpen: string[];
  };
}

function uniqueRuntimeTools(values: readonly RuntimeToolName[]): RuntimeToolName[] {
  return [...new Set(values)];
}

function uniqueCategories(values: readonly GmBeatPlanToolCategory[]): GmBeatPlanToolCategory[] {
  return [...new Set(values)];
}

export function runtimeToolCategory(toolName: RuntimeToolName): GmBeatPlanToolCategory {
  switch (toolName) {
    case "add_chronicle_entry":
    case "log_event":
      return "memory";
    case "set_relationship":
      return "relationship";
    case "add_tag":
    case "remove_tag":
    case "set_condition":
    case "promote_npc":
    case "advance_time":
      return "state";
    case "spawn_npc":
    case "spawn_item":
    case "reveal_location":
      return "world";
    case "request_contested_outcome":
      return "contest";
    case "move_to":
      return "movement";
    case "transfer_item":
      return "inventory";
    case "offer_quick_actions":
      return "ui";
  }
}

export function deriveBeatPlanToolPosture(decision: GmTurnDecision): GmBeatPlan["toolPosture"] {
  if (decision.path === "tool_plan") {
    const candidateTools = uniqueRuntimeTools(
      decision.plannedTools.map((tool) => tool.toolName),
    );
    return {
      execution: "require_tools",
      allowedCategories: uniqueCategories(candidateTools.map(runtimeToolCategory)),
      candidateTools,
    };
  }

  if (decision.path === "roll_oracle") {
    return {
      execution: "oracle_first",
      allowedCategories: [],
      candidateTools: [],
    };
  }

  if (decision.path === "combat_transition") {
    return {
      execution: "combat_transition",
      allowedCategories: [],
      candidateTools: [],
    };
  }

  return {
    execution: "forbid_tools",
    allowedCategories: [],
    candidateTools: [],
  };
}

function sorted<T extends string>(values: readonly T[]): T[] {
  return [...values].sort();
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  return sorted(left).join("\u0000") === sorted(right).join("\u0000");
}

function playerFacingBeatStrings(plan: GmBeatPlan): string[] {
  return [
    plan.beatIntent,
    plan.revealBudget.playerFacingSummary ?? "",
    plan.narratorGuidance.playerFacingBeat,
    plan.narratorGuidance.settledFactsOnly,
    plan.narratorGuidance.tone,
    plan.agencyGuardrails.ifPlayerDoesNothing,
    ...plan.agencyGuardrails.alternativesOpen,
  ].filter(Boolean);
}

function scenePlannerProjectionStrings(plan: GmBeatPlan): string[] {
  return [
    plan.beatIntent,
    plan.whyNow,
    ...plan.localFocus.actorRefs,
    ...plan.localFocus.locationRefs,
    ...plan.localFocus.sceneRefs,
    ...plan.localFocus.evidenceRefs,
    ...plan.forecastInfluenceRefs.flatMap((ref) => [ref.entryId, ref.influence]),
    plan.agencyGuardrails.ifPlayerDoesNothing,
    ...plan.agencyGuardrails.alternativesOpen,
    plan.agencyGuardrails.nonForcingGuidance,
  ].filter(Boolean);
}

function includesPrivateForecastTerm(
  value: string,
  forbiddenTerms: readonly string[],
): boolean {
  const normalizedValue = value.toLowerCase();
  return forbiddenTerms.some((term) => {
    const trimmed = term.trim();
    return trimmed.length > 0 && normalizedValue.includes(trimmed.toLowerCase());
  });
}

function redactPrivateForecastTerms(value: string, forbiddenTerms: readonly string[]): string {
  let redacted = value;
  for (const term of forbiddenTerms) {
    const trimmed = term.trim();
    if (!trimmed) continue;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    redacted = redacted.replace(new RegExp(escaped, "gi"), "[redacted]");
  }
  return redacted;
}

export function validateBeatPlanForFrame({
  beatPlan,
  frame,
  gmDecision,
  scopedForecastExcerpt,
}: ValidateBeatPlanForFrameArgs): BeatPlanValidationIssue[] {
  const issues: BeatPlanValidationIssue[] = [];
  const expectedPosture = deriveBeatPlanToolPosture(gmDecision);
  const allowedTools = new Set(frame.allowedTools);

  if (beatPlan.toolPosture.execution !== expectedPosture.execution) {
    issues.push({
      code: "tool_posture_mismatch",
      path: "toolPosture.execution",
      message: `BeatPlan tool execution ${beatPlan.toolPosture.execution} does not match GM decision path ${gmDecision.path}.`,
    });
  }

  if (!sameStringSet(beatPlan.toolPosture.candidateTools, expectedPosture.candidateTools)) {
    issues.push({
      code: "tool_posture_mismatch",
      path: "toolPosture.candidateTools",
      message: "BeatPlan candidateTools must match the GM decision tool posture exactly.",
    });
  }

  if (!sameStringSet(beatPlan.toolPosture.allowedCategories, expectedPosture.allowedCategories)) {
    issues.push({
      code: "tool_category_mismatch",
      path: "toolPosture.allowedCategories",
      message: "BeatPlan allowedCategories must match the GM decision tool categories exactly.",
    });
  }

  beatPlan.toolPosture.candidateTools.forEach((toolName, index) => {
    if (!runtimeToolNameSet.has(toolName) || !allowedTools.has(toolName)) {
      issues.push({
        code: "tool_not_allowed",
        path: `toolPosture.candidateTools.${index}`,
        message: `BeatPlan candidate tool ${toolName} is not allowed by the current SceneFrame.`,
      });
    }
  });

  const scopedForecastIds = new Set(
    scopedForecastExcerpt?.entries.map((entry) => entry.entryId) ?? [],
  );
  beatPlan.forecastInfluenceRefs.forEach((ref, index) => {
    if (!scopedForecastIds.has(ref.entryId)) {
      issues.push({
        code: "forecast_ref_out_of_scope",
        path: `forecastInfluenceRefs.${index}.entryId`,
        message: `BeatPlan forecast ref ${ref.entryId} is not present in the scoped forecast excerpt.`,
      });
    }
  });

  const forbiddenTerms = scopedForecastExcerpt?.forbiddenPrivateTerms ?? [];
  if (forbiddenTerms.length > 0) {
    const playerFacingText = playerFacingBeatStrings(beatPlan).join("\n");
    if (includesPrivateForecastTerm(playerFacingText, forbiddenTerms)) {
      issues.push({
        code: "private_forecast_term",
        path: "narratorGuidance",
        message: "BeatPlan player-facing fields contain a private forecast term.",
      });
    }

    scenePlannerProjectionStrings(beatPlan).forEach((text, index) => {
      if (includesPrivateForecastTerm(text, forbiddenTerms)) {
        issues.push({
          code: "private_forecast_term",
          path: `scenePlannerProjection.${index}`,
          message: "BeatPlan scene-planner projection contains a private forecast term.",
        });
      }
    });
  }

  return issues;
}

export function formatBeatPlanForScenePlanner(
  beatPlan: GmBeatPlan,
  forbiddenPrivateTerms: readonly string[] = [],
): ScenePlannerBeatPlanProjection {
  return {
    version: beatPlan.version,
    beatIntent: redactPrivateForecastTerms(beatPlan.beatIntent, forbiddenPrivateTerms),
    whyNow: redactPrivateForecastTerms(beatPlan.whyNow, forbiddenPrivateTerms),
    localFocus: {
      actorRefs: beatPlan.localFocus.actorRefs.map((ref) =>
        redactPrivateForecastTerms(ref, forbiddenPrivateTerms),
      ),
      locationRefs: beatPlan.localFocus.locationRefs.map((ref) =>
        redactPrivateForecastTerms(ref, forbiddenPrivateTerms),
      ),
      sceneRefs: beatPlan.localFocus.sceneRefs.map((ref) =>
        redactPrivateForecastTerms(ref, forbiddenPrivateTerms),
      ),
      evidenceRefs: beatPlan.localFocus.evidenceRefs.map((ref) =>
        redactPrivateForecastTerms(ref, forbiddenPrivateTerms),
      ),
    },
    pacing: beatPlan.pacing,
    tensionPosture: beatPlan.tensionPosture,
    forecastInfluenceRefs: beatPlan.forecastInfluenceRefs.map((ref) => ({
      ...ref,
      influence: redactPrivateForecastTerms(ref.influence, forbiddenPrivateTerms),
    })),
    agencyGuardrails: {
      ifPlayerDoesNothing: redactPrivateForecastTerms(
        beatPlan.agencyGuardrails.ifPlayerDoesNothing,
        forbiddenPrivateTerms,
      ),
      alternativesOpen: beatPlan.agencyGuardrails.alternativesOpen.map((text) =>
        redactPrivateForecastTerms(text, forbiddenPrivateTerms),
      ),
      nonForcingGuidance: redactPrivateForecastTerms(
        beatPlan.agencyGuardrails.nonForcingGuidance,
        forbiddenPrivateTerms,
      ),
    },
    toolPosture: beatPlan.toolPosture,
  };
}

export function formatBeatPlanForNarrator(
  beatPlan: GmBeatPlan,
): NarratorBeatPlanProjection {
  return {
    version: beatPlan.version,
    beatIntent: beatPlan.beatIntent,
    pacing: beatPlan.pacing,
    tensionPosture: beatPlan.tensionPosture,
    revealMode: beatPlan.revealBudget.mode,
    playerFacingReveal: beatPlan.revealBudget.playerFacingSummary,
    playerFacingBeat: beatPlan.narratorGuidance.playerFacingBeat,
    settledFactsOnly: beatPlan.narratorGuidance.settledFactsOnly,
    tone: beatPlan.narratorGuidance.tone,
    agency: {
      ifPlayerDoesNothing: beatPlan.agencyGuardrails.ifPlayerDoesNothing,
      alternativesOpen: beatPlan.agencyGuardrails.alternativesOpen,
    },
  };
}

export const projectBeatPlanForNarrator = formatBeatPlanForNarrator;

function scopedForecastForPrompt(
  scopedForecastExcerpt?: ScopedForecastExcerpt | null,
): Pick<ScopedForecastExcerpt, "version" | "baseTick" | "promptReady" | "entries"> | null {
  if (!scopedForecastExcerpt) return null;
  return {
    version: scopedForecastExcerpt.version,
    baseTick: scopedForecastExcerpt.baseTick,
    promptReady: scopedForecastExcerpt.promptReady,
    entries: scopedForecastExcerpt.entries,
  };
}

function formatRecentConversation(
  recentConversation?: readonly { role: string; content: string }[],
  scenePacket?: ModelFacingScenePacket,
  extraForbiddenTerms: readonly string[] = [],
): string {
  if (!recentConversation || recentConversation.length === 0) {
    return "- none";
  }

  const forbiddenTerms = extraForbiddenTerms
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);
  const lines = recentConversation
    .slice(-8)
    .filter((entry) => {
      if (scenePacket && shouldDropModelFacingText(entry.content, scenePacket.safety)) return false;
      const content = entry.content.toLowerCase();
      return !forbiddenTerms.some((term) => content.includes(term));
    })
    .map((entry) => `- ${entry.role}: ${entry.content}`)
    .join("\n");

  return lines || "- none";
}

function buildAllowedToolSummary(frame: SceneFrame, gmDecision: GmTurnDecision): unknown {
  const expectedPosture = deriveBeatPlanToolPosture(gmDecision);
  return {
    expectedPosture,
    frameAllowedTools: frame.allowedTools,
    categoriesByAllowedTool: Object.fromEntries(
      frame.allowedTools.map((toolName) => [toolName, runtimeToolCategory(toolName)]),
    ),
  };
}

function buildBeatPlanContract(): string {
  return [
    "STRUCTURED_OUTPUT_CONTRACT: gm-beat-plan.v1",
    "Return exactly one strict GM BeatPlan JSON object.",
    "BeatPlan is advisory to backend world state: it cannot mutate state, create facts, request rolls, or provide runtime tool inputs.",
    "BeatPlan is binding as current-beat intent: downstream ScenePlanner must honor toolPosture.execution, allowedCategories, and candidateTools.",
    'Required top-level fields: version, beatIntent, whyNow, localFocus, pacing, tensionPosture, revealBudget, forecastInfluenceRefs, agencyGuardrails, toolPosture, narratorGuidance, privateRationale.',
    'toolPosture.execution values: "forbid_tools", "oracle_first", "require_tools", "combat_transition".',
    'toolPosture.candidateTools may contain only RuntimeToolName strings already supplied in EXPECTED TOOL POSTURE.',
    "Do not include runtime tool input payloads anywhere. Forbidden fields include payload, plannedActions, toolInput, narratorFacts, durableEvent, hpDelta, stateDelta, worldDelta, input.",
    "Use scoped forecast excerpts only as pressure. Forecasts must not railroad the player or expand legal refs.",
    "Explain why this beat now, what happens if the player does nothing, and which alternatives remain open.",
    "Keep privateRationale out of narratorGuidance and revealBudget.playerFacingSummary.",
  ].join("\n");
}

function buildGmBeatPlanPrompt(args: RunGmBeatPlanArgs): string {
  const scenePacket = args.modelFacingScenePacket ?? buildModelFacingScenePacket(args.frame);
  return [
    "MODEL-FACING GM BEATPLAN CONTRACT",
    buildBeatPlanContract(),
    "",
    "PLAYER ACTION RAW TEXT",
    args.playerAction,
    "",
    "GM TURN DECISION",
    JSON.stringify(redactModelFacingJson(args.gmDecision, scenePacket.safety), null, 2),
    "",
    "MODEL-FACING LOCAL SCENE PACKET",
    JSON.stringify(scenePacket.view, null, 2),
    "",
    "SCOPED FORECAST EXCERPT ONLY",
    JSON.stringify(scopedForecastForPrompt(args.scopedForecastExcerpt), null, 2),
    "",
    "EXPECTED TOOL POSTURE AND CANDIDATES",
    JSON.stringify(buildAllowedToolSummary(args.frame, args.gmDecision), null, 2),
    "",
    "RECENT CONVERSATION",
    formatRecentConversation(
      args.recentConversation,
      scenePacket,
      args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
    ),
  ].join("\n");
}

export async function runGmBeatPlan(args: RunGmBeatPlanArgs): Promise<GmBeatPlan> {
  const model = createModel(args.provider, { role: "judge" });
  const scenePacket = args.modelFacingScenePacket ?? buildModelFacingScenePacket(args.frame);
  const system = [
    "You are the GM Beat Planner for one player turn.",
    "Return one BeatPlan JSON object only. Do not write prose, dialogue, markdown, tool input, state deltas, narratorFacts, or executable payloads.",
    "The GM decision path and expected tool posture are binding. Forecast excerpts are advisory pressure only.",
  ].join(" ");
  const prompt = buildGmBeatPlanPrompt({
    ...args,
    modelFacingScenePacket: scenePacket,
  });
  const startMs = Date.now();
  log.event("model-facing.scene-packet", {
    source: "gm-beat-plan",
    ...buildModelFacingSceneDiagnostics(scenePacket),
  });

  const result = await withRole("judge", () =>
    safeGenerateObject({
      model,
      schema: gmBeatPlanSchema,
      system,
      prompt,
      temperature: 0,
      maxOutputTokens: args.maxOutputTokens ?? 1100,
      retries: 1,
    }),
  );
  const issues = validateBeatPlanForFrame({
    beatPlan: result.object,
    frame: args.frame,
    gmDecision: args.gmDecision,
    scopedForecastExcerpt: args.scopedForecastExcerpt,
  });
  const trace = result.trace;
  log.event("judge.gm-beat-plan", {
    execution: result.object.toolPosture.execution,
    path: args.gmDecision.path,
    success: issues.length === 0,
    issueCount: issues.length,
    strategy: trace?.strategy ?? null,
    primaryStrategy: trace?.primaryStrategy ?? null,
    fallbackStrategy: trace?.fallbackStrategy ?? null,
    fallbackReason: trace?.fallbackReason ?? null,
    capability: trace?.capability ?? null,
    usage: trace?.usage ?? null,
    responseModel: trace?.response?.modelId ?? null,
    latencyMs: Date.now() - startMs,
  });

  if (issues.length > 0) {
    throw new Error(
      `GmBeatPlan validation failed:\n${issues
        .map((issue) => `- ${issue.path}: [${issue.code}] ${issue.message}`)
        .join("\n")}`,
    );
  }

  return result.object;
}
