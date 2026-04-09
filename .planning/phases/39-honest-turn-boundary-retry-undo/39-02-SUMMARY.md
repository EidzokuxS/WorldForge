---
phase: 39-honest-turn-boundary-retry-undo
plan: 02
subsystem: ui
tags: [nextjs, react, vitest, sse, gameplay]
requires:
  - phase: 39-01
    provides: backend finalizing_turn event and authoritative rollback-safe turn boundary
provides:
  - explicit frontend turn phases for idle, streaming, and finalizing gameplay states
  - buffered quick actions and retry/undo gating that unlock only after authoritative done
  - failed retry recovery that returns /game to an honest pre-turn boundary
affects: [phase-40-live-reflection, gameplay-runtime, frontend-ui-contract]
tech-stack:
  added: []
  patterns:
    - explicit turnPhase state drives gameplay readiness instead of a single streaming boolean
    - SSE quick actions are buffered until the authoritative done event commits the turn
    - retry failure rolls back locally to the last committed boundary, then refreshes canonical backend state
key-files:
  created: []
  modified:
    - frontend/lib/api.ts
    - frontend/lib/__tests__/api.test.ts
    - frontend/app/game/page.tsx
    - frontend/app/game/__tests__/page.test.tsx
    - frontend/components/game/narrative-log.tsx
    - frontend/components/game/action-bar.tsx
key-decisions:
  - "The frontend now models gameplay readiness as idle, streaming, or finalizing so narration completion no longer implies turn completion."
  - "Quick actions stay buffered until authoritative done, which keeps retry/undo and follow-up actions aligned with the backend rollback boundary."
  - "Failed retry restores the visible pre-turn boundary immediately from committed message history, then refreshes history and world data from the backend."
patterns-established:
  - "Gameplay UI should consume explicit transport lifecycle signals and avoid inferring completion from message shape alone."
  - "Player-facing copy must distinguish narration from world finalization without surfacing transport jargon."
requirements-completed: [SIMF-02, RINT-02]
duration: 6 min
completed: 2026-04-09
---

# Phase 39 Plan 02: Honest Turn Boundary Retry Undo Summary

**Honest `/game` turn phases with buffered quick actions, finalization copy, and rollback-safe retry recovery**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-09T06:38:37+03:00
- **Completed:** 2026-04-09T06:44:55.4929396+03:00
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added frontend SSE support for the backend `finalizing_turn` event with an optional handler that does not break existing callers.
- Replaced `/game` readiness guesses with explicit turn phases so streaming and finalizing use different player-facing copy and controls stay locked until authoritative completion.
- Buffered quick actions until `done` and made failed retry return the UI to an honest pre-turn boundary before refreshing backend history and world state.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock the frontend SSE and readiness contract in tests** - `f862e21` (test)
2. **Task 2: Implement explicit turn-readiness state in `/game` and gameplay components** - `53fb5b6` (feat)

## Files Created/Modified
- `frontend/lib/api.ts` - adds optional `onFinalizing` support and flushes trailing SSE events safely.
- `frontend/lib/__tests__/api.test.ts` - proves the parser dispatches `finalizing_turn` and stays safe when the callback is omitted.
- `frontend/app/game/page.tsx` - introduces `turnPhase`, buffers quick actions, gates retry/undo on authoritative completion, and restores honest retry failure state.
- `frontend/app/game/__tests__/page.test.tsx` - verifies finalization gating, quick-action timing, and failed retry recovery.
- `frontend/components/game/narrative-log.tsx` - renders distinct streaming versus finalizing player-facing status copy.
- `frontend/components/game/action-bar.tsx` - communicates finalizing state while keeping the input surface blocked.

## Decisions Made
- Used explicit turn phases instead of stretching `isStreaming` to represent both narration and world finalization.
- Kept quick actions hidden until authoritative `done` rather than showing disabled follow-ups during finalization.
- Restored retry failure from the latest committed message boundary immediately to keep the UI honest even before the backend refresh resolves.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Flush trailing SSE events at end-of-stream**
- **Found during:** Task 2 (Implement explicit turn-readiness state in `/game` and gameplay components)
- **Issue:** The parser could drop the last SSE frame if the stream ended without one more blank-line dispatch cycle, which made the new finalization/done tests brittle and could miss a terminal event.
- **Fix:** Added shared event dispatch logic and a final buffer flush so the parser handles trailing `finalizing_turn` and `done` frames safely.
- **Files modified:** `frontend/lib/api.ts`
- **Verification:** `npm --prefix frontend exec vitest run lib/__tests__/api.test.ts app/game/__tests__/page.test.tsx`
- **Committed in:** `53fb5b6`

**2. [Rule 1 - Bug] Stabilize retry failure rollback against React batching**
- **Found during:** Task 2 (Implement explicit turn-readiness state in `/game` and gameplay components)
- **Issue:** Retry failure cleanup could race optimistic UI updates, leaving stale last-turn content visible even though the retry had been abandoned.
- **Fix:** Rolled retry failure back from the latest committed message snapshot before refreshing backend history/world data, so the screen returns to the pre-turn boundary deterministically.
- **Files modified:** `frontend/app/game/page.tsx`
- **Verification:** `npm --prefix frontend exec vitest run lib/__tests__/api.test.ts app/game/__tests__/page.test.tsx`
- **Committed in:** `53fb5b6`

---

**Total deviations:** 2 auto-fixed (2 bug fixes)
**Impact on plan:** Both fixes were required to make the planned frontend contract reliable. No scope creep beyond the targeted `/game` boundary work.

## Issues Encountered

- Retry failure recovery needed one extra stabilization step because React state batching could reorder optimistic cleanup relative to the authoritative refresh. The final implementation now restores the honest boundary immediately and still refreshes backend state.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 39 frontend and backend now agree on when a turn is actually complete, so later gameplay phases can consume a truthful completion signal instead of inferred UI state.
- Phase 39 is complete and ready for the next milestone step.

## Self-Check: PASSED

- Found `.planning/phases/39-honest-turn-boundary-retry-undo/39-02-SUMMARY.md`
- Found commits `f862e21` and `53fb5b6`

---
*Phase: 39-honest-turn-boundary-retry-undo*
*Completed: 2026-04-09*
