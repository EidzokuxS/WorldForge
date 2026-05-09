---
phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
plan: 02
subsystem: worldgen-review-scaffold-contract
tags: [worldgen, save-edits, world-review, dense-locations, tdd]

requires:
  - phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
    plan: 01
    provides: Phase 75 regression matrix and dense-location fixture contract
provides:
  - Scaffold hierarchy contract fields for locations and NPC scene placement
  - Save-edits schema and normalization preservation for dense location data
  - World Review frontend round-trip preservation for hierarchy and scene fields
affects:
  - phase-75-plan-03
  - phase-75-plan-04
  - phase-75-plan-05
  - phase-75-plan-06

tech-stack:
  added: []
  patterns:
    - RED/GREEN tests for backend schema, route normalization, and frontend review round-trip
    - Explicit scaffold fields only; no source-name or franchise-name inference
    - Radix Select jsdom pointer/scroll polyfills scoped to component tests

key-files:
  created:
    - .planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-02-SUMMARY.md
  modified:
    - backend/src/worldgen/types.ts
    - backend/src/routes/schemas.ts
    - backend/src/routes/worldgen.ts
    - backend/src/routes/__tests__/schemas.test.ts
    - backend/src/routes/__tests__/worldgen.test.ts
    - frontend/lib/api-types.ts
    - frontend/lib/world-data-helpers.ts
    - frontend/lib/__tests__/world-data-helpers.test.ts
    - frontend/components/world-review/locations-section.tsx
    - frontend/components/world-review/__tests__/locations-section.test.tsx
    - frontend/components/world-review/npcs-section.tsx
    - frontend/components/world-review/__tests__/npcs-section.test.tsx
    - frontend/app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx

key-decisions:
  - "Use explicit `kind`, `parentLocationName`, and `sceneLocationName` scaffold fields rather than deriving hierarchy from names."
  - "Keep `locationName` as broad/home compatibility and add `sceneLocationName` as the optional current scene reference."
  - "World Review NPC regeneration uses the full editable location namespace, including persistent sublocations."

requirements-completed: [P75-R3, P75-R4, P75-R6, P75-R7]

duration: 15 min
completed: 2026-04-30
---

# Phase 75 Plan 02: Scaffold Hierarchy Save-Edits Summary

**Explicit macro/sublocation and NPC-scene scaffold fields now survive save-edits and World Review round-trips.**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-30T12:48:12Z
- **Completed:** 2026-04-30T13:03:16Z
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments

- Extended backend and frontend scaffold contracts with `kind`, `parentLocationName`, and `sceneLocationName`.
- Updated `saveEditsSchema`, `scaffoldNpcSchema`, and `normalizeSavedScaffold` so legacy and draft-backed NPC branches preserve scene placement.
- Updated `toEditableScaffold` to convert `locationKind`, `parentLocationId`, and `sceneScopeId` into editable name-based scaffold fields.
- Added compact World Review controls for location kind/parent and NPC scene placement while keeping legacy flat data optional.
- Added page-level coverage proving NPC regeneration receives full location names, including persistent sublocations.

## Task Commits

- `4485fbd` - `test(75-02): add failing schema hierarchy tests`
- `51a2935` - `feat(75-02): extend scaffold save-edits contract`
- `4a83e9e` - `test(75-02): add failing save-edits hierarchy test`
- `c4fe529` - `feat(75-02): preserve save-edits scene placement`
- `0b7edf6` - `test(75-02): add failing world review hierarchy tests`
- `b9ad7a5` - `feat(75-02): preserve world review hierarchy fields`

## Verification

- `npm --prefix backend run test -- src/routes/__tests__/schemas.test.ts src/routes/__tests__/worldgen.test.ts` - PASS, 272 tests.
- `npm --prefix backend run typecheck` - PASS.
- `npm --prefix frontend run test -- run lib/__tests__/world-data-helpers.test.ts components/world-review/__tests__/locations-section.test.tsx components/world-review/__tests__/npcs-section.test.tsx 'app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx'` - PASS, 45 tests.
- `npm --prefix frontend run lint` - PASS.
- `npx gitnexus analyze` - PASS, index refreshed to `b9ad7a5` with 2,654 nodes and 7,471 edges.

## GitNexus Scope

- Pre-edit impact checks were run for `ScaffoldLocation`, `ScaffoldNpc`, `normalizeSavedScaffold`, `toEditableScaffold`, `LocationsSection`, `NpcsSection`, and `WorldReviewPage`.
- `normalizeSavedScaffold`, `toEditableScaffold`, `LocationsSection`, `NpcsSection`, and scaffold type edits stayed within expected Phase 75 files.
- Staged detect for the frontend GREEN commit reported high risk because `toEditableScaffold` and `NpcsSection` participate in shared World Review flows; the affected processes matched the plan scope and were covered by the frontend verification suite.

## Decisions Made

- Preserved explicit scaffold references only; no backend or frontend code infers sublocation/source/canon meaning from arbitrary names.
- Stored NPC scene placement separately from broad `locationName` to keep existing compatibility paths intact.
- Kept World Review hierarchy editing utilitarian: existing sections now expose compact selects instead of adding a new authoring workflow.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added Radix Select jsdom polyfills in component tests**
- **Found during:** Task 3 GREEN verification
- **Issue:** jsdom lacked `hasPointerCapture` and `scrollIntoView`, preventing Radix Select options from opening in the new component tests.
- **Fix:** Added scoped test polyfills in the two affected World Review component test files.
- **Files modified:** `frontend/components/world-review/__tests__/locations-section.test.tsx`, `frontend/components/world-review/__tests__/npcs-section.test.tsx`
- **Commit:** `b9ad7a5`

## Issues Encountered

- The page-level NPC regeneration behavior already used `scaffold.locations.map(location => location.name)`. The new page test did not fail during RED, but the overall Task 3 RED suite failed on the helper and component gaps before GREEN.
- `npx gitnexus analyze` emitted repeated Node `MaxListenersExceededWarning` messages, then completed successfully and refreshed the index.

## Known Stubs

None - stub scan found no unresolved stub markers. UI `placeholder` strings in touched components are intentional input/select hints, not unwired rendered data.

## Threat Flags

None - no new network endpoints, auth paths, file access patterns, or schema trust boundaries were introduced beyond the planned save-edits schema contract.

## User Setup Required

None.

## Next Phase Readiness

Plans 75-03 and 75-04 can now rely on explicit scaffold hierarchy and scene placement fields arriving from generated scaffolds, save-edits, and World Review without browser-side flattening.

## Self-Check: PASSED

- Summary file exists.
- Key backend/frontend files exist.
- All six task commits exist in git history.
- Plan verification commands passed.
- Stub scan found no unresolved stub markers or UI-rendered empty data stubs in created/modified files.
- GitNexus index was refreshed after code commits.

---
*Phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos*
*Completed: 2026-04-30*
