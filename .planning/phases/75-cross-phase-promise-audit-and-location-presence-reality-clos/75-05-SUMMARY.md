---
phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
plan: 05
subsystem: worldgen-runtime-presence
tags: [worldgen, starting-location, current-scene, dense-locations, tdd]

requires:
  - phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos
    plan: 04
    provides: Persisted macro/sublocation rows plus NPC broad/current-scene ids
provides:
  - Player save placement that maps persistent sublocation starts to parent broad id plus scene id
  - Starting-location resolver prompts with exact location kind and parent metadata
  - `/world.currentScene` route proof for same-scene NPC inclusion and sibling-sublocation exclusion
affects:
  - phase-75-plan-06
  - phase-75-plan-07

tech-stack:
  added: []
  patterns:
    - Route-local broad/scene placement helper for selected stored locations
    - Current scene route tests rely on stored ids and `resolveScenePresence`, not custom filters

key-files:
  created:
    - .planning/phases/75-cross-phase-promise-audit-and-location-presence-reality-clos/75-05-SUMMARY.md
  modified:
    - backend/src/worldgen/starting-location.ts
    - backend/src/worldgen/__tests__/starting-location.test.ts
    - backend/src/routes/character.ts
    - backend/src/routes/__tests__/character.test.ts
    - backend/src/routes/__tests__/campaigns.test.ts
    - backend/src/routes/__tests__/campaigns.inventory-authority.test.ts

key-decisions:
  - "Selected persistent sublocations remain exact scene selections, while player row `currentLocationId` stores the parent macro and `currentSceneLocationId` stores the sublocation."
  - "Macro starts keep compatibility by writing the same macro id to broad and scene columns."
  - "`/world.currentScene` needed proof tests only; existing route code already used `resolveScenePresence` for scoped inclusion/exclusion."

requirements-completed: [P75-R4, P75-R5, P75-R7]

duration: 10 min
completed: 2026-04-30
---

# Phase 75 Plan 05: Scoped Player Start and Current Scene Summary

**Player starts now preserve exact sublocation scene scope while `/world.currentScene` is regression-locked against same-macro sibling leakage.**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-30T13:38:03Z
- **Completed:** 2026-04-30T13:47:53Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Extended starting-location candidates with `kind` and `parentLocationId`, and included that metadata in the model-facing known-location list.
- Updated save-character placement so selected persistent sublocations write player broad id to the parent macro and scene id to the sublocation.
- Added fail-closed route behavior for persistent sublocation starts whose parent row cannot be resolved.
- Added dense `/world.currentScene` route proof that same-scene NPCs are included while sibling sublocation NPCs under the same macro are excluded.
- Added broad-only legacy compatibility proof for currentScene payloads.

## Task Commits

1. **Task 1 RED:** `b2977dd` - `test(75-05): add failing scoped start tests`
2. **Task 1 GREEN:** `36f2a33` - `feat(75-05): resolve scoped player start`
3. **Task 2 proof:** `bb42e6f` - `test(75-05): lock current scene dense route scope`

## Files Created/Modified

- `backend/src/worldgen/starting-location.ts` - Carries scoped candidate metadata through resolver prompt assembly.
- `backend/src/worldgen/__tests__/starting-location.test.ts` - Proves persistent sublocation selection stays exact and metadata reaches the prompt.
- `backend/src/routes/character.ts` - Resolves selected location rows into player broad/scene ids and rejects broken sublocation parents.
- `backend/src/routes/__tests__/character.test.ts` - Proves sublocation starts, macro starts, parent failure, start-condition effects, and inventory behavior.
- `backend/src/routes/__tests__/campaigns.test.ts` - Proves broad-only legacy rows still produce compatible currentScene payloads.
- `backend/src/routes/__tests__/campaigns.inventory-authority.test.ts` - Proves dense currentScene includes same-scene NPCs and excludes sibling-sublocation NPCs.

## Verification

- RED Task 1: `npm --prefix backend run test -- src/worldgen/__tests__/starting-location.test.ts src/routes/__tests__/character.test.ts` - FAILED as expected, 3 failures for missing candidate metadata, sublocation broad id collapse, and broken parent acceptance.
- GREEN Task 1: `npm --prefix backend run test -- src/worldgen/__tests__/starting-location.test.ts src/routes/__tests__/character.test.ts` - PASS, 25 tests.
- Task 1 typecheck: `npm --prefix backend run typecheck` - PASS.
- Task 2 proof run: `npm --prefix backend run test -- src/routes/__tests__/campaigns.test.ts src/routes/__tests__/campaigns.inventory-authority.test.ts` - PASS, 28 tests.
- Task 2 typecheck: `npm --prefix backend run typecheck` - PASS.
- Final plan test bundle: `npm --prefix backend run test -- src/worldgen/__tests__/starting-location.test.ts src/routes/__tests__/character.test.ts src/routes/__tests__/campaigns.test.ts src/routes/__tests__/campaigns.inventory-authority.test.ts` - PASS, 53 tests.
- Final backend typecheck: `npm --prefix backend run typecheck` - PASS.
- `gitnexus_detect_changes(scope=all)` after task commits - PASS, no uncommitted code changes.
- `npx gitnexus analyze` - PASS, index refreshed to 2,664 nodes, 7,495 edges, 194 clusters, 215 flows; emitted known `MaxListenersExceededWarning` messages before successful completion.

## GitNexus Scope

- Pre-edit impact checks were run for `resolveStartingLocation`, `resolveDraftLocation`, `/save-character`, `/resolve-starting-location`, `buildWorldCurrentScene`, `toWorldSceneScopeId`, `buildWorldNpcPayload`, and `/:id/world`.
- Route and campaign symbols reported LOW risk. `resolveStartingLocation` name lookup was ambiguous and initially selected the frontend API helper, so exact backend context was checked by UID as supplemental scope proof.
- Staged detect-change gates were run before each commit and reported LOW/no indexed symbol risk for the scoped files.

## Decisions Made

- Kept `draft.socialContext.currentLocationName` as the exact selected stored location name, including persistent sublocations.
- Used scene id for the start-condition application check so opening status flags do not expire immediately when the broad player row points at the parent macro.
- Skipped production edits in `backend/src/routes/campaigns.ts` because new dense route tests proved the existing `resolveScenePresence` path already satisfies the Plan 75-05 route contract.

## Deviations from Plan

None - plan executed within the allowed branches. Task 2 production code was left unchanged because the plan explicitly allowed proof-only route tests when current code already passed.

## Issues Encountered

- Task 2 RED tests passed immediately. Investigation showed `buildWorldCurrentScene` already resolves presence from stored broad/scene ids via `resolveScenePresence`, so the added tests now lock the behavior without changing route code.
- `npx gitnexus analyze` emitted repeated Node `MaxListenersExceededWarning` warnings, then completed successfully.

## Known Stubs

None - stub scan found no unresolved `TODO`, `FIXME`, placeholder, coming-soon, or not-available markers in modified files. Null/empty values in touched tests are intentional fixture data.

## Threat Flags

None - no new network endpoints, auth paths, file access patterns, schema changes, or unplanned trust boundaries were introduced. Planned trust-boundary mitigations are covered by parent-resolution failure and currentScene scoped-presence tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 75-06 can rely on stored player/NPC broad and scene ids being populated for generated dense worlds. Route-level currentScene proof is in place; runtime SceneFrame and prompt assembly still need their planned scoped-context proof.

## Self-Check: PASSED

- Summary and key modified files exist.
- Task commits `b2977dd`, `36f2a33`, and `bb42e6f` exist in git history.
- Required focused tests, final plan test bundle, backend typecheck, GitNexus detect-change gates, and GitNexus re-index completed.
- Stub scan found no unresolved stub markers in modified files.

---
*Phase: 75-cross-phase-promise-audit-and-location-presence-reality-clos*
*Completed: 2026-04-30*
