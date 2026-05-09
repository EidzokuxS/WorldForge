---
phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
plan: 03
subsystem: worldgen-scaffold-generation-contract
tags: [worldgen, dense-locations, npc-scenes, prompt-contracts, tdd]

requires:
  - phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
    plan: 02
    provides: Explicit scaffold hierarchy and scene fields survive save-edits and review round-trips
provides:
  - Location generation prompts and schemas that request macro plus persistent sublocation rows
  - NPC generation prompts and schemas that separate broad locationName from scoped sceneLocationName
  - Fail-closed validation for invalid explicit NPC scene placement
affects:
  - phase-75-plan-04
  - phase-75-plan-05
  - phase-75-plan-06

tech-stack:
  added: []
  patterns:
    - RED/GREEN prompt contract tests for generated hierarchy and scene placement
    - Explicit location namespace validation for scene placement
    - Caller-owned regeneration fields for NPC location, scene, faction, tier, and name

key-files:
  created:
    - .planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-03-SUMMARY.md
  modified:
    - backend/src/worldgen/scaffold-steps/locations-step.ts
    - backend/src/worldgen/scaffold-steps/npcs-step.ts
    - backend/src/worldgen/scaffold-generator.ts
    - backend/src/worldgen/scaffold-steps/regen-helpers.ts
    - backend/src/worldgen/__tests__/scaffold-resilience.test.ts
    - backend/src/worldgen/__tests__/npcs-step.test.ts
    - backend/src/routes/__tests__/worldgen.test.ts

key-decisions:
  - "Keep `locationName` broad/home-compatible and use `sceneLocationName` for exact scoped location or sublocation placement."
  - "Treat invalid explicit `sceneLocationName` as an error instead of repairing it to the first known location."
  - "Keep prompt hierarchy as physical containment and namespace membership, not source/canon/franchise inference from names."

requirements-completed: [P75-R3, P75-R4, P75-R6, P75-R7]

duration: 20 min
completed: 2026-04-30
---

# Phase 75 Plan 03: Scaffold Generation Hierarchy Prompt Summary

**Generated scaffolds now ask for explicit macro/sublocation hierarchy and scoped NPC scene placement without deriving source or canon meaning from names.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-30T13:04:00Z
- **Completed:** 2026-04-30T13:23:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Extended location planning schema and prompt contract with `kind` and `parentLocationName`.
- Preserved generated location hierarchy fields in returned `ScaffoldLocation` rows while normalizing missing `kind` to `macro`.
- Updated the exact dense-location cap wording to `5-12 total location rows`, `no more than 6 macro rows`, `no more than 6 persistent sublocation rows`, and `no more than 3 generated sublocations under any one macro`.
- Extended NPC planning schema and prompt contract with `sceneLocationName` while keeping `locationName` as broad/home placement.
- Added strict `sceneLocationName` validation: exact match or case-insensitive match to the full known location namespace; invalid explicit scene names throw instead of falling back.
- Threaded scene placement through NPC detail, validation, regeneration prompts, scaffold output, and enrichment context.
- Added route/orchestrator coverage proving generation/regeneration receives the full known namespace, including persistent sublocations.

## Verification

- RED Task 1: `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-resilience.test.ts` - FAILED as expected before implementation on missing `kind` / hierarchy contract wording.
- GREEN Task 1: `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-resilience.test.ts` - PASS, 18 tests.
- Task 1 typecheck: `npm --prefix backend run typecheck` - PASS.
- RED Task 2: `npm --prefix backend run test -- src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts src/routes/__tests__/worldgen.test.ts` - FAILED as expected before implementation on missing `sceneLocationName` contract and invalid scene fallback.
- Final plan verification: `npm --prefix backend run test -- src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts src/routes/__tests__/worldgen.test.ts` - PASS, 104 tests.
- Final typecheck: `npm --prefix backend run typecheck` - PASS.
- `git diff --check` - PASS; only existing CRLF normalization warnings were reported.

## GitNexus Scope

- Pre-edit impacts were run for `generateLocationsStep`, `planKeyNpcs`, `planSupportingNpcs`, `generateNpcsStep`, `validateLocation`, `buildNpcValidationPrompt`, and `regenerateNpcEntity`; all returned LOW risk.
- Schema constants such as `locationPlanSchema`, `locationDetailSingleSchema`, and `npcPlanSchema` were not individually indexed by GitNexus, so their caller symbols were used for impact coverage.
- `gitnexus_detect_changes(scope=all)` after implementation reported `medium` risk, 7 changed files, 11 changed symbols, and affected NPC generation processes only. No HIGH or CRITICAL risk warnings were returned.

## Decisions Made

- `sceneLocationName` is optional/null when no scoped scene evidence exists, but explicit invalid values are rejected.
- NPC draft `socialContext.currentLocationName` continues to use broad `locationName`; scoped scene placement remains on the scaffold NPC as `sceneLocationName`.
- `backend/src/routes/worldgen.ts` required no production edit because it already passes the full request `locationNames`; the route test now locks that behavior for sublocations.

## Deviations from Plan

None - plan executed as written. The planned route production file did not require an edit because existing code already preserved the full location namespace.

## Issues Encountered

- The new route coverage did not fail during RED because route wiring already forwarded every `locationNames` item. The RED suite still failed on the NPC prompt contract and invalid scene fallback before GREEN.

## Known Stubs

None - stub scan found no unresolved stub markers. Matches in touched files were intentional local accumulators, null handling, or validator text about generic placeholders.

## Threat Flags

None - no new network endpoints, auth paths, file access patterns, or trust-boundary schemas were introduced beyond the planned LLM prompt/schema contract surface.

## User Setup Required

None.

## Next Phase Readiness

Plan 75-04 can rely on generated scaffolds carrying explicit location hierarchy and NPC scene placement, with invalid generated scene references failing before they can be saved.

## Self-Check: PASSED

- Summary file exists.
- All planned modified files exist.
- Required test and typecheck commands passed.
- GitNexus change detection completed with expected Phase 75 scope.
