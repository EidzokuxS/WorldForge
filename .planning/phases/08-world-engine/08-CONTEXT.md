# Phase 8: World Engine - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds macro-level world simulation: factions pursue goals, territories shift, world events occur, and information flows realistically through NPCs. Each faction gets a periodic LLM evaluation that produces territory changes, faction tag updates, and chronicle entries. NPCs learn about world events through location history and faction affiliation.

This phase does NOT add: save/checkpoints (Phase 9), image generation (Phase 10), or content import (Phase 11).

</domain>

<decisions>
## Implementation Decisions

### Faction Macro-Ticks
- New `backend/src/engine/world-engine.ts` — orchestrates faction simulation
- Every N in-game days (configurable, default every 10 ticks), run one LLM call per faction
- Each call: Judge role evaluates faction's tags, goals, chronicle, neighbor factions, owned locations
- Faction action tools: faction_action(action, outcome), update_faction_goal(old, new), add_chronicle_entry(text)
- Results: territory changes (location ownership), faction tag updates, World Chronicle entries, location tag mutations

### World Events
- Occasionally introduce unexpected events (plagues, disasters, anomalies) — prompted in faction system prompt as "when narratively appropriate"
- World events logged to chronicle and affect location tags

### Information Flow
- NPCs learn about world events through: location history (where they've been), chronicle (global record), faction affiliation (if member of a faction, knows faction news)
- Prompt assembler already includes chronicle and NPC location — this phase ensures faction events propagate properly
- No explicit event propagation system — LLM infers what NPC would know based on proximity and affiliation

### Tick Scheduling
- World engine runs after NPC ticks in the post-turn pipeline
- Only runs every N ticks (configurable interval)
- Sequential per faction (avoid conflicting territory changes)

### Claude's Discretion
- Faction system prompt wording
- Territory change mechanics (how factions gain/lose locations)
- World event frequency and types
- Information flow implementation details

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/db/schema.ts` — factions (tags, goals, assets), locations (tags), chronicle (tick, text)
- `backend/src/engine/npc-agent.ts` — pattern for sequential LLM agent calls with tools
- `backend/src/engine/tool-executor.ts` — tool validation and DB execution patterns
- `backend/src/engine/reflection-tools.ts` — tool creation patterns with Drizzle DB writes
- `backend/src/routes/chat.ts` — `buildOnPostTurn` for post-turn processing

### Established Patterns
- Judge role with `generateText` + tools
- Sequential processing to avoid state conflicts
- Post-turn async processing in `buildOnPostTurn`
- Chronicle entries with tick timestamps

### Integration Points
- Wire world engine into `buildOnPostTurn` after reflection
- New faction tools in `world-engine.ts`
- Update prompt assembler to include faction events in NPC context
- Campaign config needs world engine interval setting

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard implementation following design docs (mechanics.md world engine, concept.md macro-simulation).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
