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

## Oracle Decision 2026-06-01: Local/World/Actor Consequences

Session: `gm-v1-consequenc-slice`.

- Implement the next slice as a narrow `LocalConsequencePassV1` between accepted GM tool settlements and `SettledTurnPacketV1`.
- Use split architecture: visible immediate local actor consequences are accepted before packet/narration; nonlocal/offscreen/world progress stays as versioned post-turn simulation proposals.
- Reuse `runRequiredActorDecisionPass` through a v1 adapter with explicit route, legal tools, scene frame, player scope, and blocked write scopes. Do not call the old `processTurnScenePlan`, ScenePlanner, or TurnSaga recovery as v1 drivers.
- Refresh the `SceneFrame` after accepted GM mutations before local actor reactions, especially after movement.
- Do not create a second durable pre-narration packet yet. Embed accepted local consequence facts/result refs into `SettledTurnPacketV1`; the settled packet remains the single narration truth boundary.
- Required local-visible actor consequence failures abort before packet persistence and route restore handles rollback. Optional/deferred actor work is skipped or queued and must not enter narrator evidence.
- Keep `resolveDueWorldWorkForScopeWithProposalWatchdog` out of the synchronous v1 critical path for this slice.

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
- Movement is live-smoke-proven on a clean movement-capable clone; stale/expired movement fixtures remain useful only as failed-route coverage.
- Movement success is live-smoke-proven on clean movement-capable clone `3a606353-5968-4174-936b-45d80056ac1f` cloned from `142cf3f0-e6da-4f6b-8467-5721da7d963f`: real `/api/chat/action` moved the player from `The Canal Market District` to `Flooded Auction House` via accepted `move_actor`, advanced tick/worldVersion, persisted/finalized `SettledTurnPacketV1`, and DB showed player current location/scene updated to `Flooded Auction House`.
- The earlier Ashfall/Gatehouse movement failure is now understood as a stale-source fixture issue, not proof that v1 movement is generally broken: source `1973fbeb-cd81-4556-8252-6aeccde5d5d8` has the player in an expired `Municipal Stores Front Counter`, with its only outgoing edge pointing to an archived/expired scene. Keep it as failed-route coverage, not as movement-success source.
- Durable `SettledTurnPacketV1` persistence is implemented and focused-test plus live-smoke proven for direct narration.
- Live smoke has proven observation/bridge tool execution, storyteller narration, durable direct packet persistence, and durable mutating packet persistence for one accepted `add_tag` state mutation.
- Local actor consequences are implemented as Stage 4.5 accepted packet truth and live-smoke-proven for an actor receipt before narration. Nonlocal/offscreen/world progress remains post-turn proposal work by design and still needs broader long-run validation.

## Implementation Notes 2026-06-01: Local Consequence Pass V1

- Added a narrow Stage 4.5 `LocalConsequencePassV1` inside `processGameplayTurnCycleV1`, after required GM tool settlements are accepted and before `SettledTurnPacketV1` is built.
- The pass skips direct/no-tool turns with a `route: "none"` artifact, and runs `runRequiredActorDecisionPass` only when accepted GM tool results exist.
- The pass refreshes `SceneFrame` after accepted GM mutations, passes explicit `presentActorReactionRoute: "required_before_done"`, legal tools, player scope, and blocked GM write scopes into actor execution.
- `SettledTurnPacketV1` now carries `localConsequenceResult` and `acceptedActorResults`; narrator evidence includes only accepted actor visible facts/results, while skipped/failed local consequence data remains audit-only.
- Deferred/offscreen skipped local consequences are audit-only and do not abort packet persistence; failed required local actor receipts still abort before packet.
- Durable packet persistence now records `acceptedActorResultRefs`, actor model-safe source refs, and actor durable event ids through the same settled packet boundary.
- Verified:
  - `npm --prefix backend run typecheck`
  - `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts settled-turn-packet-v1-store.test.ts actor-tools.test.ts`
  - `npm --prefix backend test -- chat.scene-plan.test.ts chat.test.ts gameplay-turn-cycle-v1.test.ts settled-turn-packet-v1-store.test.ts actor-tools.test.ts`
  - real `/api/chat/action` smoke on campaign `3a606353-5968-4174-936b-45d80056ac1f`: accepted `add_tag`, ran `local-consequences`, persisted/finalized packet, emitted grounded `narrative` and `done`; DB packet showed `localRoute=required_before_packet`, zero actor settlements because the campaign has no `actor_process_states`, accepted tool refs persisted, and no backend listener remained on `3109/3001`.
  - real `/api/chat/action` actor smoke on campaign `9c80976a-0b6f-4be2-b2c4-0173f90ac2ca`: GM path was `tool_plan`, `local-consequences` ran before packet, Silk Maren produced one accepted `log_event` actor receipt, `SettledTurnPacketV1` packet `1552b4e5-423c-421e-9e81-e34552d7fc8a` persisted `localRoute=required_before_packet`, one accepted actor settlement, concrete actor visible fact, and non-empty `acceptedActorResultRefs`.
  - The same actor smoke exposed and fixed a v1 adapter contract bug: an actor settlement with one accepted local reaction receipt plus one rejected extra actor tool was incorrectly treated as fatal. The contract is now: required local actor consequence fails only when no accepted runtime receipt exists for that actor; rejected extra tools after an accepted receipt are audit-only `skipped`.
  - Re-verified after the actor receipt fix:
    - `npm --prefix backend run typecheck`
    - `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts settled-turn-packet-v1-store.test.ts actor-tools.test.ts chat.scene-plan.test.ts chat.test.ts`

## Acceptance Lanes 2026-06-01

- Correction applied: final 3x60 acceptance clones must come from branches/campaigns where the first player turn has not been made yet. Do not use already-played smoke campaigns as 60-turn sources.
- Removed wrong acceptance clone `7bbd20d3-651c-4f93-bfcc-5c2ab451538d`, which had been cloned from an already-played Ashfall smoke source.
- Created and verified zero-turn acceptance clones:
  - Lane A / JJK movement-heavy: source `8d9f2423-c9ad-4f4d-ad96-8f0fc8e93dcc` -> clone `a4e06d79-3695-437e-bef2-b1ae64286e35`; `chat=0`, `settled_turn_packets=0`, player `Tanaka Kouta`, location `Shibuya Ward`, 8 movement options, inventory includes `Burner phone`, `Delivery manifest`, `Worn messenger bag`.
  - Lane B / Lacquer movement-heavy: source `30e161da-db4b-4d8c-ab93-154fab7aa03f` -> clone `ba788102-b970-43f2-8221-6f0f136e23f8`; `chat=0`, `settled_turn_packets=0`, player `Mira Voss`, location `Lowwater Bazaar`, 8 movement options, inventory includes `Courier satchel`, `Sealed lacquer message tube`.
  - Lane C / Ashfall NPC/documents: source `2badd884-f63a-456c-b832-e88439fb62b4` -> clone `b13e8cfd-468e-44ef-a464-62e13fd70a7a`; `chat=0`, `settled_turn_packets=0`, player `Mara Venn`, scene `Municipal Stores Front Counter`, active NPC `master clerk`, rich document inventory, no current movement options.
- Created fresh replacement zero-turn acceptance clones after the first set was consumed by live acceptance turns:
  - Lane A / JJK movement-heavy: source `8d9f2423-c9ad-4f4d-ad96-8f0fc8e93dcc` -> clone `711a16bb-cab4-4e2d-ad3f-b93ba81cdd93`; `chat=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, manifest source/target verified.
  - Lane B / Lacquer movement-heavy: source `30e161da-db4b-4d8c-ab93-154fab7aa03f` -> clone `139070ce-442a-4eea-88a0-0f735879ade5`; `chat=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, manifest source/target verified.
  - Lane C / Ashfall NPC/documents: source `2badd884-f63a-456c-b832-e88439fb62b4` -> clone `44d9d1e9-84d8-48f6-9ccf-708ad95b3cd3`; `chat=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, manifest source/target verified.
- Created reserve zero-turn clones before further first-turn acceptance work:
  - Lane A / JJK reserve: source `711a16bb-cab4-4e2d-ad3f-b93ba81cdd93` -> clone `6bc742b5-1f87-4ed3-ba99-ac8e8b3d1473`; `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, manifest source/target verified.
  - Lane B / Lacquer reserve: source `139070ce-442a-4eea-88a0-0f735879ade5` -> clone `ce740a13-3b78-43a9-9bdc-6973be2ff7b9`; `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, manifest source/target verified.
  - Lane C / Ashfall reserve: source `2badd884-f63a-456c-b832-e88439fb62b4` -> clone `b61eca3d-c71b-4521-81bd-2b636464844f`; `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, manifest source/target verified.
- Lane A reserve live acceptance:
  - Preflight verified clone `6bc742b5-1f87-4ed3-ba99-ac8e8b3d1473` loaded through `/api/campaigns/:id/load`; `chat_history=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`.
  - Turn 1 real `/api/chat/action`: `Я проверяю delivery manifest и burner phone, затем осматриваюсь на Shibuya Ward, чтобы выбрать самый безопасный следующий маршрут.`
  - Turn 1 reached `narrative` and `done`; DB showed `chat_history=2`, `settled_turn_packets=1`, `turn_sagas=1`, `narrator_attempts=1`; saga `5243f65d-0cb5-42b1-84b7-c9be6c79e9b3` finalized and narrator attempt `82c66cdb-7d8f-4ede-9067-423023036011` succeeded.
  - Packet `11d2357d-d411-4a2c-aca0-29bcfbadca90` had `gmRead.path="tool_plan"`, checklist steps `find_object_candidates` and `list_navigation_options`, and accepted both tools. `list_navigation_options` returned 6 connected routes including `East Exit Underground Passage`.
  - Narration quality smell: storyteller summarized the route assessment without naming the available routes. Packet truth is correct, but long-run polish should make route-list observation turns expose useful route names to the player.
  - Turn 2 real `/api/chat/action`: `Я выбираю East Exit Underground Passage как самый безопасный путь и иду туда, держа burner phone под рукой.`
  - Turn 2 reached `narrative` and `done`; DB showed `chat_history=4`, `settled_turn_packets=2`, `turn_sagas=2`, `narrator_attempts=2`, `pendingSagas=0`.
  - Packet `ade9551f-d72a-4682-84dd-be9960eb5ece` had `gmRead.path="tool_plan"`, one `move_actor` checklist step, accepted `move_actor` input with destination `East Exit Underground Passage`, path `["Shibuya Ward","East Exit Underground Passage"]`, and resultWorldVersion `1`.
  - Grounding check: player `Tanaka Kouta` current location and current scene both updated to `East Exit Underground Passage`.
- Lane A first-turn live acceptance:
  - First attempt exposed a Stage 4 prompt contract gap: `list_navigation_options` was proposed with `maxResults: 10` while the backend schema caps it at 8. Fixed `toolContractHint` for bridge lookup tools so prompt contracts expose `maxResults` bounds.
  - Second attempt exposed a real ownership mismatch: Stage 3/4 selected `inspect_known_fact` for visible inventory objects (`Delivery manifest`, `Burner phone`), and the bridge correctly rejected it with `no_player_visible_or_known_fact`.
  - Fixed by tightening Stage 3 guidance (`find_object_candidates` for visible/current/inventory objects; `inspect_known_fact` only for player-known facts/canon claims) and allowing one Stage 4 repair within bridge lookup tools, not across mutating tools.
  - Verified on real `/api/chat/action` against zero-turn clone `a4e06d79-3695-437e-bef2-b1ae64286e35` with action: `Я проверяю delivery manifest и burner phone, затем осматриваюсь на Shibuya Ward, чтобы выбрать самый безопасный следующий маршрут.`
  - Result: SSE reached `narrative` and `done`; DB showed `chat=2`, `settled_turn_packets=1`, `turn_sagas=1`, `narrator_attempts=1`, `pendingSagas=0`.
  - Latest saga `116483ab-a84a-4b77-9114-800646604263` finalized; packet `b5faf28d-afae-47aa-b42d-09915c54408e` persisted accepted tool refs `["step-1:find_object_candidates","step-2:list_navigation_options"]`; narrator attempt `3b74cb65-2afb-4bfd-951d-e132454fbcd5` succeeded.
  - Verification: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts settled-turn-packet-v1-store.test.ts actor-tools.test.ts chat.scene-plan.test.ts chat.test.ts` passed with 113 tests.
- Lane A second-turn live acceptance:
  - Verified current SceneFrame after first turn: tick `1`, location/scene `Shibuya Ward`, 8 connected movement candidates, including `East Exit Underground Passage`.
  - Real `/api/chat/action` against `a4e06d79-3695-437e-bef2-b1ae64286e35`: `Я выбираю East Exit Underground Passage как самый безопасный путь и иду туда, держа burner phone под рукой.`
  - Result: SSE reached `narrative` and `done`; backend log showed accepted `move_actor` with destination `East Exit Underground Passage`, travelCost `1`, path `["Shibuya Ward","East Exit Underground Passage"]`.
  - DB showed `chat=4`, `settled_turn_packets=2`, `turn_sagas=2`, `narrator_attempts=2`, `pendingSagas=0`; player location and scene both updated to `East Exit Underground Passage`.
  - Packet `964773d1-a346-494a-bed0-337e614f5fd9` persisted resultWorldVersion `1` and accepted refs including `step-1:move_actor`.
- Lane B first-turn live acceptance:
  - Real `/api/chat/action` against zero-turn clone `ba788102-b970-43f2-8221-6f0f136e23f8`: `Я проверяю sealed lacquer message tube и courier satchel, затем осматриваю Lowwater Bazaar и выбираю самый безопасный дальнейший путь.`
  - Stage 3 checklist produced two backend steps with `toolNeed=["find_object_candidates","list_navigation_options"]`; Stage 4 accepted `find_object_candidates` and `list_navigation_options`.
  - DB showed `chat=2`, `settled_turn_packets=1`, `turn_sagas=1`, `narrator_attempts=1`, `pendingSagas=0`.
  - Packet `09b0044f-eec2-4c50-8c2e-2ac4b1e2a5df` persisted accepted refs `["inspect-items:find_object_candidates","assess-routes:list_navigation_options"]`; narrator attempt `c446f935-f8b9-40f8-ad7f-f84ce36716e6` succeeded.
  - Minor narration quality smell observed: one English word leaked into Russian prose (`reveals`). Not a settled-truth contract failure, but worth tracking before final polish.
- Lane B second-turn live acceptance:
  - Verified current SceneFrame after first turn: tick `1`, location/scene `Lowwater Bazaar`, 8 connected movement candidates, including `Silt Warrens`.
  - Real `/api/chat/action` against `ba788102-b970-43f2-8221-6f0f136e23f8`: `Я выбираю Silt Warrens как путь с наименьшим количеством открытых линий обзора и иду туда, держа sealed lacquer message tube в satchel.`
  - Result: SSE reached `narrative` and `done`; backend log showed accepted `move_actor` with destination `Silt Warrens`, travelCost `1`, path `["Lowwater Bazaar","Silt Warrens"]`.
  - DB showed `chat=4`, `settled_turn_packets=2`, `turn_sagas=2`, `narrator_attempts=2`, `pendingSagas=0`; player location and scene both updated to `Silt Warrens`.
  - Packet `59f98d4f-bb71-4328-95dc-9b36b126df78` persisted resultWorldVersion `1` and accepted refs including `step-1:move_actor`.
  - Minor narration quality smell observed: one English word leaked into Russian prose (`openness`). This is language polish, not a settled-truth contract failure.
- Lane C first-turn live acceptance:
  - Real `/api/chat/action` against zero-turn clone `b13e8cfd-468e-44ef-a464-62e13fd70a7a`: `Я показываю master clerk requisition chit и спрашиваю, какие записи в municipal logs подтверждают выдачу supplies; затем сверяю это с ledger folio.`
  - Stage 3 checklist produced one backend step with `toolNeed=["record_dialogue_outcome"]`; Stage 4 accepted durable `record_dialogue_outcome`.
  - Backend accepted quote: `Log entry fifty-three, cycle nine, records issuance against this chit—eight sealed repair bars. Your ledger here shows twelve. The numbers don't match.`
  - DB showed `chat=2`, `settled_turn_packets=1`, `turn_sagas=1`, `narrator_attempts=1`, `pendingSagas=0`.
  - Packet `bde4dcf8-d5bf-4aaf-ba65-46c5fac5c401` persisted resultWorldVersion `132` and accepted refs including `step-1:record_dialogue_outcome`; narrator attempt `ce012543-8fa7-4869-85d1-e0624e13402e` succeeded.
  - Grounding check: narrator's 8-vs-12 discrepancy matches accepted `record_dialogue_outcome`, so this was not a narration leak.
- Lane C second-turn contract failure and replay:
  - Original second turn against `b13e8cfd-468e-44ef-a464-62e13fd70a7a`: `Я мелом помечаю в damaged field ledger строку с расхождением восемь против двенадцати как urgent discrepancy и прошу master clerk поставить рядом короткую отметку о сверке.`
  - Failure: Stage 3 folded the player-applied chalk annotation into a single `record_dialogue_outcome`. The narrator referenced the chalk mark, but `damaged field ledger` tags were unchanged. This was a missing accepted state receipt, not a narration-only polish issue.
  - Fix: Stage 3 checklist prompt now requires separate required backend steps for multiple backend-owned consequences; player-applied marks/tags/annotations on visible objects must use `toolNeed=entity_tag` before dependent dialogue/procedure steps and must not be folded into `record_dialogue_outcome`.
  - Focused verification: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts` passed with 24 tests.
  - Live replay clone: source `2badd884-f63a-456c-b832-e88439fb62b4` -> clone `f2050c32-0308-4597-a0b8-7eac2aecf99a`.
  - Replay first turn reached `narrative` and `done`, persisted packet `89060968-c84b-4033-9f59-b5a032fae0d1` with accepted `step-1:record_dialogue_outcome`.
  - Replay second turn reached `narrative` and `done`; Stage 3 produced two required backend steps with `toolNeed=["entity_tag","record_dialogue_outcome"]`.
  - Stage 4 accepted `add_tag` on `damaged field ledger` with tag `urgent discrepancy`, then accepted durable `record_dialogue_outcome` for the clerk's refusal/redirect to a separate discrepancy form.
  - DB showed `chat=4`, `settled_turn_packets=2`, `turn_sagas=2`, `narrator_attempts=2`, `pendingSagas=0`; `damaged field ledger` tags now include `urgent discrepancy`; packet `39b585ed-3bee-4b21-9534-9ba860fd4615` persisted accepted refs including `step-1:add_tag` and `step-2:record_dialogue_outcome`.
- Lane C third-turn proof/document contract replay:
  - Failed pre-fix attempt had exposed a Stage 4 prompt contract gap: the `record_dialogue_outcome` generator used invalid `futureUseKind="proof"` and an empty `requestedRoleText`, so the turn restored pre-packet state.
  - Fix: Stage 4 tool request system prompt and `toolContractHint("record_dialogue_outcome")` now expose the exact `futureUseKind` enum, explicitly map proof/documentary later use to `evidence`, and require optional strings to be omitted instead of sent empty.
  - Verification: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts settled-turn-packet-v1-store.test.ts actor-tools.test.ts chat.scene-plan.test.ts chat.test.ts` passed with 115 tests.
  - Real `/api/chat/action` replay against `f2050c32-0308-4597-a0b8-7eac2aecf99a`: `На petition-grade paper я аккуратно составляю discrepancy form: указываю damaged field ledger, requisition chit и расхождение urgent discrepancy; затем прошу master clerk поставить на форму штамп приёма.`
  - Result: SSE reached `narrative` and `done`; DB showed `chat=6`, `settled_turn_packets=3`, `turn_sagas=3`, `narrator_attempts=3`, `pendingSagas=0`; latest saga finalized and narrator attempt succeeded.
  - Packet `5fa60dea-34da-4b8e-aa5c-ec3cb787d76d` persisted accepted refs including `step-1:add_tag` and `step-2:record_dialogue_outcome`; `petition-grade paper and small ink vial` tags now include `discrepancy-form`.
  - Grounding check: accepted dialogue input used `topicKind="proof"`, valid `futureUseKind="evidence"`, no empty `requestedRoleText`, and the narrator's stamped-form/proof narration matches the accepted dialogue outcome and item tag.
- Lane C fresh replacement three-turn replay:
  - Verified clean clone `44d9d1e9-84d8-48f6-9ccf-708ad95b3cd3` from source `2badd884-f63a-456c-b832-e88439fb62b4`: `chat=0`, `settled_turn_packets=0`, `turn_sagas=0`, `narrator_attempts=0`, `pendingSagas=0`; `damaged field ledger` and `petition-grade paper and small ink vial` were present.
  - Turn 1 real `/api/chat/action`: `Я показываю master clerk requisition chit и спрашиваю, какие записи в municipal logs подтверждают выдачу supplies; затем сверяю это с ledger folio.`
  - Turn 1 reached `narrative` and `done`; DB showed `chat=2`, `settled_turn_packets=1`, `turn_sagas=1`, `narrator_attempts=1`, `pendingSagas=0`; packet `40819eed-f4e6-44d0-8d99-353e69473bcf` accepted `step-1:record_dialogue_outcome` and `step-2:record_world_fact`, grounding partial confirmation plus quantity/date gap.
  - Turn 2 real `/api/chat/action`: `Я мелом помечаю в damaged field ledger размытые графы quantity и date как urgent discrepancy и прошу master clerk поставить рядом короткую отметку о том, что сверка дала только partial confirmation.`
  - Turn 2 reached `narrative` and `done`; DB showed `chat=4`, `settled_turn_packets=2`, `turn_sagas=2`, `narrator_attempts=2`, `pendingSagas=0`; packet `58fec692-6eda-46fe-b32c-7ca47bfb1293` accepted `step-1:add_tag` and `step-2:record_dialogue_outcome`; `damaged field ledger` tags include `urgent_discrepancy:quantity,date`.
  - Turn 3 first attempt correctly restored pre-packet after a schema failure in dependent `record_dialogue_outcome`: Stage 4 accepted `add_tag` on petition paper, then the dialogue request hallucinated malformed `stateEffects` without a backend-issued `stateReceipt`; rollback preserved `chat=4`, `settled_turn_packets=2`, `turn_sagas=2`, `narrator_attempts=2`, `pendingSagas=0`, and petition paper was not tagged.
  - Fix: v1 now attaches model-safe `state_receipt_N_M` aliases to accepted structural state-bearing tool results and exposes only those aliases through `acceptedContext.stateReceipts`; Stage 4 prompt and contract hint define when `record_dialogue_outcome.stateEffects.applied_now` may use them.
  - Verification after fix: `npm --prefix backend run typecheck`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts`; `npm --prefix backend test -- gameplay-turn-cycle-v1.test.ts settled-turn-packet-v1-store.test.ts actor-tools.test.ts chat.scene-plan.test.ts chat.test.ts` passed with 116 tests.
  - Turn 3 retry real `/api/chat/action`: `На petition-grade paper я аккуратно составляю discrepancy form: указываю damaged field ledger, requisition chit, размытые quantity/date и пометку urgent_discrepancy; затем прошу master clerk поставить на форму штамп приёма.`
  - Turn 3 retry reached `narrative` and `done`; DB showed `chat=6`, `settled_turn_packets=3`, `turn_sagas=3`, `narrator_attempts=3`, `pendingSagas=0`; packet `e316446b-b66d-4a3e-8136-01b62503bcbb` accepted `step-1:add_tag`, `step-2:record_dialogue_outcome`, and `step-3:spawn_item`.
  - Grounding check: petition paper tags include `discrepancy-form`; spawned item `stamped discrepancy form — damaged field ledger` carries durable proof/document tags; accepted dialogue used valid `topicKind="proof"`, `futureUseKind="evidence"`, and no malformed `stateEffects`.
