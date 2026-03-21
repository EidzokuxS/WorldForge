---
phase: 05-episodic-memory
plan: 02
subsystem: engine
tags: [prompt-assembly, smart-compression, episodic-memory, graph-queries, bfs, token-budget]

# Dependency graph
requires:
  - phase: 05-01
    provides: "EpisodicEvent interface, searchEpisodicEvents, computeCompositeScore"
  - phase: 01-01
    provides: "Token budget system, prompt assembler, PromptSection interface"
provides:
  - "Smart conversation compression (first+last+anomalous)"
  - "Episodic memory section in prompt via composite-scored vector search"
  - "Multi-hop relationship graph traversal (depth 2) via BFS"
  - "NPC state enrichment with relationship chains"
affects: [06-npc-autonomy, 07-reflection, turn-cycle]

# Tech tracking
tech-stack:
  added: []
  patterns: ["first+last+anomalies compression", "BFS graph traversal on relationships table", "importance keyword detection"]

key-files:
  created:
    - "backend/src/engine/graph-queries.ts"
    - "backend/src/engine/__tests__/context-compression.test.ts"
  modified:
    - "backend/src/engine/prompt-assembler.ts"
    - "backend/src/engine/token-budget.ts"
    - "backend/src/engine/__tests__/token-budget.test.ts"

key-decisions:
  - "60% of conversation budget allocated to recent messages, remainder for first messages + important middle"
  - "28 importance keywords for compression survival (attack, killed, discovered, betrayed, etc.)"
  - "Relationship graph enrichment folded into NPC states section; buildRelationshipsSection kept as fallback for player-only relationships"
  - "Episodic memory gets 5% of context window (taken from recentConversation: 25%->20%)"

patterns-established:
  - "Smart compression: first 2 + last N + important middle with omission markers"
  - "Graph traversal: BFS with name cache built once per assemblePrompt call"
  - "Exported pure functions for testability (compressConversation, IMPORTANCE_KEYWORDS)"

requirements-completed: [PRMT-03, PRMT-04]

# Metrics
duration: 5min
completed: 2026-03-19
---

# Phase 05 Plan 02: Prompt Assembly Enrichment Summary

**Smart conversation compression with first+last+anomalies pattern, episodic memory retrieval via composite scoring, and 2-hop BFS relationship graph enrichment for NPC context**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-19T01:17:12Z
- **Completed:** 2026-03-19T01:22:32Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 5

## Accomplishments
- Smart compression keeps first 2 messages (world setup) + last N (recent) + anomalous events from middle, dropping mundane turns with omission markers
- Episodic memory section retrieves top 5 events via composite scoring (similarity*0.4 + recency*0.3 + importance*0.3) and formats as [EPISODIC MEMORY] in prompt
- Multi-hop graph queries traverse relationship chains up to depth 2 via BFS, enriching NPC state blocks with relationship connections
- Token budget updated: episodicMemory 5%, recentConversation reduced from 25% to 20%

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Failing compression tests** - `5c0178c` (test)
2. **Task 1 GREEN: Implementation** - `a963724` (feat)

## Files Created/Modified
- `backend/src/engine/graph-queries.ts` - Multi-hop BFS relationship traversal with name cache
- `backend/src/engine/__tests__/context-compression.test.ts` - 8 tests for compression logic and importance keywords
- `backend/src/engine/prompt-assembler.ts` - Smart compression, episodic memory section, NPC graph enrichment
- `backend/src/engine/token-budget.ts` - Added episodicMemory budget allocation
- `backend/src/engine/__tests__/token-budget.test.ts` - Updated expected budget value

## Decisions Made
- 60/40 split within conversation budget: 60% for recent messages, 40% for first messages + important middle
- 28 importance keywords covering combat, death, discovery, betrayal, and other dramatic events
- Relationship graph data folded directly into NPC state blocks (richer context per NPC) rather than separate section
- buildRelationshipsSection kept as fallback for player-specific relationships not covered by NPC graph

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated token-budget test for new allocation**
- **Found during:** Task 1 GREEN (implementation)
- **Issue:** Existing test expected recentConversation = 0.25 * 8192, but budget changed to 0.20
- **Fix:** Updated test assertion from 0.25 to 0.20
- **Files modified:** backend/src/engine/__tests__/token-budget.test.ts
- **Verification:** All 99 engine tests pass
- **Committed in:** a963724

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary fix caused directly by our budget change. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Prompt assembler now has full context enrichment: smart compression, episodic memory, and graph queries
- Ready for NPC autonomy phase (06) which will leverage enriched NPC context
- Ready for reflection phase (07) which will use episodic memory for self-assessment

---
*Phase: 05-episodic-memory*
*Completed: 2026-03-19*
