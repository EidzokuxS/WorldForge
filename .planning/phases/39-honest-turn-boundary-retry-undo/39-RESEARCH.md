# Phase 39: Honest Turn Boundary, Retry & Undo - Research

**Date:** 2026-04-08
**Status:** Ready for planning

## Executive Summary

The current gameplay runtime lies about what a completed turn is.

`processTurn()` emits `done` before post-turn simulation completes, while `retry` and `undo` restore only a narrow pre-turn shell snapshot. That means the player can be shown a completed turn even though NPC/faction/reflection consequences are still mutating the world in the background, and rollback can miss those mutations.

For Phase 39, the planner should treat the problem as:

1. make the completion boundary honest
2. make `retry/undo` restore that same boundary
3. avoid scope creep into persistent checkpoint durability and multi-step history

## What The Planner Needs To Know

### 1. Current Real Turn Boundary

- The visible turn currently ends at `yield { type: "done" }` in `backend/src/engine/turn-processor.ts`.
- That `done` happens before `onPostTurn` finishes.
- `onPostTurn` is explicitly fire-and-forget in `turn-processor.ts`.
- The SSE route in `backend/src/routes/chat.ts` treats generator completion as success and stores the rollback snapshot after the stream loop, but the post-turn systems still continue asynchronously.

### 2. Player-Visible Mutations Still Happening After `done`

These are all wired through `buildOnPostTurn()` in `backend/src/routes/chat.ts`:

- `tickPresentNpcs(...)`
- `simulateOffscreenNpcs(...)`
- `checkAndTriggerReflections(...)`
- `tickFactions(...)`

Why these matter:

- they mutate NPC/world state that later appears in panels, locations, goals, relationships, faction outcomes, and later turns
- they are not just logging or telemetry
- therefore they are inside the player-visible gameplay contract even if they currently happen after `done`

Adjacent side effects also exist:

- episodic embedding
- image generation

These are secondary and should not automatically be treated as part of the authoritative rollback boundary unless they mutate gameplay state directly.

### 3. Why Current Snapshot / Restore Fails `RINT-02` And `SIMF-02`

`backend/src/engine/state-snapshot.ts` currently captures mainly:

- player HP / tags / location / equipped state
- current tick
- spawned / revealed / created IDs for a subset of entities

This is not enough for Phase 39 because:

- it does not capture the full world state that post-turn sim may mutate
- post-turn sim currently runs after `done`, so the player can see a turn as complete before all authoritative consequences land
- `retry/undo` restore a pre-turn shell, but abandoned post-turn mutations may already have leaked into world state

This directly violates:

- `SIMF-02`: player-visible completion boundary is dishonest
- `RINT-02`: `retry/undo` do not necessarily restore the same world boundary the player experienced

## Viable Implementation Shapes

### Shape A: Move Post-Turn Simulation Inside The Authoritative Turn Flow

- `processTurn()` does not emit final completion until present-NPC / off-screen / reflection / faction steps finish
- snapshot is only considered reusable for `retry/undo` after that full boundary
- semantically the cleanest fit for the phase

Tradeoff:

- increases perceived turn latency

### Shape B: Keep A Two-Stage Flow But Make Finalization Explicit And Authoritative

- keep narration streaming first
- add a second explicit stage such as `finalizing_turn`
- UI remains blocked for `retry/undo` and does not treat the turn as done until finalization event arrives
- backend rollback boundary is tied to finalization completion, not narration end

Tradeoff:

- slightly more transport/UI complexity than Shape A

### Shape C: Expand Rollback Capture To A Richer Boundary Snapshot Or Delta Model

Regardless of A or B, rollback needs to cover more than the player shell state.

Needed property:

- capture / restore the world mutations from the last completed turn boundary, not just player fields + spawned IDs

Possible realizations:

- broader snapshot coverage
- structured mutation journal / delta for the last completed turn

Constraint:

- keep it single-step only in Phase 39
- do not turn this into persistent timeline or checkpoint redesign

## Planning Recommendation

Treat the real architectural fork as:

- **A + C**: make `done` truly final and broaden rollback coverage
- **B + C**: introduce explicit turn finalization and broaden rollback coverage

In either case:

- `state-snapshot.ts` is too narrow for `RINT-02`
- a UI-only fix is insufficient
- the planner should keep checkpoint artifacts, restart durability, and multi-step undo out of scope

## Key Files

- `backend/src/engine/turn-processor.ts`
- `backend/src/routes/chat.ts`
- `backend/src/engine/state-snapshot.ts`
- `frontend/app/game/page.tsx`
- `.planning/phases/39-honest-turn-boundary-retry-undo/39-CONTEXT.md`
- `.planning/REQUIREMENTS.md`

---

*Phase: 39-honest-turn-boundary-retry-undo*
*Research generated: 2026-04-08*
