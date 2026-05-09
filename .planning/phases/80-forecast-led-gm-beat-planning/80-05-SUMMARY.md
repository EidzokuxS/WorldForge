# Plan 80-05 Summary: Turn Processor And ScenePlanner Integration

## Status

Complete.

## What Changed

- Normal `/action` turn order now runs forecast scoping and GM BeatPlan before ScenePlanner execution.
- ScenePlanner receives a redacted BeatPlan projection, not raw private forecast data.
- Non-clear actor candidates are no longer promoted into forecast refs, preventing unclear/background actors from becoming legal local handles.
- ScenePlanner recent-conversation context now respects model-facing safety plus forecast forbidden terms.
- Validation still treats backend tools and ids as the authority for state mutation.

## Verification

- `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts`
- `backend/src/engine/__tests__/scene-planner.test.ts`
- `backend/src/engine/__tests__/scene-plan-validator.test.ts`
- `backend/src/engine/__tests__/tool-executor.test.ts`
