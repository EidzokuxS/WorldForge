# Phase 82 Spec - Dynamic GM Staging Kit

## Product Contract

The GM may create local scene affordances when the fiction naturally requires them:

- a counter, side room, booth, checkpoint, alley, dock, clerk desk, hidden alcove, or temporary encounter space under the current location;
- a guard, clerk, messenger, passerby, minor witness, maintenance worker, or other support NPC;
- reuse of an existing suitable local affordance before creating another one.

These are not global worldgen. They are local staging tools.

Temporary props/items are explicitly out of Phase 82 scope. They should not be model-facing dynamic creation affordances until a later phase owns their runtime shape, lifecycle, and inventory/event semantics.

## Runtime Concepts

### Ephemeral Sublocation

An `ephemeral_scene` is a local, anchored playable scene node.

Required properties:

- parent or anchor resolves to current broad/persistent location;
- `persistence: "ephemeral"`;
- default `expiresAtTick` or explicit `lifetimePolicy`;
- `archivedAtTick` set on cleanup;
- visible in current-scene affordances while active;
- excluded from normal traversal/presence after expiry/archive;
- important durable events spill to the persistent anchor.

### Support NPC

A support NPC is a temporary actor spawned for the current scene need.

Required properties:

- `tier: "temporary"` or equivalent support marker;
- broad `currentLocationId` points to parent macro when scene is a sublocation/ephemeral scene;
- `currentSceneLocationId` points to the exact scene;
- provenance records spawning tool/turn;
- lifetime policy or retire-after-scene behavior;
- promotion path if the actor becomes important.

## Lifecycle Hook

Transient cleanup runs after successful tool-step settlement, narrator packet/final narration, and post-turn simulation for a turn, before the next GM Read can assemble. Cleanup stays inside active-turn rollback discipline.

Cleanup must skip any ephemeral scene or support NPC scope containing the player, the current focal actor, or a key active participant. It may archive expired empty/irrelevant ephemeral scenes and retire non-promoted support NPCs, but it must never delete canonical locations or canonical/key NPCs.

Promotion is an explicit tool/checklist transition: update NPC tier/persistence, remove cleanup eligibility, record the promoting turn/provenance, and run or schedule existing enrichment needed for persistent NPC quality.

### Tool Observation

Every mutating tool step returns a compact structured observation:

- status: `done`, `skipped`, `revised`, `failed`;
- created/updated refs;
- authoritative location/scene metadata;
- player-visible facts;
- warnings and reason codes;
- next allowed tools when useful.

## Harness Contract

Phase 82 builds on Phase 81, not around it.

- GM Read remains the interpretation/path stage.
- GM Action Checklist remains bounded and conditional.
- Tool steps stay sequential for mutations.
- Phase 82 enriches the tool registry/contract and observations, then adds budgets and lifecycle.
- No turn-duration caps are added.

Repeated dynamic creation is guarded per turn by a concrete equivalence key:

`toolName + normalized anchor/current-scene ref + normalized role/name/kind + lifetime category`

Cross-turn reuse is allowed. Rollback resets the turn budgets. One explicit validation-failure revision path remains allowed so a bad input can be corrected without becoming a loop.

Prompt/contract ownership is explicit: Phase 82 updates GM Action Checklist, GM tool-step, tool-schema descriptions, and prompt-contract tests so the GM is told when to reuse, create, retire, or promote.

## Completion Standard

The phase is not complete if tests pass but the GM never uses dynamic tools in live play. It is also not complete if the GM spams new rooms/NPCs every turn. The correct behavior is confident, selective use.
