# 92-03 Summary: JIT Actor Exposure Catchup And Private POV

Status: complete
Date: 2026-05-10

## Implemented

- Added `resolveActorExposureCatchup` as a pre-exposure seam for actor candidates in the visible scope plus due durable wake rows.
- Wired database-backed `buildSceneFrame` to run exposure catchup before NPC roster/target exposure, with an opt-out for callers that already resolved it.
- Passed elapsed-world-time context from the scene-plan turn boundary into SceneFrame refreshes so broad-location exposure catchup keeps the same timing policy as due world work.
- Deferred non-deterministic visible actor work into idempotent `key_actor_exposure_decision` proposals instead of mutating state or exposing private plan text as truth.
- Added prompt/private POV regressions proving player prompt and model-facing scene view omit private identity, belief, hidden report, and pending-proposal terms.

## Proof

- `npm --prefix backend run test -- src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/offscreen-catchup.test.ts src/engine/__tests__/narrator-packet.test.ts`
  - 3 files, 29 tests passed.
- `npm --prefix backend run test -- src/engine/__tests__/turn-processor.scene-plan.test.ts`
  - 1 file, 23 tests passed.
- `npm --prefix backend run typecheck`
  - Passed.
- `git diff --check`
  - Passed with only LF-to-CRLF working-copy warnings.

## Requirement Mapping

- P92-R5: SceneFrame invokes actor exposure catchup before reading roster/target candidates, so due deterministic visible actors move before stale exposure.
- P92-R6: Private actor names, beliefs, goals, hidden report causes, and pending proposal payload terms are excluded from player prompt/model-facing view surfaces unless represented by visible source routes.
- P92-R8: Focused acceptance tests cover deterministic catchup, non-deterministic deferred work, proposal idempotency, and private POV redaction.

## GitNexus Impact

Pre-edit impact was LOW for `buildSceneFrame`, `buildRoster`, and `buildNarratorPacket`.

GitNexus did not resolve `processTurnScenePlan` or `processTurn` as indexed symbols, so turn-boundary edits were kept to passing elapsed-time options into `buildSceneFrame`.

`detect_changes(scope="all")` reported MEDIUM risk on `buildSceneFrame` and `SceneFrameBuildOptions`, with affected processes limited to the indexed SceneFrame build flows. Focused SceneFrame, offscreen catchup, narrator packet, turn scene-plan, typecheck, and diff checks passed.
