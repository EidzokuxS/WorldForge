# Phase 13: Gameplay Playtest & AI Tuning - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Full gameplay playtest — not UI/UX testing (done in Phase 12), but GAME DESIGN testing. Play the game as a real player would. Multiple sessions, different scenarios. Evaluate whether the AI Game Master produces good gameplay, whether mechanics feel right, whether the game is actually fun and playable.

This is a qualitative evaluation + tuning phase:
- Does the Oracle give reasonable probabilities?
- Does the Storyteller narrate well for each outcome tier?
- Do NPC agents behave believably?
- Does the world feel alive (faction ticks, world events)?
- Are tag-based mechanics (wealth, skills, relationships) working in practice?
- Is the prompt assembly producing good context for the LLM?
- Is the death/defeat system dramatic?
- Do quick actions make sense contextually?

Found issues result in: prompt tuning, system prompt rewrites, temperature adjustments, tool schema changes, or code fixes.

</domain>

<decisions>
## Implementation Decisions

### Playtest Methodology
- Play through Playwright browser — submit real actions, read narrative responses, make gameplay decisions
- Minimum 3 different campaign scenarios to test variety:
  1. **Known IP** (e.g., Naruto/Cyberpunk) — test research agent + canon knowledge
  2. **Original dark fantasy** — test World DNA + creative generation
  3. **Quick combat scenario** — test Oracle, HP, damage, death mechanics
- Each session: 10-20 turns minimum to test memory, NPC behavior, world events
- After each session: evaluate AI quality, note issues, tune prompts/params

### What to Evaluate Per Session

**Oracle Quality:**
- Are probabilities reasonable? (skilled swordsman vs goblin should be high chance)
- Does soft-fail work? (absurd actions get near-zero but not zero)
- Is reasoning sensible?
- Are 3-tier outcomes narratively different? (Strong Hit vs Miss)

**Storyteller Quality:**
- Does narration match the outcome tier?
- Are tool calls appropriate? (spawn_npc when introducing character, add_tag when status changes)
- Does Storyteller respect game state? (no hallucinated items, correct HP)
- Is prose atmospheric and engaging?
- Quick actions — are suggestions contextually relevant?

**NPC Behavior:**
- Do NPCs in scene take meaningful actions?
- Are NPC goals/beliefs driving behavior?
- Does off-screen simulation produce interesting world changes?
- Does reflection produce sensible beliefs after events?

**World Engine:**
- Do faction ticks produce interesting territory/political changes?
- Do world events feel organic?
- Does information flow work? (NPCs know about events they should know)

**Game Feel:**
- Is combat tense and consequential?
- Does exploration feel rewarding?
- Is dialogue with NPCs engaging?
- Does the game world feel consistent over multiple turns?
- Is the game actually FUN?

### Tuning Protocol
- When AI behavior is suboptimal: identify the cause (prompt? temperature? tool schema? missing context?)
- Fix by editing: system prompts, tool descriptions, temperature values, prompt assembly sections
- Re-test the specific scenario to verify improvement
- Document before/after for each tuning change

### Testing Through Browser
- MUST use Playwright MCP for all gameplay
- Screenshot key moments (dramatic scenes, combat, NPC interactions)
- Evaluate screenshots for narrative quality (does the text read well?)

### Claude's Discretion
- Specific campaign scenarios to play
- How many turns per session
- Which prompts/params to tune based on findings
- Whether to adjust Oracle formula, Storyteller instructions, or NPC agent prompts

</decisions>

<code_context>
## Key Files for Tuning

### System Prompts (most likely to need tuning)
- `backend/src/engine/prompt-assembler.ts` — SYSTEM_RULES, section structure
- `backend/src/engine/turn-processor.ts` — Storyteller system prompt with outcome instructions
- `backend/src/engine/oracle.ts` — Oracle system prompt
- `backend/src/engine/npc-agent.ts` — NPC agent system prompt
- `backend/src/engine/npc-offscreen.ts` — Off-screen simulation prompt
- `backend/src/engine/reflection-agent.ts` — Reflection prompt
- `backend/src/engine/world-engine.ts` — Faction tick prompt

### Parameters
- Temperature values per role (settings)
- Oracle chance clamping (min 1, max 99)
- Reflection threshold (15)
- Faction tick interval (10)
- Off-screen simulation interval
- Token budgets per prompt section

### Tool Schemas
- `backend/src/engine/tool-schemas.ts` — Storyteller tool definitions
- `backend/src/engine/npc-tools.ts` — NPC tool definitions
- `backend/src/engine/faction-tools.ts` — Faction tool definitions

</code_context>

<specifics>
## Specific Playtest Scenarios

1. **Naruto campaign** — premise: "Naruto universe, Shippuden era. Player is a rogue ninja." Test: research agent brings canon info, NPCs use jutsu terminology, Oracle handles chakra-based actions.

2. **Original dark fantasy** — premise: "A dying world where the sun hasn't risen in 300 years." Test: World DNA generates unique setting, NPCs have meaningful goals, factions fight over resources.

3. **Combat gauntlet** — premise: "Arena combat tournament." Test: HP system, damage, quick successive fights, death at HP=0, checkpoint recovery.

</specifics>

<deferred>
## Deferred Ideas

None.

</deferred>
