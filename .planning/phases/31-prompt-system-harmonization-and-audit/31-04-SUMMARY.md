---
phase: 31-prompt-system-harmonization-and-audit
plan: 04
subsystem: prompt-system
tags: [worldgen, start-conditions, npc, vitest]
requires:
  - phase: 30-start-conditions-canonical-loadouts-and-persona-templates
    provides: canonical startConditions and worldgen NPC seams
provides:
  - start-state prompts centered on authoritative startConditions
  - worldgen NPC detail prompts aligned to canonical draft vocabulary
affects: [starting location resolution, worldgen npc detailing]
tech-stack:
  added: []
  patterns: [startConditions-first wording, worldgen prompt reuse of character contract]
key-files:
  created: []
  modified:
    - backend/src/worldgen/starting-location.ts
    - backend/src/worldgen/scaffold-steps/npcs-step.ts
    - backend/src/worldgen/__tests__/starting-location.test.ts
    - backend/src/worldgen/__tests__/npcs-step.test.ts
key-decisions:
  - "startConditions remains authoritative even when compatibility aliases like locationName remain in output."
  - "Worldgen NPC detail prompts should reuse shared character contract language instead of a separate card-writing dialect."
patterns-established:
  - "Compatibility aliases may exist, but prompts must name canonical authority first."
requirements-completed: [P31-04, P31-05, P31-06]
duration: 2 min
completed: 2026-04-01
---

# Phase 31 Plan 04: Start-State And Worldgen NPC Harmonization Summary

**Starting-location and worldgen-NPC prompts now resolve authoritative `startConditions` and canonical draft fields before any compatibility aliases.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-01T17:09:01+03:00
- **Completed:** 2026-04-01T17:11:16+03:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Reworked start resolution prompts so `startConditions` is the primary contract instead of a flat location label.
- Reworked worldgen NPC detail prompts to reuse the shared character contract vocabulary.
- Added regressions for both prompt seams to catch stale compatibility-first wording.

## Task Commits

1. **Task 1: Align start resolution to structured startConditions** - `fc99cba`, `117ee20`
2. **Task 2: Align worldgen NPC detail prompts to shared contract** - `3b19e54`, `fd66257`

## Files Created/Modified
- `backend/src/worldgen/starting-location.ts` - start resolution prompt now treats `startConditions` as authoritative
- `backend/src/worldgen/scaffold-steps/npcs-step.ts` - NPC detail prompt now uses canonical draft terminology
- `backend/src/worldgen/__tests__/starting-location.test.ts` - startConditions prompt regressions
- `backend/src/worldgen/__tests__/npcs-step.test.ts` - worldgen NPC prompt regressions

## Decisions Made

- Start-state prompt authority belongs to `startConditions`, not to compatibility output aliases.
- Shared character vocabulary now applies in worldgen detail prompts as well as runtime and creation prompts.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Worldgen prompts now share the same canonical start and character terminology expected by the helper and support audits.

## Verification

- `npm --prefix backend exec vitest run src/worldgen/__tests__/starting-location.test.ts`
- `npm --prefix backend exec vitest run src/worldgen/__tests__/npcs-step.test.ts`

## Self-Check

PASSED - summary file exists and all referenced task commits were found in git history.

---
*Phase: 31-prompt-system-harmonization-and-audit*
*Completed: 2026-04-01*
