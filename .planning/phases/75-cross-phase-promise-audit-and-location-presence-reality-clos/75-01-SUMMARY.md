---
phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
plan: 01
subsystem: testing
tags: [regression-matrix, worldgen, location-presence, fixtures]

requires:
  - phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
    provides: context, research, promise audit, and location-presence trace
provides:
  - Phase 75 regression matrix for source-to-visible dense-location proof
  - Shared dense-location scaffold fixture for downstream RED tests
  - Authority guardrails for explicit scaffold fields and no source-name heuristics
affects:
  - phase-75-plan-02
  - phase-75-plan-03
  - phase-75-plan-04
  - phase-75-plan-05
  - phase-75-plan-06
  - phase-75-plan-07

tech-stack:
  added: []
  patterns:
    - Test-only extended scaffold fixture types before production scaffold contract changes
    - Promise classification requires source-data-to-user-visible evidence

key-files:
  created:
    - .planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-REGRESSION-MATRIX.md
    - backend/src/worldgen/__tests__/fixtures/dense-location-scaffold.ts
  modified: []

key-decisions:
  - "Plan 75-01 does not edit production scaffold symbols; the dense fixture uses local test-only extended types until Plan 75-02 lands production contract fields."
  - "Schema/helper existence alone is not enough to classify a completed promise as implemented."
  - "Dense-location proof must cover generated scaffold through People Here, not only persistence or runtime resolver units."

patterns-established:
  - "Dense-world RED tests should import `makeDenseLocationScaffold` and assert explicit `parentLocationName` plus `sceneLocationName` evidence."
  - "Phase 76 candidates stay separate from the Phase 75 deterministic location-presence critical path."

requirements-completed: [P75-R1, P75-R2, P75-R7, P75-R8]

duration: 5 min
completed: 2026-04-30
---

# Phase 75 Plan 01: Regression Matrix and Dense Fixture Summary

**Source-to-visible dense-location regression contract with a shared explicit macro/sublocation/NPC-scene fixture.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-30T12:34:20Z
- **Completed:** 2026-04-30T12:39:07Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Created `75-REGRESSION-MATRIX.md` with promise classifications, regression chain rows, RED/GREEN gates, authority guardrails, Phase 76 candidates, and P75 requirement coverage.
- Created `dense-location-scaffold.ts` with one broad macro location, three persistent sublocations, four NPCs distributed across scoped scenes, and expected broad/scene relationships.
- Kept production code untouched; fixture fields are explicit test data, not backend semantic inference from franchise/source names.

## Task Commits

Plan 75-01 is committed as one atomic plan commit per the execution request.

## Files Created/Modified

- `.planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-REGRESSION-MATRIX.md` - Evidence contract from scaffold input through `/world.currentScene`, SceneFrame, prompt assembler, and People Here.
- `backend/src/worldgen/__tests__/fixtures/dense-location-scaffold.ts` - Shared dense macro/sublocation/NPC scene-placement fixture for downstream RED tests.
- `.planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-01-SUMMARY.md` - Plan execution record.

## Verification

- `powershell -NoProfile -Command '$p=".planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-REGRESSION-MATRIX.md"; if (-not (Test-Path $p)) { exit 1 }; $m=Get-Content $p -Raw; foreach ($s in @("Promise Classification","Regression Chain","RED/GREEN Gates","save-edits normalization","/world.currentScene","SceneFrame","prompt assembler","People Here","Phase 76 Candidate Ledger")) { if ($m -notmatch [regex]::Escape($s)) { Write-Error "Missing $s"; exit 1 } }'` - PASS
- `powershell -NoProfile -Command '$p="backend/src/worldgen/__tests__/fixtures/dense-location-scaffold.ts"; if (-not (Test-Path $p)) { exit 1 }; $m=Get-Content $p -Raw; foreach ($s in @("makeDenseLocationScaffold","DENSE_LOCATION_EXPECTED","parentLocationName","sceneLocationName","persistent_sublocation")) { if ($m -notmatch $s) { Write-Error "Missing $s"; exit 1 } }'` - PASS
- `git diff --check -- .planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-REGRESSION-MATRIX.md backend/src/worldgen/__tests__/fixtures/dense-location-scaffold.ts` - PASS
- `gitnexus_detect_changes({scope:"all"})` - PASS, no indexed production symbols affected by the new planning/test-fixture files.
- Stub scan over created/modified plan files - PASS, no unresolved stub markers or empty rendered-data stubs found.

No backend test run was required by this plan because it creates planning docs and test-only fixture data.

## Decisions Made

- Used neutral dense urban fixture names instead of franchise/source names so later tests cannot pass through backend source-name interpretation.
- Kept the fixture return type as `DenseLocationWorldScaffold`, replacing only test fixture `locations` and `npcs` with extended explicit fields.
- Recorded Phase 76 candidates without expanding Plan 75-01 beyond P75-R1, P75-R2, P75-R7, and P75-R8.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Initial stub-scan regex command had a quoting error; reran as literal-pattern scanning. No file changes were required.

## Known Stubs

None - stub scan found no unresolved stub text or UI-rendered empty data patterns in the created/modified files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 75-02 can import `makeDenseLocationScaffold` for RED tests and then land production scaffold contract fields while preserving the authority guardrails in the matrix.

## Self-Check: PASSED

- Summary, regression matrix, and dense fixture files exist.
- Plan verification commands passed.
- Stub scan found no unresolved stub markers in the created/modified files.
- No production code symbols were edited.

---
*Phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos*
*Completed: 2026-04-30*
