---
phase: 70-reactive-scene-resolution-and-canonical-event-flow
plan: 02
subsystem: backend-engine
tags: [scene-frame, scene-presence, oracle-context, combat-envelope, vitest, tdd]
requires:
  - phase: 70-reactive-scene-resolution-and-canonical-event-flow
    provides: "70-01 backend-local SceneFrame contract and ScenePlan scaffolding"
provides:
  - "Deterministic buildSceneFrame projection from campaign DB rows, scene presence, recent events, movement state, and target candidates"
  - "SceneFrame oracleContext and nullable combatEnvelope fields without Oracle or LLM calls"
  - "Visible actor and player hint helper projections for clear/hint/none awareness assertions"
affects: [phase-70, backend-engine, scene-planner, oracle, narrator-packet]
tech-stack:
  added: []
  patterns:
    - "DB-derived SceneFrame construction reuses resolveScenePresence and runtimeToolInputSchemas"
    - "Display labels stay contextual while stable actorId/locationId/itemId fields carry planner references"
    - "Hint/none awareness names stay out of player-facing helper projections"
key-files:
  created: []
  modified:
    - backend/src/engine/scene-frame.ts
    - backend/src/engine/__tests__/scene-frame.test.ts
key-decisions:
  - "Kept buildSceneFrame backward-compatible with 70-01 caller-provided frame fixtures while adding DB-backed construction."
  - "Kept resolveScenePresence unchanged because its upstream blast radius is HIGH; SceneFrame now consumes it instead."
  - "Derived allowedTools from runtimeToolInputSchemas and a local executeToolCall-supported allow-list."
patterns-established:
  - "SceneFrame builder reads campaign state deterministically and performs no LLM call, Oracle call, or persistence mutation."
  - "SceneFrame target candidates carry stable IDs; hint actors use hint text as player-facing label."
requirements-completed: [P70-R1, P70-R5, P70-R7]
duration: 21 min
completed: 2026-04-25
---

# Phase 70 Plan 02: Deterministic SceneFrame Builder Summary

**DB-backed SceneFrame builder with presence-filtered roster buckets, stable action references, Oracle input context, and hidden-name visibility tests.**

## Performance

- **Duration:** 21 min
- **Started:** 2026-04-25T14:56:38Z
- **Completed:** 2026-04-25T15:17:01Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced the 70-01 roster-only `buildSceneFrame` implementation with a deterministic DB-backed builder.
- Added active/support/background roster classification from `resolveScenePresence`, with stable `actorId` references and awareness knowledge basis.
- Added bounded `recentEvents`, `targetCandidates`, `movementCandidates`, `oracleContext`, nullable `combatEnvelope`, and runtime-tool-derived `allowedTools`.
- Added tests proving clear/hint/none awareness behavior, hidden-name filtering from visible helper labels, movement/target candidates, and bounded planner inputs.

## Task Commits

1. **Task 1 RED:** `2efc702` test(70-02): add failing SceneFrame builder tests
2. **Task 1 GREEN:** `24226ff` feat(70-02): implement deterministic SceneFrame builder
3. **Task 2 RED:** `3be8931` test(70-02): add failing SceneFrame visibility tests
4. **Task 2 GREEN:** `b1a6fb4` feat(70-02): expose SceneFrame visibility helpers

## Files Created/Modified

- `backend/src/engine/scene-frame.ts` - DB-backed SceneFrame construction, deterministic roster/candidate/recent-event projection, `oracleContext`, `combatEnvelope`, and visibility helpers.
- `backend/src/engine/__tests__/scene-frame.test.ts` - TDD coverage for DB-derived roster buckets, stable IDs, movement/target candidates, allowed tools, and hidden-name filtering.

## Decisions Made

- `buildSceneFrame` still accepts the 70-01 caller-provided frame shape so existing contract tests and future unit fixtures can build frames without DB mocks.
- `resolveScenePresence` was not modified after impact analysis returned HIGH risk; the plan only consumes its output.
- `oracleContext` is deterministic from SceneFrame target candidates for this plan. It does not call the existing target classifier or Oracle.

## Impact Analysis

- `buildSceneFrame` upstream impact: LOW, 0 direct callers/processes before edit.
- `assembleAuthoritativeScene` upstream impact: LOW, 0 direct callers/processes in the GitNexus index.
- `resolveScenePresence` upstream impact: HIGH, 4 direct callers, 3 affected process groups (`assembleAuthoritativeScene`, `tickNpcAgentInternal`, `assemblePrompt`). This symbol was not changed.
- `gitnexus_detect_changes(scope: staged)` before each task commit reported low risk and expected file scope.
- Final `gitnexus_detect_changes(scope: all)` reported only the pre-existing dirty `CLAUDE.md` GitNexus/context drift, with low risk and no affected execution flows.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. Stub scan found no `TODO`, `FIXME`, placeholder text, or hardcoded empty UI/data-flow values in the modified files.

## Threat Flags

None. The plan added no network endpoint, auth path, file access pattern, schema change, or new trust boundary beyond the planned DB-state-to-SceneFrame projection.

## Issues Encountered

- `CLAUDE.md` was dirty before 70-02 execution and remained unstaged/uncommitted as requested.
- GitNexus index now trails the new task commits; no re-analysis was run because doing so can rewrite GitNexus context files, including the already-dirty `CLAUDE.md`.
- `requirements mark-complete P70-R1 P70-R5 P70-R7` reported those IDs were not present in `REQUIREMENTS.md`, so no requirements file change was produced.

## Verification

- `cd backend && npx vitest run src/engine/__tests__/scene-frame.test.ts` - RED failed, then GREEN passed 3 tests for Task 1.
- `npm --prefix backend run typecheck` - passed after Task 1 and final verification.
- `cd backend && npx vitest run src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/scene-presence.test.ts` - passed 2 files, 8 tests.
- Acceptance grep checks passed for presence helper usage, `runtimeToolInputSchemas`-derived allowed tools, required SceneFrame test terms, and hidden/visible helper assertions.

## TDD Gate Compliance

- RED commits exist: `2efc702`, `3be8931`.
- GREEN commits exist after RED: `24226ff`, `b1a6fb4`.
- No refactor commit was needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `70-03`: the judge planner can consume a real deterministic `SceneFrame` with stable actor/location/item references, bounded candidates, Oracle input context, and no player-facing hidden identity leakage in helper projections.

## Self-Check: PASSED

- Verified `70-02-SUMMARY.md`, `backend/src/engine/scene-frame.ts`, and `backend/src/engine/__tests__/scene-frame.test.ts` exist.
- Verified task commits exist: `2efc702`, `24226ff`, `3be8931`, `b1a6fb4`.

---
*Phase: 70-reactive-scene-resolution-and-canonical-event-flow*
*Completed: 2026-04-25*
