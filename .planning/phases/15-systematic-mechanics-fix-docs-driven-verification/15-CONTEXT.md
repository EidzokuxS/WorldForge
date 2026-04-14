# Phase 15: Systematic Mechanics Fix & Docs-Driven Verification - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning
**Source:** docs/ checklist mapped against 2.8/5 playtest findings

<domain>
## Phase Boundary

Fix every broken mechanic found in playtest and verify EVERY system described in docs/concept.md, docs/mechanics.md, docs/memory.md against the actual codebase. No ad-hoc testing — each mechanic maps to a code file and a verification step.

</domain>

<decisions>
## Implementation Decisions

### CRITICAL BUGS TO FIX (gameplay-breaking)

#### Bug 1: HP drops on Strong Hit
**Docs say (mechanics.md):** Strong Hit = full success. Weak Hit = success with complication. Miss = failure with consequence. Only Miss should cause HP loss in non-combat.
**What happens:** Storyteller calls `set_condition(delta=-1)` regardless of outcome tier. Suit breach narrative cascades into doom spiral.
**Root cause:** No backend validation of set_condition against outcome tier. LLM decides freely.
**Fix:** Backend MUST enforce: on Strong Hit, `set_condition` delta cannot be negative unless player is in active combat (attacker is targeting them). Add outcome tier to tool executor context. Reject invalid HP changes.
**Files:** `backend/src/engine/tool-executor.ts`, `backend/src/engine/turn-processor.ts`
**Verify:** Play 5 turns, get Strong Hit — HP must NOT decrease.

#### Bug 2: move_to never called / Player stuck on one location
**Docs say (concept.md):** Location graph with travel between nodes. Dynamic node generation on exploration.
**What happens:** Storyteller NEVER calls `move_to` or `reveal_location`. Player stays at starting location for 10+ turns.
**Root cause:** move_to tool not available to Storyteller, OR prompt doesn't instruct movement. Check tool-schemas.ts — is move_to in Storyteller tools?
**Fix:** Ensure move_to is in Storyteller tool set. Add prompt instruction: "When the player describes traveling to a new location, you MUST call move_to. If destination doesn't exist, call reveal_location first."
**Files:** `backend/src/engine/tool-schemas.ts`, `backend/src/engine/prompt-assembler.ts`
**Verify:** Play turn "I go to [location]" — location sidebar MUST update.

#### Bug 3: NPCs never appear in gameplay
**Docs say (mechanics.md):** Key Characters have individual LLM calls per tick. NPCs in scene should speak/act/move. Extras spawned as needed.
**What happens:** 5 NPCs generated in world, 0 encounters in 10 turns. NPC agent system apparently not running.
**Root cause:** NPC agent tick not firing, OR NPCs not at player's location, OR introduce_npc/spawn_npc not called.
**Fix:** Investigate NPC agent invocation in turn pipeline. Ensure Key NPCs at starting location appear. Add Storyteller instruction to introduce NPCs when player enters their location.
**Files:** `backend/src/engine/npc-agent.ts`, `backend/src/engine/turn-processor.ts`, `backend/src/engine/prompt-assembler.ts`
**Verify:** Play turn at location with NPC — NPC MUST appear and interact.

#### Bug 4: Tool call text leak (still happening)
**Docs say:** Tool calls are structured, never visible to user.
**What happens:** Turn 8 showed `print(default_api.set_condition(...))` as prose text.
**Root cause:** sanitizeNarrative regex doesn't catch all patterns. Gemini Flash sometimes emits tool calls as Python-style text.
**Fix:** Extend sanitizeNarrative patterns. Add catch-all for `default_api.` prefix and any `functionName(param=value)` pattern in prose.
**Files:** `backend/src/engine/turn-processor.ts`
**Verify:** Play 10 turns — zero tool call text visible.

#### Bug 5: No auto-checkpoint at HP≤2
**Docs say (memory.md):** Checkpoint: Snapshot at HP≤2 for death recovery.
**What happens:** HP dropped to 2, then 1, then 0 — no checkpoint created.
**Root cause:** Auto-checkpoint logic missing or not wired into turn pipeline.
**Fix:** Check state-snapshot.ts — add post-turn hook: if player HP ≤ 2 AND no checkpoint exists for this HP level, create one.
**Files:** `backend/src/engine/state-snapshot.ts`, `backend/src/engine/turn-processor.ts`
**Verify:** Drop HP to 2 — checkpoint MUST appear in saves.

#### Bug 6: No death/game-over handling at HP=0
**Docs say (mechanics.md):** HP=0 is NOT auto-death. Storyteller determines outcome based on context (KO, capture, death).
**What happens:** HP=0, game continues normally. No special narration, no game-over, no checkpoint offer.
**Root cause:** No HP=0 detection in turn pipeline. Storyteller not instructed about HP=0 state.
**Fix:** After tool execution, if player HP=0: inject special context telling Storyteller this is a death/defeat moment. Add to SYSTEM_RULES.
**Files:** `backend/src/engine/turn-processor.ts`, `backend/src/engine/prompt-assembler.ts`
**Verify:** Reach HP=0 — Storyteller MUST narrate death/defeat/KO contextually.

### SYSTEMS TO VERIFY (from docs/ — organized by file)

#### From concept.md
- [ ] Turn processing pipeline: action → context → Oracle → resolution → narration → state update
- [ ] Soft-fail: no hard blocks, all actions possible with appropriate probability
- [ ] 3-tier outcomes: Strong Hit/Weak Hit/Miss with distinct narration
- [ ] World gen: research → DNA → scaffold → lore (all steps verified via pipeline)
- [ ] Dynamic node generation: reveal_location on exploring beyond scaffold
- [ ] 3-column UI layout with correct panels

#### From mechanics.md
- [ ] Tag system: traits, skills, flaws, status, structural, faction
- [ ] HP 1-5 scale, 0=GM discretion
- [ ] Wealth as tags (not numeric)
- [ ] Skills as tiers (Novice/Skilled/Master)
- [ ] Relationships as qualitative tags
- [ ] Oracle payload: intent, actor/target/environment tags → { chance, reasoning }
- [ ] D100 roll against chance
- [ ] Character tiers: Temporary/Persistent/Key with correct behavior
- [ ] NPC autonomous actions: speak, act, move, update_goal
- [ ] NPC off-screen simulation every N ticks
- [ ] Reflection: importance ≥15 triggers belief/goal formation
- [ ] Faction ticks: every 5 turns, structured actions, territory changes
- [ ] All Storyteller tools: spawn_npc, spawn_item, reveal_location, add_tag, remove_tag, set_relationship, set_condition, add_chronicle_entry, log_event, offer_quick_actions
- [ ] All NPC tools: act, speak, move_to, update_own_goal
- [ ] All Reflection tools: set_belief, set_goal, drop_goal, set_relationship
- [ ] All Faction tools: faction_action, update_faction_goal, add_chronicle_entry

#### From memory.md
- [ ] Episodic memory: events stored with importance scoring
- [ ] Vector search retrieval with composite scoring (sim×0.4 + recency×0.3 + importance×0.3)
- [ ] Lore cards: extraction, vector search, injection as [LORE CONTEXT]
- [ ] Prompt assembly: all sections present
- [ ] Context compression over long sessions
- [ ] Save/checkpoint: auto at HP≤2, manual save, restore
- [ ] Campaign files: state.db, vectors/, config.json, chat_history.json

### Claude's Discretion
- Order of fixes within each plan
- Test scenarios for verification
- Specific regex patterns for sanitization

</decisions>

<code_context>
## Existing Code Insights

### Engine Files (all fixes happen here)
- backend/src/engine/turn-processor.ts — Turn pipeline, sanitization, quick actions
- backend/src/engine/tool-executor.ts — Tool call validation and execution
- backend/src/engine/tool-schemas.ts — Tool definitions for all contexts
- backend/src/engine/prompt-assembler.ts — SYSTEM_RULES, all prompt sections
- backend/src/engine/oracle.ts — Probability calculation
- backend/src/engine/npc-agent.ts — NPC autonomous behavior
- backend/src/engine/npc-offscreen.ts — Off-screen simulation
- backend/src/engine/reflection-agent.ts — NPC reflection
- backend/src/engine/world-engine.ts — Faction ticks
- backend/src/engine/state-snapshot.ts — Checkpoint system
- backend/src/engine/graph-queries.ts — Relationship queries
- backend/src/engine/token-budget.ts — Context compression

### Vector/Memory Files
- backend/src/vectors/episodic-events.ts — Episodic event storage
- backend/src/vectors/lore-cards.ts — Lore card storage and search

### Route Files
- backend/src/routes/chat.ts — Chat/gameplay endpoint

</code_context>

<specifics>
## Specific Requirements

- Every fix MUST have a backend enforcement, not just prompt engineering. LLMs are unreliable — backend guards are deterministic.
- set_condition validation: backend rejects HP decrease on Strong Hit (unless in combat where player is being attacked)
- move_to: must be in Storyteller tool set and prompted
- NPC agent: must fire on turns where Key NPCs are at player's location
- sanitizeNarrative: catch-all regex for any function-call-like syntax in prose
- auto-checkpoint: deterministic post-turn hook, not LLM-dependent
- HP=0 detection: backend injects context before Storyteller narration

</specifics>

<deferred>
## Deferred Ideas

None — this is the definitive fix-and-verify phase.

</deferred>
