---
phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
plan: 04
subsystem: worldgen-scaffold-persistence
tags: [worldgen, dense-locations, npc-scenes, persistence, tdd]

requires:
  - phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
    plan: 02
    provides: Explicit scaffold hierarchy and scene fields survive save-edits and review round-trips
  - phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
    plan: 03
    provides: Generated scaffold prompts/schema produce hierarchy and NPC scene placement fields
provides:
  - Two-pass macro and persistent sublocation scaffold persistence
  - Deterministic containment adjacency between macro rows and sublocations
  - NPC broad plus current-scene placement from explicit scaffold references
  - Fail-closed duplicate, invalid parent, invalid scene, and broad/scene conflict validation
affects:
  - phase-75-plan-05
  - phase-75-plan-06
  - phase-75-plan-07

tech-stack:
  added: []
  patterns:
    - RED/GREEN persistence tests for dense generated locations and scoped NPC placement
    - Exact scaffold-name reference validation before destructive scaffold replacement
    - Explicit fields only; no source-name, franchise-name, or canon heuristics

key-files:
  created:
    - .planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-04-SUMMARY.md
  modified:
    - backend/src/worldgen/scaffold-saver.ts
    - backend/src/worldgen/__tests__/scaffold-saver.test.ts

key-decisions:
  - "Validate scaffold location names and parent references before clearing existing campaign scaffold rows."
  - "Keep omitted `sceneLocationName` legacy-compatible by storing broad `currentLocationId` and null `currentSceneLocationId`."
  - "Treat explicit `sceneLocationName` plus conflicting broad `locationName` as invalid instead of silently preferring either field."

patterns-established:
  - "Use one prepared location persistence plan to allocate ids, validate hierarchy, and resolve actor placement."
  - "Containment travel edges are deterministic macro-to-sublocation edges layered onto explicit `connectedTo` edges with Set deduplication."

requirements-completed: [P75-R3, P75-R4, P75-R6, P75-R7]

duration: 5 min
completed: 2026-04-30
---

# Phase 75 Plan 04: Scaffold Persistence Hierarchy Summary

**Generated dense-world scaffolds now persist parented sublocations and scoped NPC scene ids from explicit scaffold fields.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-30T13:27:36Z
- **Completed:** 2026-04-30T13:33:21Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added scaffold saver RED/GREEN coverage for explicit persistent sublocations, parent ids, containment travel edges, duplicate location names, invalid parent references, NPC scene ids, sibling scene separation, invalid scene references, and broad/scene conflicts.
- Reworked location persistence into a prepared two-pass plan: validate duplicate names and parent refs first, allocate all location ids, insert macros before persistent sublocations, and persist `parentLocationId`.
- Added deterministic containment adjacency between macro and sublocation rows while preserving legacy `connectedTo` graph projection.
- Added NPC placement resolution from explicit `locationName` and `sceneLocationName`, writing broad `currentLocationId` and scoped `currentSceneLocationId`.
- Preserved legacy flat scaffolds: missing hierarchy fields save as macro rows, and NPCs without `sceneLocationName` keep broad-only scene fallback.

## Task Commits

- `4e25982` - `test(75-04): add failing dense location saver tests`
- `927a87c` - `feat(75-04): persist location hierarchy`
- `35978db` - `test(75-04): add failing NPC scene placement tests`
- `2282b35` - `feat(75-04): persist NPC scene placement`

## Files Created/Modified

- `backend/src/worldgen/scaffold-saver.ts` - Prepared location persistence plan, fail-closed hierarchy validation, containment adjacency, and NPC broad/scene placement resolver.
- `backend/src/worldgen/__tests__/scaffold-saver.test.ts` - Dense-location regression tests covering persisted rows, edges, fail-closed validation, legacy compatibility, and NPC scene ids.
- `.planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-04-SUMMARY.md` - Plan execution record.

## Verification

- RED Task 1: `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-saver.test.ts` - FAILED as expected before implementation, 4 failures for macro-only sublocations, missing containment edges, duplicate-name overwrite, and invalid parent fallback.
- GREEN Task 1: `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-saver.test.ts` - PASS, 23 tests.
- Task 1 typecheck: `npm --prefix backend run typecheck` - PASS.
- RED Task 2: `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-saver.test.ts` - FAILED as expected before implementation, 6 failures for missing scene ids, missing scene validation, broad/scene conflicts, and legacy null scene fallback.
- Final focused test: `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-saver.test.ts` - PASS, 29 tests.
- Final typecheck: `npm --prefix backend run typecheck` - PASS.
- `git diff --check HEAD~4..HEAD -- backend/src/worldgen/scaffold-saver.ts backend/src/worldgen/__tests__/scaffold-saver.test.ts` - PASS.
- `npx gitnexus analyze` - PASS, index refreshed to 2,665 nodes, 7,493 edges, 195 clusters, 215 flows; emitted repeated Node `MaxListenersExceededWarning` messages before successful completion.

## GitNexus Scope

- Pre-edit impact checks were run for `insertLocations`, `updateAdjacency`, `saveScaffoldToDb`, and `insertNpcs`; all returned LOW risk.
- `insertLocations`, `updateAdjacency`, and `insertNpcs` reported `saveScaffoldToDb` as the direct d=1 caller, with `backend/src/routes/worldgen.ts` as a low-confidence d=2 route surface.
- Pre-commit `gitnexus_detect_changes` was run for each RED/GREEN commit. Test-only changes reported no indexed symbol changes; production changes reported LOW risk and no affected processes.
- GitNexus was re-indexed after code commits because the index had no embeddings to preserve.

## Decisions Made

- Validation is performed before `clearExistingScaffold`, so malformed duplicate, parent, or scene references cannot partially clear a campaign before failing.
- Scene placement is exact-reference only. `sceneLocationName` must match a persisted scaffold location name; sublocation scenes must belong to the broad `locationName` macro.
- Macro scenes store broad and scene ids as the same macro id, while omitted scenes store null `currentSceneLocationId` for legacy fallback.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npx gitnexus analyze` emitted repeated Node `MaxListenersExceededWarning` warnings, then completed successfully and refreshed the index.
- Minor formatting drift in `scaffold-saver.ts` was corrected before the Task 2 GREEN commit; focused test and typecheck were rerun after the fix.

## Known Stubs

None - stub scan found no unresolved `TODO`, `FIXME`, placeholder, coming-soon, or not-available markers in the modified files.

## Threat Flags

None - no unplanned network endpoints, auth paths, file access patterns, or schema trust-boundary changes were introduced. The planned scaffold-data-to-SQLite trust boundary was mitigated with exact-reference validation and fail-closed tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 75-05 can rely on generated scaffold rows having real macro/sublocation ids and generated NPC rows carrying broad plus current-scene ids. Player start and `/world.currentScene` still need their planned route-level proof before Phase 75 can claim user-visible closure.

## Self-Check: PASSED

- Summary and both modified source/test files exist.
- All four Task 75-04 commits exist in git history.
- Required focused test, backend typecheck, GitNexus detect-change gates, and GitNexus re-index completed.
- Stub scan found no unresolved stub markers in modified files.
