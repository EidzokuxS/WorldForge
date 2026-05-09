# 81-02 SUMMARY: Turn Path Gating

## Result

Complete.

The live ScenePlan turn path now uses `runGmRead` as the GM interpretation/path gate. Direct, continue, and clarification GM Read paths no longer call `runScenePlanner`, `validateScenePlan`, or `executeScenePlan`.

## Code Changes

- Updated `backend/src/engine/turn-processor.ts`.
  - Replaced live `runGmTurnDecision` call with `runGmRead`.
  - Updated Oracle/combat target helpers to consume GM Read path objects.
  - Added `isNoMutationGmReadPath`.
  - Added a temporary no-mutation settled execution snapshot for direct/continue/clarification so final narration can still consume settled packet truth without mutating state.
  - Emits/logs GM Read stage names (`gm-read`) and no-mutation skip telemetry.
- Updated `backend/src/engine/scene-planner.ts`.
  - ScenePlanner prompt now labels upstream path input as `GM READ`.
  - `SCENE_PLAN_TURN_ORDER` now names `runGmRead`.
  - Kept temporary type compatibility for old `GmTurnDecision` fixtures while the live path sends GM Read.
- Updated tests:
  - `backend/src/engine/__tests__/turn-processor.test.ts`
  - `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts`
  - `backend/src/engine/__tests__/scene-planner.test.ts`

## Deliberate Non-Changes

- `buildNoMutationScenePlan` remains as a temporary packet shim. It no longer routes through validator/executor for no-mutation paths, but full settled packet ownership belongs to 81-05.
- Mutating/combat paths still use ScenePlanner until 81-03/81-04 introduce GM Action Checklist and validated tool-step execution.
- `gm-turn-decision.ts` and `gm-beat-plan.ts` are not deleted in this slice. Live reliance is reduced here; cleanup is deferred to later Phase 81 plans once checklist/tool-step/narrator handoff are in place.

## Verification

```bash
npm --prefix backend exec vitest run backend/src/engine/__tests__/scene-planner.test.ts backend/src/engine/__tests__/turn-processor.scene-plan.test.ts backend/src/engine/__tests__/turn-processor.test.ts backend/src/engine/__tests__/gm-turn-read.test.ts
```

Passed: 7 files, 199 tests.

```bash
npm --prefix backend run typecheck
```

Passed.

```bash
git diff --check -- backend/src/engine/turn-processor.ts backend/src/engine/scene-planner.ts backend/src/engine/__tests__/turn-processor.test.ts backend/src/engine/__tests__/turn-processor.scene-plan.test.ts backend/src/engine/__tests__/scene-planner.test.ts
```

Passed with only LF-to-CRLF warnings.

GitNexus `detect_changes(scope: "unstaged")` still reports CRITICAL for the full dirty worktree because many unrelated Phase 79/80/81 recovery files are modified. Relevant 81-02 live touched symbols are `buildNoMutationScenePlan`, `buildOracleContextFromRollRequest`, `buildOracleContextFromCombatTransition`, `runScenePlanner`, and `RunScenePlannerArgs`.

## Next

Proceed to 81-03: introduce the bounded GM Action Checklist for mutating/combat turns, using GM Read as input and keeping concrete tool requests out of no-mutation paths.
