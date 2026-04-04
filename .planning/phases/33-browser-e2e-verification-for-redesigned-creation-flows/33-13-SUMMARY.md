---
phase: 33-browser-e2e-verification-for-redesigned-creation-flows
plan: 13
subsystem: testing
tags: [vitest, react-testing-library, flat-layout, test-realignment]

requires:
  - phase: 33-browser-e2e-verification-for-redesigned-creation-flows
    provides: "flat-layout rewrite commits (4622090, f4dfc61, 0a09e34)"
provides:
  - "Zero main-project test failures in npm --prefix frontend exec vitest run"
  - "All 16 test cases across 11 files pass after flat-layout rewrite"
affects: []

tech-stack:
  added: []
  patterns:
    - "Use getByRole(heading, { level: 1 }) to disambiguate h1 from sidebar nav links"
    - "Use getByRole(tab, { name: /.../ }) for Radix TabsTrigger assertions"

key-files:
  created: []
  modified:
    - "frontend/components/non-game-shell/__tests__/app-shell.test.tsx"
    - "frontend/app/(non-game)/__tests__/layout.test.tsx"
    - "frontend/app/(non-game)/__tests__/page.test.tsx"
    - "frontend/app/(non-game)/library/__tests__/page.test.tsx"
    - "frontend/app/(non-game)/settings/__tests__/page.test.tsx"
    - "frontend/app/(non-game)/campaign/new/__tests__/page.test.tsx"
    - "frontend/app/(non-game)/campaign/new/dna/__tests__/page.test.tsx"
    - "frontend/app/(non-game)/campaign/[id]/character/__tests__/page.test.tsx"
    - "frontend/app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx"
    - "backend/src/campaign/__tests__/manager.test.ts"
    - "shared/src/__tests__/settings.test.ts"

key-decisions:
  - "Use getByRole('heading') instead of getByText to disambiguate page title from sidebar nav"
  - "Use getByRole('tab') for Radix tabs to avoid matching both tab trigger and content"
  - "Delete empty parent directories after orphaned test removal"

patterns-established: []

requirements-completed: [P33-04]

duration: 17min
completed: 2026-04-02
---

# Phase 33 Plan 13: Test Suite Realignment Summary

**Realigned 11 test files (16 test cases) to match flat-layout production markup; zero main-project test failures**

## Performance

- **Duration:** 17 min
- **Started:** 2026-04-02T20:43:13Z
- **Completed:** 2026-04-02T20:59:55Z
- **Tasks:** 2
- **Files modified:** 11 (9 rewritten, 2 fixed, 2 deleted)

## Accomplishments
- Rewrote 9 frontend test files to assert flat-layout shell regions (outer-frame, navigation-rail, main-panel) instead of deprecated action-tray, shell-grid, and panel primitives
- Fixed 2 backend/shared tests: added personaTemplates field to manager.test.ts expected objects, updated default searchProvider from duckduckgo to brave
- Deleted orphaned legacy test directories (frontend/app/campaign/[id]/character/__tests__/, frontend/app/settings/__tests__/) and cleaned up empty parent dirs
- Full test suite: 0 FAIL lines from main project (all 89 remaining failures are from .claude/worktrees/ which are not part of this project)

## Task Commits

Each task was committed atomically:

1. **Task 1: Realign 9 frontend test files to match flat-layout production markup** - `243a7e8` (test)
2. **Task 2: Fix backend/shared test failures and delete orphaned legacy test directories** - `bd39127` (fix)

## Files Created/Modified
- `frontend/components/non-game-shell/__tests__/app-shell.test.tsx` - Shell contract tests: outer-frame, navigation-rail, main-panel, no action-tray
- `frontend/app/(non-game)/__tests__/layout.test.tsx` - Layout test: CampaignStatusProvider + AppShell composition
- `frontend/app/(non-game)/__tests__/page.test.tsx` - Launcher test: New Campaign link + Recent Campaigns section
- `frontend/app/(non-game)/library/__tests__/page.test.tsx` - Library test: Alpha Codex table + Import Worldbook
- `frontend/app/(non-game)/settings/__tests__/page.test.tsx` - Settings test: Saved indicator + Providers tab
- `frontend/app/(non-game)/campaign/new/__tests__/page.test.tsx` - Concept test: Sources (not Source Library)
- `frontend/app/(non-game)/campaign/new/dna/__tests__/page.test.tsx` - DNA test: handleSeedToggle + handlePrepareManualDna mocks
- `frontend/app/(non-game)/campaign/[id]/character/__tests__/page.test.tsx` - Character test: Save & Begin Adventure + Back to Review
- `frontend/app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx` - Review test: tab triggers + Continue to Character
- `backend/src/campaign/__tests__/manager.test.ts` - Added personaTemplates: [] to expected config objects
- `shared/src/__tests__/settings.test.ts` - Updated searchProvider default from duckduckgo to brave
- `frontend/app/campaign/[id]/character/__tests__/page.test.tsx` - DELETED (orphaned)
- `frontend/app/settings/__tests__/page.test.tsx` - DELETED (orphaned)

## Decisions Made
- Used `getByRole('heading', { level: 1 })` to disambiguate PageHeader h1 from sidebar nav links containing the same text (e.g., "Settings", "Launchpad")
- Used `getByRole('tab', { name: /Premise/ })` for Radix TabsTrigger to avoid matching both tab trigger and mocked PremiseSection content
- Deleted empty parent directories (frontend/app/campaign/[id]/, frontend/app/settings/) after orphaned test removal to avoid confusing git status

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed duplicate text matching in app-shell and review tests**
- **Found during:** Task 1 (first test run)
- **Issue:** `getByText("Settings")` and `getByText(/Premise/)` matched multiple elements (sidebar nav + page header h1, tab trigger + section content)
- **Fix:** Used `getByRole('heading', { level: 1 })` and `getByRole('tab', { name: /.../ })` for unambiguous selection
- **Files modified:** app-shell.test.tsx, layout.test.tsx, review page.test.tsx
- **Committed in:** 243a7e8 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed duplicate text matching in layout test**
- **Found during:** Task 1 (second test run)
- **Issue:** `getByText("Launchpad")` matched both sidebar nav link and PageHeader h1
- **Fix:** Used `getByRole('heading', { level: 1 })` for the page title assertion
- **Files modified:** layout.test.tsx
- **Committed in:** 243a7e8 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes were necessary for correct test assertions. No scope creep.

## Issues Encountered
None

## Known Stubs
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full Vitest suite passes for main project (0 FAIL lines)
- Worktree test failures are expected (stale copies of modified files)

---
*Phase: 33-browser-e2e-verification-for-redesigned-creation-flows*
*Completed: 2026-04-02*
