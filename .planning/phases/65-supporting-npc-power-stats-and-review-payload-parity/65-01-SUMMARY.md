---
phase: 65-supporting-npc-power-stats-and-review-payload-parity
plan: 01
subsystem: backend
tags: [typescript, vitest, worldgen, power-stats, batching]
requires:
  - phase: 60-character-ingestion-backend-pipeline
    provides: assessPowerStats dispatcher and original-branch retry semantics
  - phase: 64-npc-personality-regeneration-parity
    provides: helper-first parity extraction pattern for worldgen code
provides:
  - shared enrichNpcsBatch helper for per-NPC power-stat enrichment
  - regression coverage for routing quadrants, fail-closed propagation, and bounded concurrency
affects:
  - 65-02-worldgen-npcs-step-integration
  - 65-03-regenerate-saver-envelope
tech-stack:
  added: []
  patterns:
    - helper-first extraction for parity fixes
    - chunked Promise.all batching with fail-closed propagation
key-files:
  created:
    - backend/src/character/enrich-npc-batch.ts
    - backend/src/character/__tests__/enrich-npc-batch.test.ts
  modified: []
key-decisions:
  - "Reuse assessPowerStats as the only routing seam; the new helper does not duplicate branch rules."
  - "Keep retry ownership downstream and prove the absence of an outer retry layer with leafCalls === 3."
patterns-established:
  - "Caller-owned classification synthesis: batch helper accepts a buildClassification callback instead of inferring world/tier routing itself."
  - "Anti-nested-retry regression: tests simulate the inner retry chain so an accidental outer retry wrapper would fail immediately."
requirements-completed: [P65-R1, P65-R2, P65-R3, P65-R4]
duration: 9 min
completed: 2026-04-19
---

# Phase 65 Plan 01: Enrich NPCs Batch Helper Summary

**Shared `enrichNpcsBatch` helper delegating every NPC power-stat enrichment to `assessPowerStats` with bounded concurrency and fail-closed tests**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-19T20:24:00+03:00
- **Completed:** 2026-04-19T20:33:13.7341801+03:00
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added a new backend-local `enrichNpcsBatch` module that accepts caller-built classifications, delegates directly to `assessPowerStats`, and processes NPCs in sequential chunks of up to 4 concurrent promises by default.
- Added a 10-case Vitest suite covering all four routing quadrants, shared known-IP mixed-tier fanout, fail-closed error identity, bounded concurrency, serial override, empty-batch no-op, and the anti-nested-retry proof.
- Locked the helper’s static invariants: no duplicated routing logic, no outer retry wrapper, and no changes to `npcs-step.ts`, `routes/worldgen.ts`, or `power-assessor.ts`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write enrich-npc-batch.test.ts with dispatcher-reuse / anti-nested-retry / concurrency cases (RED)** - `0faed93` (`test`)
2. **Task 2: Implement enrich-npc-batch.ts module delegating to assessPowerStats (GREEN)** - `0a45ae9` (`feat`)

## Files Created/Modified
- `backend/src/character/__tests__/enrich-npc-batch.test.ts` - RED/GREEN suite for dispatcher delegation, fail-closed propagation, anti-nested-retry, chunked concurrency, override handling, and empty batches.
- `backend/src/character/enrich-npc-batch.ts` - Shared batch helper that delegates each NPC to `assessPowerStats`, accepts caller-built classification/source inputs, and bounds parallelism to `opts.concurrency ?? 4`.

## Decisions Made

- Reused `assessPowerStats` instead of reproducing canon/original routing in the new helper, which keeps the dispatcher as the single source of truth.
- Kept retry ownership at the existing downstream layer and encoded that contract in tests by asserting `leafCalls === 3`, not 9.
- Left all call sites untouched in this plan so Plans 65-02 and 65-03 can migrate worldgen and regenerate flows independently on top of a tested helper.

## Verification

- `npm --prefix backend test -- run enrich-npc-batch` exited `0`. The command ran the new `src/character/__tests__/enrich-npc-batch.test.ts` suite (`10` tests passed) and also matched `src/lib/__tests__/logger-truncate.test.ts` (`9` tests passed), for `19` passing tests total.
- `npm --prefix backend run typecheck` exited `0`.
- Static invariants on `backend/src/character/enrich-npc-batch.ts` were verified:
  - `assessPowerStats` present as the sole dispatcher import/call surface.
  - `canonicalStatus` absent from the helper source.
  - `withPipelineRetry` absent from the helper source.
  - `enrichKnownIpWorldgenNpcDraft` and `assessOriginalCharacterPowerStats` absent from the helper source.
- `git diff -- backend/src/worldgen/scaffold-steps/npcs-step.ts backend/src/routes/worldgen.ts backend/src/character/ingestion/power-assessor.ts` returned no changes.
- `gitnexus_detect_changes({scope: "staged"})` reported `changed_files: 1`, `risk_level: low` before each task commit.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing Phase 65 requirement registry entries**
- **Found during:** Post-task workflow bookkeeping
- **Issue:** `.planning/REQUIREMENTS.md` had no `P65-R*` entries yet, so `requirements mark-complete P65-R1 P65-R2 P65-R3 P65-R4` returned `not_found` for every ID.
- **Fix:** Added the Phase 65 requirements section plus traceability rows to `.planning/REQUIREMENTS.md`, with `P65-R1` through `P65-R4` marked complete and `P65-R5` through `P65-R10` left planned for later plans.
- **Verification:** Re-ran `requirements mark-complete P65-R1 P65-R2 P65-R3 P65-R4`; the tool reported all four IDs as present/already complete and `not_found: []`.
- **Committed in:** Included in the final docs commit for this plan

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No code-scope creep. The fix only restored the planning registry so execute-plan state updates could complete correctly.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `backend/src/character/enrich-npc-batch.ts` is ready for Plan 65-02 to replace the `npcs-step.ts` enrichment gate without re-deciding dispatch or concurrency behavior.
- The same helper is ready for Plan 65-03 to wire into `/api/worldgen/regenerate-section` and keep the regenerate path aligned with initial worldgen.
- No consumer migrations or payload-envelope changes were made here by design, so the remaining phase work stays narrowly scoped.

## Self-Check

PASSED
- Confirmed `backend/src/character/enrich-npc-batch.ts`, `backend/src/character/__tests__/enrich-npc-batch.test.ts`, and `.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-01-SUMMARY.md` exist.
- Confirmed task commits `0faed93` and `0a45ae9` are present in `git log --oneline --all`.

---
*Phase: 65-supporting-npc-power-stats-and-review-payload-parity*
*Completed: 2026-04-19*
