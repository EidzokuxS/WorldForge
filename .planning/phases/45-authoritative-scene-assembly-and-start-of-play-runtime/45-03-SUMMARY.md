---
phase: 45-authoritative-scene-assembly-and-start-of-play-runtime
plan: 03
subsystem: ui
tags: [react, nextjs, sse, gameplay-ui]
requires:
  - phase: 45-02
    provides: backend `/api/chat/opening` SSE generation plus `scene-settling` and `finalizing_turn` runtime states
provides:
  - neutral `/game` opening surface that never renders premise as opening narration
  - active frontend opening-scene request when no assistant narration exists yet
  - distinct UI handling for hidden scene-settling versus post-narration finalization
  - frontend regression coverage for the Phase 45 opening contract
affects: [phase-45-verification, phase-50-gameplay-text-presentation]
tech-stack:
  added: []
  patterns: [campaign bootstrap opening request, SSE scene-settling callback, neutral runtime-safe opening placeholder]
key-files:
  created: []
  modified:
    - frontend/lib/api.ts
    - frontend/components/game/narrative-log.tsx
    - frontend/components/game/__tests__/narrative-log.test.tsx
    - frontend/app/game/page.tsx
    - frontend/app/game/__tests__/page.test.tsx
key-decisions:
  - "When chat history has no assistant narration, `/game` must call `/api/chat/opening` instead of waiting on premise fallback."
  - "Frontend progress keeps hidden opening/scene settlement separate from `finalizing_turn` so quality-first backend work does not look frozen."
patterns-established:
  - "Opening scenes come only from backend-authored runtime narration, never from premise text rendered as UI fallback."
  - "SSE `scene-settling` is a first-class frontend progress signal alongside visible streaming and rollback-critical finalization."
requirements-completed: [SCEN-01]
duration: 8 min
completed: 2026-04-12
---

# Phase 45 Plan 03: Opening Contract Frontend Alignment Summary

**`/game` now requests backend-authored opening narration, keeps the empty surface neutral, and exposes scene-settling progress before narration appears.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-12T08:00:40Z
- **Completed:** 2026-04-12T08:08:46Z
- **Tasks:** 1
- **Files modified:** 5

## Accomplishments
- Replaced the old premise-based empty-state narration with neutral runtime-safe opening copy in `NarrativeLog`.
- Added frontend wiring for `/api/chat/opening` so campaigns with zero assistant messages actively request the backend opening scene.
- Split player-visible progress into opening/scene-settling versus post-narration finalization and locked the behavior with page and component regressions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove premise-as-opening behavior and align `/game` presentation with single-pass narration** - `373a0cf` (feat)

## Files Created/Modified
- `frontend/lib/api.ts` - Added `chatOpening()` and surfaced SSE `scene-settling` callbacks to the page layer.
- `frontend/components/game/narrative-log.tsx` - Replaced premise fallback with neutral opening copy and explicit opening/scene-settling status text.
- `frontend/components/game/__tests__/narrative-log.test.tsx` - Covered neutral opening copy and explicit opening-progress messaging.
- `frontend/app/game/page.tsx` - Requests backend opening narration on bootstrap when assistant history is empty and tracks opening versus settling versus finalizing states.
- `frontend/app/game/__tests__/page.test.tsx` - Covers no-premise opening behavior, active opening request, and distinct opening-progress handling.

## Decisions Made

- The first visible scene on `/game` must always come from backend narration, even during bootstrap, so the frontend now treats assistant-history absence as a transport action rather than a display fallback.
- Hidden settlement progress is shown before any narration appears, but `finalizing_turn` remains a separate later state tied to rollback-critical completion.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Opening generation initially blocked the end of bootstrap, which would have hidden the new progress state behind the loading screen. The request was moved to fire-and-forget after history/world load so the user can see intentional opening progress.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `/game` now honors the backend Phase 45 runtime contract for opening narration and settlement progress.
- Later presentation work can build on these states without reintroducing premise fallback or conflating hidden settlement with finalization.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/45-authoritative-scene-assembly-and-start-of-play-runtime/45-03-SUMMARY.md`.
- Verified task commit `373a0cf` exists in git history.
