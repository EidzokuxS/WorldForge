---
phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin
plan: 05
subsystem: character-generation
tags: [structured-output, prompts, character-drafts, power-stats, ingestion, vitest]

requires:
  - phase: 74-01
    provides: baseline structured-output contract helper pattern
provides:
  - marker-specific character prompt contracts for player, NPC, and ingestion synthesis prompts
  - reusable power-stat prompt contract for known-IP and original-character assessment prompts
  - regression tests for minimal, invalid, lazy, and underspecified character/power output instructions
affects: [phase-74, character-generation, npc-generation, worldgen-research, ingestion, power-stats]

tech-stack:
  added: []
  patterns:
    - marker-parametrized prompt contract helpers
    - TDD RED/GREEN commits for prompt contract breadth

key-files:
  created:
    - .planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/74-05-SUMMARY.md
  modified:
    - backend/src/character/prompt-contract.ts
    - backend/src/character/npc-generator.ts
    - backend/src/character/known-ip-worldgen-research.ts
    - backend/src/character/ingestion/assess-original.ts
    - backend/src/character/ingestion/synthesizer.ts
    - backend/src/character/__tests__/generator.test.ts
    - backend/src/character/__tests__/npc-generator.test.ts
    - backend/src/character/__tests__/known-ip-worldgen-research.test.ts
    - backend/src/character/ingestion/__tests__/assess-original.test.ts
    - backend/src/character/ingestion/__tests__/synthesizer.test.ts

key-decisions:
  - "Character prompt contracts are marker-parametrized in the shared helper instead of copied per caller."
  - "Power-stat prompt contracts live with the shared character prompt-contract helpers and validators remain the enforcement authority."
  - "The lazy Gojo-style issue is addressed by asking for exact semantic power-stat work while still forbidding backend invention of feats, tiers, or canon facts."

patterns-established:
  - "Prompt helpers emit explicit STRUCTURED_OUTPUT_CONTRACT markers plus minimal and invalid examples."
  - "Power-stat prompts name exact axes, tiers, rank rules, null/empty-array behavior, and raw-evidence authority."

requirements-completed: [P74-R2, P74-R3, P74-R4, P74-R5]

duration: 9min
completed: 2026-04-28
---

# Phase 74 Plan 05: Character Prompt Contracts Summary

**Marker-specific character and power-stat prompt contracts now cover player, NPC, known-IP research, original power assessment, and ingestion synthesis paths without moving semantic authority into backend fallbacks.**

## Performance

- **Duration:** 9 min measured from the first committed RED gate
- **Started:** 2026-04-28T18:13:08Z
- **Completed:** 2026-04-28T18:22:30Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments

- Extended `buildCharacterPromptContract` with marker-specific output-shape contracts while preserving the existing shared prompt helper pattern.
- Added `buildPowerStatsPromptContract` with exact axes, tier lists, rank rules, null/empty-array behavior, minimal valid output, invalid output, and no-invention authority language.
- Wired contracts into NPC prompts, known-IP initial and repair power prompts, original-character power assessment, and ingestion synthesis.
- Added TDD regression coverage for character, NPC, known-IP power, original power, and synthesis prompt contract presence.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: Extend character and power prompt-contract helpers** - `8e3635f` (test)
2. **Task 1 GREEN: Extend character and power prompt-contract helpers** - `5b7cbde` (feat)
3. **Task 2 RED: Apply contracts to character, NPC, and ingestion prompts** - `9ebb853` (test)
4. **Task 2 GREEN: Apply contracts to character, NPC, and ingestion prompts** - `a583fe9` (feat)

**Plan metadata:** committed separately after self-check.

## Files Created/Modified

- `backend/src/character/prompt-contract.ts` - Added marker-parametrized character output contract and reusable power-stat prompt contract.
- `backend/src/character/npc-generator.ts` - Applies `npc-character.v1` contract marker to NPC prompt construction.
- `backend/src/character/known-ip-worldgen-research.ts` - Applies `power-stats.v1` contract to initial and repair known-IP power prompts.
- `backend/src/character/ingestion/assess-original.ts` - Applies `original-power-assessment.v1` contract to original-character power assessment.
- `backend/src/character/ingestion/synthesizer.ts` - Applies `character-synthesis.v1` contract to ingestion synthesis.
- `backend/src/character/__tests__/generator.test.ts` - Covers default `character.v1` and `power-stats.v1` helper contracts.
- `backend/src/character/__tests__/npc-generator.test.ts` - Covers NPC prompt marker and no-invention contract language.
- `backend/src/character/__tests__/known-ip-worldgen-research.test.ts` - Covers known-IP initial and repair power contract prompts.
- `backend/src/character/ingestion/__tests__/assess-original.test.ts` - Covers original power assessment contract prompt.
- `backend/src/character/ingestion/__tests__/synthesizer.test.ts` - Covers ingestion synthesis marker propagation.

## Decisions Made

- Kept power-stat contract instructions in `prompt-contract.ts` so character and power breadth use one helper family.
- Used marker options (`character.v1`, `npc-character.v1`, `character-synthesis.v1`, `power-stats.v1`, `original-power-assessment.v1`) instead of creating duplicate prompt builders.
- Preserved backend authority boundaries: prompts ask the model for semantic work, while schemas/normalizers still validate, coerce supported aliases, repair malformed payloads, or fail closed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adjusted backend test paths for `--prefix backend`**
- **Found during:** Task 1 and final verification
- **Issue:** The plan's verification commands used `backend/src/...` paths while also running with `npm --prefix backend`, which would point Vitest at the wrong package-relative path.
- **Fix:** Ran the equivalent package-relative paths under the backend package: `src/character/...`.
- **Files modified:** None
- **Verification:** Targeted Vitest suite passed with 5 files and 29 tests.
- **Committed in:** Not applicable, verification-only adjustment.

---

**Total deviations:** 1 auto-fixed (1 blocking verification-path adjustment)
**Impact on plan:** No implementation scope change.

## Issues Encountered

- GitNexus symbol names in the plan did not exactly match the codebase for `generateNpc` and `synthesizeCharacterDraft`; impact analysis used the existing closest symbols `parseNpcDescription`, `generateNpcFromArchetype`, and `synthesizeDraftFromSources`.
- `gitnexus_detect_changes` marked the staged implementation as `critical` because prompt construction participates in ingestion and worldgen processes. The change was prompt-only and was verified by the targeted regression suite plus backend typecheck.
- `npx gitnexus analyze` completed after code commits with repeated Node `MaxListenersExceededWarning` warnings, but the repository indexed successfully.

## TDD Gate Compliance

- RED gate present for Task 1: `8e3635f`
- GREEN gate present for Task 1: `5b7cbde`
- RED gate present for Task 2: `9ebb853`
- GREEN gate present for Task 2: `a583fe9`

## Verification

- `npm --prefix backend run test -- src/character/__tests__/generator.test.ts src/character/__tests__/npc-generator.test.ts src/character/__tests__/known-ip-worldgen-research.test.ts src/character/ingestion/__tests__/assess-original.test.ts src/character/ingestion/__tests__/synthesizer.test.ts` - passed, 5 files / 29 tests.
- `npm --prefix backend run typecheck` - passed.
- `npx gitnexus analyze` - passed after code commits; index refreshed at `a583fe9`.

## Known Stubs

None. Stub scan found only normal empty-array/object initializers in helpers and tests, not user-facing placeholders or disconnected data.

## Threat Flags

None. The plan changed prompt text and tests only; it added no network endpoints, auth paths, file access surfaces, or schema trust boundaries beyond the planned model-output prompt boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 74-05 is ready for downstream Phase 74 work. Plan 74-10 can replace the temporary inline underspecified power-stat test shapes with shared fixture corpus entries when that fixture plan runs.

## Self-Check: PASSED

- Created summary file exists.
- Modified production files exist.
- Task commits found: `8e3635f`, `5b7cbde`, `9ebb853`, `a583fe9`.
- No accidental tracked-file deletions detected in task commits.

---

*Phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin*
*Completed: 2026-04-28*
