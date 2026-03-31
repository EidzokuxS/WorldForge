---
phase: 25-replace-premise-override-heuristics-with-structured-divergence-interpretation
plan: 03
subsystem: api
tags: [worldgen, known-ip, divergence, vitest, typescript, campaign-cache]
requires:
  - phase: 25-replace-premise-override-heuristics-with-structured-divergence-interpretation
    provides: divergence contract, cached transport, and divergence-aware prompt contracts
provides:
  - legacy premise-override helper reduced to compatibility-only behavior
  - regression matrix for protagonist replacement, relationship divergence, political divergence, and outsider arrival
  - route and cache assertions proving regenerate-section reuses cached premise divergence
affects: [phase-25, worldgen, prompt-contracts, campaign-cache, known-ip-tests]
tech-stack:
  added: []
  patterns:
    - compatibility-only legacy shim
    - divergence-first known-IP regression coverage
    - cached divergence reuse across generate and regenerate paths
key-files:
  created: []
  modified:
    - backend/src/worldgen/ip-context-overrides.ts
    - backend/src/worldgen/index.ts
    - backend/src/worldgen/seed-suggester.ts
    - backend/src/worldgen/__tests__/ip-context-overrides.test.ts
    - backend/src/worldgen/__tests__/premise-divergence.test.ts
    - backend/src/worldgen/__tests__/seed-suggester.test.ts
    - backend/src/worldgen/__tests__/lore-extractor.test.ts
    - backend/src/routes/__tests__/worldgen.test.ts
    - backend/src/campaign/__tests__/manager.test.ts
key-decisions:
  - "The old premise-override helper stays only as a deprecated compatibility shim and no longer participates in the live worldgen export surface."
  - "Phase 25 regressions should prove behavior at three layers: divergence interpretation, prompt assembly, and route/cache reuse."
  - "Known-IP single-seed generation now computes premise divergence when callers omit the cached artifact so every seed entry point follows the same structured path."
patterns-established:
  - "Legacy known-IP helpers may remain only when they preserve signatures without mutating canonical IpResearchContext."
  - "High-signal divergence regressions are organized by scenario class instead of by isolated helper function."
requirements-completed: [P25-06]
duration: 10min
completed: 2026-03-30
---

# Phase 25 Plan 03: Legacy override cleanup and divergence regression summary

**Compatibility-only legacy override handling plus a focused divergence regression matrix across interpreter, prompt, route, and cache paths**

## Performance

- **Duration:** 10 min
- **Started:** 2026-03-30T07:44:02Z
- **Completed:** 2026-03-30T07:54:21Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Removed the old canon-pruning helper from the live worldgen export path and reduced it to a compatibility shim that delegates to structured divergence without mutating canonical research data.
- Added explicit regressions for the four required scenario classes: VotV protagonist replacement, Naruto relationship divergence, Star Wars political divergence, and outsider arrival without protagonist replacement.
- Locked route and campaign-cache behavior so generate/regenerate flows reuse the same cached `premiseDivergence` artifact instead of reinterpreting ad hoc.

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove the legacy override heuristic from the live worldgen path** - `2e15f9b` (fix)
2. **Task 2: Lock high-signal regression scenarios for divergence interpretation and canon preservation (RED)** - `02f5e4e` (test)
3. **Task 2: Lock high-signal regression scenarios for divergence interpretation and canon preservation (GREEN)** - `49e7b67` (feat)

Plan metadata: pending docs commit

Note: Task 2 followed TDD and used separate RED and GREEN commits.

## Files Created/Modified

- `backend/src/worldgen/ip-context-overrides.ts` - replaced the old canon-pruning logic with a compatibility-only shim that delegates to `interpretPremiseDivergence()`.
- `backend/src/worldgen/index.ts` - removed the legacy helper from the live worldgen export surface.
- `backend/src/worldgen/seed-suggester.ts` - taught `suggestSingleSeed()` to compute structured divergence when known-IP callers omit the cached artifact.
- `backend/src/worldgen/__tests__/ip-context-overrides.test.ts` - locked the helper to non-mutating compatibility behavior.
- `backend/src/worldgen/__tests__/premise-divergence.test.ts` - added Naruto relationship and Star Wars political divergence interpreter regressions beside the VotV and outsider cases.
- `backend/src/worldgen/__tests__/seed-suggester.test.ts` - added DNA prompt regressions for Star Wars divergence and single-seed divergence reuse.
- `backend/src/worldgen/__tests__/lore-extractor.test.ts` - added lore prompt regression coverage for political divergence while preserving canon.
- `backend/src/routes/__tests__/worldgen.test.ts` - verified generate computes divergence once and regenerate reuses the cached artifact.
- `backend/src/campaign/__tests__/manager.test.ts` - verified campaign config preserves legacy `excludedCharacters` beside cached `premiseDivergence`.

## Decisions Made

- Kept the legacy module as a file-level compatibility shim instead of deleting it outright so any direct imports keep their signature while the live pipeline stays divergence-first.
- Expanded regressions around scenario classes rather than only around helper outputs, because the risk in this phase is world-state interpretation drift, not one isolated function.
- Treated single-seed suggestion as part of the known-IP generation surface and aligned it with the same structured divergence contract as the main DNA generator.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added divergence interpretation to known-IP single-seed generation**
- **Found during:** Task 2 (Lock high-signal regression scenarios for divergence interpretation and canon preservation)
- **Issue:** `suggestSingleSeed()` only consumed a passed `premiseDivergence` artifact, so known-IP single-seed requests without cached divergence skipped the structured interpretation path entirely.
- **Fix:** Updated `suggestSingleSeed()` to call `interpretPremiseDivergence()` when an IP context exists and no divergence artifact is provided, then kept the regression harness aligned with the cached-artifact contract.
- **Files modified:** `backend/src/worldgen/seed-suggester.ts`, `backend/src/worldgen/__tests__/seed-suggester.test.ts`
- **Verification:** `npm --prefix backend exec vitest run src/worldgen/__tests__/premise-divergence.test.ts src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/lore-extractor.test.ts src/routes/__tests__/worldgen.test.ts src/campaign/__tests__/manager.test.ts`
- **Committed in:** `49e7b67`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** The fix was directly required to make structured divergence the only live interpretation model across the remaining known-IP seed entry point. No scope creep beyond plan goals.

## Issues Encountered

- GitNexus MCP resources were not exposed in this session, so repo context and freshness checks were performed through the local `gitnexus` CLI instead. The index was stale and had to be refreshed with `npx gitnexus analyze` before implementation.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 25 now has no live known-IP worldgen export that depends on the old canon-pruning override mechanism.
- The regression suite covers the motivating VotV case plus relationship, political, outsider, and cache-reuse scenarios, so future prompt or route changes have a tighter safety net.
- Legacy `excludedCharacters` data remains readable for migration safety, but the live path is now entirely `ipContext + premiseDivergence`.

## Self-Check: PASSED

- Found summary file: `.planning/phases/25-replace-premise-override-heuristics-with-structured-divergence-interpretation/25-03-SUMMARY.md`
- Found commits: `2e15f9b`, `02f5e4e`, `49e7b67`

---
*Phase: 25-replace-premise-override-heuristics-with-structured-divergence-interpretation*
*Completed: 2026-03-30*
