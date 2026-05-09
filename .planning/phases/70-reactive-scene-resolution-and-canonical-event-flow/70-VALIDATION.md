---
phase: 70
slug: reactive-scene-resolution-and-canonical-event-flow
status: green
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-25
---

# Phase 70 - Validation Strategy

Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Vitest |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `cd backend && npx vitest run src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/scene-turn-packet.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/routes/__tests__/chat.scene-plan.test.ts` |
| Full suite command | `npm --prefix backend test` |
| Typecheck command | `npm --prefix backend run typecheck` |
| Estimated runtime | ~60-180 seconds for targeted suite; full suite depends on local machine state |

## Sampling Rate

- After every task commit: run `npm --prefix backend run typecheck` plus the targeted Vitest command for touched modules.
- After every plan wave: run `npm --prefix backend test`.
- Before `$gsd-verify-work`: full backend test suite must be green.
- Max feedback latency: one focused test command per task, full suite at wave boundaries.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 70-01-01 | 01 | 0 | P70-R1 | T70-01 | SceneFrame contains only real campaign actors, locations, awareness bands, recent events, and allowed tools. | unit | `cd backend && npx vitest run src/engine/__tests__/scene-frame.test.ts` | yes | green |
| 70-01-02 | 01 | 0 | P70-R2 | T70-02 | Invalid ScenePlan shape retries/repairs and fails loud if strict parse still fails. | unit | `cd backend && npx vitest run src/engine/__tests__/scene-planner.test.ts` | yes | green |
| 70-01-03 | 01 | 0 | P70-R3 | T70-03 | Invalid actor, invalid tool name, or invalid tool args fail before DB mutation. | unit/integration | `cd backend && npx vitest run src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/tool-executor.test.ts` | yes | green |
| 70-01-04 | 01 | 0 | P70-R4 | T70-04 | Normal action/retry does not call `tickPresentNpcs()` before final narration when ScenePlan path is active. | integration | `cd backend && npx vitest run src/engine/__tests__/turn-processor.scene-plan.test.ts src/routes/__tests__/chat.test.ts` | yes | green |
| 70-01-05 | 01 | 0 | P70-R5 | T70-05 | Oracle remains a separate call and ScenePlan receives/obeys outcome bounds. | integration | `cd backend && npx vitest run src/engine/__tests__/turn-processor.scene-plan.test.ts` | yes | green |
| 70-01-06 | 01 | 0 | P70-R6 | T70-06 | NarratorPacket excludes actors/facts with player awareness `none`, keeps `hint` identity obfuscated, and exposes backend-only forbidden scan metadata that is not included in the prompt. | unit | `cd backend && npx vitest run src/engine/__tests__/scene-turn-packet.test.ts src/engine/__tests__/scene-presence.test.ts` | yes | green |
| 70-01-07 | 01 | 0 | P70-R7 | T70-07 | Neutral input cannot escalate via independent NPC mini-round; canonical event ordering is asserted. | integration/regression | `cd backend && npx vitest run src/engine/__tests__/turn-processor.scene-plan.test.ts` | yes | green |
| 70-01-08 | 01 | 0 | P70-R8 | T70-08 | Engine-vs-LLM boundary and deferred work are documented in phase artifacts and code comments where needed. | doc/test review | `rg "Scene Planner of Record|Engine-owned|LLM-owned|deferred" .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow backend/src/engine` | yes | green |
| 70-05-03 | 05 | 4 | P70-R6 | T70-09 | Storyteller final prose is scanned after generation and before persistence; forbidden exact names/fact markers retry once, then fail before assistant message persistence. | unit/integration | `cd backend && npx vitest run src/engine/__tests__/visible-narration-output-guard.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts` | yes | green |
| 70-03-03 | 03 | 1 | P70-R2 | T70-11 | `narratorFacts` is reference-only (`eventIds` / `responseIds` / `actionIds` / `toolResultRefs`) and rejects free prose fields before planner output can reach packet projection. | unit | `cd backend && npx vitest run src/engine/__tests__/scene-planner.test.ts` | yes | green |
| 70-04-03 | 04 | 2 | P70-R3 | T70-14 | `executeScenePlan` returns full per-action `ToolResult` metadata for CanonicalTurnPacket/NarratorPacket projection, including action order/id, actor id, tool name, input, and raw result. | unit | `cd backend && npx vitest run src/engine/__tests__/scene-plan-validator.test.ts` | yes | green |
| 70-05-04 | 05 | 3 | P70-R6 | T70-13 | Hint-band actor names are included in backend-only `forbiddenActorNames`; prompt receives hint signals only and pre-prompt guard scans packet prose before formatting. | unit | `cd backend && npx vitest run src/engine/__tests__/scene-turn-packet.test.ts src/engine/__tests__/prompt-assembler.test.ts` | yes | green |
| 70-05-05 | 05 | 3 | P70-R6 | T70-10 | Final visible narration is non-streaming or buffered until `runVisibleNarrationWithPacketGuard` passes; no `narrative` SSE/TurnEvent reaches the client before validation. | unit/integration | `cd backend && npx vitest run src/engine/__tests__/visible-narration-output-guard.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts` | yes | green |
| 70-06-03 | 06 | 4 | P70-R1/P70-R7 | T70-12 | `backend/src/engine/target-context.ts` classifier path (`detectCandidateByClassifier`, source `classifier`) and LLM `detectMovement` do not run before `buildSceneFrame`; if retained, they run only after SceneFrame from frame-owned candidates. | integration | `cd backend && npx vitest run src/engine/__tests__/turn-processor.scene-plan.test.ts` | yes | green |
| 70-06-04 | 06 | 4 | P70-R4/P70-R7 | T70-15 | `SCENE_PLAN_ENABLED` defaults true; explicit `false` isolates legacy path without invoking ScenePlan modules; docs/comments define removal after focused Phase 70 tests pass or a dated follow-up with failing evidence. | integration/doc | `cd backend && npx vitest run src/engine/__tests__/turn-processor.scene-plan.test.ts && rg "SCENE_PLAN_ENABLED|temporary|remove|cleanup|dated follow-up" .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70A-MIGRATION-PLAN.md backend/src/engine/turn-processor.ts` | yes | green |
| 70-07-03 | 07 | 5 | P70-R3/P70-R7 | T70-07/T70-16 | Execution failure after earlier validated action N restores route snapshot, removes partial mutations, emits no `done`, and persists no unsafe assistant message. | route integration | `cd backend && npx vitest run src/routes/__tests__/chat.scene-plan.test.ts src/routes/__tests__/chat.test.ts` | yes | green |
| 70-07-04 | 07 | 5 | P70-R4 | T70-04 | `tickPresentNpcs` is removed from normal route imports/action-retry critical path and retained only for background/offscreen/future non-critical rationale. | static/doc | `powershell -NoProfile -Command "if (rg 'tickPresentNpcs' backend/src/routes/chat.ts) { exit 1 }; rg 'tickPresentNpcs|background/offscreen' backend/src/engine/npc-agent.ts .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70A-MIGRATION-PLAN.md"` | yes | green |

Status: pending, green, red, flaky. Current Phase 70 status: green.

## Wave 0 Requirements

- [x] `backend/src/engine/__tests__/scene-frame.test.ts` - contract-first tests for P70-R1.
- [x] `backend/src/engine/__tests__/scene-planner.test.ts` - contract-first tests for P70-R2.
- [x] `backend/src/engine/__tests__/scene-plan-validator.test.ts` - contract-first tests for P70-R3 and P70-R5.
- [x] `backend/src/engine/__tests__/scene-turn-packet.test.ts` - contract-first tests for P70-R6.
- [x] `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts` - contract-first ordering tests for P70-R4 and P70-R7.
- [x] Later implementation plans must add red/green runtime behavior tests before each live wiring change; Wave 0 is allowed to go green because it creates backend-local contracts, not live behavior.
- [x] Route retry coverage for `/api/chat/retry` if the planner touches retry wiring.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| None planned | P70-R1..P70-R8 | Phase 70 behaviors should be covered by automated unit/integration tests. | N/A |

## Threat References

| Threat Ref | Threat | Required Mitigation |
|------------|--------|---------------------|
| T70-01 | Model output references nonexistent or out-of-scope actors/locations. | ScenePlan validator rejects references not present in SceneFrame allow-lists. |
| T70-02 | Malformed model output silently degrades into unsafe fallback. | Strict schema parse with bounded repair; fail loud after repair budget. |
| T70-03 | Tool arguments bypass existing runtime validation. | Execute through existing runtime tool schemas/executor and preflight before mutation where possible. |
| T70-04 | Present NPC mini-round mutates state after canonical plan. | Remove `tickPresentNpcs()` from normal visible critical path when ScenePlan path is active. |
| T70-05 | Oracle outcome is ignored or contradicted by ScenePlan. | Pass Oracle result and outcome bounds into planner/validator; reject forbidden effects. |
| T70-06 | Hidden actor/fact leaks into narrator prompt or final prose. | Build NarratorPacket from player-perceivable committed facts only. |
| T70-07 | Partial execution failure leaves inconsistent state. | Preserve route snapshot restore path and test validation/execution failures. |
| T70-08 | Boundary drift reintroduces hidden planning or background simulation into visible path. | Document owner boundaries and assert ordering in tests. |
| T70-09 | Storyteller final prose leaks a forbidden exact actor name or packet-forbidden fact marker after prompt filtering. | Scan final prose after generation and before persistence; retry once with a generic non-leaking guard addendum, then throw before `appendChatMessages()` if still unsafe. |
| T70-10 | Streaming leaks unsafe final prose to `narrative` SSE before output guard validation. | Final visible narration is non-streaming or buffered inside `runVisibleNarrationWithPacketGuard`; tests assert no `narrative` SSE/TurnEvent before guard pass. |
| T70-11 | LLM-authored `narratorFacts` prose becomes a hidden-fact side channel. | `narratorFacts` uses backend IDs/references only; schema/validator reject free prose and packet projection ignores LLM fact prose. |
| T70-12 | LLM movement or target classifier runs before deterministic SceneFrame and preserves old ordering. | Tests name `backend/src/engine/target-context.ts`, `detectCandidateByClassifier`, `source: "classifier"`, and `detectMovement`; normal ScenePlan path builds frame first, then uses frame-owned candidates or bypasses the old classifier entirely. |
| T70-13 | Hint-band actor identity leaks because hint names are omitted from forbidden scan metadata. | Include hint-band actor exact names in backend-only `forbiddenActorNames`; prompt receives hint signals only. |
| T70-14 | Tool result projection is too lossy for CanonicalTurnPacket/NarratorPacket. | `executeScenePlan` returns full per-action `ToolResult` metadata and tests assert packet projection inputs. |
| T70-15 | Rollback flag undermines ScenePlan cutover or mixes legacy and ScenePlan stages. | `SCENE_PLAN_ENABLED` defaults true; only exact `false` runs isolated legacy path; docs/comments mark flag temporary and define cleanup/removal criteria after focused Phase 70 tests pass or a dated follow-up records failing evidence. |
| T70-16 | Action-N execution failure leaves partial mutations or unsafe assistant text after route error. | Route tests prove snapshot restore after partial execution failure, no `done`, and no unsafe assistant persistence. |

## Validation Sign-Off

- [x] All tasks have automated verify commands or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency is bounded by targeted commands per task.
- [x] Set `nyquist_compliant: true` after the planner creates tasks that cover this map.

Approval: green after focused Phase 70 suite and backend typecheck passed on 2026-04-25.

## Execution Evidence

### 2026-04-25 Task 1 Focused Regression Matrix

- `cd backend; npx vitest run src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/scene-turn-packet.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/routes/__tests__/chat.scene-plan.test.ts` - exit 0; 7 files passed; 59 tests passed.
- `npm --prefix backend run typecheck` - exit 0.
- `rg "neutral input|hidden observer|hint actor|narratorFacts|actor IDs|ToolResult|unknown actor|frame.*oracle.*plan.*validate.*execute.*packet.*narrate|buildSceneFrame.*before.*callOracle|target-context|after SceneFrame|SCENE_PLAN_ENABLED|cleanup criteria|restoreSnapshot|action N|partial mutations|onBeforeVisibleNarration" backend/src/engine/__tests__/turn-processor.scene-plan.test.ts backend/src/routes/__tests__/chat.scene-plan.test.ts backend/src/engine/__tests__/scene-plan-validator.test.ts backend/src/engine/__tests__/scene-turn-packet.test.ts backend/src/engine/turn-processor.ts .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70A-MIGRATION-PLAN.md` - exit 0; required regression labels and source seams found.
- `rg "forbidden Storyteller output|retry once|generic guard|second.*throws|appendChatMessages|runVisibleNarrationWithPacketGuard|narrative|SSE|forbiddenActorNames|forbiddenFactMarkers" backend/src/engine/__tests__/visible-narration-output-guard.test.ts backend/src/engine/__tests__/turn-processor.scene-plan.test.ts` - exit 0; T70-09 and T70-10 guard labels found.

### 2026-04-25 Task 2 Closeout Verification

- `rg "Scene Planner of Record|Engine-owned|LLM-owned|Deferred|D-01|D-08" 70A docs` - exit 0; required boundary terms found across Phase 70A docs.
- Per-file doc contract check for `70A-SCENE-FRAME-SPEC.md`, `70A-SCENE-PLAN-SCHEMA.md`, `70A-NARRATOR-PACKET-SPEC.md`, `70A-VALIDATION-MATRIX.md`, and `70A-MIGRATION-PLAN.md` - exit 0; each required doc contains `Scene Planner of Record`, `Engine-owned`, `LLM-owned`, `Deferred`, `D-01`, and `D-08`.
- `rg "Oracle and Scene Planner fusion|full all-actor global simulation|background faction/offscreen scheduler rewrite|actor reflection architecture rewrite|new UI work|new persistence schema|generalized social/combat/romance/economy|SCENE_PLAN_ENABLED|cleanup criteria|dated follow-up|tickPresentNpcs|narratorFacts|narrative SSE" 70A docs` - exit 0; required deferred list and guard terms found.
- `cd backend; npx vitest run src/engine/__tests__/turn-processor.inventory-authority.test.ts` - exit 0; 1 file passed; 1 test passed after isolating the legacy hidden-adjudication inventory seam with `SCENE_PLAN_ENABLED=false`.
- `npm --prefix backend run typecheck` - exit 0.
- `cd backend; npx vitest run src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/scene-turn-packet.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/routes/__tests__/chat.scene-plan.test.ts` - exit 0; 7 files passed; 59 tests passed.
- `npm --prefix backend test` - first run failed on `src/engine/__tests__/turn-processor.inventory-authority.test.ts` because the legacy Phase 69 hidden-adjudication transfer_item seam test entered the default ScenePlan path and received invalid JSON from the mocked Storyteller path. The test was scoped to `SCENE_PLAN_ENABLED=false` as the documented rollback isolation flag.
- `npm --prefix backend test` - final run exit 0; 133 files passed; 3 skipped; 1649 tests passed; 30 todo.
- `gitnexus_detect_changes({ scope: "all", repo: "WorldForge-phase70-execute" })` - risk low; affected processes 0; changed symbols reported only pre-existing `CLAUDE.md` GitNexus/context drift while docs/test closeout changes did not map to indexed execution-flow symbols.
- `node C:\Users\robra\.codex\get-shit-done\bin\gsd-tools.cjs phase-plan-index 70` - exit 0; incomplete list contains only `70-08`; `70A-MIGRATION` has `task_count: 0` and `has_summary: true`, so it is no longer listed as incomplete.
