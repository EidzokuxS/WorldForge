---
phase: 70-reactive-scene-resolution-and-canonical-event-flow
plan: 06
subsystem: backend-engine
tags: [scene-plan, turn-processor, narrator-packet, observability, tdd]
dependency_graph:
  requires: [70-02, 70-03, 70-04, 70-05]
  provides:
    - default SceneFrame to ScenePlan turn processor path
    - temporary SCENE_PLAN_ENABLED rollback flag
    - compact ScenePlan observability seams
  affects:
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/__tests__/turn-processor.scene-plan.test.ts
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/engine/__tests__/turn-processor.observability.test.ts
tech_stack:
  added: []
  patterns:
    - TDD red/green commits
    - non-streaming visible narration packet guard before assistant persistence
    - bounded observability with counts and IDs only
key_files:
  created:
    - .planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70A-MIGRATION-PLAN.md
  modified:
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/__tests__/turn-processor.scene-plan.test.ts
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/engine/__tests__/turn-processor.observability.test.ts
    - backend/src/engine/__tests__/fixtures/expected-seams.ts
    - backend/src/engine/__tests__/fixtures/mock-llm.ts
decisions:
  - SCENE_PLAN_ENABLED defaults true and only exact string false isolates the legacy Phase 69 processor path.
  - Normal player turns bypass WorldBrainSceneDirection and HiddenAdjudicationPlan on the ScenePlan path.
  - Final visible narration must pass runVisibleNarrationWithPacketGuard before assistant persistence and narrative SSE.
  - ScenePlan observability logs compact counts, IDs, and durations only.
metrics:
  completed_at: 2026-04-25T17:16:23Z
  duration_minutes: 30
  tasks_completed: 2
requirements: [P70-R2, P70-R3, P70-R4, P70-R5, P70-R6, P70-R7]
---

# Phase 70 Plan 06: Turn Processor ScenePlan Migration Summary

Default player turns now run through SceneFrame, Oracle, validated ScenePlan execution, NarratorPacket, and guarded final visible narration.

## Accomplishments

- Migrated `processTurn` to the ScenePlan-owned path by default, with the legacy Phase 69 path isolated behind `SCENE_PLAN_ENABLED=false`.
- Preserved ordering: deterministic state first, `buildSceneFrame` before `callOracle`, `callOracle` before `runScenePlanner`, validation before execution, and packet guard before assistant persistence or `narrative` output.
- Bypassed normal player-turn `runWorldBrainSceneDirection`, `runHiddenAdjudicationPlan`, `executeAdjudicationPlan`, `assembleJudgeAdjudicationPrompt`, and target/movement classifiers on the ScenePlan path.
- Added compact observability seams: `scene.frame`, `judge.scene-plan`, `scene.plan.validation`, `scene.plan.execution`, `scene.packet`, and `visible-narration.packet-guard`.
- Kept opening scene behavior on the existing Phase 68 world-brain path.

## Task Commits

| Task | Commit | Type | Summary |
|------|--------|------|---------|
| 1 RED | 2f93b3f | test | Added failing ScenePlan processor migration tests. |
| 1 GREEN | 5751d85 | feat | Migrated `processTurn` to default ScenePlan path and added rollback docs. |
| 2 RED | bf65674 | test | Added failing ordering, guard failure, and observability tests. |
| 2 GREEN | 76f4641 | feat | Hardened ordering tests and compact ScenePlan observability fixture. |

## GitNexus Impact

- `processTurn`: GitNexus could not resolve the symbol or file as an indexed target; source was confirmed manually in `backend/src/engine/turn-processor.ts`. No HIGH/CRITICAL warning was returned.
- `detectMovement`: LOW risk, 0 impacted symbols/processes.
- `resolveActionTargetContext`: LOW risk, 3 impacted references/processes reported; no HIGH/CRITICAL risk.
- Pre-commit `gitnexus_detect_changes(scope: "staged")` was LOW for each staged task commit.
- Final `gitnexus_detect_changes(scope: "all")` reported only the pre-existing dirty `CLAUDE.md` drift, which was not staged or committed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected over-broad guard ordering assertion**
- **Found during:** Task 1 GREEN verification.
- **Issue:** The initial test treated all `appendChatMessages` calls as unsafe before packet guard, but user-message persistence intentionally happens before ScenePlan validation.
- **Fix:** Restricted the ordering assertion to assistant-message persistence and `narrative` output after `runVisibleNarrationWithPacketGuard`.
- **Files modified:** `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts`, `backend/src/engine/__tests__/turn-processor.test.ts`
- **Commit:** `5751d85`, `76f4641`

**2. [Rule 3 - Blocking] Placed runtime order tests in the existing processor test harness**
- **Found during:** Task 2 implementation.
- **Issue:** The source-level `turn-processor.scene-plan.test.ts` does not own the hoisted runtime collaborator mocks needed for precise invocation order.
- **Fix:** Kept source-level ordering proofs in `turn-processor.scene-plan.test.ts` and added runtime invocation tests to `turn-processor.test.ts`.
- **Files modified:** `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts`, `backend/src/engine/__tests__/turn-processor.test.ts`
- **Commit:** `bf65674`, `76f4641`

## Known Stubs

None. The `SECRET_KEY_PLACEHOLDER` strings are intentional test fixtures for the observability redaction guard, not user-facing stubs.

## Threat Flags

None. This plan did not add endpoints, auth paths, file access patterns, or schema changes. The observability threat mitigation was applied with compact count/ID/duration payloads and no raw prompts, hidden rationale, forbidden actor names, or forbidden fact markers.

## Verification

- `cd backend && npx vitest run src/engine/__tests__/turn-processor.scene-plan.test.ts` failed as expected in RED before implementation.
- `cd backend && npx vitest run src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.observability.test.ts` failed as expected in RED on missing ScenePlan observability seams.
- `npm --prefix backend run typecheck` passed.
- `cd backend && npx vitest run src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.observability.test.ts` passed: 3 files, 67 tests.
- Acceptance grep for ScenePlan observability seams passed.
- Acceptance grep for ordering, rollback flag, legacy path, cleanup criteria, narrative SSE, and no-done guard wording passed.

## TDD Gate Compliance

- RED gate commits exist: `2f93b3f`, `bf65674`.
- GREEN gate commits exist after RED: `5751d85`, `76f4641`.
- No separate refactor commit was needed.

## Metadata Handling

STATE.md and ROADMAP.md were not updated in this isolated worktree because the GSD execute workflow skips centralized state updates in parallel worktree mode. The orchestrator handles those after merge. `CLAUDE.md` remained dirty and unstaged as requested.

## Self-Check: PASSED

- Verified summary, migration plan, processor, and test files exist.
- Verified task commits exist: `2f93b3f`, `5751d85`, `bf65674`, `76f4641`.
- Verified only the pre-existing dirty `CLAUDE.md` and the new summary file remained before metadata commit.
