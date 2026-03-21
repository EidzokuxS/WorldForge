---
phase: 07-reflection-progression
plan: 01
subsystem: engine
tags: [npc-agent, reflection, beliefs, goals, ai-tools, judge-llm]

requires:
  - phase: 06-npc-agents
    provides: NPC agent tick pattern, tool executor, episodic events
provides:
  - Reflection Agent (runReflection, checkAndTriggerReflections)
  - 4 reflection tools (set_belief, set_goal, drop_goal, set_relationship)
  - REFLECTION_THRESHOLD constant (15)
  - Post-turn reflection wiring (step 4 in buildOnPostTurn)
affects: [07-reflection-progression, prompt-assembler]

tech-stack:
  added: []
  patterns: [reflection-agent-pattern, importance-threshold-trigger]

key-files:
  created:
    - backend/src/engine/reflection-agent.ts
    - backend/src/engine/reflection-tools.ts
    - backend/src/engine/__tests__/reflection-agent.test.ts
  modified:
    - backend/src/engine/index.ts
    - backend/src/routes/chat.ts

key-decisions:
  - "Reflection threshold set at 15 unprocessedImportance -- balances frequency vs meaningfulness"
  - "Reflection fetches 10 episodic events (vs 3 for NPC tick) for richer synthesis"
  - "Reflection step 4 runs after NPC ticks and off-screen simulation to include latest events"

patterns-established:
  - "Reflection Agent pattern: threshold check -> episodic event retrieval -> Judge LLM tool calling -> importance reset"
  - "Non-blocking post-turn steps: each step wrapped in try/catch, failures logged but never thrown"

requirements-completed: [REFL-01, REFL-02, REFL-03, REFL-04, REFL-05]

duration: 4min
completed: 2026-03-19
---

# Phase 07 Plan 01: Reflection Agent Summary

**NPC Reflection Agent with 4 tools (beliefs/goals/relationships) triggered by importance threshold >= 15, wired as post-turn step 4**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-18T23:04:42Z
- **Completed:** 2026-03-18T23:08:43Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Reflection Agent synthesizes NPC beliefs, goals, and relationship updates from accumulated episodic events
- 4 reflection tools (set_belief, set_goal, drop_goal, set_relationship) modify NPC state in SQLite
- Importance-triggered reflection (threshold = 15) with automatic reset after processing
- Non-blocking integration into post-turn pipeline as step 4

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Reflection Agent tools and core reflection function** - `f4144e2` (feat, TDD)
2. **Task 2: Wire reflection into post-turn processing and export from engine barrel** - `5173814` (feat)

## Files Created/Modified
- `backend/src/engine/reflection-tools.ts` - 4 AI SDK tools for NPC reflection (set_belief, set_goal, drop_goal, set_relationship)
- `backend/src/engine/reflection-agent.ts` - runReflection + checkAndTriggerReflections orchestrator
- `backend/src/engine/__tests__/reflection-agent.test.ts` - 9 unit tests covering tools, reflection, and threshold
- `backend/src/engine/index.ts` - Barrel exports for reflection symbols
- `backend/src/routes/chat.ts` - Step 4 in buildOnPostTurn calling checkAndTriggerReflections

## Decisions Made
- Reflection threshold set at 15 -- high enough for meaningful accumulation, low enough to trigger regularly
- Reflection fetches 10 episodic events (vs 3 for NPC tick) for richer context during synthesis
- Reflection runs after NPC ticks and off-screen simulation to include latest events in consideration
- REFL-05 (beliefs/goals in Storyteller prompt) confirmed pre-satisfied by existing prompt-assembler.ts

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Reflection Agent complete, NPC beliefs and goals now evolve based on accumulated experiences
- Ready for Plan 02 (goal-driven behavior / progression mechanics)
- Prompt assembler already renders beliefs/goals in NPC states section

---
*Phase: 07-reflection-progression*
*Completed: 2026-03-19*
