---
phase: 39-honest-turn-boundary-retry-undo
plan: 01
subsystem: api
tags: [sqlite, rollback, vitest, sse, gameplay]
requires:
  - phase: 37-campaign-loaded-gameplay-transport
    provides: campaign-addressed gameplay routes and campaign-scoped last-turn state
provides:
  - honest turn completion with explicit `finalizing_turn` before authoritative `done`
  - SQLite-safe single-step last-turn bundle capture and restore for retry and undo
  - route-level restore on rollback-critical finalization failure for `/api/chat/action` and `/api/chat/retry`
affects: [39-02 frontend readiness contract, 40-live-reflection-progression-triggers, 41-checkpoint-complete-simulation-restore]
tech-stack:
  added: []
  patterns: [authoritative turn-finalization boundary, whole-artifact rollback bundle restore, restore-before-replay retry flow]
key-files:
  created: [.planning/phases/39-honest-turn-boundary-retry-undo/39-01-SUMMARY.md]
  modified: [backend/src/engine/turn-processor.ts, backend/src/engine/state-snapshot.ts, backend/src/routes/chat.ts, backend/src/campaign/manager.ts, backend/src/engine/__tests__/turn-processor.test.ts, backend/src/engine/__tests__/state-snapshot.test.ts, backend/src/routes/__tests__/chat.test.ts]
key-decisions:
  - "The backend now emits `finalizing_turn` after narration and only emits `done` after rollback-critical post-turn simulation completes."
  - "Last-turn rollback is a hidden single-step bundle of `state.db`, `config.json`, and `chat_history.json`, captured with SQLite backup semantics and excluding `campaigns/{id}/vectors/`."
  - "Retry restores the same authoritative pre-turn bundle and replays from whole restored artifacts instead of message surgery or row-level undo."
patterns-established:
  - "Honest SSE contract: narration streams first, `finalizing_turn` marks rollback-critical work, and `done` means the authoritative boundary is reached."
  - "Rollback bundle contract: capture with SQLite backup, restore whole artifacts, then reload the campaign from disk-backed truth."
requirements-completed: [RINT-02, SIMF-02]
duration: 5min
completed: 2026-04-09
---

# Phase 39 Plan 01: Honest Turn Boundary, Retry & Undo Summary

**Authoritative turn completion with explicit finalization, SQLite-safe last-turn bundle rollback, and restore-on-failure retry/undo semantics**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-09T06:24:25+03:00
- **Completed:** 2026-04-09T06:29:13+03:00
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Locked the Phase 39 contract in backend tests for `finalizing_turn`, bounded rollback-critical finalization, and authoritative bundle restore.
- Replaced the old row-level shell snapshot with a SQLite-safe single-step bundle that restores `state.db`, `config.json`, and `chat_history.json` together.
- Changed `/api/chat/action`, `/api/chat/retry`, and `/api/chat/undo` to restore that same bundle and reload campaign runtime state from disk after critical failure or rollback.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock the honest completion and rollback contract in backend tests** - `9c2bc38` (test)
2. **Task 2: Implement authoritative finalization and single-step last-turn restore** - `08acca9` (feat)

## Files Created/Modified
- `backend/src/engine/turn-processor.ts` - emits `finalizing_turn`, awaits rollback-critical post-turn work, and enforces the 60s finalization ceiling.
- `backend/src/engine/state-snapshot.ts` - captures and restores the hidden single-step rollback bundle using SQLite backup semantics.
- `backend/src/routes/chat.ts` - restores the authoritative bundle on failed action/retry finalization and uses whole-artifact retry/undo semantics.
- `backend/src/campaign/manager.ts` - clears stale active campaign metadata before reload.
- `backend/src/engine/__tests__/turn-processor.test.ts` - regression coverage for explicit finalization and timeout-bounded completion.
- `backend/src/engine/__tests__/state-snapshot.test.ts` - regression coverage for SQLite-safe capture/restore and reload-after-restore semantics.
- `backend/src/routes/__tests__/chat.test.ts` - route regressions for restore-on-finalization-failure during action and retry.

## Decisions Made

- Moved present-NPC ticks, off-screen simulation, reflection checks, and faction ticks inside the authoritative turn boundary; embeddings and image generation stay auxiliary.
- Kept Phase 39 single-step by overwriting one hidden last-turn bundle per campaign instead of introducing timeline history.
- Made retry restore whole artifacts first and replay from the restored boundary, which removes chat-history surgery from the rollback path.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend now exposes honest turn semantics for the frontend to consume in `39-02`.
- Retry and undo are authoritative for the latest completed turn, but checkpoint-complete restore and cross-restart fidelity remain Phase 41 scope.

## Self-Check: PASSED

- Found `.planning/phases/39-honest-turn-boundary-retry-undo/39-01-SUMMARY.md`
- Verified task commits `9c2bc38` and `08acca9` in git history

---
*Phase: 39-honest-turn-boundary-retry-undo*
*Completed: 2026-04-09*
