# Phase 80 Context: Forecast-Led GM Beat Planning

## Problem

Phase 78 made the turn loop GM-first, and Phase 79 stopped the GM from seeing or acting on the wrong facts. The next failure class is planlessness: the GM can still make a legal local tool plan without a clear human-like agenda for why this beat should happen now, what pressure is developing, and how the world would move if the player did nothing.

The user correction is specific:

- the GM should behave like a human GM, not like disconnected structured-output blocks;
- the GM should have a longer-horizon forecast of likely world/thread movement;
- each turn should derive a small beat plan from the current local scene plus that forecast;
- tool calls should implement the beat plan, not become the plan;
- backend remains the rulebook/world truth and rejects illegal mutations.

## Locked Responsibility Split

Backend owns deterministic truth:

- database state, IDs, refs, schema validation, rolls, persistence, rollback, legal tool execution, invariant enforcement;
- forecast storage/invalidation mechanics, but not semantic truth invention;
- prompt-safe scoping of what the GM may see.

LLM/GM owns semantic intent:

- interpreting raw player text;
- deciding whether the next beat needs no roll, a roll, a tool plan, clarification, or pure narration;
- maintaining an advisory forecast of likely pressures and trajectories;
- deriving a per-turn beat plan before asking backend tools to change state;
- giving the storyteller a settled, player-facing beat packet.

Forecasts and beat plans are advisory GM notes. They must never directly mutate state. Only validated backend tools do.

## Target Outcome

Normal `/action` processing becomes:

1. Backend assembles current local scene and player-known context.
2. GM makes or refreshes a bounded forecast when needed.
3. GM decides the current turn posture from player input and scene context.
4. GM writes a per-turn beat plan: what this beat is trying to accomplish, why now, what should be revealed, and what tools are justified.
5. Backend validates and executes legal state-changing tools only.
6. Storyteller receives local scene truth plus a settled player-facing beat packet, not private forecast internals.

The player should feel that the world has pressure and direction, but the GM should not railroad them or leak remote/offscreen facts.

## Anti-Goals

- Do not let forecast text directly alter DB state.
- Do not expose private/offscreen forecast details to final narration.
- Do not force rolls for ordinary dialogue or ambience.
- Do not make backend classify prose intent with regexes or semantic string matching.
- Do not replace Phase 79 grounding with broader prompt dumps.
- Do not make background simulation delay the visible player response unless the plan explicitly proves it is needed.

## Required Regression Cases

1. **Remote forecast isolation:** A remote/offscreen pressure can exist in the forecast artifact but must not appear in a local Shibuya beat prompt unless surfaced as player-known/local context.
2. **BeatPlan is not ScenePlan:** BeatPlan cannot carry direct HP/location/inventory/durable-event deltas.
3. **Tool execution still authoritative:** ScenePlanner cannot execute forecast-only refs or ungrounded tool arguments.
4. **Rollback safety:** failed tool plan/turn restore must not persist a new forecast as if the turn happened.
5. **Invalidation:** durable events or major state changes invalidate/refresh relevant forecast entries; scene-local transient `log_event` does not.
6. **Narration boundary:** final narration sees settled local beat notes, not private forecast internals.

## Phase Exit Gate

Phase 80 is complete only when a normal player turn cannot reach runtime tool execution or final narration without an explicit per-turn beat plan, and tests prove forecasts remain scoped, advisory, rollback-safe, and separate from backend authority.
