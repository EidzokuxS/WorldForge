---
phase: 02-turn-cycle
plan: 01
subsystem: engine
tags: [ai-sdk, tool-calling, async-generator, zod, lancedb, drizzle]

requires:
  - phase: 01-engine-foundation
    provides: Oracle, prompt assembler, token budgets

provides:
  - 6 Storyteller tool schemas with Zod validation (add_tag, remove_tag, set_relationship, add_chronicle_entry, log_event, offer_quick_actions)
  - Tool executor with entity validation against DB
  - Turn processor async generator (Oracle -> Storyteller pipeline)
  - Episodic event storage in LanceDB
  - Post-turn hook point for future NPC/reflection ticks

affects: [02-turn-cycle, 03-mechanics, 05-memory, 06-npc-agency]

tech-stack:
  added: []
  patterns:
    - "AI SDK v6 tool() with inputSchema (not parameters) and execute callbacks"
    - "Async generator yielding typed TurnEvents for streaming"
    - "Tool executor never throws -- returns ToolResult with success/error"
    - "Entity resolution via case-insensitive LOWER() SQL match"
    - "stopWhen: stepCountIs(2) for multi-step tool calling"

key-files:
  created:
    - backend/src/engine/tool-schemas.ts
    - backend/src/engine/tool-executor.ts
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/__tests__/tool-executor.test.ts
    - backend/src/engine/__tests__/turn-processor.test.ts
  modified:
    - backend/src/engine/index.ts
    - backend/src/vectors/episodic-events.ts
    - backend/src/vectors/index.ts

key-decisions:
  - "AI SDK v6 uses inputSchema field (not parameters) for tool definitions"
  - "AI SDK v6 fullStream text-delta has .text field (not .textDelta)"
  - "AI SDK v6 tool-result uses .input/.output (not .args/.result)"
  - "Episodic events stored with empty vector array (embedding deferred to post-turn)"
  - "Entity resolution searches by LOWER(name) for case-insensitive matching"
  - "set_relationship resolves entity names across all entity tables (players, npcs, locations, factions, items)"

patterns-established:
  - "createStorytellerTools(campaignId, tick) factory pattern for campaign-scoped tools"
  - "executeToolCall returns ToolResult {success, result?, error?} -- never throws"
  - "processTurn async generator yields TurnEvent stream for SSE consumption"
  - "Outcome-specific narration directives appended to system prompt"

requirements-completed: [TURN-01, TURN-02, TURN-04, TOOL-04, TOOL-05, TOOL-07, TOOL-08, TOOL-09, TOOL-10]

duration: 15min
completed: 2026-03-18
---

# Phase 02 Plan 01: Tool Schemas + Turn Processor Summary

**6 Storyteller tools with Zod schemas, DB-validated tool executor, and async generator turn processor orchestrating Oracle -> Storyteller pipeline with outcome-directed narration**

## Performance

- **Duration:** 15 min
- **Started:** 2026-03-18T20:32:03Z
- **Completed:** 2026-03-18T20:46:39Z
- **Tasks:** 2 (TDD: 4 commits per task pair)
- **Files modified:** 8

## Accomplishments

- 6 Storyteller tool schemas with Zod input validation via AI SDK v6 tool() function
- Tool executor validates entity existence in DB before any state mutation, never throws
- Turn processor yields typed TurnEvents as async generator (oracle_result -> narrative -> state_update -> quick_actions -> done)
- Episodic event storage function in LanceDB with deferred vector embedding
- Post-turn hook point for future NPC agency and reflection ticks
- 24 new tests (12 tool executor + 12 turn processor), 636 total tests passing

## Task Commits

Each task was committed atomically (TDD: test then implementation):

1. **Task 1: Tool schemas + Tool executor** - `0b9330e` (test) + `0e3bc2b` (feat)
2. **Task 2: Turn processor** - `464a62f` (test) + `eb8ab6f` (feat)

## Files Created/Modified

- `backend/src/engine/tool-schemas.ts` - 6 Storyteller tool definitions with Zod schemas, factory function
- `backend/src/engine/tool-executor.ts` - executeToolCall with entity resolution and DB mutations
- `backend/src/engine/turn-processor.ts` - processTurn async generator, full turn pipeline
- `backend/src/engine/index.ts` - Re-exports for new modules
- `backend/src/vectors/episodic-events.ts` - storeEpisodicEvent function for LanceDB
- `backend/src/vectors/index.ts` - Re-exports for episodic events
- `backend/src/engine/__tests__/tool-executor.test.ts` - 12 tests for all tool types
- `backend/src/engine/__tests__/turn-processor.test.ts` - 12 tests for pipeline events

## Decisions Made

- AI SDK v6 uses `inputSchema` field (not `parameters`) for tool definitions -- discovered via typecheck
- AI SDK v6 fullStream `text-delta` part has `.text` field (not `.textDelta` from older versions)
- AI SDK v6 `tool-result` uses `.input`/`.output` (not `.args`/`.result`)
- Episodic events stored with empty vector array -- embedding deferred to post-turn async
- Entity resolution in set_relationship searches across all 5 entity tables (players, npcs, locations, factions, items)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] AI SDK v6 field name changes**
- **Found during:** Task 1 (tool-schemas.ts)
- **Issue:** Plan specified `parameters` field for tool(), but AI SDK v6 uses `inputSchema`
- **Fix:** Changed all tool definitions to use `inputSchema` instead of `parameters`
- **Files modified:** backend/src/engine/tool-schemas.ts
- **Verification:** typecheck passes clean
- **Committed in:** 0e3bc2b

**2. [Rule 3 - Blocking] AI SDK v6 stream part field names**
- **Found during:** Task 2 (turn-processor.ts)
- **Issue:** Plan referenced `.textDelta`, `.args`, `.result` -- AI SDK v6 uses `.text`, `.input`, `.output`
- **Fix:** Updated field access in fullStream iteration
- **Files modified:** backend/src/engine/turn-processor.ts, backend/src/engine/__tests__/turn-processor.test.ts
- **Verification:** tests pass, typecheck clean
- **Committed in:** eb8ab6f

---

**Total deviations:** 2 auto-fixed (2 blocking -- AI SDK v6 API differences)
**Impact on plan:** Both fixes necessary due to AI SDK v6 API changes. No scope creep.

## Issues Encountered

None beyond the AI SDK v6 field name differences documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Turn processor ready for route integration (Plan 02-02)
- createStorytellerTools and processTurn exported from engine/index.ts
- Post-turn hook point ready for future NPC agency (Phase 06)
- All 636 tests passing, typecheck clean

---
*Phase: 02-turn-cycle*
*Completed: 2026-03-18*
