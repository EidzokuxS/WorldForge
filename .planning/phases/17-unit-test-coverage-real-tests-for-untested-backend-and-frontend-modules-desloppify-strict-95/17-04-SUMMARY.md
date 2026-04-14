---
phase: 17-unit-test-coverage
plan: 04
subsystem: testing
tags: [vitest, hono, routes, unit-tests, mocking]

requires:
  - phase: 17-01
    provides: "Test patterns and mock infrastructure"
  - phase: 17-02
    provides: "Frontend test patterns"
provides:
  - "Unit tests for ai, images, and character route modules"
  - "24 test cases covering HTTP contract, validation, error handling"
affects: []

tech-stack:
  added: []
  patterns: ["Hono app.request() route testing with vi.mock for service dependencies"]

key-files:
  created:
    - backend/src/routes/__tests__/ai.test.ts
    - backend/src/routes/__tests__/images.test.ts
    - backend/src/routes/__tests__/character.test.ts
  modified: []

key-decisions:
  - "Mock paths resolved relative to test file location, not source module"
  - "Let parseBody run with real Zod validation rather than mocking it -- tests actual request validation"
  - "setupCharacterEndpoint tested via underlying dependency mocks (getActiveCampaign, loadSettings, resolveRoleModel, getDb) rather than mocking the helper directly"

patterns-established:
  - "Route test pattern: mock all service deps, mount route on Hono app, use app.request() with JSON body, assert status + body shape"

requirements-completed: [TEST-ROUTES-1]

duration: 4min
completed: 2026-03-21
---

# Phase 17 Plan 04: Route Tests (AI, Images, Character) Summary

**24 Vitest unit tests for ai.ts, images.ts, and character.ts routes verifying HTTP contract, Zod validation, and service delegation via Hono app.request()**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-21T19:53:11Z
- **Completed:** 2026-03-21T19:57:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- ai.test.ts: 6 tests covering /providers/test and /ai/test-role including validation errors and LLM failure
- images.test.ts: 7 tests covering GET image serving (type validation, path traversal, 404) and POST /generate
- character.test.ts: 11 tests covering all 6 endpoints with player/key role differentiation, save validation, and starting location resolution

## Task Commits

Each task was committed atomically:

1. **Task 1: Test routes/ai.ts + routes/images.ts** - `e19ae9e` (test)
2. **Task 2: Test routes/character.ts** - `1715226` (test)

## Files Created/Modified
- `backend/src/routes/__tests__/ai.test.ts` - Unit tests for AI provider test and role test endpoints
- `backend/src/routes/__tests__/images.test.ts` - Unit tests for image serving and generation endpoints
- `backend/src/routes/__tests__/character.test.ts` - Unit tests for all 6 character/NPC endpoints with role-based dispatch

## Decisions Made
- Let parseBody execute with real Zod schemas rather than mocking -- this tests actual request validation paths
- For character routes, mocked underlying dependencies (getActiveCampaign, loadSettings, resolveRoleModel, getDb) rather than mocking setupCharacterEndpoint helper directly -- provides better integration coverage
- Used chainable mock DB pattern from campaigns.test.ts for consistent test infrastructure

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All route test files complete, ready for remaining test plans
- 9 route test files now exist (campaigns, chat, helpers, lore, schemas, settings, ai, images, character)

---
*Phase: 17-unit-test-coverage*
*Completed: 2026-03-21*
