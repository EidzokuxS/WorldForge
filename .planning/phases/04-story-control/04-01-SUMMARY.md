---
phase: 04-story-control
plan: 01
subsystem: api
tags: [undo, retry, edit, state-snapshot, chat-history, sse]

# Dependency graph
requires:
  - phase: 02-turn-cycle
    provides: "processTurn async generator, SSE streaming pattern"
provides:
  - "captureSnapshot/restoreSnapshot for pre-turn state rollback"
  - "POST /api/chat/retry endpoint (re-roll same action)"
  - "POST /api/chat/undo endpoint (revert state + chat)"
  - "POST /api/chat/edit endpoint (update assistant message)"
  - "popLastMessages, replaceChatMessage, getLastPlayerAction chat history helpers"
affects: [04-story-control, 09-persistence]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Module-level snapshot storage for single-step undo", "Entity tracking via tool result inspection"]

key-files:
  created:
    - backend/src/engine/state-snapshot.ts
  modified:
    - backend/src/campaign/chat-history.ts
    - backend/src/campaign/index.ts
    - backend/src/engine/index.ts
    - backend/src/routes/chat.ts
    - backend/src/routes/schemas.ts

key-decisions:
  - "In-memory snapshot only (not persisted) -- single-step undo per CONTEXT.md"
  - "Spawned entity tracking via tool result inspection during SSE iteration"
  - "Retry re-uses playerAction as intent (no stored intent/method from original turn)"

patterns-established:
  - "captureSnapshot before turn, trackSpawnedEntity during, store after completion"
  - "restoreSnapshot cleans up bidirectional location graph connections before deletion"

requirements-completed: [CTRL-01, CTRL-02, CTRL-03]

# Metrics
duration: 4min
completed: 2026-03-19
---

# Phase 4 Plan 1: Story Control Backend Summary

**Retry/undo/edit endpoints with pre-turn state snapshots that capture player HP/tags/location and track spawned entities for clean rollback**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-18T21:45:31Z
- **Completed:** 2026-03-18T21:49:22Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- State snapshot module captures full player state + tick before each turn, restores on rollback including bidirectional location graph cleanup
- Three new chat control endpoints: retry (re-roll with state restoration), undo (revert state + chat history), edit (update assistant message content)
- Chat history helpers: popLastMessages, replaceChatMessage, getLastPlayerAction
- /action endpoint now captures snapshot and tracks spawned entity IDs from tool results

## Task Commits

Each task was committed atomically:

1. **Task 1: State snapshot module + chat history helpers** - `093ff50` (feat)
2. **Task 2: Retry, Undo, Edit endpoints** - `95d507c` (feat)

## Files Created/Modified
- `backend/src/engine/state-snapshot.ts` - TurnSnapshot interface, captureSnapshot(), restoreSnapshot() with entity cleanup
- `backend/src/engine/index.ts` - Re-exports snapshot module
- `backend/src/campaign/chat-history.ts` - Added popLastMessages, replaceChatMessage, getLastPlayerAction
- `backend/src/campaign/index.ts` - Re-exports new chat history helpers
- `backend/src/routes/chat.ts` - Added /retry, /undo, /edit endpoints + snapshot tracking in /action
- `backend/src/routes/schemas.ts` - Added chatEditBodySchema

## Decisions Made
- In-memory snapshot storage (module-level variable) -- single-step undo only, per CONTEXT.md decision
- Retry re-uses playerAction as intent since original intent/method aren't stored -- acceptable for re-roll
- Spawned entity tracking happens during SSE iteration by inspecting state_update events for IDs

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Backend endpoints ready for frontend integration in plan 04-02
- Frontend needs retry/undo/edit UI controls that call these endpoints

---
*Phase: 04-story-control*
*Completed: 2026-03-19*
