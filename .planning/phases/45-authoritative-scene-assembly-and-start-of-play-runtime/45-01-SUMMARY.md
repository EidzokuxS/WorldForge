---
phase: 45-authoritative-scene-assembly-and-start-of-play-runtime
plan: 01
subsystem: testing
tags: [vitest, scene-assembly, gameplay-runtime, nextjs, hono]
requires:
  - phase: 39-honest-turn-boundary-retry-undo
    provides: honest turn finalization boundary used by the new sequencing regressions
  - phase: 42-targeted-oracle-start-condition-runtime-effects
    provides: authoritative opening-state runtime inputs referenced by the new prompt regression
  - phase: 43-travel-location-state-contract-resolution
    provides: location-local recent happenings and movement contracts referenced by the new scene regressions
provides:
  - backend red regressions for deferred visible narration before authoritative scene settlement
  - backend red regressions for duplicate visible narration suppression and player-perceivable scene context
  - frontend red regressions preventing premise text from masquerading as opening narration
affects: [45-02, 45-03, SCEN-01, backend-runtime, frontend-game-ui]
tech-stack:
  added: []
  patterns: [red-first phase execution, backend-runtime-contract-regressions, frontend-opening-surface-regressions]
key-files:
  created: [.planning/phases/45-authoritative-scene-assembly-and-start-of-play-runtime/45-01-SUMMARY.md]
  modified:
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/engine/__tests__/prompt-assembler.test.ts
    - frontend/components/game/__tests__/narrative-log.test.tsx
    - frontend/app/game/__tests__/page.test.tsx
key-decisions:
  - "Phase 45 starts from runtime-sequencing regressions, not prompt-only wording assertions."
  - "Opening-surface regressions are pinned at both NarrativeLog and /game so premise fallback cannot survive in one layer."
patterns-established:
  - "Scene-authority regressions fail on current visible output timing, duplicate assistant persistence, and empty-state premise fallback."
  - "Backend and frontend red suites are kept targeted so later plans can verify implementation against the exact SCEN-01 seams."
requirements-completed: [SCEN-01]
duration: 1 min
completed: 2026-04-12
---

# Phase 45 Plan 01: Authoritative Scene Assembly & Start-of-Play Runtime Summary

**Red regressions for deferred scene narration, duplicate-block suppression, player-perceivable final context, and no-premise opening surfaces**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-12T07:36:39Z
- **Completed:** 2026-04-12T07:38:26Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added backend red coverage that fails while visible `narrative` chunks still stream before authoritative scene settlement finishes.
- Added backend red coverage that fails while repeated narration blocks persist verbatim and final narration context lacks an explicit player-perceivable contract.
- Added frontend red coverage that fails while `NarrativeLog` and `/game` still surface `premise` as the opening narration when no assistant message exists.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add failing backend regressions for authoritative scene sequencing and duplicate suppression** - `05623cd` (`test`)
2. **Task 2: Add failing frontend regressions for the no-premise opening surface** - `0e236a0` (`test`)

## Files Created/Modified

- `backend/src/engine/__tests__/turn-processor.test.ts` - red regressions for deferred visible narration and duplicate-block persistence
- `backend/src/engine/__tests__/prompt-assembler.test.ts` - red regression for opening-state plus player-perceivable final narration context
- `frontend/components/game/__tests__/narrative-log.test.tsx` - red regression against premise fallback in the empty narrative log
- `frontend/app/game/__tests__/page.test.tsx` - red regression against premise fallback on the live `/game` initialization path

## Decisions Made

- Locked the backend regression at the event-stream level so a later fix must change sequencing, not just prompt wording.
- Used the same neutral placeholder contract at component and page scope so `/game` cannot pass by changing only one layer.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Targeted backend verification still emits an existing non-blocking episodic-memory/vector warning inside `prompt-assembler.test.ts`; the new regression failure is the missing `player-perceivable` contract, not that warning.
- Frontend and backend targeted suites both still emit the existing Vitest `environmentMatchGlobs` deprecation warning.
- `gsd-tools state record-metric` reported `Performance Metrics section not found in STATE.md`; plan position and roadmap progress still updated successfully, but the automated metric entry was skipped.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for `45-02-PLAN.md`; the repo now has explicit red coverage for the Phase 45 runtime seams instead of prose-only complaints.
- `SCEN-01` remains pending overall until later Phase 45 plans make these regressions pass and wire opening-scene generation/runtime scene assembly end-to-end.

## Self-Check: PASSED

- Found `.planning/phases/45-authoritative-scene-assembly-and-start-of-play-runtime/45-01-SUMMARY.md`
- Found commit `05623cd`
- Found commit `0e236a0`
