---
phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem
plan: 06
subsystem: worldgen-prompts
tags: [worldgen, research-artifact, scaffold-generation, prompt-boundary, tdd]

requires:
  - phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem
    provides: Artifact-aware seed and premise prompt pattern plus v2 route handoff
provides:
  - Artifact-aware locations, factions, and NPC scaffold prompts
  - Regressions blocking Naruto overlay leakage into JJK world structure
  - Legacy no-artifact scaffold prompt compatibility coverage
affects: [worldgen-research, scaffold-generation, known-ip-generation, npc-generation]

tech-stack:
  added: []
  patterns:
    - Scaffold entity prompts prefer WorldgenResearchArtifactV2 source usage rules when present
    - Legacy canonical IP prompt branches are gated to no-artifact compatibility flow
    - Prompt tests assert artifact roles/useFor/avoidFor instead of generated entity strings only

key-files:
  created:
    - .planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-06-SUMMARY.md
  modified:
    - backend/src/worldgen/__tests__/scaffold-resilience.test.ts
    - backend/src/worldgen/__tests__/npcs-step.test.ts
    - backend/src/worldgen/scaffold-steps/locations-step.ts
    - backend/src/worldgen/scaffold-steps/factions-step.ts
    - backend/src/worldgen/scaffold-steps/npcs-step.ts

key-decisions:
  - "Locations, factions, and NPC prompts consume buildWorldgenResearchContextBlock whenever a v2 artifact is present."
  - "Legacy canonical lists and known-IP generation contracts remain available only for no-artifact ipContext compatibility."
  - "NPC detail prompts treat power-system-only sources as ability context, not cast authority."

patterns-established:
  - "Artifact-backed scaffold prompt tests use polluted legacy ipContext fixtures to prove v2 rules override legacy canonical names."
  - "No-artifact scaffold prompt tests preserve existing worldbook/manual canonical prompt wording."

requirements-completed: [P71-R3, P71-R4]

duration: 8 min
completed: 2026-04-26
---

# Phase 71 Plan 06: Scaffold Entity Artifact Prompt Consumption Summary

**Locations, factions, and NPC scaffold prompts now follow v2 research artifact source usage rules while preserving legacy no-artifact known-IP prompt behavior.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-26T07:49:26Z
- **Completed:** 2026-04-26T07:57:21Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added RED regressions for location, faction, and NPC prompts proving JJK world-basis rules are rendered and Naruto power-system overlay rules do not become geography, politics, or cast authority.
- Rewired `locations-step.ts`, `factions-step.ts`, and `npcs-step.ts` to use `buildWorldgenResearchContextBlock` when `req.researchArtifact` exists.
- Preserved no-artifact legacy prompt wording for worldbook/manual compatibility with focused prompt assertions.

## Task Commits

1. **Task 1 RED: Add scaffold prompt leakage regressions** - `85d42e7` (test)
2. **Task 2 GREEN: Rewire locations, factions, and NPC steps to artifact rules** - `0bcad4d` (feat)

## Files Created/Modified

- `backend/src/worldgen/__tests__/scaffold-resilience.test.ts` - adds artifact-backed location/faction leakage regressions, null-`ipContext` artifact coverage, and legacy no-artifact prompt compatibility checks.
- `backend/src/worldgen/__tests__/npcs-step.test.ts` - adds artifact-backed NPC planning/detail prompt regressions, null-`ipContext` artifact coverage, and legacy no-artifact NPC prompt compatibility checks.
- `backend/src/worldgen/scaffold-steps/locations-step.ts` - routes location plan/detail prompts through v2 artifact source rules and gates legacy canonical lists/contracts to no-artifact flow.
- `backend/src/worldgen/scaffold-steps/factions-step.ts` - routes faction plan/detail prompts through v2 artifact source rules and gates legacy canonical lists/contracts to no-artifact flow.
- `backend/src/worldgen/scaffold-steps/npcs-step.ts` - routes key/supporting/detail NPC prompts through v2 artifact source rules and gates legacy canonical cast/contracts to no-artifact flow.

## Decisions Made

- V2 artifact presence wins over legacy `ipContext` prompt authority for these scaffold entity steps.
- Legacy prompt text remains intentionally present for explicit no-artifact known-IP/worldbook/manual compatibility.
- Plan 71-06 stays scoped to scaffold prompt authority; broader artifact sufficiency/enrichment and lore alignment remains for Plan 71-07.

## Verification

- RED gate: `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/npcs-step.test.ts` failed as expected with 5 artifact-context prompt failures.
- GREEN gate: `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/npcs-step.test.ts` passed, 28 tests.
- Plan verification rerun after commit: same focused test bundle passed, 28 tests.
- `npm --prefix backend run typecheck` passed.
- Forbidden prompt scan over the three scaffold step files returned no matches for `FRANCHISE REFERENCE|Build the canonical world|This source IS the world|Canonical .* FROM`.
- Evidence campaign config `campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/config.json` remained unchanged.
- `npx gitnexus analyze` refreshed the index after task commits; final `npx gitnexus status` was up to date at `0bcad4d`.

## GitNexus Impact

- `generateLocationsStep`, `generateFactionsStep`, and `generateNpcsStep`: LOW risk, each with one direct route-file caller.
- `planKeyNpcs`, `planSupportingNpcs`, and `generateNpcDetail`: LOW risk, direct caller `generateNpcsStep`.
- `buildIpContextBlock`: HIGH risk, 17 impacted symbols, 11 direct callers, 4 affected processes. The helper body was not modified; use is gated away from v2 artifact prompt paths in this plan.
- `buildKnownIpGenerationContract`: HIGH risk, 12 impacted symbols, 9 direct callers, 4 affected processes. The helper body was not modified; use is gated away from v2 artifact prompt paths in this plan.
- `buildCanonicalList`: LOW risk; use remains only for no-artifact legacy branches in the touched steps.
- `gitnexus detect_changes` could not be run because the installed CLI does not expose that command; staged scope was checked with `git diff --cached --name-status`, task tests, typecheck, forbidden-string scan, and refreshed GitNexus index.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope expansion.

## Issues Encountered

- Local GitNexus CLI still reports `unknown command 'detect_changes'`; scope was verified through available GitNexus status/analyze/impact commands and git diff checks.
- `npx gitnexus analyze` emitted `MaxListenersExceededWarning` warnings but completed successfully and left the index up to date.
- Stub scan matched existing test wording for "generic placeholders" and local accumulator empty arrays; no UI-facing or data-source stubs were introduced.

## Known Stubs

None.

## Threat Flags

None - the modified prompt trust boundary is the planned artifact-to-generator surface covered by T-71-06-01 through T-71-06-04.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `71-07`: scaffold orchestration, regeneration, lore extraction, and sufficiency enrichment can complete the remaining artifact consumption paths using the same v2-rule-first pattern.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-06-SUMMARY.md`.
- Created/modified files listed in this summary exist.
- Task commits `85d42e7` and `0bcad4d` exist in git history.
- Summary evidence includes requirements `P71-R3` and `P71-R4`, verification commands, GitNexus impact notes, and evidence-campaign no-diff proof.

---
*Phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem*
*Completed: 2026-04-26*
