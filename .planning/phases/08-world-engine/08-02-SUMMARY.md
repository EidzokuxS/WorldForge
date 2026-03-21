---
phase: 08-world-engine
plan: 02
subsystem: engine
tags: [world-events, faction-ai, prompt-assembly, information-flow, chronicle]

requires:
  - phase: 08-world-engine
    provides: "Faction tick system with 3 tools, world engine orchestrator"
provides:
  - "declare_world_event tool for introducing plagues/disasters/anomalies during faction ticks"
  - "WORLD STATE prompt section with recent chronicle entries and active faction summaries"
  - "Information flow: events persist as chronicle entries and location tags, surfaced to Storyteller/NPCs via prompt"
affects: [world-engine, prompt-assembly, storyteller-context]

tech-stack:
  added: []
  patterns: ["Event tag application on locations (e.g. Plague-affected)", "WORLD STATE section in prompt assembler (priority 3, canTruncate)"]

key-files:
  created: []
  modified:
    - backend/src/engine/faction-tools.ts
    - backend/src/engine/world-engine.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/__tests__/world-engine.test.ts
    - backend/src/engine/__tests__/prompt-assembler.test.ts

key-decisions:
  - "Event tags follow pattern '{Type}-affected' (e.g. Plague-affected, Disaster-affected) on locations"
  - "WORLD STATE placed between SCENE and PLAYER STATE at priority 3 (same as player state, truncatable)"
  - "No explicit event propagation -- LLM infers NPC awareness from WORLD STATE + NPC tags + SCENE context"

patterns-established:
  - "World event tool: declare_world_event creates [WORLD EVENT]-prefixed chronicle + applies tags to locations"
  - "Prompt section builder pattern: buildWorldStateSection queries chronicle + factions, returns null if empty"

requirements-completed: [WRLD-04, WRLD-05]

duration: 4min
completed: 2026-03-18
---

# Phase 8 Plan 02: World Events & Information Flow Summary

**declare_world_event tool for faction-tick world events plus WORLD STATE prompt section with chronicle and faction context for Storyteller/NPC awareness**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-18T23:39:41Z
- **Completed:** 2026-03-18T23:44:21Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- declare_world_event tool: creates [WORLD EVENT]-prefixed chronicle entries and applies event-type tags to affected locations
- Faction tick prompt updated to suggest world events (plague, disaster, anomaly, discovery) when narratively appropriate
- WORLD STATE prompt section shows last 5 chronicle entries and all faction summaries in Storyteller/NPC prompts

## Task Commits

Each task was committed atomically:

1. **Task 1: Add world event tool and update faction tick prompt** - `2893c49` (feat)
2. **Task 2: Information flow via WORLD STATE prompt section** - `645db80` (feat)

## Files Created/Modified
- `backend/src/engine/faction-tools.ts` - Added declare_world_event tool (chronicle + location tag mutations)
- `backend/src/engine/world-engine.ts` - Updated faction tick system prompt to mention world events
- `backend/src/engine/prompt-assembler.ts` - Added buildWorldStateSection and wired into assemblePrompt
- `backend/src/engine/__tests__/world-engine.test.ts` - 3 new tests for declare_world_event (11 total)
- `backend/src/engine/__tests__/prompt-assembler.test.ts` - 5 new tests for WORLD STATE section (18 total)

## Decisions Made
- Event tags follow pattern `{Type}-affected` (e.g. `Plague-affected`) applied to location tags
- WORLD STATE section placed at priority 3 (same level as PLAYER STATE) with canTruncate=true
- No explicit event propagation system -- LLM naturally infers NPC awareness from combination of WORLD STATE + NPC tags + SCENE context

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- World engine complete: faction ticks with territory, goals, chronicle, and world events
- Information flows through prompt assembly: WORLD STATE for chronicle/factions, SCENE for location tags
- Ready for Phase 09 (persistence/save-load) or other downstream work

---
*Phase: 08-world-engine*
*Completed: 2026-03-18*
