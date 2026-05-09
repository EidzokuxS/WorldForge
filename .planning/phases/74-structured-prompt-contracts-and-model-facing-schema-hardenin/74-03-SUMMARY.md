---
phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin
plan: 03
subsystem: ai
tags: [structured-output, prompt-contracts, gameplay-classifiers, world-brain, oracle, target-context, movement]

requires:
  - phase: 74-02
    provides: reusable engine prompt-contract helper pattern and runtime-tool contract conventions
  - phase: 73-structured-output-stability-and-provider-conformance
    provides: safeGenerateObject structured-output boundary and provider fallback behavior
provides:
  - P0 gameplay prompt-contract helpers for world-brain, oracle, target context, and movement detection
  - Versioned model-facing contracts applied before world-brain scene data and lightweight classifier data
  - Regression tests for exact shapes, caps, enum/nullability rules, valid/minimal outputs, invalid examples, and backend authority language
affects:
  - phase-74-contract-implementation
  - backend-ai-tests
  - gameplay-prompt-boundaries

tech-stack:
  added: []
  patterns:
    - P0 gameplay contracts live in backend/src/engine/prompt-contracts.ts and are imported by prompt builders
    - Structured-output contracts are inserted before raw scene/classifier data
    - Backend schemas, Oracle roll/outcome logic, target hydration, and movement execution remain final authority

key-files:
  created:
    - .planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/74-03-SUMMARY.md
  modified:
    - backend/src/engine/prompt-contracts.ts
    - backend/src/engine/world-brain.ts
    - backend/src/engine/oracle.ts
    - backend/src/engine/target-context.ts
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/__tests__/world-brain.test.ts
    - backend/src/engine/__tests__/oracle.test.ts
    - backend/src/engine/__tests__/target-context.test.ts
    - backend/src/engine/__tests__/turn-processor.test.ts

key-decisions:
  - "P0 gameplay classifier contracts share the engine prompt-contract helper rather than duplicating per-prompt marker text."
  - "Model calls receive exact shape/cap/nullability examples, but backend validation and mechanics remain authoritative."
  - "Verification used backend package-relative Vitest filters because `npm --prefix backend` runs commands from the backend package root."

patterns-established:
  - "World-brain, Oracle, target-context, and movement prompt tests assert semantic contract adequacy, not marker presence alone."
  - "Classifier contracts include both minimal valid output and invalid/no-invention examples near the model call."
  - "Oracle probability output is explicitly separated from backend-owned d100 rolls and outcome tier resolution."

requirements-completed: [P74-R2, P74-R3, P74-R4, P74-R5]

duration: 13 min
completed: 2026-04-28
---

# Phase 74 Plan 03: P0 Gameplay Prompt Contracts Summary

**World-brain, Oracle, target-context, and movement model calls now publish exact structured-output contracts while preserving backend-owned gameplay authority.**

## Performance

- **Duration:** 13 min measured from executor start through final verification.
- **Started:** 2026-04-28T18:44:08Z
- **Completed:** 2026-04-28T18:56:53Z
- **Tasks:** 3
- **Files modified:** 9 source/test files plus this summary

## Accomplishments

- Added `world-brain.v1`, `oracle.v1`, `target-context.v1`, and `movement-detection.v1` helper exports to `backend/src/engine/prompt-contracts.ts`.
- Inserted the world-brain contract before scene/world data without changing strict validation, sanitization, or repair behavior.
- Inserted Oracle, target-context, and movement classifier contracts before model-facing classifier data while preserving backend-owned rolls/outcomes, target resolution, and movement execution.
- Added TDD regression coverage that locks field names, caps, enum/nullability rules, examples, invalid cases, and no-invention authority language.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add failing tests for gameplay prompt contracts** - `a10df48` (test)
2. **Task 1 GREEN: Add gameplay prompt contract helpers** - `2bf030e` (feat)
3. **Task 2 RED: Add failing world-brain prompt contract test** - `40c328c` (test)
4. **Task 2 GREEN: Apply world-brain prompt contract** - `120edca` (feat)
5. **Task 3 RED: Add failing gameplay prompt integration tests** - `8b82fca` (test)
6. **Task 3 GREEN: Apply gameplay classifier prompt contracts** - `9804dca` (feat)

**Plan metadata:** committed separately after self-check.

_Note: TDD tasks intentionally have RED test commits followed by GREEN feature commits._

## Files Created/Modified

- `backend/src/engine/prompt-contracts.ts` - Adds deterministic P0 gameplay contract helpers for world-brain, Oracle, target-context, and movement detection.
- `backend/src/engine/world-brain.ts` - Prepends the `world-brain.v1` contract to the world-brain prompt before scene data.
- `backend/src/engine/oracle.ts` - Adds the `oracle.v1` contract to the Oracle system prompt while keeping roll/outcome mechanics backend-owned.
- `backend/src/engine/target-context.ts` - Prepends the `target-context.v1` contract to classifier prompt data.
- `backend/src/engine/turn-processor.ts` - Prepends the `movement-detection.v1` contract to movement classifier prompt data.
- `backend/src/engine/__tests__/world-brain.test.ts` - Covers helper semantics and actual world-brain prompt insertion.
- `backend/src/engine/__tests__/oracle.test.ts` - Covers Oracle contract helper semantics and system-prompt insertion.
- `backend/src/engine/__tests__/target-context.test.ts` - Covers target contract helper semantics and classifier-prompt insertion.
- `backend/src/engine/__tests__/turn-processor.test.ts` - Covers movement contract helper semantics and classifier-prompt insertion.

## Decisions Made

- Kept the new P0 gameplay helpers in the existing engine prompt-contract module from 74-02, avoiding drift between adjacent gameplay contracts.
- Kept contract helpers as pure text builders. Zod schemas, sanitizers, repair passes, target hydration, movement graph checks, and Oracle roll/outcome resolution remain the enforcement layer.
- Used package-relative Vitest filters under `npm --prefix backend`; this matches the backend package root while preserving the plan's intended test selection.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adjusted backend test paths for `--prefix backend`**
- **Found during:** Task verification and final verification
- **Issue:** The plan's verification commands used `backend/src/...` paths while also running with `npm --prefix backend`, which makes Vitest resolve paths from `backend/`.
- **Fix:** Ran the equivalent package-relative filters under the backend package: `src/engine/__tests__/...`.
- **Files modified:** None
- **Verification:** Targeted Vitest suites passed with 4 files and 95 tests.
- **Committed in:** Not applicable, verification-only adjustment.

---

**Total deviations:** 1 auto-fixed (1 blocking verification-path adjustment)
**Impact on plan:** No scope expansion; this only made the planned verification commands address the intended test files.

## Issues Encountered

- GitNexus did not index new helper names before Task 1 GREEN because they did not exist yet; this was expected and documented in the task flow.
- GitNexus did not expose `worldBrainSceneDirectionSchema` as a standalone impact target during Task 2 pre-edit checks. Function-level checks for edited world-brain symbols were LOW risk.
- `npx gitnexus analyze` completed after commits with repeated Node `MaxListenersExceededWarning` warnings, but the repository indexed successfully each time.

## TDD Gate Compliance

- RED gate present for Task 1: `a10df48`
- GREEN gate present for Task 1: `2bf030e`
- RED gate present for Task 2: `40c328c`
- GREEN gate present for Task 2: `120edca`
- RED gate present for Task 3: `8b82fca`
- GREEN gate present for Task 3: `9804dca`

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/world-brain.test.ts src/engine/__tests__/oracle.test.ts src/engine/__tests__/target-context.test.ts src/engine/__tests__/turn-processor.test.ts` - passed, 4 files / 95 tests.
- `npm --prefix backend run typecheck` - passed.
- GitNexus impact analysis was run before modifying planned source symbols. Relevant edits reported LOW risk; no HIGH or CRITICAL warnings were ignored.
- `gitnexus_detect_changes` was run before each task commit and matched expected source/test scope.
- `npx gitnexus analyze` - passed after each code commit; index refreshed at `9804dca`.

## Known Stubs

None. Stub scan found only normal empty-array/object/null initializers in existing engine helpers and tests, not user-facing placeholders or disconnected data.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 74-03 completes the remaining P0 gameplay prompt-contract seams. Downstream Phase 74 work can rely on marker-tested model-facing contracts for the core gameplay classifiers while backend mechanical authority remains intact.

## Self-Check: PASSED

- Created summary file exists.
- Modified production and test files exist.
- Task commits found: `a10df48`, `2bf030e`, `40c328c`, `120edca`, `8b82fca`, `9804dca`.
- No accidental tracked-file deletions detected in task commits.

---

*Phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin*
*Completed: 2026-04-28*
