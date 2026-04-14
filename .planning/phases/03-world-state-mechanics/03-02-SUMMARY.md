---
phase: 03-world-state-mechanics
plan: 02
subsystem: engine, api
tags: [movement, inventory, location-graph, turn-processor, prompt-assembler]

requires:
  - phase: 02-turn-cycle
    provides: Turn processor pipeline with Oracle + Storyteller streaming
  - phase: 03-world-state-mechanics plan 01
    provides: Tool executor with spawn/transfer/reveal tools, item tracking in prompt
provides:
  - Movement detection and location graph validation in turn processor
  - World data API enriched with items
  - Player inventory endpoint
  - Location entities endpoint (NPCs + items)
  - Connected paths in Storyteller scene prompt
affects: [04-player-control, 06-npc-behavior, 08-world-expansion]

tech-stack:
  added: []
  patterns:
    - "detectMovement regex-based action parsing before Oracle"
    - "Non-blocking movement: non-connected destinations pass through to Oracle"

key-files:
  created: []
  modified:
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/index.ts
    - backend/src/routes/campaigns.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/__tests__/turn-processor.test.ts

key-decisions:
  - "Movement to non-connected locations is not hard-blocked -- Oracle still evaluates (dangerous travel or Storyteller reveal_location)"
  - "Movement detection uses regex prefix matching, not LLM classification"
  - "Connected paths included in scene prompt so Storyteller knows available exits"

patterns-established:
  - "Action pre-processing: detect special action types before Oracle call"
  - "State updates via yield before continuing normal turn flow"

requirements-completed: [MECH-03, MECH-04, MECH-05, MECH-06, MECH-07]

duration: 6min
completed: 2026-03-18
---

# Phase 03 Plan 02: Movement & Entity Tracking Summary

**Movement validation on location graph with inventory/entity endpoints and connected paths in Storyteller prompt**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-18T21:12:48Z
- **Completed:** 2026-03-18T21:19:44Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Movement detection in turn processor extracts destination, validates graph connections, updates player.currentLocationId
- Non-connected destinations pass through to Oracle (not hard-blocked) with available paths in context
- World data API returns items array alongside locations/npcs/factions
- Player inventory and location entity endpoints added
- Prompt assembler scene section includes connected paths for Storyteller

## Task Commits

Each task was committed atomically:

1. **Task 1: Movement validation and world data enrichment** - `25fdf41` (test) + `e30be01` (feat) [TDD]
2. **Task 2: Inventory endpoint and entity tracking verification** - `674fc0e` (feat)

## Files Created/Modified
- `backend/src/engine/turn-processor.ts` - Added detectMovement() helper and movement handling in processTurn
- `backend/src/engine/index.ts` - Exported detectMovement
- `backend/src/routes/campaigns.ts` - Added items to world data, inventory endpoint, location entities endpoint
- `backend/src/engine/prompt-assembler.ts` - Added connected paths to scene section
- `backend/src/engine/__tests__/turn-processor.test.ts` - 8 new tests for movement detection and processing

## Decisions Made
- Movement regex uses prefix matching (go to, travel to, move to, head to, walk to, run to) -- simple and deterministic
- Non-connected destinations are not blocked -- they pass through to Oracle for dangerous travel evaluation
- Unknown destinations pass through to Storyteller who may use reveal_location tool
- Connected paths added to scene prompt so Storyteller naturally references available exits

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Test mock DB needed table-aware routing (different results for players vs locations queries) -- resolved with `lastFromTable` pattern tracking which table was queried

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Movement and entity tracking complete, ready for player control features
- Inventory and entity endpoints available for frontend consumption
- Scene prompt now includes connected paths for natural Storyteller navigation hints

---
*Phase: 03-world-state-mechanics*
*Completed: 2026-03-18*
