# Phase 70: Reactive Scene Resolution and Canonical Event Flow - Research

**Researched:** 2026-04-25 [VERIFIED: current session date]  
**Domain:** WorldForge backend player-turn runtime, structured LLM planning, deterministic state execution [VERIFIED: 70-CONTEXT.md; backend/src/engine/turn-processor.ts]  
**Confidence:** HIGH for current code flow and migration boundaries; MEDIUM for exact ScenePlan field names until implementation review [VERIFIED: code audit; ASSUMED: proposed schema details]

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

From `## Accepted Design Decisions` in `70-CONTEXT.md` [VERIFIED: .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-CONTEXT.md]:

1. Keep the current Oracle as a separate bounded outcome call for the first migration.
2. Replace `WorldBrainSceneDirection + HiddenAdjudicationPlan + tickPresentNpcs` on the visible-turn critical path with one strict structured `ScenePlan`.
3. Backend owns state, roster construction, actor/location validity, awareness bands, visibility, tool execution, persistence, rollback, retry, and tick boundaries.
4. LLM calls own semantic interpretation, likely actor response selection, support beats, deferred semantic hooks, stopping point judgment, and final prose.
5. Present NPC autonomy must not run as an independent visible-turn mini-round after the judge plan has already executed.
6. Offscreen activity, faction drift, actor reflection, and long-running world simulation must not block the visible player response unless the `ScenePlan` explicitly selects a bounded local consequence.
7. The Storyteller must receive a player-perceivable committed packet, not raw hidden adjudication plans or unconstrained world state.
8. The implementation should migrate the existing Phase 68/69 pipeline instead of rewriting the engine.

From `## Non-Negotiables` in `70-CONTEXT.md` [VERIFIED: .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-CONTEXT.md]:

- The visible turn must have one local planner of record.
- The backend must validate before anything becomes canonical.
- The final storyteller prompt must be downstream of committed visible facts.
- Planning must preserve rollback, retry, and current Phase 69 hidden-channel protections.
- The smallest maintainable migration is preferred over a grand simulation rewrite.

### Claude's Discretion

No explicit `## Claude's Discretion` section exists in `70-CONTEXT.md`; the research discretion is therefore limited to implementation shape inside the locked decisions above. [VERIFIED: .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-CONTEXT.md]

### Deferred Ideas (OUT OF SCOPE)

Do not pull these into Phase 70 unless the plan proves they are required [VERIFIED: .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-CONTEXT.md]:

- full all-actor global simulation
- Oracle and Scene Planner fusion
- background faction/offscreen scheduler rewrite
- actor reflection architecture rewrite
- new UI work
- new persistence schema for deferred hooks unless a minimal table is clearly needed
- generalized social/combat/romance/economy subsystem redesign
</user_constraints>

## Summary

The current post-Phase-69 normal player turn has the correct high-level ownership direction, but the visible critical path is still split across multiple decision makers. `processTurn()` calls Oracle, then `runWorldBrainSceneDirection()`, then `runHiddenAdjudicationPlan()`, then the route-level `onBeforeVisibleNarration()` hook runs `tickPresentNpcs()` before the final storyteller prompt. [VERIFIED: backend/src/engine/turn-processor.ts:917; backend/src/engine/turn-processor.ts:937; backend/src/engine/turn-processor.ts:1004; backend/src/engine/turn-processor.ts:1108; backend/src/routes/chat.ts:297] This means local scene authority is currently fragmented after the judge plan has already committed deterministic tool effects. [VERIFIED: 70-WORLD-SIMULATION-DATA-FLOW-CONSENSUS.md; backend/src/engine/npc-agent.ts:511]

The smallest maintainable migration is to add a Scene Planner of Record on the normal `/api/chat/action` and `/api/chat/retry` visible-turn paths while keeping Oracle separate for Phase 70A. [VERIFIED: 70-CONTEXT.md; 70-WORLD-SIMULATION-DATA-FLOW-CONSENSUS.md] The planner should consume one deterministic `SceneFrame`, return one strict structured `ScenePlan`, pass through backend validation, execute effects through existing runtime tool validation/execution, then produce a player-perceivable narrator packet for final prose. [VERIFIED: backend/src/engine/scene-presence.ts; backend/src/engine/tool-schemas.ts; backend/src/engine/tool-executor.ts; backend/src/engine/prompt-assembler.ts]

AI-SPEC.md is absent for this phase, so this research includes AI evaluation and guardrail implications directly: structured schema validation is necessary but not sufficient; the backend must also validate actor legality, visibility, allowed tools, movement connectivity, outcome bounds, prompt inputs, and narrator-visible actor/fact allow-lists. [VERIFIED: Test-Path .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/AI-SPEC.md returned False; CITED: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data; VERIFIED: backend/src/engine/tool-executor.ts]

**Primary recommendation:** Implement Phase 70A as a targeted backend migration: `SceneFrame -> Oracle -> ScenePlan -> validate -> execute via existing tools -> CanonicalTurnPacket -> NarratorPacket -> final visible prose`, and remove route-level `tickPresentNpcs()` from the visible-turn critical path. [VERIFIED: 70-CONTEXT.md; backend/src/routes/chat.ts:297; backend/src/engine/npc-agent.ts:511]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| SceneFrame construction | API / Backend | Database / Storage | The frame is derived from campaign DB rows, scene scope, current tick, actor rows, recent events, and deterministic awareness rules. [VERIFIED: backend/src/engine/scene-assembly.ts:494; backend/src/engine/scene-presence.ts:184] |
| Oracle outcome | API / Backend mediated LLM | API / Backend validation | Phase 70 locks Oracle as separate; the LLM judges bounded outcome while backend supplies outcome bounds and validates downstream effects. [VERIFIED: 70-CONTEXT.md; backend/src/engine/turn-processor.ts:917; backend/src/engine/turn-processor.ts:959] |
| ScenePlan generation | API / Backend mediated LLM | API / Backend validation | The model owns semantic local-scene judgment, but the backend owns schema, allow-list, and legality checks before commit. [VERIFIED: 70-CONTEXT.md; backend/src/engine/hidden-adjudication.ts:80] |
| Runtime effect execution | API / Backend | Database / Storage | Existing runtime tool execution validates references, applies DB changes, and returns structured results. [VERIFIED: backend/src/engine/tool-executor.ts:1174] |
| Presence and visibility | API / Backend | Database / Storage | Awareness bands and knowledge basis are already deterministic in `scene-presence.ts`. [VERIFIED: backend/src/engine/scene-presence.ts:1; backend/src/engine/scene-presence.ts:136] |
| Final narration | API / Backend mediated LLM | Browser / Client display | Storyteller should render prose only from a player-perceivable committed packet; the client only streams/display results. [VERIFIED: backend/src/engine/prompt-assembler.ts:1352; backend/src/routes/chat.ts:612] |
| Rollback and retry | API / Backend | Database / Storage | Routes capture snapshots before `processTurn()` and restore on failure/retry. [VERIFIED: backend/src/routes/chat.ts:580; backend/src/routes/chat.ts:658; backend/src/routes/chat.ts:816] |
| Offscreen/faction/reflection drift | API / Backend background work | LLM workers | Existing route finalization runs after visible narration through `onPostTurn`; Phase 70 should keep this out of the visible critical path. [VERIFIED: backend/src/routes/chat.ts:95; backend/src/routes/chat.ts:286] |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| P70-R1 | Build a deterministic per-turn `SceneFrame`. | Use `scene-presence.ts`, `scene-assembly.ts`, current turn state loading, target context, combat envelope, recent events, and allowed tool names to create one deterministic situation packet. [VERIFIED: 70-CONTEXT.md; backend/src/engine/scene-presence.ts; backend/src/engine/scene-assembly.ts] |
| P70-R2 | Introduce strict structured `ScenePlan` output. | Reuse the AI SDK `safeGenerateObject` + Zod pattern already used by World Brain and hidden adjudication. [VERIFIED: backend/src/engine/world-brain.ts:365; backend/src/engine/hidden-adjudication.ts:80; CITED: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data] |
| P70-R3 | Execute validated `ScenePlan` effects through deterministic backend services. | Reuse `runtimeToolInputSchemas`, `RuntimeToolName`, `executeToolCall()`, and the current `executeAdjudicationPlan()` execution pattern. [VERIFIED: backend/src/engine/tool-schemas.ts:123; backend/src/engine/tool-executor.ts:1174; backend/src/engine/hidden-adjudication.ts:127] |
| P70-R4 | Remove autonomous present-NPC mini-rounds from the visible-turn critical path. | Remove or bypass route `onBeforeVisibleNarration()` injection of `tickPresentNpcs()` for normal action/retry; present NPC reactions must be selected inside `ScenePlan`. [VERIFIED: backend/src/routes/chat.ts:297; backend/src/engine/npc-agent.ts:511] |
| P70-R5 | Keep Oracle separate while preserving outcome validation. | Keep the existing `callOracle()` and outcome bounds path before ScenePlan; pass Oracle result and bounds into ScenePlan validation. [VERIFIED: 70-CONTEXT.md; backend/src/engine/turn-processor.ts:917; backend/src/engine/turn-processor.ts:959] |
| P70-R6 | Create a player-perceivable narrator packet and keep hidden facts out of final prose. | Build narrator input from committed events/effects filtered by `resolveScenePresence()` and explicit actor/fact allow-lists, not raw hidden plan rationale. [VERIFIED: backend/src/engine/scene-presence.ts:136; backend/src/engine/prompt-assembler.ts:1352] |
| P70-R7 | Add regression tests for neutral-input escalation, hidden fact leakage, actor legality, and canonical event ordering. | Add focused Vitest tests around new SceneFrame/ScenePlan/narrator-packet modules plus turn-processor integration tests. [VERIFIED: backend/src/engine/__tests__/turn-processor.test.ts; backend/src/engine/__tests__/world-brain.test.ts] |
| P70-R8 | Document the engine-vs-LLM boundary and deferred future phases. | Boundary is locked in `70-CONTEXT.md`; keep Oracle fusion, global sim, scheduler rewrite, and UI work out of Phase 70A. [VERIFIED: 70-CONTEXT.md] |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- WorldForge is a Node.js/TypeScript backend plus Next.js frontend text RPG sandbox. [VERIFIED: CLAUDE.md]
- Backend stack is Hono, `@hono/node-ws`, TypeScript strict, Drizzle ORM, better-sqlite3, Vercel AI SDK, and Zod. [VERIFIED: CLAUDE.md; backend/package.json]
- LLMs must not directly modify game state; backend validates structured tool calls before execution. [VERIFIED: CLAUDE.md; backend/src/engine/tool-executor.ts]
- Use Zod schemas for AI tool definitions and API payloads. [VERIFIED: CLAUDE.md; backend/src/engine/tool-schemas.ts]
- Prefer AI SDK functions such as `streamText` and `generateText` over raw provider fetches. [VERIFIED: CLAUDE.md; backend/src/engine/npc-agent.ts:438]
- Use Drizzle query builder rather than raw SQL for normal code changes. [VERIFIED: CLAUDE.md; backend/src/engine/tool-executor.ts]
- Route handlers should wrap body logic in outer try/catch and use route helper validation patterns. [VERIFIED: CLAUDE.md; backend/src/routes/chat.ts]
- Shared types/constants should live in `@worldforge/shared` when they are cross-package. [VERIFIED: CLAUDE.md]
- GitNexus is indexed for WorldForge and must be used before editing symbols; index freshness was checked and reported current commit `9e3cb4b` equals indexed commit `9e3cb4b`. [VERIFIED: npx gitnexus status; gitnexus://repo/WorldForge/context]
- Before implementation edits, run `gitnexus_impact` for each modified symbol and run `gitnexus_detect_changes()` before commit. [VERIFIED: CLAUDE.md]

## Current Post-Phase-69 Data Flow

Normal player action path today [VERIFIED: backend/src/routes/chat.ts; backend/src/engine/turn-processor.ts]:

```text
POST /api/chat/action
  -> tryBeginTurn + captureSnapshot
  -> processTurn()
     -> load campaign state/player/tick
     -> detectMovement()
     -> resolveActionTargetContext()
     -> derive combat envelope
     -> callOracle()
     -> runWorldBrainSceneDirection()
     -> assembleJudgeAdjudicationPrompt()
     -> runHiddenAdjudicationPlan()
     -> executeAdjudicationPlan()
     -> onBeforeVisibleNarration()
        -> tickPresentNpcs()
     -> assembleAuthoritativeScene()
     -> assembleFinalNarrationPrompt()
     -> runVisibleNarrationWithGuard()
     -> advance tick + onPostTurn()
  -> append last snapshot or restore on error
```

Exact code surfaces that must change [VERIFIED: code audit]:

| File | Current responsibility | Phase 70A change |
|------|------------------------|------------------|
| `backend/src/routes/chat.ts` | Captures snapshots, calls `processTurn()`, injects `onBeforeVisibleNarration()` that runs `tickPresentNpcs()`, and runs rollback-critical post-turn background work. [VERIFIED: backend/src/routes/chat.ts:580; backend/src/routes/chat.ts:622; backend/src/routes/chat.ts:627] | Stop injecting present-NPC mini-rounds on normal visible action/retry. Keep snapshot, retry, turn lock, and `onPostTurn()` behavior. |
| `backend/src/engine/turn-processor.ts` | Orchestrates Oracle, World Brain, hidden adjudication, present-scene hook, final narration, tick advance, and post-turn hook. [VERIFIED: backend/src/engine/turn-processor.ts:684; backend/src/engine/turn-processor.ts:937; backend/src/engine/turn-processor.ts:1004; backend/src/engine/turn-processor.ts:1108] | Replace World Brain + hidden adjudication + present-scene hook with SceneFrame/ScenePlan/validator/executor/narrator packet. Keep Oracle and rollback semantics. |
| `backend/src/engine/world-brain.ts` | Produces focal/background actors, causal beats, and narration guardrails via structured Judge output. [VERIFIED: backend/src/engine/world-brain.ts:23; backend/src/engine/world-brain.ts:365] | Do not delete in Phase 70A; bypass on normal visible-turn path after ScenePlan lands. Reuse loose/strict repair pattern. |
| `backend/src/engine/hidden-adjudication.ts` | Produces and executes a structured `HiddenAdjudicationPlan` over runtime tools. [VERIFIED: backend/src/engine/hidden-adjudication.ts:13; backend/src/engine/hidden-adjudication.ts:127] | Reuse schema/execution ideas; either generalize action execution or wrap ScenePlan actions into existing execution path. |
| `backend/src/engine/npc-agent.ts` | Runs one independent LLM/tool loop per present key NPC through `tickPresentNpcs()`. [VERIFIED: backend/src/engine/npc-agent.ts:511] | Keep for offscreen/background use, but remove from visible-turn critical path. |
| `backend/src/engine/scene-presence.ts` | Resolves awareness bands and knowledge basis from deterministic stored state. [VERIFIED: backend/src/engine/scene-presence.ts:1; backend/src/engine/scene-presence.ts:136] | Reuse as the canonical visibility and actor eligibility primitive for SceneFrame and narrator packet. |
| `backend/src/engine/scene-assembly.ts` | Gathers authoritative scene, recent events, effects, presence, and player-perceivable consequences. [VERIFIED: backend/src/engine/scene-assembly.ts:606] | Reuse its event/effect gathering, but make SceneFrame and narrator packet explicit rather than relying on final prompt assembly to infer visibility. |
| `backend/src/engine/prompt-assembler.ts` | Builds hidden-tool-driving and final-visible prompts, including final narration prompt. [VERIFIED: backend/src/engine/prompt-assembler.ts:1191; backend/src/engine/prompt-assembler.ts:1352] | Add or route through a narrator-packet prompt builder that refuses raw hidden plan, hidden rationale, and non-visible actor names. |
| `backend/src/engine/tool-schemas.ts` | Defines runtime tool Zod schemas and `RuntimeToolName`. [VERIFIED: backend/src/engine/tool-schemas.ts:123] | Use as the only allowed action input schema source for ScenePlan actions. |
| `backend/src/engine/tool-executor.ts` | Validates and applies tool calls with deterministic result objects. [VERIFIED: backend/src/engine/tool-executor.ts:1174] | Keep as the commit path; add preflight validator before calling it so bad ScenePlan references fail before mutations. |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.9.3 in project | Runtime orchestration and typed engine contracts. | Project is strict TypeScript; new SceneFrame/ScenePlan types should be explicit engine contracts. [VERIFIED: backend/package.json; CLAUDE.md] |
| `ai` | Project declares `^6.0.106`; npm latest checked as `6.0.168` published 2026-04-16 | AI SDK structured generation/tool calling. | Existing code already uses AI SDK role providers and structured generation; do not introduce a second LLM client. [VERIFIED: backend/package.json; npm registry; CITED: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data] |
| `zod` | Project declares `^4.3.6`; npm latest checked as `4.3.6` | Runtime schemas for model output and tool inputs. | Existing World Brain, hidden adjudication, tool schemas, and route payloads use Zod. [VERIFIED: backend/package.json; npm registry; CITED: https://zod.dev/packages/zod] |
| Hono | Project declares `^4.12.3`; npm latest checked as `4.12.15` published 2026-04-24 | Backend routing/SSE shell. | Phase 70 changes are inside existing chat route and engine modules; no route framework change is needed. [VERIFIED: backend/package.json; npm registry; backend/src/routes/chat.ts] |
| Vitest | Project declares `^3.2.4`; npm latest checked as `4.1.5` published 2026-04-21 | Backend unit/integration tests. | Existing engine tests use Vitest; do not upgrade test framework inside this architecture phase. [VERIFIED: backend/package.json; npm registry; backend/src/engine/__tests__] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Drizzle ORM | Project dependency | Query campaign DB state and persist tool effects. | Use inside SceneFrame builder and any new storage access; avoid raw SQL. [VERIFIED: backend/package.json; CLAUDE.md] |
| better-sqlite3 | Project dependency | Local campaign DB backing store. | Existing source of truth for campaign state. [VERIFIED: CLAUDE.md; backend/package.json] |
| `@worldforge/shared` | Workspace package | Cross-package types/constants. | Only move ScenePlan/packet types here if frontend needs them; Phase 70A can keep backend-only engine contracts local. [VERIFIED: CLAUDE.md; package.json] |
| GitNexus | Local project index current at commit `9e3cb4b` | Impact analysis and process tracing before implementation edits. | Required by project instructions before modifying symbols. [VERIFIED: npx gitnexus status; CLAUDE.md] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| AI SDK + Zod structured `ScenePlan` | Raw JSON parsed from `generateText()` | Rejected because existing code already uses structured schemas and retry/repair; raw parsing would weaken model-output trust boundaries. [VERIFIED: backend/src/engine/world-brain.ts:365; backend/src/engine/hidden-adjudication.ts:80] |
| Existing `executeToolCall()` | New ScenePlan-specific mutation executor | Rejected for Phase 70A because existing executor already validates references and returns structured success/error results. [VERIFIED: backend/src/engine/tool-executor.ts:1174] |
| Scene Planner of Record | Multi-agent present-NPC round | Rejected by locked Phase 70 consensus because it is the source of visible-turn fragmentation. [VERIFIED: 70-CONTEXT.md; 70-WORLD-SIMULATION-DATA-FLOW-CONSENSUS.md] |
| Minimal backend migration | Full LangGraph/agent-framework rewrite | Rejected because Phase 70 explicitly prefers existing engine migration and excludes global simulation rewrite. [VERIFIED: 70-CONTEXT.md] |

**Installation:**

```bash
# No new packages are required for Phase 70A.
npm --prefix backend run typecheck
```

**Version verification:** Recommended package versions were checked with `npm view` against the npm registry on 2026-04-25. [VERIFIED: npm registry]

## Architecture Patterns

### System Architecture Diagram

```text
Player action / retry request
  -> chat route turn lock + pre-turn snapshot
  -> processTurn
     -> deterministic state load
     -> movement/target/combat pre-analysis
     -> Oracle bounded outcome call (kept separate in Phase 70A)
     -> SceneFrame builder
        -> DB state, current tick, scene scope, actors, awareness, recent events, allowed tools
     -> Scene Planner Judge call
        -> strict ScenePlan object
     -> backend ScenePlan validator
        -> actor IDs, visibility, scene scope, Oracle bounds, tool schemas, movement paths
        -> invalid: throw before commit -> route restores snapshot
        -> valid: execute deterministic actions
     -> existing runtime tool executor
        -> committed state changes + emitted events/effects
     -> CanonicalTurnPacket
        -> committed effects, event order, scene stopping point, debug-safe summaries
     -> NarratorPacket filter
        -> only player-perceivable actors, facts, consequences, and allowed names
     -> Storyteller final visible prose
     -> append narration, advance tick, run rollback-critical post-turn background work
```

This flow keeps input, determination, committed result, and narration in that order. [VERIFIED: 70-WORLD-SIMULATION-DATA-FLOW-CONSENSUS.md; VERIFIED: backend/src/engine/turn-processor.ts]

### Recommended Project Structure

```text
backend/src/engine/
├── scene-frame.ts              # Deterministic per-turn situation packet builder.
├── scene-planner.ts            # ScenePlan schema, prompt, safeGenerateObject call, repair.
├── scene-plan-validator.ts     # Pure validation against SceneFrame, Oracle result, and tool schemas.
├── scene-turn-packet.ts        # CanonicalTurnPacket and NarratorPacket builders.
├── prompt-assembler.ts         # Add final-visible narrator-packet prompt path.
├── turn-processor.ts           # Wire SceneFrame -> Oracle -> ScenePlan -> execute -> narration.
└── __tests__/
    ├── scene-frame.test.ts
    ├── scene-planner.test.ts
    ├── scene-plan-validator.test.ts
    ├── scene-turn-packet.test.ts
    └── turn-processor.scene-plan.test.ts
```

The module split is recommended because the planner, validator, and packet builder have different failure modes and test dimensions. [ASSUMED: proposed implementation structure; VERIFIED: existing backend/src/engine module layout]

### Pattern 1: Strict Structured Planning With Repair

**What:** Use a Zod schema for ScenePlan, allow one loose/repair path if needed, then require strict parse before validation. [VERIFIED: backend/src/engine/world-brain.ts:23; backend/src/engine/world-brain.ts:365]

**When to use:** Use for `ScenePlan`, not for final prose. [VERIFIED: backend/src/engine/hidden-adjudication.ts:80; backend/src/engine/prompt-assembler.ts:1352]

**Example:**

```typescript
// Source: existing pattern in backend/src/engine/world-brain.ts and hidden-adjudication.ts.
const scenePlan = await safeGenerateObject({
  provider,
  role: "judge",
  messages,
  schema: scenePlanLooseSchema,
  temperature: 0.1,
  maxOutputTokens: 1800,
  maxRetries: 2,
});

const parsed = scenePlanSchema.safeParse(scenePlan.object);
if (!parsed.success) {
  throw new Error(`ScenePlan failed strict parse: ${parsed.error.message}`);
}
```

### Pattern 2: Plan-Only Model, Deterministic Commit

**What:** The model may propose ordered actions, but commit still goes through `executeToolCall()` and existing tool schemas. [VERIFIED: backend/src/engine/hidden-adjudication.ts:127; backend/src/engine/tool-executor.ts:1174]

**When to use:** Every ScenePlan effect that mutates campaign state. [VERIFIED: backend/src/engine/tool-schemas.ts:123]

**Example:**

```typescript
// Source: existing execution pattern in backend/src/engine/hidden-adjudication.ts.
for (const action of scenePlan.actions) {
  const schema = runtimeToolInputSchemas[action.toolName];
  const parsedInput = schema.safeParse(action.input);
  if (!parsedInput.success) throw new Error(parsedInput.error.message);

  const result = await executeToolCall(campaignId, action.toolName, parsedInput.data, judgeProvider);
  if (!result.success) throw new Error(result.message);
}
```

### Pattern 3: Visibility as a Backend Contract

**What:** Use `resolveScenePresence()` and player awareness bands to decide what the narrator can receive. [VERIFIED: backend/src/engine/scene-presence.ts:136; backend/src/engine/scene-assembly.ts:494]

**When to use:** SceneFrame actor roster, ScenePlan actor eligibility, and narrator packet filtering. [VERIFIED: backend/src/engine/prompt-assembler.ts:802]

**Example:**

```typescript
// Source: existing concepts in scene-presence.ts and scene-assembly.ts.
const allowedVisibleActorIds = new Set(
  frame.roster.active
    .filter((actor) => frame.perception.playerByActorId[actor.id] === "clear")
    .map((actor) => actor.id),
);

const narratorActors = canonicalPacket.actors.filter((actor) =>
  allowedVisibleActorIds.has(actor.id),
);
```

### Pattern 4: Fail Loud Before Commit, Let Route Roll Back

**What:** Validation failure should throw before state mutation, so the route-level snapshot restore path remains the single rollback mechanism. [VERIFIED: backend/src/routes/chat.ts:580; backend/src/routes/chat.ts:658; backend/src/routes/chat.ts:890]

**When to use:** Invalid actor IDs, invalid tool names, tool input schema failure, impossible movement, forbidden HP mutation, hidden fact leak in narrator packet, or model output parse failure. [VERIFIED: backend/src/engine/tool-executor.ts:887; backend/src/engine/tool-executor.ts:987]

### Anti-Patterns to Avoid

- **Independent present-NPC mini-round after judge commit:** This is the current fragmentation point and must leave the normal visible path. [VERIFIED: backend/src/routes/chat.ts:297; backend/src/engine/npc-agent.ts:511]
- **Letting final narration infer causality from final state:** The narrator must receive ordered committed events and visible consequences, not reconstruct hidden sequence from state dumps. [VERIFIED: 70-WORLD-SIMULATION-DATA-FLOW-CONSENSUS.md]
- **Putting visibility rules in prompt text only:** Prompt rules exist today, but Phase 70 needs deterministic narrator-packet filtering and optional output guard checks. [VERIFIED: backend/src/engine/prompt-assembler.ts:802]
- **Adding a new global simulation scheduler in Phase 70A:** Deferred by user constraint. [VERIFIED: 70-CONTEXT.md]
- **Upgrading AI SDK/Vitest/Hono during this phase:** Package upgrades would add unrelated risk to an architecture-critical runtime migration. [VERIFIED: backend/package.json; npm registry]

## Migration Recommendation

The planner should use this sequence [VERIFIED: 70-CONTEXT.md; code audit]:

1. Add `SceneFrame` builder as a pure/deterministic engine module. [ASSUMED: file name; VERIFIED: existing data sources]
2. Add `ScenePlan` schema and generation path, reusing AI SDK structured generation and Zod. [VERIFIED: backend/src/engine/hidden-adjudication.ts:80]
3. Add a pure `validateScenePlan(scenePlan, frame, oracleResult, outcomeBounds)` function. [ASSUMED: function name; VERIFIED: validation responsibilities from 70-CONTEXT.md]
4. Add `executeScenePlan()` as a thin wrapper over existing tool execution. [ASSUMED: function name; VERIFIED: backend/src/engine/tool-executor.ts:1174]
5. Add `CanonicalTurnPacket` and `NarratorPacket` builders from committed events/effects and visibility. [ASSUMED: file/type names; VERIFIED: backend/src/engine/scene-assembly.ts:606]
6. Rewire `processTurn()` normal action path to use ScenePlan instead of World Brain + hidden adjudication + present-NPC hook. [VERIFIED: backend/src/engine/turn-processor.ts:937; backend/src/engine/turn-processor.ts:1004; backend/src/engine/turn-processor.ts:1108]
7. Remove `onBeforeVisibleNarration` injection from `/action` and `/retry` or make it a no-op for normal visible turns. [VERIFIED: backend/src/routes/chat.ts:622; backend/src/routes/chat.ts:856]
8. Keep `onPostTurn()` for offscreen/faction/reflection finalization after visible narration. [VERIFIED: backend/src/routes/chat.ts:286]
9. Keep `processOpeningScene()` unchanged except for regression tests; it does not currently run hidden adjudication or present-NPC mini-rounds. [VERIFIED: backend/src/engine/turn-processor.ts:1256]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Structured model output parsing | Regex/JSON substring extraction | AI SDK structured generation plus Zod schema | Existing code already uses schema-bound object generation and retries; raw parsing weakens trust boundaries. [VERIFIED: backend/src/engine/world-brain.ts:365; CITED: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data] |
| Runtime action validation | Ad hoc ScenePlan action switch | `runtimeToolInputSchemas` and `executeToolCall()` | Tool schemas and executor already validate references, movement, HP rules, reveal paths, and DB persistence. [VERIFIED: backend/src/engine/tool-schemas.ts:123; backend/src/engine/tool-executor.ts:1174] |
| Presence/visibility | Prompt-only "do not reveal" instructions | `resolveScenePresence()` and narrator-packet filtering | Awareness bands are deterministic and reusable; prompt text alone cannot enforce hidden fact boundaries. [VERIFIED: backend/src/engine/scene-presence.ts:136] |
| Rollback/retry | New local transaction system | Existing route snapshot capture/restore and retry paths | Current route already captures pre-turn snapshots and restores on processTurn failure/retry. [VERIFIED: backend/src/routes/chat.ts:580; backend/src/routes/chat.ts:816] |
| NPC local reaction orchestration | One LLM call per present NPC | One Scene Planner of Record | Locked Phase 70 decision removes uncoordinated mini-rounds from visible turn. [VERIFIED: 70-CONTEXT.md; backend/src/engine/npc-agent.ts:511] |
| Narrator hidden-fact safety | "Trust the Storyteller" | Player-perceivable committed packet + output guard checks | Final visible prompt already has filtering concepts; Phase 70 must make the packet explicit and enforceable. [VERIFIED: backend/src/engine/prompt-assembler.ts:1352] |

**Key insight:** The dangerous complexity is not an LLM making scene decisions; it is multiple LLM decision makers independently mutating one visible scene before narration. [VERIFIED: 70-WORLD-SIMULATION-DATA-FLOW-CONSENSUS.md]

## Runtime State Inventory

This phase is a runtime pipeline migration, not a data rename, but the planner still needs to know which non-file state can preserve old behavior. [VERIFIED: phase scope]

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Campaign databases store chat history, state rows, events, locations, actors, tags, relationships, and vectors; Phase 70A does not require a DB schema migration if deferred hooks stay in-memory or are omitted. [VERIFIED: CLAUDE.md; backend/src/engine/tool-executor.ts] | Code edit only for Phase 70A; do not add a deferred-hook table unless planner proves it is required. |
| Live service config | No external service configuration is required for ScenePlan beyond existing provider settings. [VERIFIED: CLAUDE.md; backend/src/routes/chat.ts] | None. |
| OS-registered state | No Windows service/task registration is part of the chat turn pipeline. [VERIFIED: code audit scope] | None. |
| Secrets/env vars | Existing LLM provider settings are used through provider resolution; Phase 70A does not require new secret names. [VERIFIED: backend/src/routes/chat.ts; CLAUDE.md] | None. |
| Build artifacts | No generated artifacts need renaming; normal TypeScript/Vitest outputs may need regeneration through existing scripts. [VERIFIED: package scripts; backend/package.json] | Run typecheck/tests after code changes. |

## Common Pitfalls

### Pitfall 1: Replacing World Brain but leaving `tickPresentNpcs()` in the hook

**What goes wrong:** Present NPCs still run independent tool-using mini-rounds after ScenePlan commit, recreating uncoordinated local consequences. [VERIFIED: backend/src/routes/chat.ts:297; backend/src/engine/npc-agent.ts:511]  
**Why it happens:** `tickPresentNpcs()` is injected by the route hook, not directly inside the World Brain or hidden adjudication modules. [VERIFIED: backend/src/routes/chat.ts:622]  
**How to avoid:** Remove or disable `onBeforeVisibleNarration` for normal action/retry when ScenePlan is active. [VERIFIED: 70-CONTEXT.md]  
**Warning signs:** Tests still observe `npcAgent` role calls or NPC tool calls between plan execution and final narration. [VERIFIED: backend/src/engine/npc-agent.ts:438]

### Pitfall 2: Treating Zod parse success as truth

**What goes wrong:** A structurally valid ScenePlan can reference an illegal actor, non-visible fact, disconnected location, or tool argument that should not be allowed this turn. [VERIFIED: backend/src/engine/tool-executor.ts:70; backend/src/engine/tool-executor.ts:887]  
**Why it happens:** Structured output constrains shape, not world legality. [CITED: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data; VERIFIED: backend/src/engine/tool-executor.ts]  
**How to avoid:** Run pure ScenePlan validation against SceneFrame before execution. [VERIFIED: 70-CONTEXT.md]  
**Warning signs:** Tool executor returns validation errors after some previous actions in the same plan already committed. [VERIFIED: backend/src/engine/hidden-adjudication.ts:127]

### Pitfall 3: Letting hidden or hint-level actors leak into final prose

**What goes wrong:** The player learns hidden actor names, motives, or offscreen causes that their character cannot perceive. [VERIFIED: backend/src/engine/scene-presence.ts:107; backend/src/engine/prompt-assembler.ts:802]  
**Why it happens:** Final prompt construction has rules, but current prompts can include broad context and logs; prompt text is not a hard boundary. [VERIFIED: backend/src/engine/prompt-assembler.ts:848; backend/src/engine/prompt-assembler.ts:1306]  
**How to avoid:** Build a narrator packet from player awareness and committed visible effects only, then optionally scan storyteller output for forbidden actor names/facts. [ASSUMED: output guard implementation; VERIFIED: existing visibility primitives]  
**Warning signs:** Final narration mentions an actor with player awareness `none` or expands a `hint` into a clear identity. [VERIFIED: backend/src/engine/scene-presence.ts:136]

### Pitfall 4: Over-broad scene scope

**What goes wrong:** ScenePlan treats every broad-location NPC as an active scene actor, causing crowd reactions or remote bleed. [VERIFIED: backend/src/engine/prompt-assembler.ts:730; backend/src/engine/scene-assembly.ts:494]  
**Why it happens:** Some existing builders gather broad-location NPCs before filtering by scene scope/awareness. [VERIFIED: backend/src/engine/prompt-assembler.ts:730]  
**How to avoid:** SceneFrame must classify `active`, `support`, and `background` actors and validate which roles may mutate the current local scene. [VERIFIED: 70-WORLD-SIMULATION-DATA-FLOW-CONSENSUS.md; ASSUMED: roster field names]  
**Warning signs:** A background actor changes HP/location/inventory without an explicit channel or planner-selected local consequence. [VERIFIED: 70-HANDOFF-WORLD-SIMULATION-AUDIT.md]

### Pitfall 5: Breaking retry/rollback by moving commit boundaries

**What goes wrong:** A failed ScenePlan validation or execution leaves partial DB changes or chat history state that retry cannot restore cleanly. [VERIFIED: backend/src/routes/chat.ts:580; backend/src/routes/chat.ts:658]  
**Why it happens:** `processTurn()` currently appends the user message before hidden adjudication execution; route snapshot restore is the safety net. [VERIFIED: backend/src/engine/turn-processor.ts:988; backend/src/routes/chat.ts:658]  
**How to avoid:** Keep validation before mutation, keep route snapshot restore, and make execution failure loud enough to trigger restore. [VERIFIED: backend/src/engine/hidden-adjudication.ts:1054; backend/src/routes/chat.ts:658]  
**Warning signs:** Retry repeats from a state after some ScenePlan actions but before narration. [VERIFIED: backend/src/routes/chat.ts:816]

### Pitfall 6: Latency regression from adding rather than replacing calls

**What goes wrong:** Phase 70 adds ScenePlan while still running World Brain, hidden plan, and present NPC ticks. [VERIFIED: current flow]  
**Why it happens:** It is tempting to add ScenePlan as another advisory layer. [ASSUMED: implementation risk]  
**How to avoid:** ScenePlan replaces World Brain + hidden adjudication + visible-turn present NPC ticks on the normal path. [VERIFIED: 70-CONTEXT.md]  
**Warning signs:** Normal turn still has Oracle + World Brain + Hidden Plan + N NPC calls + Storyteller. [VERIFIED: backend/src/engine/turn-processor.ts; backend/src/engine/npc-agent.ts]

## Code Examples

Verified patterns from existing code and official sources:

### ScenePlan Action Schema Reusing Runtime Tools

```typescript
// Source: backend/src/engine/hidden-adjudication.ts and backend/src/engine/tool-schemas.ts
export const scenePlanActionSchema = z.discriminatedUnion("toolName", [
  z.object({ toolName: z.literal("log_event"), input: runtimeToolInputSchemas.log_event }),
  z.object({ toolName: z.literal("move_to"), input: runtimeToolInputSchemas.move_to }),
  z.object({ toolName: z.literal("set_condition"), input: runtimeToolInputSchemas.set_condition }),
  z.object({ toolName: z.literal("offer_quick_actions"), input: runtimeToolInputSchemas.offer_quick_actions }),
]);
```

The exact list should be derived from `RuntimeToolName` and Phase 70A allowed tools, not duplicated manually if a helper can keep it typed. [ASSUMED: helper design; VERIFIED: backend/src/engine/tool-schemas.ts:123]

### ScenePlan Preflight Validator

```typescript
// Source: boundary required by 70-CONTEXT.md and existing executeToolCall behavior.
export function validateScenePlan(plan: ScenePlan, frame: SceneFrame): ValidatedScenePlan {
  for (const actorId of plan.actorIds) {
    if (!frame.allowedActorIds.has(actorId)) {
      throw new Error(`ScenePlan referenced unavailable actor: ${actorId}`);
    }
  }

  for (const action of plan.actions) {
    const schema = runtimeToolInputSchemas[action.toolName];
    const parsed = schema.safeParse(action.input);
    if (!parsed.success) {
      throw new Error(`Invalid ${action.toolName} input: ${parsed.error.message}`);
    }
  }

  return { ...plan, validatedAtTick: frame.tick };
}
```

This should be pure and side-effect-free so it can be tested without DB fixtures. [ASSUMED: proposed validator shape]

### Remove Present NPC Mini-Round From Normal Visible Path

```typescript
// Source: backend/src/routes/chat.ts currently injects this before final narration.
const onBeforeVisibleNarration =
  scenePlanEnabled ? undefined : buildOnBeforeVisibleNarration(...);
```

The actual implementation may delete the hook entirely after ScenePlan rollout; the required behavior is that normal action/retry does not call `tickPresentNpcs()` before final narration. [ASSUMED: exact rollout flag; VERIFIED: 70-CONTEXT.md; backend/src/routes/chat.ts:297]

### Narrator Packet Allow-List Guard

```typescript
// Source: existing final-visible prompt filtering plus required hidden-fact guard.
export function buildNarratorPacket(packet: CanonicalTurnPacket, frame: SceneFrame): NarratorPacket {
  return {
    tick: packet.tick,
    visibleActors: packet.actors.filter((actor) => frame.playerVisibleActorIds.has(actor.id)),
    visibleEvents: packet.events.filter((event) => event.playerPerceivable === true),
    allowedActorNames: [...frame.playerVisibleActorNames],
  };
}
```

The final storyteller prompt should be assembled from this packet, not from raw ScenePlan rationale or hidden adjudication details. [VERIFIED: 70-CONTEXT.md; backend/src/engine/prompt-assembler.ts:1352]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Storyteller decides/updates hidden world state during normal player turn | Judge-owned hidden adjudication plus Storyteller final visible prose | Phase 69 [VERIFIED: actual Phase 69 SUMMARY/VALIDATION files; backend/src/engine/hidden-adjudication.ts] | Phase 70 can preserve hidden-channel protections while replacing fragmented local scene authority. |
| Multiple local present NPCs each run an autonomous mini-round before final prose | One Scene Planner of Record selects local visible consequences | Phase 70 target [VERIFIED: 70-CONTEXT.md] | Prevents neutral-input escalation and separate NPC turns from being narrated as one coherent event. |
| Prompt-only narration guardrails | Backend narrator packet plus prompt guardrails | Phase 70 target [VERIFIED: 70-CONTEXT.md; backend/src/engine/prompt-assembler.ts] | Makes hidden-fact leakage testable. |
| Oracle fusion into one all-purpose scene call | Keep Oracle separate for Phase 70A | Phase 70 locked decision [VERIFIED: 70-CONTEXT.md] | Reduces risk by preserving existing combat/outcome validation path. |

**External design alignment:** The consensus document maps the target flow to "declare, determine, describe", situation-first preparation, ReAct-style bounded action, and generative-agent observation/planning/reflection separation. [VERIFIED: 70-WORLD-SIMULATION-DATA-FLOW-CONSENSUS.md; CITED: https://arxiv.org/abs/2210.03629; CITED: https://arxiv.org/abs/2304.03442]

**Deprecated/outdated for Phase 70A:**

- `tickPresentNpcs()` as a normal visible-turn hook: keep the function for background/offscreen paths, but remove it from the visible critical path. [VERIFIED: backend/src/engine/npc-agent.ts:511; 70-CONTEXT.md]
- Raw hidden plan/rationale in final narration inputs: final prose must see only player-perceivable committed facts. [VERIFIED: 70-CONTEXT.md; backend/src/engine/prompt-assembler.ts:1352]
- Adding new simulation subsystems before solving local scene authority: deferred by Phase 70 constraints. [VERIFIED: 70-CONTEXT.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | New files should be `scene-frame.ts`, `scene-planner.ts`, `scene-plan-validator.ts`, and `scene-turn-packet.ts`. | Recommended Project Structure | Low: planner can choose different names if responsibilities stay separate. |
| A2 | ScenePlan validator should be a pure function returning `ValidatedScenePlan`. | Code Examples | Medium: if validation needs DB lookups not already in SceneFrame, tests become more integration-heavy. |
| A3 | No new DB table is required for deferred hooks in Phase 70A. | Runtime State Inventory | Medium: if planner requires persistent hooks, a tiny migration may be needed, but context says avoid unless clearly needed. |
| A4 | A feature flag may be useful for hook removal rollout. | Code Examples | Low: direct removal is acceptable if tests cover the normal path. |

## Open Questions (RESOLVED)

1. **Should `detectMovement()` stay before ScenePlan in Phase 70A?**
   - Decision: no LLM-based movement detection or movement mutation should run before `buildSceneFrame()` on the ScenePlan path. The SceneFrame is built after deterministic state loading and candidate gathering, before Oracle and before any ScenePlan LLM call. [RESOLVED: preserve `SceneFrame -> Oracle -> ScenePlan` ordering]
   - Implementation rule: keep deterministic movement and target candidates in `SceneFrame`, then let ScenePlan interpret whether the player intends movement and validate any actual movement through `move_to`/existing tool execution. [VERIFIED: backend/src/engine/tool-executor.ts:887]
   - Migration note: current `detectMovement()` can remain for legacy/opening/no-ScenePlan paths if needed, but normal action/retry ScenePlan path must assert `buildSceneFrame` occurs before `callOracle`, and actual movement occurs only after `validateScenePlan()`. [VERIFIED: backend/src/engine/turn-processor.ts:764]

2. **Should ScenePlan support persistent deferred hooks in the first cut?**
   - Decision: no new persistent deferred-hook schema in Phase 70A. `deferredHooks` are bounded semantic metadata emitted in the canonical turn packet/logs for later background processing or documentation, not a new durability subsystem. [RESOLVED: scope control]
   - Implementation rule: only existing validated runtime tools may mutate persistent state in Phase 70A. If an executor believes a new deferred-hook table is required, it must stop and split that into a later phase. [VERIFIED: 70-CONTEXT.md]

3. **Should final storyteller output be post-validated for forbidden names?**
   - Decision: yes. Phase 70A must implement deterministic Storyteller output guard validation after final prose generation and before assistant message persistence. [RESOLVED: required security gate]
   - Implementation rule: `NarratorPacket` carries internal guard metadata such as `forbiddenActorNames` and `forbiddenFactMarkers` for backend scanning only. These forbidden terms must not be included in the Storyteller prompt. The output guard scans final prose for exact forbidden actor names and packet-forbidden fact markers. On first violation, retry final narration once with a generic guard addendum that does not reveal the forbidden term. On second violation, throw before `appendChatMessages()` so route snapshot restore handles rollback. [VERIFIED: backend/src/routes/chat.ts:658; backend/src/engine/prompt-assembler.ts:1352]
   - Scope rule: Phase 70A guards exact names/fact markers. Broader semantic leakage evaluation belongs to a later eval/audit phase after the deterministic packet boundary exists. [RESOLVED: maintainable first cut]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Backend scripts/tests | yes | v23.11.0 | none needed [VERIFIED: node --version] |
| npm | Package/version checks and scripts | yes | 11.12.1 | none needed [VERIFIED: npm --version] |
| GitNexus index | Impact analysis before implementation | yes | 2256 symbols, 6377 relationships, 179 flows; commit current | Run `npx gitnexus analyze` if stale. [VERIFIED: gitnexus://repo/WorldForge/context] |
| `.planning/graphs/graph.json` | Optional GSD graph context | no | none | Use GitNexus and direct code audit. [VERIFIED: ls .planning/graphs/graph.json returned no file] |
| AI-SPEC.md | AI guardrail source | no | none | This research includes AI guardrail implications directly. [VERIFIED: Test-Path .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/AI-SPEC.md returned False] |
| Vitest | Backend validation | yes | Project declares `^3.2.4` | Use existing test scripts; do not upgrade in Phase 70. [VERIFIED: backend/package.json] |

**Missing dependencies with no fallback:**

- None for research or planning. [VERIFIED: environment audit]

**Missing dependencies with fallback:**

- AI-SPEC.md is absent; use this research as Phase 70A AI guardrail input. [VERIFIED: Test-Path result]
- GSD graph JSON is absent; GitNexus is current and was used for code intelligence. [VERIFIED: npx gitnexus status]

## Validation Architecture

Nyquist validation is enabled because `.planning/config.json` has `workflow.nyquist_validation: true`. [VERIFIED: .planning/config.json]

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest, project declared `^3.2.4` [VERIFIED: backend/package.json] |
| Config file | Use existing backend Vitest configuration/package scripts. [VERIFIED: backend/package.json] |
| Quick run command | `cd backend && npx vitest run src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/scene-turn-packet.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts` [ASSUMED: new test file names] |
| Full suite command | `npm --prefix backend test` [VERIFIED: backend/package.json] |
| Typecheck command | `npm --prefix backend run typecheck` [VERIFIED: CLAUDE.md; backend/package.json] |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| P70-R1 | SceneFrame includes tick, player, scene scope, active/support/background actors, awareness bands, recent events, target/movement candidates, and allowed tools. | unit | `cd backend && npx vitest run src/engine/__tests__/scene-frame.test.ts` | no - Wave 0 |
| P70-R2 | Invalid ScenePlan shape retries/repairs and ultimately fails loud when strict parse fails. | unit | `cd backend && npx vitest run src/engine/__tests__/scene-planner.test.ts` | no - Wave 0 |
| P70-R3 | Validated ScenePlan actions execute through runtime tool schemas/executor; invalid references fail before partial commit. | unit/integration | `cd backend && npx vitest run src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/tool-executor.test.ts` | partial - Wave 0 for validator |
| P70-R4 | Normal `/action` and `/retry` do not call `tickPresentNpcs()` before final narration when ScenePlan path is active. | integration | `cd backend && npx vitest run src/engine/__tests__/turn-processor.scene-plan.test.ts src/routes/__tests__/chat*.test.ts` | no - Wave 0 |
| P70-R5 | Oracle remains a separate call and ScenePlan receives/obeys outcome bounds. | integration | `cd backend && npx vitest run src/engine/__tests__/turn-processor.scene-plan.test.ts` | no - Wave 0 |
| P70-R6 | NarratorPacket excludes actors/facts with player awareness `none` and does not expand `hint` to clear identity. | unit | `cd backend && npx vitest run src/engine/__tests__/scene-turn-packet.test.ts src/engine/__tests__/scene-presence.test.ts` | partial - Wave 0 for packet |
| P70-R7 | Neutral input does not escalate through independent NPC mini-round; actor legality, hidden leakage, and canonical ordering are covered. | integration/regression | `cd backend && npx vitest run src/engine/__tests__/turn-processor.scene-plan.test.ts` | no - Wave 0 |
| P70-R8 | Engine-vs-LLM boundary and deferred work are documented in plan and tests cover the boundary. | doc/test review | `rg "Scene Planner of Record|Engine-owned|LLM-owned" .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow backend/src/engine` | no - Wave 0 |

### Concrete Validation Dimensions

- **Data-flow ordering:** Assert `ScenePlan` validation happens before runtime tool execution, final narration happens after committed packet build, and tick advance remains after narration. [VERIFIED: backend/src/engine/turn-processor.ts:1004; backend/src/engine/turn-processor.ts:1198]
- **No present-NPC critical mini-round:** Mock/spy `tickPresentNpcs()` and prove normal action/retry paths do not call it. [VERIFIED: backend/src/routes/chat.ts:297]
- **Actor legality:** A ScenePlan actor not in SceneFrame allowed roster fails before tool execution. [VERIFIED: 70-CONTEXT.md]
- **Tool legality:** A ScenePlan action with invalid `RuntimeToolName` or invalid input fails Zod validation before DB mutation. [VERIFIED: backend/src/engine/tool-schemas.ts:123]
- **Visibility leakage:** A hidden actor name present in SceneFrame but awareness `none` does not appear in NarratorPacket or final prompt input. [VERIFIED: backend/src/engine/scene-presence.ts:136]
- **Outcome-bound preservation:** A strong-hit Oracle result cannot be converted into forbidden HP loss or impossible movement. [VERIFIED: backend/src/engine/tool-executor.ts:987]
- **Retry/rollback:** Failed ScenePlan validation and failed execution both restore the same pre-turn snapshot path as current failures. [VERIFIED: backend/src/routes/chat.ts:658; backend/src/routes/chat.ts:890]
- **Latency budget:** Normal turn should replace existing World Brain + hidden plan + N present NPC calls with one ScenePlan call, not add to them. [VERIFIED: current flow; 70-CONTEXT.md]
- **Prompt drift:** Final prompt input is built from NarratorPacket fields and does not include raw hidden rationale, full ScenePlan, or raw broad world state. [VERIFIED: backend/src/engine/prompt-assembler.ts:1352]

### Sampling Rate

- **Per task commit:** `npm --prefix backend run typecheck` plus targeted Vitest command for touched modules. [VERIFIED: CLAUDE.md; backend/package.json]
- **Per wave merge:** `npm --prefix backend test`. [VERIFIED: backend/package.json]
- **Phase gate:** Full backend test suite green, targeted ScenePlan regression suite green, and `gitnexus_detect_changes({scope: "all"})` confirms expected symbol/process impact before commit. [VERIFIED: CLAUDE.md]

### Wave 0 Gaps

- [ ] `backend/src/engine/__tests__/scene-frame.test.ts` - covers P70-R1. [ASSUMED: new test file]
- [ ] `backend/src/engine/__tests__/scene-planner.test.ts` - covers P70-R2 and repair/failure behavior. [ASSUMED: new test file]
- [ ] `backend/src/engine/__tests__/scene-plan-validator.test.ts` - covers P70-R3/P70-R5 actor/tool/outcome legality. [ASSUMED: new test file]
- [ ] `backend/src/engine/__tests__/scene-turn-packet.test.ts` - covers P70-R6 hidden leakage and visible packet filtering. [ASSUMED: new test file]
- [ ] `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts` - covers P70-R4/P70-R7 canonical ordering and no present-NPC mini-round. [ASSUMED: new test file]
- [ ] Optional route retry test if existing route tests can cheaply cover `/api/chat/retry` ScenePlan parity. [ASSUMED: test scope]

## Security Threat Model

Phase 70 is security-relevant because model output crosses trust boundaries into tool execution and player-visible narration. [VERIFIED: backend/src/engine/tool-executor.ts; backend/src/engine/prompt-assembler.ts]

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no for Phase 70 | No auth change in this phase. [VERIFIED: phase scope] |
| V3 Session Management | no for Phase 70 | No session/cookie change in this phase. [VERIFIED: phase scope] |
| V4 Access Control | yes, internal world-state access control | SceneFrame actor allow-list, awareness bands, and narrator visible fact allow-list. [VERIFIED: backend/src/engine/scene-presence.ts] |
| V5 Input Validation | yes | Zod schemas for ScenePlan and runtime tool inputs, plus pure backend validator. [VERIFIED: backend/src/engine/tool-schemas.ts; CITED: https://zod.dev/packages/zod] |
| V6 Cryptography | no for Phase 70 | No crypto/secrets changes. [VERIFIED: phase scope] |
| V8 Data Protection | yes, hidden game state | Do not pass hidden facts/rationale to final narrator packet or client-visible stream. [VERIFIED: 70-CONTEXT.md; backend/src/engine/prompt-assembler.ts] |
| V12 File/Resource Handling | yes, indirectly | Tool execution must only mutate campaign resources through existing validated executor. [VERIFIED: backend/src/engine/tool-executor.ts] |

### Trust Boundaries

| Boundary | Untrusted/Input Side | Trusted/Authority Side | Required Guard |
|----------|----------------------|------------------------|----------------|
| Player input -> Judge/Scene Planner | Freeform player action can contain prompt injection or misleading claims. [VERIFIED: backend/src/routes/chat.ts] | SceneFrame and backend validator. | Treat player text as data inside prompts; validate plan against DB-derived state. |
| ScenePlan model output -> tool execution | Model can invent actors, tools, locations, or hidden facts. [VERIFIED: model-output risk; backend/src/engine/hidden-adjudication.ts] | `validateScenePlan()` + `runtimeToolInputSchemas` + `executeToolCall()`. | Strict parse, actor/tool allow-lists, side-effect-free preflight. |
| Hidden state -> final narrator | SceneFrame may include hidden/hint actors and facts for planning. [VERIFIED: backend/src/engine/scene-presence.ts] | NarratorPacket. | Filter by player awareness and allowed visible facts before final prompt. |
| Storyteller output -> client | Storyteller can reveal forbidden names or invent facts. [VERIFIED: LLM output behavior; CITED: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data] | Output guard/retry path. | Scan exact forbidden actor names and packet-forbidden facts; retry/fail according to policy. |
| Logs/debug prompts -> local files | Prompt dumps and hidden rationale can store sensitive hidden facts. [VERIFIED: backend/src/engine/prompt-assembler.ts:1306; backend/src/engine/turn-processor.ts:1017] | Observability policy. | Avoid logging full hidden ScenePlan/rationale by default; log IDs, counts, and hashes unless debug is explicit. |

### Known Threat Patterns for Phase 70

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Player prompt injection asks the Judge/Storyteller to ignore visibility or reveal hidden actors. | Tampering / Information Disclosure | SceneFrame-derived validator and NarratorPacket allow-list; player text cannot grant visibility. [VERIFIED: backend/src/engine/scene-presence.ts] |
| ScenePlan references an invented actor, broad-location actor, or hidden actor as active. | Tampering | Validate actor IDs against SceneFrame active/support/background rules and channel existence. [VERIFIED: 70-CONTEXT.md] |
| ScenePlan calls a runtime tool with malformed input or impossible state transition. | Tampering | Zod input schemas and existing `executeToolCall()` state checks. [VERIFIED: backend/src/engine/tool-schemas.ts; backend/src/engine/tool-executor.ts] |
| Narration leaks hidden motive, hidden NPC, hidden location, or offscreen faction cause. | Information Disclosure | Build final prompt from NarratorPacket only; scan output for forbidden exact actor names. [VERIFIED: backend/src/engine/prompt-assembler.ts; ASSUMED: output scan implementation] |
| Autonomous NPC mini-round creates unreviewed side effects after canonical plan. | Elevation of Privilege / Tampering | Remove `tickPresentNpcs()` from visible critical path; present NPC actions must be chosen by ScenePlan and validated. [VERIFIED: backend/src/routes/chat.ts:297] |
| Partial plan execution fails mid-way and leaves inconsistent state. | Tampering / Repudiation | Preflight all actions before first mutation where possible; rely on route snapshot restore on thrown execution failure. [VERIFIED: backend/src/routes/chat.ts:658] |
| Debug logs expose hidden planning rationale or full hidden prompts. | Information Disclosure | Reduce normal logs to IDs/counts; keep full hidden prompt dumps only behind explicit debug flag. [VERIFIED: backend/src/engine/prompt-assembler.ts:1306; backend/src/engine/turn-processor.ts:1017] |

## Sources

### Primary (HIGH confidence)

- `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-CONTEXT.md` - locked decisions, boundaries, requirements, deferred work. [VERIFIED: file read]
- `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-WORLD-SIMULATION-DATA-FLOW-CONSENSUS.md` - consensus diagnosis and target flow. [VERIFIED: file read]
- `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-HANDOFF-WORLD-SIMULATION-AUDIT.md` - engine-vs-LLM audit framing. [VERIFIED: file read]
- `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-CONTEXT-DRAFT.md` and `70-DISCUSSION-LOG.md` - design discussion context. [VERIFIED: file read]
- Actual prior phase docs: `.planning/phases/68-world-brain-hidden-adjudication-and-scene-direction/68-SUMMARY.md`, `.planning/phases/69-judge-owned-hidden-pass-migration-and-narrator-only-runtime/69-SUMMARY.md`, `.planning/phases/69-judge-owned-hidden-pass-migration-and-narrator-only-runtime/69-VALIDATION.md`. [VERIFIED: file read]
- Required but absent prior phase paths from context: `.planning/phases/69-storyteller-hidden-channel-removal-and-tool-call-enforcement/...` and `.planning/phases/68-player-perspective-filtering-and-narration-boundary/...` did not exist in this checkout; actual canonical Phase 68/69 dirs above were used. [VERIFIED: Test-Path/file audit]
- `backend/src/routes/chat.ts`, `turn-processor.ts`, `world-brain.ts`, `hidden-adjudication.ts`, `scene-assembly.ts`, `npc-agent.ts`, `scene-presence.ts`, `prompt-assembler.ts`, `tool-schemas.ts`, `tool-executor.ts`. [VERIFIED: file read]
- `CLAUDE.md` and `AGENTS.md` - project constraints and GitNexus requirements. [VERIFIED: file read]
- `npx gitnexus status` and `gitnexus://repo/WorldForge/context` - index current at commit `9e3cb4b`. [VERIFIED: command/tool]
- npm registry checks for `ai`, `zod`, `vitest`, and `hono`. [VERIFIED: npm registry]

### Secondary (MEDIUM confidence)

- AI SDK structured data docs - structured output generation behavior and schema-driven object generation. [CITED: https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data]
- AI SDK tool calling docs - tool calling is a standard AI SDK capability, but Phase 70 should reuse existing local wrappers. [CITED: https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling]
- Zod package docs - runtime schema validation. [CITED: https://zod.dev/packages/zod]
- OpenAI Structured Outputs announcement - external support for schema-constrained model output; backend validation still required. [CITED: https://openai.com/index/introducing-structured-outputs-in-the-api/]

### Tertiary (LOW confidence)

- None used as authoritative implementation facts. [VERIFIED: source review]

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH - package files, npm registry, and project docs agree; no new dependency is recommended. [VERIFIED: backend/package.json; npm registry; CLAUDE.md]
- Architecture: HIGH for current flow and migration boundary; consensus and code audit agree on the critical path. [VERIFIED: 70-CONTEXT.md; backend/src/engine/turn-processor.ts; backend/src/routes/chat.ts]
- Exact file/function names: MEDIUM - responsibilities are locked, but final names should be confirmed during planning/impact analysis. [ASSUMED: proposed project structure]
- Pitfalls: HIGH for present-NPC fragmentation, rollback, hidden leakage, and tool legality; each maps to current code surfaces. [VERIFIED: backend/src/engine/npc-agent.ts; backend/src/routes/chat.ts; backend/src/engine/tool-executor.ts]
- Security threat model: MEDIUM-HIGH - trust boundaries are clear, but exact output guard policy still needs implementation choice. [VERIFIED: code audit; ASSUMED: output scan policy]

**Research date:** 2026-04-25 [VERIFIED: current session date]  
**Valid until:** 2026-05-25 for code-flow findings if the branch does not change; 2026-05-02 for npm "latest" version claims. [ASSUMED: freshness estimate]
