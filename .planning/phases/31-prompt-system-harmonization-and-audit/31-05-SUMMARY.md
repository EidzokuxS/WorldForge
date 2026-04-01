---
phase: 31-prompt-system-harmonization-and-audit
plan: 05
subsystem: prompt-system
tags: [worldgen, lore, seeds, divergence, vitest]
requires:
  - phase: 31-prompt-system-harmonization-and-audit
    provides: canonical character and start-condition vocabulary
provides:
  - reusable worldgen guardrail for canonical character and start-state wording
  - seed and lore prompts aligned to canon/divergence preservation rules
affects: [worldgen seed suggestions, lore extraction]
tech-stack:
  added: []
  patterns: [shared worldgen guardrail injection, canon/divergence preservation]
key-files:
  created: []
  modified:
    - backend/src/worldgen/scaffold-steps/prompt-utils.ts
    - backend/src/worldgen/seed-suggester.ts
    - backend/src/worldgen/lore-extractor.ts
    - backend/src/worldgen/__tests__/seed-suggester.test.ts
    - backend/src/worldgen/__tests__/lore-extractor.test.ts
key-decisions:
  - "Worldgen prompts should reuse one guardrail for canonical character fields and start conditions."
  - "Lore extraction must preserve canon/divergence intent without reintroducing tag-only worldview text."
patterns-established:
  - "Prompt-utils owns worldgen-wide canonical guardrails so seed and lore prompts cannot drift independently."
requirements-completed: [P31-05, P31-06]
duration: 3 min
completed: 2026-04-01
---

# Phase 31 Plan 05: Worldgen Guardrail Audit Summary

**Seed suggestion and lore extraction prompts now share one canonical worldgen guardrail that preserves authored character/start-state semantics and canon-divergence intent.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T17:12:40+03:00
- **Completed:** 2026-04-01T17:15:34+03:00
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added a reusable worldgen prompt guardrail for canonical character fields, `startConditions`, and derived-tag compatibility language.
- Injected that guardrail into seed-suggester prompts.
- Injected the same guardrail into lore extraction prompts and locked it with regressions.

## Task Commits

1. **Task 1: Add worldgen character guardrails to seed prompts** - `8ec2432`, `b39eff6`
2. **Task 2: Add lore extraction prompt guardrails** - `e51ac86`, `704d25c`

## Files Created/Modified
- `backend/src/worldgen/scaffold-steps/prompt-utils.ts` - shared worldgen canonical guardrail helper
- `backend/src/worldgen/seed-suggester.ts` - seed prompts now inject canonical guardrail text
- `backend/src/worldgen/lore-extractor.ts` - lore extraction prompt now injects canonical guardrail text
- `backend/src/worldgen/__tests__/seed-suggester.test.ts` - seed prompt guardrail regressions
- `backend/src/worldgen/__tests__/lore-extractor.test.ts` - lore prompt guardrail regressions

## Decisions Made

- One guardrail function is less error-prone than trying to hand-sync worldgen prompt wording across multiple files.
- Canonical character/start-state wording belongs in seed and lore generation because both surfaces influence later world interpretation.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Worldgen helper seams now expose a single canonical prompt baseline for NPC-agent, reflection, Oracle, and world-engine audits.

## Verification

- `npm --prefix backend exec vitest run src/worldgen/__tests__/seed-suggester.test.ts`
- `npm --prefix backend exec vitest run src/worldgen/__tests__/lore-extractor.test.ts`

## Self-Check

PASSED - summary file exists and all referenced task commits were found in git history.

---
*Phase: 31-prompt-system-harmonization-and-audit*
*Completed: 2026-04-01*
