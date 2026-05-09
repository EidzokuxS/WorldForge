# Phase 82-07: Spawn Grounding Follow-Up

## Trigger

Live Phase 82 gate proved the AI SDK tool loop can execute backend tools, but it exposed a remaining gameplay contract gap:

- The GM answered a "step into the back room" action by spawning a support NPC and logging a back-room beat.
- The backend accepted the spawn into the current scene/location, but the specific "back room" was only narrative/log text, not an authoritative `reveal_location` observation.
- `spawn_item` had been removed from default player-turn tools, which hid potential misuse instead of fixing the tool contract.

## Decision

Do not disable `spawn_item`. Keep the GM's real tool belt available and make the tool loop safer:

- New local places must be made authoritative with `reveal_location` before later tools rely on them.
- If the player enters the new local place, the GM should call `move_to` after the reveal and use that observation as the current scene.
- Runtime observations now update the live tool execution context, so later calls in the same AI SDK loop can target newly observed refs.
- Item creation is allowed only for tangible, persistent, inspectable/usable/ownable things, not casual set dressing.
- Equivalent `spawn_item` creation is blocked within one loop by the same semantic budget mechanism used for NPC/location creation.

## Implementation

- `backend/src/engine/gm-tool-loop.ts`
  - Adds observation-to-context updates for `reveal_location`, `move_to`, `spawn_npc`, and `spawn_item`.
  - Adds prompt rules for reveal-before-populate, move-after-reveal, support NPC locality, and tangible item discipline.
- `backend/src/engine/gm-tool-budget.ts`
  - Adds a `spawn_item` semantic budget key.
- `backend/src/engine/scene-frame.ts`
  - Restores `spawn_item` to default player-turn allowed tools.
- `backend/src/engine/tool-schemas.ts`
  - Clarifies `spawn_npc`, `reveal_location`, and `spawn_item` descriptions and input guidance.
- `backend/src/engine/tool-executor.ts`
  - Resolves location-owned `spawn_item` targets by name or id, matching the refs the GM receives from tool observations.
- `backend/src/engine/__tests__/gm-tool-loop.test.ts`
  - Covers runtime context updates after successful tool observations.
  - Covers repeated `spawn_item` budget rejection.
  - Covers prompt locality/item discipline.
- `backend/src/engine/__tests__/tool-executor.test.ts`
  - Covers hidden character and remote location rejection for player-turn `spawn_item`.
  - Covers legal item creation for visible actors and runtime-observed local locations.
  - Covers player-turn `spawn_npc` into a runtime-observed sublocation id.
- `backend/src/engine/__tests__/scene-frame.test.ts`
  - Locks `spawn_item` as available by default again.

## Verification

- `npm --prefix backend test -- --run src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/tool-schemas.inventory-authority.test.ts`
- `npm --prefix backend run typecheck`
- `npm --prefix backend test -- --run src/engine/__tests__/gm-tool-loop.test.ts src/engine/__tests__/gm-tool-step.test.ts src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/tool-schemas.inventory-authority.test.ts src/engine/__tests__/tool-executor.test.ts`
