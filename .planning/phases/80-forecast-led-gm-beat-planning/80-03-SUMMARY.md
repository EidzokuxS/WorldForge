# Plan 80-03 Summary: Scoped Forecast Excerpts

## Status

Complete.

## What Changed

- GMDecision, BeatPlan, ScenePlanner, final narration, and clarification paths now receive scoped forecast data instead of raw global forecast internals.
- Private/offscreen forecast terms are collected as forbidden terms and used as redaction/filtering guards.
- Recent-conversation prompt assembly in GMDecision, BeatPlan, and ScenePlanner now drops entries containing forbidden private forecast terms.
- Unsafe clarification prompts are replaced with a generic clarification instead of leaking offscreen/private context to chat.

## Verification

- `backend/src/engine/__tests__/gm-turn-decision.test.ts`
- `backend/src/engine/__tests__/gm-beat-plan.test.ts`
- `backend/src/engine/__tests__/scene-planner.test.ts`
- `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts`
- `backend/src/engine/__tests__/prompt-assembler.test.ts`
