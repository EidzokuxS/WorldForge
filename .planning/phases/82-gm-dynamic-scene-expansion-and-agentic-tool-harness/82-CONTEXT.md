# Phase 82 Context - GM Dynamic Scene Expansion And Agentic Tool Harness

## Why This Phase Exists

Phase 81 corrected the turn shape: compact GM Read, conditional Action Checklist, sequential validated tool steps, and settled narration. The next live-play gap is that the GM can still behave as if only pre-authored locations and pre-authored characters exist.

WorldForge already has the bones for dynamic scene expansion:

- database location kind `ephemeral_scene`;
- anchored spillover through `anchorLocationId`;
- temporary NPC tier;
- `reveal_location` and `spawn_npc` runtime tools;
- `currentLocationId` plus `currentSceneLocationId/currentSceneScopeId` presence model.

But the product behavior is partial. `reveal_location` creates ephemeral scenes without clear lifetime. Temporary NPCs persist indefinitely unless something else changes them. `spawn_npc` can place a current-scene NPC with incorrect broad/scene identity when the scene is a sublocation. The GM also does not receive a crisp "you may create a local stage pocket or support NPC when fiction needs it" affordance.

## User Direction

- Do not make a clone of Marinara.
- Do not fully trust the LLM with world truth.
- Do give the LLM enough freedom to act like a GM inside backend rules.
- Do not add one giant schema where the GM must plan, mutate, and narrate in one request.
- Use a normal tool loop: small action, backend validation, structured observation, next action.
- Let dynamic locations and NPCs be tools the GM can use when appropriate, not things it spams every turn.
- Full visual migration is next, but gameplay/tool behavior comes first.

## Requirements

- P82-R1: Model-facing GM context explicitly explains when dynamic local scene expansion is allowed: anchored ephemeral sublocations under current broad/persistent location, support NPCs, reuse-before-create, and promotion only when the fiction makes them durable. Temporary props/items are deferred from Phase 82 scope.
- P82-R2: `reveal_location` or its replacement creates anchored ephemeral sublocations with correct parent/anchor/current-scene semantics, lifetime metadata, result observations, and no remote/offscreen anchoring from player turns.
- P82-R3: Ephemeral scenes have an intentional lifecycle: active while relevant, archived/expired after bounded turns or explicit retirement, with important events spilling to a persistent anchor and archived scenes excluded from normal traversal/presence.
- P82-R4: `spawn_npc` can create support/temporary NPCs in the current scene or a newly created ephemeral scene with correct broad `currentLocationId`, scoped `currentSceneLocationId`, provenance, lifetime, and no accidental same-macro leakage.
- P82-R5: Support NPCs can be retired or promoted deliberately; temporary background service actors do not accumulate forever in playable scene rosters.
- P82-R6: The GM tool harness returns compact structured observations after each tool step, exposes next allowed tools/refs, blocks repeated equivalent calls with a concrete per-turn key, and uses semantic budgets instead of duration caps.
- P82-R7: UI/SSE progress exposes exact dynamic tool stages (`creating-local-scene`, `spawning-support-npc`, `settling-tool-observation`, `cleaning-transient-scene`) without claiming completion before backend truth settles.
- P82-R8: Fresh-campaign live play proves the GM creates a local ephemeral sublocation/support NPC when fiction needs one, reuses a suitable existing local affordance before creating another, does not spam dynamic creation on ordinary turns, cleans or promotes transient objects, and narrates only settled truth.

## Anti-Goals

- Do not give the model global free-text location/NPC creation authority.
- Do not create persistent world locations for every incidental room, counter, alley, clerk, guard, passerby, or prop.
- Do not implement temporary props/items in this phase; they need their own owned runtime model later.
- Do not delete canonical locations/NPCs during cleanup.
- Do not hide tool failures behind final prose.
- Do not reintroduce duration-based turn timeouts.
- Do not migrate the whole visual frontend in this phase.

## Exit Gate

Phase 82 is complete only when deterministic tests and a fresh live playtest both show that dynamic scene/NPC tools behave like a GM's local staging kit: available, grounded, useful, bounded, inspectable, and not spammy.
