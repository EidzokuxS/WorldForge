# Plan 80-04 Summary: GM BeatPlan Contract And Generation

## Status

Complete.

## What Changed

- Added `backend/src/engine/gm-beat-plan.ts`.
- A turn now has an explicit BeatPlan before ScenePlanner/tool execution or final narration.
- BeatPlan output separates GM intent, player-facing beat notes, ScenePlanner projection, agency guardrails, and diagnostics.
- BeatPlan schema rejects executable/state-mutating payload fields so it cannot become a hidden tool plan.
- ScenePlanner projection formatting redacts forbidden forecast terms before prompt use.

## Verification

- `backend/src/engine/__tests__/gm-beat-plan.test.ts`
- `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts`
- `npm --prefix backend run typecheck`
