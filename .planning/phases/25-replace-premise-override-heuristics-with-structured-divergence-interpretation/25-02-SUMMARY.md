---
phase: 25-replace-premise-override-heuristics-with-structured-divergence-interpretation
plan: 02
subsystem: api
tags: [worldgen, known-ip, prompt-contracts, vitest, typescript, lore]
requires:
  - phase: 25-replace-premise-override-heuristics-with-structured-divergence-interpretation
    provides: shared PremiseDivergence artifact, route/cache transport, immutable canonical ipContext
provides:
  - divergence-aware prompt helpers for known-IP worldgen
  - canonical-preserving DNA, refined premise, scaffold, and lore prompt contracts
  - scaffold orchestration that threads one cached PremiseDivergence artifact through all known-IP steps
affects: [phase-25-03, worldgen, prompt-contracts, lore-extraction]
tech-stack:
  added: []
  patterns: [canon-plus-divergence prompt contract, cached divergence threading, present-world-state generation]
key-files:
  created: []
  modified:
    [
      backend/src/worldgen/scaffold-steps/prompt-utils.ts,
      backend/src/worldgen/seed-suggester.ts,
      backend/src/worldgen/scaffold-generator.ts,
      backend/src/worldgen/scaffold-steps/premise-step.ts,
      backend/src/worldgen/scaffold-steps/locations-step.ts,
      backend/src/worldgen/scaffold-steps/factions-step.ts,
      backend/src/worldgen/scaffold-steps/npcs-step.ts,
      backend/src/worldgen/lore-extractor.ts,
      backend/src/worldgen/__tests__/seed-suggester.test.ts,
      backend/src/worldgen/__tests__/lore-extractor.test.ts,
      backend/src/worldgen/__tests__/npcs-step.test.ts,
      backend/src/worldgen/__tests__/scaffold-resilience.test.ts,
    ]
key-decisions:
  - "Prompt helpers now separate canonical baseline (`buildIpContextBlock`) from interpreted divergence (`buildPremiseDivergenceBlock`) plus a reusable known-IP generation contract."
  - "scaffold-generator computes or reuses one PremiseDivergence artifact, then injects the same object into every known-IP scaffold step and lore extraction call."
  - "Known-IP lore generation updates only divergence-affected facts while keeping untouched canon explicit instead of suppressing names."
patterns-established:
  - "Known-IP prompts are structured as canonical reference + divergence artifact + generation target."
  - "Replacement cases remove only the changed protagonist from the present cast while preserving unrelated canon support entities."
requirements-completed: [P25-04, P25-05]
duration: 11min
completed: 2026-03-30
---

# Phase 25 Plan 02: Divergence-aware known-IP prompt contract summary

**Canonical-baseline plus PremiseDivergence prompt contracts across DNA, scaffold, and lore generation with one cached divergence artifact threaded through the full known-IP pipeline**

## Performance

- **Duration:** 11 min
- **Started:** 2026-03-30T07:26:30Z
- **Completed:** 2026-03-30T07:38:38Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Replaced exclusion-centric prompt wiring with reusable divergence-aware helpers that explicitly encode preserved canon, changed canon, and present-world directives.
- Updated DNA, refined premise, locations, factions, NPCs, and lore prompts to reason from canon plus divergence while preserving untouched franchise facts.
- Threaded one cached `PremiseDivergence` artifact through scaffold orchestration so known-IP generation steps and lore extraction all consume the same interpreted world-state delta.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace exclusion-centric prompt helpers with divergence-aware contracts** - `b035a02`, `e443231`
2. **Task 2: Thread divergence through locations, factions, NPCs, lore, and scaffold orchestration** - `b5eccd3`, `c7db44d`

Plan metadata: pending docs commit

Note: TDD tasks used `test` -> `feat` commit pairs.

## Files Created/Modified

- `backend/src/worldgen/scaffold-steps/prompt-utils.ts` - added reusable divergence block and known-IP contract builders, and removed prompt dependence on legacy exclusion wording.
- `backend/src/worldgen/seed-suggester.ts` - rewrote DNA prompts to combine canonical baseline, divergence directives, and generation target.
- `backend/src/worldgen/scaffold-steps/premise-step.ts` - refined premise generation now summarizes present world state from canon plus divergence.
- `backend/src/worldgen/scaffold-generator.ts` - injects the cached `premiseDivergence` artifact into every scaffold step and lore extraction.
- `backend/src/worldgen/scaffold-steps/locations-step.ts` - known-IP location planning/detail prompts now preserve unchanged canon and apply only divergence consequences.
- `backend/src/worldgen/scaffold-steps/factions-step.ts` - faction prompts now isolate divergence-driven leadership/allegiance changes while preserving untouched institutions.
- `backend/src/worldgen/scaffold-steps/npcs-step.ts` - NPC planning/detail prompts now reason about the present cast, including protagonist replacement without erasing unaffected canon NPCs.
- `backend/src/worldgen/lore-extractor.ts` - lore extraction now grounds cards in franchise reference plus divergence directives.
- `backend/src/worldgen/__tests__/seed-suggester.test.ts` - added DNA prompt regressions for preserved canon and divergence directives.
- `backend/src/worldgen/__tests__/scaffold-resilience.test.ts` - added prompt and orchestration regressions for refined premise, locations, factions, and scaffold threading.
- `backend/src/worldgen/__tests__/npcs-step.test.ts` - added protagonist-replacement NPC prompt regression coverage.
- `backend/src/worldgen/__tests__/lore-extractor.test.ts` - added lore divergence regression coverage and repaired test isolation.

## Decisions Made

- Kept `ipContext` purely canonical in prompts and expressed campaign-specific deltas through separate helper blocks instead of exclusion lists.
- Passed `premiseDivergence` through scaffold generation by augmenting the request object once in orchestration rather than recomputing or inferring it per step.
- Treated divergence as world-state instructions for lore and NPC generation, so unaffected canon entities remain available unless the artifact explicitly changes them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Repaired lore extractor test plumbing so Task 2 verification could run**
- **Found during:** Task 2 verification
- **Issue:** `backend/src/worldgen/__tests__/lore-extractor.test.ts` mocked the wrong module (`ai`) and reused stale mock calls across tests, preventing the planned lore prompt regression from verifying the new contract.
- **Fix:** Switched the test to mock `../../ai/generate-object-safe.js` and reset the mock before each test.
- **Files modified:** `backend/src/worldgen/__tests__/lore-extractor.test.ts`
- **Verification:** `npm --prefix backend exec vitest run src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/lore-extractor.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts`
- **Committed in:** `c7db44d`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The fix was required to execute the planned Task 2 regression suite. No scope expansion beyond keeping the new lore prompt contract testable.

## Issues Encountered

- The lore regression test had stale mocking and needed a small harness repair before the targeted verification command could validate the new divergence-aware prompt contract.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 25 now has one reusable known-IP prompt contract shared by DNA, refined premise, scaffold steps, and lore extraction.
- Follow-up cleanup can remove remaining legacy exclusion-only helpers and broaden regression coverage without reworking the prompt architecture again.
- Replacement and non-replacement divergence cases are both covered by prompt assertions in the targeted worldgen suite.

## Self-Check: PASSED

- Found summary file: `.planning/phases/25-replace-premise-override-heuristics-with-structured-divergence-interpretation/25-02-SUMMARY.md`
- Found commits: `b035a02`, `e443231`, `b5eccd3`, `c7db44d`

---
*Phase: 25-replace-premise-override-heuristics-with-structured-divergence-interpretation*
*Completed: 2026-03-30*
