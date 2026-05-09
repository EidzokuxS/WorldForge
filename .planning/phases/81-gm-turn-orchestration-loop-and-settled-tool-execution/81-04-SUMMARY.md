# 81-04 SUMMARY: Validated Tool-Step Execution

## Status

Complete on 2026-05-04.

## What Changed

- Added `backend/src/engine/gm-tool-step.ts`.
  - Executes GM Action Checklist `runtime_tool` steps one concrete candidate request at a time.
  - Validates candidate requests against existing runtime tool schemas.
  - Enforces `frame.allowedTools` again at execution time, even if a caller bypasses checklist validation.
  - Enforces player-turn grounding through `validateToolInputGrounding` before backend mutation.
  - Allows one step-local revision for schema/grounding/tool-executor failures.
  - Caps total candidate requests at 8 and checklist steps at the existing max 6.
  - Marks steps `done`, `revised`, or `skipped`; skipped steps do not expose their expected visible effect as settled truth.
  - Rejects scoped private terms before tool execution.

- Wired live `processTurnScenePlan` mutating paths away from the old giant ScenePlanner mutation path.
  - Current live order is now:
    `SceneFrame -> scoped forecast -> GM Read -> optional Oracle -> GM Action Checklist -> executeGmToolSteps -> NarratorPacket -> final narration`.
  - Direct, continue, and clarification still use the no-mutation settled packet shim from 81-02.
  - `roll_oracle` can now proceed into the checklist/tool-step loop after the Oracle result, so rolls can still create consequences without returning to ScenePlanner.

- Updated ordering contracts and tests.
  - `SCENE_PLAN_TURN_ORDER` now names `optional runGmActionChecklist` and `executeGmToolSteps`.
  - Turn-processor tests now assert the new GM checklist/tool-step path and that the old `runScenePlanner` / `validateScenePlan` / `executeScenePlan` path is not used for live mutating turns.

## Files

- `backend/src/engine/gm-tool-step.ts`
- `backend/src/engine/__tests__/gm-tool-step.test.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/gm-action-checklist.ts`
- `backend/src/engine/prompt-contracts.ts`
- `backend/src/engine/scene-planner.ts`
- `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts`
- `backend/src/engine/__tests__/turn-processor.test.ts`

## Verification

- `npm --prefix backend exec vitest run src/engine/__tests__/gm-tool-step.test.ts src/engine/__tests__/gm-action-checklist.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/turn-processor.test.ts`
  - Passed: 7 files / 167 tests.
- `npm --prefix backend exec vitest run src/engine/__tests__/tool-executor.test.ts`
  - Passed: 4 discovered files / 126 tests. This keeps the DB/tool mutation boundary green under the new caller.
- `npm --prefix backend run typecheck`
  - Passed.
- `git diff --check` on the touched 81-04 files
  - Passed with only existing LF/CRLF warnings.

## Review Closure

The focused review found 81-04 incomplete while `gm-tool-step` was only additive. The blocker was fixed by wiring the live turn path to `runGmActionChecklist` and `executeGmToolSteps`. Review warnings were also addressed:

- Tool executor failures can trigger one step-local revision.
- Private forbidden terms fail closed before execution.
- Skipped steps carry an empty `visibleEffect`.
- Candidate request budget is enforced.

## Remaining Scope

81-05 still owns deeper packet type cleanup. The live path now produces a settled packet through the existing ScenePlan-shaped packet adapter so 81-04 can replace mutation orchestration without rewriting narrator packet ownership in the same slice.
