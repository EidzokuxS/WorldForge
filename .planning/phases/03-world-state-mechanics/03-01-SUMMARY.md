---
phase: 03-world-state-mechanics
plan: 01
subsystem: engine
tags: [tools, drizzle, zod, ai-sdk, prompt-assembly]

requires:
  - phase: 02-turn-cycle
    provides: "Tool executor framework, prompt assembler, turn processor"
provides:
  - "5 new Storyteller tools: spawn_npc, spawn_item, reveal_location, set_condition, transfer_item"
  - "Player inventory in prompt context"
  - "HP=0 contextual death narration rules"
  - "Item hallucination prevention rules"
affects: [03-world-state-mechanics, 04-gm-control, 06-npc-behavior]

tech-stack:
  added: []
  patterns:
    - "resolveCharacterByName searches players then npcs for cross-table character lookup"
    - "Bidirectional graph updates on location reveal (insert + update connectedTo)"
    - "NPC HP rejection pattern: tool returns error message guiding Storyteller to use tags instead"

key-files:
  created: []
  modified:
    - backend/src/engine/tool-schemas.ts
    - backend/src/engine/tool-executor.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/__tests__/tool-executor.test.ts
    - backend/src/engine/__tests__/prompt-assembler.test.ts

key-decisions:
  - "NPCs do not have HP -- set_condition returns error guiding to add_tag/remove_tag for NPC conditions"
  - "spawn_npc creates temporary tier NPCs (Storyteller-spawned are ephemeral by default)"
  - "Inventory always shown in prompt even when empty (explicit '(empty)' signals absence to LLM)"

patterns-established:
  - "resolveCharacterByName: search players first, then npcs, return table origin for type-specific logic"
  - "Bidirectional graph: on reveal_location, both new and existing location connectedTo are updated"

requirements-completed: [TOOL-01, TOOL-02, TOOL-03, TOOL-06, MECH-01, MECH-02]

duration: 8min
completed: 2026-03-18
---

# Phase 03 Plan 01: Storyteller Tools Summary

**5 new Storyteller tools (spawn_npc, spawn_item, reveal_location, set_condition, transfer_item) with inventory tracking and HP=0 death narration rules in prompt assembler**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-18T21:12:45Z
- **Completed:** 2026-03-18T21:20:36Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- 5 new tools with Zod schemas and DB-validated executor handlers
- Player inventory always included in PLAYER STATE prompt section
- HP=0 contextual death narration and item hallucination prevention rules
- NPC equipment subsection in SCENE section
- 14 new tests (26 total tool-executor tests), all 91 engine tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 5 new tool schemas and executor handlers** - `9605ffc` (test) + `3c2f4ec` (feat) [TDD]
2. **Task 2: Update prompt assembler with inventory and HP=0 death context** - `c725dcd` (feat)

## Files Created/Modified
- `backend/src/engine/tool-schemas.ts` - 5 new tool definitions with Zod inputSchemas
- `backend/src/engine/tool-executor.ts` - 5 handler functions, resolveCharacterByName helper, switch cases
- `backend/src/engine/prompt-assembler.ts` - Inventory line, HP=0 rules, item constraint rules, NPC equipment
- `backend/src/engine/__tests__/tool-executor.test.ts` - 14 new tests for all 5 tools
- `backend/src/engine/__tests__/prompt-assembler.test.ts` - Updated test for SYSTEM_RULES containing [PLAYER STATE] reference

## Decisions Made
- NPCs do not have HP -- set_condition returns descriptive error guiding Storyteller to use tags
- spawn_npc creates temporary tier NPCs (Storyteller-spawned entities are ephemeral by default)
- Inventory always shown in prompt even when empty -- explicit "(empty)" prevents LLM from assuming items exist
- set_condition refine() ensures at least one of delta/value is provided

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed prompt-assembler test for SYSTEM_RULES containing [PLAYER STATE] reference**
- **Found during:** Task 2
- **Issue:** Test checked `not.toContain("[PLAYER STATE]")` on formatted output, but SYSTEM_RULES now contains "[PLAYER STATE] Inventory" reference text
- **Fix:** Changed test to check `sections.find(s => s.name === "PLAYER STATE")` instead of substring match
- **Files modified:** backend/src/engine/__tests__/prompt-assembler.test.ts
- **Verification:** All 13 prompt-assembler tests pass
- **Committed in:** c725dcd

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Test fix necessary for correctness. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tool executor has 11 tools total (6 existing + 5 new)
- Prompt assembler includes full player context (state, inventory, equipped items)
- Ready for Plan 02 (movement/location) and Plan 03 (NPC lifecycle)

---
*Phase: 03-world-state-mechanics*
*Completed: 2026-03-18*

## Self-Check: PASSED
