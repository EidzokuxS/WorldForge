# Requirements: WorldForge

**Defined:** 2026-03-18
**Core Value:** The LLM is the narrator, never the engine. All mechanical outcomes are resolved by backend code. The LLM only translates results into prose.

## v1 Requirements

Requirements for complete product. Each maps to roadmap phases.

### Prompt Assembly

- [ ] **PRMT-01**: Backend compiles structured prompt from 6+ sources (system rules, world premise, scene, player state, NPC state, lore context, retrieved memories, recent conversation, action result)
- [ ] **PRMT-02**: Each prompt section has a hard token budget; total prompt fits within model context window
- [ ] **PRMT-03**: Smart context compression retains first messages (world setup, character), last N turns, and high-importance anomalous events (fights, deaths, key discoveries)
- [ ] **PRMT-04**: Multi-hop graph queries follow relationship chains (NPC→location→faction) via SQL JOINs to enrich context assembly
- [ ] **PRMT-05**: Lore cards retrieved by keyword + vector similarity are injected as [LORE CONTEXT] block (2-3 most relevant per turn)

### Oracle System

- [ ] **ORCL-01**: Judge LLM receives action intent, actor tags, target tags, environment tags and returns structured JSON with chance (0-100) and reasoning
- [ ] **ORCL-02**: Backend rolls D100 against Oracle's chance value to determine 3-tier outcome (Strong Hit / Weak Hit / Miss)
- [ ] **ORCL-03**: Oracle uses temperature 0.0 for consistent rulings
- [ ] **ORCL-04**: Soft-fail system — Oracle never returns chance=0; even absurd actions get a near-zero probability and narrated failure consequences
- [ ] **ORCL-05**: Oracle result (chance, outcome tier, reasoning) is passed to Storyteller for narration

### Turn Cycle

- [ ] **TURN-01**: Full turn processing pipeline: player input → context assembly → Oracle evaluation → D100 roll → Storyteller narration with tools → state update → post-turn processing
- [ ] **TURN-02**: Storyteller receives Oracle outcome tier and narrates accordingly (Strong Hit = full success + bonus, Weak Hit = success with complication, Miss = failure with consequences)
- [ ] **TURN-03**: SSE response streams typed events (narrative text, oracle_result, state_updates, npc_actions, quick_actions) instead of plain text
- [ ] **TURN-04**: Post-turn processing triggers: NPC agent ticks, reflection checks, world engine ticks (async, non-blocking)

### Storyteller Tools

- [ ] **TOOL-01**: `spawn_npc(name, tags, location)` — introduce new character into scene, validated and saved to DB
- [ ] **TOOL-02**: `spawn_item(name, tags, location_or_owner)` — introduce new item, validated and saved to DB
- [ ] **TOOL-03**: `reveal_location(name, tags, connected_to)` — create/reveal new location node in graph
- [ ] **TOOL-04**: `add_tag(entity, tag)` / `remove_tag(entity, tag)` — modify tags on any entity, validated against DB
- [ ] **TOOL-05**: `set_relationship(a, b, tag, reason)` — set relationship tag between two entities
- [ ] **TOOL-06**: `set_condition(target, condition)` — modify HP on 5-point scale (damage/heal)
- [ ] **TOOL-07**: `add_chronicle_entry(text)` — add major event to World Chronicle
- [ ] **TOOL-08**: `log_event(text, importance, participants)` — log significant event to episodic memory with importance rating
- [ ] **TOOL-09**: `offer_quick_actions(actions[])` — generate 3-5 context-sensitive action buttons for player
- [ ] **TOOL-10**: All tool calls validated by backend before execution; invalid calls rejected with error, Storyteller retries

### Game Mechanics

- [ ] **MECH-01**: HP system on 1-5 scale — 5=healthy, 1=near death, 0=GM decides narrative outcome
- [ ] **MECH-02**: Death/defeat at HP=0 is narrative — GM considers attacker intent, situation, drama (bar brawl=KO, assassination=death)
- [ ] **MECH-03**: Strict inventory table — items have name, tags, belong to character or location; Storyteller cannot hallucinate items not in inventory
- [ ] **MECH-04**: Item transfers (loot, trade, drop, equip) handled deterministically by backend, not LLM
- [ ] **MECH-05**: Location graph navigation — player moves between connected nodes, travel takes abstract turns based on edge distance
- [ ] **MECH-06**: On-the-fly location generation — when player explores beyond scaffold, new nodes generated via reveal_location tool
- [ ] **MECH-07**: Entity tracking — NPCs and items tracked per location node, presence lists included in scene prompt
- [ ] **MECH-08**: Wealth as tag tiers (Destitute→Poor→Comfortable→Wealthy→Obscenely Rich), Oracle evaluates affordability
- [ ] **MECH-09**: Skill progression as tag tiers (Novice→Skilled→Master), progression driven by Reflection Agent based on events
- [ ] **MECH-10**: Relationship tags between entities (Trusted Ally, Suspicious, Sworn Enemy, etc.), no numeric scores

### Episodic Memory

- [ ] **MEMO-01**: Every significant action/event summarized into factual sentence and stored as vector embedding in LanceDB
- [ ] **MEMO-02**: Events rated 1-10 importance by fast LLM (1=trivial, 5=notable, 10=world-changing)
- [ ] **MEMO-03**: Composite retrieval scoring: similarity×0.4 + recency×0.3 + importance×0.3
- [ ] **MEMO-04**: Top 3-5 most relevant episodic memories retrieved per prompt, more for reflection phases
- [ ] **MEMO-05**: Each memory has metadata: tick, location, participants, importance, type

### NPC Agents

- [ ] **NPC-01**: Key Characters have individual LLM calls per tick when in player's location — NPC Agent decides actions, generates interactions, creates narrative hooks
- [ ] **NPC-02**: NPC Agent tools: act(action), speak(dialogue), move_to(target_node), update_own_goal(old, new)
- [ ] **NPC-03**: Off-screen Key Characters simulated via batch LLM call every N ticks — structured updates (new location, action summary, goal progress)
- [ ] **NPC-04**: Character promotion: extras → persistent → key tier upgrades when narratively important
- [ ] **NPC-05**: NPC actions processed through Oracle same as player actions (probability + dice roll)

### NPC Reflection

- [ ] **REFL-01**: Reflection triggered when NPC's cumulative unprocessed event importance exceeds threshold (sum ≥ 15)
- [ ] **REFL-02**: Reflection Agent reads recent episodic entries involving the NPC and synthesizes higher-level understanding
- [ ] **REFL-03**: Reflection tools: set_belief(text, evidence[]), set_goal(text, priority), drop_goal(text), set_relationship(target, tag, reason)
- [ ] **REFL-04**: Reflection results (beliefs, goals, relationship tags) stored in NPC's SQLite record
- [ ] **REFL-05**: NPC beliefs and goals included in prompt when NPC is in scene — Storyteller uses them to inform behavior

### World Engine

- [ ] **WRLD-01**: Faction macro-ticks every N in-game days — one LLM call per faction evaluates tags, goals, chronicle, neighbors
- [ ] **WRLD-02**: Faction action tools: faction_action(action, outcome), update_faction_goal(old, new), add_chronicle_entry(text)
- [ ] **WRLD-03**: State updates from faction ticks: territory changes, faction tag updates, World Chronicle entries, location tag mutations
- [ ] **WRLD-04**: Occasional unexpected world events (plagues, disasters, anomalies) introduced when narratively appropriate
- [ ] **WRLD-05**: Information flow — NPCs learn about world events through location history, chronicle, proximity/faction affiliation inference

### Story Control

- [ ] **CTRL-01**: User can retry/regenerate last Storyteller response (re-call with same context)
- [ ] **CTRL-02**: User can undo last action+response (pop from chat history, restore state)
- [ ] **CTRL-03**: User can edit AI output text inline in narrative log (edited text becomes canonical)
- [ ] **CTRL-04**: Quick action buttons rendered below narrative, clicking sends action as if typed

### Persistence

- [ ] **SAVE-01**: Checkpoint creates timestamped snapshot of state.db + vectors/ directory
- [ ] **SAVE-02**: User can load any checkpoint to restore campaign state (death recovery, what-if branching)
- [ ] **SAVE-03**: Checkpoint list shown in UI with timestamp and description
- [ ] **SAVE-04**: Auto-checkpoint before potentially lethal encounters (HP≤2 entering combat)

### Image Generation

- [ ] **IMG-01**: Provider-agnostic image generation (fal, GLM, Stable Diffusion, DALL-E, ComfyUI, custom OpenAI-compatible)
- [ ] **IMG-02**: Image provider configuration in Settings panel (provider, model, API key, default style prompt)
- [ ] **IMG-03**: Character portraits generated on character creation from appearance tags, cached
- [ ] **IMG-04**: Scene illustrations for high-importance events (new location, boss encounter, dramatic moments), async non-blocking
- [ ] **IMG-05**: Location backgrounds generated on first visit, cached for return visits
- [ ] **IMG-06**: Image generation is optional — togglable in settings, graceful degradation when disabled or no provider configured
- [ ] **IMG-07**: Image prompts built from game state (appearance tags → portrait, location tags + premise → scene)

### Content Import

- [ ] **IMPT-01**: SillyTavern WorldBook JSON import — parse structured lore entries
- [ ] **IMPT-02**: WorldBook cleaning — strip irrelevant SillyTavern-specific data (activation keys, recursion settings, etc.)
- [ ] **IMPT-03**: Entity separation — LLM classifies WorldBook entries by type (character, location, faction, bestiary, lore) and routes to appropriate DB tables
- [ ] **IMPT-04**: Web search expansion — multiple search sources (DuckDuckGo MCP, Z.AI search MCP) for IP research

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Visual Enhancement

- **VIS-01**: Item icons generated on item creation (simple, icon-style)
- **VIS-02**: Wiki URL scraper — paste Fandom URL, backend scrapes and chunks into lore cards via Crawlee + Chonkie

### Advanced Simulation

- **SIM-01**: Off-screen NPC batch simulation frequency tuning (adaptive based on world state)
- **SIM-02**: Oracle ruling cache — cache recent rulings by normalized input to reduce inconsistency

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multiplayer / co-op | Singleplayer by design; NPCs are "other players" |
| Numeric stats (STR/DEX/INT) | Tag-based system validated by Fate Core; LLMs reason better about tags |
| XP / leveling system | Tag-tier progression via Reflection, not grinding |
| 2D map / spatial grid | Location graph is narrative-friendly; coordinates conflict with LLM narration |
| Voice input/output | Text-first; massive complexity for marginal value |
| Community sharing / scenario marketplace | Moderation nightmare; focus on local single-player |
| Real-time combat | Turn-based mandatory for LLM latency |
| Auto story summary | Frequently wrong; World Chronicle is factual record |
| Player-accessible /remember commands | Backend controls context; prevents prompt injection gaming |
| Electron/Tauri wrapper | Can't E2E test through browser |
| Cloud deployment / accounts | Localhost only |
| CYOA-only (no free text) | Always allow typing; suggested actions supplement, never replace |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PRMT-01 | Phase 1 | Pending |
| PRMT-02 | Phase 1 | Pending |
| PRMT-03 | Phase 5 | Pending |
| PRMT-04 | Phase 5 | Pending |
| PRMT-05 | Phase 1 | Pending |
| ORCL-01 | Phase 1 | Pending |
| ORCL-02 | Phase 1 | Pending |
| ORCL-03 | Phase 1 | Pending |
| ORCL-04 | Phase 1 | Pending |
| ORCL-05 | Phase 1 | Pending |
| TURN-01 | Phase 2 | Pending |
| TURN-02 | Phase 2 | Pending |
| TURN-03 | Phase 2 | Pending |
| TURN-04 | Phase 2 | Pending |
| TOOL-01 | Phase 3 | Pending |
| TOOL-02 | Phase 3 | Pending |
| TOOL-03 | Phase 3 | Pending |
| TOOL-04 | Phase 2 | Pending |
| TOOL-05 | Phase 2 | Pending |
| TOOL-06 | Phase 3 | Pending |
| TOOL-07 | Phase 2 | Pending |
| TOOL-08 | Phase 2 | Pending |
| TOOL-09 | Phase 2 | Pending |
| TOOL-10 | Phase 2 | Pending |
| MECH-01 | Phase 3 | Pending |
| MECH-02 | Phase 3 | Pending |
| MECH-03 | Phase 3 | Pending |
| MECH-04 | Phase 3 | Pending |
| MECH-05 | Phase 3 | Pending |
| MECH-06 | Phase 3 | Pending |
| MECH-07 | Phase 3 | Pending |
| MECH-08 | Phase 7 | Pending |
| MECH-09 | Phase 7 | Pending |
| MECH-10 | Phase 7 | Pending |
| MEMO-01 | Phase 5 | Pending |
| MEMO-02 | Phase 5 | Pending |
| MEMO-03 | Phase 5 | Pending |
| MEMO-04 | Phase 5 | Pending |
| MEMO-05 | Phase 5 | Pending |
| NPC-01 | Phase 6 | Pending |
| NPC-02 | Phase 6 | Pending |
| NPC-03 | Phase 6 | Pending |
| NPC-04 | Phase 6 | Pending |
| NPC-05 | Phase 6 | Pending |
| REFL-01 | Phase 7 | Pending |
| REFL-02 | Phase 7 | Pending |
| REFL-03 | Phase 7 | Pending |
| REFL-04 | Phase 7 | Pending |
| REFL-05 | Phase 7 | Pending |
| WRLD-01 | Phase 8 | Pending |
| WRLD-02 | Phase 8 | Pending |
| WRLD-03 | Phase 8 | Pending |
| WRLD-04 | Phase 8 | Pending |
| WRLD-05 | Phase 8 | Pending |
| CTRL-01 | Phase 4 | Pending |
| CTRL-02 | Phase 4 | Pending |
| CTRL-03 | Phase 4 | Pending |
| CTRL-04 | Phase 4 | Pending |
| SAVE-01 | Phase 9 | Pending |
| SAVE-02 | Phase 9 | Pending |
| SAVE-03 | Phase 9 | Pending |
| SAVE-04 | Phase 9 | Pending |
| IMG-01 | Phase 10 | Pending |
| IMG-02 | Phase 10 | Pending |
| IMG-03 | Phase 10 | Pending |
| IMG-04 | Phase 10 | Pending |
| IMG-05 | Phase 10 | Pending |
| IMG-06 | Phase 10 | Pending |
| IMG-07 | Phase 10 | Pending |
| IMPT-01 | Phase 11 | Pending |
| IMPT-02 | Phase 11 | Pending |
| IMPT-03 | Phase 11 | Pending |
| IMPT-04 | Phase 11 | Pending |

**Coverage:**
- v1 requirements: 73 total
- Mapped to phases: 73
- Unmapped: 0

---
*Requirements defined: 2026-03-18*
*Last updated: 2026-03-18 after roadmap creation*
