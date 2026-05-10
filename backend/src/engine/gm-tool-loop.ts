import { generateText, stepCountIs } from "ai";

import { extractReasoningText } from "../ai/extract-reasoning-text.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger, withRole } from "../lib/index.js";
import type { OracleResult } from "./oracle.js";
import { collectToolCalls, type CollectedToolCall } from "./parse-helpers.js";
import type { GmRead } from "./gm-turn-read.js";
import {
  grantsClaimedAccessFromUnconfirmedProof,
  isUnconfirmedAccessProofClaim,
  UNCONFIRMED_ACCESS_CLAIM_TOOL_ERROR,
} from "./player-action-epistemics.js";
import {
  buildModelFacingSceneDiagnostics,
  buildModelFacingScenePacket,
  redactModelFacingJson,
  shouldDropModelFacingText,
} from "./model-facing-scene.js";
import type { SceneFrame } from "./scene-frame.js";
import {
  applySuccessfulToolObservationToExecutionContext,
  createPlayerTurnToolExecutionContext,
  type ToolExecutionContext,
} from "./tool-execution-context.js";
import { createStorytellerTools, type RuntimeToolName } from "./tool-schemas.js";
import type { ToolResult } from "./tool-executor.js";
import { isObservationToolResult } from "./tool-result.js";
import type { GmToolStepResult } from "./gm-tool-step.js";
import {
  dynamicCreationBudgetExceededError,
  dynamicCreationBudgetKey,
} from "./gm-tool-budget.js";
import type { ScopedForecastExcerpt } from "./world-forecast.js";
import { hasFutureRelevantConcretePressure } from "./future-relevant-pressure.js";

const log = createLogger("gm-tool-loop");

export const GM_TOOL_LOOP_MAX_STEPS = 12;

export interface RunGmToolLoopArgs {
  campaignId: string;
  provider: ProviderConfig;
  tick: number;
  playerAction: string;
  frame: SceneFrame;
  gmRead: Extract<GmRead, { path: "tool_plan" | "roll_oracle" | "combat_transition" }>;
  oracleResult?: OracleResult | null;
  scopedForecastExcerpt?: ScopedForecastExcerpt | null;
  recentConversation?: Array<{ role: string; content: string }>;
  maxOutputTokens?: number;
}

export interface GmToolLoopResult {
  intent: string;
  text: string;
  reasoningText?: string;
  stepResults: GmToolStepResult[];
  rawToolCalls: CollectedToolCall[];
}

function filterToolsToAllowed(
  tools: ReturnType<typeof createStorytellerTools>,
  allowedTools: readonly RuntimeToolName[],
): Partial<ReturnType<typeof createStorytellerTools>> {
  const allowed = new Set<RuntimeToolName>(allowedTools);
  return Object.fromEntries(
    Object.entries(tools).filter(([toolName]) => allowed.has(toolName as RuntimeToolName)),
  ) as Partial<ReturnType<typeof createStorytellerTools>>;
}

type StorytellerToolSet = ReturnType<typeof createStorytellerTools>;
type StorytellerToolDef = StorytellerToolSet[keyof StorytellerToolSet];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizePrivateGuardTerm(value: string): string {
  return value.trim().toLowerCase();
}

function collectInputStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.trim()) output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectInputStrings(entry, output));
    return output;
  }
  if (!isRecord(value)) return output;
  Object.values(value).forEach((entry) => collectInputStrings(entry, output));
  return output;
}

function toolInputContainsForbiddenPrivateTerm(
  input: unknown,
  forbiddenPrivateTerms: readonly string[],
): boolean {
  const normalizedTerms = forbiddenPrivateTerms
    .map(normalizePrivateGuardTerm)
    .filter(Boolean);
  if (normalizedTerms.length === 0) return false;
  return collectInputStrings(input).some((text) => {
    const normalizedText = text.toLowerCase();
    return normalizedTerms.some((term) => normalizedText.includes(term));
  });
}

function privateSourceBoundaryToolInputError(): string {
  return [
    "private_source_boundary_term_in_tool_input",
    "Tool input copied private/source-boundary wording into a state mutation.",
    "Rewrite using only visible/public terms or player-sourced claim wording; do not repeat hidden forecast terms.",
  ].join(": ");
}

function withPrivateSourceBoundaryGuard(
  tools: Partial<StorytellerToolSet>,
  forbiddenPrivateTerms: readonly string[],
): Partial<StorytellerToolSet> {
  if (forbiddenPrivateTerms.length === 0) return tools;

  return Object.fromEntries(
    Object.entries(tools).map(([toolName, toolDef]) => {
      if (!toolDef || typeof toolDef.execute !== "function") {
        return [toolName, toolDef];
      }

      const originalExecute = toolDef.execute.bind(toolDef) as (...args: unknown[]) => unknown;
      const wrappedTool = {
        ...toolDef,
        async execute(input: unknown, ...rest: unknown[]): Promise<ToolResult> {
          if (toolInputContainsForbiddenPrivateTerm(input, forbiddenPrivateTerms)) {
            return {
              success: false,
              error: privateSourceBoundaryToolInputError(),
            };
          }

          const result = await originalExecute(input, ...rest);
          return isToolResult(result)
            ? result
            : {
                success: false,
                error: "Tool result was not returned by the runtime source-boundary guard.",
              };
        },
      } as StorytellerToolDef;

      return [toolName, wrappedTool];
    }),
  ) as Partial<StorytellerToolSet>;
}

function withDynamicCreationBudget(
  tools: Partial<StorytellerToolSet>,
  executionContext: ToolExecutionContext,
): Partial<StorytellerToolSet> {
  const dynamicCreationKeys = new Set<string>();
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, toolDef]) => {
      if (!toolDef || typeof toolDef.execute !== "function") {
        return [toolName, toolDef];
      }

      const runtimeToolName = toolName as RuntimeToolName;
      const originalExecute = toolDef.execute.bind(toolDef) as (...args: unknown[]) => unknown;
      const wrappedTool = {
        ...toolDef,
        async execute(input: unknown, ...rest: unknown[]): Promise<ToolResult> {
          const candidateInput = isRecord(input) ? input : {};
          const budgetKey = dynamicCreationBudgetKey({
            toolName: runtimeToolName,
            input: candidateInput,
          });

          if (budgetKey && dynamicCreationKeys.has(budgetKey)) {
            return {
              success: false as const,
              error: dynamicCreationBudgetExceededError(),
            };
          }

          const result = await originalExecute(input, ...rest);
          if (!isToolResult(result)) {
            return {
              success: false,
              error: "Tool result was not returned by the runtime tool loop.",
            };
          }
          if (budgetKey && result.success) {
            dynamicCreationKeys.add(budgetKey);
          }
          applySuccessfulToolObservationToExecutionContext({
            toolName: runtimeToolName,
            result,
            context: executionContext,
          });
          return result;
        },
      } as StorytellerToolDef;

      return [toolName, wrappedTool];
    }),
  ) as Partial<StorytellerToolSet>;
}

function withUnconfirmedAccessClaimGuard(
  tools: Partial<StorytellerToolSet>,
  playerAction: string,
): Partial<StorytellerToolSet> {
  if (!isUnconfirmedAccessProofClaim(playerAction)) {
    return tools;
  }

  return Object.fromEntries(
    Object.entries(tools).map(([toolName, toolDef]) => {
      if (!toolDef || typeof toolDef.execute !== "function") {
        return [toolName, toolDef];
      }

      const runtimeToolName = toolName as RuntimeToolName;
      const originalExecute = toolDef.execute.bind(toolDef) as (...args: unknown[]) => unknown;
      const wrappedTool = {
        ...toolDef,
        async execute(input: unknown, ...rest: unknown[]): Promise<ToolResult> {
          if (grantsClaimedAccessFromUnconfirmedProof(runtimeToolName, input)) {
            return {
              success: false,
              error: UNCONFIRMED_ACCESS_CLAIM_TOOL_ERROR,
            };
          }

          const result = await originalExecute(input, ...rest);
          return isToolResult(result)
            ? result
            : {
                success: false,
                error: "Tool result was not returned by the runtime access-claim guard.",
              };
        },
      } as StorytellerToolDef;

      return [toolName, wrappedTool];
    }),
  ) as Partial<StorytellerToolSet>;
}

function formatRecentConversation(
  recentConversation?: readonly { role: string; content: string }[],
  forbiddenPrivateTerms: readonly string[] = [],
): string {
  if (!recentConversation || recentConversation.length === 0) {
    return "- none";
  }

  const forbiddenTerms = forbiddenPrivateTerms
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);

  const lines = recentConversation
    .slice(-8)
    .filter((entry) => {
      const content = entry.content.toLowerCase();
      return !forbiddenTerms.some((term) => content.includes(term));
    })
    .map((entry) => `- ${entry.role}: ${entry.content}`)
    .join("\n");

  return lines || "- none";
}

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

function buildCandidateRefsForPrompt(frame: SceneFrame): unknown {
  return {
    actors: [...frame.roster.active, ...frame.roster.support].map((actor) => ({
      id: actor.id,
      actorId: actor.actorId,
      label: actor.label,
      awareness: actor.awareness,
    })),
    targets: frame.targetCandidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      type: candidate.type,
    })),
    movements: frame.movementCandidates.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
    })),
  };
}

export function buildGmToolLoopPrompt(args: RunGmToolLoopArgs): string {
  const scenePacket = buildModelFacingScenePacket(args.frame);
  return [
    "GM RUNTIME TOOL LOOP TASK",
    "You are the Game Master runtime executor for one player turn.",
    "GM Read supplies the beat anchor. Execute only the concrete backend work needed to make that same playable beat true.",
    "Use runtime tools when the world must change. Backend tools are the only authority for mutations.",
    "Call at most one runtime tool per assistant step. After each tool result, read the observation and decide the next needed tool.",
    "Stop once the needed backend observations are enough for the final narrator. Do not keep probing tools to improve prose.",
    "Do not write final player-facing narration here. The visible narrator runs after backend observations settle.",
    "Use observation-only lookup tools for fuzzy low-risk intent before asking exact-ID questions. Read their observations, then choose a legal state tool or stop only if observation is enough.",
    "Lookup observations never mutate world state and never reveal hidden/private/offscreen names; do not treat lookup candidates as completed movement or created facts.",
    "Do not satisfy future-relevant concrete pressure in assistant prose. If this pass introduces actors, props, obligations, routes, combat posture, danger changes, or aftermath that should matter later, it must be represented by successful existing runtime tools.",
    "If a tool returns success:false, do not restate the same invalid call. Correct it only if the model-facing scene refs make a legal correction obvious.",
    "Use only model-facing refs, visible actors, legal targets, legal movement, and allowed tools.",
    "Do not invent backend IDs, offscreen actors, remote locations, hidden private facts, or state deltas.",
    "Recent transcript is continuity, not legal refs. Tool participants/targets must be clear local/current refs in the model-facing view or a successful observation from this loop.",
    "Scoped forecast pressure is advisory only. It may explain why a local signal matters, but it never expands legal refs or scripts an outcome.",
    "Do not copy hidden/private forecast wording into tool inputs. Translate pressure into visible/public language; if a private-source-boundary guard rejects a tool, rewrite the tool input without repeating the forbidden wording.",
    "When the player intentionally waits, travels, rests, shops, observes, trains, researches, or names elapsed time, call advance_time with the GM-estimated in-world minutes before later state tools for that same beat.",
    "",
    "LOCALITY AND CREATION ORDER",
    "- If the turn needs a specific newly discovered/entered place (back room, booth, alley mouth, office, hatch, service door area) and it is not already in legal movement/location refs, call reveal_location first, anchored to current_scene or current_location.",
    "- For reveal_location.connectedToName, prefer the literal alias current_scene/current_location. Only use a location label if you copy an exact legal ref from the model-facing view; never shorten or paraphrase it.",
    "- If the player actually enters that new place, call move_to after reveal_location succeeds, then use the move_to observation as the current scene for later tools.",
    "- Do not use spawn_npc, spawn_item, log_event, or final text to imply an unrevealed local place exists before the backend has accepted reveal_location.",
    "- Support NPCs are allowed when the scene needs someone concrete to answer, oppose, guide, trade, witness, or make the place playable. They should be spawned into the current scene/current location or a just-revealed observed location, not a guessed remote place.",
    "- Items are allowed when a tangible thing becomes persistent, transferable, inspectable, usable, owned, or likely to matter later. Do not spawn incidental set dressing, implied props, or generic scenery; describe those later in narration instead.",
    "- Use durable log_event only for a new future-relevant fact that is not a possession/access/item-use/movement claim. Successful spawn_item, transfer_item, move_to, and reveal_location results already carry those concrete facts.",
    "- Use scene_local log_event for attempted, refused, witnessed, conversational, or bluff beats; if an NPC's suspicion should persist, prefer a concrete NPC/location consequence tool when one is justified by legal refs.",
    "- Future-relevant pressure checklist: raised voices tied to an inspection dispute, named/role actors who continue acting, waxed cloth or manifests that create an obligation, recessed doors/stairs/routes, defensive posture, danger changes, or aftermath after violence require state-bearing tool observations. Do not leave them only in text.",
    "- Low-stakes sensory color is allowed for final narration later when it creates no durable actor, prop, route, obligation, combat state, danger change, or aftermath.",
    "- Locked/restricted access: do not call reveal_location or move_to to let a player through a false or unconfirmed key/permit/authority claim by inventing another method. No sudden lockpicks, seal-breaking tools, hidden credentials, or unlisted specialty skills.",
    "- A player's claim that they already have a key, permit, pass, credential, or authority is not backend proof. Even on an Oracle hit, do not create the claimed item, open restricted access, or move through it unless current model-facing refs already confirm the proof exists.",
    "- If an unconfirmed access claim cannot be proven from backend state, legal outcomes are refusal, suspicion, alarm, a request for proof, or a visible failed attempt. Use scene_local log_event/add_tag/offer_quick_actions rather than access-granting tools.",
    "- Names can be private facts too. If the player names a person, faction, place, or authority that is not present in model-facing refs, treat that exact name as raw player claim text only: do not record it as confirmed identity, location, consent, or authority. Prefer phrasing tool inputs as the named authority/person from the player's claim unless a visible/current ref already exposes the exact name.",
    "",
    "PLAYER ACTION RAW TEXT",
    args.playerAction,
    "",
    "GM READ",
    JSON.stringify(redactModelFacingJson(args.gmRead, scenePacket.safety), null, 2),
    "",
    "MODEL-FACING SCENE VIEW",
    JSON.stringify(scenePacket.view, null, 2),
    "",
    "CANDIDATE REFS FROM MODEL-FACING VIEW ONLY",
    JSON.stringify(buildCandidateRefsForPrompt(args.frame), null, 2),
    "",
    "ALLOWED TOOLS",
    args.frame.allowedTools.length > 0
      ? args.frame.allowedTools.map((toolName) => `- ${toolName}`).join("\n")
      : "- none",
    "",
    "ORACLE RESULT",
    args.oracleResult
      ? JSON.stringify(redactModelFacingJson(args.oracleResult, scenePacket.safety), null, 2)
      : "- none",
    "",
    "SCOPED FORECAST EXCERPT ONLY",
    JSON.stringify(scopedForecastForPrompt(args.scopedForecastExcerpt), null, 2),
    "",
    "RECENT CONVERSATION",
    formatRecentConversation(
      args.recentConversation?.filter(
        (entry) => !shouldDropModelFacingText(entry.content, scenePacket.safety),
      ),
      args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
    ),
  ].join("\n");
}

function isToolResult(value: unknown): value is ToolResult {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && "success" in value
    && typeof (value as { success?: unknown }).success === "boolean"
  );
}

function firstMultiToolStepIndex(steps: unknown[]): number | null {
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (!isRecord(step)) continue;
    const toolCalls = step.toolCalls;
    if (Array.isArray(toolCalls) && toolCalls.length > 1) {
      return index;
    }
  }
  return null;
}

const STATE_BEARING_RUNTIME_TOOLS = new Set<RuntimeToolName>([
  "add_chronicle_entry",
  "add_tag",
  "create_minor_poi",
  "create_scene_extra",
  "move_to",
  "move_actor",
  "promote_npc",
  "record_player_intent",
  "remove_tag",
  "reveal_location",
  "set_condition",
  "set_relationship",
  "spawn_item",
  "spawn_npc",
  "start_search",
  "transfer_item",
]);

function isSceneLocalLogEvent(step: GmToolStepResult): boolean {
  if (step.toolName !== "log_event") return false;
  const durabilityFromInput = isRecord(step.candidateInput)
    ? stringField(step.candidateInput, "durability")
    : null;
  const result = step.result?.result;
  const resultRecord = isRecord(result) ? result : null;
  const durabilityFromResult = resultRecord ? stringField(resultRecord, "durability") : null;
  if (durabilityFromInput === "durable" || durabilityFromResult === "durable") return false;
  if (resultRecord?.persisted === true) return false;
  return true;
}

function isAcceptedStateBearingObservation(step: GmToolStepResult): boolean {
  if (step.result?.success !== true) return false;
  if (!step.toolName) return false;
  if (STATE_BEARING_RUNTIME_TOOLS.has(step.toolName)) return true;
  if (step.toolName === "log_event") {
    return !isSceneLocalLogEvent(step);
  }
  return false;
}

function toolLoopTextHasFutureRelevantPressure(text: string): boolean {
  return hasFutureRelevantConcretePressure(text);
}

function assertToolLoopTextGroundedByStateBearingObservation(
  text: string,
  stepResults: readonly GmToolStepResult[],
): void {
  if (!toolLoopTextHasFutureRelevantPressure(text)) return;
  if (stepResults.some(isAcceptedStateBearingObservation)) return;
  throw new Error(
    "GM tool loop emitted future-relevant concrete pressure in prose without an accepted state-bearing backend observation.",
  );
}

function mutationRefsFromToolResult(result: ToolResult): string[] {
  if (isObservationToolResult(result)) return [];
  const refs = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string" && value.trim()) {
      refs.add(value.trim());
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (/id|name|ref/i.test(key)) {
        visit(entry);
      }
    }
  };

  visit(result.result);
  return [...refs].slice(0, 12);
}

function toToolStepResult(
  call: CollectedToolCall,
  index: number,
  tick: number,
  forbiddenPrivateTerms: readonly string[],
): GmToolStepResult {
  const toolResult = isToolResult(call.result)
    ? call.result
    : {
        success: false,
        error: "Tool result was not returned by the runtime tool loop.",
      };
  const input = (
    call.args && typeof call.args === "object" && !Array.isArray(call.args)
      ? call.args
      : {}
  ) as Record<string, unknown>;
  const toolName = call.tool as RuntimeToolName;

  return {
    stepId: `tool-call-${index + 1}`,
    attempt: 1,
    status: toolResult.success ? "done" : "skipped",
    toolName,
    candidateInput: input,
    validationError: toolResult.success
      ? null
      : {
          code: "tool_failed",
          message: toolResult.error ?? `${call.tool} failed.`,
          toolName,
        },
    visibleEffect: toolResult.success
      ? `${call.tool} settled through backend observation.`
      : "",
    privateGuardTerms: [...forbiddenPrivateTerms],
    mutationRefs: toolResult.success ? mutationRefsFromToolResult(toolResult) : [],
    settledAtTick: tick,
    result: toolResult,
  };
}

function gmToolLoopIntent(
  gmRead: RunGmToolLoopArgs["gmRead"],
): string {
  if (gmRead.path === "tool_plan") return gmRead.turnIntent;
  if (gmRead.path === "combat_transition") return gmRead.combatFraming;
  return gmRead.rollRequest.question;
}

export async function runGmToolLoop(
  args: RunGmToolLoopArgs,
): Promise<GmToolLoopResult> {
  if (args.frame.allowedTools.length === 0) {
    throw new Error("GM tool loop cannot run: SceneFrame exposes no allowed runtime tools.");
  }

  const model = createModel(args.provider, { role: "judge" });
  const executionContext = createPlayerTurnToolExecutionContext(args.frame);
  const allTools = createStorytellerTools(
    args.campaignId,
    args.tick,
    args.oracleResult?.outcome,
    executionContext,
  );
  const accessGuardedTools = withUnconfirmedAccessClaimGuard(
    filterToolsToAllowed(allTools, args.frame.allowedTools),
    args.playerAction,
  );
  const sourceBoundaryGuardedTools = withPrivateSourceBoundaryGuard(
    accessGuardedTools,
    args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
  );
  const tools = withDynamicCreationBudget(
    sourceBoundaryGuardedTools,
    executionContext,
  );
  const scenePacket = buildModelFacingScenePacket(args.frame);
  const prompt = buildGmToolLoopPrompt(args);
  const startMs = Date.now();

  log.event("model-facing.scene-packet", {
    source: "gm-tool-loop",
    ...buildModelFacingSceneDiagnostics(scenePacket),
  });

  const result = await withRole("judge", () =>
    generateText({
      model,
      tools,
      activeTools: args.frame.allowedTools,
      temperature: 0,
      maxOutputTokens: args.maxOutputTokens,
      maxRetries: 1,
      stopWhen: stepCountIs(GM_TOOL_LOOP_MAX_STEPS),
      system: [
        "You are the GM/Judge runtime tool agent.",
        "Your job is to make needed backend mutations through tools, one observed tool result at a time.",
        "Do not narrate to the player in this pass.",
      ].join(" "),
      prompt,
      experimental_onToolCallStart(event) {
        const toolCall = event.toolCall;
        if (!toolCall) return;
        log.event("gm-tool-loop.tool-call.start", {
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
        });
      },
      experimental_onToolCallFinish(event) {
        const toolCall = event.toolCall;
        if (!toolCall) return;
        log.event("gm-tool-loop.tool-call.finish", {
          success: event.success,
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          durationMs: event.durationMs,
        });
      },
    }),
  );

  const rawToolCalls = collectToolCalls(
    (result.steps ?? []) as unknown as Parameters<typeof collectToolCalls>[0],
  );
  const multiToolStepIndex = firstMultiToolStepIndex(result.steps ?? []);
  if (multiToolStepIndex !== null) {
    throw new Error(
      `GM tool loop emitted multiple runtime tool calls in assistant step ${multiToolStepIndex + 1}; call one tool, observe, then continue.`,
    );
  }
  const stepResults = rawToolCalls.map((call, index) =>
    toToolStepResult(
      call,
      index,
      args.tick,
      args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
    ));
  const successCount = stepResults.filter((step) => step.result?.success === true).length;
  const failureCount = stepResults.length - successCount;
  const reasoningText = extractReasoningText(result);

  log.event("judge.gm-tool-loop", {
    gmReadPath: args.gmRead.path,
    finishReason: result.finishReason,
    responseModel: result.response?.modelId ?? null,
    usage: result.usage ?? null,
    textLen: result.text.length,
    reasoningLen: reasoningText?.length ?? 0,
    stepCount: result.steps?.length ?? 0,
    toolCallCount: rawToolCalls.length,
    successCount,
    failureCount,
    toolCallNames: rawToolCalls.map((call) => call.tool),
    durationMs: Date.now() - startMs,
  });

  if (reasoningText) {
    log.event("judge.reasoning", {
      source: "gm-tool-loop",
      reasoningText,
      responseModel: result.response?.modelId ?? null,
      usage: result.usage ?? null,
    });
  }

  assertToolLoopTextGroundedByStateBearingObservation(result.text, stepResults);

  if (rawToolCalls.length === 0) {
    throw new Error("GM tool loop produced no runtime tool calls for a tool-backed GM path.");
  }
  if (successCount === 0) {
    throw new Error("GM tool loop produced no successful backend observations.");
  }

  return {
    intent: gmToolLoopIntent(args.gmRead),
    text: result.text,
    reasoningText,
    stepResults,
    rawToolCalls,
  };
}
