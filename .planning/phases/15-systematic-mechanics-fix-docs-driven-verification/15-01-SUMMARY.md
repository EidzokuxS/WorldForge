---
phase: 15-systematic-mechanics-fix-docs-driven-verification
plan: 01
subsystem: engine
tags: [hp-guard, move-to, npc-visibility, storyteller-tools, prompt-engineering]

# Dependency graph
requires:
  - phase: 02-turn-cycle
    provides: "Tool executor, tool schemas, turn processor pipeline"
  - phase: 06-npc-agents
    provides: "NPC agent tools with move_to reference implementation"
provides:
  - "Outcome-tier-aware HP change validation in tool-executor"
  - "Storyteller move_to tool for player location changes"
  - "NPC engagement and movement prompt rules in SYSTEM_RULES"
affects: [15-02, 15-03, gameplay-testing]

# Tech tracking
tech-stack:
  added: []
  patterns: ["outcomeTier flow from Oracle through tool creation to tool execution"]

key-files:
  created: []
  modified:
    - backend/src/engine/tool-executor.ts
    - backend/src/engine/tool-schemas.ts
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/prompt-assembler.ts

key-decisions:
  - "outcomeTier passed as optional parameter through executeToolCall to handleSetCondition -- backward compatible with NPC tools"
  - "move_to tool validates connection graph before moving player -- returns available paths on failure for LLM retry"
  - "NPC engagement rules are prompt-level instructions, not code enforcement -- LLM compliance expected"

patterns-established:
  - "Outcome-tier context: Oracle result flows through tool creation to tool execution for conditional validation"

requirements-completed: []

# Metrics
duration: 4min
completed: 2026-03-20
---

# Phase 15 Plan 01: Core Mechanics Fix Summary

**HP guard rejects damage on strong_hit, move_to tool enables Storyteller-driven travel, NPC engagement rules force active narration of present NPCs**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-20T07:30:44Z
- **Completed:** 2026-03-20T07:34:58Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- set_condition now rejects negative HP delta when outcomeTier is strong_hit (Bug 1 fix)
- move_to tool added to Storyteller tool set with full connection validation (Bug 2 fix)
- SYSTEM_RULES updated with mandatory NPC engagement and move_to usage instructions (Bug 3 fix)

## Task Commits

Each task was committed atomically:

1. **Task 1: Backend HP guard + Storyteller move_to tool** - `bc65ad6` (feat)
2. **Task 2: NPC visibility in prompt + movement prompt instructions** - `cfb5345` (feat)

## Files Created/Modified
- `backend/src/engine/tool-executor.ts` - Added handleMoveTo handler, outcomeTier param, strong_hit HP guard
- `backend/src/engine/tool-schemas.ts` - Added move_to tool definition, outcomeTier passthrough to set_condition
- `backend/src/engine/turn-processor.ts` - Pass oracleResult.outcome to createStorytellerTools
- `backend/src/engine/prompt-assembler.ts` - NPC engagement rules + move_to usage instructions in SYSTEM_RULES

## Decisions Made
- outcomeTier is optional parameter (backward compatible) -- NPC tools and other callers unaffected
- move_to returns available connected paths on failure so LLM can self-correct
- NPC engagement is prompt-level enforcement (not code) -- relies on LLM following instructions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All 3 gameplay-breaking bugs addressed
- Ready for plan 02 (tag validation and item transfer fixes)
- Backend typecheck passes cleanly

---
*Phase: 15-systematic-mechanics-fix-docs-driven-verification*
*Completed: 2026-03-20*
