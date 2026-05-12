import { z } from "zod";
import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger, withRole } from "../lib/index.js";
import { buildWorldBrainPromptContract } from "./prompt-contracts.js";
import { playerBlockingStageLimit, readRuntimeLimitMs } from "./runtime-limits.js";

const log = createLogger("world-brain");

export const WORLD_BRAIN_SITUATION_SUMMARY_MAX = 240;
export const WORLD_BRAIN_SCENE_QUESTION_MAX = 140;
export const WORLD_BRAIN_ACTOR_NAME_MAX = 80;
export const WORLD_BRAIN_PRESENCE_REASON_MAX = 180;
export const WORLD_BRAIN_CAUSAL_BEAT_MAX = 180;
export const WORLD_BRAIN_GUARDRAIL_MAX = 140;
export const WORLD_BRAIN_MAX_FOCAL_ACTORS = 3;
export const WORLD_BRAIN_MAX_BACKGROUND_ACTORS = 4;
export const WORLD_BRAIN_MAX_PRESENCE_REASONS = 6;
export const WORLD_BRAIN_MAX_CAUSAL_BEATS = 6;
export const WORLD_BRAIN_MAX_GUARDRAILS = 4;
export const WORLD_BRAIN_TIMEOUT_MS = playerBlockingStageLimit("WORLDFORGE_WORLD_BRAIN_TIMEOUT_MS");
export const WORLD_BRAIN_REPAIR_TIMEOUT_MS = readRuntimeLimitMs(
  [
    "WORLDFORGE_WORLD_BRAIN_REPAIR_TIMEOUT_MS",
    "WORLDFORGE_WORLD_BRAIN_TIMEOUT_MS",
    "WORLDFORGE_PLAYER_TURN_LLM_TIMEOUT_MS",
    "WF_PLAYER_BLOCKING_STAGE_TIMEOUT_MS",
  ],
  WORLD_BRAIN_TIMEOUT_MS,
);
export const WORLD_BRAIN_MAX_OUTPUT_TOKENS = 900;

const boundedString = (max: number) => z.string().trim().min(1).max(max);
const looseString = z.string().trim().min(1);

export const worldBrainPresenceReasonSchema = z.object({
  actorName: boundedString(WORLD_BRAIN_ACTOR_NAME_MAX),
  reason: boundedString(WORLD_BRAIN_PRESENCE_REASON_MAX),
  perceivable: z.boolean(),
}).strict();

export const worldBrainCausalBeatSchema = z.object({
  summary: boundedString(WORLD_BRAIN_CAUSAL_BEAT_MAX),
  perceivable: z.boolean(),
}).strict();

export const worldBrainSceneDirectionSchema = z.object({
  situationSummary: boundedString(WORLD_BRAIN_SITUATION_SUMMARY_MAX),
  sceneQuestion: boundedString(WORLD_BRAIN_SCENE_QUESTION_MAX),
  focalActorNames: z.array(boundedString(WORLD_BRAIN_ACTOR_NAME_MAX)).min(1).max(WORLD_BRAIN_MAX_FOCAL_ACTORS),
  backgroundActorNames: z.array(boundedString(WORLD_BRAIN_ACTOR_NAME_MAX)).max(WORLD_BRAIN_MAX_BACKGROUND_ACTORS),
  presenceReasons: z.array(worldBrainPresenceReasonSchema).max(WORLD_BRAIN_MAX_PRESENCE_REASONS),
  causalBeats: z.array(worldBrainCausalBeatSchema).max(WORLD_BRAIN_MAX_CAUSAL_BEATS),
  narrationGuardrails: z.array(boundedString(WORLD_BRAIN_GUARDRAIL_MAX)).max(WORLD_BRAIN_MAX_GUARDRAILS),
}).strict();

const worldBrainPresenceReasonLooseSchema = z.object({
  actorName: looseString,
  reason: looseString,
  perceivable: z.boolean(),
}).strict();

const worldBrainCausalBeatLooseSchema = z.object({
  summary: looseString,
  perceivable: z.boolean(),
}).strict();

export const worldBrainSceneDirectionLooseSchema = z.object({
  situationSummary: looseString,
  sceneQuestion: looseString,
  focalActorNames: z.array(looseString).min(1),
  backgroundActorNames: z.array(looseString),
  presenceReasons: z.array(worldBrainPresenceReasonLooseSchema),
  causalBeats: z.array(worldBrainCausalBeatLooseSchema),
  narrationGuardrails: z.array(looseString),
}).strict();

export type WorldBrainPresenceReason = z.infer<typeof worldBrainPresenceReasonSchema>;
export type WorldBrainCausalBeat = z.infer<typeof worldBrainCausalBeatSchema>;
export type WorldBrainSceneDirection = z.infer<typeof worldBrainSceneDirectionSchema>;
export type WorldBrainSceneDirectionCandidate = z.infer<typeof worldBrainSceneDirectionLooseSchema>;
export type WorldBrainRunSource = "player-turn" | "opening-scene";

export interface WorldBrainSceneSeed {
  runSource: WorldBrainRunSource;
  playerLabel: string;
  sceneName: string | null;
  sceneDescription: string | null;
  sceneTags: string[];
  immediateSituation: string | null;
  entryPressure: string[];
  openingPromptLines: string[];
  sceneContextLines: string[];
  clearActorNames: string[];
  hintSignals: string[];
  recentContextSummaries: string[];
  sceneEffectSummaries: string[];
  playerPerceivableConsequences: string[];
  playerAction?: string;
  intent?: string;
  method?: string;
  oracleOutcome?: string;
  targetLabel?: string | null;
}

const WORLD_BRAIN_SYSTEM_PROMPT = `You are the World Brain Judge for a living-world RPG.

Your job is to decide compact scene direction facts before visible narration is written.
Return structured scene-direction only. Do not write prose, dialogue, or lore exposition.

You must answer:
- what situation this scene is
- what question/tension is currently alive
- which named actors are actually focal
- why named actors are present
- which causal beats are already in play
- which of those beats are player-perceivable

Hard rules:
- Use only actor names from the supplied allow-list.
- Focal actors must come from the allow-list.
- Background actors must come from the allow-list and must not duplicate focal actors.
- If a hint exists without a clear identity, keep it inside causal beats or guardrails instead of inventing a named actor.
- narrationGuardrails are short factual constraints for the narrator, not style instructions.
- situationSummary must be <= 240 chars.
- sceneQuestion must be <= 140 chars.
- actor names must be <= 80 chars.
- presenceReasons.reason and causalBeats.summary must be <= 180 chars.
- each narrationGuardrail must be <= 140 chars.
- Stay bounded. Do not create a second story outline.
- Do not decide persistent state. Do not invent tool calls. Do not narrate outcomes beyond the supplied facts.`;

const WORLD_BRAIN_REPAIR_SYSTEM_PROMPT = `You repair structured world-brain scene-direction objects for a living-world RPG.

You are not writing prose. You are repairing a previously generated structured object so it satisfies exact field limits without losing the causal meaning of the scene.

Hard rules:
- Preserve the same situation, scene question, focal actors, background actors, and causal meaning unless the validation issues require a tighter rewrite.
- Do not invent new actors, beats, or facts.
- Prefer removing adjectives, subordinate clauses, and redundant detail before changing the core subject/action/tension.
- situationSummary must stay one compact sentence and <= 240 chars.
- sceneQuestion must stay one compact sentence and <= 140 chars.
- actor names must be <= 80 chars.
- presenceReasons.reason and causalBeats.summary must be <= 180 chars.
- each narrationGuardrail must be <= 140 chars.
- Return valid JSON only.`;

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  return unique;
}

function clampArray<T>(values: readonly T[], max: number): T[] {
  return values.slice(0, max);
}

function normalizeAllowedActorMap(allowedActorNames: readonly string[]): Map<string, string> {
  return new Map(uniqueStrings(allowedActorNames).map((name) => [name.toLowerCase(), name]));
}

function sanitizeActorNames(values: readonly string[], allowedActors: Map<string, string>, max: number): string[] {
  const sanitized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const canonical = allowedActors.get(value.trim().toLowerCase());
    if (!canonical) continue;
    const key = canonical.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    sanitized.push(canonical);
    if (sanitized.length >= max) break;
  }

  return sanitized;
}

export function sanitizeWorldBrainSceneDirection(
  direction: WorldBrainSceneDirectionCandidate,
  allowedActorNames: readonly string[],
): WorldBrainSceneDirectionCandidate {
  const allowedActors = normalizeAllowedActorMap(allowedActorNames);
  const focalActorNames = sanitizeActorNames(
    direction.focalActorNames,
    allowedActors,
    WORLD_BRAIN_MAX_FOCAL_ACTORS,
  );

  if (focalActorNames.length === 0) {
    throw new Error("World-brain returned no valid focal actors from the supplied allow-list.");
  }

  const focalKeys = new Set(focalActorNames.map((name) => name.toLowerCase()));
  const backgroundActorNames = sanitizeActorNames(
    direction.backgroundActorNames
      .map((name) => name.trim())
      .filter((name) => !focalKeys.has(name.trim().toLowerCase())),
    allowedActors,
    WORLD_BRAIN_MAX_BACKGROUND_ACTORS,
  );
  const visibleActorKeys = new Set(
    [...focalActorNames, ...backgroundActorNames].map((name) => name.toLowerCase()),
  );

  return {
    situationSummary: direction.situationSummary.trim(),
    sceneQuestion: direction.sceneQuestion.trim(),
    focalActorNames,
    backgroundActorNames,
    presenceReasons: clampArray(
      direction.presenceReasons
        .map((reason) => ({
          ...reason,
          actorName:
            allowedActors.get(
              reason.actorName.trim().toLowerCase(),
            ) ?? reason.actorName.trim(),
          reason: reason.reason.trim(),
        }))
        .filter((reason) => visibleActorKeys.has(reason.actorName.toLowerCase())),
      WORLD_BRAIN_MAX_PRESENCE_REASONS,
    ),
    causalBeats: clampArray(
      direction.causalBeats.map((beat) => ({
        ...beat,
        summary: beat.summary.trim(),
      })),
      WORLD_BRAIN_MAX_CAUSAL_BEATS,
    ),
    narrationGuardrails: clampArray(
      uniqueStrings(direction.narrationGuardrails.map((line) => line.trim())),
      WORLD_BRAIN_MAX_GUARDRAILS,
    ),
  };
}

function formatWorldBrainValidationIssues(
  issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>,
): string[] {
  return issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
}

function buildWorldBrainRepairPrompt(args: {
  allowedActorNames: readonly string[];
  candidate: WorldBrainSceneDirectionCandidate;
  issues: readonly string[];
}): string {
  return [
    `Allowed actor names: ${uniqueStrings(args.allowedActorNames).join(", ") || "(player only)"}`,
    "The previous world-brain object failed validation.",
    "Repair the object semantically so it fits the exact field limits while preserving the same scene meaning.",
    "Validation issues:",
    ...args.issues.map((issue) => `- ${issue}`),
    "Candidate JSON:",
    "```json",
    JSON.stringify(args.candidate, null, 2),
    "```",
    "Return only the repaired structured scene-direction object.",
  ].join("\n");
}

export function toPlayerPerceivableWorldBrainDirection(
  direction: WorldBrainSceneDirection,
): WorldBrainSceneDirection {
  const perceivableActorNames = new Set(
    direction.presenceReasons
      .filter((reason) => reason.perceivable)
      .map((reason) => reason.actorName.trim().toLowerCase()),
  );

  return {
    ...direction,
    focalActorNames: direction.focalActorNames.filter((name) =>
      perceivableActorNames.has(name.trim().toLowerCase()),
    ),
    backgroundActorNames: direction.backgroundActorNames.filter((name) =>
      perceivableActorNames.has(name.trim().toLowerCase()),
    ),
    presenceReasons: direction.presenceReasons.filter((reason) => reason.perceivable),
    causalBeats: direction.causalBeats.filter((beat) => beat.perceivable),
  };
}

function formatPresenceReasons(reasons: readonly WorldBrainPresenceReason[]): string {
  if (reasons.length === 0) {
    return "- None.";
  }
  return reasons.map((reason) => `- ${reason.actorName}: ${reason.reason}`).join("\n");
}

function formatCausalBeats(beats: readonly WorldBrainCausalBeat[]): string {
  if (beats.length === 0) {
    return "- None.";
  }
  return beats.map((beat) => `- ${beat.summary}`).join("\n");
}

export function formatHiddenWorldBrainDirectionBlock(
  direction: WorldBrainSceneDirection,
): string {
  return [
    "[WORLD-BRAIN SCENE DIRECTION]",
    `Situation summary: ${direction.situationSummary}`,
    `Scene question: ${direction.sceneQuestion}`,
    `Focal actors: ${direction.focalActorNames.join(", ")}`,
    `Background actors: ${direction.backgroundActorNames.length > 0 ? direction.backgroundActorNames.join(", ") : "none"}`,
    "Presence reasons:",
    formatPresenceReasons(direction.presenceReasons),
    "Causal beats:",
    formatCausalBeats(direction.causalBeats),
    "Narration guardrails:",
    direction.narrationGuardrails.length > 0
      ? direction.narrationGuardrails.map((line) => `- ${line}`).join("\n")
      : "- None.",
  ].join("\n");
}

export function formatPlayerPerceivableWorldBrainDirectionBlock(
  direction: WorldBrainSceneDirection,
): string {
  const visibleDirection = toPlayerPerceivableWorldBrainDirection(direction);
  return [
    "[SCENE DIRECTION]",
    `Situation summary: ${visibleDirection.situationSummary}`,
    `Scene question: ${visibleDirection.sceneQuestion}`,
    visibleDirection.focalActorNames.length > 0
      ? `Focal actors: ${visibleDirection.focalActorNames.join(", ")}`
      : null,
    visibleDirection.backgroundActorNames.length > 0
      ? `Background actors: ${visibleDirection.backgroundActorNames.join(", ")}`
      : null,
    "Presence reasons:",
    formatPresenceReasons(visibleDirection.presenceReasons),
    "Causal beats:",
    formatCausalBeats(visibleDirection.causalBeats),
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

export function formatWorldBrainNarrationGuardrails(
  direction: WorldBrainSceneDirection,
): string {
  return [
    "[NARRATION GUARDRAILS]",
    ...(direction.narrationGuardrails.length > 0
      ? direction.narrationGuardrails.map((line) => `- ${line}`)
      : ["- None."]),
  ].join("\n");
}

export function buildWorldBrainPrompt(seed: WorldBrainSceneSeed): string {
  const allowedActors = uniqueStrings([seed.playerLabel, ...seed.clearActorNames]);
  const lines = [
    `Run source: ${seed.runSource}`,
    `Allowed actor names: ${allowedActors.join(", ") || "(player only)"}`,
    `Current scene: ${seed.sceneName ?? "Unknown scene"}`,
    seed.sceneDescription ? `Scene description: ${seed.sceneDescription}` : null,
    seed.sceneTags.length > 0 ? `Scene tags: ${seed.sceneTags.join(", ")}` : null,
    seed.immediateSituation ? `Immediate situation: ${seed.immediateSituation}` : null,
    seed.entryPressure.length > 0 ? `Entry pressure: ${seed.entryPressure.join(", ")}` : null,
    seed.openingPromptLines.length > 0 ? `Opening prompt lines: ${seed.openingPromptLines.join(" | ")}` : null,
    seed.sceneContextLines.length > 0 ? `Scene context lines: ${seed.sceneContextLines.join(" | ")}` : null,
    seed.clearActorNames.length > 0 ? `Other clear actors: ${seed.clearActorNames.join(", ")}` : "Other clear actors: none",
    seed.hintSignals.length > 0 ? `Hint signals: ${seed.hintSignals.join(" | ")}` : null,
    seed.recentContextSummaries.length > 0 ? `Recent context: ${seed.recentContextSummaries.join(" | ")}` : null,
    seed.sceneEffectSummaries.length > 0 ? `Current scene effects: ${seed.sceneEffectSummaries.join(" | ")}` : null,
    seed.playerPerceivableConsequences.length > 0
      ? `Player-perceivable consequences: ${seed.playerPerceivableConsequences.join(" | ")}`
      : null,
    seed.playerAction ? `Player action: ${seed.playerAction}` : null,
    seed.intent ? `Intent: ${seed.intent}` : null,
    seed.method ? `Method: ${seed.method}` : null,
    seed.oracleOutcome ? `Resolved Oracle outcome: ${seed.oracleOutcome}` : null,
    seed.targetLabel ? `Resolved target label: ${seed.targetLabel}` : null,
  ].filter((line): line is string => Boolean(line));

  return [
    buildWorldBrainPromptContract(),
    "",
    lines.join("\n"),
    "",
    "Return only the bounded structured scene-direction object.",
  ].join("\n");
}

export async function runWorldBrainSceneDirection(args: {
  provider: ProviderConfig;
  seed: WorldBrainSceneSeed;
}): Promise<WorldBrainSceneDirection> {
  const allowedActorNames = uniqueStrings([args.seed.playerLabel, ...args.seed.clearActorNames]);
  const prompt = buildWorldBrainPrompt(args.seed);
  const model = createModel(args.provider, { role: "judge", reasoningMode: "bypass" });

  const result = await withRole("judge", () =>
    safeGenerateObject({
      model,
      schema: worldBrainSceneDirectionLooseSchema,
      temperature: 0,
      system: WORLD_BRAIN_SYSTEM_PROMPT,
      prompt,
      maxOutputTokens: WORLD_BRAIN_MAX_OUTPUT_TOKENS,
      timeout: { totalMs: WORLD_BRAIN_TIMEOUT_MS },
      mode: "native_json",
      retries: 1,
      allowTextFallback: false,
      allowRepair: false,
    }),
  );

  if (result.trace?.reasoningText) {
    log.event("world-brain.reasoning", {
      runSource: args.seed.runSource,
      reasoningText: result.trace.reasoningText,
      responseModel: result.trace.response?.modelId ?? null,
      usage: result.trace.usage ?? null,
    });
  }

  const normalized = sanitizeWorldBrainSceneDirection(result.object, allowedActorNames);
  const parsed = worldBrainSceneDirectionSchema.safeParse(normalized);
  if (parsed.success) {
    return parsed.data;
  }

  const issues = formatWorldBrainValidationIssues(parsed.error.issues);
  log.event("world-brain.repair", {
    runSource: args.seed.runSource,
    reason: "strict-parse-failed",
    issues,
  });

  const repaired = await withRole("judge", () =>
    safeGenerateObject({
      model,
      schema: worldBrainSceneDirectionSchema,
      temperature: 0,
      system: WORLD_BRAIN_REPAIR_SYSTEM_PROMPT,
      prompt: buildWorldBrainRepairPrompt({
        allowedActorNames,
        candidate: normalized,
        issues,
      }),
      maxOutputTokens: WORLD_BRAIN_MAX_OUTPUT_TOKENS,
      timeout: { totalMs: WORLD_BRAIN_REPAIR_TIMEOUT_MS },
      mode: "native_json",
      retries: 1,
      allowTextFallback: false,
      allowRepair: false,
    }),
  );

  if (repaired.trace?.reasoningText) {
    log.event("world-brain.reasoning", {
      runSource: args.seed.runSource,
      stage: "repair",
      reasoningText: repaired.trace.reasoningText,
      responseModel: repaired.trace.response?.modelId ?? null,
      usage: repaired.trace.usage ?? null,
    });
  }

  const repairedNormalized = sanitizeWorldBrainSceneDirection(repaired.object, allowedActorNames);
  return worldBrainSceneDirectionSchema.parse(repairedNormalized);
}
