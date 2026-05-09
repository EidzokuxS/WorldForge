# Phase 79 Summary

## Scope

Phase 79 fixed the GM epistemic boundary after live play showed the GM could treat offscreen/background facts as if they were local scene truth. The target bug class was the Forest Outpost-style failure: a local Shibuya turn should not see or act on remote/background locations, actors, or pending simulation facts unless they have been surfaced into the current scene or player-known context.

## What Changed

### 79-01 Model-Facing Scene Boundary

- Added the model-facing scene packet as the GM/ScenePlanner prompt boundary for player turns.
- Split local scene truth, player-known facts, hidden/background actors, local recent events, and allowed tool candidates before prompt assembly.
- Added prompt leak tests so hidden/offscreen actor names and remote locations do not appear in GM decision, ScenePlanner, or final narration prompts.
- Replaced raw actor ID lists in `scene.frame` logs with counts and safe diagnostics.

### 79-02 Tool Grounding

- Added the tool execution context seam for local player-turn grounding.
- Changed runtime `spawn_npc` usage toward backend-approved `locationRef` grounding instead of free-text world names.
- Added whole-plan prevalidation before any runtime tool mutates state.
- Locked wrong-location and mixed legal-plus-illegal plans so a remote `spawn_npc` rejects atomically before DB writes, canonical events, or narration effects.

### 79-03 Durable Event And Narrator Isolation

- Made `log_event` scene-local by default; durable persistence now requires explicit durable intent plus future relevance.
- Filtered scene assembly to ignore failed tool calls, scene-local log events, remote spawn results, and remote pending facts.
- Isolated final narration prompt construction from broad global memory when a local NarratorPacket exists.

### 79-04 Guardrails And Observability

- Added reason-coded grounding failures: `remote_location_ref`, `hidden_actor_ref`, `unexposed_item_ref`, and `ambiguous_entity_ref`.
- Added safe pre-execution diagnostics that log tool name, reason code, path, counts, and scope without hidden names, raw tool inputs, or remote location strings.
- Added `/action` and `/retry` rollback cleanup that drains pending committed events for the failed tick after snapshot restore.

### Closeout Leak Fix

- Tightened `toPlayerPerceivableWorldBrainDirection()` so player-facing world-brain direction now filters `focalActorNames` and `backgroundActorNames` through perceivable presence reasons, not just `presenceReasons` and `causalBeats`.
- This blocks hidden names such as `Choso` from reappearing through final `[SCENE DIRECTION]` actor lists after the main model-facing packet already filtered them.

## Forest Outpost Leak Status

The leak class is blocked in three layers:

- Prompt boundary: GM, ScenePlanner, and final narration prompts use player/local-facing context and exclude hidden/offscreen terms.
- Validation boundary: illegal remote runtime refs reject with precise grounding reason codes before execution.
- Rollback boundary: failed player turns restore the pre-turn snapshot and drain failed-tick pending committed facts.

## Remaining Phase 80 Gap

Phase 79 prevents the GM from seeing and acting on the wrong facts. It does not yet make the GM planful. Phase 80 must add bounded world forecasts and per-turn beat planning so the GM has a human-like agenda before tools and narration.
