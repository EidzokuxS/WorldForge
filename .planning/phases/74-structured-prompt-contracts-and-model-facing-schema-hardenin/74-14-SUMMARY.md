---
phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin
plan: 14
subsystem: engine
tags: [engine, npc-offscreen, structured-output, zod, validation, vitest]

requires:
  - phase: 74-09
    provides: NPC offscreen prompt contract text and marker tests
  - phase: 74-10
    provides: fail-closed structured-output repair policy
provides:
  - Prompt-aligned NPC offscreen update field caps in backend validation
  - Dynamic offscreen update batch limit based on listed NPC count
  - Regression tests for overlong fields and excess updates before persistence
affects: [phase-74, npc-offscreen, rollback-critical-post-turn, structured-output-validation]

tech-stack:
  added: []
  patterns:
    - Zod string caps mirror prompt-contract advertised limits
    - Dynamic batch caps are enforced after LLM output and before DB/vector writes

key-files:
  created:
    - .planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/74-14-SUMMARY.md
  modified:
    - backend/src/engine/npc-offscreen.ts
    - backend/src/engine/__tests__/npc-offscreen.test.ts

key-decisions:
  - "NPC offscreen schema caps now live in the same validation path that parses generated updates."
  - "Update batch count is capped by the listed offscreen NPC count immediately before applying updates."

patterns-established:
  - "Prompt-contract caps must be mirrored by deterministic Zod validation before persistence."
  - "Optional support simulation may fail closed on invalid structured output rather than trimming or inventing missing semantics."

requirements-completed: [P74-R2, P74-R3, P74-R4, P74-R5]

duration: 4min
completed: 2026-04-30
---

# Phase 74 Plan 14: NPC Offscreen Schema Caps and Dynamic Update Count Summary

**NPC offscreen structured updates now reject overlong fields and excess batches before DB or episodic-memory writes.**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-30T09:17:52Z
- **Completed:** 2026-04-30T09:21:40Z
- **Tasks:** 1 TDD task
- **Files modified:** 2

## Accomplishments

- Added prompt-aligned `.max()` validation for `npcName`, `newLocation`, `actionSummary`, and `goalProgress`.
- Reworked `parseOffscreenUpdates()` to perform runtime schema parsing instead of trusting typed LLM output.
- Enforced `updates.length <= offscreenKeyNpcs.length` before any `applyOffscreenUpdate()` call.
- Added regressions for overlong offscreen fields and excess updates before persistence.

## Task Commits

1. **Task 1 RED: Add failing NPC offscreen schema cap tests** - `4d3ba61` (test)
2. **Task 1 GREEN: Enforce NPC offscreen schema caps** - `b808226` (feat)

## Files Created/Modified

- `backend/src/engine/npc-offscreen.ts` - Adds capped offscreen update schema, parse-time validation, and dynamic listed-NPC update limit.
- `backend/src/engine/__tests__/npc-offscreen.test.ts` - Adds overlong field and excess update regressions.
- `.planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/74-14-SUMMARY.md` - Execution summary and verification record.

## Decisions Made

- Kept enforcement in the existing NPC offscreen validation path rather than adding sanitizer behavior.
- Used parse-time rejection for dynamic batch count so invalid excess updates fail before persistence.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- GitNexus staged `detect_changes` reported HIGH risk because `simulateOffscreenNpcsInternal` participates in rollback-critical post-turn flows. The staged diff was limited to NPC offscreen validation/tests, and focused tests plus backend typecheck passed.
- `npx gitnexus analyze` emitted repeated `MaxListenersExceededWarning` warnings after commits, but completed successfully and left the index current.

## GitNexus Scope

- Pre-edit impact for `simulateOffscreenNpcs`: LOW risk; direct caller `runRollbackCriticalPostTurn`; affected process `runRollbackCriticalPostTurn`.
- Pre-edit impact for `parseOffscreenUpdates`: LOW risk; direct caller `simulateOffscreenNpcsInternal`; affected process `runRollbackCriticalPostTurn`.
- Pre-GREEN staged scope: changed symbols matched NPC offscreen validation/test scope; affected flows were rollback-critical post-turn flows expected for this seam.

## Known Stubs

None. Stub scan found only existing typed empty/default initialization patterns in tests and runtime locals, not placeholder behavior introduced by this plan.

## Threat Flags

None. This plan hardened an existing LLM-output to persistence trust boundary and introduced no new endpoint, auth path, file access pattern, or database schema change.

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/npc-offscreen.test.ts` - PASS, 14 tests.
- `npm --prefix backend run typecheck` - PASS.
- `rg -n "max\\(OFFSCREEN_NPC_NAME_MAX\\)|max\\(OFFSCREEN_LOCATION_MAX\\)|max\\(OFFSCREEN_ACTION_SUMMARY_MAX\\)|max\\(OFFSCREEN_GOAL_PROGRESS_MAX\\)|parseOffscreenUpdates\\(object\\.updates, offscreenKeyNpcs\\.length\\)" backend/src/engine/npc-offscreen.ts` - PASS.
- `npx gitnexus status` - PASS, indexed commit `b808226` equals current commit.

## TDD Gate Compliance

- RED gate commit present: `4d3ba61`.
- GREEN gate commit present: `b808226`.
- Refactor gate: not needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 74-15 can reconcile the Phase 74 verification matrix and requirement status with the NPC offscreen schema gap closed.

## Self-Check: PASSED

- Summary file exists.
- Modified source and test files exist.
- Task commits found: `4d3ba61`, `b808226`.

---
*Phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin*
*Completed: 2026-04-30*
