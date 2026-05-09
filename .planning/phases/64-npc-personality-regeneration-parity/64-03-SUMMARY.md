---
phase: 64-npc-personality-regeneration-parity
plan: 03
subsystem: testing
tags: [vitest, hono, worldgen, personality, integration]
requires:
  - phase: 64-01
    provides: shared flat-personality schema and mapper reused by worldgen
  - phase: 64-02
    provides: real generateNpcsStep personality mapping and retry behavior
provides:
  - HTTP integration proof that `/api/worldgen/regenerate-section` returns a full nested personality pack for `section="npcs"`
  - explicit separation between route-wiring-only coverage and real-step runtime coverage in the worldgen route tests
affects: [64-05-verification-gate, worldgen-regression-coverage]
tech-stack:
  added: []
  patterns: [real-step route integration via seam mock plus dynamic module reload]
key-files:
  created: [.planning/phases/64-npc-personality-regeneration-parity/64-03-SUMMARY.md, .planning/phases/64-npc-personality-regeneration-parity/deferred-items.md]
  modified: [backend/src/routes/__tests__/worldgen.test.ts]
key-decisions:
  - "Kept the integration proof in the existing worldgen route test file by dynamically rebuilding a fresh Hono app after `vi.doUnmock('../../worldgen/index.js')`, instead of introducing a second test file."
  - "Verified the true full backend suite with `npm --prefix backend test` because `npm --prefix backend test -- run` forwarded an extra positional `run` to Vitest and only exercised a subset of files."
patterns-established:
  - "For route tests that need the real step implementation, unmock the step module, mock only the innermost LLM seam, and rebuild the route module after `vi.resetModules()`."
  - "Keep mocked passthrough route tests explicitly labeled as wiring-only when a later integration test owns the runtime proof."
requirements-completed: [P64-R5]
duration: 9min
completed: 2026-04-19
---

# Phase 64 Plan 03: Regenerate Integration Test Summary

**Real-step `/regenerate-section` NPC personality round-trip proof via a Hono route test that mocks only `safeGenerateObject`**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-19T08:57:44Z
- **Completed:** 2026-04-19T09:06:42Z
- **Tasks:** 2
- **Files modified:** 1 code file, 2 planning artifacts

## Accomplishments

- Re-labeled the existing `section="npcs"` regenerate test in [backend/src/routes/__tests__/worldgen.test.ts](/R:/Projects/WorldForge/backend/src/routes/__tests__/worldgen.test.ts:1889) as route-wiring-only so it no longer implies runtime proof.
- Added a new real-step integration test in [backend/src/routes/__tests__/worldgen.test.ts](/R:/Projects/WorldForge/backend/src/routes/__tests__/worldgen.test.ts:1936) that un-mocks `../../worldgen/index.js`, mocks only `../../ai/generate-object-safe.js`, runs the actual `generateNpcsStep`, and asserts all 7 nested `identity.personality` fields through the HTTP response.
- Verified the new route coverage with `npm --prefix backend test -- run "worldgen"` and the actual full backend suite with `npm --prefix backend test`.

## Task Commits

1. **Task 1: Add real-step integration test mocking only the LLM seam** - `c4357ed` (`test`)

## Files Created/Modified

- [backend/src/routes/__tests__/worldgen.test.ts](/R:/Projects/WorldForge/backend/src/routes/__tests__/worldgen.test.ts:1889) - relabeled the mocked NPC regenerate test and added the real-step runtime integration test at the end of the file
- [.planning/phases/64-npc-personality-regeneration-parity/deferred-items.md](/R:/Projects/WorldForge/.planning/phases/64-npc-personality-regeneration-parity/deferred-items.md:1) - logged the unrelated pre-existing backend typecheck blocker discovered during verification
- [.planning/phases/64-npc-personality-regeneration-parity/64-03-SUMMARY.md](/R:/Projects/WorldForge/.planning/phases/64-npc-personality-regeneration-parity/64-03-SUMMARY.md:1) - plan execution summary

## Decisions Made

- Reused the existing test file instead of splitting into a second route test file because `vi.resetModules()` + `vi.doUnmock("../../worldgen/index.js")` was stable in practice and kept Plan 03 scope to one code file.
- Kept the real-step test on a no-`ipContext` request shape so the integration proof stayed focused on the personality round-trip path, not known-IP enrichment behavior that Plan 03 does not own.

## Deviations from Plan

None in code scope. The only execution-level adjustment was using `npm --prefix backend test` for the real full-suite pass after confirming that the plan-prescribed `npm --prefix backend test -- run` expands to `vitest run run` and does not execute the full backend suite.

## Issues Encountered

- `npm --prefix backend run typecheck` is currently red because [backend/src/scripts/__tests__/backfill-personality.test.ts](/R:/Projects/WorldForge/backend/src/scripts/__tests__/backfill-personality.test.ts:610) expects a `parseArgs` export that the `backfill-personality` script module does not provide. That failure is outside Plan 03 scope, so it was logged in `deferred-items.md` instead of being fixed here.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03 now provides the missing HTTP-level proof for P64-R5: the regenerate route carries the full nested personality pack when the real `generateNpcsStep` runs.
- Plan 04/05 can build on this without revisiting the route test harness.
- The unrelated backend typecheck blocker remains outstanding before any phase that requires a clean `npm --prefix backend run typecheck` gate.

## Self-Check

PASSED

- FOUND: `.planning/phases/64-npc-personality-regeneration-parity/64-03-SUMMARY.md`
- FOUND: `c4357ed`

---
*Phase: 64-npc-personality-regeneration-parity*
*Completed: 2026-04-19*
