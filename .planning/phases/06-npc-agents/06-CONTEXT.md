# Phase 6: NPC Agents - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase makes Key Characters autonomous: they get individual LLM calls per tick when in the player's location, can act/speak/move/update goals via structured tools, and are processed through the Oracle like player actions. Off-screen Key Characters are batch-simulated every N ticks. NPCs can be promoted from extra→persistent→key tier.

This phase does NOT add: NPC reflection (Phase 7), world engine (Phase 8), or faction behavior.

</domain>

<decisions>
## Implementation Decisions

### NPC Agent Architecture
- New `backend/src/engine/npc-agent.ts` — orchestrates individual NPC turns
- NPC Agent uses Judge role (cheap/fast model) with structured tool calling via `generateText` (not streaming — NPC actions are internal, not displayed to player)
- NPC prompt includes: NPC's persona, tags, goals, beliefs, current location, nearby entities, recent episodic memories about this NPC, relationship graph
- NPC actions processed through Oracle same as player — probability evaluation + dice roll

### NPC Agent Tools
- `act(action_text)` — NPC declares an action, processed through Oracle
- `speak(dialogue)` — NPC says something in the scene (injected into narrative)
- `move_to(target_node)` — NPC moves to adjacent location
- `update_own_goal(old_goal, new_goal)` — NPC updates their short/long-term goals

### Tick Scheduling
- Post-turn: after player's turn completes, all Key NPCs at player's location get a tick
- NPC ticks run sequentially (not parallel) to avoid conflicting state changes
- Each NPC tick: assemble NPC context → Judge call with tools → execute tool calls → state updates
- NPC actions that affect the player are narrated in the next turn's context (not immediately)

### Off-screen Simulation
- Every N ticks (configurable, default 5), batch-simulate off-screen Key Characters
- Single Judge LLM call with all off-screen NPCs: "Given these NPCs' goals, locations, and world state, what has each been doing?"
- Returns structured updates per NPC: new location, action summary, goal progress
- Updates written to DB (location, goals) but NOT narrated

### Character Promotion
- `promote_npc(name, new_tier)` — backend function (not a Storyteller tool) for manual promotion
- API endpoint: `POST /api/campaigns/:id/npcs/:npcId/promote`
- Tiers: temporary → persistent → key (only upward, never downward)
- Key tier enables: autonomous agent ticks, off-screen simulation, reflection (Phase 7)

### Claude's Discretion
- NPC agent system prompt wording
- How to handle NPC tick failures (skip silently vs log)
- Off-screen simulation batch prompt format
- When to run off-screen simulation (every N ticks, or on-demand)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/engine/oracle.ts` — `callOracle()` for NPC action probability
- `backend/src/engine/prompt-assembler.ts` — context assembly patterns
- `backend/src/engine/tool-executor.ts` — tool validation + DB execution
- `backend/src/engine/turn-processor.ts` — `onPostTurn` hook for triggering NPC ticks
- `backend/src/db/schema.ts` — npcs table with tier, goals, beliefs, currentLocationId, inactiveTicks
- `backend/src/vectors/episodic-events.ts` — `searchEpisodicEvents()` for NPC memories

### Established Patterns
- `generateText` with tools for structured agent calls (same as Oracle)
- Tool executor resolves entity names → UUIDs
- Post-turn processing via `onPostTurn` callback

### Integration Points
- Wire NPC ticks into `onPostTurn` in chat.ts
- New `backend/src/engine/npc-agent.ts` module
- New promotion endpoint in campaigns routes
- NPC agent results fed back into next turn's context

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard implementation following design docs (mechanics.md NPC context, concept.md character system).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
