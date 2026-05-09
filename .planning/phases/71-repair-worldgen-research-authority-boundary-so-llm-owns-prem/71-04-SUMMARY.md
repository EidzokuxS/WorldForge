---
phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem
plan: 04
subsystem: worldgen-routes
tags: [worldgen, research-artifact, routes, persistence, tdd]

requires:
  - phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem
    provides: Versioned WorldgenResearchArtifactV2 contract, campaign persistence helpers, and LLM-authored research generation
provides:
  - Route schemas accepting capped v2 research artifacts for world generation
  - suggest/generate/regenerate route handoff for cached or generated research artifacts
  - Backend no-pass-through behavior for the current frontend wizard: load cached artifact or re-run v2 artifact research
  - Route regressions proving v2 flows do not call legacy automatic research or save research frames
affects: [worldgen-research, route-contracts, scaffold-generation, regeneration]

tech-stack:
  added: []
  patterns:
    - Reuse Plan 01 artifact Zod schema at HTTP boundary
    - Prefer v2 artifacts for automatic known-IP flow while preserving explicit legacy ipContext compatibility
    - Keep frontend wizard pass-through out of scope and document backend cached/research fallback in tests

key-files:
  created:
    - .planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-04-SUMMARY.md
  modified:
    - backend/src/routes/__tests__/worldgen.test.ts
    - backend/src/routes/schemas.ts
    - backend/src/routes/worldgen.ts
    - backend/src/worldgen/types.ts

key-decisions:
  - "Automatic known-IP suggest/generate route flow now calls researchWorldgenArtifact instead of researchKnownIP."
  - "generate loads a cached worldgenResearchArtifact before re-running v2 research when the frontend omits _researchArtifact."
  - "Legacy ipContext and WorldgenResearchFrame behavior remains available only for explicit/cached legacy context."

patterns-established:
  - "Route tests assert artifact handoff, persistence, and no legacy frame writes on v2 flows."
  - "GenerateScaffoldRequest carries researchArtifact additively for later scaffold prompt migration."

requirements-completed: [P71-R4, P71-R5]

duration: 20 min
completed: 2026-04-26
---

# Phase 71 Plan 04: Route Research Artifact Wiring Summary

**Worldgen routes now persist and pass LLM-authored v2 research artifacts without rebuilding backend-owned franchise research frames for automatic known-IP flow.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-26T06:59:30Z
- **Completed:** 2026-04-26T07:19:09Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added route regressions for v2 artifact return, payload validation, persistence, cached artifact loading, explicit re-research when the browser omits pass-through, and regenerate-section handoff.
- Added `researchArtifact` to the generate route schema using the Plan 01 capped artifact schema.
- Wired `suggest-seeds`, `generate`, and `regenerate-section` to carry `WorldgenResearchArtifactV2` while keeping legacy worldbook/manual `ipContext` compatibility intact.

## Task Commits

1. **Task 1 RED: Add route research artifact regressions** - `5c35131` (test)
2. **Task 2 GREEN: Wire worldgen routes to research artifacts** - `dfcbf32` (feat)

## Files Created/Modified

- `backend/src/routes/__tests__/worldgen.test.ts` - adds v2 route regressions and resets cached route mocks for deterministic test isolation.
- `backend/src/routes/schemas.ts` - reuses `worldgenResearchArtifactSchema` in `generateWorldSchema`.
- `backend/src/routes/worldgen.ts` - routes automatic known-IP research through `researchWorldgenArtifact`, saves/loads artifacts, and passes them into generation/regeneration context.
- `backend/src/worldgen/types.ts` - adds optional `researchArtifact` to `GenerateScaffoldRequest`.

## Decisions Made

- Frontend wizard pass-through remains out of Phase 71 Plan 04 scope; backend tests lock the accepted fallback: load cached artifact by campaign ID, then re-run v2 artifact research if no cache exists.
- No shadow `_ipContext` is synthesized from v2 artifacts, because that would recreate a legacy canonical-franchise shape from artifact facts.
- Existing legacy `ipContext` and `WorldgenResearchFrame` paths remain for selected worldbooks, manual worldbook entries, and old campaign compatibility until later plans migrate prompt consumers.

## Verification

- RED gate: `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts` failed with 6 expected v2 route/schema wiring failures.
- GREEN gate: `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts` passed, 50 tests.
- `npm --prefix backend run typecheck` passed.
- Plan verification rerun after commit: route suite passed, 50 tests; backend typecheck passed.
- `rg "A world based on the .*franchise|saveWorldgenResearchFrame\\(|researchKnownIP\\(" backend/src/routes/worldgen.ts` returned only legacy compatibility lines for `saveWorldgenResearchFrame(campaignId, frame)` and the explicit `ipContext.franchise` fallback; no route `researchKnownIP(` call remains.
- Evidence campaign config `campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/config.json` remained unchanged.
- `npx gitnexus status` was refreshed with `npx gitnexus analyze`; final status was up to date at `dfcbf32`.
- GitNexus impact before production edits: `resolveWorldgenResearchFrame`, `generateWorldScaffold`, `suggestWorldSeeds`, `researchKnownIP`, `worldgen.ts`, and `GenerateScaffoldRequest` all LOW risk.
- GitNexus impact after indexing new wiring: `researchWorldgenArtifact` LOW / 1 direct route file; `GenerateScaffoldRequest` LOW / 0 impacted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reset sticky route mocks in worldgen route tests**
- **Found during:** Task 2 (Implement route and request wiring for v2 artifacts)
- **Issue:** Existing route tests used `vi.clearAllMocks()`, which clears call history but preserves per-test `mockReturnValue` state. New artifact tests exposed cached `ipContext` values leaking between generate/regenerate cases.
- **Fix:** Reset cached route mock defaults in `beforeEach` and updated one premise-regeneration expectation to the actual isolated `null` `ipContext`.
- **Files modified:** `backend/src/routes/__tests__/worldgen.test.ts`
- **Verification:** `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts` passed, 50 tests.
- **Committed in:** `dfcbf32`

---

**Total deviations:** 1 auto-fixed (1 bug).
**Impact on plan:** Test-only isolation repair required for trustworthy route regressions. No runtime scope expansion.

## Issues Encountered

- Local GitNexus CLI does not expose `detect_changes`; `npx gitnexus detect_changes --repo WorldForge` returned `unknown command`. Scope was checked with GitNexus status/analyze, required impact reports, commit diffs, and path-limited `git diff --name-status`.
- `npx gitnexus analyze` emitted Node `MaxListenersExceededWarning` warnings but completed successfully and left the index up to date.
- The plan `rg` verification still finds two legacy-only compatibility lines in `worldgen.ts`; this is expected because Plan 04 preserves explicit/cached `ipContext` behavior while removing automatic route calls to `researchKnownIP`.

## Known Stubs

None. Stub scan found only local nullable control variables and test accumulators, not placeholder UI/data stubs.

## Threat Flags

None - the new HTTP artifact validation and route persistence surfaces are planned trust boundaries covered by T-71-04-01 through T-71-04-04.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `71-05`: seed and premise prompt consumers can now receive `researchArtifact` from route context and migrate prompt wording to artifact source usage rules without relying on backend-owned canonical subjects.

## Self-Check: PASSED

- Created/modified files listed in this summary exist.
- Task commits `5c35131` and `dfcbf32` exist in git history.
- Summary evidence includes requirements `P71-R4` and `P71-R5`, verification commands, GitNexus impact notes, and evidence-campaign no-diff proof.

---
*Phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem*
*Completed: 2026-04-26*
