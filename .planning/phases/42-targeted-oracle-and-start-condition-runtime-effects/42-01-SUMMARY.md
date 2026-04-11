---
phase: 42-targeted-oracle-and-start-condition-runtime-effects
plan: 01
subsystem: api
tags: [oracle, target-resolution, gameplay, vitest, zod]
requires:
  - phase: 36-gameplay-docs-to-runtime-reconciliation-audit
    provides: targetTags gap baseline and supported target taxonomy for gameplay intent
  - phase: 41-checkpoint-complete-simulation-restore
    provides: restore-safe campaign runtime boundary that 42-01 can reuse without new persistence seams
provides:
  - player-turn target-aware Oracle input for character, item, and location/object targets
  - bounded target-candidate extraction seam coordinated with movement detection
  - honest fallback to non-targeted Oracle evaluation when no supported target resolves
affects: [42-02, gameplay, oracle, turn-processing]
tech-stack:
  added: []
  patterns: [backend-owned target resolution, explicit entity-type tag derivation, bounded classifier fallback]
key-files:
  created: [backend/src/engine/target-context.ts]
  modified: [backend/src/engine/turn-processor.ts, backend/src/engine/__tests__/turn-processor.test.ts, backend/src/engine/__tests__/oracle.test.ts]
key-decisions:
  - "Target extraction now prefers entity names already present in parsed intent/method before any classifier fallback runs."
  - "Character targets derive Oracle tags from canonical runtime records; item and location/object targets use normalized stored tags."
  - "Movement-resolved destinations are reused as target candidates so movement turns do not fork into a second parser path."
patterns-established:
  - "Pattern 1: player Oracle evaluation resolves concrete targets in a dedicated helper before calling callOracle."
  - "Pattern 2: unresolved or unsupported targets degrade explicitly to targetTags: [] instead of claiming fake target-aware coverage."
requirements-completed: [GSEM-01]
duration: 24min
completed: 2026-04-11
---

# Phase 42 Plan 01: Target-Aware Oracle Summary

**Player-turn Oracle rulings now resolve concrete character, item, and location/object targets through one backend target-context seam before evaluation**

## Performance

- **Duration:** 24 min
- **Started:** 2026-04-11T15:16:00+03:00
- **Completed:** 2026-04-11T15:39:41+03:00
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added failing regressions that lock `GSEM-01` against the old `targetTags: []` player-turn seam.
- Implemented `target-context.ts` so player Oracle calls resolve supported `character`, `item`, and `location/object` targets before evaluation.
- Kept the extraction contract bounded: parsed `intent/method` wins, movement destinations are reused, and classifier fallback stays narrow and honest.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock target-aware Oracle regressions in tests** - `a24032d` (`test`)
2. **Task 2: Implement normalized target resolution for player Oracle calls** - `a492cd1` (`feat`)

## Files Created/Modified
- `backend/src/engine/target-context.ts` - new normalized target-candidate detection and target-tag derivation seam for player actions
- `backend/src/engine/turn-processor.ts` - wires resolved target tags into `callOracle` instead of hard-coded empty target tags
- `backend/src/engine/__tests__/turn-processor.test.ts` - proves supported targets materially change Oracle input and fallback stays explicit
- `backend/src/engine/__tests__/oracle.test.ts` - keeps `targetTags` pinned as a first-class Oracle payload field

## Decisions Made

- Parsed `intent`/`method` text is the first target source of truth for this phase because it already exists in the backend action contract and avoids inventing a second free-text parser stack.
- The fallback classifier is bounded to known runtime entity names only and is skipped when parsed text or movement detection already resolved a candidate.
- Faction support remains conditional in the helper contract, but Phase 42-01 only proves the mandatory support set: `character`, `item`, and `location/object`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made target-context queries tolerant of `.get()`-only test doubles**
- **Found during:** Task 2 (Implement normalized target resolution for player Oracle calls)
- **Issue:** Existing `turn-processor` tests used lightweight mocked query objects that exposed `get()` but not `all()`, which broke unrelated coverage as soon as the new target helper queried campaign entities.
- **Fix:** Added `readRows()` in `backend/src/engine/target-context.ts` so the helper can read from either `all()` or `get()` query shapes.
- **Files modified:** `backend/src/engine/target-context.ts`
- **Verification:** `npm --prefix backend exec vitest run src/engine/__tests__/oracle.test.ts src/engine/__tests__/turn-processor.test.ts`
- **Committed in:** `a492cd1`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep. The fix only preserved existing test infrastructure while keeping `42-01` inside the target-aware Oracle boundary.

## Issues Encountered

- The worktree already contained unrelated unstaged edits in `turn-processor.ts` and `turn-processor.test.ts`. Commits were staged by selected hunks so `42-01` did not absorb those older changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `GSEM-01` is now implemented and regression-covered.
- `42-02` can build early-game start-condition mechanics on top of the repaired Oracle target seam without reopening player-action target resolution.

## Self-Check: PASSED

- FOUND: `.planning/phases/42-targeted-oracle-and-start-condition-runtime-effects/42-01-SUMMARY.md`
- FOUND: `a24032d`
- FOUND: `a492cd1`
