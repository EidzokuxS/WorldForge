---
phase: 31-prompt-system-harmonization-and-audit
plan: 07
subsystem: prompt-system
tags: [oracle, world-engine, support-prompts, vitest]
requires:
  - phase: 31-prompt-system-harmonization-and-audit
    provides: harmonized support-prompt vocabulary
provides:
  - deterministic Oracle wording aligned to evidence-only support-prompt semantics
  - world-engine macro prompt wording aligned to chronicle-backed world-state vocabulary
affects: [oracle, world engine, faction simulation]
tech-stack:
  added: []
  patterns: [evidence-only deterministic prompts, chronicle-backed macro-context prompts]
key-files:
  created: []
  modified:
    - backend/src/engine/oracle.ts
    - backend/src/engine/world-engine.ts
    - backend/src/engine/__tests__/oracle.test.ts
    - backend/src/engine/__tests__/world-engine.test.ts
key-decisions:
  - "Oracle prompt alignment must stay additive and never loosen deterministic calibration behavior."
  - "World-engine prompt alignment should speak in canonical world-state terms without inheriting narration or character-system instructions."
patterns-established:
  - "Support prompt audits should add targeted anti-drift assertions rather than broad integration rewrites."
requirements-completed: [P31-05, P31-06]
duration: 1 min
completed: 2026-04-01
---

# Phase 31 Plan 07: Oracle And World-Engine Support Audit Summary

**Oracle and faction-engine prompts now use harmonized evidence/world-state language while preserving deterministic calibration and concrete macro-action semantics.**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-01T17:22:52+03:00
- **Completed:** 2026-04-01T17:23:56+03:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Tightened Oracle prompt wording so it explicitly uses only provided evidence snapshots and rejects narration/world-simulation drift.
- Tightened faction macro prompt wording so it references chronicle-backed world state as canonical macro context.
- Added focused support-prompt audit tests for both seams.

## Task Commits

1. **Task 1: Audit the Oracle prompt without changing its deterministic contract** - `3213dfc`, `25078fd`
2. **Task 2: Audit faction/world-engine prompts for coherent shared vocabulary** - `3213dfc`, `25078fd`

## Files Created/Modified
- `backend/src/engine/oracle.ts` - deterministic Oracle prompt wording refined to evidence-only scope
- `backend/src/engine/world-engine.ts` - faction prompt wording refined to chronicle-backed macro context
- `backend/src/engine/__tests__/oracle.test.ts` - deterministic Oracle anti-drift regressions
- `backend/src/engine/__tests__/world-engine.test.ts` - faction macro prompt anti-drift regressions

## Decisions Made

- Oracle stays strictly scoped to judging probability and must not inherit runtime narration language.
- World-engine prompts keep macro-simulation semantics and use chronicle-backed world-state wording rather than generic worldview prose.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Oracle tests were updated to match the real `safeGenerateObject -> generateText` execution path before the new prompt assertions were added.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Phase 31 prompt harmonization is complete; Phase 32 can build on the stabilized prompt contract without revisiting support-family wording.

## Verification

- `npm --prefix backend exec vitest run src/engine/__tests__/oracle.test.ts`
- `npm --prefix backend exec vitest run src/engine/__tests__/world-engine.test.ts`

## Self-Check

PASSED - summary file exists and all referenced task commits were found in git history.

---
*Phase: 31-prompt-system-harmonization-and-audit*
*Completed: 2026-04-01*
