---
phase: 06-npc-agents
plan: 01
subsystem: engine
tags: [ai-sdk, generateText, tool-calling, npc, oracle, judge]

requires:
  - phase: 01-engine-foundation
    provides: Oracle, tool-executor, prompt-assembler
  - phase: 02-turn-cycle
    provides: turn-processor, post-turn hooks
  - phase: 05-episodic-memory
    provides: searchEpisodicEvents, buildOnPostTurn pattern
provides:
  - tickNpcAgent — per-NPC autonomous LLM tick with 4 tools
  - tickPresentNpcs — sequential orchestrator for all Key NPCs at a location
  - createNpcAgentTools — act (Oracle), speak, move_to, update_own_goal
  - Post-turn NPC tick wiring in chat routes
affects: [06-npc-agents, 07-reflection-engine]

tech-stack:
  added: []
  patterns: [npc-agent-tick, sequential-npc-orchestration, post-turn-npc-wiring]

key-files:
  created:
    - backend/src/engine/npc-tools.ts
    - backend/src/engine/npc-agent.ts
    - backend/src/engine/__tests__/npc-agent.test.ts
  modified:
    - backend/src/engine/index.ts
    - backend/src/routes/chat.ts

key-decisions:
  - "NPC act() routes through Oracle same as player actions -- no auto-success for NPCs"
  - "NPC ticks run sequentially (not Promise.all) to avoid conflicting DB state changes"
  - "NPC tick failures logged but never block gameplay (fire-and-forget)"
  - "Embedder is optional for NPC memory search -- degrades gracefully"

patterns-established:
  - "NPC agent tool factory: createNpcAgentTools returns campaign-scoped tools"
  - "Post-turn NPC ticking: buildOnPostTurn chains embedding + NPC ticks"

requirements-completed: [NPC-01, NPC-02, NPC-05]

duration: 8min
completed: 2026-03-18
---

# Phase 06 Plan 01: NPC Agent Core Summary

**NPC agent system with 4 tools (act/speak/move_to/update_own_goal) powered by Judge LLM, ticking Key NPCs at player location after every turn**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-18T22:35:13Z
- **Completed:** 2026-03-18T22:43:14Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- NPC agent tick system with 4 tools: act (through Oracle), speak, move_to (adjacency-validated), update_own_goal
- Sequential NPC orchestration that ticks all Key NPCs at player's location after each turn
- Full integration into post-turn processing in chat routes (/action and /retry)
- 7 passing tests covering all tool behaviors and orchestrator edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Create NPC Agent tools and core tick function** - `07c87fa` (test), `9184043` (feat)
2. **Task 2: Wire NPC ticks into post-turn processing** - `e8603ba` (feat)

## Files Created/Modified
- `backend/src/engine/npc-tools.ts` - 4 NPC agent tools (act, speak, move_to, update_own_goal)
- `backend/src/engine/npc-agent.ts` - tickNpcAgent (per-NPC tick) and tickPresentNpcs (orchestrator)
- `backend/src/engine/__tests__/npc-agent.test.ts` - 7 unit tests for tools and orchestrator
- `backend/src/engine/index.ts` - barrel exports for NPC agent
- `backend/src/routes/chat.ts` - buildOnPostTurn wired with NPC ticks

## Decisions Made
- NPC act() routes through Oracle same as player actions -- no auto-success for NPCs
- NPC ticks run sequentially (not Promise.all) to avoid conflicting DB state changes
- NPC tick failures logged but never block gameplay (fire-and-forget)
- Embedder is optional for NPC memory search -- degrades gracefully without it
- AI SDK v6 stopWhen: stepCountIs(2) limits NPC to max 2 tool call steps per tick

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- AI SDK v6 uses `stopWhen: stepCountIs(N)` not `maxSteps` -- fixed during implementation
- AI SDK v6 tool call results accessed via `.input`/`.output` not `.args`/`.result` -- used type-safe casting

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- NPC agent system complete, ready for 06-02 (NPC lifecycle management, importance decay, off-screen behavior)
- tickPresentNpcs wired into post-turn, will automatically tick NPCs once the game runs

---
*Phase: 06-npc-agents*
*Completed: 2026-03-18*
