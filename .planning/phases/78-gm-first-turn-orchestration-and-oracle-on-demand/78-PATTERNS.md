# Phase 78: GM-First Turn Orchestration And Oracle-On-Demand - Pattern Map

**Mapped:** 2026-05-03
**Files analyzed:** 14 live source/test files plus Phase 73/74/77 summaries
**Analogs found:** 12 / 12
**Scope note:** No source files were edited. This map is for planning only.

## Current Symbols And Responsibility Map

| Module / Symbol | Current Responsibility | Phase 78 Read |
|---|---|---|
| `backend/src/routes/chat.ts` `/action` | Request validation, provider resolution, turn lock, pre-turn snapshot, SSE streaming, rollback on failure, last snapshot for undo/retry | Reuse rollback/SSE/turn-lock shape. Deprecate semantic use of `intent`/`method` at route boundary by mirroring raw text only during compatibility. |
| `backend/src/engine/turn-processor.ts` `processTurnScenePlan` | Builds state, derives SceneFrame, currently resolves target/combat context, calls Oracle automatically, runs ScenePlanner, validates/executes, narrates | Main write area. Keep deterministic state, receipts, validation, execution. Remove backend semantic pre-pass authority and automatic Oracle. |
| `backend/src/engine/scene-frame.ts` `buildSceneFrame` | Gathers roster, perception, recent events, target candidates, movement candidates, allowed tools, current oracle/combat hints | Reuse as neutral packet source. Avoid `resolveOracleContext` and `deriveCombatEnvelope` as authoritative player-text interpretation before GM chooses. |
| `backend/src/engine/scene-planner.ts` `runScenePlanner` | Judge structured semantic ScenePlan generation and one repair attempt; backend maps to strict plan | Reuse semantic-output pattern, but change contract so GM chooses path first: direct/no-roll, roll/oracle, tool call, combat transition, clarification, Continue. |
| `backend/src/engine/oracle.ts` `callOracle` | Structured probability call plus backend D100 roll and `oracle.call` receipt | Reuse only as on-demand roll/oracle service. Do not call every turn. |
| `backend/src/engine/combat-envelope.ts` | Deterministic matchup math, outcome bounds, combat posture; also contains hostile regex helper | Reuse `buildCombatEnvelope` and bounds after GM supplies concrete target/combat intent. Avoid `isHostileCombatAction` as product authority. |
| `backend/src/engine/tool-schemas.ts` | Runtime tool Zod schemas and AI SDK tool wrappers | Reuse as legal affordance source and validation source. |
| `backend/src/engine/semantic-scene-plan-schema.ts` | Maps semantic actor refs/tools to backend IDs; validates allowed actors/tools | Reuse actor/tool resolution and backend-generated IDs. |
| `backend/src/engine/scene-plan-executor.ts` | Executes validated ScenePlan actions via `executeToolCall`; emits quick actions and state updates | Reuse deterministic execution and emitted event shape. |
| `backend/src/ai/generate-object-safe.ts` | Structured output strategy selection, trace logging, repair policy | Reuse trace labels, repair policy, fail-closed semantics. |
| `frontend/lib/api.ts` `chatAction` | Sends `/api/chat/action` stream with `playerAction`, `intent`, `method` | Reuse streaming API surface, but likely narrow product semantics to raw action plus compatibility mirror. |
| `frontend/app/game/page.tsx` `submitAction` | Sends freeform text and Continue payload; parses SSE into scene surface | Reuse route-backed Send/Continue wiring and tests. Do not infer UI feedback from submitted text. |

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `backend/src/routes/schemas.ts` | route schema | request-response | `chatActionBodySchema` lines 188-193 | exact |
| `backend/src/routes/chat.ts` | route/controller | SSE request-response | `/action` handler lines 490-674 | exact |
| `backend/src/engine/turn-processor.ts` | orchestrator/service | event-driven streaming + CRUD mutations | `processTurnScenePlan` lines 846-1320 | exact |
| `backend/src/engine/scene-frame.ts` | service/model builder | read-only state aggregation | `buildSceneFrame` lines 810-905 | exact |
| `backend/src/engine/scene-planner.ts` or new GM planner module | AI service | structured request-response | `runScenePlanner` lines 179-235 | role-match |
| `backend/src/engine/oracle.ts` | AI service + random receipt | request-response + deterministic random | `callOracle` lines 184-190, `executeOracleCall` lines 141-181 | exact |
| `backend/src/engine/combat-envelope.ts` | deterministic utility | transform | `buildCombatEnvelope` lines 925-1043 | exact |
| `backend/src/engine/tool-schemas.ts` | schema/config | validation + tool execution affordances | `runtimeToolInputSchemas` lines 123-136 | exact |
| `backend/src/engine/semantic-scene-plan-schema.ts` | mapper/validator | transform + validation | `semanticScenePlanToStrictPlan` lines 427-460 | exact |
| `backend/src/engine/scene-plan-executor.ts` | service/executor | CRUD/event emission | `executeScenePlan` lines 109-199 | exact |
| `frontend/lib/api.ts` | API client | streaming request-response | `chatAction` lines 1232-1244 | exact |
| `frontend/app/game/page.tsx` / `ActionDock` | component/hook wiring | event-driven UI + SSE | `submitAction` lines 726-790, Continue lines 971-974 | exact |

## Pattern Assignments

### `backend/src/routes/chat.ts` (route/controller, SSE request-response)

**Analog:** `backend/src/routes/chat.ts`

**Validation and provider setup pattern** (lines 490-520):
```ts
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
```

**Rollback boundary pattern** (lines 549-550, 621-636):
```ts
const snapshot = await captureSnapshot(campaignId);
...
setLastTurnSnapshot(campaignId, snapshot);
...
outcome = "restored";
log.error("Turn processing failed; restoring pre-turn boundary", error);
try {
  await restoreSnapshot(campaignId, snapshot);
} catch (restoreError) {
  outcome = "error";
  log.error("Failed to restore pre-turn boundary after action failure", restoreError);
}
clearLastTurnSnapshot(campaignId);
```

**SSE and receipt pattern** (lines 558-664):
```ts
return streamSSE(c, async (stream) => {
  await runWithTurnContext({ turnId, campaignId, tick: currentTick }, async () => {
    log.event("turn.begin", { route: "/action", campaignId, tick: currentTick, playerAction, intent, method });
    ...
    for await (const event of turnGenerator) {
      await writeTurnEventSSE(stream, event);
    }
    ...
    log.event("turn.end", { route: "/action", tick: currentTick, durationMs: Date.now() - turnStart, outcome });
    endTurn(campaignId);
  });
});
```

**Avoid in Phase 78:** Do not keep `intent` and `method` as product semantics. They may be accepted for compatibility but should mirror raw action/empty method until removed.

### `backend/src/routes/schemas.ts` (route schema, request-response)

**Analog:** `chatActionBodySchema`

**Current schema** (lines 188-193):
```ts
export const chatActionBodySchema = z.object({
  campaignId: campaignIdSchema,
  playerAction: z.string().min(1).max(2000),
  intent: z.string().min(1).max(2000),
  method: z.string().max(500).default(""),
});
```

**Phase 78 pattern:** Keep Zod route validation and caps. If adding a raw turn schema, preserve `campaignIdSchema`, `playerAction`/raw text max cap, and compatibility defaults. Do not add command-mode enums like `Act` / `Speak` / `Observe`.

### `backend/src/engine/turn-processor.ts` (orchestrator, event-driven streaming)

**Analog:** `processTurnScenePlan`

**Neutral state gather pattern to keep** (lines 874-888, 940-951):
```ts
// Query deterministic state before any LLM interpretation.
const db = getDb();
const config = readCampaignConfig(campaignId);
const currentTick = config.currentTick ?? 0;
const player = db.select().from(players).where(eq(players.campaignId, campaignId)).get();
const initialSceneScopeId = ensurePlayerSceneScopeAlignment(db, player ?? undefined);
...
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
logScenePlanFrame(sceneFrame, Date.now() - frameStart);
```

**Current anti-pattern to remove/replace** (lines 953-1007):
```ts
const targetContext = sceneFrame.oracleContext ?? {
  targetTags: [],
  targetLabel: null,
  targetType: "none" as const,
  source: "scene_frame" as const,
  fallbackReason: "No deterministic SceneFrame target candidate matched.",
};
...
const hostileAction = isHostileCombatAction({ actionText: playerAction, intent, method });
...
const oracleResult = await callOracle({ intent, method, actorTags, targetTags: targetContext.targetTags, ... }, judgeProvider);
yield { type: "oracle_result", data: oracleResult };
```

**Planner/validate/execute pattern to keep** (lines 1045-1098):
```ts
const scenePlan = await runScenePlanner({ provider: judgeProvider, frame: frameWithOracle, playerAction, oracleResult, outcomeBounds });
const validation = validateScenePlan({ frame: frameWithOracle, plan: scenePlan, oracleResult, outcomeBounds });
if (!validation.ok) {
  throw new ScenePlanValidationError(validation.issues);
}
const executedPlan = await executeScenePlan({ campaignId, tick: currentTick, outcomeTier: oracleResult.outcome, plan: validation.plan });
for (const event of executedPlan.emittedEvents) {
  yield event;
}
```

**Finalization pattern to keep** (lines 1306-1319):
```ts
if (onPostTurn) {
  yield { type: "finalizing_turn", data: { tick: newTick, stage: "rollback_critical" } };
  await withTimeout(Promise.resolve(onPostTurn(summary)), TURN_FINALIZATION_TIMEOUT_MS, "Rollback-critical finalization timed out.");
}
yield { type: "done", data: { tick: newTick } };
```

**Phase 78 direction:** Replace the current fixed `SceneFrame -> targetContext -> combatEnvelope -> Oracle -> ScenePlanner` order with `SceneFrame neutral packet -> GM/Judge path decision -> optional Oracle/roll/tool/combat/clarification/direct plan -> backend validation/execution`.

### `backend/src/engine/scene-frame.ts` (state packet service, read-only aggregation)

**Analog:** `buildSceneFrame`

**Neutral packet shape to reuse** (lines 117-134):
```ts
export interface SceneFrame {
  campaignId: string;
  tick: number;
  playerActorId: string;
  currentLocationId: string | null;
  currentSceneScopeId: string | null;
  playerAction: string;
  roster: SceneFrameRoster;
  perception: SceneFramePerception;
  recentEvents: SceneFrameRecentEvent[];
  targetCandidates: SceneFrameTargetCandidate[];
  movementCandidates: SceneFrameMovementCandidate[];
  deferredHooks: SceneFrameDeferredHook[];
  allowedTools: RuntimeToolName[];
  oracleContext?: SceneFrameOracleContext | null;
  combatEnvelope?: CombatEnvelope | null;
  oracle: SceneFrameOracleInput | null;
}
```

**Presence/candidate pattern to reuse** (lines 501-540, 632-688):
```ts
const active = [playerActor, ...npcActors.filter((actor) => snapshot.presentActorIds.includes(actor.id) && actor.awareness === "clear")];
const support = npcActors.filter((actor) => snapshot.presentActorIds.includes(actor.id) && actor.awareness === "hint");
const background = npcActors.filter((actor) => !active.includes(actor) && !support.includes(actor));
...
return [...actorCandidates, ...itemCandidates, ...locationCandidates].slice(0, SCENE_FRAME_TARGET_CANDIDATE_LIMIT);
```

**Avoid as authority** (lines 719-736, 753-797):
```ts
const candidate = [...input.targetCandidates]
  .sort((left, right) => right.label.length - left.label.length)
  .find((entry) => searchText.includes(normalizeLabel(entry.label)));
...
if (!isHostileCombatAction({ actionText: input.playerAction, intent: input.intent, method: input.method })) {
  return null;
}
```

**Phase 78 direction:** Keep candidate IDs/names, awareness bands, forbidden actor lists, recent events, movement candidates, and allowed tools. Do not return `oracleContext`/`combatEnvelope` by parsing raw player text unless explicitly provided by GM output.

### `backend/src/engine/scene-planner.ts` or new GM planner module (AI service, structured request-response)

**Analog:** `runScenePlanner`

**Structured generation and repair pattern** (lines 179-235):
```ts
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
if (parsed.success) return parsed.plan;
...
const repaired = await withRole("judge", () =>
  safeGenerateObject({ model, schema: semanticScenePlanSchema, system, prompt: buildScenePlannerRepairPrompt(...), temperature: 0, retries: 1 }),
);
```

**Prompt contract pattern** (lines 48-55, 96-123):
```ts
"Return one semantic ScenePlan JSON object only. Do not write prose, dialogue, or markdown.",
"Oracle result is separate and binding. Do not choose a new Oracle outcome tier.",
"Return actorRef values from allowed actor ids or labels; return toolName from ALLOWED TOOLS; backend will generate event/action/response/narrator IDs;"
...
"SCENE FRAME",
JSON.stringify(args.frame, null, 2),
"ALLOWED TOOLS",
args.frame.allowedTools.length > 0 ? args.frame.allowedTools.map((toolName) => `- ${toolName}`).join("\n") : "- none",
```

**Phase 78 direction:** Reuse `safeGenerateObject`, markers, semantic refs, and one repair attempt. Change the schema/contract from "plan after Oracle" to "GM first-turn decision": direct/no-roll response, request roll/oracle, propose tool calls, transition combat with concrete target, ask clarification, or Continue.

### `backend/src/engine/oracle.ts` (AI service + deterministic random, request-response)

**Analog:** `callOracle`

**Schema and roll pattern to reuse** (lines 44-58, 160-170):
```ts
export const oracleOutputSchema = z.object({
  chance: z.number().min(1).max(99),
  reasoning: z.string().max(500),
});
...
const chance = Math.max(1, Math.min(99, object.chance));
const roll = rollD100();
const outcome = resolveOutcome(roll, chance);
const result: OracleResult = { chance, roll, outcome, reasoning: object.reasoning };
log.event("oracle.call", { input: payload, output: result, latencyMs: Date.now() - startMs });
```

**Prompt authority boundary to keep** (lines 67-71):
```ts
Use only the provided actorTags, targetTags, environmentTags, and sceneContext as evidence snapshots.
If a combatEnvelope block is present, treat it as backend-authored adjudication context...
${buildOraclePromptContract()}
```

**Phase 78 direction:** Make Oracle callable only after the GM/Judge asks for uncertainty adjudication. Pure speech, obvious observation, guaranteed actions, and Continue should bypass Oracle.

### `backend/src/engine/combat-envelope.ts` (deterministic transform)

**Analog:** `buildCombatEnvelope`

**Use after concrete GM target/intent** (lines 925-1043):
```ts
export function buildCombatEnvelope(options: BuildCombatEnvelopeOptions): CombatEnvelope | null {
  if (!options.hostileAction) return null;
  const actorPower = options.actor?.powerStats ?? null;
  const targetPower = options.target?.powerStats ?? null;
  if (!actorPower || !targetPower) return null;
  ...
  return { matchup, durabilityTierGap, speedTierGap, actorBypassesTarget, targetBypassesActor, relevantVulnerabilities, summaryLines };
}
```

**Avoid regex authority** (lines 80-102, 345-358):
```ts
const HOSTILE_ACTION_PATTERNS: readonly RegExp[] = [/\battack(?:ing)?\b/i, /\bstrike\b/i, ...];
export function isHostileCombatAction(input: { actionText?: string | null; intent?: string | null; method?: string | null }): boolean {
  const combined = [input.actionText, input.intent, input.method].filter(...).join(" ");
  return HOSTILE_ACTION_PATTERNS.some((pattern) => pattern.test(combined));
}
```

**Outcome bounds pattern** (lines 751-787):
```ts
export function buildNarrativeOutcomeBounds(envelope: CombatEnvelope, outcome: OutcomeTierLike): NarrativeOutcomeBounds {
  switch (outcome) {
    case "strong_hit": return buildStrongHitBounds(envelope);
    case "weak_hit": return buildWeakHitBounds(envelope);
    case "miss": return buildMissBounds(envelope);
    default: return { ceilings: ..., floors: ..., prohibitions: ..., summary: ... };
  }
}
```

### `backend/src/engine/tool-schemas.ts` and `prompt-contracts.ts` (schemas/config, validation)

**Analog:** runtime tool schema source of truth

**Tool schema pattern** (tool-schemas.ts lines 123-136):
```ts
export const runtimeToolInputSchemas = {
  add_tag: addTagInputSchema,
  remove_tag: removeTagInputSchema,
  set_relationship: setRelationshipInputSchema,
  add_chronicle_entry: addChronicleEntryInputSchema,
  log_event: logEventInputSchema,
  offer_quick_actions: offerQuickActionsInputSchema,
  spawn_npc: spawnNpcInputSchema,
  spawn_item: spawnItemInputSchema,
  reveal_location: revealLocationInputSchema,
  set_condition: setConditionInputSchema,
  move_to: moveToInputSchema,
  transfer_item: transferItemInputSchema,
} as const;
```

**Prompt contract pattern** (prompt-contracts.ts lines 157-174):
```ts
return [
  "RUNTIME TOOL INPUT CONTRACT",
  `Allowed RuntimeToolName values from runtimeToolInputSchemas: ${allowedToolList}.`,
  "Every planned tool call must use { \"toolName\": RuntimeToolName, \"input\": object }.",
  "Use input as the primary field. \"payload\" is compatibility-only and must not be emitted in primary output.",
  ...
  "backend owns IDs, reference resolution, trimming, caps, alias compatibility, execution, and final validation.",
  "Backend must not invent source truth, actor intent, targets, lore, quick-action labels, tool actions, or canonical facts to make validation pass.",
].join("\n");
```

### `backend/src/engine/semantic-scene-plan-schema.ts` (mapper/validator, transform)

**Analog:** semantic ScenePlan mapping

**Actor and tool resolution pattern** (lines 132-180, 205-230):
```ts
const allowed = [...frame.roster.active, ...frame.roster.support.filter((actor) => actor.awareness === "clear")];
const forbiddenRefs = new Set([...frame.perception.forbiddenActorIds ?? [], ...frame.roster.background.flatMap(actorRefs), ...]);
...
if (!runtimeToolNameSet.has(value) || !frame.allowedTools.includes(value as RuntimeToolName)) {
  throw new SemanticScenePlanMappingError([{ code: "unsupported_tool", path, message: `${path} must be one of the SceneFrame ALLOWED TOOLS; got "${value}".` }]);
}
```

**Backend ID generation and validation pattern** (lines 323-424, 427-460):
```ts
const anchorEventId = idFactory();
const primaryResponseId = idFactory();
...
plannedActions: semanticPlan.plannedActions.flatMap((action, index) => {
  const toolName = resolveToolName(action.toolName, frame, `plannedActions.${index}.toolName`);
  const input = action.input ?? action.payload ?? {};
  ...
  return [{ id: idFactory(), actorId: resolver.resolve(...), toolName, input: normalizedInput }];
});
...
const semanticParsed = semanticScenePlanSchema.safeParse(input);
const strictParsed = scenePlanSchema.safeParse(mapped);
const validated = validateScenePlan({ frame, plan: strictParsed.data });
```

**Phase 78 direction:** Reuse this for GM-supplied concrete refs and tools. Do not add fallback target invention when refs are missing; ask clarification or fail closed.

### `backend/src/engine/scene-plan-executor.ts` (executor, CRUD/event emission)

**Analog:** `executeScenePlan`

**Execution/receipt pattern** (lines 109-153):
```ts
for (const [order, action] of validatedPlan.plan.plannedActions.entries()) {
  const toolArgs = action.input as Record<string, unknown>;
  const result = await executeToolCall(args.campaignId, action.toolName, toolArgs, args.tick, args.outcomeTier);
  const actionResult = { order, actionId: action.id, actorId: action.actorId, toolName: action.toolName, input: action.input, args: toolArgs, result };
  toolCallResults.push(actionResult);
  if (!result.success) {
    throw new ScenePlanExecutionError(`ScenePlan action failed: ${action.toolName}${result.error ? ` - ${result.error}` : ""}`, buildExecutedScenePlanSnapshot(...));
  }
}
```

**Frontend event compatibility** (lines 163-188):
```ts
if (action.toolName === "offer_quick_actions") {
  emittedEvents.push({ type: "quick_actions", data: result });
  continue;
}
if (action.toolName === "move_to") {
  emittedEvents.push({ type: "state_update", data: { type: "location_change", locationId, locationName, travelCost, tickAdvance, path } });
  continue;
}
emittedEvents.push({ type: "state_update", data: actionResult });
```

### `backend/src/ai/generate-object-safe.ts` (AI utility, structured output)

**Analog:** `safeGenerateObject`

**Repair policy to reuse** (lines 31-36, 651-664):
```ts
export const STRUCTURED_OUTPUT_REPAIR_POLICY = [
  "STRUCTURED_OUTPUT_CONTRACT: repair-policy.v1",
  "Repair may coerce object/list/string shape, field types, field names, known aliases, and invalid caps when the original output already contains the same meaning.",
  "Repair must never invent semantic lore, actions, targets, actor intent, quick action labels, source roles, canonical names, power facts, IDs, UUIDs, or new array elements with missing semantics.",
  "If required semantics are missing, fail closed instead of manufacturing placeholder truth.",
].join("\n");
```

**Trace logging pattern** (lines 1104-1127, 1134-1148):
```ts
log.event("llm.attempt", {
  attemptNum: attempt,
  model: modelId,
  success: true,
  strategy: result.trace.strategy ?? null,
  primaryStrategy: result.trace.primaryStrategy ?? null,
  fallbackStrategy: result.trace.fallbackStrategy ?? null,
  fallbackReason: result.trace.fallbackReason ?? null,
  capability: result.trace.capability ?? null,
  latencyMs: Date.now() - attemptStart,
});
```

**Phase 78 direction:** Any new GM-decision structured call should use `safeGenerateObject`, return traceable schema failures, and fail closed when missing semantics would require invention.

### `frontend/lib/api.ts`, `frontend/app/game/page.tsx`, `ActionDock` (frontend wiring, SSE)

**Analog:** Phase 77 `/game` route-backed Send/Continue

**API compatibility pattern** (frontend/lib/api.ts lines 1232-1244):
```ts
export function chatAction(campaignId: string, playerAction: string, intent: string, method: string): Promise<Response> {
  return apiStreamPost("/api/chat/action", { campaignId, playerAction, intent, method });
}
```

**Submit wiring pattern** (page.tsx lines 726-790):
```tsx
const submitAction = async (actionText: string) => {
  if (!actionText || isTurnBusy || !activeCampaign) return;
  ...
  const response = await chatAction(activeCampaign.id, actionText, actionText, "");
  ...
  await parseTurnSSE(response.body, {
    onSceneSettling: applySceneSettlingStatus,
    onNarrative: (text) => { ... },
    onOracleResult: (result) => setLastOracleResult(result as OracleResultData),
    onStateUpdate: (update) => { if (getLocationChangeUpdate(update)) setTravelFeedback(...); },
    onQuickActions: bufferQuickActions,
    onFinalizing: () => setTurnPhase("finalizing"),
    onDone: () => { setHasLiveTurnSnapshot(true); revealBufferedQuickActions(); },
  });
};
```

**Continue pattern** (display-beats.ts line 18, page.tsx lines 971-974, action-dock.tsx lines 125-133):
```ts
export const CONTINUE_ACTION_PAYLOAD = "Continue scene.";
...
const handleContinueAction = () => {
  if (isTurnBusy) return;
  void submitAction(CONTINUE_ACTION_PAYLOAD);
};
```

**Phase 77 compatibility tests to preserve** (page.test.tsx lines 797-824, 1868-1885):
```ts
expect(mockedChatAction).toHaveBeenCalledWith(fakeCampaign.id, "Scout ahead", "Scout ahead", "");
expect(mockedChatAction).toHaveBeenCalledWith(fakeCampaign.id, "Continue scene.", "Continue scene.", "");
...
expect(screen.queryByText(/Travel complete:/)).not.toBeInTheDocument();
```

## Shared Patterns To Reuse

### Rollback / Snapshot

**Source:** `backend/src/routes/chat.ts` lines 549-550, 621-636, 918-929.

Apply to all `/action` orchestration changes. Capture before processing, set last snapshot only after successful stream, restore on any planner/oracle/executor/narration failure, clear live snapshot after failed restore path.

### Validation And Fail-Closed Semantics

**Source:** `backend/src/routes/schemas.ts`, `semantic-scene-plan-schema.ts`, `scene-plan-validator.ts`, `generate-object-safe.ts`.

Use Zod at request and model boundaries. If GM output lacks required target/tool semantics, do not manufacture placeholders; use clarification or fail closed.

### Structured Output Traces

**Source:** `backend/src/ai/generate-object-safe.ts` lines 1104-1148.

Any new GM-first structured call should preserve `strategy`, `primaryStrategy`, `fallbackStrategy`, `fallbackReason`, `capability`, usage, response model, and latency logs.

### Semantic Mapping

**Source:** `backend/src/engine/semantic-scene-plan-schema.ts` lines 132-180, 205-230, 323-460.

Let the model speak in actor refs and tool names. Backend maps refs to IDs, rejects forbidden/background actors, verifies allowed tools, generates IDs, then validates strict plans.

### Tool Execution

**Source:** `backend/src/engine/scene-plan-executor.ts` lines 109-199 and `backend/src/engine/tool-schemas.ts` lines 123-136.

Only execute validated tool calls from the allowed runtime schema list. Preserve `quick_actions` and `location_change` emitted events for frontend compatibility.

### Receipts / Logs

**Source:** `chat.ts` `turn.begin`/`turn.end` lines 561-578, 646-651; `oracle.ts` `oracle.call` lines 166-179; `turn-processor.ts` `scene.frame`, `judge.scene-plan`, `scene.plan.validation`, `scene.plan.execution` lines 816-843, 1054-1091.

Keep observability at every authority boundary: frame build, GM decision, optional Oracle/roll, validation, execution, narration, finalization.

### Phase 77 Presentation Compatibility

**Source:** `frontend/app/game/page.tsx` lines 726-790, 971-974; `frontend/lib/display-beats.ts` line 18; `frontend/app/game/__tests__/page.test.tsx` lines 797-824, 1868-1885.

Do not regress Send/Continue as raw route-backed actions. Do not expose `intent`, `method`, debug mechanics, or inferred travel feedback from submitted text. Mechanics stay in Inspect unless a streamed event says otherwise.

## Patterns To Avoid

| Avoid | Existing Source | Why |
|---|---|---|
| Backend semantic pre-pass over raw player text | `turn-processor.ts` lines 953-1007; `scene-frame.ts` lines 719-736 | Backend must not decide target/meaning before GM. |
| Hostile regex authority | `combat-envelope.ts` lines 80-102, 345-358 | Regex can be a hint/test utility only, not product truth for combat/hostility. |
| Automatic Oracle for every turn | `turn-processor.ts` lines 994-1007 and 1555-1569 | P78 requires Oracle/roll only on meaningful uncertainty requested by GM. |
| Fake target fallback | `scene-frame.ts` lines 729-736; `turn-processor.ts` lines 953-959 | Missing target should become no-target/direct/clarification, not fabricated target truth. |
| LLM-owned persisted state | `prompt-contracts.ts` lines 171-174 and repair policy lines 31-36 explicitly forbid this | Backend validates and persists final truth; model proposes only. |
| Frontend semantic inference from action text | `page.test.tsx` lines 1868-1885 locks this out | UI should render backend events, not infer travel/combat from text. |

## Suggested Plan Slices

### Slice 1 - Route Contract And Compatibility

**Likely write scope:** `backend/src/routes/schemas.ts`, `backend/src/routes/chat.ts`, `frontend/lib/api.ts`, `frontend/app/game/page.tsx`, tests in `frontend/app/game/__tests__/page.test.tsx`.

**Work:** Deprecate `intent`/`method` as semantics; keep route compatibility by mirroring raw action and empty method. Add tests proving Send and Continue still route, no required modes appear, and backend receives raw text.

**Test scope:** backend route schema tests if present; frontend page tests around `chatAction`; typecheck.

### Slice 2 - Neutral Scene Packet

**Likely write scope:** `backend/src/engine/scene-frame.ts`, `backend/src/engine/__tests__/scene-frame.test.ts`.

**Work:** Make `SceneFrame` a neutral evidence/affordance packet. Keep candidates, awareness, recent events, allowed tools. Remove or gate player-text target/oracle/combat derivation so it only runs when explicit GM data is supplied.

**Test scope:** scene-frame tests for visible/support/background candidates, no fallback target from prose, no combat envelope from raw hostile words, broad-location actors not direct targets unless present/clear.

### Slice 3 - GM/Judge First Decision Schema

**Likely write scope:** new or existing `backend/src/engine/scene-planner.ts`, `backend/src/engine/prompt-contracts.ts`, possible new `gm-turn-decision-schema.ts`, tests in `scene-planner.test.ts` or new test file.

**Work:** Add structured GM decision contract: `direct`, `roll_oracle`, `tool_plan`, `combat_transition`, `clarification`, `continue`. Input includes raw text, SceneFrame, candidate IDs/names, allowed tools, rulebook constraints. Output uses refs/tools only; backend maps/validates.

**Test scope:** safeGenerateObject mock tests for each decision path; prompt marker tests; fail-closed tests for unsupported tool, forbidden actor, missing target, unsupported mode.

### Slice 4 - Oracle-On-Demand And Roll Receipts

**Likely write scope:** `backend/src/engine/turn-processor.ts`, `backend/src/engine/oracle.ts` only if payload shape changes, tests in `oracle.test.ts` and `turn-processor.scene-plan.test.ts`.

**Work:** Call `callOracle` only for GM `roll_oracle` decisions. Preserve `oracle_result` SSE only when a roll happened. Direct/Continue turns should not emit fake mechanics.

**Test scope:** no-roll direct speech, no-roll Continue, roll requested emits `oracle_result`, failed Oracle restores snapshot.

### Slice 5 - Tool/Combat Execution From GM Concrete Refs

**Likely write scope:** `turn-processor.ts`, `semantic-scene-plan-schema.ts`, `scene-plan-executor.ts`, `combat-envelope.ts` only if adding explicit combat request adapter.

**Work:** Build combat envelope only after GM names concrete actor/target and combat/hostile framing. Execute tools only after schema and candidate validation.

**Test scope:** `I hit Iru` uses GM-selected candidate, not regex; invalid/offscreen actor rejected or clarification; `move_to` only for connected candidate; `offer_quick_actions` shape preserved.

### Slice 6 - Presentation Compatibility And Inspect Mechanics

**Likely write scope:** frontend `/game` page/components only if SSE event handling changes.

**Work:** Keep Phase 77 scene cadence. Hide mechanics unless streamed. Do not render intent/method/debug labels. Continue remains first-class.

**Test scope:** existing Phase 77 page/play-surface tests plus targeted no-Oracle/direct-turn rendering and no action-text travel inference.

## GitNexus Impact Targets Required Before Source Edits

Run `gitnexus_impact({ target, direction: "upstream" })` before modifying these symbols:

| Target | File | Why |
|---|---|---|
| `chatActionBodySchema` | `backend/src/routes/schemas.ts` | Route request contract affects backend route and frontend API. |
| `/action` handler or nearby extracted symbol | `backend/src/routes/chat.ts` | Turn lock, rollback, SSE stream, undo/retry snapshots. |
| `processTurn` | `backend/src/engine/turn-processor.ts` | Public orchestrator used by chat route and tests. |
| `processTurnScenePlan` | `backend/src/engine/turn-processor.ts` | Main GM-first orchestration path. |
| `TurnOptions` / `TurnEvent` | `backend/src/engine/turn-processor.ts` | API between route and engine plus SSE event types. |
| `buildSceneFrame` | `backend/src/engine/scene-frame.ts` | Candidate/visibility/state packet shared by planner/tests. |
| `resolveOracleContext` | `backend/src/engine/scene-frame.ts` | Must be removed/gated carefully because existing tests may assert it. |
| `deriveCombatEnvelope` | `backend/src/engine/scene-frame.ts` | Currently calls hostile regex from raw text. |
| `runScenePlanner` | `backend/src/engine/scene-planner.ts` | Structured Judge call and repair loop. |
| `semanticScenePlanToStrictPlan` | `backend/src/engine/semantic-scene-plan-schema.ts` | Actor/tool mapping and backend ID generation. |
| `validateScenePlan` | `backend/src/engine/scene-plan-validator.ts` | Final strict validation before execution. |
| `executeScenePlan` | `backend/src/engine/scene-plan-executor.ts` | Mutating tool execution and emitted events. |
| `callOracle` | `backend/src/engine/oracle.ts` | Probability service and roll receipts. |
| `buildCombatEnvelope` | `backend/src/engine/combat-envelope.ts` | Deterministic combat math. |
| `isHostileCombatAction` | `backend/src/engine/combat-envelope.ts` | Existing anti-pattern; edits affect current callers/tests. |
| `runtimeToolInputSchemas` | `backend/src/engine/tool-schemas.ts` | Tool contract source of truth. |
| `chatAction` | `frontend/lib/api.ts` | Frontend streaming call shape. |
| `submitAction` | `frontend/app/game/page.tsx` | `/game` route-backed submit, SSE parse, UI state. |
| `CONTINUE_ACTION_PAYLOAD` | `frontend/lib/display-beats.ts` | Phase 77 Continue compatibility. |
| `ActionDock` | `frontend/components/game/play-surface/action-dock.tsx` | Player-facing Send/Continue controls. |

Known GitNexus context check performed during mapping: `runScenePlanner` is indexed with outgoing calls to `safeGenerateObject`, prompt builders, semantic parser, and repair prompt; `chatAction` is called by `frontend/app/game/page.tsx::submitAction`.

## No Analog Found

None. The codebase already has analogs for route validation, rollback, neutral state aggregation, semantic structured output, tool execution, roll receipts, and frontend SSE submit wiring.

## Metadata

**Analog search scope:** `backend/src/routes`, `backend/src/engine`, `backend/src/ai`, `frontend/app/game`, `frontend/components/game/play-surface`, `frontend/lib`.
**Files scanned:** 40+ via targeted `rg`; 14 read with line-numbered excerpts.
**Pattern extraction date:** 2026-05-03.
