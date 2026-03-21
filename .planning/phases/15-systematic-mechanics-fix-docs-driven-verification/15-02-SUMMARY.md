---
phase: 15-systematic-mechanics-fix-docs-driven-verification
plan: 02
subsystem: engine
tags: [sanitization, auto-checkpoint, hp-guard, narrative-leak, death-narration]

# Dependency graph
requires:
  - phase: 15-01
    provides: "Tool executor with outcomeTier param, move_to tool, NPC engagement rules"
provides:
  - "Extended narrative sanitization covering all tool names + catch-all regex"
  - "Reactive auto-checkpoint on HP drop to danger zone during turn"
  - "HP=0 isDowned detection in turn-processor for death/defeat context"
affects: [15-03, gameplay-testing]

# Tech tracking
tech-stack:
  added: []
  patterns: ["auto_checkpoint TurnEvent type for reactive checkpoints during turn processing"]

key-files:
  created: []
  modified:
    - backend/src/engine/turn-processor.ts
    - backend/src/routes/chat.ts

key-decisions:
  - "Catch-all regex for unknown function-call patterns prevents future tool leaks without manual updates"
  - "auto_checkpoint event emitted from turn-processor and handled in chat.ts -- separation of concerns"
  - "HP=0 awareness added to outcome instructions (miss + weak_hit) rather than post-hoc injection"

patterns-established:
  - "Reactive checkpoint: turn-processor emits auto_checkpoint event, route handler creates checkpoint"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-20
---

# Phase 15 Plan 02: Safety Net Bugs Fix Summary

**Extended narrative sanitization with catch-all regex, reactive auto-checkpoint on HP danger zone, HP=0 death narration instructions**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-20T07:38:43Z
- **Completed:** 2026-03-20T07:41:41Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- All tool names (add_tag, remove_tag, transfer_item, move_to) added to sanitization regex + catch-all for unknown patterns
- Reactive auto-checkpoint fires when set_condition drops HP to 2 or below during a turn (not just pre-turn)
- HP=0 isDowned detection in turn-processor with death/defeat narration rules in miss and weak_hit outcomes

## Task Commits

Each task was committed atomically:

1. **Task 1: Extended tool-call sanitization + HP=0 context injection** - `c60cf8c` (feat)
2. **Task 2: Reactive auto-checkpoint on HP drop during turn** - `d1e07f6` (feat)

## Files Created/Modified
- `backend/src/engine/turn-processor.ts` - Extended TOOL_CALL_LEAK_PATTERNS with 4 missing tools + catch-all + print() regex, added playerDowned flag and isDowned detection, HP=0 rules in OUTCOME_INSTRUCTIONS, auto_checkpoint event type and emission
- `backend/src/routes/chat.ts` - Handle auto_checkpoint event in /action and /retry SSE loops with fire-and-forget checkpoint creation

## Decisions Made
- Catch-all regex `/\b[a-z_]+\s*\(\s*(?:[a-z_]+=|["'\[])[^)]*\)/gi` prevents future tool name leaks without manual enumeration
- auto_checkpoint event type added to TurnEvent union so route handler handles checkpoint creation (not turn-processor)
- HP=0 instructions added to miss and weak_hit OUTCOME_INSTRUCTIONS rather than post-hoc system prompt injection

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 safety net bugs addressed (Bug 4: tool leak, Bug 5: auto-checkpoint timing, Bug 6: HP=0 narration)
- Ready for plan 03 (final verification pass)
- Backend typecheck passes cleanly

---
*Phase: 15-systematic-mechanics-fix-docs-driven-verification*
*Completed: 2026-03-20*
