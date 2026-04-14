---
phase: 08-world-engine
plan: 01
subsystem: engine
tags: [faction-ai, world-simulation, tool-calling, generateText]

requires:
  - phase: 07-reflection-progression
    provides: "Reflection agent pattern, NPC tick pattern, tool creation pattern"
provides:
  - "Faction macro-tick system with interval gating"
  - "3 faction tools: faction_action, update_faction_goal, add_chronicle_entry"
  - "World engine wired into post-turn pipeline as step 5"
affects: [08-world-engine, world-events, information-flow]

tech-stack:
  added: []
  patterns: ["Per-faction sequential LLM evaluation with tools", "Interval-gated tick system (tick % N)"]

key-files:
  created:
    - backend/src/engine/faction-tools.ts
    - backend/src/engine/world-engine.ts
    - backend/src/engine/__tests__/world-engine.test.ts
  modified:
    - backend/src/engine/index.ts
    - backend/src/routes/chat.ts

key-decisions:
  - "All other factions loaded as neighbors (world is small enough for now vs graph traversal)"
  - "Faction territory detected via tag pattern 'Controlled by {name}' on locations"
  - "Chronicle auto-entry on faction_action tool (dual: explicit add_chronicle_entry + auto from action)"

patterns-established:
  - "Faction tool factory: createFactionTools(campaignId, tick) returning AI SDK tool object"
  - "World engine orchestrator: tickFactions with interval gating and per-faction error isolation"

requirements-completed: [WRLD-01, WRLD-02, WRLD-03]

duration: 5min
completed: 2026-03-18
---

# Phase 8 Plan 01: Faction Tick System Summary

**Faction macro-tick system with 3 AI SDK tools (action/goal/chronicle) wired as post-turn step 5 with interval gating**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-18T23:30:59Z
- **Completed:** 2026-03-18T23:35:55Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Faction tools: faction_action (tag mutations + auto-chronicle), update_faction_goal (replace/append), add_chronicle_entry
- World engine orchestrator: tickFactions with configurable interval (default 10 ticks), per-faction error isolation
- Wired into buildOnPostTurn as non-blocking step 5 after reflection checks

## Task Commits

Each task was committed atomically:

1. **Task 1: Faction tools and world engine core** - `6f78d26` (test) + `fc78c9f` (feat)
2. **Task 2: Wire world engine into post-turn pipeline** - `df395ef` (feat)

## Files Created/Modified
- `backend/src/engine/faction-tools.ts` - AI SDK tool definitions for faction actions, goal updates, chronicle entries
- `backend/src/engine/world-engine.ts` - tickFactions orchestrator with interval gating and sequential faction processing
- `backend/src/engine/__tests__/world-engine.test.ts` - 8 unit tests covering tools and orchestrator
- `backend/src/engine/index.ts` - Barrel exports for tickFactions, FactionTickResult, createFactionTools
- `backend/src/routes/chat.ts` - Step 5 in buildOnPostTurn calling tickFactions

## Decisions Made
- All other factions loaded as "neighbors" rather than graph-traversal of connected locations (world is small enough)
- Territory ownership detected via tag pattern "Controlled by {factionName}" on locations (case-insensitive)
- faction_action auto-creates a chronicle entry alongside explicit add_chronicle_entry tool

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed AI SDK v6 tool.execute signature in tests**
- **Found during:** Task 2 (typecheck verification)
- **Issue:** AI SDK v6 tool().execute expects 2 arguments (input, options), tests only passed 1
- **Fix:** Added `{} as never` second argument and non-null assertion on execute
- **Files modified:** backend/src/engine/__tests__/world-engine.test.ts
- **Committed in:** df395ef (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test fix for type safety. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Faction tick system complete and wired into post-turn pipeline
- Ready for 08-02: World Events + Information Flow

---
*Phase: 08-world-engine*
*Completed: 2026-03-18*
