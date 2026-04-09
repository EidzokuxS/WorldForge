---
phase: 40-live-reflection-progression-triggers
plan: 02
subsystem: simulation
tags: [reflection, npc-state, vitest, sse, prompt-contract]
requires:
  - phase: 40-01
    provides: live reflection-budget accumulation on committed episodic events
provides:
  - regression coverage proving reflection stays inside rollback-critical post-turn finalization
  - prompt guardrails that prioritize belief, goal, and relationship drift over progression jumps
  - later-turn NPC prompt coverage that reads reflected canonical beliefs, goals, and relationships
affects: [phase-39-turn-boundary, npc-agent, reflection-tools]
tech-stack:
  added: []
  patterns: [tdd regression-first execution, structured-state-first reflection prompting]
key-files:
  created: []
  modified:
    - backend/src/engine/reflection-agent.ts
    - backend/src/engine/__tests__/reflection-agent.test.ts
    - backend/src/engine/__tests__/npc-agent.test.ts
    - backend/src/routes/__tests__/chat.test.ts
key-decisions:
  - "Reflection prompts now explicitly treat beliefs, goals, and relationships as the default durable outcomes of ordinary play."
  - "Wealth and skill upgrades remain available, but only behind materially stronger evidence thresholds than ordinary interaction arcs."
patterns-established:
  - "Reflection contract tests pin both prompt wording and post-turn route wiring so live behavior stays inside the Phase 39 finalization boundary."
  - "Later-turn NPC prompts should read canonical structured state and relationship graph output rather than stale legacy blobs."
requirements-completed: [SIMF-01]
duration: 4min
completed: 2026-04-09
---

# Phase 40 Plan 02: Live Reflection Trigger Summary

**Live reflection now fires inside ordinary post-turn finalization and defaults to durable belief, goal, and relationship changes that later NPC turns read back from canonical state**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-09T17:50:00Z
- **Completed:** 2026-04-09T17:54:17Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added TDD regressions that lock the live reflection trigger into the normal `/chat/action` finalization path before `done`.
- Added later-turn NPC coverage proving reflected canonical beliefs, goals, and relationships are consumed from structured runtime state.
- Hardened the reflection prompt so ordinary arcs bias toward structured belief/goal/relationship drift while wealth and skill progression stay secondary behind stronger evidence.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock the live trigger and structured-outcome contract in backend tests** - `1f4d320` (test)
2. **Task 2: Harden the reflection-agent runtime contract around evidence-driven structured-state changes** - `5a3dd74` (feat)

## Files Created/Modified

- `backend/src/engine/reflection-agent.ts` - strengthened the live reflection prompt with explicit structured-state-first and stronger-evidence guardrails.
- `backend/src/engine/__tests__/reflection-agent.test.ts` - locked outcome-priority and progression-evidence prompt expectations.
- `backend/src/engine/__tests__/npc-agent.test.ts` - added later-turn prompt regression for reflected canonical beliefs, goals, and relationships.
- `backend/src/routes/__tests__/chat.test.ts` - proved reflection runs during rollback-critical post-turn finalization before `done`.

## Decisions Made

- Reflection should stay evidence-driven, but ordinary interaction arcs should usually resolve into `set_belief`, `set_goal`, `drop_goal`, and `set_relationship` outcomes instead of progression jumps.
- Route-level verification should assert reflection through the existing post-turn finalization seam rather than introducing a bespoke test harness outside normal gameplay flow.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed the route-test player fixture so finalization coverage could reach the honest post-turn path**
- **Found during:** Task 1 (Lock the live trigger and structured-outcome contract in backend tests)
- **Issue:** The new `/chat/action` regression only exercised reflection and faction work because the mocked player row omitted `currentLocationId`, preventing present/off-screen NPC finalization from running.
- **Fix:** Added `currentLocationId` to the shared route-test DB fixture so the new regression covers the same rollback-critical post-turn path as production.
- **Files modified:** `backend/src/routes/__tests__/chat.test.ts`
- **Verification:** Re-ran the targeted Vitest suite and confirmed the only remaining RED failures were the intended reflection prompt contract assertions.
- **Committed in:** `1f4d320`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The auto-fix kept the new regression honest without changing scope. No product behavior or architecture changed beyond test fidelity.

## Issues Encountered

- The first RED run surfaced a test-fixture gap rather than a runtime defect; fixing the fixture isolated the real implementation delta in `reflection-agent.ts`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `SIMF-01` is now backed by targeted backend regressions plus a live prompt contract that keeps reflection inside the Phase 39 turn boundary.
- Phase 40 can be treated as operational for ordinary-play reflection triggering; remaining work is outside this plan's scope.

## Self-Check: PASSED

- Found `.planning/phases/40-live-reflection-progression-triggers/40-02-SUMMARY.md`
- Found commit `1f4d320`
- Found commit `5a3dd74`
