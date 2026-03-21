---
phase: 04-story-control
plan: 02
subsystem: frontend
tags: [retry, undo, inline-edit, story-control, narrative-log, quick-actions]

# Dependency graph
requires:
  - phase: 04-story-control/01
    provides: "POST /api/chat/retry, /undo, /edit backend endpoints"
provides:
  - "chatRetry, chatUndo, chatEdit API helpers in frontend/lib/api.ts"
  - "handleRetry, handleUndo, handleEdit handlers in game page"
  - "Retry/Undo hover buttons on last assistant message in NarrativeLog"
  - "Click-to-edit inline editing on any assistant message"
affects: [04-story-control]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Hover-reveal action buttons with group/group-hover opacity transition", "Click-to-edit with textarea replacement and Ctrl+Enter save"]

key-files:
  created: []
  modified:
    - frontend/lib/api.ts
    - frontend/app/game/page.tsx
    - frontend/components/game/narrative-log.tsx

key-decisions:
  - "Hover-reveal buttons (opacity-0 group-hover:opacity-100) for retry/undo to keep UI clean"
  - "Click-to-edit replaces paragraph with textarea, tracks edited indices in local state"
  - "canRetryUndo derived from messages array -- requires 2+ messages and last is assistant"

patterns-established:
  - "Retry streams SSE using same parseTurnSSE pattern as submitAction"
  - "Undo removes last 2 messages from local state and refreshes world data"

requirements-completed: [CTRL-04]

# Metrics
duration: 2min
completed: 2026-03-19
---

# Phase 4 Plan 2: Story Control Frontend Summary

**Retry/undo/edit UI controls wired to backend endpoints with hover-reveal buttons and click-to-edit inline textarea editing on assistant messages**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-18T21:53:22Z
- **Completed:** 2026-03-18T21:55:34Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Three new API helpers: chatRetry (SSE stream), chatUndo (JSON), chatEdit (JSON)
- Game page handlers: handleRetry (optimistic UI + SSE streaming), handleUndo (remove last turn + refresh world), handleEdit (update message content)
- NarrativeLog: retry/undo buttons appear on hover over last assistant message
- NarrativeLog: click any assistant message to open inline textarea editor with Save/Cancel buttons
- Keyboard shortcuts: Ctrl+Enter saves edit, Escape cancels
- Edited messages show "(edited)" label
- CTRL-04 (quick actions) verified still functional -- no changes needed

## Task Commits

Each task was committed atomically:

1. **Task 1: Frontend retry/undo/edit integration** - `ce2925b` (feat)
2. **Task 2: Verify all story controls work** - auto-approved checkpoint

## Files Created/Modified
- `frontend/lib/api.ts` - Added chatRetry, chatUndo, chatEdit API helpers
- `frontend/app/game/page.tsx` - Added handleRetry, handleUndo, handleEdit, canRetryUndo; passed new props to NarrativeLog
- `frontend/components/game/narrative-log.tsx` - Complete rewrite: added onRetry/onUndo/onEdit props, hover-reveal retry/undo buttons, click-to-edit with textarea, edited indices tracking, fixed ChatMessage import to use @worldforge/shared

## Decisions Made
- Hover-reveal UX for retry/undo buttons keeps the narrative clean while controls are discoverable
- Click-to-edit uses textarea with matching serif font for seamless visual integration
- canRetryUndo guard prevents retry/undo during streaming or when no assistant messages exist

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed missing ChatMessage type import**
- **Found during:** Task 1
- **Issue:** narrative-log.tsx imported ChatMessage from `./types` which doesn't exist
- **Fix:** Changed import to use `@worldforge/shared`
- **Files modified:** frontend/components/game/narrative-log.tsx
- **Commit:** ce2925b

## Issues Encountered
None

## User Setup Required
None

## Next Phase Readiness
- Phase 4 (Story Control) is now fully complete
- All CTRL requirements (01-04) fulfilled
- Ready for Phase 5 (Episodic Memory)

---
*Phase: 04-story-control*
*Completed: 2026-03-19*
