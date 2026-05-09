---
phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin
plan: 08
subsystem: worldgen
tags: [worldgen, prompt-contracts, structured-output, validation, vitest]

requires:
  - phase: 74-04
    provides: Worldgen prompt-contract helper patterns and source-rule authority language
  - phase: 74-07
    provides: Handcrafted worldgen scaffold prompt-contract pattern
provides:
  - Auxiliary worldgen prompt-contract helpers for seed, lore, starting location, premise divergence, premise refinement, and scaffold validation
  - Runtime prompt preambles for review-named P1 worldgen source gaps
  - Regression tests for marker placement, exact shape/caps/nullability/examples, source authority, and fail-closed validation behavior
affects: [phase-74, worldgen-auxiliary-prompts, prompt-contracts, model-facing-schema]

tech-stack:
  added: []
  patterns:
    - Handcrafted auxiliary prompt-contract helpers in `backend/src/worldgen/prompt-contracts.ts`
    - Contract preambles inserted before user, scaffold, source, and context data in model-facing prompts

key-files:
  created:
    - .planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/74-08-SUMMARY.md
  modified:
    - backend/src/worldgen/prompt-contracts.ts
    - backend/src/worldgen/seed-suggester.ts
    - backend/src/worldgen/lore-extractor.ts
    - backend/src/worldgen/starting-location.ts
    - backend/src/worldgen/premise-divergence.ts
    - backend/src/worldgen/scaffold-steps/premise-step.ts
    - backend/src/worldgen/scaffold-steps/validation.ts
    - backend/src/worldgen/__tests__/seed-suggester.test.ts
    - backend/src/worldgen/__tests__/lore-extractor.test.ts
    - backend/src/worldgen/__tests__/starting-location.test.ts
    - backend/src/worldgen/__tests__/premise-divergence.test.ts
    - backend/src/worldgen/__tests__/validation.test.ts
    - backend/src/worldgen/__tests__/pipeline-rework.test.ts

key-decisions:
  - "Kept auxiliary worldgen contract text centralized in prompt-contracts.ts instead of spreading standalone prose across call sites."
  - "Inserted contract preambles before premise/scaffold/source data so schema shape and source-authority rules frame the model request first."
  - "Wrapped validation prompts with scaffold-validation contract text without changing deterministic reference normalization or repair matching."

patterns-established:
  - "Auxiliary worldgen prompt contracts use versioned markers with required fields, caps, nullable rules, valid/minimal examples, invalid examples, and no-invention policy."
  - "Prompt tests assert marker placement before data, not only marker presence."

requirements-completed: [P74-R2, P74-R3, P74-R4, P74-R5]

duration: 15min
completed: 2026-04-28
---

# Phase 74 Plan 08: Auxiliary Worldgen P1 Source Coverage Contracts Summary

**Auxiliary worldgen prompts now carry versioned structured-output contracts for seed, lore, starting location, premise, and validation seams while preserving LLM semantic ownership and backend cap/shape authority.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-28T19:21:23Z
- **Completed:** 2026-04-28T19:36:00Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Added six handcrafted auxiliary contract helpers: `seed-suggestion.v1`, `lore-extraction.v1`, `starting-location.v1`, `premise-divergence.v1`, `premise-refinement.v1`, and `scaffold-validation.v1`.
- Inserted contract helpers into the real seed, lore, starting-location, premise-divergence, premise-refinement, and validation prompts before model-facing data.
- Added TDD coverage proving live prompt placement, exact structured fields, caps, nullability, examples, source authority, no-invention boundaries, and fail-closed validation behavior.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Add auxiliary helper failing tests** - `ff4acc5` (`test`)
2. **Task 1 GREEN: Add auxiliary contract helpers** - `1c78781` (`feat`)
3. **Task 2 RED: Add auxiliary prompt integration failing tests** - `8a0c864` (`test`)
4. **Task 2 GREEN: Apply auxiliary contracts to prompts** - `3fa7d4f` (`feat`)
5. **Task 3 RED: Add scaffold validation failing tests** - `03ec7d6` (`test`)
6. **Task 3 GREEN: Apply scaffold validation contract** - `443c5df` (`feat`)

_Note: All three plan tasks used the required TDD red/green split._

## Files Created/Modified

- `backend/src/worldgen/prompt-contracts.ts` - Added auxiliary worldgen contract helpers with markers, shapes, caps, examples, and source-authority/fail-closed language.
- `backend/src/worldgen/seed-suggester.ts` - Added seed suggestion contract preambles to sequential and single seed prompts.
- `backend/src/worldgen/lore-extractor.ts` - Added lore extraction contract preambles with category-specific allowed values and caps.
- `backend/src/worldgen/starting-location.ts` - Added starting-location contract before world premise and known-location data.
- `backend/src/worldgen/premise-divergence.ts` - Added premise-divergence contract before canon and premise data.
- `backend/src/worldgen/scaffold-steps/premise-step.ts` - Added premise-refinement contract before player concept/source data while preserving text fallback compatibility.
- `backend/src/worldgen/scaffold-steps/validation.ts` - Added scaffold-validation contract to per-stage and cross-stage validation prompts.
- `backend/src/worldgen/__tests__/seed-suggester.test.ts` - Added helper and live prompt assertions for seed contracts.
- `backend/src/worldgen/__tests__/lore-extractor.test.ts` - Added helper and live prompt assertions for lore contracts.
- `backend/src/worldgen/__tests__/starting-location.test.ts` - Added helper and live prompt assertions for starting-location contracts.
- `backend/src/worldgen/__tests__/premise-divergence.test.ts` - Added helper and live prompt assertions for premise divergence/refinement contracts.
- `backend/src/worldgen/__tests__/validation.test.ts` - Added helper/live prompt assertions and fail-closed unmatched-entity coverage.
- `backend/src/worldgen/__tests__/pipeline-rework.test.ts` - Added premise-refinement contract helper coverage for pipeline-rework scope.

## Decisions Made

- Centralized auxiliary contract snippets in `prompt-contracts.ts` because Phase 74 patterns prefer handcrafted reusable helpers over generic schema-to-contract generation.
- Placed every new contract before the relevant user, scaffold, source, or context data so malformed model responses are prevented at prompt time before repair.
- Preserved deterministic backend behavior: validation still normalizes references and only regenerates matched entities; it does not invent missing entities or canonical/source facts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Made semantic contract vocabulary explicitly searchable**
- **Found during:** Task 1 GREEN verification
- **Issue:** Initial helper text used uppercase phrases such as `Nullable/optional rules`, `No invented location`, and `Fail closed`, while the semantic tests checked lowercase policy terms.
- **Fix:** Added lowercase `nullable`, `no invented location`, and `fail closed` wording directly to the helper text.
- **Files modified:** `backend/src/worldgen/prompt-contracts.ts`
- **Verification:** Targeted auxiliary test suite passed after the wording fix.
- **Committed in:** `1c78781`

**2. [Rule 3 - Blocking] Used backend package-relative Vitest paths**
- **Found during:** Task verification
- **Issue:** Plan verification examples used `backend/src/...` paths even though `npm --prefix backend` runs Vitest from the backend package root.
- **Fix:** Ran the same targeted files with package-relative `src/worldgen/...` paths.
- **Files modified:** None
- **Verification:** `npm --prefix backend run test -- src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/lore-extractor.test.ts src/worldgen/__tests__/starting-location.test.ts src/worldgen/__tests__/premise-divergence.test.ts src/worldgen/__tests__/validation.test.ts src/worldgen/__tests__/pipeline-rework.test.ts`
- **Committed in:** N/A

**Total deviations:** 2 auto-fixed (1 implementation wording bug, 1 verification path issue)
**Impact on plan:** Both fixes preserved plan scope and strengthened the intended semantic contract checks.

## Issues Encountered

- GitNexus impact for `interpretPremiseDivergence` returned HIGH and staged Task 2 detect_changes returned CRITICAL because the prompt builder participates in seed and scaffold flows. The implementation was limited to contract preambles and targeted prompt tests covered the affected d=1 surfaces.
- GitNexus impact disambiguation for `resolveStartingLocation` selected the frontend API wrapper; `gitnexus_context` with `backend/src/worldgen/starting-location.ts` found the backend symbol and showed no indexed incoming processes.
- `npx gitnexus analyze` emitted repeated `MaxListenersExceededWarning` warnings after commits, but completed successfully and refreshed the index.

## Known Stubs

- `backend/src/worldgen/__tests__/pipeline-rework.test.ts:22` - Existing `it.todo` placeholders for per-entity detail and sequential accumulator coverage; not introduced by this plan and not runtime behavior.
- `backend/src/worldgen/__tests__/validation.test.ts:165` - Existing `it.todo` placeholders for broader validation-loop and judge-role coverage; this plan added concrete contract/fail-closed tests without expanding all deferred validation matrix items.

## Threat Flags

None. This plan changed model-facing prompt contracts and tests only; it introduced no new endpoint, auth path, file access pattern, persistence boundary, or schema trust boundary.

## Verification

- `npm --prefix backend run test -- src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/lore-extractor.test.ts src/worldgen/__tests__/starting-location.test.ts src/worldgen/__tests__/premise-divergence.test.ts src/worldgen/__tests__/validation.test.ts src/worldgen/__tests__/pipeline-rework.test.ts` - passed, 57 tests and 21 existing todos.
- `npm --prefix backend run typecheck` - passed.
- `rg -n "STRUCTURED_OUTPUT_CONTRACT: (seed-suggestion|lore-extraction|starting-location|premise-divergence|premise-refinement|scaffold-validation)\\.v1|build.*PromptContract" ...` - passed.
- `npx gitnexus status` - up to date at `443c5df`.
- GitNexus impact checks were run before implementation edits for seed, lore, starting-location, premise-divergence, premise-refinement, and validation symbols. GitNexus `detect_changes` was run before each task commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 74-09 can proceed with NPC offscreen and context-compression contracts using the same helper-based contract pattern and placement tests. Auxiliary worldgen P1 seams now have source-level owner coverage for the review-named gaps.

## Self-Check: PASSED

- Summary file exists.
- All thirteen plan-modified source/test files exist.
- Task commits found: `ff4acc5`, `1c78781`, `8a0c864`, `3fa7d4f`, `03ec7d6`, `443c5df`.

--- 
*Phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin*
*Completed: 2026-04-28*
