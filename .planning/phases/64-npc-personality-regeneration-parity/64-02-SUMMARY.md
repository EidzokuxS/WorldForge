---
phase: 64-npc-personality-regeneration-parity
plan: 02
subsystem: backend
tags: [typescript, zod, vitest, worldgen, npc, personality]
requires:
  - phase: 64-01-personality-schema-foundation
    provides: Shared flat personality schema and typed flat-to-nested mapper
  - phase: 63-personality-interiority-model
    provides: The seven-field CharacterPersonality runtime and UI contract
provides:
  - Full personality packing for worldgen NPC drafts
  - One-retry repair path for empty or generic NPC sample lines
  - Shared-helper reuse in npc-generator to prevent schema drift
affects: [64-03-regenerate-integration-test, 64-05-verification-gate, regenerate-section, worldgen-npc-generation]
tech-stack:
  added: []
  patterns: [after-adapter personality overwrite, bounded llm repair retry, staged gitnexus scope verification in dirty workspace]
key-files:
  created: []
  modified:
    - backend/src/worldgen/scaffold-steps/npcs-step.ts
    - backend/src/worldgen/__tests__/npcs-step.test.ts
    - backend/src/character/npc-generator.ts
key-decisions:
  - "Kept the canonical ordering from research review: personality is overwritten after fromLegacyScaffoldNpc, not before it."
  - "Retried only voice and sampleLines once, then fell back to the primary detail so worldgen never fails on a repair-only LLM call."
  - "Migrated npc-generator to the shared helper in a separate refactor commit to keep the core worldgen fix isolated."
patterns-established:
  - "Worldgen detail schemas that emit personality fields should spread personalityFieldSchema.shape instead of duplicating flat keys."
  - "LLM quality repair should use a narrow follow-up schema and preserve the primary payload on retry failure."
requirements-completed: [P64-R1, P64-R3, P64-R4]
duration: 10min
completed: 2026-04-19
---

# Phase 64 Plan 02: Worldgen NPCs Step Fix Summary

**Worldgen NPC generation now fills the full structured personality pack, repairs bad sample lines once, and reuses the shared helper in both worldgen and npc-generator**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-19T11:48:30+03:00
- **Completed:** 2026-04-19T11:57:30+03:00
- **Tasks:** 5
- **Files modified:** 3

## Accomplishments

- Extended `generateNpcsStep` so worldgen NPC drafts now carry `summary`, `voice`, `decisionStyle`, `worldview`, `internalContradictions`, `personalMythology`, and `sampleLines`.
- Added a bounded retry path that repairs empty, generic, or duplicated sample lines without risking whole-worldgen failure.
- Removed the last flat personality schema duplication from `npc-generator.ts` by switching it to the shared Phase 64-01 helper.

## Task Commits

Each task was committed atomically:

1. **Task 2: Extend npcs-step.test.ts with failing personality assertions (RED)** - `fb7e2a2` (`test`)
2. **Task 3: Implement the npcs-step personality parity fix and retry heuristic (GREEN)** - `9ae709b` (`fix`)
3. **Task 4: Migrate npc-generator.ts to the shared helper** - `a1f34c8` (`refactor`)
4. **Task 1 / Task 5:** verification-only tasks, no code changes committed

## Files Created/Modified

- `backend/src/worldgen/scaffold-steps/npcs-step.ts` - spreads the shared personality schema, requests all seven personality sub-fields, retries bad sample lines once, and overwrites nested personality after `fromLegacyScaffoldNpc`.
- `backend/src/worldgen/__tests__/npcs-step.test.ts` - adds parity coverage for full personality output, retry branches, retry fallback, and key-tier known-IP preservation.
- `backend/src/character/npc-generator.ts` - swaps inline flat personality fields and manual mapping for `personalityFieldSchema.shape` plus `mapFlatPersonalityToNested`.

## Decisions Made

- Used the post-adapter overwrite path for personality (`fromLegacyScaffoldNpc` at line 643, `mapFlatPersonalityToNested` at line 660) to match the reviewed Phase 64 ordering.
- Left `enrichKnownIpWorldgenNpcDraft` untouched and proved parity through it instead of widening Phase 64 into known-IP personality enrichment.
- Kept retry heuristics strict and bounded: empty lines, all-short lines, all-generic opener lines, or all-identical lines trigger exactly one repair call.

## Deviations from Plan

### Verification deviation

- **Issue:** The plan’s nominal full-suite command, `npm --prefix backend test -- run`, resolves to `vitest run run` in this repo and only executes a filtered subset instead of the real backend suite.
- **Adjustment:** Ran the actual full backend suite from `backend/` with `npm exec vitest run`, then ran `npm run typecheck`.
- **Impact on plan:** No scope creep. This was required to make the verification evidence real.

### Scope-check deviation

- **Issue:** Compare-based `gitnexus_detect_changes` over-reported scope because the main workspace already had unrelated dirty files (`backend/src/character/record-adapters.ts`, `backend/src/routes/__tests__/worldgen.test.ts`, mockups, planning artifacts).
- **Adjustment:** Used `gitnexus_detect_changes({scope: "staged"})` before each task commit as the authoritative scope gate, then used a commit-range file diff (`git diff --name-only 7afdd42..HEAD -- ...`) for final plan-level file isolation.
- **Impact on plan:** No code change to the feature. Verification became stricter and more honest for this workspace state.

## Issues Encountered

- Running `vitest` from the repo root swept `.claude/worktrees` and unrelated frontend/jsdom suites, which produced false failures outside Phase 64. Re-running from `backend/` isolated the intended backend suite and passed cleanly.
- GitNexus `impact` still under-reported `generateNpcsStep` upstream callers as zero, so the pre-edit blast-radius report was completed with GitNexus context plus direct source verification (`scaffold-generator.ts`, `routes/worldgen.ts`).

## User Setup Required

None - no external service configuration required.

## Verification

- Pre-edit GitNexus impact:
  - `generateNpcsStep`: `LOW` risk; verified real production callers in source are `backend/src/worldgen/scaffold-generator.ts` and `backend/src/routes/worldgen.ts`
  - `toNpcDraft`: `LOW` risk with direct callers `parseNpcDescription` and `generateNpcFromArchetype`
  - `npcDetailSingleSchema`: not indexed as a standalone symbol; verified as file-local to `npcs-step.ts`
- RED proof:
  - `npm --prefix backend test -- run "npcs-step"`: FAIL with 7 expected failures before implementation
- Targeted GREEN proof:
  - `npm --prefix backend test -- run "npcs-step"`: PASS (`11` tests in file, `20` tests total in matched run)
  - `npm --prefix backend run typecheck`: PASS after the worldgen implementation
- npc-generator migration proof:
  - `npm --prefix backend test -- run "npc-generator"`: PASS (`2` npc-generator tests, `11` total matched tests)
  - `npm --prefix backend run typecheck`: PASS after the refactor
- Full backend proof:
  - `backend> npm exec vitest run`: PASS (`118` files passed, `1505` tests passed, `3` files skipped)
  - `backend> npm run typecheck`: PASS
- GitNexus / scope proof:
  - Staged `gitnexus_detect_changes` before `9ae709b`: `2` changed files, `medium` risk, affected process `GenerateNpcsStep → BuildCanonicalNamesBlock`
  - Staged `gitnexus_detect_changes` before `a1f34c8`: `1` changed file, `low` risk
  - `git diff --name-only 7afdd42..HEAD -- backend/src/worldgen/scaffold-steps/npcs-step.ts backend/src/worldgen/__tests__/npcs-step.test.ts backend/src/character/npc-generator.ts`: exactly those 3 files
  - `git diff --name-only 7afdd42..HEAD -- backend/src/character/known-ip-worldgen-research.ts`: empty
- Ordering / retry evidence:
  - `shouldRetrySampleLines` defined at line `329` and called at line `563`
  - `retrySampleLines` defined at line `422` and called at line `565`
  - `fromLegacyScaffoldNpc` call at line `643`
  - `mapFlatPersonalityToNested` overwrite at line `660`

## Next Phase Readiness

- Plan 03 can now prove `/api/worldgen/regenerate-section` over HTTP using the repaired `generateNpcsStep` behavior instead of patching another write path.
- Plan 05 verification can cite this summary for the actual backend validation commands and the dirty-worktree caveat around compare-style GitNexus checks.

## Self-Check: PASSED

- Summary file created at `.planning/phases/64-npc-personality-regeneration-parity/64-02-SUMMARY.md`.
- Task commits `fb7e2a2`, `9ae709b`, and `a1f34c8` verified in git history.
- Plan commit-range diff verified only the three expected product files.
- No known UI-facing stubs or placeholder data were introduced by this plan.

---
*Phase: 64-npc-personality-regeneration-parity*
*Completed: 2026-04-19*
