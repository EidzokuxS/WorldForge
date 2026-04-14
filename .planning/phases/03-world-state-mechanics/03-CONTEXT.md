# Phase 3: World State Mechanics - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds tangible game mechanics to the turn cycle: HP/damage with narrative death, strict inventory management, location graph navigation with on-the-fly generation, and entity tracking per location. It adds 4 Storyteller tools (spawn_npc, spawn_item, reveal_location, set_condition) that modify world state through the tool executor built in Phase 2.

This phase does NOT add: episodic memory, NPC agents, reflection, world engine, or save/checkpoints.

</domain>

<decisions>
## Implementation Decisions

### HP & Damage System
- HP on 1-5 scale, tracked in `players.hp` column (already has CHECK constraint 0-5)
- `set_condition` tool modifies HP: accepts target entity name + delta (damage/heal) or absolute value
- At HP=0, Storyteller receives special instruction to narrate contextual outcome (bar brawl→KO, assassination→death)
- HP changes streamed as `state_update` SSE events to frontend for real-time sidebar update

### Inventory System
- Items table already exists in schema with `name`, `tags`, `ownerId`, `locationId`
- `spawn_item` tool creates items — assigns to character (ownerId) or location (locationId)
- Item transfers (loot, trade, drop, equip) handled by adding `transfer_item` tool or expanding existing tools
- Storyteller CANNOT reference items not in DB — system prompt includes player inventory list
- Player's equipped items included in prompt assembly (already in PRMT-01)

### Location Graph Navigation
- `reveal_location` tool creates new location nodes connected to existing graph
- Player movement via `move_to` action — validated against connectedTo edges
- On-the-fly generation: when player explores beyond scaffold, Storyteller uses reveal_location to create new nodes
- Travel between nodes is abstract (1 turn per edge)
- Left sidebar shows current location, connected locations, present entities

### Entity Tracking
- NPCs and items tracked per location node via `currentLocationId` foreign key
- Scene prompt includes who/what is present at player's current location (already in prompt assembler)
- Entities spawn at specific locations or with specific owners
- Entity presence lists update in real-time via `state_update` SSE events

### Frontend Updates
- Player sheet (right sidebar) shows HP bar, tags, equipped items — updates via SSE
- Location panel (left sidebar) shows current location, connected nodes, present NPCs/items
- Movement UI: clickable connected locations or "go to" action

### Claude's Discretion
- Exact tool parameter shapes for spawn_npc, spawn_item, reveal_location, set_condition
- HP display format in sidebar (bar vs text vs both)
- Movement validation error messages
- How to handle NPC HP (same tool or separate)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/engine/tool-schemas.ts` — existing tool schemas (Phase 2), extend with new tools
- `backend/src/engine/tool-executor.ts` — existing executor with entity name→UUID resolution
- `backend/src/engine/turn-processor.ts` — async generator, already yields state_update events
- `backend/src/db/schema.ts` — players (hp, tags, equippedItems, currentLocationId), npcs, items, locations tables all exist
- `frontend/components/game/character-panel.tsx` — existing player sheet panel
- `frontend/components/game/` — existing game layout components

### Established Patterns
- Tool schemas as Zod objects with execute callbacks in tool-executor
- Entity name→UUID resolution via campaign-scoped DB lookup
- State updates streamed as SSE events
- JSON arrays stored as text columns (tags, equippedItems, connectedTo)

### Integration Points
- Add 4 new tool schemas to `tool-schemas.ts`
- Add 4 new handler functions to `tool-executor.ts`
- Update prompt assembler to include player inventory and location entities
- Update frontend sidebar panels to consume SSE state_update events

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard implementation following design docs (mechanics.md HP system, concept.md location graph).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
