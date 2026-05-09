# Phase 70: Reactive Scene Resolution and Canonical Event Flow - Pattern Map

**Mapped:** 2026-04-25  
**Files analyzed:** 12 planned new/modified files  
**Analogs found:** 12 / 12  
**GitNexus status:** `npx gitnexus status` reported indexed commit `9e3cb4b` equals current commit `9e3cb4b`

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `backend/src/engine/scene-frame.ts` | service/utility | transform + CRUD reads | `backend/src/engine/scene-assembly.ts` + `backend/src/engine/scene-presence.ts` | exact |
| `backend/src/engine/scene-plan-schema.ts` | model/validator | request-response | `backend/src/engine/hidden-adjudication.ts` + `backend/src/engine/world-brain.ts` | exact |
| `backend/src/engine/scene-planner.ts` | service | structured LLM request-response | `backend/src/engine/world-brain.ts` | exact |
| `backend/src/engine/scene-plan-validator.ts` | validator/utility | transform | `backend/src/engine/world-brain.ts` + `backend/src/engine/scene-assembly.ts` | role-match |
| `backend/src/engine/scene-plan-executor.ts` | service | deterministic tool execution + CRUD writes | `backend/src/engine/hidden-adjudication.ts` | exact |
| `backend/src/engine/narrator-packet.ts` | service/utility | visibility transform | `backend/src/engine/scene-assembly.ts` + `backend/src/engine/prompt-assembler.ts` | exact |
| `backend/src/engine/prompt-assembler.ts` | prompt assembler | transform | existing `assembleFinalNarrationPrompt()` path | exact |
| `backend/src/engine/turn-processor.ts` | orchestrator | streaming + request-response | existing `processTurn()` | exact |
| `backend/src/routes/chat.ts` | route | SSE streaming + rollback-safe request-response | existing `/chat/action` and `/chat/retry` handlers | exact |
| `backend/src/engine/index.ts` | config/barrel | module export | existing engine barrel exports | exact |
| `backend/src/engine/__tests__/scene-plan*.test.ts` | test | structured output + executor regression | `hidden-adjudication.test.ts`, `world-brain.test.ts` | exact |
| `backend/src/routes/__tests__/chat.test.ts` | test | route/SSE/rollback regression | existing `chat.test.ts` | exact |

## Pattern Assignments

### `backend/src/engine/scene-frame.ts` (service/utility, transform + CRUD reads)

**Analog:** `backend/src/engine/scene-assembly.ts` and `backend/src/engine/scene-presence.ts`

**Imports pattern** (`scene-assembly.ts` lines 1-25):
```typescript
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { locations, npcs, players } from "../db/schema.js";
import {
  AWARENESS_BAND_CONTRACT,
  getObserverAwareness,
  inferPresenceVisibility,
  resolveScenePresence,
  resolveStoredSceneScopeId,
  type PresenceSnapshot,
} from "./scene-presence.js";
```

**Frame/assembly shape** (`scene-assembly.ts` lines 65-85):
```typescript
export interface SceneAssembly {
  openingScene: boolean;
  openingState: AuthoritativeOpeningState | null;
  currentScene: AuthoritativeSceneContext | null;
  presentNpcNames: string[];
  sceneDirection: WorldBrainSceneDirection | null;
  playerPerceivableSceneDirection: WorldBrainSceneDirection | null;
  awareness: {
    contract: typeof AWARENESS_BAND_CONTRACT;
    byNpcName: Record<string, "clear" | "hint" | "none">;
    clearNpcNames: string[];
    hintSignals: string[];
  };
  recentContext: Array<{ tick: number; summary: string; source: "location_recent_event" | "committed_event" }>;
  sceneEffects: SceneEffect[];
  playerPerceivableConsequences: string[];
}
```

**Presence/awareness contract** (`scene-presence.ts` lines 1-7, 31-38):
```typescript
export type AwarenessBand = "none" | "hint" | "clear";

export const AWARENESS_BAND_CONTRACT: Record<AwarenessBand, string> = {
  clear: "Full present-scene actor context. Identity and direct interaction are justified.",
  hint: "Bounded indirect presence signal only. No identity leakage in player-facing surfaces.",
  none: "Outside encounter scope for this consumer. Omit from player-facing prompt surfaces.",
};

export interface PresenceSnapshot {
  broadLocationId: string | null;
  sceneScopeId: string | null;
  presentActorIds: string[];
  awarenessByObserver: Record<string, Record<string, AwarenessBand>>;
  knowledgeBasisByObserver: Record<string, Record<string, KnowledgeBasis>>;
  playerAwarenessHints: string[];
}
```

**Roster computation pattern** (`scene-assembly.ts` lines 558-603):
```typescript
const snapshot = resolveScenePresence({
  playerActorId: player.id,
  broadLocationId,
  sceneScopeId: playerSceneScopeId,
  actors: [
    { actorId: player.id, actorType: "player", broadLocationId, sceneScopeId: playerSceneScopeId, visibility: "clear" },
    ...npcRows.map((npc) => {
      const visibility = inferPresenceVisibility(npc.tags);
      return {
        actorId: npc.id,
        actorType: "npc" as const,
        broadLocationId: npc.currentLocationId,
        sceneScopeId: npc.currentSceneLocationId,
        visibility: visibility.visibility,
        awarenessHint: visibility.awarenessHint,
      };
    }),
  ],
});

const clearNpcNames = npcRows
  .filter((npc) => snapshot.presentActorIds.includes(npc.id))
  .filter((npc) => getObserverAwareness(snapshot, player.id, npc.id) === "clear")
  .map((npc) => npc.name);
```

**Planner guidance:** Build `SceneFrame` as deterministic DB/state projection. Reuse `resolveScenePresence()` for active/support/background eligibility instead of broad-location-only membership.

---

### `backend/src/engine/scene-plan-schema.ts` (model/validator, request-response)

**Analog:** `backend/src/engine/hidden-adjudication.ts`

**Strict discriminated tool schema** (lines 10-37):
```typescript
export const ADJUDICATION_PLAN_ACTION_LIMIT = 8;
export const ADJUDICATION_PLAN_RATIONALE_MAX = 280;

export const adjudicationActionSchema = z.discriminatedUnion("toolName", [
  z.object({ toolName: z.literal("add_tag"), input: runtimeToolInputSchemas.add_tag }),
  z.object({ toolName: z.literal("remove_tag"), input: runtimeToolInputSchemas.remove_tag }),
  z.object({ toolName: z.literal("set_relationship"), input: runtimeToolInputSchemas.set_relationship }),
  z.object({ toolName: z.literal("add_chronicle_entry"), input: runtimeToolInputSchemas.add_chronicle_entry }),
  z.object({ toolName: z.literal("log_event"), input: runtimeToolInputSchemas.log_event }),
  z.object({ toolName: z.literal("offer_quick_actions"), input: runtimeToolInputSchemas.offer_quick_actions }),
  z.object({ toolName: z.literal("spawn_npc"), input: runtimeToolInputSchemas.spawn_npc }),
  z.object({ toolName: z.literal("spawn_item"), input: runtimeToolInputSchemas.spawn_item }),
  z.object({ toolName: z.literal("reveal_location"), input: runtimeToolInputSchemas.reveal_location }),
  z.object({ toolName: z.literal("set_condition"), input: runtimeToolInputSchemas.set_condition }),
  z.object({ toolName: z.literal("move_to"), input: runtimeToolInputSchemas.move_to }),
  z.object({ toolName: z.literal("transfer_item"), input: runtimeToolInputSchemas.transfer_item }),
]);

export const adjudicationPlanSchema = z.object({
  rationale: z.string().max(ADJUDICATION_PLAN_RATIONALE_MAX),
  actions: z.array(adjudicationActionSchema).max(ADJUDICATION_PLAN_ACTION_LIMIT),
});
```

**Bounded strict object pattern** (`world-brain.ts` lines 20-42):
```typescript
const boundedString = (max: number) => z.string().trim().min(1).max(max);

export const worldBrainSceneDirectionSchema = z.object({
  situationSummary: boundedString(WORLD_BRAIN_SITUATION_SUMMARY_MAX),
  sceneQuestion: boundedString(WORLD_BRAIN_SCENE_QUESTION_MAX),
  focalActorNames: z.array(boundedString(WORLD_BRAIN_ACTOR_NAME_MAX)).min(1).max(WORLD_BRAIN_MAX_FOCAL_ACTORS),
  backgroundActorNames: z.array(boundedString(WORLD_BRAIN_ACTOR_NAME_MAX)).max(WORLD_BRAIN_MAX_BACKGROUND_ACTORS),
  presenceReasons: z.array(worldBrainPresenceReasonSchema).max(WORLD_BRAIN_MAX_PRESENCE_REASONS),
  causalBeats: z.array(worldBrainCausalBeatSchema).max(WORLD_BRAIN_MAX_CAUSAL_BEATS),
  narrationGuardrails: z.array(boundedString(WORLD_BRAIN_GUARDRAIL_MAX)).max(WORLD_BRAIN_MAX_GUARDRAILS),
}).strict();
```

**Planner guidance:** `ScenePlan` schema should live near engine code, import `runtimeToolInputSchemas`, cap `plannedActions` at 8, cap `hiddenRationale` at 280, and use `.strict()` for every object.

---

### `backend/src/engine/scene-planner.ts` (service, structured LLM request-response)

**Analog:** `backend/src/engine/world-brain.ts`

**Structured LLM call + judge lane** (lines 365-381):
```typescript
export async function runWorldBrainSceneDirection(args: {
  provider: ProviderConfig;
  seed: WorldBrainSceneSeed;
}): Promise<WorldBrainSceneDirection> {
  const allowedActorNames = uniqueStrings([args.seed.playerLabel, ...args.seed.clearActorNames]);
  const prompt = buildWorldBrainPrompt(args.seed);
  const model = createModel(args.provider);

  const result = await withRole("judge", () =>
    safeGenerateObject({
      model,
      schema: worldBrainSceneDirectionLooseSchema,
      temperature: 0,
      system: WORLD_BRAIN_SYSTEM_PROMPT,
      prompt,
    }),
  );
```

**Strict parse + one repair pass** (`world-brain.ts` lines 392-431):
```typescript
const normalized = sanitizeWorldBrainSceneDirection(result.object, allowedActorNames);
const parsed = worldBrainSceneDirectionSchema.safeParse(normalized);
if (parsed.success) {
  return parsed.data;
}

const issues = formatWorldBrainValidationIssues(parsed.error.issues);
log.event("world-brain.repair", { runSource: args.seed.runSource, reason: "strict-parse-failed", issues });

const repaired = await withRole("judge", () =>
  safeGenerateObject({
    model,
    schema: worldBrainSceneDirectionSchema,
    temperature: 0,
    system: WORLD_BRAIN_REPAIR_SYSTEM_PROMPT,
    prompt: buildWorldBrainRepairPrompt({ allowedActorNames, candidate: normalized, issues }),
    retries: 2,
  }),
);

const repairedNormalized = sanitizeWorldBrainSceneDirection(repaired.object, allowedActorNames);
return worldBrainSceneDirectionSchema.parse(repairedNormalized);
```

**Safe object core** (`backend/src/ai/generate-object-safe.ts` lines 374-421, 463-507):
```typescript
async function attemptGenerate<T>(opts: SafeGenerateOpts<T>): Promise<SafeGenerateResult<T>> {
  const { schema } = opts;
  const schemaHint = describeZodShape(schema);
  const jsonSuffix =
    "\n\nYou MUST respond with valid JSON only. No explanations, no markdown, no text before or after the JSON object." +
    (schemaHint ? `\n\nThe JSON object MUST have EXACTLY these fields (use these exact names):\n${schemaHint}` : "");

  const result = await generateText(callOpts as Parameters<typeof generateText>[0]);
  const cleaned = extractJson(result.text);
  let parsed: unknown = JSON.parse(cleaned);
  parsed = coerceToSchema(parsed, schema);

  const direct = schema.safeParse(parsed);
  if (direct.success) {
    return { object: direct.data as T, trace };
  }
}

export async function safeGenerateObject<T>(opts: SafeGenerateOpts<T>): Promise<SafeGenerateResult<T>> {
  const maxAttempts = opts.retries ?? MAX_RETRIES;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await attemptGenerate(opts);
      log.event("llm.attempt", { attemptNum: attempt, success: true, usage: result.trace.usage ?? null });
      return result;
    } catch (err) {
      log.event("llm.attempt", { attemptNum: attempt, success: false, error: lastError.message.slice(0, 500) });
    }
  }
  throw lastError;
}
```

**Planner guidance:** `runScenePlanner()` should be a new judge-lane structured object call, not prose. Use loose schema only if a repair pass is needed, then strict schema parse before any execution.

---

### `backend/src/engine/scene-plan-validator.ts` (validator/utility, transform)

**Analog:** `backend/src/engine/world-brain.ts` and `backend/src/engine/scene-assembly.ts`

**Allowed actor sanitation** (`world-brain.ts` lines 152-186):
```typescript
function normalizeAllowedActorMap(allowedActorNames: readonly string[]): Map<string, string> {
  return new Map(uniqueStrings(allowedActorNames).map((name) => [name.toLowerCase(), name]));
}

function sanitizeActorNames(values: readonly string[], allowedActors: Map<string, string>, max: number): string[] {
  const sanitized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const canonical = allowedActors.get(value.trim().toLowerCase());
    if (!canonical) continue;
    if (seen.has(canonical.toLowerCase())) continue;
    seen.add(canonical.toLowerCase());
    sanitized.push(canonical);
    if (sanitized.length >= max) break;
  }

  return sanitized;
}
```

**Stale actor reconciliation** (`scene-assembly.ts` lines 153-180):
```typescript
const visibleActorNames = new Set(
  uniqueActorNames([
    options.playerLabel,
    ...options.presentNpcNames,
    ...options.sceneEffects.flatMap((effect) => [effect.actor, effect.target]),
  ]).map((name) => name.toLowerCase()),
);

const focalActorNames = uniqueActorNames(
  direction.focalActorNames.filter((name) => visibleActorNames.has(name.toLowerCase())),
);

return {
  ...direction,
  focalActorNames: focalActorNames.length > 0 ? focalActorNames : options.playerLabel ? [options.playerLabel] : direction.focalActorNames,
  backgroundActorNames,
  presenceReasons: direction.presenceReasons.filter((reason) =>
    visibleActorNames.has(reason.actorName.toLowerCase()),
  ),
};
```

**Planner guidance:** Implement validation as a separate boring function that returns issues. It must reject unknown actor IDs, hidden actor leakage in `narratorFacts`, unsupported tools, background actors performing scene-changing actions, and movement/tool args outside `SceneFrame.allowedTools`.

---

### `backend/src/engine/scene-plan-executor.ts` (service, deterministic tool execution + CRUD writes)

**Analog:** `backend/src/engine/hidden-adjudication.ts`

**Execute ordered plan through deterministic tool executor** (lines 127-195):
```typescript
export async function executeAdjudicationPlan(args: {
  campaignId: string;
  tick: number;
  outcomeTier?: string;
  plan: AdjudicationPlan;
}): Promise<ExecutedAdjudication> {
  const toolCallResults: ExecutedAdjudication["toolCallResults"] = [];
  const emittedEvents: ExecutedAdjudication["emittedEvents"] = [];
  let quickActionsEmitted = false;
  let successfulTravel: SuccessfulTravelLike | null = null;

  for (const action of args.plan.actions) {
    const toolResult = await executeToolCall(
      args.campaignId,
      action.toolName,
      action.input as Record<string, unknown>,
      args.tick,
      args.outcomeTier,
    );

    toolCallResults.push({ tool: action.toolName, args: action.input as Record<string, unknown>, result: toolResult });

    if (!toolResult.success) {
      throw new Error(`Adjudication action failed: ${action.toolName}${toolResult.error ? ` — ${toolResult.error}` : ""}`);
    }
```

**Tool result shape + logging** (`tool-executor.ts` lines 1174-1242):
```typescript
export async function executeToolCall(
  campaignId: string,
  toolName: string,
  args: Record<string, unknown>,
  tick: number,
  outcomeTier?: string
): Promise<ToolResult> {
  const toolCallStart = Date.now();
  let resultForLog: ToolResult = { success: false, error: "Tool execution did not complete" };
  try {
    switch (toolName) {
      case "add_tag":
        resultForLog = handleAddTag(campaignId, args);
        return resultForLog;
      case "move_to":
        resultForLog = handleMoveTo(campaignId, args, tick);
        return resultForLog;
      default:
        resultForLog = { success: false, error: `Unknown tool: ${toolName}` };
        return resultForLog;
    }
  } catch (error) {
    resultForLog = { success: false, error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}` };
    return resultForLog;
  } finally {
    log.event("tool.call", { toolName, args, result: resultForLog, latencyMs: Date.now() - toolCallStart });
  }
}
```

**Planner guidance:** New executor should accept `ScenePlan.plannedActions`, reuse `executeToolCall()`, preserve ordered execution, throw on first failed planned action, and project emitted events for SSE exactly like `executeAdjudicationPlan()`.

---

### `backend/src/engine/narrator-packet.ts` (service/utility, visibility transform)

**Analog:** `backend/src/engine/scene-assembly.ts`, `backend/src/engine/prompt-assembler.ts`, `backend/src/engine/storyteller-contract.ts`

**Filter hidden facts to player-perceivable packet** (`world-brain.ts` lines 260-267):
```typescript
export function toPlayerPerceivableWorldBrainDirection(
  direction: WorldBrainSceneDirection,
): WorldBrainSceneDirection {
  return {
    ...direction,
    presenceReasons: direction.presenceReasons.filter((reason) => reason.perceivable),
    causalBeats: direction.causalBeats.filter((beat) => beat.perceivable),
  };
}
```

**Final narration consumes assembled visible facts** (`prompt-assembler.ts` lines 1352-1415):
```typescript
export async function assembleFinalNarrationPrompt(options: {
  campaignId: string;
  contextWindow: number;
  sceneAssembly: SceneAssembly;
  outcomeBounds?: NarrativeOutcomeBounds;
  actionResult?: AssembleOptions["actionResult"];
  embedderResult?: ResolveResult;
  playerAction?: string;
  judgeRole?: ResolvedRole;
}): Promise<FinalNarrationPrompt> {
  const assembledBase = await assemblePrompt({
    campaignId: options.campaignId,
    contextWindow: options.contextWindow,
    storytellerPass: "final-visible",
    sceneAssembly: options.sceneAssembly,
    includeRecentConversation: true,
    actionResult: options.actionResult,
  });

  const prompt = [
    assembledBase.formatted,
    formatListSection("SCENE EFFECTS", options.sceneAssembly.sceneEffects.map(
      (effect) => `${effect.summary} [source=${effect.source}; kind=${effect.kind}; player-perceivable=${effect.perceivable ? "yes" : "no"}]`,
    ), "No authoritative scene effects were assembled."),
    formatListSection("PLAYER-PERCEIVABLE CONSEQUENCES", options.sceneAssembly.playerPerceivableConsequences, "No additional player-perceivable consequences are in scope."),
    `[FINAL NARRATION TASK]
Write one final narration pass from the settled opening state, current scene, scene effects, and player-perceivable consequences.
Do not invent material events outside these authoritative inputs.
Do not write tool syntax or metadata.
Keep the output bounded to what the player can perceive in this scene.`,
  ].join("\n\n");
```

**Storyteller visible contract** (`storyteller-contract.ts` lines 45-51):
```typescript
export const FINAL_VISIBLE_NARRATION_RULES = [
  "This is the final visible narration pass.",
  "Write one final narration from settled opening state, current scene facts, and player-perceivable scene effects.",
  "When [SCENE DIRECTION] and [NARRATION GUARDRAILS] are present, they are authoritative player-perceivable scene framing from the backend.",
  "Do not invent new material events, tool calls, or off-screen knowledge that is not already present in the assembled scene effects.",
  "Treat scene effects and opening state as authoritative bounded inputs for the final narration.",
].join(" ");
```

**Planner guidance:** New `NarratorPacket` should be an engine-owned projection and should not include `hiddenRationale`, failed tool plans, hidden actor names, or full DB rows.

---

### `backend/src/engine/turn-processor.ts` (orchestrator, streaming + request-response)

**Analog:** existing `processTurn()`

**Current critical path to replace** (lines 937-1055, 1097-1163):
```typescript
const sceneDirectionSeedAssembly = assembleAuthoritativeScene({ campaignId, currentLocationId: oracleLocationId, currentSceneScopeId, pendingEventTicks: [currentTick], toolCalls: [], openingScene: options.openingScene ?? false, playerLabel });
const sceneDirection = await runWorldBrainSceneDirection({ provider: judgeProvider, seed: buildSceneDirectionSeed(sceneDirectionSeedAssembly, { runSource: "player-turn", playerLabel, playerAction, intent, method, oracleOutcome: oracleResult.outcome, targetLabel: targetContext.targetLabel ?? null }) });

const adjudicationPrompt = await assembleJudgeAdjudicationPrompt({ campaignId, contextWindow, actionResult: oracleResult, embedderResult, playerAction, judgeRole: { provider: judgeProvider, temperature: 0.1, maxTokens: 1024 }, worldBrainDirection: sceneDirection, outcomeBounds: outcomeBounds ?? undefined });
const adjudicationResult = await withRole("judge", () => runHiddenAdjudicationPlan({ provider: judgeProvider, system: adjudicationPrompt.system, messages: adjudicationPrompt.messages, maxOutputTokens: storytellerMaxTokens }));
const executedPlan = await executeAdjudicationPlan({ campaignId, tick: currentTick, outcomeTier: oracleResult.outcome, plan: adjudicationPlan });

const hiddenSummary: HiddenTurnSummary = { currentTick, predictedTick, currentLocationId, currentSceneScopeId, oracleResult, toolCalls: toolCallResults, openingScene: options.openingScene ?? false, sceneDirection };
if (options.onBeforeVisibleNarration) {
  await withTimeout(Promise.resolve(options.onBeforeVisibleNarration(hiddenSummary)), TURN_FINALIZATION_TIMEOUT_MS, "Local scene settlement timed out before final narration.");
}

const sceneAssembly = assembleAuthoritativeScene({ campaignId, currentLocationId, currentSceneScopeId, pendingEventTicks: [currentTick, predictedTick], toolCalls: toolCallResults, openingScene: options.openingScene ?? false, playerLabel, sceneDirection });
const finalNarrationPrompt = await assembleFinalNarrationPrompt({ campaignId, contextWindow, sceneAssembly, outcomeBounds: outcomeBounds ?? undefined, actionResult: oracleResult, embedderResult, playerAction, judgeRole: { provider: judgeProvider, temperature: 0.1, maxTokens: 1024 } });
```

**Keep streaming event order** (lines 1088-1095, 1144-1151, 1240-1253):
```typescript
yield { type: "scene-settling", data: { stage: "scene-settling", phase: "local-present-scene", tick: predictedTick } };

yield { type: "scene-settling", data: { stage: "scene-settling", phase: options.openingScene ? "opening-final-narration" : "final-narration", opening: options.openingScene ?? false } };

if (onPostTurn) {
  yield { type: "finalizing_turn", data: { tick: newTick, stage: "rollback_critical" } };
  await withTimeout(Promise.resolve(onPostTurn(summary)), TURN_FINALIZATION_TIMEOUT_MS, "Rollback-critical finalization timed out.");
}

yield { type: "done", data: { tick: newTick } };
```

**Planner guidance:** Replace `runWorldBrainSceneDirection()` + `runHiddenAdjudicationPlan()` + pre-visible `onBeforeVisibleNarration()` with `buildSceneFrame()` -> `runScenePlanner()` -> `validateScenePlan()` -> `executeScenePlan()` -> `buildNarratorPacket()`. Keep Oracle before planner for Phase 70A.

---

### `backend/src/routes/chat.ts` (route, SSE streaming + rollback-safe request-response)

**Analog:** existing `/chat/action` and `/chat/retry`

**Route validation and turn lock** (lines 524-536):
```typescript
app.post("/action", async (c) => {
  let turnStartedForCampaign: string | null = null;
  try {
    const result = await parseBody(c, chatActionBodySchema);
    if ("response" in result) return result.response;

    const { campaignId, playerAction, intent, method } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;
    if (!tryBeginTurn(campaignId)) {
      return c.json({ error: "The world is still settling. Wait for the turn to finish." }, 409);
    }
    turnStartedForCampaign = campaignId;
```

**Snapshot + restore on failure** (lines 579-580, 656-667, 694-706):
```typescript
// Capture pre-turn snapshot for potential undo/retry
const snapshot = await captureSnapshot(campaignId);

// Turn completed successfully -- store snapshot for potential undo/retry
setLastTurnSnapshot(campaignId, snapshot);
} catch (error) {
  outcome = "restored";
  try {
    await restoreSnapshot(campaignId, snapshot);
  } catch (restoreError) {
    outcome = "error";
    log.error("Failed to restore pre-turn boundary after action failure", restoreError);
  }
  clearLastTurnSnapshot(campaignId);
  await stream.writeSSE({ event: "error", data: JSON.stringify({ error: getErrorMessage(error, "Turn processing failed.") }) });
} finally {
  endTurn(campaignId);
  turnStartedForCampaign = null;
}
```

**Current seam to remove from visible path** (lines 136-158, 297-304, 622-627):
```typescript
async function runLocalPresentSceneSettlement(
  settings: Settings,
  campaignId: string,
  judgeProvider: ProviderConfig,
  summary: HiddenTurnSummary,
): Promise<void> {
  const sceneScopeId = summary.currentSceneScopeId ?? summary.currentLocationId;
  if (!sceneScopeId) return;

  await tickPresentNpcs(campaignId, summary.predictedTick, judgeProvider, summary.currentLocationId ?? sceneScopeId, sceneScopeId, embedderProvider);
}

function buildOnBeforeVisibleNarration(...): ((summary: HiddenTurnSummary) => Promise<void>) | undefined {
  return async (summary: HiddenTurnSummary) => {
    await runLocalPresentSceneSettlement(settings, campaignId, judgeProvider, summary);
  };
}
```

**Planner guidance:** Route should keep `tryBeginTurn()`, `captureSnapshot()`, SSE streaming, `restoreSnapshot()` and retry behavior. It should stop injecting `tickPresentNpcs()` into the normal visible-turn critical path.

---

### `backend/src/engine/prompt-assembler.ts` (prompt assembler, visibility transform)

**Analog:** existing `assemblePrompt()` + `assembleFinalNarrationPrompt()`

**Hidden vs final-visible section split** (lines 123-160, 1192-1203):
```typescript
function buildHiddenWorldBrainDirectionSection(
  storytellerPass: StorytellerPass,
  direction?: WorldBrainSceneDirection | null,
): PromptSection | null {
  if (!direction) return null;
  if (storytellerPass === "final-visible") return null;
  const content = formatHiddenWorldBrainDirectionBlock(direction);
  return { name: "WORLD-BRAIN DIRECTION", priority: 3, content, estimatedTokens: estimateTokens(content), canTruncate: false };
}

const effectiveWorldBrainDirection =
  storytellerPass === "final-visible"
    ? sceneAssembly?.playerPerceivableSceneDirection ?? null
    : worldBrainDirection ?? sceneAssembly?.sceneDirection ?? null;
const hiddenWorldBrainSection = buildHiddenWorldBrainDirectionSection(storytellerPass, effectiveWorldBrainDirection);
const visibleWorldBrainSections =
  storytellerPass === "final-visible"
    ? buildVisibleWorldBrainSections(effectiveWorldBrainDirection)
    : [];
```

**Encounter scope filtering** (lines 810-835, 853-867):
```typescript
const clearActors =
  encounter.snapshot && encounter.playerId
    ? encounter.npcRows
        .filter((npc) => encounter.snapshot?.presentActorIds.includes(npc.id))
        .filter((npc) => getObserverAwareness(encounter.snapshot!, encounter.playerId!, npc.id) === "clear")
        .map((npc) => npc.name)
    : [];

const npcRows =
  snapshot && playerId
    ? encounter.npcRows.filter((npc) => {
        if (!snapshot.presentActorIds.includes(npc.id)) return false;
        const awareness = getObserverAwareness(snapshot, playerId, npc.id);
        return storytellerPass === "hidden-tool-driving"
          ? awareness !== "none"
          : awareness === "clear";
      })
    : [];
```

**Planner guidance:** Add `NarratorPacket` input to final narration rather than raw `ScenePlan`. Keep hidden planner data out of `storytellerPass: "final-visible"`.

---

## Shared Patterns

### Structured Model Output
**Source:** `backend/src/engine/world-brain.ts`, `backend/src/ai/generate-object-safe.ts`  
**Apply to:** `scene-plan-schema.ts`, `scene-planner.ts`, tests

Use Zod `.strict()`, bounded strings/arrays, `safeGenerateObject()`, `safeParse()`, logged repair, and one strict repair pass. Do not execute a model object before strict validation succeeds.

### Deterministic Tool Execution
**Source:** `backend/src/engine/hidden-adjudication.ts`, `backend/src/engine/tool-executor.ts`, `backend/src/engine/tool-schemas.ts`  
**Apply to:** `scene-plan-executor.ts`, `scene-plan-validator.ts`

Use `runtimeToolInputSchemas` for all planned actions. Execute through `executeToolCall()`. Treat tool result failures as hard plan execution failures before final narration.

### Rollback/Retry Boundary
**Source:** `backend/src/routes/chat.ts`, `backend/src/engine/state-snapshot.ts`, `backend/src/campaign/runtime-state.ts`  
**Apply to:** route changes and turn-processor changes

Keep route-owned `tryBeginTurn()`, `captureSnapshot()`, `setLastTurnSnapshot()`, `restoreSnapshot()`, `clearLastTurnSnapshot()`, `endTurn()`. Do not move rollback ownership into the planner.

### Visibility Filtering
**Source:** `backend/src/engine/scene-presence.ts`, `backend/src/engine/scene-assembly.ts`, `backend/src/engine/prompt-assembler.ts`, `backend/src/engine/storyteller-contract.ts`  
**Apply to:** `narrator-packet.ts`, `prompt-assembler.ts`, `scene-plan-validator.ts`

Final visible prompt may include clear actors and hint signals. Hidden actors may inform judge/planner only; final narration must not receive hidden identities by name.

### Test Organization
**Source:** `backend/src/engine/__tests__/hidden-adjudication.test.ts`, `backend/src/engine/__tests__/world-brain.test.ts`, `backend/src/routes/__tests__/chat.test.ts`

Use Vitest with module-level `vi.mock()`, `vi.hoisted()` for shared log mocks, `beforeEach(() => vi.clearAllMocks())`, and targeted assertions on call order, prompt contents, SSE events, rollback restore, and hidden-fact absence.

## Regression Test Patterns To Copy

### Schema bounds and executor fail-loud tests
**Source:** `hidden-adjudication.test.ts` lines 32-49, 93-196
```typescript
expect(() =>
  adjudicationPlanSchema.parse({
    rationale: "x".repeat(ADJUDICATION_PLAN_RATIONALE_MAX + 1),
    actions: [],
  }),
).toThrow();

await expect(
  executeAdjudicationPlan({ campaignId: "campaign-1", tick: 4, plan: badPlan }),
).rejects.toThrow("Adjudication action failed: add_tag");
```

### Repair pass tests
**Source:** `world-brain.test.ts` lines 147-245
```typescript
vi.mocked(safeGenerateObject)
  .mockResolvedValueOnce({ object: overlongCandidate, trace: initialTrace })
  .mockResolvedValueOnce({ object: repairedCandidate, trace: repairTrace });

const result = await runWorldBrainSceneDirection({ provider, seed: createSeed() });

expect(safeGenerateObject).toHaveBeenCalledTimes(2);
expect(vi.mocked(safeGenerateObject).mock.calls[1]?.[0]).toEqual(
  expect.objectContaining({ schema: worldBrainSceneDirectionSchema, prompt: expect.stringContaining("Validation issues:") }),
);
```

### Hidden-fact filtering tests
**Source:** `world-brain.test.ts` lines 247-283 and `prompt-assembler.test.ts` lines 1453-1523
```typescript
expect(hiddenPrompt.formatted).toContain("[WORLD-BRAIN DIRECTION]");
expect(hiddenPrompt.formatted).toContain("A hidden observer is judging whether to surface.");

expect(finalPrompt.prompt).toContain("[SCENE DIRECTION]");
expect(finalPrompt.prompt).not.toContain("A hidden observer is judging whether to surface.");
```

### Scene settlement before narration
**Source:** `turn-processor.test.ts` lines 995-1053
```typescript
expect(observedTypesBeforeNarrative).not.toContain("narrative");
expect(observedTypesBeforeNarrative).toContain("scene-settling");

const finishSceneSettlement = resolveSceneSettlement as (() => void) | null;
if (finishSceneSettlement) finishSceneSettlement();

const narrativeStep = await generator.next();
expect(narrativeStep.value.type).toBe("narrative");
```

### Route rollback tests
**Source:** `chat.test.ts` lines 1221-1263 and 1265-1325
```typescript
expect(body).toContain("event: finalizing_turn");
expect(body).toContain("event: error");
expect(body).not.toContain("event: done");
expect(mockedRestoreSnapshot).toHaveBeenCalledWith(CAMPAIGN_ID, snapshot);
```

## Existing Seams For Phase 70A

| Seam | Current Location | Phase 70A Use |
|------|------------------|---------------|
| SceneFrame builder | `assembleAuthoritativeScene()` and `buildScenePresence()` | Extract deterministic situation packet before planner call |
| ScenePlan schema | `adjudicationPlanSchema`, `worldBrainSceneDirectionSchema` | New strict schema with action interpretation, anchor event, responses, planned actions, narrator facts |
| Scene planner call | `runWorldBrainSceneDirection()` | Replace with `runScenePlanner()` consuming SceneFrame + Oracle |
| Tool execution bridge | `executeAdjudicationPlan()` | Generalize to `executeScenePlan()` |
| Narrator packet | `SceneAssembly.playerPerceivableConsequences` + `assembleFinalNarrationPrompt()` | Make explicit packet consumed by final-visible prompt |
| Visible path NPC mini-round | `chat.ts` `buildOnBeforeVisibleNarration()` -> `tickPresentNpcs()` | Remove from normal visible-turn path; demote to background/future |
| Rollback safety | `chat.ts` action/retry snapshot handling | Preserve unchanged |

## No Analog Found

No complete analog exists for a unified `ScenePlan` planner of record. The closest partial analogs are:

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/src/engine/scene-plan-schema.ts` | model/validator | request-response | Existing schemas split world-brain direction and hidden adjudication; no unified plan schema yet |
| `backend/src/engine/narrator-packet.ts` | service/utility | visibility transform | Existing visibility projection is implicit in `SceneAssembly` and prompt assembly, not a named packet |

## Metadata

**Analog search scope:** `backend/src/engine`, `backend/src/routes`, `backend/src/ai`, `backend/src/campaign`, `backend/src/engine/__tests__`, `backend/src/routes/__tests__`  
**Files scanned:** 70+ source/test files via `rg`, with required Phase 70 docs and primary runtime files read directly  
**Pattern extraction date:** 2026-04-25
