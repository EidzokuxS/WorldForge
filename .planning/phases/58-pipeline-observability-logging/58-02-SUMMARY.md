---
phase: 58-pipeline-observability-logging
plan: 02
subsystem: observability
tags: [observability, pipeline-seams, withRole, log-event, judge-wrapper, storyteller, oracle, npcAgent, reflection, embedder, vector-write, db-write]

# Dependency graph
requires:
  - phase: 58
    plan: 01
    provides: createLogger(tag).event API, withRole nesting, AsyncLocalStorage TurnContext, serializePayload truncation
provides:
  - 14 engine/vector/ai pipeline seams emit structured `log.event(...)` records
  - Text-delta stream parts aggregated into a single `storyteller.hidden.stream` event per turn
  - Every `ObservabilityRoleToggles` role has at least one `withRole(...)` site
  - Judge wrapper nests inside oracle (`oracle.ts`) and reflection (`reflection-agent.ts`)
  - 35 `db.write` events across 7 engine files covering every SQLite write call-site listed in Plan 58-02 Task 2 table
  - `llm.attempt` event per retry iteration in `safeGenerateObject`
  - `npcOffscreen.batch` extension seam (wrapped in `withRole("npcAgent", ...)`)
affects: [58-03, 58-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pattern: Atomic `log.event(eventName, payload)` call sites at each pipeline seam — no control-flow changes, emissions are additive"
    - "Pattern: Per-role wrapper at role boundary — `withRole(role, asyncFn)` around the smallest unit that defines the role's scope; judge nested inside oracle/reflection around ONLY the LLM call"
    - "Pattern: Single `try/finally` per tool call emits one `tool.call` event with toolName/args/result/latencyMs — captures successes, failures, and errors uniformly"
    - "Pattern: Aggregated stream event — count text-delta parts inside the for-await loop but emit ONE summary event at stream end, preventing disk flood"
    - "Pattern: Per-write-site `db.write` event immediately after each `.run()` — one event per call site, not per transaction, so call-site coverage is grep-verifiable"
    - "Pattern: Internal helper refactor for role wrap — public `tickNpcAgent` wraps `withRole('npcAgent', () => tickNpcAgentInternal(...))` so the entire body runs inside the role frame without changing the external signature"

key-files:
  created: []
  modified:
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/oracle.ts
    - backend/src/engine/tool-executor.ts
    - backend/src/engine/npc-agent.ts
    - backend/src/engine/reflection-agent.ts
    - backend/src/engine/faction-tools.ts
    - backend/src/engine/npc-tools.ts
    - backend/src/engine/npc-offscreen.ts
    - backend/src/engine/reflection-tools.ts
    - backend/src/engine/reflection-budget.ts
    - backend/src/vectors/embeddings.ts
    - backend/src/vectors/episodic-events.ts
    - backend/src/vectors/lore-cards.ts
    - backend/src/ai/generate-object-safe.ts
    - backend/src/vectors/__tests__/episodic-events.test.ts
    - backend/src/vectors/__tests__/lore-cards.test.ts
    - backend/src/engine/__tests__/turn-processor.inventory-authority.test.ts

key-decisions:
  - "Judge role nests INSIDE oracle and reflection — withRole('oracle', ...) wraps executeOracleCall body (deterministic math + validation), withRole('judge', ...) wraps ONLY the inner safeGenerateObject call. Both frames emit: oracle.call under role='oracle', llm.attempt under role='judge'. Same pattern for reflection-agent."
  - "Storyteller wrap applied at both hidden and visible narration boundaries — runHiddenPassWithModel and runVisibleNarrationWithGuard. Opening scene's runVisibleNarrationWithGuard is also wrapped so processOpeningScene emits through the storyteller role."
  - "faction.tick is emitted inside the faction_action tool's execute block (not around tickFactions orchestrator in world-engine.ts) — satisfies `grep -nE 'log\\.event\\(\"faction\\.tick\"' backend/src/engine/faction-tools.ts` acceptance criterion with meaningful per-action aggregates (action/outcome/targetLocation/tagChangeCount/chronicleEntryId)."
  - "tool.call event uses a single try/finally block with resultForLog tracker — removes the need for per-handler try/finally and keeps executeToolCall body identical to prior semantics. resultForLog is initialized to a 'did not complete' error so finally always has a defined result even if a handler throws synchronously before resultForLog is assigned."
  - "Off-screen batch counted as extension seam, NOT one of Plan 58-04's 18-seam acceptance matrix — `npcOffscreen.batch` is documented as real-turn emission but does not block verification if absent from the batch (e.g., when tick % interval !== 0)."
  - "db.write call-site coverage is per-call-site, not per-transaction — e.g., handleRevealLocation emits THREE db.write events (locations insert + locationEdges insert + locations update) because each represents a separate SQLite write that Claude needs to reconstruct the full effect chain."
  - "llm.attempt carries model identifier extracted from model.modelId/model.model/model.id via describeModel() helper — resilient to different AI SDK model shapes and returns null when the model object is opaque (rather than throwing)."
  - "TMPDIR redirected to /r/tmp during execution because C:\\ was full — documented as environment-only note; no code impact."

patterns-established:
  - "Pattern: Internal-helper refactor for role wrap — public function wraps `withRole(role, () => internalFn(...))` so the entire body runs inside the ALS frame without changing external signature"
  - "Pattern: `describeModel(model)` helper for llm.attempt — inspects model.modelId/model.model/model.id; returns null on opaque shapes without throwing"
  - "Pattern: Per-role coverage grep contract — plan acceptance criteria use `grep -rnE 'withRole\\(\"<role>\"' backend/src/` counts to prove every observability role has a real emission site, preventing dead role entries in ObservabilityRoleToggles"

requirements-completed: [REQ-OBSERV-01]

# Metrics
duration: ~75min
completed: 2026-04-17
---

# Phase 58 Plan 02: Instrument 14 Engine/Vector/AI Pipeline Seams Summary

**Injected structured `log.event(...)` calls at the 14 engine/vector/ai pipeline instrumentation seams Plan 58-02 owns (the remaining 4 — `turn.begin`, `turn.end`, `sse.emit` oracle_result, `sse.emit` generic — are Plan 58-03's responsibility). Added `withRole(...)` wrappers at every role boundary so judge/storyteller/oracle/npcAgent/reflection/embedder each have at least one emission site. Added `db.write` at all 33 SQLite write call-sites in the engine. Text-delta stream parts are now aggregated into a single `storyteller.hidden.stream` event per turn instead of flooding disk with per-token records. No control-flow changes, no async boundary changes — purely additive instrumentation.**

## Performance

- **Duration:** ~75 min
- **Completed:** 2026-04-17
- **Tasks:** 3 of 3 (Task 1 turn-processor + prompt-assembler, Task 2 oracle + tool-executor + db.write, Task 3 NPC/reflection/faction/embedder/vectors)
- **Files modified:** 15 source + 3 test mock fixups = 18
- **Files created:** 0 (pure instrumentation, no new modules)

## Accomplishments

1. **14 pipeline seams instrumented** with structured `log.event(...)` emissions — each event named per the Plan 58-02 Pipeline Instrumentation Map:
   - `movement.detect`, `target.context`, `prompt.assembled` (×2 hidden+final), `storyteller.hidden.stream`, `storyteller.visible.call`, `oracle.call`, `tool.call`, `db.write`, `npcAgent.tick`, `reflection.tick`, `faction.tick`, `embedder.call`, `vector.write`, `llm.attempt`, `npcOffscreen.batch` (extension).
2. **Text-delta aggregation** — `storyteller.hidden.stream` emits ONE event per turn with `{ deltaCount, toolCallCount, accumulatedLen, durationMs }`, NOT per-token. Grep-verified: `grep -rnE 'log\.(event|info|debug)\([^)]*text-delta' backend/src/engine` returns 0.
3. **Role wrapper coverage** — every role in `ObservabilityRoleToggles` has at least one `withRole(...)` site:
   - `judge`: 2 (oracle.ts, reflection-agent.ts — both nested INSIDE their parent role)
   - `storyteller`: 3 (turn-processor.ts: hidden stream, final narration, opening narration)
   - `oracle`: 1 (oracle.ts)
   - `npcAgent`: 2 (npc-agent.ts, npc-offscreen.ts — offscreen mapped conceptually)
   - `reflection`: 1 (reflection-agent.ts)
   - `embedder`: 1 (embeddings.ts)
4. **db.write call-site coverage: 35 total** across 7 engine files — matches Plan 58-02 Task 2 exhaustive table (required ≥32):
   - tool-executor.ts: 16
   - faction-tools.ts: 6
   - reflection-tools.ts: 3
   - npc-offscreen.ts: 3
   - turn-processor.ts: 3
   - npc-tools.ts: 2
   - reflection-agent.ts: 1
   - reflection-budget.ts: 1
5. **`tool.call` single try/finally** — `executeToolCall` body wrapped once; emits `{ toolName, args, result, latencyMs }` exactly once per tool invocation including on error paths.
6. **Oracle + Judge nested wrappers** — `executeOracleCall` wrapped in `withRole("oracle", ...)` around chance math + validation; inner `safeGenerateObject` wrapped in `withRole("judge", ...)`. `oracle.call` event fires under role=oracle with payload `{ input, output, latencyMs }` (or `{ input, error, latencyMs }` on throw — throw preserved).
7. **Reflection + Judge nested wrappers** — `runReflection` wrapped in `withRole("reflection", ...)`; inner `generateText` (the structured LLM call that the reflection tools drive) wrapped in `withRole("judge", ...)`. Emits `reflection.tick` with `{ npcId, npcName, toolCallCount, durationMs }`.
8. **llm.attempt per retry** — `safeGenerateObject` emits `llm.attempt` on each of up to 3 attempts: success branch with `{ attemptNum, model, success: true, latencyMs }`; failure branch with `{ attemptNum, model, success: false, error, latencyMs }`. Model extraction via `describeModel(opts.model)` helper.
9. **Prompt assembled key `assembledChars`** — `prompt.assembled` event at end of `assemblePrompt` (hidden pass) AND at end of `assembleFinalNarrationPrompt` (final-narration pass). Both carry `assembledChars: formatted.length` as the numeric key Plan 58-04 asserts on, plus `totalTokens`, `budgetUsed`, `sectionCount`, and full `formatted` prompt text (subject to field-level truncation from 58-01).
10. **target.context key `targetTags`** — event emitted immediately after `resolveActionTargetContext` returns, carrying `targetTags: targetContext.targetTags ?? []` as required by Plan 58-04 assertions.

## Task Commits

1. **Task 1:** turn-processor + prompt-assembler seams (movement.detect, target.context, storyteller.hidden.stream, storyteller.visible.call, prompt.assembled ×2 + withRole storyteller ×3 + 3 db.write) → `70e2b3d` (feat)
2. **Task 2:** oracle + tool-executor + generate-object-safe + db.write at 30 engine writes (oracle.call wrapped in oracle+judge, tool.call single finally, llm.attempt per retry, db.write at all tool-executor/faction-tools/npc-tools/npc-offscreen/reflection-tools/reflection-budget writes) → `df0f463` (feat)
3. **Task 3:** npcAgent/reflection/offscreen/embedder/vector writes + 3 test mock fixups (npcAgent.tick, reflection.tick nested judge, faction.tick implicit via Task 2, npcOffscreen.batch, embedder.call, vector.write) → `4624969` (feat)

_Final plan metadata commit will follow this SUMMARY._

## The 14 Seams (Line Numbers After Instrumentation)

| # | Seam | File:Line | Event | Role Wrap |
|---|------|-----------|-------|-----------|
| 2 | movement.detect | `turn-processor.ts:340, 348` | `movement.detect` | — |
| 3 | target.context | `turn-processor.ts:869` | `target.context` (targetTags) | — |
| 4 | oracle.call | `oracle.ts:138, 146` | `oracle.call` | `withRole("oracle")` outer + `withRole("judge")` inner |
| 6 | prompt.assembled (hidden) | `prompt-assembler.ts:1204` | `prompt.assembled` (assembledChars) | — |
| 7 | storyteller.hidden.stream | `turn-processor.ts:1016` | `storyteller.hidden.stream` | `withRole("storyteller")` |
| 8 | tool.call | `tool-executor.ts:1135` (finally block) | `tool.call` | — (ambient role) |
| 9 | db.write | 33+ engine sites | `db.write` | — |
| 10 | npcAgent.tick | `npc-agent.ts:327` | `npcAgent.tick` | `withRole("npcAgent")` |
| 11 | prompt.assembled (final) | `prompt-assembler.ts:1315` | `prompt.assembled` (pass=final-narration) | — |
| 12 | storyteller.visible.call | `turn-processor.ts:1139, 1285` | `storyteller.visible.call` | `withRole("storyteller")` × 2 (final + opening) |
| 13 | reflection.tick | `reflection-agent.ts:200` | `reflection.tick` | `withRole("reflection")` + inner `withRole("judge")` |
| 14 | faction.tick | `faction-tools.ts:133` | `faction.tick` | — (ambient role) |
| 15 | embedder.call | `embeddings.ts:39, 53` | `embedder.call` | `withRole("embedder")` |
| 16 | vector.write | `episodic-events.ts:217, 299` + `lore-cards.ts:68, 92, 152, 210` | `vector.write` | — (ambient role) |
| — | llm.attempt (retry bookkeeping, inside judge/oracle/reflection frames) | `generate-object-safe.ts:397, 404` | `llm.attempt` | inherits caller's role |
| — | npcOffscreen.batch (extension) | `npc-offscreen.ts:539` | `npcOffscreen.batch` | `withRole("npcAgent")` |

**Seams not owned by this plan (58-03 responsibility):** 1 turn.begin, 5 sse.emit (oracle_result), 17 sse.emit (generic), 18 turn.end.

## Line-Number Divergence from RESEARCH.md

RESEARCH.md referenced approximate line numbers from a pre-instrumentation snapshot. Actual positions after Plan 58-02 edits:

| Seam | RESEARCH.md line | Actual after edits | Notes |
|------|-------------------|---------------------|-------|
| movement.detect | ~303-329 | 340, 348 | Two emissions added (success path + error path) inside detectMovement |
| target.context | ~833 | 869 | Block moved forward by earlier `detectMovement` event additions and import expansion |
| oracle.call | ~110-128 | 138, 146 | Same function body, expanded by outer+inner role frames and success/error split |
| storyteller.hidden.stream | ~949-968 | 1016 | Inside runHiddenPassWithModel after for-await loop |
| tool.call | ~1074 (executeToolCall body) | 1135 (finally block) | Added outer try/finally; original switch statement unchanged |
| storyteller.visible.call | ~573-648 (guard) + 1068/1203 (call sites) | 1139 (final), 1285 (opening) | Two call sites wrapped + two events |
| npcAgent.tick | ~50-318 | 327 | Inside tickNpcAgentInternal (public fn wraps internal with withRole) |
| reflection.tick | ~47+ | 200 | Inside runReflectionInternal after importance reset |
| embedder.call | ~9-43 | 39 (error branch), 53 (success branch) | Both branches emit |
| vector.write (episodic) | around `.add`/`.update` | 217 (add), 299 (update) | After `await table.add(...)` and `await table.update(...)` |
| vector.write (lore) | around `.createTable`/`.delete`/`.dropTable` | 68, 92, 152, 210 | insertLoreCards, insertLoreCardsWithoutVectors, deleteCampaignLore, deleteLoreCardById |

## db.write Call-Site Coverage (Task 2 Exhaustive Table)

All 33 call-sites from the Plan 58-02 Task 2 table are instrumented. Count by file:

| File | Sites | Tables Written |
|------|-------|----------------|
| engine/tool-executor.ts | 16 | players, npcs, dynamic(addTag/removeTag non-character), relationships, chronicle, items (×3), locations (×2), locationEdges |
| engine/faction-tools.ts | 6 | dynamic(faction/location effect), chronicle (×3), factions, locations |
| engine/reflection-tools.ts | 3 | players, npcs (×2) |
| engine/npc-offscreen.ts | 3 | npcs (full update), npcs (goals-only), npcs (location-only) |
| engine/turn-processor.ts | 3 | players (persistPlayerRuntimeRecord, ensurePlayerSceneScopeAlignment, persistPlayerLocation) |
| engine/npc-tools.ts | 2 | npcs (move_to, update_own_goal) |
| engine/reflection-agent.ts | 1 | npcs (unprocessedImportance reset) |
| engine/reflection-budget.ts | 1 | npcs (accumulate importance) |
| **Total** | **35** | **≥32 required** |

Every `db.write` event carries `{ table, op, rowId, rowName }`. For dynamic-table handlers (addTag/removeTag with entityType variable, faction tag-change with entity variable), `table: "dynamic"` plus `subTable: <detectedName>` hint field.

**Out of scope (per plan):** route-side writes in `routes/character.ts` and `routes/campaigns.ts` are one-shot lifecycle writes, not per-turn events, and are intentionally NOT instrumented by this plan.

## GitNexus Impact Analysis

gitnexus_impact was attempted at the start of each task. The GitNexus index was stale at the time of Task 1 (last analyzed before Plan 58-01 completion), and freshness warnings accumulated after each atomic commit. Impact analysis conclusions, based on earlier-known graph snapshots plus static review:

- **processTurn** (turn-processor.ts): HIGH upstream reach — called by `routes/chat.ts` for every player action. Edits are purely additive (new `log.event` + `withRole` wrappers). No return signature, no async boundary, no error semantics changes. Risk: LOW.
- **executeToolCall** (tool-executor.ts): HIGH — called from streamText tool execution in hidden storyteller pass + npc-tools act tool + reflection-tools set_relationship. Edit wraps body in try/finally; `finally` block cannot swallow `throw` because the return value is pre-captured in `resultForLog`. Risk: LOW.
- **tickNpcAgent** (npc-agent.ts): MEDIUM — called by tickPresentNpcs loop in chat route. Public signature unchanged (the public fn now delegates to an internal helper). Risk: LOW.
- **runReflection** (reflection-agent.ts): MEDIUM — called by checkAndTriggerReflections. Same internal-helper refactor pattern. Risk: LOW.
- **embedTexts** (embeddings.ts): MEDIUM — called from lore-cards store, episodic-events embed, prompt-assembler lore context + episodic memory sections, npc-agent memory search, reflection-agent memory search. Wrapped in withRole; error path emits event then re-throws original Error. Risk: LOW.

No HIGH or CRITICAL risk warnings to acknowledge. No callers need updating.

## Judge Role Wrap Sites

Per-spec: judge wrapper must nest INSIDE oracle and reflection, around ONLY the structured LLM call. Verified sites:

| File | Line | Parent role | What's wrapped |
|------|------|-------------|----------------|
| `backend/src/engine/oracle.ts` | 122 | oracle (outer, line 118) | `safeGenerateObject({ model, schema: oracleOutputSchema, ... })` |
| `backend/src/engine/reflection-agent.ts` | 161 | reflection (outer, line 54) | `generateText({ model, tools: reflectionTools, ... })` |

**Code-wide coverage:** `grep -rnE 'withRole\("judge"' backend/src/` returns 2 production + 2 test fixtures = 4 total. Production count = 2, matching Plan 58-02 acceptance criterion `>= 2`.

## New try/finally Blocks Introduced (Deviation from "Purely Additive")

**One** new try/finally block was introduced, documented here per Task 2 note: "New `try { ... } finally` blocks ARE permitted where tool-executor lacked them — document in SUMMARY."

- **tool-executor.ts / executeToolCall**: Wrapped the entire body in `try/finally`. The original code already had a `try/catch`, and the new wrapping is `try { ... } catch { ... } finally { log.event("tool.call", ...) }`. The finally block cannot swallow a throw because there are no throws inside it — only a single `log.event(...)` side-effect call. All return paths pre-capture into `resultForLog` before returning, so finally always has a defined result.

Additional internal-helper refactors (NOT try/finally, but structural):

- **npc-agent.ts / tickNpcAgent**: public function delegates to new internal helper `tickNpcAgentInternal`, wrapping the call in `withRole("npcAgent", () => ...)`.
- **reflection-agent.ts / runReflection**: same pattern — public delegates to `runReflectionInternal` via `withRole("reflection", ...)`.
- **npc-offscreen.ts / simulateOffscreenNpcs**: same pattern — tick-interval short-circuit kept in public fn, internal helper `simulateOffscreenNpcsInternal` runs under `withRole("npcAgent", ...)`.

All three refactors preserve the exact external signature, external async boundaries, and return shape.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 — Test regression] Test mocks of `createLogger` missing `.event` surface**

- **Found during:** Task 3 verification run
- **Issue:** Three existing test files had `vi.mock("../../lib/index.js", () => ({ createLogger: () => ({ info, warn, [error] }) }))` stubs that predated Plan 58-01's logger rewrite. After my Task 3 edits called `log.event(...)` in `episodic-events.ts` and `lore-cards.ts`, those tests threw `TypeError: log.event is not a function`. Similarly, `turn-processor.inventory-authority.test.ts` had the same pre-58-01 mock and broke on Task 1 instrumentation once the test reached the instrumented code path.
- **Fix:** Extended all three mocks to return `{ info, warn, error, debug, event }` and to additionally export a pass-through `withRole: <T,>(_role, fn) => fn()` stub so the test doubles honor the full logger surface.
- **Files modified:** `backend/src/vectors/__tests__/episodic-events.test.ts`, `backend/src/vectors/__tests__/lore-cards.test.ts`, `backend/src/engine/__tests__/turn-processor.inventory-authority.test.ts`
- **Commits:** `4624969` (all three fixups batched)

**Not fixed (out of scope per CLAUDE.md "SCOPE BOUNDARY" rule):** 15 other test files with similar stale `createLogger` mocks were identified but not touched because (a) they mock modules that my plan does not instrument, OR (b) they are documented pre-existing failures in `deferred-items.md` and their fix is owned by the phase responsible for the original failure. Those 15 mocks remain working because the SUT code in their mocked paths never calls `.event`.

### Not deviations (informational)

- **Test: npc-offscreen "richer identity slice"** — pre-existing failure documented in deferred-items.md (Phase 30/48 identity boundaries gap). My wrapper change did NOT re-break it; same assertion still fails on the same prompt-text contract. Verified via `git stash` + re-run pattern.
- **Test: npc-agent "builds NPC planning prompts..."** — pre-existing failure (deferred-items.md Phase 30/48).
- **Test: reflection-agent.identity-boundaries "flat threshold"** — pre-existing failure (deferred-items.md Phase 48).
- **Test: turn-processor.inventory-authority "reaches the live storyteller transfer_item tool seam..."** — after Rule 1 mock fix above, the test now runs PAST my instrumentation and fails on the pre-existing Phase 40 `deriveStartConditionEffects` mock gap (also in deferred-items.md). The new surface of the old bug is a side effect of moving past the first error; not a regression caused by this plan.

### Pre-existing backend typecheck errors (baseline)

`npx tsc --noEmit` in backend/ reports 132 errors, same count as baseline before any 58-02 edits. All errors are in routes/schemas.ts, routes/worldgen.ts, routes/character.ts, routes/persona-templates.ts, character/record-adapters.ts, engine/prompt-assembler.ts:783, engine/target-context.ts:198, engine/location-events.ts:100, engine/__tests__/tool-schemas.inventory-authority.test.ts, routes/__tests__/schemas.test.ts, character/__tests__/known-ip-worldgen-research.test.ts, ai/__tests__/provider-registry.test.ts, engine/__tests__/storyteller-contract.test.ts, engine/__tests__/storyteller-presets.test.ts — all pre-existing Phase 57/Phase 34 issues documented in Plan 58-01's deferred-items.md.

Note: The shared package `dist/` was not rebuilt at the start of this plan (leftover from before 58-01's `Settings.observability` type addition landed). One-time `npm run build` in `shared/` rebuilt `dist/` and cleared the observability-related typecheck errors. Not an edit to any source file; not a deviation.

## Authentication Gates

None — this plan made no changes to any auth-touching code path.

## Verification

**Acceptance criteria check (all passing):**

```
=== npcAgent.tick ===
1 match in npc-agent.ts:327

=== withRole npcAgent ===
2 matches: npc-agent.ts:57, npc-offscreen.ts:364

=== reflection.tick ===
1 match in reflection-agent.ts:200

=== withRole reflection ===
1 match in reflection-agent.ts:54

=== withRole judge (production code) ===
2 matches: oracle.ts:122, reflection-agent.ts:161

=== faction.tick ===
1 match in faction-tools.ts:133

=== npcOffscreen.batch ===
1 match in npc-offscreen.ts:539

=== embedder.call ===
2 matches in embeddings.ts:39, 53

=== withRole embedder ===
1 match in embeddings.ts:19

=== vector.write events ===
6 matches (2 episodic-events + 4 lore-cards)

=== Total unique event names (engine + vectors + ai) ===
15 unique names — EXCEEDS ≥14 requirement:
db.write, embedder.call, faction.tick, llm.attempt, movement.detect,
npcAgent.tick, npcOffscreen.batch, oracle.call, prompt.assembled,
reflection.tick, storyteller.hidden.stream, storyteller.visible.call,
target.context, tool.call, vector.write

=== No per-text-delta logging ===
0 matches (PASSES anti-flood invariant)

=== Role coverage ===
judge: 2 (production; >=2 required)
storyteller: 3 (>=2 required)
oracle: 1 production + 2 test fixtures (>=1 required)
npcAgent: 2 (>=1 required)
reflection: 1 (>=1 required)
embedder: 1 (>=1 required)

=== db.write engine count ===
35 (>=32 required)
```

**Tests:** Task 1 + Task 2 + Task 3 targeted suites PASS. Full engine+vectors+ai suite reports 35 test files, 31 passing, 4 pre-existing-failing (all documented in deferred-items.md, none caused by this plan).

**Typecheck:** `npx tsc --noEmit` in backend/ returns exactly 132 errors — same count as before any Plan 58-02 edits (pre-existing Phase 57/34 issues).

## Self-Check: PASSED

- [x] File `backend/src/engine/turn-processor.ts` — MODIFIED (6 new log.event + 3 new db.write + 3 withRole storyteller + 1 withRole import)
- [x] File `backend/src/engine/prompt-assembler.ts` — MODIFIED (2 log.event prompt.assembled)
- [x] File `backend/src/engine/oracle.ts` — MODIFIED (withRole oracle+judge + 2 log.event oracle.call + createLogger)
- [x] File `backend/src/engine/tool-executor.ts` — MODIFIED (try/finally with 1 log.event tool.call + 16 log.event db.write)
- [x] File `backend/src/engine/npc-agent.ts` — MODIFIED (withRole npcAgent + 1 log.event npcAgent.tick + internal helper refactor)
- [x] File `backend/src/engine/reflection-agent.ts` — MODIFIED (withRole reflection + withRole judge + 1 log.event reflection.tick + 1 log.event db.write + internal helper refactor)
- [x] File `backend/src/engine/faction-tools.ts` — MODIFIED (1 log.event faction.tick + 6 log.event db.write)
- [x] File `backend/src/engine/npc-tools.ts` — MODIFIED (2 log.event db.write)
- [x] File `backend/src/engine/npc-offscreen.ts` — MODIFIED (withRole npcAgent + 1 log.event npcOffscreen.batch + 3 log.event db.write + internal helper refactor)
- [x] File `backend/src/engine/reflection-tools.ts` — MODIFIED (3 log.event db.write)
- [x] File `backend/src/engine/reflection-budget.ts` — MODIFIED (createLogger + 1 log.event db.write)
- [x] File `backend/src/vectors/embeddings.ts` — MODIFIED (withRole embedder + 2 log.event embedder.call)
- [x] File `backend/src/vectors/episodic-events.ts` — MODIFIED (2 log.event vector.write)
- [x] File `backend/src/vectors/lore-cards.ts` — MODIFIED (4 log.event vector.write)
- [x] File `backend/src/ai/generate-object-safe.ts` — MODIFIED (2 log.event llm.attempt + describeModel helper)
- [x] Test fixups: episodic-events.test.ts, lore-cards.test.ts, turn-processor.inventory-authority.test.ts — MODIFIED (logger mock extended)
- [x] Commit `70e2b3d` (Task 1) reachable via `git log`
- [x] Commit `df0f463` (Task 2) reachable via `git log`
- [x] Commit `4624969` (Task 3) reachable via `git log`
- [x] 15 unique `log.event` names in engine+vectors+ai ≥ 14 required
- [x] 35 `db.write` events ≥ 32 required
- [x] Both `withRole("judge", ...)` sites present (oracle.ts + reflection-agent.ts)
- [x] Every `ObservabilityRoleToggles` role has ≥1 `withRole` site
- [x] No per-text-delta logging anywhere in backend/src/engine
