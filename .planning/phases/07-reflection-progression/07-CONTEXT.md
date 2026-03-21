# Phase 7: Reflection + Progression - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds NPC reflection (importance-triggered belief synthesis from episodic memory) and tag-based progression systems (wealth tiers, skill tiers, relationship evolution). Reflection Agent reads accumulated episodic events and writes beliefs/goals/relationship tags to SQLite. Wealth and skill tags use descriptive tiers evaluated by the Oracle.

This phase does NOT add: world engine/faction simulation (Phase 8).

</domain>

<decisions>
## Implementation Decisions

### NPC Reflection System
- New `backend/src/engine/reflection-agent.ts` — Reflection Agent with Judge role
- Triggered when NPC's `unprocessedImportance` field exceeds threshold (sum ≥ 15)
- Reads recent episodic entries involving this NPC via `searchEpisodicEvents()`
- Reflection Agent tools: set_belief(text, evidence[]), set_goal(text, priority), drop_goal(text), set_relationship(target, tag, reason)
- Results stored in NPC's SQLite record (beliefs JSON column, goals JSON column, relationships table)
- After reflection, reset `unprocessedImportance` to 0

### Reflection Trigger
- After each turn, check all NPCs who participated in events this turn
- Increment their `unprocessedImportance` by the sum of event importance ratings
- If `unprocessedImportance >= 15`, trigger reflection for that NPC
- Reflection runs as post-turn async task (same as NPC ticks)

### Wealth System
- Tag tiers: Destitute → Poor → Comfortable → Wealthy → Obscenely Rich
- Oracle evaluates affordability based on wealth tier tag
- Wealth changes via Reflection Agent observing trade/loot events (not automatic)

### Skill Progression
- Tag tiers: Novice → Skilled → Master (per skill)
- Progression driven by Reflection Agent observing repeated successful use
- Example: after 3+ successful sword fights, Reflection might upgrade [Novice Swordsman] → [Skilled Swordsman]

### Relationship Evolution
- Relationship tags (Trusted Ally, Suspicious, Sworn Enemy, etc.) updated by Reflection Agent
- No numeric scores — purely qualitative tags with reason text
- Already stored in relationships table with entityA, entityB, tags, reason

### Claude's Discretion
- Reflection Agent system prompt wording
- Exact importance threshold (15 is the design doc default)
- How Reflection Agent decides on skill upgrades (evidence thresholds)
- Wealth tier change triggers

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/db/schema.ts` — npcs.beliefs (JSON), npcs.goals (JSON), npcs.unprocessedImportance (integer), relationships table
- `backend/src/vectors/episodic-events.ts` — `searchEpisodicEvents()` for NPC memories
- `backend/src/engine/npc-agent.ts` — NPC tick patterns, Judge role usage
- `backend/src/engine/tool-executor.ts` — tool validation patterns, `resolveEntityByName()`
- `backend/src/engine/oracle.ts` — Judge role with generateObject

### Established Patterns
- Judge role with `generateText` + tools for structured agent calls
- Tool results written to DB via Drizzle
- Post-turn async processing in `buildOnPostTurn`

### Integration Points
- Wire reflection checks into `buildOnPostTurn` after NPC ticks
- Update `unprocessedImportance` after each turn's events are logged
- Reflection results feed into prompt assembler (NPC beliefs/goals already in NPC state section)

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard implementation following design docs (mechanics.md reflection context, memory.md NPC reflections).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
