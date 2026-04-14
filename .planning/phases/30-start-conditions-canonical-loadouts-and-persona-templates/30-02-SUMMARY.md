---
phase: 30-start-conditions-canonical-loadouts-and-persona-templates
plan: 02
subsystem: api
tags: [character, start-conditions, loadout, prompt-assembler]
requires:
  - phase: 30-start-conditions-canonical-loadouts-and-persona-templates
    provides: shared phase 30 contracts and helper seams
provides:
  - structured start-condition resolution route behavior
  - backend preview endpoint for canonical loadout derivation
  - save-time starting item materialization and prompt visibility updates
affects: [30-04, 30-05]
tech-stack:
  added: []
  patterns: [startConditions as persisted authority, owned-items fallback to canonical loadout snapshot]
key-files:
  created: []
  modified:
    - backend/src/worldgen/starting-location.ts
    - backend/src/routes/character.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/worldgen/__tests__/starting-location.test.ts
    - backend/src/routes/__tests__/character.test.ts
key-decisions:
  - "The compatibility route still returns legacy location aliases, but the canonical payload is now `startConditions`."
  - "Save flow derives one canonical loadout preview and uses it for both player persistence and starting items."
patterns-established:
  - "Resolve start state once, then bridge it into socialContext and prompt readers."
requirements-completed: [P30-01, P30-02, P30-03, P30-05, P30-06]
duration: 18min
completed: 2026-04-01
---

# Phase 30 Plan 02: Summary

**Structured start-condition resolution, backend-owned loadout preview, and save-time starting item materialization were implemented in the worktree without full regression execution.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-01T11:16:17Z
- **Completed:** 2026-04-01T11:34:07Z
- **Tasks:** 2 partially verified in worktree
- **Files modified:** 5

## Accomplishments
- Replaced the old location-only start resolver with a structured start-condition result.
- Added `/api/worldgen/preview-loadout` as the backend-owned canonical loadout preview seam.
- Wired save-time item creation and prompt formatting to canonical loadout/start data.

## Task Commits

None. Git commit creation is blocked by `.git/index.lock` permission denial.

## Decisions Made

- Kept the external start-resolution route additive by preserving `locationId`, `locationName`, and `narrative`.

## Deviations from Plan

None in implementation intent. Verification was limited to typecheck/lint because Vitest cannot run in this sandbox.

## Issues Encountered

- Backend typecheck still reports pre-existing Phase 29 test breakage in `backend/src/character/__tests__/generator.test.ts` and `backend/src/character/__tests__/npc-generator.test.ts`.

## User Setup Required

None.

## Next Phase Readiness

- Frontend API and editor wiring can now call the new preview and structured start routes.
- Final plan closure still needs unrestricted regression execution plus working Git writes.

## Self-Check: PASSED

