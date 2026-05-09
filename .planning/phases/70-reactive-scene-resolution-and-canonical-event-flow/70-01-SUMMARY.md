---
phase: 70-reactive-scene-resolution-and-canonical-event-flow
plan: 01
subsystem: backend-engine
tags: [scene-plan, scene-frame, narrator-packet, zod, vitest, tdd]
requires:
  - phase: 69-judge-owned-hidden-pass-migration-and-narrator-only-runtime
    provides: "Judge-owned hidden adjudication and deterministic backend execution baseline"
provides:
  - "Backend-local SceneFrame contract with active/support/background roster buckets and capped candidates"
  - "Strict ScenePlan schema using runtimeToolInputSchemas and reference-only narratorFacts"
  - "ScenePlan validator, executor, planner shell, NarratorPacket, and canonical ordering constants"
  - "Wave 0 contract tests for SceneFrame, ScenePlan, validation, packet projection, and ordering"
affects: [phase-70, backend-engine, turn-processor, scene-planner, narrator-packet]
tech-stack:
  added: []
  patterns:
    - "Contract-first TDD with RED test commits before backend-local module creation"
    - "Strict Zod model-output boundary before deterministic tool execution"
    - "NarratorPacket prompt projection excludes hidden actor names and hidden rationale"
key-files:
  created:
    - backend/src/engine/scene-frame.ts
    - backend/src/engine/scene-plan-schema.ts
    - backend/src/engine/scene-planner.ts
    - backend/src/engine/scene-plan-validator.ts
    - backend/src/engine/scene-plan-executor.ts
    - backend/src/engine/narrator-packet.ts
    - backend/src/engine/__tests__/scene-frame.test.ts
    - backend/src/engine/__tests__/scene-planner.test.ts
    - backend/src/engine/__tests__/scene-plan-validator.test.ts
    - backend/src/engine/__tests__/scene-turn-packet.test.ts
    - backend/src/engine/__tests__/turn-processor.scene-plan.test.ts
  modified: []
key-decisions:
  - "Kept all Phase 70 Wave 0 contracts backend-local with no shared-package exports."
  - "Used UUID actor/reference schema fields so display names remain context only."
  - "Kept live turn behavior unchanged; ordering is pinned by contract constants for later wiring plans."
patterns-established:
  - "ScenePlan planned actions carry action id, actor id, RuntimeToolName, runtime schema input, and retain raw ToolResult after execution."
  - "NarratorPacket carries backend-only guard metadata separately from prompt formatting."
requirements-completed: [P70-R1, P70-R2, P70-R3, P70-R4, P70-R5, P70-R6, P70-R7]
duration: 19 min
completed: 2026-04-25
---

# Phase 70 Plan 01: Wave 0 Contracts and Tests Summary

**Backend-local SceneFrame, ScenePlan, validator, executor, and NarratorPacket contracts with Wave 0 tests locking canonical event-flow names and bounds.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-04-25T14:20:29Z
- **Completed:** 2026-04-25T14:39:07Z
- **Tasks:** 2
- **Files created:** 11

## Accomplishments

- Created `SceneFrame` and strict `ScenePlan` contracts with capped arrays, roster buckets, UUID actor references, and runtime tool schema reuse.
- Created validator, executor, planner shell, canonical turn packet, and narrator packet projection surfaces for later live wiring plans.
- Added five Wave 0 contract test files covering schema bounds, actor/tool legality, full `ToolResult` projection, hidden fact exclusion, and canonical ordering.
- Left live runtime path unchanged: no route, processor, DB, or frontend behavior was rewired in 70-01.

## Task Commits

1. **Task 1 RED:** `ff83d57` test(70-01): add failing ScenePlan contract tests
2. **Task 1 GREEN:** `1a82326` feat(70-01): define SceneFrame and ScenePlan contracts
3. **Task 2 RED:** `d48838b` test(70-01): add failing ScenePlan execution tests
4. **Task 2 GREEN:** `6bae532` feat(70-01): define ScenePlan execution contracts

## Files Created/Modified

- `backend/src/engine/scene-frame.ts` - SceneFrame types, roster buckets, caps, and build signature.
- `backend/src/engine/scene-plan-schema.ts` - Strict ScenePlan Zod schema, action caps, response caps, narratorFacts references, and runtime tool input union.
- `backend/src/engine/scene-planner.ts` - Judge-lane planner shell and canonical ordering constants.
- `backend/src/engine/scene-plan-validator.ts` - Actor legality, tool legality, tool input, narratorFacts, and outcome-bound validation.
- `backend/src/engine/scene-plan-executor.ts` - Deterministic ordered execution through `executeToolCall` while preserving raw `ToolResult`.
- `backend/src/engine/narrator-packet.ts` - CanonicalTurnPacket/NarratorPacket projection and prompt formatter.
- `backend/src/engine/__tests__/scene-frame.test.ts` - SceneFrame roster and caps tests.
- `backend/src/engine/__tests__/scene-planner.test.ts` - ScenePlan strict schema and runtime input tests.
- `backend/src/engine/__tests__/scene-plan-validator.test.ts` - Validator legality and outcome-bound tests.
- `backend/src/engine/__tests__/scene-turn-packet.test.ts` - Executor ToolResult and hidden-fact packet tests.
- `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts` - Canonical ordering, retry/rollback, and no `tickPresentNpcs` critical-path contract tests.

## Decisions Made

- Existing function/class/method symbols were not modified, so GitNexus upstream impact analysis was not required for code edits. All code changes were new backend-local modules/tests.
- `narratorFacts` is reference-only (`anchorEventId`, `eventIds`, `responseIds`, `actionIds`, `toolResultRefs`) and rejects prose-bearing fields via strict schema.
- `NarratorPacket` prompt formatting includes visible clear actors and hint signals, while hint/hidden actor names remain backend-only forbidden metadata.

## Impact Analysis

- GitNexus repo context checked: `WorldForge-phase70-execute` index was up to date at commit `be8f2dc`.
- `gitnexus_detect_changes(scope: staged)` before each task commit reported low risk and no affected existing execution flows because changed symbols were new/unindexed.
- Final `gitnexus_detect_changes(scope: all)` reported low risk for remaining uncommitted planning/context files.
- No HIGH or CRITICAL impact warnings occurred.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed and built local test dependencies**
- **Found during:** Task 1 RED
- **Issue:** `npx vitest` initially failed before RED assertions because the isolated worktree had no `node_modules`; typecheck then could not resolve `@worldforge/shared` until the shared workspace package was built.
- **Fix:** Ran root `npm install` enough to install workspace dependencies, then ran `npm --prefix shared run build`.
- **Files modified:** None committed; generated dependency directories are ignored.
- **Verification:** Targeted Vitest reached the intended RED failure, then later typecheck and tests passed.
- **Committed in:** N/A, environment repair only.

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** Environment-only repair. No scope expansion and no production behavior changes.

## Known Stubs

None. Stub scan only found local accumulator arrays and test default override objects; no user-facing placeholder data or unwired mock flow was introduced.

## Issues Encountered

- `npm install` exceeded the 120s command timeout, but enough dependencies were installed for Vitest. `npm --prefix shared run build` completed the missing shared package build.
- Existing dirty `CLAUDE.md` and `.planning/STATE.md` were present before 70-01 code edits; `CLAUDE.md` was not staged or committed by this plan.
- GSD state helpers advanced the plan counter and roadmap progress. Optional metric/decision/session helpers reported missing sections in the existing compact `STATE.md`; Phase 70 requirement IDs were not present in `REQUIREMENTS.md`, so `requirements mark-complete` had no matching entries to update.

## Verification

- `cd backend && npx vitest run src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/scene-planner.test.ts` - RED failed on missing modules, then GREEN passed 10 tests.
- `cd backend && npx vitest run src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/scene-turn-packet.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts` - RED failed on missing modules, then GREEN passed 14 tests.
- `npm --prefix backend run typecheck` - passed.
- `cd backend && npx vitest run src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/scene-turn-packet.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts` - passed 5 files, 24 tests.
- `npm --prefix backend test` - passed 131 files and 1606 tests; 3 suites skipped, 30 todo.

## TDD Gate Compliance

- RED commits exist: `ff83d57`, `d48838b`.
- GREEN commits exist after RED: `1a82326`, `6bae532`.
- No refactor commit was needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `70-02`: downstream plans can import stable backend-local names for `SceneFrame`, `ScenePlan`, validator, executor, and narrator packet wiring without inventing parallel contract shapes.

## Self-Check: PASSED

- Verified all 11 created code/test files and `70-01-SUMMARY.md` exist.
- Verified task commits exist: `ff83d57`, `1a82326`, `d48838b`, `6bae532`.

---
*Phase: 70-reactive-scene-resolution-and-canonical-event-flow*
*Completed: 2026-04-25*
