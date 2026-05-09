---
phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
plan: 06
subsystem: runtime-prompt-presence
tags: [scene-frame, prompt-assembler, dense-locations, scene-presence, tdd]

requires:
  - phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
    plan: 04
    provides: Persisted macro and persistent sublocation rows plus NPC broad/current-scene ids
  - phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
    plan: 05
    provides: Player broad/current-scene ids and currentScene route proof
provides:
  - SceneFrame dense sublocation roster proof using stored broad and scene scope
  - Prompt assembler scoped scene/equipment context using encounter presence
  - Regression coverage for same-scene inclusion, sibling-sublocation exclusion, and broad-only compatibility
affects:
  - phase-75-plan-07
  - phase-76-location-presence-followups

tech-stack:
  added: []
  patterns:
    - Runtime consumers reuse `resolveScenePresence` snapshots instead of duplicating broad-only filters
    - Scene prompt equipment uses clear present same-scene actors with a legacy fallback when no encounter snapshot exists

key-files:
  created:
    - .planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-06-SUMMARY.md
  modified:
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/__tests__/scene-frame.test.ts
    - backend/src/engine/__tests__/prompt-assembler.test.ts

key-decisions:
  - "SceneFrame production code stayed unchanged because focused tests proved it already uses `resolveScenePresence` for stored broad/current-scene ids."
  - "Prompt scene equipment is sourced from the existing encounter presence snapshot and restricted to clear present actors, so sibling and hidden same-macro NPCs do not leak through `[SCENE]`."
  - "Broad-only prompt compatibility remains through the existing currentLocationId query fallback when no encounter snapshot is available."

patterns-established:
  - "Dense runtime prompt tests should model player/NPC broad id as the parent macro and currentSceneLocationId as the concrete sublocation."
  - "Prompt assembler unit DB mocks now apply simple equality filters so scoped-location regressions exercise real Drizzle-style query behavior."

requirements-completed: [P75-R5, P75-R7]

duration: 15 min
completed: 2026-04-30
---

# Phase 75 Plan 06: Runtime Presence Consumer Summary

**SceneFrame and prompt assembly now prove dense sublocation scope reaches runtime rosters and model-facing scene context.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-30T13:47:00Z
- **Completed:** 2026-04-30T14:01:47Z
- **Tasks:** 2
- **Files touched:** 4

## Accomplishments

- Added SceneFrame proof tests for dense sublocation rosters: same-scene clear NPCs are active, sibling sublocation NPCs stay out of active/support, and broad-only legacy rows still fall back correctly.
- Added prompt assembler RED coverage for the exact Phase 75 bug: NPC broad id equals parent macro, NPC current scene id equals the current sublocation, and same-scene equipment must appear without sibling equipment leakage.
- Updated `buildSceneSection` to reuse `buildEncounterPromptContext` presence data for NPC equipment and keep fallback broad-location querying for compatibility.
- Refreshed GitNexus after code commits; index is current at `fa70ac6`.

## Task Commits

1. **Task 1 proof:** `346bd02` - `test(75-06): lock SceneFrame scoped rosters`
2. **Task 2 RED:** `8bd2601` - `test(75-06): add failing prompt scope test`
3. **Task 2 GREEN:** `fa70ac6` - `feat(75-06): scope prompt scene equipment`

## Files Created/Modified

- `backend/src/engine/__tests__/scene-frame.test.ts` - Dense and legacy SceneFrame roster proof.
- `backend/src/engine/__tests__/prompt-assembler.test.ts` - Scoped prompt/equipment regression plus equality-aware test DB filtering.
- `backend/src/engine/prompt-assembler.ts` - Scene section NPC equipment now uses clear present same-scene actors from the encounter presence snapshot.
- `.planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-06-SUMMARY.md` - Plan execution record.

## Verification

- Task 1: `npm --prefix backend run test -- src/engine/__tests__/scene-frame.test.ts` - PASS, 7 tests. New tests passed immediately because existing SceneFrame production code already consumed `resolveScenePresence`.
- Task 1: `npm --prefix backend run typecheck` - PASS.
- Task 2 RED: `npm --prefix backend run test -- src/engine/__tests__/prompt-assembler.test.ts` - FAILED as expected on missing `Concourse Warden: Signal baton` in `[SCENE]`.
- Task 2 GREEN: `npm --prefix backend run test -- src/engine/__tests__/prompt-assembler.test.ts` - PASS, 36 tests.
- Final plan verification: `npm --prefix backend run test -- src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/prompt-assembler.test.ts` - PASS, 43 tests.
- Final backend typecheck: `npm --prefix backend run typecheck` - PASS.
- `npx gitnexus analyze` - PASS, index refreshed to `fa70ac6` with 2,669 nodes, 7,499 edges, 198 clusters, and 215 flows.

## GitNexus Scope

- Pre-edit impacts were run for `buildSceneFrame`, `buildRoster`, `buildSceneSection`, `buildEncounterPromptContext`, `buildEncounterScopeSection`, `buildNpcStatesSection`, and `assemblePrompt`.
- All impact checks returned LOW risk; no HIGH or CRITICAL risk warnings were returned.
- Staged detect-change for the SceneFrame proof commit reported LOW risk and no indexed production symbols.
- Staged detect-change for the prompt assembler GREEN commit reported MEDIUM risk, with changed symbols `buildSceneSection`, `buildEncounterPromptContext`, and `assemblePrompt`; affected processes matched the planned prompt assembly scope and were covered by the final focused test bundle.

## Decisions Made

- SceneFrame stayed production-stable; adding code would have duplicated the existing resolver behavior.
- `buildSceneSection` now prefers encounter snapshot rows for NPC equipment because the snapshot already encodes broad/scene presence and clear/hint/none awareness.
- Hidden or hint-only same-scene actors remain out of `[SCENE]` equipment lines; their bounded presence remains represented through encounter/NPC-state rules instead of scene item facts.

## Deviations from Plan

None - plan executed as written. Task 1 production code was intentionally unchanged because the plan allowed proof-only tests when current code already passed.

## Issues Encountered

- Task 1 RED tests passed immediately. Investigation confirmed SceneFrame already passed stored broad/current-scene ids into `resolveScenePresence`; tests now lock the behavior.
- `npx gitnexus analyze` emitted known `MaxListenersExceededWarning` warnings, then completed successfully.

## Known Stubs

None - stub scan found no unresolved `TODO`, `FIXME`, placeholder, coming-soon, or UI-rendered empty-data stubs in the created/modified plan files. The pre-existing "not available" phrase in `prompt-assembler.ts` is an explanatory API comment, not an unwired stub.

## Threat Flags

None - no unplanned network endpoints, auth paths, file access patterns, schema changes, or new trust boundaries were introduced. Planned prompt-scope information disclosure risk is mitigated by sibling-sublocation exclusion tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 75-07 can now close the user-visible People Here/frontend side using route-level currentScene proof from 75-05 and runtime/prompt consumer proof from 75-06.

## Self-Check: PASSED

- Summary and all key modified files exist.
- Task commits `346bd02`, `8bd2601`, and `fa70ac6` exist in git history.
- Final focused test bundle, backend typecheck, GitNexus detect-change gates, and GitNexus re-index completed.
- Stub scan found no unresolved stub markers in modified files.

---
*Phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos*
*Completed: 2026-04-30*
