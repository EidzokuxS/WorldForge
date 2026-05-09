---
phase: 78-gm-first-turn-orchestration-and-oracle-on-demand
plan: 78-03
subsystem: backend
tags: [gm-first, scene-planner, oracle-on-demand, structured-output, rulebook-boundary]
requires:
  - phase: 78-gm-first-turn-orchestration-and-oracle-on-demand
    provides: "78-01 RED contracts and 78-02 neutral SceneFrame boundary"
provides:
  - "Frame-validated GmTurnDecision schema and judge runner"
  - "Prompt contract text for GM-first path selection and backend-rulebook authority"
  - "ScenePlanner support for binding GM decisions and optional Oracle context"
affects: [gm-turn-decision, scene-planner, prompt-contracts]
tech-stack:
  added: []
  patterns: [Zod discriminated union, safeGenerateObject judge call, frame-aware validation, optional Oracle prompt context]
key-files:
  created: []
  modified:
    - backend/src/engine/gm-turn-decision.ts
    - backend/src/engine/prompt-contracts.ts
    - backend/src/engine/scene-planner.ts
    - backend/src/engine/__tests__/gm-turn-decision.test.ts
    - backend/src/engine/__tests__/scene-planner.test.ts
key-decisions:
  - "GmTurnDecision is a strict discriminated union over exactly direct, roll_oracle, tool_plan, combat_transition, clarification, and continue."
  - "roll_oracle is the only decision path with rollRequest; tool_plan and combat_transition cannot request fresh randomness."
  - "ScenePlanner now accepts gmDecision plus optional oracleResult, so direct, continue, and clarification do not require Oracle."
requirements-completed: [P78-R1, P78-R3, P78-R4, P78-R5, P78-R7]
duration: 6min
completed: 2026-05-03
---

# Phase 78 Plan 78-03: GM/Judge First Decision Contract Summary

**GM-first turn decision contract with on-demand Oracle gating and decision-aware ScenePlanner prompts.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-05-03T03:08:25Z
- **Completed:** 2026-05-03T03:13:42Z
- **Tasks:** 2
- **Files modified:** 5 committed files

## Accomplishments

- Replaced the Phase 78-01 `runGmTurnDecision` stub with a `safeGenerateObject` judge runner using temperature `0`, one retry, trace logging, and frame-aware validation.
- Strengthened `gmTurnDecisionSchema` into strict per-path output contracts for direct, roll_oracle, tool_plan, combat_transition, clarification, and continue.
- Added validation that model-selected refs come from neutral `SceneFrame` candidates/actors and that planned tools are in `frame.allowedTools`.
- Added GM decision prompt contract text that preserves backend ownership of IDs, validation, allowed tools, deterministic math, random rolls, persistence, rollback, and final truth.
- Extended `runScenePlanner` to accept a binding `gmDecision` and optional `oracleResult`, with prompt guidance for zero-action/no-mutation direct, continue, and clarification paths.

## Task Commits

1. **Tasks 1-2: GM decision and ScenePlanner integration** - `0ebb99c` (`feat`)

## Files Created/Modified

- `backend/src/engine/gm-turn-decision.ts` - Implements strict decision schema, frame-aware validation, judge runner, and structured trace logging.
- `backend/src/engine/prompt-contracts.ts` - Adds `gm-turn-decision.v1` prompt contract and decision-aware ScenePlanner authority text.
- `backend/src/engine/scene-planner.ts` - Accepts optional Oracle and binding GM decision context.
- `backend/src/engine/__tests__/gm-turn-decision.test.ts` - Covers all decision paths, fail-closed invalid outputs, prompt constraints, and frame validation.
- `backend/src/engine/__tests__/scene-planner.test.ts` - Covers direct, continue, clarification, and roll_oracle ScenePlanner behavior with optional Oracle.

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/gm-turn-decision.test.ts` - PASS, 6 tests.
- `npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts` - PASS, 35 tests.
- `npm --prefix backend run test -- src/engine/__tests__/gm-turn-decision.test.ts src/engine/__tests__/scene-planner.test.ts` - PASS, 41 tests.
- `npm --prefix backend run typecheck` - PASS.
- `mcp__gitnexus__.detect_changes({ scope: "staged" })` - staged scope matched the five 78-03 files; aggregate risk was high because `runScenePlanner` is in scope.

## GitNexus Impact

- `runScenePlanner` - LOW, 0 direct callers/processes reported.
- `safeGenerateObject` - CRITICAL shared dependency, 14 direct dependents and 6 affected processes; not edited, only called through existing pattern.
- `semanticScenePlanToStrictPlan` - LOW, direct affected symbol `parseSemanticScenePlan`, indirect `runScenePlanner`.
- `buildScenePlannerPromptContract` - LOW, direct affected `buildDefaultScenePlannerPrompt`, indirect `runScenePlanner`.
- `buildRuntimeToolInputContract` - LOW, direct affected `buildScenePlannerPromptContract` and `buildHiddenAdjudicationPromptContract`.

No HIGH or CRITICAL impact gate was returned for edited production symbols. The only CRITICAL result was for `safeGenerateObject`, which was intentionally not modified.

## Decisions Made

- Kept GM decision validation in the GM module rather than teaching ScenePlanner to infer missing targets/tools.
- Allowed direct, continue, and clarification ScenePlanner calls to produce valid zero-action ScenePlan-compatible artifacts.
- Kept Oracle optional at the ScenePlanner boundary; Oracle remains binding only when supplied.

## Deviations from Plan

None - plan executed as written.

## Known Stubs

None. Stub scan found only local empty arrays/default object parameters in implementation/tests, not placeholder UI/data behavior.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: ai-boundary | `backend/src/engine/gm-turn-decision.ts` | Adds a new judge structured-output boundary for semantic turn interpretation. Mitigated by strict Zod schema, frame-aware ref/tool validation, and fail-closed errors. |

## Issues Encountered

- `gsd-sdk query` is unavailable in this workspace; execution used the explicit user-provided plan path.
- The workspace had substantial unrelated dirty state before execution, including `.planning/STATE.md`, `.planning/ROADMAP.md`, and `backend/src/engine/turn-processor.ts`. Those files were not touched, staged, or committed.
- State/roadmap/requirements updates were skipped to avoid committing unrelated pre-existing dirty planning files.

## User Setup Required

None.

## Next Phase Readiness

78-04 can wire `runGmTurnDecision` into turn orchestration and call Oracle only for `roll_oracle`, while preserving backend validation/execution as final truth.

## Self-Check: PASSED

- Found modified files:
  - `backend/src/engine/gm-turn-decision.ts`
  - `backend/src/engine/prompt-contracts.ts`
  - `backend/src/engine/scene-planner.ts`
  - `backend/src/engine/__tests__/gm-turn-decision.test.ts`
  - `backend/src/engine/__tests__/scene-planner.test.ts`
- Found summary file: `.planning/phases/78-gm-first-turn-orchestration-and-oracle-on-demand/78-03-SUMMARY.md`
- Found commit: `0ebb99c`
- Confirmed no file deletions in `0ebb99c`.

---
*Phase: 78-gm-first-turn-orchestration-and-oracle-on-demand*
*Completed: 2026-05-03*
