# Phase 17: Unit Test Coverage - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Write real unit tests for all untested backend modules and frontend pure logic helpers. Remove desloppify ignore patterns as coverage is added. Target: desloppify strict score 95+ (currently 92.6).

The gap: test health strict is 49.8% due to 69 wontfix/open + ~150 suppressed findings. Need test health strict ~90% for overall strict 95.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

All implementation choices are at Claude's discretion — infrastructure/testing phase.

Key constraints:
- Tests must be REAL — verify actual logic, not just exist for coverage
- Use vitest (already configured in backend)
- Frontend tests need jsdom env + @testing-library/react setup (not yet configured)
- Mock AI SDK calls, DB, and file system as needed
- Follow existing test patterns in `backend/src/engine/__tests__/`
- After writing tests, remove corresponding desloppify ignore patterns
- Run `desloppify scan` after each batch to measure progress

### Modules to test (by priority — LOC × impact)

**Tier 1 — Backend logic (pure/mockable, highest impact):**
- `backend/src/worldgen/seed-roller.ts` (189 LOC) — pure logic
- `backend/src/worldgen/scaffold-saver.ts` (218 LOC) — DB writes, mockable
- `backend/src/worldgen/worldbook-importer.ts` (226 LOC) — parsing logic
- `backend/src/campaign/manager.ts` (300 LOC) — campaign CRUD
- `backend/src/campaign/chat-history.ts` (100 LOC) — file I/O
- `backend/src/campaign/checkpoints.ts` (204 LOC) — file + DB ops
- `backend/src/ai/storyteller.ts` (47 LOC) — thin wrapper

**Tier 2 — Backend routes (need Hono test client):**
- `backend/src/routes/ai.ts` (105 LOC)
- `backend/src/routes/lore.ts` (98 LOC)
- `backend/src/routes/images.ts` (105 LOC)
- `backend/src/routes/settings.ts` — already has tests nearby
- `backend/src/routes/character.ts` (271 LOC)
- `backend/src/routes/campaigns.ts` (369 LOC)
- `backend/src/routes/worldgen.ts` (362 LOC)
- `backend/src/routes/chat.ts` (686 LOC)

**Tier 3 — Frontend pure logic:**
- `frontend/lib/world-data-helpers.ts` (110 LOC) — pure transforms
- `frontend/lib/v2-card-parser.ts` (78 LOC) — parsing logic
- `frontend/lib/api.ts` (632 LOC) — fetch wrappers
- `frontend/lib/api-types.ts` (196 LOC) — type definitions (no tests needed)

**Tier 4 — Frontend components (need React test setup):**
- Skip for now — ROI too low vs effort to set up React testing

### Ignore patterns to remove after tests written

```
test_coverage::backend/src/worldgen/*
test_coverage::backend/src/campaign/*
test_coverage::backend/src/routes/*
test_coverage::backend/src/ai/storyteller.ts::*
test_coverage::backend/src/ai/test-connection.ts::*
```

Keep these ignores (genuinely untestable or low value):
```
test_coverage::frontend/*          — needs React test setup, skip this phase
test_coverage::backend/src/db/*    — schema + init, no logic to test
test_coverage::backend/src/index.ts::* — app entry point
```

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- vitest configured in `backend/vitest.config.ts`
- Existing test patterns in `backend/src/engine/__tests__/` — vi.mock for DB, AI SDK
- `setupMockDb` / `createMockDb` patterns for Drizzle mocks
- Route test pattern in `backend/src/routes/__tests__/` — mock Hono context

### Established Patterns
- `vi.mock("../../db/index.js")` for DB mocking
- `vi.mock("ai")` for AI SDK mocking
- `vi.mock("node:fs")` for file system mocking
- Tests use describe/it/expect, beforeEach for cleanup

### Integration Points
- Tests import from source via relative paths
- Vitest runs with `npm --prefix backend run test`
- TypeScript strict mode — tests must type-check

</code_context>

<specifics>
## Specific Ideas

- Write tests in parallel using subagents (3-4 agents, each handling a tier)
- After each batch of tests, rescan desloppify to track progress
- Remove ignore patterns ONLY after corresponding tests pass
- Final target: desloppify strict ≥ 95.0 → commit all changes

</specifics>

<deferred>
## Deferred Ideas

- Frontend React component testing (needs @testing-library/react setup)
- E2E integration tests (already covered by e2e/ scripts)

</deferred>

---

*Phase: 17-unit-test-coverage*
*Context gathered: 2026-03-21 via Smart Discuss (infrastructure skip)*
