---
phase: 01-engine-foundation
plan: 02
subsystem: engine
tags: [oracle, d100, probability, judge-llm, streaming, hono, zod, vitest]

requires:
  - phase: 01-engine-foundation/01
    provides: prompt-assembler, token-budget
provides:
  - Oracle probability system (callOracle, rollD100, resolveOutcome)
  - POST /api/chat/action endpoint (Oracle + prompt assembly + Storyteller pipeline)
  - OraclePanel frontend component with collapsible results
  - GET /api/debug/prompt endpoint for prompt inspection
  - incrementTick in campaign manager
affects: [02-turn-loop, 03-mechanics, 05-memory]

tech-stack:
  added: []
  patterns: [oracle-payload-evaluation, d100-3-tier-outcomes, x-header-metadata, fallback-on-llm-failure]

key-files:
  created:
    - backend/src/engine/oracle.ts
    - backend/src/engine/__tests__/oracle.test.ts
    - frontend/components/game/oracle-panel.tsx
  modified:
    - backend/src/engine/index.ts
    - backend/src/routes/chat.ts
    - backend/src/routes/schemas.ts
    - backend/src/campaign/manager.ts
    - backend/src/campaign/index.ts
    - backend/src/index.ts
    - frontend/app/game/page.tsx

key-decisions:
  - "Oracle uses temperature 0 override regardless of Judge role settings for deterministic rulings"
  - "Oracle result passed to frontend via X-Oracle-Result response header (avoids mixing metadata into stream)"
  - "Fallback to 50% chance on Oracle LLM failure -- game never blocks on AI errors"
  - "Phase 1 uses playerAction as intent (no separate intent parsing UI yet)"

patterns-established:
  - "Oracle payload pattern: intent + method + actorTags + targetTags + environmentTags + sceneContext"
  - "3-tier outcome: strong_hit (roll <= chance*0.5), weak_hit (roll <= chance), miss (roll > chance)"
  - "X-header pattern for sending structured metadata alongside streaming responses"
  - "incrementTick after each completed turn in onFinish callback"

requirements-completed: [ORCL-01, ORCL-02, ORCL-03, ORCL-04, ORCL-05]

duration: 7min
completed: 2026-03-18
---

# Phase 01 Plan 02: Oracle System Summary

**Oracle probability system via Judge LLM with D100 roll, 3-tier outcomes (strong_hit/weak_hit/miss), wired into /api/chat/action pipeline with prompt assembly and frontend OraclePanel**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-18T19:59:50Z
- **Completed:** 2026-03-18T20:06:32Z
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments
- Oracle evaluates action probability via Judge LLM (generateObject, Zod schema, temp 0) and returns chance 1-99 + reasoning
- D100 rolls against chance to produce Strong Hit / Weak Hit / Miss with proper boundary handling
- Full turn pipeline: Oracle -> prompt assembly -> Storyteller streaming -> tick increment
- Frontend displays Oracle result in collapsible panel with color-coded outcome badges

## Task Commits

Each task was committed atomically:

1. **Task 1: Oracle System (callOracle + rollD100 + resolveOutcome)** - `2e9d651` (feat+test, TDD)
2. **Task 2: Wire /api/chat/action endpoint** - `6b3c268` (feat)
3. **Task 3: Frontend OraclePanel component** - `f7b0552` (feat)

## Files Created/Modified
- `backend/src/engine/oracle.ts` - Oracle LLM call, D100 roll, 3-tier outcome resolution
- `backend/src/engine/__tests__/oracle.test.ts` - 17 unit tests for Oracle (boundaries, schema, mocked LLM)
- `backend/src/engine/index.ts` - Barrel exports for Oracle symbols
- `backend/src/routes/chat.ts` - POST /action endpoint with full Oracle + Storyteller pipeline
- `backend/src/routes/schemas.ts` - chatActionBodySchema (playerAction, intent, method)
- `backend/src/campaign/manager.ts` - incrementTick function, currentTick in config type
- `backend/src/campaign/index.ts` - incrementTick re-export
- `backend/src/index.ts` - GET /api/debug/prompt endpoint
- `frontend/components/game/oracle-panel.tsx` - Collapsible Oracle result panel
- `frontend/app/game/page.tsx` - OraclePanel integration, /api/chat/action switch

## Decisions Made
- Oracle uses temperature 0 override regardless of Judge role settings for deterministic rulings
- Oracle result passed via X-Oracle-Result response header to avoid mixing metadata into the text stream
- Fallback to 50% chance on Oracle LLM failure so the game never blocks
- Phase 1 reuses playerAction as intent (intent parsing UI deferred to Phase 2)
- contextWindow hardcoded to 8192 tokens (dynamic per-model budgets deferred per CONTEXT.md)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Oracle + prompt assembly pipeline complete, ready for turn loop expansion (Phase 02)
- Tool executor can now receive structured Oracle results for tool call validation
- OraclePanel ready for enrichment with target selection UI (Phase 03)

## Self-Check: PASSED

All 3 created files exist. All 3 task commits verified in git log.

---
*Phase: 01-engine-foundation*
*Completed: 2026-03-18*
