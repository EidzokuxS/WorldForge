---
phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin
plan: 06
subsystem: worldbook-generation
tags: [structured-output, prompts, worldbook, importer, backfill-personality, vitest]

requires:
  - phase: 74-01
    provides: locked structured prompt audit and marker-testing pattern
provides:
  - marker-tested worldbook composition contracts for primary-source and relevant-entry model calls
  - marker-tested worldbook import classification contract with source-authority and cap language
  - supported operational script contract for backfill-personality structured output
affects: [phase-74, worldbook-composition, worldbook-import, scripts, personality-backfill]

tech-stack:
  added: []
  patterns:
    - versioned structured prompt markers colocated with narrow prompt builders
    - TDD RED/GREEN commits for P2 prompt-contract seams
    - script-local contract snippet for supported operational model calls

key-files:
  created:
    - .planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/74-06-SUMMARY.md
  modified:
    - backend/src/worldbook-library/composition.ts
    - backend/src/worldgen/worldbook-importer.ts
    - backend/src/scripts/backfill-personality.ts
    - backend/src/worldgen/__tests__/worldbook-composition.test.ts
    - backend/src/worldgen/__tests__/worldbook-importer.test.ts
    - backend/src/scripts/__tests__/backfill-personality.test.ts

key-decisions:
  - "Worldbook prompt contracts are colocated in the composition and importer modules while validators remain final authority."
  - "The backfill-personality operational script is treated as a supported structured-output seam, not a non-production exclusion."
  - "Verification used backend package-relative Vitest filters because `npm --prefix backend` runs commands from the backend package root."

patterns-established:
  - "Worldbook model calls emit `STRUCTURED_OUTPUT_CONTRACT: worldbook-composition.v1` or `STRUCTURED_OUTPUT_CONTRACT: worldbook-import.v1` before asking for structured output."
  - "Supported script model calls emit `STRUCTURED_OUTPUT_CONTRACT: backfill-personality.v1` plus exact field, minimal valid, and invalid examples."
  - "Contracts state source text is authority and backend validators/scripts may reject, retry, re-read, or skip rather than invent unsupported facts."

requirements-completed: [P74-R2, P74-R3, P74-R4, P74-R5]

duration: 9min
completed: 2026-04-28
---

# Phase 74 Plan 06: Worldbook, Import, and Script Prompt Contracts Summary

**Worldbook composition, worldbook import, and backfill-personality script prompts now publish versioned structured-output contracts with marker-tested authority, cap, valid-example, and invalid-example language.**

## Performance

- **Duration:** 9 min measured from executor start through final verification.
- **Started:** 2026-04-28T18:29:01Z
- **Completed:** 2026-04-28T18:37:25Z
- **Tasks:** 2
- **Files modified:** 6 source/test files plus this summary

## Accomplishments

- Added worldbook composition contract coverage for primary-source detection and relevant-entry filtering without changing validator ownership.
- Added worldbook importer contract coverage for exact classification payload shape, entry caps, source-authority boundaries, minimal valid output, and invalid examples.
- Added a script-local `backfill-personality.v1` contract to the supported operational backfill seam while preserving dry-run, retry, backup, and re-read-before-write behavior.
- Added TDD regression tests that fail if the P2 prompt seams lose markers, exact shapes, examples, caps, or no-invention language.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add failing worldbook prompt contract tests** - `df8150d` (test)
2. **Task 1 GREEN: Add worldbook prompt contracts** - `59a613d` (feat)
3. **Task 2 RED: Add failing backfill prompt contract test** - `741bebc` (test)
4. **Task 2 GREEN: Add backfill personality prompt contract** - `c93503e` (feat)

**Plan metadata:** committed separately after self-check.

## Files Created/Modified

- `backend/src/worldbook-library/composition.ts` - Adds `worldbook-composition.v1` contract snippets for primary-source and relevant-entry prompts.
- `backend/src/worldgen/worldbook-importer.ts` - Adds `worldbook-import.v1` contract snippet to the classification prompt.
- `backend/src/scripts/backfill-personality.ts` - Adds `backfill-personality.v1` contract snippet to the operational script prompt.
- `backend/src/worldgen/__tests__/worldbook-composition.test.ts` - Covers composition prompt markers, exact shapes, examples, caps, and source-authority language.
- `backend/src/worldgen/__tests__/worldbook-importer.test.ts` - Covers importer prompt marker and classification contract language.
- `backend/src/scripts/__tests__/backfill-personality.test.ts` - Covers script prompt marker, personality fields, examples, source authority, and existing safety behavior.

## Decisions Made

- Kept worldbook contracts local to the worldbook modules because the contracts are small and tied to local model-call payload shapes.
- Kept the backfill script contract local instead of importing character prompt helpers, avoiding unnecessary coupling from an operational script into character generation helpers.
- Preserved deterministic enforcement boundaries: prompts describe the expected output, while existing schemas, normalizers, dry-run paths, retry handling, and re-read checks remain the actual guardrails.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adjusted backend test paths for `--prefix backend`**
- **Found during:** Task verification and final verification
- **Issue:** The plan's verification commands used `backend/src/...` paths while also running with `npm --prefix backend`, which would point Vitest at the wrong package-relative path.
- **Fix:** Ran the equivalent package-relative paths under the backend package: `src/worldgen/...` and `src/scripts/...`.
- **Files modified:** None
- **Verification:** Targeted Vitest suite passed with 3 files and 38 tests.
- **Committed in:** Not applicable, verification-only adjustment.

**2. [Rule 1 - Bug] Tightened worldbook filter contract language to match acceptance expectations**
- **Found during:** Task 1 GREEN verification
- **Issue:** The initial relevant-entry contract wording had the intended no-invention rule but did not include the exact source-authority phrase covered by the failing regression.
- **Fix:** Adjusted the filter contract language to explicitly say not to add lore absent from the numbered entries.
- **Files modified:** `backend/src/worldbook-library/composition.ts`
- **Verification:** Worldbook composition and importer tests passed.
- **Committed in:** `59a613d`

---

**Total deviations:** 2 auto-fixed (1 blocking verification-path adjustment, 1 contract-language bug)
**Impact on plan:** No scope expansion; both changes were necessary to satisfy the planned acceptance criteria.

## Issues Encountered

- `npx gitnexus analyze` completed after code commits with repeated Node `MaxListenersExceededWarning` warnings, but the repository indexed successfully.

## TDD Gate Compliance

- RED gate present for Task 1: `df8150d`
- GREEN gate present for Task 1: `59a613d`
- RED gate present for Task 2: `741bebc`
- GREEN gate present for Task 2: `c93503e`

## Verification

- `npm --prefix backend run test -- src/worldgen/__tests__/worldbook-composition.test.ts src/worldgen/__tests__/worldbook-importer.test.ts` - passed, 2 files / 21 tests.
- `npm --prefix backend run test -- src/scripts/__tests__/backfill-personality.test.ts` - passed, 1 file / 17 tests.
- `npm --prefix backend run test -- src/worldgen/__tests__/worldbook-composition.test.ts src/worldgen/__tests__/worldbook-importer.test.ts src/scripts/__tests__/backfill-personality.test.ts` - passed, 3 files / 38 tests.
- `npm --prefix backend run typecheck` - passed.
- GitNexus impact analysis was run before modifying all planned symbols; all reported LOW risk for this plan.
- `gitnexus_detect_changes` was run before each task commit and matched expected source/test scope.
- `npx gitnexus analyze` - passed after each code commit; index refreshed at `c93503e`.

## Known Stubs

None. Stub scan found only normal empty-array/object/null initializers in helpers and tests, not user-facing placeholders or disconnected data.

## Threat Flags

None. The plan changed prompt text and tests only; it added no network endpoints, auth paths, new file access behavior, or schema trust boundaries beyond the planned model-output prompt boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 74-06 is ready for downstream Phase 74 work. Worldbook/import/script P2 seams now have marker-tested contracts, while later plans can continue hardening unrelated worldgen scaffold surfaces without inheriting implicit script exceptions.

## Self-Check: PASSED

- Created summary file exists.
- Modified production and test files exist.
- Task commits found: `df8150d`, `59a613d`, `741bebc`, `c93503e`.
- No accidental tracked-file deletions detected in task commits.

---

*Phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin*
*Completed: 2026-04-28*
