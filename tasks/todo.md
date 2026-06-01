# Rebuild GM Turn Cycle

Rollback point: `45517081` on `codex/gameplay-loop-rebuild`.
Working branch/worktree: `codex/rebuild-gm-turn-cycle` in normal worktree `R:\Projects\WorldForge`.

Canonical architecture source: `docs/gm-turn-architecture-review-2026-05-03.md`.
Explicitly excluded as implementation guidance: `docs/WorldForge_runtime_problem_fixes_latency_memory_v5.md`.

## Goal

Rewrite only the gameplay turn cycle from player message to player-facing narration/API response. Keep world creation, character loading, and UI intact except for minimal adapters. Build a clean staged GM turn pipeline without guard piles, fallback hacks, semantic regex routing, or special-case patches.

## Current State Map

- Entry path: `POST /chat/action` in `backend/src/routes/chat.ts` parses `chatActionBodySchema`, resolves quick actions, captures a pre-turn snapshot, streams SSE, and calls `processTurn`.
- Turn switch: `processTurn` in `backend/src/engine/turn-processor.ts` always uses `processTurnScenePlan` outside test-only `SCENE_PLAN_ENABLED=false`.
- Current scene-plan path already contains the desired concepts, but they are fused inside one large orchestrator:
  - deterministic state/context setup and pre-frame due-world work;
  - `buildSceneFrame`;
  - `buildScopedForecastExcerptForFrame`;
  - `runGmRead`;
  - optional `callOracle`;
  - direct no-mutation path or `runGmToolLoop`;
  - actor reaction pass;
  - pre-narrator due-world work;
  - canonical packet and `buildNarratorPacket`;
  - `persistSettledTurnPacket`;
  - final narration and SSE output.
- Existing modules worth preserving as inputs/surfaces, not as the new orchestration shape:
  - `scene-frame.ts` for backend-owned visible frame assembly;
  - `world-forecast.ts` for advisory forecast excerpts only;
  - `gm-turn-read.ts` as the read/classification contract candidate;
  - backend runtime tool schemas/executor surfaces as mutation authority;
  - `narrator-packet.ts` as settled truth packaging candidate.
- Existing modules/behaviors to avoid importing as architecture:
  - TurnSaga/recovery/rollback machinery as the driver of the new design;
  - broad narration grounding guard loops as a substitute for clean settled-packet ownership;
  - old `processTurnLegacy`;
  - any backend semantic regex/keyword routing as source of gameplay meaning.

## Target Pipeline

- [x] Stage 0: SceneFrame + scoped advisory Forecast Envelope.
- [x] Stage 1: GM Read only; no mutation, narration, or executable tool payloads.
- [x] Stage 2: Oracle only when GM Read selects genuine uncertainty.
- [x] Stage 3: GM Action Checklist for mutating/combat turns only, with no executable payload fields.
- [x] Stage 4: one-step-at-a-time backend Tool Step Execution Loop, first vertical slice only.
- [x] Stage 5: Settled Turn Packet from accepted results, Oracle result, visible facts, and skipped/failed reasons, durable v1.
- [x] Stage 6: Narrator from settled truth only for first vertical slice.

## Immediate Plan

- [x] Create rollback-aware branch from `develop` in the normal worktree.
- [x] Inspect canonical GM Turn Architecture Review.
- [x] Inspect current live `/chat/action` -> `processTurn` path.
- [x] Identify current fused responsibilities and reusable backend surfaces.
- [x] Prepare Oracle/GPT-5.5 Pro architecture review with dry-run first.
- [x] Record Oracle recommendation and decision.
- [x] Implement first isolated clean orchestrator shell behind an explicit boundary: `backend/src/engine/gameplay-turn-cycle-v1.ts`.
- [x] Add focused contract tests for Stage 0/1/3 boundaries.
- [x] Verify through the real chat/play path for observation turn smoke.
- [x] Add clean final narrator pass over `SettledTurnPacketV1` instead of deterministic fallback.
- [x] Add direct/clarification route live smoke.
- [x] Add Oracle route live smoke.
- [x] Add one successful state mutation live smoke.

## Verification Gates

- Per stage: focused contract tests plus live/manual gameplay through the real chat path.
- Final acceptance: 3 worlds or clean clones, about 60 turns each, no manual DB/code intervention.
- Required play coverage: direct turns, clarification, Oracle, single-tool mutation, multi-step mutation, failed/rejected tool step without narration leak, local/world/actor consequences, grounded narration.

## Open Architecture Questions For Oracle

- Should the new pipeline be a new orchestrator module called by `processTurn`, or a replacement `processTurn` path with old scene-plan code only used as a reference?
- Which existing modules are clean enough to reuse unchanged for v1, and which should be wrapped behind narrower contracts first?
- Should Stage 3 permit `candidateToolRequest` in checklist v1, or should executable tool input be delayed strictly until Stage 4?
- What is the minimal durable artifact model for v1 without importing the full v5 TurnSaga/recovery design?

## Oracle Decision 2026-06-01

Session: `rebuild-gm-turn-first-slice`.

- Add a new isolated orchestrator module, e.g. `backend/src/engine/gameplay-turn-cycle-v1.ts`, and call it from `processTurn`. Do not reshape `processTurnScenePlan` in place.
- Reuse `scene-frame.ts`, `world-forecast.ts`, `gm-turn-read.ts`, `oracle.ts`, backend tool schemas/execution surfaces, and `narrator-packet.ts` behind narrow stage adapters.
- Do not use `gm-action-checklist.ts` unchanged for the critical path because current `candidateToolRequest` collapses Stage 3 and Stage 4.
- Stage 3 v1 must not contain `toolName`, `input`, `payload`, `plannedTools`, or `candidateToolRequest`; executable requests are Stage 4 only.
- Keep `processTurnScenePlan`, `processTurnLegacy`, hidden adjudication, old semantic routing, actor reactions, due-world work, and TurnSaga recovery out of the first-slice critical path.
- Minimal durable artifact is `SettledTurnPacketV1`, not a saga-driven lifecycle. Before the packet exists, route snapshot can restore. After it exists, narration failure must not redefine accepted truth.
- First slice should prove route-compatible `/chat/action` flow with direct/no-mutation, clarification, Oracle-only uncertainty, and one backend-tool mutation step. Do not attempt actor/world due-work or multi-step planning yet.

## Oracle Decision 2026-06-01: Multi-Step Stage 4

Session: `gm-v1-multistep-loop-retry`.

- Do not make TurnSaga, ScenePlanner, or old saga recovery drive v1.
- Extend Stage 3 from one step to a bounded planning-only checklist, initially max 4 steps.
- Keep Stage 3 free of `toolName`, `input`, `payload`, `candidateToolRequest`, and planned executable payloads.
- Stage 4 should use a deterministic scheduler: pick the next dependency-ready backend step, propose one executable tool request, validate with a tool-specific schema, execute, record settlement, update a shared `ToolExecutionContext`, then repeat.
- Use explicit budgets: max 4 checklist steps, max 4 tool executions, one model repair attempt per tool step.
- Required backend step failure, dependency blockage, or budget exhaustion remains pre-packet failure: throw before `SettledTurnPacketV1` persistence and let route snapshot restore.
- Optional step failure can be audit-only if all required steps accepted; do not narrate optional failed expected effects.
- Feed later tool proposals only backend-accepted refs/receipts from previous successful steps, not checklist expected effects or failed/skipped plans.
- Keep durable packet store unchanged; it is already the right Stage 5/6 boundary.

## Implementation Notes 2026-06-01

- Added `backend/src/engine/gameplay-turn-cycle-v1.ts`.
- Switched `processTurn` to call the new v1 orchestrator.
- Added `backend/src/engine/__tests__/gameplay-turn-cycle-v1.test.ts`.
- Verified:
  - `npm --prefix backend run typecheck`
  - `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts turn-processor.scene-plan.test.ts`
  - real `/api/chat/action` smoke reached `narrative` and `done` through Stage 0/1/3/4/5.
  - real `/api/chat/action` smoke reached storyteller-written `narrative` and `done` through Stage 6.
  - real `/api/chat/action` smoke reached `roll_oracle`, emitted `oracle_result`, then storyteller narration and `done`.
- Live smoke exposed and fixed:
  - Stage 3 checklist old-shape drift (`checklistVersion`, `stage`, `action`) by tightening prompt and one-step schema.
  - Stage 3 `toolNeed` was too strict; made advisory string while keeping executable payload ban strict.
  - Stage 4 sent raw model input instead of schema-normalized input; fixed executor input ownership.
  - Stage 4 used runtime executor for bridge lookup tools; fixed dispatcher to call `executeBridgeCandidateTool`.
  - Stage 6 fallback leaked raw observation JSON; replaced with concise player-facing observation summary.
  - Stage 6 deterministic fallback was replaced by a storyteller pass over `SettledTurnPacketV1` plus output contract validation.
  - Direct/clarification smoke exposed legacy GM Read no-mutation admissibility repair converting no-mutation reads into `tool_plan`; Stage 1 now has explicit `stage1_contract` mode to skip that legacy secondary classifier while preserving default legacy strict mode.
  - Fresh direct smoke reached `turn_resolution {"kind":"direct"}` plus storyteller narration and `done`.
  - Fresh clarification smoke reached `turn_resolution {"kind":"clarification"}` plus clarification narration and `done`.
  - Movement mutation smoke exposed that the current SceneFrame has no legal `movementCandidates`; movement is therefore not accepted from this scene yet, even though an old DB edge exists.
  - Successful state mutation smoke: `/api/chat/action` added `urgent` to visible item `condition report — Cellar Store Bays Seven and Eight`, advanced tick, and increased worldVersion.
  - Stage 4 now filters tool request choices through runtime tool descriptors for known state-effect `toolNeed` values and records v1 checklist/tool-step diagnostics.
  - Durable `SettledTurnPacketV1` store persists canonical packet truth through a storage-only saga anchor, reads it back before narration, records narration attempt start/success/failure, finalizes only after projection, and does not import the old `turn-saga.ts` driver into the v1 critical path.
  - Fresh durable direct smoke on `/api/chat/action` reached `turn_resolution {"kind":"direct"}`, emitted `settled-packet` persisting/persisted phases, storyteller narration, and `done`.
  - Durable smoke DB check showed `turn_sagas`, `settled_turn_packets`, and `narrator_attempts` each increased by one; latest saga was `finalized`, latest narrator attempt was `succeeded`, no pending narration remained, and no `turn_saga_events` row was created for the v1 storage anchor.
  - Attempted durable mutating smoke was blocked before packet persistence by external judge provider connectivity (`safeGenerateObject` exhausted after TLS socket disconnects). Route restored the pre-turn snapshot; DB check showed no new packet/saga/attempt, no pending narration, and no latest v1 event ledger rows.
  - Mutating durable smoke then exposed a real contract bug: Stage 4 accepted `input: { value: "<json string>" }`, failed the required `add_tag` step, but still built a packet and narrator claimed the mark landed. Fixed by using tool-specific Stage 4 schemas and aborting required backend steps before packet persistence when no accepted receipt exists.
  - Fresh mutating durable smoke passed after the fix: `/api/chat/action` produced `tool_plan`, accepted one `add_tag` result, advanced `worldVersion` 130 -> 131, persisted/finalized the packet, left no pending narration, and created no `turn_saga_events` rows for the v1 storage anchor.
- All smoke-test backend listeners on ports 3101-3109 were stopped after use.

## Current Known Gaps

- Stage 2 Oracle path is implemented and live-smoke-proven on `/api/chat/action`.
- Clarification/direct paths are live-smoke-proven on `/api/chat/action`.
  - Stage 4 now supports a bounded deterministic multi-step checklist with shared accepted context. Latest live smoke proved pre-packet rollback on a required failed `create_scene_extra` step; current follow-up tightens Stage 4 tool-name narrowing and exact schema hints for `create_scene_extra` / `record_dialogue_outcome`.
  - Fresh multi-step dialogue smoke on clone `f510677b-61c2-45d2-9022-1c0b1cbbd14e` passed through real `/api/chat/action`: Stage 3 produced two planning-only required backend steps (`create_scene_extra`, `record_dialogue_outcome`), Stage 4 accepted both, Stage 5 persisted the packet, and Stage 6 returned grounded narration matching the accepted dialogue outcome.
  - The previous live smoke exposed a Stage 6 evidence packaging bug: object-shaped tool results such as `record_dialogue_outcome` were summarized as a generic accepted-result phrase, leaving the narrator without the concrete settled outcome. Fixed by feeding `payload.text` / `payload.summary` into acceptedEvidence before narration.
  - Failed-step live smoke on clone `37940a97-371a-4bea-88f6-50c40adc6ae3` passed through real `/api/chat/action`: Stage 3 planned `check_route` then `move_actor`, Stage 4 rejected required `check_route` with `route_not_visible_or_legal`, v1 aborted before packet persistence, SSE emitted `error` with no `narrative`, route snapshot restore succeeded, and DB showed no `settled_turn_packets`, `narrator_attempts`, or `turn_sagas` for the failed turn.
  - Failed-step smoke exposed a route restore idempotency bug outside the v1 packet boundary: repeated restore receipts conflicted on `turn_clock_ledger(campaign_id, source_receipt_ref)`. Fixed `invalidateAuthorityAfterRestore` to make restore ledger insertion idempotent against that actual unique boundary and added a regression test.
- Movement specifically is blocked in the current smoke campaign because SceneFrame exposes no legal movement candidates at the current location; this needs a clean movement-capable world/clone or a SceneFrame movement-candidate fix later.
- Durable `SettledTurnPacketV1` persistence is implemented and focused-test plus live-smoke proven for direct narration.
- Live smoke has proven observation/bridge tool execution, storyteller narration, durable direct packet persistence, and durable mutating packet persistence for one accepted `add_tag` state mutation.
