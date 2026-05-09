---
phase: 65-supporting-npc-power-stats-and-review-payload-parity
plan: 02
subsystem: backend
tags: [typescript, vitest, worldgen, power-stats, batching]
requires:
  - phase: 65-01-enrich-npcs-batch-helper
    provides: shared enrichNpcsBatch helper and dispatcher-backed fail-closed batching
  - phase: 64-npc-personality-regeneration-parity
    provides: locked personality mapping and sample-line retry behavior in npcs-step
provides:
  - post-loop power-stat enrichment for all worldgen NPC quadrants
  - integration coverage for known-IP supporting, original-world tiers, and fail-closed propagation
affects:
  - 65-03-regenerate-saver-envelope
  - 65-04-verification-gate
tech-stack:
  added: []
  patterns:
    - sequential personality/detail generation followed by one bounded-parallel enrichment batch
    - dispatcher-backed worldgen enrichment using caller-built ingestion classification
key-files:
  created: []
  modified:
    - backend/src/worldgen/scaffold-steps/npcs-step.ts
    - backend/src/worldgen/__tests__/npcs-step.test.ts
key-decisions:
  - "Worldgen owns canonicalStatus synthesis and passes a minimal cast IngestionContext because GenerateScaffoldRequest exposes research config, not a full settings object."
  - "Personality mapping and provenance tagging stay in the existing merge loop; only power-stat enrichment moved to a single post-loop batch call."
patterns-established:
  - "GenerateNpcsStep now enriches power stats once per step after drafts are fully built, instead of inline during the per-NPC loop."
  - "Known-IP worldgen tests must provide enabled research config when exercising the real assessPowerStats dispatcher."
requirements-completed: [P65-R1, P65-R3]
duration: 15 min
completed: 2026-04-19
---

# Phase 65 Plan 02: Worldgen NPCs Step Integration Summary

**`generateNpcsStep` now batches PowerStats enrichment once after the detail loop so known-IP and original-world NPCs of both tiers leave worldgen with populated `draft.powerStats`**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-19T20:34:30+03:00
- **Completed:** 2026-04-19T20:49:30+03:00
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced the inline `ipContext && tier === "key"` enrichment gate in `generateNpcsStep` with one post-loop `enrichNpcsBatch` call that covers every generated NPC.
- Added RED/GREEN integration coverage proving known-IP key + supporting parity, original-world key + supporting parity, once-per-step batch invocation, and fail-closed propagation.
- Preserved Phase 64 behavior: personality mapping still happens before enrichment, provenance tagging remains intact, and sample-line retry logic was left untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add 3 failing integration tests to npcs-step.test.ts (RED)** - `ff8c916` (`test`)
2. **Task 2: Replace per-loop enrichment gate with post-loop enrichNpcsBatch call (GREEN)** - `809f2e3` (`feat`)

## Files Created/Modified
- `backend/src/worldgen/scaffold-steps/npcs-step.ts` - removed the key-only inline enrichment gate, added a single post-loop batch call, and synthesized `IngestionClassification`/`IngestionContext` at the worldgen call site.
- `backend/src/worldgen/__tests__/npcs-step.test.ts` - added three integration tests for quadrant parity and fail-closed behavior, wrapped the real batch helper for the once-per-step assertion, and updated known-IP fixtures to provide research config required by the real dispatcher.

## Decisions Made

- Reused `enrichNpcsBatch` exactly as built in Plan 65-01 instead of adding any new worldgen-specific enrichment helper.
- Built the batch `ctx.settings` from `req.research` only, cast to `IngestionContext["settings"]`, because the live `GenerateScaffoldRequest` contract has no `settings` field.
- Updated the older known-IP tests to run with enabled research so they continue to exercise the real dispatcher contract instead of a looser pre-Phase-65 assumption.

## Verification

- `npm --prefix backend test -- run npcs-step` exited `0` with `23` passing tests total.
  - Existing Phase 64 personality tests remained green.
  - New Phase 65 tests passed for known-IP both tiers, original-world both tiers, once-per-step batch invocation, and fail-closed rejection.
- `npm --prefix backend run typecheck` exited `0`.
- `gitnexus_impact({target: "generateNpcsStep", direction: "upstream"})` reported `LOW` risk before editing: one direct caller (`backend/src/routes/worldgen.ts`) and no broader process fan-out.
- `gitnexus_detect_changes({scope: "staged"})` reported only the staged `generateNpcsStep`/test changes touching one expected worldgen process.
- Scope gates stayed clean:
  - `backend/src/routes/worldgen.ts` unchanged
  - `backend/src/worldgen/scaffold-saver.ts` unchanged
  - `backend/src/character/ingestion/power-assessor.ts` unchanged

## Diff Summary

`backend/src/worldgen/scaffold-steps/npcs-step.ts` changed in four places:

- Added `enrichNpcsBatch` plus `IngestionClassification` / `IngestionContext` imports.
- Removed the inline `if (ipContext && tier === "key")` enrichment block.
- Added a post-loop `ctx` builder plus `buildClassification` callback that maps known-IP runs to `known_ip_canonical` / `known_ip_diverged` and original runs to `original`.
- Replaced per-NPC inline enrichment with a single `enrichNpcsBatch({ items, buildClassification, ctx })` call and wrote the returned drafts back onto `result`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adjusted the call-site context to the real request contract**
- **Found during:** Task 2 (Replace per-loop enrichment gate with post-loop enrichNpcsBatch call)
- **Issue:** The plan text assumed `GenerateScaffoldRequest` exposed `settings`, but the actual type only exposes `research`.
- **Fix:** Built a minimal cast `IngestionContext` with `settings.research` sourced from `req.research`, which is the only settings field the dispatcher reads on this path.
- **Files modified:** `backend/src/worldgen/scaffold-steps/npcs-step.ts`
- **Verification:** `npm --prefix backend test -- run npcs-step` and `npm --prefix backend run typecheck`
- **Committed in:** `809f2e3`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep. The adjustment only reconciled the implementation with the real request type so the planned batch wiring could compile and behave correctly.

## Issues Encountered

- The first RED run failed all tests because the new leaf mocks were exported as plain functions instead of `vi.fn` wrappers. Converting them to `vi.fn` restored the intended signal: only the three new Phase 65 tests failed before the implementation landed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Initial worldgen now emits `draft.powerStats` for every NPC quadrant, so Plan 65-03 can focus on `/regenerate-section` parity and review-payload wiring without revisiting the initial scaffold path.
- The once-per-step batch assertion now locks the desired architecture for future refactors.
- No backend consumer contracts outside worldgen were expanded in this plan.

## Self-Check

PASSED
- Confirmed `.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-02-SUMMARY.md` exists.
- Confirmed task commits `ff8c916` and `809f2e3` are present in `git log --oneline --all`.

---
*Phase: 65-supporting-npc-power-stats-and-review-payload-parity*
*Completed: 2026-04-19*
