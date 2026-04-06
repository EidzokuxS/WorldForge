---
phase: 34-worldgen-pipeline-rework-1-entity-per-llm-call-with-inter-stage-validation
plan: 01
subsystem: worldgen
tags: [validation, llm, zod, progress, regen]

requires:
  - phase: 24-worldgen-known-ip-quality
    provides: plan+detail pattern, scaffold step modules, prompt-utils helpers
provides:
  - Extended GenerationProgress with two-tier sub-progress fields (subStep, subTotal, subLabel)
  - reportSubProgress helper for entity-level progress reporting
  - validationIssueSchema Zod schema for structured LLM validation
  - validateAndFixStage generic per-stage validation loop (3 rounds max)
  - validateCrossStage cross-stage validation with code normalization plus LLM semantic loop
  - normalizeReference code-only reference matching helper
  - regenerateLocationEntity, regenerateFactionEntity, regenerateNpcEntity regen helpers
  - Wave 0 test stubs for pipeline-rework, validation, lore-extractor, progress
affects: [34-02, 34-03, 34-04, scaffold-generator, locations-step, factions-step, npcs-step, lore-extractor]

tech-stack:
  added: []
  patterns: [bounded-validation-loop, name-safe-regen, current-round-state-params]

key-files:
  created:
    - backend/src/worldgen/scaffold-steps/validation.ts
    - backend/src/worldgen/scaffold-steps/regen-helpers.ts
    - backend/src/worldgen/__tests__/pipeline-rework.test.ts
    - backend/src/worldgen/__tests__/validation.test.ts
    - backend/src/worldgen/__tests__/lore-extractor-rework.test.ts
    - backend/src/worldgen/__tests__/progress.test.ts
  modified:
    - backend/src/worldgen/types.ts
    - backend/src/worldgen/scaffold-steps/prompt-utils.ts
    - frontend/lib/api-types.ts

key-decisions:
  - "Validation uses bounded 3-round loop for BOTH per-stage and cross-stage (D-03 fully implemented)"
  - "Regen helpers exclude name from schema to prevent LLM name drift (review fix #6)"
  - "Regen callbacks receive current-round entity arrays to avoid stale closure state (review fix #4)"
  - "Lore-extractor test stubs named lore-extractor-rework.test.ts to avoid overwriting existing test file"

patterns-established:
  - "bounded-validation-loop: validateAndFixStage runs up to MAX_VALIDATION_ROUNDS (3), stops early on clean"
  - "name-safe-regen: regen schemas exclude name field, caller forces planned name on result"
  - "current-round-state-params: regen helpers take explicit entity arrays instead of closing over outer scope"

requirements-completed: [D-03, D-04, D-07]

duration: 7min
completed: 2026-04-04
---

# Phase 34 Plan 01: Foundation Contracts Summary

**Validation module with bounded 3-round LLM loops, name-safe regen helpers, and two-tier progress types for the worldgen pipeline rework.**

## What Was Built

### GenerationProgress Extensions (D-07)
- Added optional `subStep`, `subTotal`, `subLabel` fields to backend `GenerationProgress` interface
- Added `judgeRole` to `GenerateScaffoldRequest` for validation passes
- Mirrored sub-progress fields in frontend `GenerationProgress` type
- Added `reportSubProgress` helper in prompt-utils.ts alongside existing `reportProgress`

### Validation Module (D-03, D-04)
- Created `validation.ts` with:
  - `validationIssueSchema`: Zod schema for structured validation results (8 issue types, 2 severities)
  - `validateAndFixStage<T>`: Generic per-stage loop, up to 3 rounds, Judge role, regen callback with current-round state
  - `validateCrossStage`: Phase 1 code normalization (references) + Phase 2 LLM semantic loop (3 rounds), regenerates NPCs and factions via callbacks
  - `normalizeReference`: Code-only case-insensitive reference matching

### Regen Helpers Module
- Created `regen-helpers.ts` with 3 entity regeneration functions:
  - `regenerateLocationEntity`: Rewrites description/tags/connectedTo, forces planned name
  - `regenerateFactionEntity`: Rewrites tags/goals/assets/territoryNames, forces planned name
  - `regenerateNpcEntity`: Rewrites persona/tags/goals (union+catch schema), preserves tier/location/faction/draft

### Wave 0 Test Stubs
- 4 test files with 29 todo stubs + 2 real progress tests
- Covers D-01 (per-entity detail), D-02 (sequential accumulator), D-03/D-04 (validation), D-06 (lore categories), D-07 (progress)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Lore-extractor test file name conflict**
- **Found during:** Task 0
- **Issue:** Plan specified `lore-extractor.test.ts` but that file already exists with real tests
- **Fix:** Named new test stubs `lore-extractor-rework.test.ts` to avoid overwriting
- **Files modified:** backend/src/worldgen/__tests__/lore-extractor-rework.test.ts

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 0 | 549bd91 | Wave 0 test stubs (4 files, 29 todos + 2 real) |
| 1 | 053deff | GenerationProgress extensions + reportSubProgress + judgeRole |
| 2 | 26d7227 | Validation module with bounded 3-round loops |
| 3 | 4597c39 | Regen-helpers module with 3 entity regeneration functions |

## Known Stubs

None. All modules are fully implemented with their contract signatures. Test stubs are intentionally `it.todo()` and will be filled as implementation proceeds in plans 34-02 through 34-04.
