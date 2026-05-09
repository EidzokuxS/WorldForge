---
phase: 64-npc-personality-regeneration-parity
plan: 04
subsystem: testing
tags: [personality, backfill, scripts, vitest, migration]
requires:
  - phase: 64-02
    provides: "Stops future worldgen/regenerate NPCs from emitting summary-only personality packs"
provides:
  - "Opt-in --mode=incomplete-pack repair path for legacy summary-only personality records"
  - "Tightened predicate that excludes valid empty sampleLines/internalContradictions cases"
  - "Regression coverage for incomplete-pack mode, invalid mode parsing, and default-mode preservation"
affects: [64-05-verification-gate, operator-runbooks, personality-backfill]
tech-stack:
  added: []
  patterns:
    - "Mode-gated repair tooling that keeps the default operator path stable"
    - "Legacy-signature predicates that exclude semantically valid sparse arrays"
key-files:
  created:
    - .planning/phases/64-npc-personality-regeneration-parity/64-04-SUMMARY.md
  modified:
    - backend/src/scripts/backfill-personality.ts
    - backend/src/scripts/__tests__/backfill-personality.test.ts
key-decisions:
  - "incomplete-pack targets only summary + empty core prose fields; sampleLines and internalContradictions are excluded to avoid sweeping valid sparse NPCs"
  - "parseArgs was exported and tested directly instead of spawning the CLI to keep mode validation coverage fast and deterministic"
  - "Full-suite verification used `npx vitest run` from `backend/` because `npm --prefix backend test -- run` acts as a Vitest filter rather than a true all-tests command"
patterns-established:
  - "Operator repair modes should be additive and opt-in rather than widening default migration behavior"
  - "When branch-wide diff scope is noisy, staged GitNexus checks plus commit-range diffs are the authoritative plan-scope proof"
requirements-completed: [P64-R6]
duration: 9min
completed: 2026-04-19
---

# Phase 64 Plan 04: Backfill Incomplete Pack Summary

**Opt-in `--mode incomplete-pack` backfills legacy summary-only personality records without sweeping valid sparse NPCs**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-19T09:01:00Z
- **Completed:** 2026-04-19T09:09:52.8693018Z
- **Tasks:** 4
- **Files modified:** 2

## Accomplishments
- Added `--mode default|incomplete-pack` to the personality backfill script while preserving the existing default behavior.
- Tightened the legacy predicate to target only summary-only records and deliberately exclude `sampleLines` and `internalContradictions`.
- Added seven regression tests covering include/skip behavior, default-mode preservation, and invalid mode parsing.

## Task Commits

Each task was committed atomically where it changed files:

1. **Task 1: Pre-edit GitNexus impact analysis** - no commit (analysis-only)
2. **Task 2: Add failing test cases for `--mode=incomplete-pack`** - `9f17772` (`test`)
3. **Task 3: Extend `backfill-personality.ts` with the mode-aware predicate** - `9622eb0` (`feat`)
4. **Task 4: Post-implementation verification + scope check** - no commit (verification-only)

**Plan metadata:** pending docs commit

## Files Created/Modified
- `backend/src/scripts/backfill-personality.ts` - Added `BackfillArgs.mode`, exported `parseArgs`, implemented `hasLegacySummaryOnlyPack` and `shouldSkipRecord`, and threaded mode through campaign/row processing plus log events.
- `backend/src/scripts/__tests__/backfill-personality.test.ts` - Added seven `incomplete-pack` regressions plus fixture helpers and deterministic controlled-record setup.
- `.planning/phases/64-npc-personality-regeneration-parity/64-04-SUMMARY.md` - Captures verification evidence and operator guidance for the new repair mode.

## Decisions Made

- Excluded `sampleLines` and `internalContradictions` from the `incomplete-pack` predicate because empty arrays are valid for non-dialog or simple NPCs; only empty prose fields identify the legacy signature.
- Kept default mode unchanged so Phase 63 operator workflows continue to skip any record with a non-empty personality summary.
- Verified the real backend suite from `backend/` directly after discovering the prefixed npm command only filtered tests matching `run`.

## Deviations from Plan

None - code changes stayed within the two Plan 04 files and followed the planned implementation.

## Issues Encountered

- GitNexus could not resolve the script-local symbols during the initial pre-edit impact pass even with a fresh index. Blast-radius evidence used direct caller inspection plus staged `gitnexus_detect_changes()` before each commit.
- A concurrent `64-03` commit landed on the branch during execution. Branch-wide compare output therefore included Plan 03 changes; Plan 04 scope was isolated with per-task staged GitNexus checks and the direct commit-range diff `9f17772^..9622eb0`.
- `npm --prefix backend exec vitest run` also walked `.claude/worktrees/` and unrelated frontend tests from sibling worktrees. The authoritative full-suite result is `npx vitest run` from `backend/`, which passed.

## Operator Runbook

- Preview a legacy repair run:
  `npm --prefix backend run backfill:personality -- --mode incomplete-pack --campaign <id> --dry-run`
- Apply the repair after reviewing the dry-run output:
  `npm --prefix backend run backfill:personality -- --mode incomplete-pack --campaign <id>`

## Evidence

- **B4 tightened predicate:** `hasLegacySummaryOnlyPack` checks only `summary`, `voice`, `decisionStyle`, `worldview`, and `personalMythology`. It does not reference `sampleLines` or `internalContradictions`.
- **D-08 compliance:** the new tests explicitly skip records with full prose plus empty `sampleLines`, and full prose plus empty `internalContradictions`.
- **Safety preservation:** `withPipelineRetry`, `writeBackupFile`, `writeCompletionSentinel`, `runWithTurnContext`, and `appendBacklogEntry` all remain in the live script path.
- **Scope proof:** direct diff `9f17772^..9622eb0` contains exactly:
  - `backend/src/scripts/__tests__/backfill-personality.test.ts`
  - `backend/src/scripts/backfill-personality.ts`

## Verification Results

- `npm --prefix backend test -- run "backfill-personality"`: passed
- `npm --prefix backend run typecheck`: passed
- `npx vitest run` from `backend/`: passed (`118` files, `1513` tests)
- `gitnexus_detect_changes({scope: "staged"})` before `9f17772`: low risk, 1 staged file, no affected indexed symbols
- `gitnexus_detect_changes({scope: "staged"})` before `9622eb0`: medium risk, indexed scope limited to `backfill-personality.ts`

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 64 now has both the forward fix path (`64-02`) and the legacy repair path (`64-04`) needed for verification in `64-05`.
- The operator command is ready for a campaign-specific dry-run during verification or manual remediation.

## Self-Check: PASSED

- Found summary file: `.planning/phases/64-npc-personality-regeneration-parity/64-04-SUMMARY.md`
- Found task commit: `9f17772`
- Found task commit: `9622eb0`

---
*Phase: 64-npc-personality-regeneration-parity*
*Completed: 2026-04-19*
