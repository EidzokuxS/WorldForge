---
phase: 45
phase_name: Authoritative Scene Assembly & Start-of-Play Runtime
milestone: v1.1
updated: 2026-04-12
status: discussed
requirements:
  - SCEN-01
depends_on:
  - 39
  - 41
  - 42
  - 43
---

# Phase 45 Context

## Goal

Make the opening scene and every turn's narrated output derive from one authoritative world-state assembly pass instead of premise-dumps, duplicated narration, or scene text that races ahead of local simulation.

## Why This Phase Exists

Live gameplay surfaced a cluster of related failures:

- the first playable text can read like a premise dump instead of a grounded opening scene
- narrated output can duplicate or restart itself
- narrated output can feel disconnected from the underlying NPC/world state
- present-scene and off-screen world changes are not yet governed by one clear causal contract

This phase owns the authoritative scene assembly contract. It does not yet solve full encounter-scope and knowledge-boundary issues across large locations; that remains the center of Phase 46.

## Locked Product Decisions

### D-01: Turn narration happens after local scene settlement

For a player turn, the backend must first settle:

- the player action
- locally relevant NPC actions
- other locally relevant world changes

Only after that may the storyteller produce the final narrated message for the turn.

Implications:

- no streaming narrative that later gets contradicted by local NPC/world tails
- no "message first, world catches up later" contract for the current scene
- one final narration pass per turn

### D-02: The opening message is not the premise

The first playable message must be generated from runtime opening state, especially:

- start location
- immediate situation
- entry pressure
- visible actors
- visible local events

The campaign premise remains engine/background truth, not the opening message itself.

### D-03: Scene text is bounded by player-perceivable consequences

Narration should include what the player character could perceive within the current scene boundary, not merely what happened in the same location and not arbitrary off-screen state.

Player-perceivable consequences may include:

- direct sight
- audible effects
- tactile or ambient effects
- obvious environmental consequences
- immediate credible signals passed into the scene

Off-screen world updates are still part of one causal world, but they enter narrated scene text only through perceivable effects.

### D-04: Storyteller assembles from simulation output, not free invention

The storyteller should receive an already assembled set of scene-relevant facts/effects from the runtime pipeline. It should not invent material world events to make the scene feel fuller.

## Runtime Interpretation

The current runtime already distinguishes:

- present key NPCs: fully ticked in-scene
- off-screen key NPCs: batch-simulated in summarized world mode

Phase 45 does not remove that distinction, but it requires both modes to feed one coherent causal world. The difference is simulation depth and player perception, not separate realities.

## Out of Scope

- full encounter-scope reform for large locations
- strict knowledge-boundary repair between unseen/unmet actors
- richer readability / typography / rich text
- anti-slop prose research and prompt overhauls as a dedicated quality track

Those belong primarily to Phases 46, 47, and 50.
