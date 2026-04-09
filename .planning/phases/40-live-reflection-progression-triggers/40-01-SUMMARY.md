---
phase: 40-live-reflection-progression-triggers
plan: 01
subsystem: backend
tags: [reflection, simulation, sqlite, vitest, npc]
requires:
  - phase: 39-honest-turn-boundary-retry-undo
    provides: authoritative post-turn finalization that keeps reflection work inside the honest turn boundary
provides:
  - shared campaign-scoped reflection-budget accumulation helper
  - authoritative event-write wiring for log_event, present-NPC dialogue, and off-screen NPC updates
  - regression coverage for participant resolution and every live writer seam in scope
affects: [reflection-agent, npc-simulation, post-turn-finalization]
tech-stack:
  added: []
  patterns:
    - accumulate reflection budget immediately after committed episodic-event writes
    - resolve participants against campaign NPC rows and ignore player or unmatched names
key-files:
  created:
    - backend/src/engine/reflection-budget.ts
    - backend/src/engine/__tests__/reflection-budget.test.ts
  modified:
    - backend/src/engine/tool-executor.ts
    - backend/src/engine/npc-tools.ts
    - backend/src/engine/npc-offscreen.ts
    - backend/src/engine/index.ts
    - backend/src/engine/__tests__/tool-executor.test.ts
    - backend/src/engine/__tests__/npc-agent.test.ts
    - backend/src/engine/__tests__/npc-offscreen.test.ts
key-decisions:
  - "Reflection budget now increments directly on committed episodic-event writes instead of using replay scans or a parallel pipeline."
  - "Present-NPC act continues to piggyback through log_event, while speak and off-screen updates call the shared accumulator directly to avoid double-counting."
patterns-established:
  - "Authoritative live-write pattern: store episodic event, then accumulate unprocessedImportance in the same runtime seam."
  - "Campaign-scoped participant resolution is case-insensitive and NPC-only."
requirements-completed: [SIMF-01]
duration: 6 min
completed: 2026-04-09
---

# Phase 40 Plan 01: Live Reflection Budget Wiring Summary

**Shared live reflection-budget accumulation on committed gameplay, present-NPC dialogue, and off-screen NPC event writes**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-09T20:40:30+03:00
- **Completed:** 2026-04-09T20:46:32.2184847+03:00
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Added `accumulateReflectionBudget()` to resolve participant names against campaign NPCs, dedupe them case-insensitively, and increment `npcs.unprocessedImportance` once per matched NPC.
- Wired the helper into the three authoritative event writers in scope: `log_event`, present-NPC `speak`, and off-screen `applyOffscreenUpdate`.
- Added focused regression coverage proving the helper ignores players and unmatched names, and proving `act` still piggybacks through `log_event` without a second increment path.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock live accumulation seams in backend tests** - `e8ea127` (test)
2. **Task 2: Implement one shared reflection-budget helper and wire every authoritative event writer to it** - `64fcc38` (feat)

## Files Created/Modified
- `backend/src/engine/reflection-budget.ts` - Shared campaign-scoped reflection-budget accumulation helper.
- `backend/src/engine/tool-executor.ts` - `log_event` now accumulates reflection budget immediately after a committed episodic event.
- `backend/src/engine/npc-tools.ts` - Present-NPC dialogue now uses the shared accumulation seam after storing its event.
- `backend/src/engine/npc-offscreen.ts` - Off-screen NPC updates now use the shared accumulation seam after storing their event.
- `backend/src/engine/index.ts` - Re-exported the helper for engine-level access.
- `backend/src/engine/__tests__/reflection-budget.test.ts` - Helper-level integration coverage against real SQLite tables.
- `backend/src/engine/__tests__/tool-executor.test.ts` - `log_event` coverage for live reflection accumulation.
- `backend/src/engine/__tests__/npc-agent.test.ts` - Present-NPC dialogue and act-path coverage for the accumulation seam.
- `backend/src/engine/__tests__/npc-offscreen.test.ts` - Off-screen event coverage for the accumulation seam.

## Decisions Made
- Used raw committed event importance as the first live accumulation input. This matches the plan’s reliability-first guidance and keeps tuning separate from the seam wiring.
- Kept participant resolution NPC-only by scanning campaign NPC rows instead of trying to infer mixed entity types from event payload strings. This makes player and unmatched names inert without creating shadow reflection state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Hoisted new Vitest helper mocks once the real accumulator module existed**
- **Found during:** Task 2
- **Issue:** The new `reflection-budget` spy mocks in three tests were declared as ordinary top-level variables, but Vitest hoists `vi.mock()` factories. Once the implementation imported the real module, verification failed before runtime assertions ran.
- **Fix:** Switched those spies to `vi.hoisted(...)` so the tests could mock the shared helper safely.
- **Files modified:** `backend/src/engine/__tests__/tool-executor.test.ts`, `backend/src/engine/__tests__/npc-agent.test.ts`, `backend/src/engine/__tests__/npc-offscreen.test.ts`
- **Verification:** `npm --prefix backend exec vitest run src/engine/__tests__/reflection-budget.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts`
- **Committed in:** `64fcc38`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The auto-fix was verification-only and kept the plan scoped to the new live accumulation seam.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 40-02 can now harden threshold-crossed reflection behavior against a real live trigger source instead of an inert budget counter.
The only residual verification noise remains the repo-wide non-blocking Vitest `environmentMatchGlobs` deprecation warning.

## Self-Check: PASSED

- Found summary file at `.planning/phases/40-live-reflection-progression-triggers/40-01-SUMMARY.md`
- Found commit `e8ea127`
- Found commit `64fcc38`

---
*Phase: 40-live-reflection-progression-triggers*
*Completed: 2026-04-09*
