---
phase: 06-npc-agents
plan: 02
subsystem: engine
tags: [npc, offscreen-simulation, generateObject, tier-promotion, judge-llm]

# Dependency graph
requires:
  - phase: 06-npc-agents-01
    provides: NPC agent tick system (tickNpcAgent, tickPresentNpcs, npc-tools)
provides:
  - simulateOffscreenNpcs batch simulation for off-screen Key NPCs
  - NPC tier promotion endpoint (temporary -> persistent -> key)
affects: [07-reflection, 08-world-events]

# Tech tracking
tech-stack:
  added: []
  patterns: [batch LLM simulation via generateObject with Zod schema, tier ordering validation]

key-files:
  created:
    - backend/src/engine/npc-offscreen.ts
    - backend/src/engine/__tests__/npc-offscreen.test.ts
  modified:
    - backend/src/engine/index.ts
    - backend/src/routes/chat.ts
    - backend/src/routes/campaigns.ts
    - backend/src/routes/schemas.ts

key-decisions:
  - "Single batch generateObject call for all off-screen NPCs (not per-NPC) to minimize LLM calls"
  - "Off-screen updates stored as episodic events with type npc_offscreen and importance 3"

patterns-established:
  - "Batch NPC simulation: one LLM call produces array of structured updates via Zod-validated generateObject"
  - "Tier ordering validation: tierOrder map for upward-only promotion checks"

requirements-completed: [NPC-03, NPC-04]

# Metrics
duration: 5min
completed: 2026-03-19
---

# Phase 06 Plan 02: Off-screen Simulation & Promotion Summary

**Batch off-screen Key NPC simulation every N ticks via single Judge generateObject call, plus upward-only tier promotion endpoint**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-18T22:46:46Z
- **Completed:** 2026-03-18T22:52:00Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Off-screen Key NPCs batch-simulated every 5 ticks with structured location/action/goal updates
- Simulation results written to DB silently (not narrated to player) and logged as episodic events
- NPC promotion endpoint validates upward-only tier changes (temporary -> persistent -> key)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create off-screen NPC batch simulation** - `46a5002` (feat, TDD)
2. **Task 2: Add NPC promotion endpoint** - `1b68107` (feat)

## Files Created/Modified
- `backend/src/engine/npc-offscreen.ts` - simulateOffscreenNpcs, parseOffscreenUpdates, applyOffscreenUpdate
- `backend/src/engine/__tests__/npc-offscreen.test.ts` - 6 unit tests for off-screen simulation
- `backend/src/engine/index.ts` - Export simulateOffscreenNpcs from engine barrel
- `backend/src/routes/chat.ts` - Wired simulateOffscreenNpcs into buildOnPostTurn
- `backend/src/routes/campaigns.ts` - POST /:id/npcs/:npcId/promote endpoint
- `backend/src/routes/schemas.ts` - promoteNpcBodySchema

## Decisions Made
- Single batch generateObject call for all off-screen NPCs rather than per-NPC calls -- minimizes LLM usage
- Off-screen action summaries stored as episodic events (type: npc_offscreen, importance: 3) for future retrieval
- Goal progress appended to short_term goals array rather than replacing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- NPC agent system complete (present ticks + off-screen simulation + tier promotion)
- Ready for Phase 07 (reflection/journaling) which can leverage NPC episodic events

---
*Phase: 06-npc-agents*
*Completed: 2026-03-19*
