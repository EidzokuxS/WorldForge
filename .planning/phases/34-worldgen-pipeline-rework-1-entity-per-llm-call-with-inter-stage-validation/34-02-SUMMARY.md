---
phase: 34-worldgen-pipeline-rework-1-entity-per-llm-call-with-inter-stage-validation
plan: 02
subsystem: worldgen
tags: [per-entity, accumulator, locations, factions, progress, name-forcing]

requires:
  - phase: 34-worldgen-pipeline-rework-1-entity-per-llm-call-with-inter-stage-validation
    plan: 01
    provides: GenerationProgress sub-progress fields, reportSubProgress helper
provides:
  - Per-entity location detail generation with sequential accumulator and sub-progress
  - Per-entity faction detail generation with sequential accumulator and sub-progress
  - Name-forced detail schemas (no name field in LLM output)
  - Full canonical name lists in all detail prompts (D-05)
affects: [scaffold-generator, worldgen routes, regenerate-section]

tech-stack:
  added: []
  patterns: [per-entity-accumulator, name-forcing-schema, case-insensitive-reference-filter]

key-files:
  created: []
  modified:
    - backend/src/worldgen/scaffold-steps/locations-step.ts
    - backend/src/worldgen/scaffold-steps/factions-step.ts
    - backend/src/worldgen/__tests__/scaffold-resilience.test.ts

key-decisions:
  - "Per-entity detail calls replace batch calls for both locations and factions (D-01)"
  - "Each detail call receives full detail of ALL previously generated entities in the same stage (D-02)"
  - "Detail schemas exclude name field entirely -- planned name forced as authoritative (review fix #6)"
  - "ALL canonical entity names included in every detail prompt via nameList (D-05 review fix #3)"
  - "connectedTo filter uses case-insensitive comparison and prevents self-links"
  - "territoryNames filter uses case-insensitive comparison for location matching"
  - "Function signatures remain backward-compatible with optional onProgress, progressStep, progressTotalSteps"

requirements-completed: [D-01, D-02, D-05]

duration: 6min
completed: 2026-04-04
---

# Phase 34 Plan 02: Per-Entity Detail Calls for Locations and Factions Summary

**Refactored locations-step.ts and factions-step.ts from batch detail calls to per-entity sequential calls with full accumulator context, canonical name lists, and name forcing.**

## What Was Built

### Locations Step Refactor (D-01, D-02, D-05)
- Replaced batch detail loop (`BATCH_SIZE=4`, `i += BATCH_SIZE`) with per-entity sequential loop (`for i = 0 to planned.length`)
- Created `locationDetailSingleSchema` without `name` field -- planned name is authoritative (review fix #6)
- Each detail call receives `ALREADY DETAILED LOCATIONS` block with full description, tags, and connectedTo of all previously generated locations
- Every detail prompt includes `ALL LOCATIONS IN THIS WORLD: ${nameList}` for canonical name awareness (D-05)
- `connectedTo` filter upgraded to case-insensitive comparison and self-link prevention
- Added `reportSubProgress` calls for entity-level progress reporting (`Location: ${name}`)
- Backward-compatible signature: `onProgress`, `progressStep`, `progressTotalSteps` are all optional trailing params

### Factions Step Refactor (D-01, D-02, D-05)
- Replaced single batch detail call with per-entity sequential loop
- Created `factionDetailSingleSchema` without `name` field (review fix #6)
- Removed old `factionDetailSchema` (batch array schema)
- Each detail call receives `ALREADY DETAILED FACTIONS` block with goals, assets, territory, and tags of all previously generated factions
- Every detail prompt includes `ALL FACTIONS IN THIS WORLD: ${planned names}` for canonical awareness (D-05)
- `territoryNames` filter upgraded to case-insensitive comparison
- Added `reportSubProgress` calls for entity-level progress (`Faction: ${name}`)
- Backward-compatible signature matching locations step pattern

### Test Updates
- Updated 4 scaffold-resilience test mocks from batch schema format to single-entity schema format
- Location tests now provide separate mock calls per entity (2 calls for 2 locations)
- Faction tests provide 1 mock call per entity
- All scaffold-resilience tests pass

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Scaffold-resilience tests used old batch mock format**
- **Found during:** Verification after Task 2
- **Issue:** Existing tests mocked generateObject to return `{locations: [...]}` / `{factions: [...]}` batch format, but refactored code expects single-entity format `{description, tags, connectedTo}` / `{tags, goals, assets, territoryNames}`
- **Fix:** Updated all 4 affected test mocks to return single-entity schema and added separate mock calls per entity
- **Files modified:** backend/src/worldgen/__tests__/scaffold-resilience.test.ts
- **Commit:** b74e0b9

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 6308bc2 | Refactor locations-step to per-entity detail calls with accumulator |
| 2 | f3138e9 | Refactor factions-step to per-entity detail calls with accumulator |
| fix | b74e0b9 | Update scaffold-resilience tests for per-entity detail schema |

## Known Stubs

None. Both step functions are fully implemented with per-entity detail calls, accumulator context, canonical name lists, name forcing, and sub-progress reporting.

## Self-Check: PASSED
