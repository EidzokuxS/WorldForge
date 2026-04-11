---
phase: 43-travel-and-location-state-contract-resolution
plan: 06
subsystem: gameplay
tags: [frontend, backend, react, vitest, travel, location-state]
requires:
  - phase: 43-travel-and-location-state-contract-resolution
    provides: authoritative connectedPaths travel UI, weighted travel transport, and normalized scaffold adjacency
provides:
  - `/game` travel options that exclude the player's current location for both authoritative and legacy payload shapes
  - backend player transport that treats current-location travel as a deterministic no-op before normal travel completion handling
  - separated regressions for fresh scaffold generation versus legacy/manual self-travel handling
affects: [phase-43-closeout, gameplay travel ui, turn transport, worldgen adjacency]
tech-stack:
  added: []
  patterns:
    - gameplay travel affordances are filtered locally before the location panel renders, even when compatibility data is stale
    - player transport short-circuits self-travel before Oracle and Storyteller work, avoiding fake arrival semantics
    - fresh scaffold persistence never writes self-loop edges or self-target compatibility adjacency
key-files:
  created: []
  modified:
    - frontend/app/game/page.tsx
    - frontend/app/game/__tests__/page.test.tsx
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/worldgen/scaffold-saver.ts
    - backend/src/worldgen/__tests__/scaffold-saver.test.ts
key-decisions:
  - "The `/game` page filters self-target travel options in both connectedPaths and connectedTo branches so stale compatibility data cannot reintroduce the smoke gap."
  - "Current-location movement is resolved as a deterministic transport-layer no-op with a fixed acknowledgment, instead of flowing through location_change, Oracle, or Storyteller arrival behavior."
  - "Fresh scaffold adjacency suppresses self-loops at write time so fresh-runtime regressions stay distinguishable from legacy/manual compatibility paths."
patterns-established:
  - "Frontend regressions split authoritative connectedPaths filtering from legacy connectedTo filtering."
  - "Backend regressions split manual/legacy self-travel no-op handling from fresh scaffold self-loop prevention."
requirements-completed: [GSEM-03]
duration: 4 min
completed: 2026-04-11
---

# Phase 43 Plan 06: Travel and Location-State Contract Resolution Summary

**Current-location travel now dies at the right seams: `/game` hides self-travel, backend transport resolves self-target movement as a no-op, and fresh scaffold tests guard against self-loop defaults**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-11T17:25:05Z
- **Completed:** 2026-04-11T17:29:07Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Closed the `/game` smoke gap by filtering the current location out of both authoritative `connectedPaths` and legacy `connectedTo` travel affordances.
- Hardened player transport so self-target travel no longer emits `location_change`, advances travel time, or routes through normal travel completion behavior.
- Added separate guardrails for legacy/manual no-op travel handling versus fresh scaffold self-loop prevention, making future regressions easier to localize.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: lock `/game` self-travel regressions** - `fae68e8` (test)
2. **Task 1 GREEN: filter current-location travel affordances on `/game`** - `3d6c119` (feat)
3. **Task 2 RED: lock backend no-op and fresh scaffold self-loop guardrails** - `087c8df` (test)
4. **Task 2 GREEN: short-circuit self-travel and suppress fresh self-loops** - `9d6950f` (feat)

_Note: This plan used TDD, so each task shipped as test then implementation commits._

## Files Created/Modified

- `frontend/app/game/page.tsx` - Filters self-target travel options before the location panel renders.
- `frontend/app/game/__tests__/page.test.tsx` - Separates authoritative and legacy self-travel regressions while preserving destination metadata coverage.
- `backend/src/engine/turn-processor.ts` - Short-circuits current-location travel before normal movement resolution and arrival semantics.
- `backend/src/engine/__tests__/turn-processor.test.ts` - Verifies self-travel stays a deterministic no-op with no `location_change` or tick advance.
- `backend/src/worldgen/scaffold-saver.ts` - Prevents fresh scaffold persistence from writing self-loop edges or self-target compatibility adjacency.
- `backend/src/worldgen/__tests__/scaffold-saver.test.ts` - Verifies fresh scaffold defaults stay distinct from legacy/manual self-travel paths.

## Decisions Made

- `/game` now treats self-target suppression as view-model hygiene, not as a responsibility of the location panel.
- Transport-layer no-op handling stops before Oracle and Storyteller work so stale UI state cannot masquerade as real travel completion.
- Fresh scaffold data rejects self-loops at persistence time to keep runtime failures separable by origin.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Frontend verification still emits the repo-wide non-blocking Vitest `environmentMatchGlobs` deprecation warning. The targeted suite passed without behavior impact, so no change was made in this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 43 now has explicit coverage for the last live smoke gap around current-location travel handling.
- Travel regressions are now split cleanly between fresh scaffold generation and legacy/manual transport compatibility, which reduces ambiguity for future debugging.

## Known Stubs

- `frontend/app/game/page.tsx:370` contains an existing comment using the word `placeholder` for retry cleanup. It is non-user-facing and unrelated to this plan's behavior.
- `frontend/app/game/page.tsx:410` contains an existing comment using the word `placeholder` for the optimistic assistant slot. It is non-user-facing and unrelated to this plan's behavior.

## Self-Check: PASSED

- Summary file present: `.planning/phases/43-travel-and-location-state-contract-resolution/43-06-SUMMARY.md`
- Task commit present: `fae68e8`
- Task commit present: `3d6c119`
- Task commit present: `087c8df`
- Task commit present: `9d6950f`
