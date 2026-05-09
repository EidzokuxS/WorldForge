---
phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem
plan: 05
subsystem: worldgen-prompts
tags: [worldgen, research-artifact, seed-generation, premise-refinement, tdd]

requires:
  - phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem
    provides: Versioned WorldgenResearchArtifactV2 contract, route artifact persistence, and seed route artifact creation
provides:
  - Artifact-aware research context block for seed and refined-premise prompts
  - Seed prompt consumption of artifact-authored source usage rules instead of backend canonical franchise wording
  - Refined premise prompt consumption of artifact-authored source usage rules instead of backend canonical franchise wording
  - Legacy no-artifact authority wording locked by snapshots for compatibility
  - Suggest-seeds route pass-through so generated v2 research artifacts reach seed prompt consumers
affects: [worldgen-research, seed-generation, premise-refinement, route-contracts]

tech-stack:
  added: []
  patterns:
    - Additive artifact-aware wrapper delegates to legacy buildIpContextBlock when no v2 artifact exists
    - Suppress known-IP canonical generation contracts only for artifact-backed prompt paths
    - Preserve explicit legacy ipContext behavior with snapshots while v2 artifact paths use source usage rules

key-files:
  created:
    - .planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-05-SUMMARY.md
  modified:
    - backend/src/worldgen/__tests__/seed-suggester.test.ts
    - backend/src/worldgen/__tests__/premise-divergence.test.ts
    - backend/src/worldgen/__tests__/research-artifact.test.ts
    - backend/src/worldgen/scaffold-steps/prompt-utils.ts
    - backend/src/worldgen/seed-suggester.ts
    - backend/src/worldgen/scaffold-steps/premise-step.ts
    - backend/src/routes/worldgen.ts
    - backend/src/routes/__tests__/worldgen.test.ts

key-decisions:
  - "buildWorldgenResearchContextBlock is additive and leaves buildIpContextBlock byte-for-byte compatible for legacy no-artifact flow."
  - "Artifact-backed seed and premise prompts suppress buildKnownIpGenerationContract so backend canonical franchise wording does not override artifact source usage rules."
  - "The suggest-seeds route must pass the generated researchArtifact into suggestWorldSeeds; otherwise automatic v2 research is created but not consumed."

patterns-established:
  - "Prompt tests assert forbidden canonical wording is absent from artifact-backed seed and premise prompts."
  - "Legacy no-artifact authority lines are snapshot-tested instead of removed."

requirements-completed: [P71-R3, P71-R4]

duration: 11 min
completed: 2026-04-26
---

# Phase 71 Plan 05: Seed and Premise Artifact Prompt Consumption Summary

**Seed and refined-premise prompts now consume LLM-authored v2 research artifact source rules while preserving legacy no-artifact canonical-IP compatibility.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-26T07:29:35Z
- **Completed:** 2026-04-26T07:40:07Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Added RED regressions proving seed, single-seed, and refined-premise prompts prefer artifact source usage rules and reject backend canonical franchise phrases.
- Added `buildWorldgenResearchContextBlock`, which formats v2 artifacts for specific prompt targets and delegates to legacy `buildIpContextBlock` when no artifact exists.
- Routed `researchArtifact` through seed suggester request handling and refined-premise prompt construction while keeping legacy no-artifact snapshots stable.
- Passed generated v2 artifacts from `/api/worldgen/suggest-seeds` into `suggestWorldSeeds`.

## Task Commits

1. **Task 1 RED: Add seed and premise artifact prompt regressions** - `c0a9d4f` (test)
2. **Task 2 GREEN: Route seed and premise prompts through research artifacts** - `0a602f2` (feat)

## Files Created/Modified

- `backend/src/worldgen/__tests__/seed-suggester.test.ts` - adds artifact-backed forbidden-phrase assertions and no-artifact authority snapshots for seed prompts.
- `backend/src/worldgen/__tests__/premise-divergence.test.ts` - adds artifact-backed refined-premise prompt assertions and no-artifact authority snapshots.
- `backend/src/worldgen/__tests__/research-artifact.test.ts` - covers target-specific artifact context block formatting and legacy delegation.
- `backend/src/worldgen/scaffold-steps/prompt-utils.ts` - adds `buildWorldgenResearchContextBlock`.
- `backend/src/worldgen/seed-suggester.ts` - consumes optional `researchArtifact` in all seed prompt paths and suppresses legacy canonical contracts for artifact-backed prompts.
- `backend/src/worldgen/scaffold-steps/premise-step.ts` - consumes optional `researchArtifact` in refined-premise prompts and switches rule text by artifact presence.
- `backend/src/routes/worldgen.ts` - passes generated v2 research artifacts into `suggestWorldSeeds`.
- `backend/src/routes/__tests__/worldgen.test.ts` - locks seed route artifact pass-through.

## Decisions Made

- The artifact migration is additive: no existing legacy `ipContext` block was rewritten, because no-artifact compatibility is an explicit requirement.
- Artifact-backed prompts use the artifact as the authority boundary and do not also inject `buildKnownIpGenerationContract`, because that contract reintroduces backend-selected canonical baselines.
- Route pass-through is part of Plan 05 correctness even though not listed as a target file: without it, automatic v2 seed research would be generated and then ignored.

## Verification

- RED gate: `npm --prefix backend run test -- src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/premise-divergence.test.ts src/worldgen/__tests__/research-artifact.test.ts` failed as expected with 4 missing artifact-consumption failures.
- GREEN gate: `npm --prefix backend run test -- src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/premise-divergence.test.ts src/worldgen/__tests__/research-artifact.test.ts src/routes/__tests__/worldgen.test.ts` passed, 96 tests.
- Plan focused verification: `npm --prefix backend run test -- src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/premise-divergence.test.ts src/worldgen/__tests__/research-artifact.test.ts` passed, 46 tests.
- Route deviation verification: `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts` passed, 50 tests.
- `npm --prefix backend run typecheck` passed.
- `git diff --check` passed for task files before commit.
- `rg "This world is the .* universe|FRANCHISE REFERENCE|Build the canonical world|Canonical subject" backend/src/worldgen/seed-suggester.ts backend/src/worldgen/scaffold-steps/premise-step.ts backend/src/worldgen/scaffold-steps/prompt-utils.ts` returned only legacy no-artifact compatibility lines. Artifact-backed prompt tests prove these strings do not enter v2 prompt paths.
- `npx gitnexus analyze` refreshed the index after code commits; final `npx gitnexus status` was up to date at `0a602f2`.

## GitNexus Impact

- `buildIpContextBlock`: HIGH risk, 16 impacted symbols, 13 direct callers, 4 affected processes. The function body was not modified; the new wrapper delegates to it only for legacy no-artifact flow.
- `interpretPremiseDivergence`: HIGH risk, 6 impacted symbols, 5 direct callers, 3 affected processes. The function was not modified; tests lock null `ipContext` behavior.
- `suggestWorldSeeds`, `suggestSingleSeed`, `generateRefinedPremiseStep`, and `backend/src/routes/worldgen.ts`: LOW risk before production edits.
- `gitnexus detect_changes` could not be run because the installed CLI has no `detect_changes` command; staged scope was checked with `git diff --cached --name-status`, `git diff --cached --check`, task tests, typecheck, and refreshed GitNexus index.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Passed generated research artifacts into seed prompts**
- **Found during:** Task 2 (GREEN: Implement artifact-aware prompt consumption)
- **Issue:** `/api/worldgen/suggest-seeds` created a v2 `researchArtifact` but did not pass it into `suggestWorldSeeds`, so automatic v2 seed prompts would still ignore artifact-authored source usage rules.
- **Fix:** Added `researchArtifact` to the route call and locked the handoff in the route test.
- **Files modified:** `backend/src/routes/worldgen.ts`, `backend/src/routes/__tests__/worldgen.test.ts`
- **Verification:** Combined worldgen prompt/route bundle passed, 96 tests; route suite passed, 50 tests.
- **Committed in:** `0a602f2`

---

**Total deviations:** 1 auto-fixed (1 missing critical functionality).
**Impact on plan:** The route handoff was required for the planned prompt migration to work in the real automatic seed flow. No unrelated scope was changed.

## Issues Encountered

- GitNexus MCP tools were not available in this Codex session, so all GitNexus operations used the CLI.
- Local GitNexus CLI does not expose `detect_changes`; the attempted command returned `unknown command`.
- `npx gitnexus analyze` emitted Node `MaxListenersExceededWarning` warnings but completed successfully and left the index up to date.
- The plan's broad forbidden-string `rg` command still finds legacy no-artifact compatibility text. This is expected because Plan 05 requires no-artifact behavior to remain stable; artifact-backed prompt paths are covered by regressions.

## Known Stubs

None. Stub scan found only local nullable control variables and initialized arrays/objects, not placeholder UI/data stubs.

## Threat Flags

None. The route pass-through touches the existing planned worldgen HTTP boundary from Plan 04 and does not introduce a new network endpoint, auth path, file access pattern, or schema trust boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for later Phase 71 prompt consumers to migrate from legacy `ipContext` wording to `WorldgenResearchArtifactV2` source usage rules. Seed and refined-premise generation now prove the authority boundary pattern and preserve rollback compatibility for old no-artifact calls.

## Self-Check: PASSED

- Created/modified files listed in this summary exist.
- Task commits `c0a9d4f` and `0a602f2` exist in git history.
- Summary evidence includes requirements `P71-R3` and `P71-R4`, verification commands, GitNexus impact notes, the route pass-through deviation, and the legacy forbidden-string scan caveat.

---
*Phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem*
*Completed: 2026-04-26*
