---
phase: 31-prompt-system-harmonization-and-audit
plan: 01
subsystem: prompt-system
tags: [prompts, contracts, vitest, runtime]
requires:
  - phase: 30-start-conditions-canonical-loadouts-and-persona-templates
    provides: shared character/start-condition/loadout seams
provides:
  - shared prompt-contract constants for canonical character/start/loadout terminology
  - storyteller contract helper for runtime prompt families
affects: [runtime prompts, character prompts, worldgen prompts, support prompts]
tech-stack:
  added: []
  patterns: [shared prompt-contract anchors, TDD prompt regression coverage]
key-files:
  created:
    - backend/src/character/prompt-contract.ts
    - backend/src/engine/storyteller-contract.ts
    - backend/src/character/__tests__/prompt-contract.test.ts
    - backend/src/engine/__tests__/storyteller-contract.test.ts
  modified: []
key-decisions:
  - "Shared prompt vocabulary lives in dedicated helpers instead of being duplicated across prompt families."
  - "Storyteller-specific runtime rules are composed separately from shared character semantics."
patterns-established:
  - "Prompt families should import shared contract fragments instead of restating canonical field semantics."
requirements-completed: [P31-01, P31-06]
duration: 4 min
completed: 2026-04-01
---

# Phase 31 Plan 01: Shared Prompt Contract Anchors Summary

**Shared canonical character and storyteller contract helpers now anchor Phase 31 prompt rewrites with regression tests that catch stale instruction drift.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-01T16:51:49+03:00
- **Completed:** 2026-04-01T16:55:23+03:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added reusable prompt-contract constants for canonical character fields, start conditions, persona templates, loadouts, and derived runtime tags.
- Added a runtime storyteller contract helper that separates world rules, context rules, and tool-support rules.
- Locked both helpers with focused Vitest coverage so future prompt rewrites fail on stale or contradictory text.

## Task Commits

1. **Task 1: Build shared character prompt contract helpers** - `09c167f`, `76f8904`
2. **Task 2: Add runtime storyteller contract helper** - `fe7588f`, `bc6bb3f`

## Files Created/Modified
- `backend/src/character/prompt-contract.ts` - shared canonical prompt vocabulary and builder
- `backend/src/engine/storyteller-contract.ts` - storyteller runtime contract composition
- `backend/src/character/__tests__/prompt-contract.test.ts` - regression coverage for shared character rules
- `backend/src/engine/__tests__/storyteller-contract.test.ts` - regression coverage for runtime storyteller contract composition

## Decisions Made

- Centralized Phase 31 terminology into importable helpers rather than one more static prompt block.
- Kept storyteller runtime guidance separate from shared character semantics so support prompts can reuse only the pieces they need.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Shared prompt anchors are available for runtime, character, worldgen, and support prompt audits.

## Verification

- `npm --prefix backend exec vitest run src/character/__tests__/prompt-contract.test.ts`
- `npm --prefix backend exec vitest run src/engine/__tests__/storyteller-contract.test.ts`

## Self-Check

PASSED - summary file exists and all referenced task commits were found in git history.

---
*Phase: 31-prompt-system-harmonization-and-audit*
*Completed: 2026-04-01*
