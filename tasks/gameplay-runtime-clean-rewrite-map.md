# Clean Gameplay Runtime Rewrite Map

Last updated: 2026-06-06

## Current Scope Reset

User correction: current `gameplay-cycle-v2` is not the target runtime. It was written during the failed rewrite and is now forensic evidence only. Do not patch it forward as the architecture. Build a clean runtime core and migrate the `/api/chat/action` boundary deliberately.

Canonical architecture: `docs/gm-turn-architecture-review-2026-05-03.md`.

Historical diagnosis file `docs/WorldForge_runtime_problem_fixes_latency_memory_v5.md` is not an implementation guide.

## Existing Runtime Map - Forensic Only

### 1. Transport Entry

- File: `backend/src/routes/chat.ts`
- Route: `app.post("/action", ...)`
- Current responsibilities:
  - parse `chatActionBodySchema`
  - require loaded campaign
  - turn lock via `tryBeginTurn`
  - resolve judge/storyteller/embedder providers
  - block pending narration
  - create auto-checkpoint on low HP
  - capture pre-turn snapshot
  - resolve quick-action handle to player action
  - stream SSE events
  - call `processTurn`
  - restore snapshot on pre-settlement failure
  - preserve finalized state after done boundary
- Replacement decision:
  - Keep as minimal transport adapter only.
  - Remove gameplay semantic ownership from this layer.
  - New runtime should receive a normalized player turn input and return typed runtime events plus final API projection.

### 2. Runtime Switch

- File: `backend/src/engine/turn-processor.ts`
- Symbol: `processTurn`
- Current behavior:
  - `isGameplayCycleV2Enabled()` checks `WORLDFORGE_GAMEPLAY_CYCLE_V2`.
  - Switches between `processGameplayTurnCycleV2(options)` and `processGameplayTurnCycleV1(options)`.
  - Wraps all events with `withSafeTurnProgressPayload`.
- Replacement decision:
  - Replace as gameplay runtime boundary.
  - Keep event sanitization as adapter behavior if still needed.
  - Do not let the clean runtime depend on v1/v2 switch semantics.

### 3. Legacy V1 Runtime

- File: `backend/src/engine/turn-processor.ts`
- Current responsibilities:
  - large mixed pipeline: Oracle, world-brain, GM read, hidden adjudication, scene planner, tool execution, receipt logic, actor reactions, settled packet, narrator, post-turn hooks.
- Replacement decision:
  - Full replacement for gameplay-cycle runtime.
  - May mine tests/failure cases only.
  - Do not reuse as runtime owner.

### 4. Current V2 Runtime

- Directory: `backend/src/engine/gameplay-cycle-v2/`
- Main file: `runtime.ts`
- Current chain:
  - creates `turn-start-envelope.v2` and `turn-attempt-context.v2`
  - builds `SceneFrameEnvelopeV2`
  - builds `ModelFacingTurnPacketV2`
  - asks GM Read
  - asks GM Judge
  - optionally calls Oracle
  - optionally creates action checklist
  - composes mutating turn with tool request candidates
  - executes db-backed gameplay tool handlers
  - builds receipt ledger and settled packet
  - persists to `gameplay_cycle_v2_packets`
  - asks narrator
  - appends chat messages
  - advances tick/world clock boundary
  - finalizes API projection
- Replacement decision:
  - Full replacement as target code.
  - Forensic evidence only.
  - Any existing helper can be reused only after an explicit adapter decision and Oracle-reviewed ownership contract.

### 5. Scene Frame And Forecast

- Files:
  - `backend/src/engine/scene-frame.ts`
  - `backend/src/engine/world-forecast.ts`
  - `backend/src/engine/world-forecast-builder.ts`
  - `backend/src/engine/gameplay-cycle-v2/projection.ts`
- Current v2 behavior:
  - `buildLiveSceneFrameContextV2` calls `buildSceneFrame`.
  - Forecast loaded by `loadWorldTrajectoryForecast`.
  - Scoped forecast built by `buildScopedForecastExcerpt`.
  - `buildModelFacingTurnPacketV2` flattens frame into model-facing actors, movement options, targets, inventory, recent events, capabilities, forecast entries, citable refs, private guard terms.
- Replacement decision:
  - `buildSceneFrame` and forecast loading can be source adapters if they are treated as read-only snapshot providers.
  - The new `SceneFrame` contract must be authoritative and model-facing by construction, not a prompt packet patched after the fact.
  - Forecast remains advisory only and must not authorize mutation or narration claims.

### 6. Current V2 Contracts And Schemas

- File: `backend/src/engine/gameplay-cycle-v2/contracts.ts`
- Current surfaces:
  - `SceneFrameEnvelopeV2`
  - `ModelFacingTurnPacketV2`
  - `GmReadV2`
  - `GmJudgeV2`
  - `GmActionChecklistV2`
  - `GameplayToolRequestV2`
  - `GameplayRuntimeReceiptV2`
  - `GameplayRuntimeReceiptLedgerV2`
  - `SettledTurnPacketV2`
  - `NarratorViewV2`
  - `ApiResponseProjectionV2`
- Current tool ids:
  - `route.check.v2`
  - `actor.move.v2`
  - `dialogue.record.v2`
  - `world_fact.record.v2`
  - `support_actor.create.v2`
  - `entity.tag.v2`
  - `item.transfer.v2`
  - `actor.condition_set.v2`
  - `time.advance.v2`
  - `scene_beat.record.v2`
  - `location.reveal.v2`
  - `minor_poi.create.v2`
- Replacement decision:
  - Full replacement.
  - Current schemas demonstrate failure pressure and useful test ideas, but the clean runtime needs narrower primitive-owned schemas.

### 7. Current Tool Execution And Mutation

- Current v2 files:
  - `runtime-executor.ts`
  - `db-handlers.ts`
  - `tool-request-planner.ts`
  - `receipt-ledger.ts`
  - `mutating-composer.ts`
  - `local-consequence-scheduler.ts`
  - `local-consequence-executor.ts`
  - `ref-registry.ts`
- Legacy files still relevant as forensic evidence:
  - `tool-schemas.ts`
  - `runtime-tool-input-schemas.ts`
  - `runtime-tool-descriptors.ts`
  - `tool-executor.ts`
  - `tool-execution-context.ts`
  - `scene-plan-executor.ts`
  - `hidden-adjudication.ts`
  - `gm-tool-loop.ts`
- Current mutation write points:
  - `gameplay-cycle-v2/db-handlers.ts` writes players, NPCs, locations, items, actor knowledge, world clocks, authority traces, turn clock ledger.
  - `tool-executor.ts` remains broad legacy mutation surface for old runtime tools.
- Replacement decision:
  - Full replacement for gameplay-cycle tools, validators, runtime execution, receipts, and mutation contracts.
  - DB base tables are source/persistence adapters.
  - New gameplay tools must be backend-owned narrow operations with typed accepted/failed receipts.
  - Old runtime tools must not be called by the clean gameplay runtime.

### 8. Settled Packet And Narration

- Current v2 files:
  - `settled-packet.ts`
  - `receipt-ledger.ts`
  - `evidence-normalizer.ts`
  - `packet-store.ts`
  - `api-response.ts`
  - `runtime.ts` narrator prompt/build/finalization
- Legacy files:
  - `narrator-packet.ts`
  - `narration-grounding-guard.ts`
  - `visible-narration-output-guard.ts`
  - `player-facing-packet.ts`
  - `settled-turn-packet-v1-store.ts`
  - `turn-saga.ts`
- Current persistence:
  - v2 packet table: `gameplay_cycle_v2_packets`
  - legacy tables: `settled_turn_packets`, `turn_sagas`, `narrator_attempts`
  - authority tables: `authority_traces`, `turn_clock_ledger`, `world_clocks`
  - chat history through campaign store
- Replacement decision:
  - Full replacement for settled packet and narrator evidence contract.
  - Existing base persistence tables may be adapters only after explicit decision.
  - Narrator must consume only settled truth: accepted receipts, oracle result with predeclared meaning, visible facts, failed/skipped reasons.

### 9. Out Of Scope

- World creation/generation:
  - `backend/src/worldgen/**`
  - `backend/src/routes/worldgen.ts`
- Character loading/record adapters:
  - `backend/src/character/**`
- Campaign/world authoring:
  - `backend/src/routes/campaigns.ts`
  - campaign manifests/loading APIs
- UI:
  - frontend game screens and world authoring UI
- Replacement decision:
  - Do not rewrite.
  - Consume through minimal data/source adapters only.

## Replacement Plan By Primitive

Each primitive must define owner, input, output, downstream consumer, mutation authority, evidence authority, failure mode, and forbidden responsibilities before implementation.

### Primitive 0 - Clean Turn Boundary

- Owner: backend transport adapter plus clean runtime entry contract.
- Input: campaign id, submitted player action, optional quick-action selection, provider summaries, pre-turn snapshot handle, base tick/version.
- Output: typed runtime event stream and final frozen API projection.
- Mutation authority: none.
- Evidence authority: none, except recording the raw player request as request metadata.
- Failure mode: pre-runtime route errors only; no world mutation.
- Forbidden: interpret action, infer consequences, call tools, narrate, mutate.
- Verification: contract tests for normalized input/output envelope and no legacy tool calls.

### Primitive 1 - Authoritative SceneFrame And Scoped Forecast

- Owner: clean runtime frame builder.
- Input: clean turn boundary input plus read-only campaign/world/player state adapters.
- Output: authoritative model-facing `SceneFrame` snapshot and scoped forecast envelope.
- Mutation authority: none.
- Evidence authority: current visible facts only; forecast is advisory trajectory only.
- Failure mode: hard route/runtime error for missing campaign/player/current scene; empty forecast when forecast source unavailable.
- Forbidden: interpret player prose, choose consequences, emit tool payloads, narrate.
- Verification: snapshot/contract tests for refs, allowed capabilities, private/offscreen scoping, forecast advisory-only status.

### Primitive 2 - GM Read

- Owner: GM Read LLM adapter plus validator.
- Input: SceneFrame, player action.
- Output: interpretation only: situation, player action interpretation, decision path, focal refs, uncertainty statement if any.
- Mutation authority: none.
- Evidence authority: none beyond interpretation.
- Failure mode: one repair, then clarification/no-mutation response.
- Forbidden: concrete tool payloads, planned mutations, narration.
- Verification: fixture tests for path choice, ref grounding, no tool payloads.

### Primitive 3 - Judge And Oracle Gate

- Owner: backend judge contract.
- Input: SceneFrame, GM Read, player action.
- Output: physical possibility, check need, difficulty/stakes, oracle request only for true uncertainty.
- Mutation authority: none.
- Evidence authority: oracle outcome only when roll exists and tier meanings are predeclared.
- Failure mode: no mutation; clarification/blocked packet.
- Forbidden: state mutation, narration, tool payloads.
- Verification: no-oracle paths call no Oracle; oracle result includes selected meaning.

### Primitive 4 - Action Checklist

- Owner: backend-owned consequence planner.
- Input: SceneFrame, GM Read, Judge/Oracle result.
- Output: bounded checklist, one intended state effect per step.
- Mutation authority: none.
- Evidence authority: none.
- Failure mode: no-mutation/clarification packet; no rollback of already settled truth.
- Forbidden: executable tool inputs, narration, multi-effect steps.
- Verification: direct/continue/clarification skip checklist; mutating turns produce valid bounded steps.

### Primitive 5 - Tool Execution And Mutation

- Owner: backend clean gameplay tools.
- Input: one checklist step, current SceneFrame, accepted prior receipts.
- Output: accepted/failed/skipped typed receipt.
- Mutation authority: backend tool handler only.
- Evidence authority: receipt-specific and precise.
- Failure mode: one revision where model payload is needed; repeated invalid step skipped/failed.
- Forbidden: model direct mutation, old runtime tool calls, fallback special cases.
- Verification: rejected request revision/skip tests; DB changes match accepted receipts only.

### Primitive 6 - Settled Turn Packet

- Owner: clean settlement builder.
- Input: accepted receipts, failed/skipped reasons, oracle result, visible current facts.
- Output: narrator packet and API settlement metadata.
- Mutation authority: none.
- Evidence authority: settled truth only.
- Failure mode: minimal safe packet from current SceneFrame and player action metadata.
- Forbidden: prose invention, hidden/private exposure, planned-but-failed effects.
- Verification: failed tool fixture cannot appear as narrated effect.

### Primitive 7 - Narrator

- Owner: narrator adapter and evidence validator.
- Input: settled packet only.
- Output: player-facing narration and API response text.
- Mutation authority: none.
- Evidence authority: none; presentation only.
- Failure mode: pending narration with settled state preserved; retry from stored packet.
- Forbidden: infer absence, movement, discovery, item state, NPC knowledge, no-change, or hidden facts without explicit accepted evidence.
- Verification: contract tests plus live manual turns.

## First Oracle Gate

Question scope: Primitive 0 plus Primitive 1.

Architecture question:

Should the clean runtime start with a new `gameplay-cycle-runtime` boundary that bypasses `turn-processor.ts` v1/v2 semantics after route normalization, with `SceneFrame` as the first authoritative model-facing artifact, while old `gameplay-cycle-v2` remains forensic-only? Return recommendation, contract shape, adapter boundaries, and tests.

Required bundle:

- `docs/gm-turn-architecture-review-2026-05-03.md`
- this map
- `backend/src/routes/chat.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/gameplay-cycle-v2/runtime.ts`
- `backend/src/engine/gameplay-cycle-v2/contracts.ts`
- `backend/src/engine/gameplay-cycle-v2/projection.ts`
- `backend/src/engine/scene-frame.ts`
- `backend/src/engine/world-forecast.ts`
- `backend/src/campaign/index.ts`

## Oracle Review Record - Primitive 0/1

- Session: `wf-clean-runtime-p0-p1`
- Engine/model: Oracle browser, GPT-5.5 Pro, resolved ChatGPT `Extended Pro`
- Bundle: one `attachments-bundle.txt`, 10 files, about 125k tokens
- Question:
  - Should the clean runtime start with a new `gameplay-cycle-runtime` boundary that bypasses `turn-processor.ts` v1/v2 semantics after route normalization, with `SceneFrame` as the first authoritative model-facing artifact, while old `gameplay-cycle-v2` remains forensic-only?
- Recommendation:
  - Yes.
  - `/api/chat/action` remains transport/normalization adapter.
  - New `gameplay-cycle-runtime` owns gameplay.
  - Do not route clean runtime through `turn-processor.ts` v1/v2 env switch.
  - `SceneFrame` is the first authoritative model-facing truth boundary.
  - Existing `buildSceneFrame` and forecast loaders may be read-only source adapters only.
  - `gameplay-cycle-v2` remains fenced as forensic/recovery/comparison evidence, not target substrate.
- Accepted decision:
  - Implement Primitive 0/1 as a new `backend/src/engine/gameplay-cycle-runtime/` core.
  - Add a minimal route adapter after `/api/chat/action` normalization to call this core when the clean runtime lane is enabled.
  - Do not import `backend/src/engine/gameplay-cycle-v2/**`, `gameplay-turn-cycle-v1`, `gm-tool-loop`, old runtime tools, or `turn-processor.ts` from the clean runtime.
  - Contract tests must prove route normalization, clean env independence from `WORLDFORGE_GAMEPLAY_CYCLE_V2`, static import fences, no legacy v2 packet persistence, and zero writes during Primitive 1 frame build.
- First implementation slice:
  - `GameplayRuntimeTurnInput` contract.
  - `SceneFrame` plus `ScopedForecastEnvelope` contract.
  - Read-only frame builder adapter.
  - Minimal clean runtime event stream and frozen no-mutation projection for Primitive 0/1 tests.
  - Route adapter guarded by a clean-runtime flag for live `/api/chat/action` evidence during incremental build.
