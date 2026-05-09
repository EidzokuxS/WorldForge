---
phase: 72-worldgen-authority-propagation-regression-audit
plan: 03
subsystem: worldgen-authority
tags: [worldgen, research-artifact, prompt-lane, npc-dispatch, tdd]

requires:
  - phase: 72-worldgen-authority-propagation-regression-audit
    provides: "72-01 authority inventory and Phase 72 artifact/source-role model"
provides:
  - "Artifact-present seed, scaffold, NPC, and lore prompt regression coverage"
  - "Seed prompt isolation from stale legacy ipContext and premise divergence"
  - "NPC canonical dispatch isolation from stale legacy ipContext"
  - "Known-IP canonical versus original NPC assessor routing regressions"
affects: [phase-72, worldgen-prompts, research-artifact, npc-power-dispatch]

tech-stack:
  added: []
  patterns:
    - "When a research artifact is present, artifact source usage rules own prompt and dispatch authority."
    - "Legacy ipContext remains compatibility-only and is nulled on artifact-backed seed/NPC lanes."

key-files:
  created:
    - ".planning/phases/72-worldgen-authority-propagation-regression-audit/72-03-SUMMARY.md"
  modified:
    - "backend/src/worldgen/__tests__/seed-suggester.test.ts"
    - "backend/src/worldgen/__tests__/scaffold-resilience.test.ts"
    - "backend/src/worldgen/__tests__/lore-extractor.test.ts"
    - "backend/src/worldgen/__tests__/npcs-step.test.ts"
    - "backend/src/worldgen/seed-suggester.ts"
    - "backend/src/worldgen/scaffold-steps/npcs-step.ts"

key-decisions:
  - "Artifact-present seed requests null legacy ipContext and premiseDivergence before prompt assembly."
  - "Artifact-backed NPC generation nulls stale legacy ipContext before classifier and assessPowerStats dispatch context."
  - "Multiple NPC-eligible artifact source rules keep current first eligible source-rule order."

patterns-established:
  - "Prompt-injection fixture coverage asserts bounded prompt assembly, not model-level jailbreak immunity."
  - "Backend does not infer JJK/Naruto source roles from raw strings; role behavior stays in artifact source usage rules."

requirements-completed: [P72-R1, P72-R3, P72-R4]

duration: 12 min
completed: 2026-04-26
---

# Phase 72 Plan 03: Worldgen Authority Propagation Regression Summary

**Artifact-backed prompt and NPC dispatch lanes now prefer research artifact authority over stale legacy canon context, with regressions for JJK world basis plus Naruto power overlay.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-26T19:17:13Z
- **Completed:** 2026-04-26T19:28:54Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Added failing prompt-lane regressions for seed, scaffold/premise, and lore prompts with v2 artifacts plus stale legacy `ipContext`.
- Fixed seed suggestion so artifact-present requests do not interpret or emit stale legacy canonical-IP prompt context.
- Added failing NPC dispatch regressions for Satoru Gojo as `known_ip_canonical`, Mika Tanaka as `original`, stale context isolation, and multi-source first-rule ordering.
- Fixed artifact-backed NPC generation so `assessPowerStats` receives artifact-derived canonical classification without legacy `ipContext` leakage.

## Task Commits

1. **Task 1 RED:** `590176e` test(72-03): add failing prompt lane regressions
2. **Task 1 GREEN:** `728cec5` fix(72-03): isolate artifact seed prompt lane
3. **Task 2 RED:** `1cc18a2` test(72-03): add failing NPC dispatch regressions
4. **Task 2 GREEN:** `d1d31de` fix(72-03): isolate artifact NPC dispatch context

## Files Created/Modified

- `backend/src/worldgen/__tests__/seed-suggester.test.ts` - Covers artifact seed prompts, stale legacy context exclusion, JJK/Naruto role boundaries, and injection fixture prompt assembly.
- `backend/src/worldgen/__tests__/scaffold-resilience.test.ts` - Covers scaffold prompt surfaces with artifact research blocks and legacy contract exclusion.
- `backend/src/worldgen/__tests__/lore-extractor.test.ts` - Covers lore extraction artifact-first prompt behavior.
- `backend/src/worldgen/__tests__/npcs-step.test.ts` - Covers canonical/original NPC dispatch, stale context isolation, and first eligible source-rule order.
- `backend/src/worldgen/seed-suggester.ts` - Nulls legacy `ipContext` and `premiseDivergence` when `researchArtifact` owns seed prompt authority.
- `backend/src/worldgen/scaffold-steps/npcs-step.ts` - Uses artifact-only effective context for NPC planning, prompt blocks, canonical classification, and assessor dispatch.

## Decisions Made

- Kept artifact behavior source-rule-owned. No backend string inference was added for "JJK is world basis" or "Naruto is overlay".
- Did not grow the artifact schema or add per-source character ownership. Existing source usage rules were sufficient for the failing NPC dispatch tests.
- Preserved legacy no-artifact compatibility behavior; compatibility prompt snapshots remain in the existing test suite.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing correctness coverage] Added stale legacy context leakage assertion for NPC dispatch**
- **Found during:** Task 2
- **Issue:** The initial Gojo/Mika and multi-source NPC regressions passed before production changes, but they did not prove stale legacy `ipContext` was absent from assessor dispatch context.
- **Fix:** Added a failing regression that sends artifact-backed Gojo with polluted legacy `ipContext`, then fixed `generateNpcsStep` to pass null legacy context through artifact-backed dispatch.
- **Files modified:** `backend/src/worldgen/__tests__/npcs-step.test.ts`, `backend/src/worldgen/scaffold-steps/npcs-step.ts`
- **Verification:** Task 2 and final plan test commands passed.
- **Committed in:** `1cc18a2`, `d1d31de`

**Total deviations:** 1 auto-fixed correctness coverage gap.  
**Impact on plan:** No scope creep; the added regression directly protects the plan's authority boundary.

## Issues Encountered

- Task 1 RED failed as expected because stale `ipContext` caused seed suggestion to call legacy premise divergence before artifact prompt assembly.
- Task 2 happy-path RED passed unexpectedly, so the test was sharpened to cover stale legacy dispatch context before GREEN.
- GSD `state record-metric`, `state add-decision`, and `state record-session` reported absent target sections in this repo's `STATE.md`; progress, roadmap, and requirements updates were still applied through GSD tooling.

## Threat Coverage

- **Prompt lane tampering:** Covered by stale legacy `ipContext` plus artifact prompt tests that exclude `FRANCHISE REFERENCE`, `Canonical subject`, `Build the canonical world`, canonical list text, and Naruto setting/cast prompts.
- **Naruto raw premise/source spoofing:** Covered without backend-owned source-role inference; JJK/Naruto behavior comes from artifact source usage rules only.
- **CanonicalStatus dispatch EoP:** Covered by `assessPowerStats` dispatch assertions for Satoru Gojo as `known_ip_canonical` with franchise `Jujutsu Kaisen`, and Mika Tanaka as `original` with no franchise.
- **Prompt-injection fixture:** Coverage is prompt assembly only. It proves injected search text stays bounded as artifact/search data and does not replace source-usage rules; it does not claim model jailbreak immunity.

## GitNexus Evidence

- Orchestrator precheck: `buildWorldgenResearchContextBlock` upstream impact HIGH. This plan did not edit that helper.
- Orchestrator precheck: `suggestWorldSeeds`, `suggestSingleSeed`, `generateNpcsStep`, `extractLoreCards`, `enrichNpcsBatch`, `assessPowerStats`, and related step symbols LOW.
- Additional impact before production edit: `generateNpcsStep` upstream impact LOW.
- Staged detect before `590176e`: 3 test files, no changed indexed symbols, risk LOW.
- Staged detect before `728cec5`: `suggestWorldSeeds` and `suggestSingleSeed` touched, 16 affected processes, risk CRITICAL. Scope matched the Task 1 seed-lane fix and prechecked symbols were LOW.
- Staged detect before `1cc18a2`: 1 test file, no changed indexed symbols, risk LOW.
- Staged detect before `d1d31de`: `generateNpcsStep` touched, 2 affected processes, risk MEDIUM.

## Verification

- `npm --prefix backend run test -- src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/lore-extractor.test.ts` - PASS, 3 files, 47 tests.
- `npm --prefix backend run test -- src/worldgen/__tests__/npcs-step.test.ts src/character/__tests__/enrich-npc-batch.test.ts src/character/ingestion/__tests__/power-assessor.test.ts` - PASS, 3 files, 38 tests.
- `npm --prefix backend run test -- src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/lore-extractor.test.ts src/worldgen/__tests__/npcs-step.test.ts src/character/__tests__/enrich-npc-batch.test.ts src/character/ingestion/__tests__/power-assessor.test.ts` - PASS, 6 files, 85 tests.
- Production negative scan for legacy contract/canonical Naruto setting strings in `backend/src/worldgen` and `backend/src/routes` excluding tests/fixtures - PASS, no matches.

## Known Stubs

None. Stub scan found one pre-existing test title containing "generic placeholders" from `fb7e2a27`; it is not a runtime stub.

## Threat Flags

None. No new network endpoints, auth paths, file access paths, or schema trust boundaries were introduced.

## User Setup Required

None.

## Tests Needed

None. The multi-source NPC-eligible canonical-name edge regression is covered with current first eligible source-rule order.

## Self-Check: PASSED

- Summary file exists.
- Task commits found: `590176e`, `728cec5`, `1cc18a2`, `d1d31de`.
- No unexpected deletions were present in task commits.
