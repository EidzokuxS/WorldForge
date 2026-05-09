# Phase 80 Summary: Forecast-led GM Beat Planning

## Status

Complete on code and deterministic tests. Live provider/playtest validation remains an explicit follow-up gate.

## Outcome

Phase 80 adds a planning layer between local scene understanding and tool/narration execution. The turn pipeline now gives the GM a bounded forecast and a per-turn BeatPlan before any ScenePlan/tool mutation or final prose is produced.

The intended role split is now represented in code:

- Backend remains the rulebook and world truth.
- GMDecision interprets the player's prose and chooses the kind of turn resolution.
- BeatPlan explains what the GM is trying to do this turn, why now, and what must remain player-facing.
- ScenePlanner receives only grounded local context plus a redacted BeatPlan projection.
- Narrator receives a settled player-facing packet, not raw private forecast or tool internals.

## Implemented Slices

1. Forecast contract and staged advisory storage.
2. Forecast builder and refresh path.
3. Scoped forecast excerpts with private/offscreen guardrails.
4. GM BeatPlan contract, prompt, validation, and projection.
5. Turn processor and ScenePlanner integration.
6. Narrator packet integration, rollback checks, and focused verification.

## Key Files

- `backend/src/engine/world-forecast.ts`
- `backend/src/engine/world-forecast-builder.ts`
- `backend/src/engine/gm-beat-plan.ts`
- `backend/src/engine/gm-turn-decision.ts`
- `backend/src/engine/scene-planner.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/narrator-packet.ts`
- `backend/src/engine/prompt-assembler.ts`

## Verification

See `80-VERIFICATION.md`.
