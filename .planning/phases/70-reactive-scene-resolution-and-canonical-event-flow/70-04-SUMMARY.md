---
phase: 70-reactive-scene-resolution-and-canonical-event-flow
plan: 04
subsystem: backend-engine
tags: [scene-plan, validator, executor, tool-result, vitest, tdd]
requires:
  - phase: 70-reactive-scene-resolution-and-canonical-event-flow
    provides: "70-02 SceneFrame allow-lists and 70-03 strict ScenePlan output"
provides:
  - "Pure ScenePlan preflight validator with machine-readable issue codes before mutation"
  - "Validated ScenePlan execution through existing executeToolCall service"
  - "Full per-action ToolResult projection with quick-action, travel, canonical-event, and partial-failure evidence"
affects: [phase-70, backend-engine, narrator-packet, canonical-turn-packet, turn-processor]
tech-stack:
  added: []
  patterns:
    - "Validator returns { ok: true } / { ok: false } instead of mutating or throwing during preflight"
    - "Executor throws ScenePlanExecutionError with partial successful ToolResult evidence on first failed action"
key-files:
  created: []
  modified:
    - backend/src/engine/scene-plan-validator.ts
    - backend/src/engine/scene-plan-executor.ts
    - backend/src/engine/__tests__/scene-plan-validator.test.ts
    - backend/src/engine/__tests__/scene-turn-packet.test.ts
key-decisions:
  - "Kept actor references ID-only; display names now produce display_name_actor_reference."
  - "Kept validation side-effect-free and verified it never calls executeToolCall."
  - "Kept executeScenePlan compatible with existing validatedPlan callers while adding the planned plan argument."
patterns-established:
  - "ScenePlan validation checks actor allow-lists, active/background ownership, tool allow-lists, runtime schema inputs, narrator fact references, and Oracle/outcome contradictions before execution."
  - "ExecutedScenePlan carries toolCallResults plus actionResults alias for current packet compatibility."
requirements-completed: [P70-R3, P70-R5, P70-R7]
duration: 11 min
completed: 2026-04-25
---

# Phase 70 Plan 04: ScenePlan Validator and Executor Summary

**Strict ScenePlan preflight plus deterministic ordered runtime-tool execution with full ToolResult evidence.**

## Performance

- **Duration:** 11 min
- **Started:** 2026-04-25T16:00:19Z
- **Completed:** 2026-04-25T16:11:27Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Reworked `validateScenePlan(...)` into a pure result-returning gate that rejects illegal actors, display-name actor references, background actor mutations, hidden narrator facts, prose facts, unsupported tools, invalid tool args, and Oracle/outcome contradictions before mutation.
- Reworked `executeScenePlan(...)` to execute validated planned actions through `executeToolCall` in order and preserve full per-action `ToolResult` metadata.
- Added executor projections for quick actions, successful travel, canonical event metadata, and `ScenePlanExecutionError.partial` evidence when action N fails.
- Expanded focused tests to cover fail-before-mutation validation and rollback-safe executor failure evidence.

## Task Commits

1. **Task 1 RED:** `8c7aa80` test(70-04): add failing ScenePlan validator preflight tests
2. **Task 1 GREEN:** `654b7b7` feat(70-04): implement ScenePlan preflight validator
3. **Task 2 RED:** `43f3239` test(70-04): add failing ScenePlan executor tests
4. **Task 2 GREEN:** `358c9fa` feat(70-04): execute validated ScenePlan actions

## Files Created/Modified

- `backend/src/engine/scene-plan-validator.ts` - Pure preflight validation result, issue-code taxonomy, actor/tool/narrator/outcome checks.
- `backend/src/engine/scene-plan-executor.ts` - Ordered `executeToolCall` bridge with full `ToolResult`, quick-action/travel projections, canonical events, and partial failure error.
- `backend/src/engine/__tests__/scene-plan-validator.test.ts` - TDD coverage for validator and executor behavior.
- `backend/src/engine/__tests__/scene-turn-packet.test.ts` - Compatibility update for the new validator result shape.

## Decisions Made

- Validator now returns `{ ok: false, issues }` instead of throwing so callers can fail loudly before side effects with structured diagnostics.
- `ScenePlanExecutionError` keeps partial successful and failed action evidence in memory; route-level snapshot restore remains the rollback owner in later wiring plans.
- `executeScenePlan` exposes `toolCallResults` while preserving `actionResults` as an alias for existing NarratorPacket tests.

## Impact Analysis

- `executeToolCall` upstream impact before Task 1: LOW, 0 direct callers/processes in the worktree index.
- `validateScenePlan` upstream impact before Task 1: LOW, 0 direct callers/processes.
- `executeScenePlan` upstream impact before Task 2: LOW, 0 direct callers/processes.
- Test helpers `createFrame` and `createPlan` were not indexed GitNexus targets.
- `gitnexus_detect_changes(scope: staged)` before Task 1 GREEN: LOW, 8 changed symbols, 0 affected processes.
- `gitnexus_detect_changes(scope: staged)` before Task 2 GREEN: LOW, 4 changed symbols, 0 affected processes.
- Final `gitnexus_detect_changes(scope: all)` reported only the pre-existing dirty `CLAUDE.md` GitNexus/context drift, 0 affected processes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Resolved missing read-first context file**
- **Found during:** Task 1 read-first gate
- **Issue:** Plan listed `backend/src/engine/combat-bounds.ts`, but that file does not exist in this worktree.
- **Fix:** Located current bounds/envelope types in `backend/src/engine/combat-envelope.ts` and used that file as the source of truth.
- **Files modified:** None
- **Verification:** `rg --files backend/src/engine | rg "combat|bounds"` showed `combat-envelope.ts` and combat tests only.
- **Committed in:** N/A, context repair only.

**2. [Rule 3 - Blocking] Updated existing packet tests for validator result shape**
- **Found during:** Task 1 typecheck
- **Issue:** `scene-turn-packet.test.ts` still passed the old thrown/validated object directly into `executeScenePlan`.
- **Fix:** Added a test helper that unwraps `{ ok: true, plan }` and updated the three affected calls.
- **Files modified:** `backend/src/engine/__tests__/scene-turn-packet.test.ts`
- **Verification:** `npm --prefix backend run typecheck` and targeted packet/validator Vitest passed.
- **Committed in:** `654b7b7`

---

**Total deviations:** 2 auto-fixed (Rule 3 blocking)
**Impact on plan:** Both were compatibility/context repairs required to complete the planned validator contract. No production scope expansion beyond the planned validator/executor surface.

## Known Stubs

None. Stub scan found only local accumulator arrays/default test override objects and nullable travel state; no placeholder UI/data flow or unwired mock behavior was introduced.

## Issues Encountered

- `CLAUDE.md` was dirty before execution and remained unstaged/uncommitted as requested.
- GitNexus index now trails the new task commits; re-analysis was not run to avoid rewriting the already-dirty GitNexus/context files in this isolated worktree.

## Verification

- `cd backend && npx vitest run src/engine/__tests__/scene-plan-validator.test.ts` - RED failed for Task 1, then GREEN passed 11 tests.
- `npm --prefix backend run typecheck` - passed after Task 1 once packet-test compatibility was updated.
- `cd backend && npx vitest run src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/scene-turn-packet.test.ts` - passed 2 files, 14 tests.
- `cd backend && npx vitest run src/engine/__tests__/scene-plan-validator.test.ts` - RED failed for Task 2, then GREEN passed 15 tests.
- `npm --prefix backend run typecheck` - passed final verification.
- `cd backend && npx vitest run src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/tool-executor.test.ts` - passed 2 files, 50 tests.
- Acceptance `rg` checks passed for required validator issue codes, `runtimeToolInputSchemas[...]`/`safeParse`, validation not calling `executeToolCall`, and executor quick-action/travel/ToolResult markers.

## TDD Gate Compliance

- RED commits exist: `8c7aa80`, `43f3239`.
- GREEN commits exist after RED: `654b7b7`, `358c9fa`.
- No refactor commit was needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `70-05`: NarratorPacket work can consume validated plans and executed tool evidence without trusting LLM prose or lossy tool summaries.

## Self-Check: PASSED

- Verified `70-04-SUMMARY.md`, `scene-plan-validator.ts`, `scene-plan-executor.ts`, `scene-plan-validator.test.ts`, and `scene-turn-packet.test.ts` exist.
- Verified task commits exist: `8c7aa80`, `654b7b7`, `43f3239`, `358c9fa`.

---
*Phase: 70-reactive-scene-resolution-and-canonical-event-flow*
*Completed: 2026-04-25*
