---
phase: 01-engine-foundation
plan: 01
subsystem: engine
tags: [prompt-assembly, token-budget, llm-context, drizzle, lancedb]

# Dependency graph
requires: []
provides:
  - "Token estimation via 4-char heuristic (estimateTokens)"
  - "Budget allocation per prompt section (allocateBudgets)"
  - "Priority-based truncation (truncateToFit)"
  - "Structured prompt assembly from 6+ data sources (assemblePrompt)"
  - "resolveJudge() helper for Judge role resolution"
affects: [02-turn-loop, 03-oracle-mechanics, 06-npc-autonomy, 07-reflection]

# Tech tracking
tech-stack:
  added: []
  patterns: [prompt-section-headers, priority-based-truncation, graceful-missing-data]

key-files:
  created:
    - backend/src/engine/token-budget.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/index.ts
    - backend/src/engine/__tests__/token-budget.test.ts
    - backend/src/engine/__tests__/prompt-assembler.test.ts
  modified:
    - backend/src/routes/helpers.ts

key-decisions:
  - "4-char-per-token heuristic (Math.ceil(length/4)) avoids tokenizer dependency while providing reasonable estimates"
  - "Priority numbers 0-7 with lower=more important; canTruncate flag prevents cutting system rules and premise"
  - "Lore retrieval is best-effort: embedder failure skips lore section gracefully instead of failing the whole prompt"

patterns-established:
  - "PromptSection interface: name, priority, content, estimatedTokens, canTruncate"
  - "[SECTION NAME] header format with double-newline separation between sections"
  - "Graceful degradation: missing player/location/embedder produces valid prompt without those sections"

requirements-completed: [PRMT-01, PRMT-02, PRMT-05]

# Metrics
duration: 6min
completed: 2026-03-18
---

# Phase 01 Plan 01: Prompt Assembler Summary

**Token-budgeted prompt assembler gathers 6+ data sources (system rules, premise, scene, player, NPCs, lore, conversation, action result) with priority-based truncation**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-18T19:49:38Z
- **Completed:** 2026-03-18T19:55:41Z
- **Tasks:** 1
- **Files modified:** 6

## Accomplishments
- Token budget system: estimateTokens (4-char heuristic), allocateBudgets (percentage-based), truncateToFit (priority-ordered trimming)
- Prompt assembler queries SQLite (players, npcs, locations, items, relationships), LanceDB (lore cards via vector search), and disk (config.json, chat_history.json)
- resolveJudge() added to routes/helpers.ts following existing resolveStoryteller/resolveGenerator pattern
- 27 unit tests covering token budget math, truncation behavior, and prompt assembly with mocked dependencies

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests** - `c0c93e9` (test)
2. **Task 1 (GREEN): Implementation** - `7475b60` (feat)

## Files Created/Modified
- `backend/src/engine/token-budget.ts` - estimateTokens, allocateBudgets, truncateToFit, PromptSection interface
- `backend/src/engine/prompt-assembler.ts` - assemblePrompt with all data source integration
- `backend/src/engine/index.ts` - Barrel exports for engine module
- `backend/src/engine/__tests__/token-budget.test.ts` - 14 token budget unit tests
- `backend/src/engine/__tests__/prompt-assembler.test.ts` - 13 prompt assembler unit tests
- `backend/src/routes/helpers.ts` - Added resolveJudge() function

## Decisions Made
- Used 4-char-per-token heuristic instead of importing a tokenizer library (avoids dependency, good enough for budget estimation)
- Priority numbers 0 (system rules, never cut) through 7 (conversation, first to trim) with canTruncate flag
- Lore context retrieval is best-effort: if embedder fails or is not configured, prompt still works without lore section
- Conversation section built from end (most recent first), fitting within allocated budget
- NPC states only include NPCs at player's current location (scene-relevant context)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Changed log.debug to log.warn**
- **Found during:** Task 1 (typecheck)
- **Issue:** createLogger does not expose a debug() method (only info, warn, error)
- **Fix:** Changed `log.debug(...)` to `log.warn(...)` in lore retrieval error handler
- **Files modified:** backend/src/engine/prompt-assembler.ts
- **Verification:** typecheck passes clean
- **Committed in:** 7475b60

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Trivial logger method fix. No scope creep.

## Issues Encountered
- Mock Drizzle DB initially failed because Drizzle uses Symbols for table metadata (not plain `_` property). Fixed by matching table references by identity using imported table objects.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Engine module ready for import by turn loop (Phase 02) and Oracle mechanics (Phase 03)
- assemblePrompt can be called with any campaign's data to produce structured LLM context
- resolveJudge() ready for Oracle implementation

---
*Phase: 01-engine-foundation*
*Completed: 2026-03-18*
