# Roadmap: WorldForge

## Overview

Transform the existing world generation + chat pipeline (Tasks 1-14) into a full game engine with deterministic mechanics. The build order follows a strict dependency chain: Prompt Assembly and Oracle form the foundation that everything reads from, the Turn Cycle adds orchestration and tool calling, then mechanical systems (combat, inventory, navigation) plug into tools. Memory, NPC agents, reflection, and world simulation layer on top. Persistence, image generation, and content import are independent enrichment features that enhance the complete engine.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Engine Foundation** - Prompt assembler with token budgets, Oracle probability system, Storyteller tool schemas
- [ ] **Phase 2: Turn Cycle** - Full turn pipeline (input -> context -> Oracle -> roll -> narration with tools -> state update), SSE multi-event streaming
- [ ] **Phase 3: World State Mechanics** - HP/damage, inventory, location graph navigation, entity tracking, spawn/reveal tools
- [ ] **Phase 4: Story Control** - Retry/regenerate, undo, inline edit of AI output, quick action buttons
- [ ] **Phase 5: Episodic Memory** - Event embedding with importance scoring, composite retrieval, smart context compression, multi-hop graph queries
- [ ] **Phase 6: NPC Agents** - Autonomous Key Character agents, off-screen batch simulation, character promotion
- [ ] **Phase 7: Reflection + Progression** - Importance-triggered NPC reflection, wealth tiers, skill progression, relationship evolution
- [ ] **Phase 8: World Engine** - Faction macro-ticks, territory changes, world events, information flow to NPCs and player
- [ ] **Phase 9: Persistence** - Checkpoint save/load, branching, auto-checkpoint before lethal encounters
- [ ] **Phase 10: Image Generation** - Provider-agnostic image gen, portraits, scene illustrations, location backgrounds, graceful degradation
- [ ] **Phase 11: Content Import** - SillyTavern WorldBook import with entity classification, web search expansion

## Phase Details

### Phase 1: Engine Foundation
**Goal**: The engine can assemble structured prompts from all data sources and evaluate action probability through the Oracle
**Depends on**: Nothing (builds on existing DB/AI infrastructure from Tasks 1-14)
**Requirements**: PRMT-01, PRMT-02, PRMT-05, ORCL-01, ORCL-02, ORCL-03, ORCL-04, ORCL-05
**Success Criteria** (what must be TRUE):
  1. Backend compiles a structured prompt from system rules, world premise, scene context, player state, NPC state, lore cards, and recent conversation -- each section has a visible token budget
  2. Player types an action and receives a structured Oracle response showing chance percentage, outcome tier (Strong Hit / Weak Hit / Miss), and reasoning
  3. Near-zero probability actions (absurd requests) still receive a non-zero chance and proceed through the roll -- nothing is hard-blocked
  4. Oracle uses temperature 0.0 and produces consistent results for equivalent inputs
**Plans**: TBD

Plans:
- [ ] 01-01: Prompt Assembler
- [ ] 01-02: Oracle System

### Phase 2: Turn Cycle
**Goal**: The game has a complete turn processing pipeline where player actions flow through Oracle evaluation, dice rolls, Storyteller narration with tool calling, and state updates
**Depends on**: Phase 1
**Requirements**: TURN-01, TURN-02, TURN-03, TURN-04, TOOL-04, TOOL-05, TOOL-07, TOOL-08, TOOL-09, TOOL-10
**Success Criteria** (what must be TRUE):
  1. Player submits an action and the response streams as typed SSE events (narrative text, oracle_result, state_updates, npc_actions, quick_actions) instead of plain text
  2. Storyteller narrates Strong Hit results with full success + bonus, Weak Hit with success + complication, Miss with failure + consequences
  3. Storyteller can call add_tag, remove_tag, set_relationship, add_chronicle_entry, log_event, and offer_quick_actions -- all validated by backend before DB write
  4. Invalid tool calls from the LLM are rejected and the Storyteller retries with error feedback
  5. Quick action buttons appear below narrative; clicking one sends that action as the next turn
**Plans**: TBD

Plans:
- [ ] 02-01: Turn Processor + Tool Executor
- [ ] 02-02: SSE Streaming + Frontend Integration

### Phase 3: World State Mechanics
**Goal**: The game world has tangible mechanical systems -- characters take damage, carry items, move between locations, and interact with tracked entities
**Depends on**: Phase 2
**Requirements**: TOOL-01, TOOL-02, TOOL-03, TOOL-06, MECH-01, MECH-02, MECH-03, MECH-04, MECH-05, MECH-06, MECH-07
**Success Criteria** (what must be TRUE):
  1. Player character has HP on 1-5 scale; taking damage reduces HP; at HP=0 the GM narrates a contextual outcome (KO in bar brawl, death in assassination) rather than automatic death
  2. Items exist in a strict inventory table -- the Storyteller cannot reference items the player does not own; loot/trade/drop/equip are backend-validated transfers
  3. Player can move between connected location nodes; travel takes abstract turns; the sidebar shows current location and entities present
  4. When player explores beyond the scaffold, new location nodes are generated on-the-fly via reveal_location tool and connected to the graph
  5. NPCs and items are tracked per location node; scene prompts include who/what is present at the player's current location
**Plans**: TBD

Plans:
- [ ] 03-01: HP + Damage + Death System
- [ ] 03-02: Inventory + Item Transfers
- [ ] 03-03: Location Graph + Entity Tracking

### Phase 4: Story Control
**Goal**: Player has full editorial control over the narrative -- can retry, undo, edit AI output, and use suggested action buttons
**Depends on**: Phase 2
**Requirements**: CTRL-01, CTRL-02, CTRL-03, CTRL-04
**Success Criteria** (what must be TRUE):
  1. Player can click "Retry" to regenerate the last Storyteller response with the same context (new roll, new narration)
  2. Player can click "Undo" to revert the last action+response -- chat history and game state both roll back
  3. Player can click on AI-generated narrative text and edit it inline; edited text becomes the canonical version in chat history
  4. Quick action buttons rendered below the narrative are clickable and send the action as if the player typed it
**Plans**: TBD

Plans:
- [ ] 04-01: Retry + Undo
- [ ] 04-02: Inline Edit + Quick Actions UI

### Phase 5: Episodic Memory
**Goal**: The game remembers what happened -- significant events are stored as searchable memories, context compression keeps prompts within budget over long sessions, and relationship chains enrich context
**Depends on**: Phase 2 (turn loop generates events), Phase 1 (prompt assembler consumes memories)
**Requirements**: MEMO-01, MEMO-02, MEMO-03, MEMO-04, MEMO-05, PRMT-03, PRMT-04
**Success Criteria** (what must be TRUE):
  1. After each significant action, an event summary is embedded in LanceDB with importance rating (1-10), tick, location, participants, and type metadata
  2. Prompt assembly retrieves top 3-5 episodic memories per turn using composite scoring (similarity x0.4 + recency x0.3 + importance x0.3)
  3. Over a 50+ turn session, the prompt stays within token budget by retaining first messages (world setup), last N turns, and high-importance anomalous events while dropping mundane middle turns
  4. Context assembly follows relationship chains (NPC -> location -> faction) via SQL JOINs to include relevant connected entities even if not explicitly mentioned
**Plans**: TBD

Plans:
- [ ] 05-01: Episodic Event Storage + Retrieval
- [ ] 05-02: Smart Context Compression + Multi-hop Queries

### Phase 6: NPC Agents
**Goal**: Key Characters act autonomously -- they pursue goals, speak unprompted, move between locations, and react to the player's presence
**Depends on**: Phase 5 (episodic memory for NPC context), Phase 3 (location graph for movement)
**Requirements**: NPC-01, NPC-02, NPC-03, NPC-04, NPC-05
**Success Criteria** (what must be TRUE):
  1. Key NPCs at the player's location get individual LLM calls per tick and can act (perform actions), speak (generate dialogue), move to another node, or update their own goals
  2. NPC actions are processed through the Oracle the same way player actions are -- probability evaluation + dice roll, not auto-success
  3. Off-screen Key Characters are batch-simulated every N ticks with structured updates (new location, action summary, goal progress)
  4. An NPC that becomes narratively important can be promoted from extra to persistent to key tier
**Plans**: TBD

Plans:
- [ ] 06-01: NPC Agent Loop + Tick Scheduling
- [ ] 06-02: Off-screen Simulation + Promotion

### Phase 7: Reflection + Progression
**Goal**: NPCs form beliefs and evolve goals based on accumulated experiences; characters progress through tag-based wealth, skill, and relationship tiers
**Depends on**: Phase 6 (NPC agents generate events), Phase 5 (episodic memory stores events for reflection)
**Requirements**: REFL-01, REFL-02, REFL-03, REFL-04, REFL-05, MECH-08, MECH-09, MECH-10
**Success Criteria** (what must be TRUE):
  1. When an NPC's cumulative unprocessed event importance exceeds 15, a Reflection Agent reads recent episodic entries and synthesizes beliefs, goals, and relationship tags
  2. Reflection results (beliefs, goals, relationship updates) are stored in the NPC's SQLite record and included in scene prompts when that NPC is present
  3. Character wealth is tracked as tag tiers (Destitute through Obscenely Rich); the Oracle evaluates affordability based on wealth tier
  4. Skills progress through tag tiers (Novice through Master) driven by the Reflection Agent observing repeated successful use
  5. Relationship tags between entities (Trusted Ally, Suspicious, Sworn Enemy) update through Reflection based on accumulated interactions -- no numeric scores
**Plans**: TBD

Plans:
- [ ] 07-01: Reflection Agent + Triggers
- [ ] 07-02: Tag-based Progression (Wealth, Skills, Relationships)

### Phase 8: World Engine
**Goal**: The world simulates at the macro level -- factions pursue goals, territories shift, world events occur, and information flows realistically through NPCs
**Depends on**: Phase 7 (reflection for NPC beliefs), Phase 6 (NPC agents for information delivery)
**Requirements**: WRLD-01, WRLD-02, WRLD-03, WRLD-04, WRLD-05
**Success Criteria** (what must be TRUE):
  1. Every N in-game days, each faction gets an LLM evaluation of its goals, tags, chronicle, and neighbors -- producing territory changes, faction tag updates, and World Chronicle entries
  2. Factions can take actions (expand territory, declare war, trade) and update goals via structured tools; results mutate location tags and faction state
  3. Unexpected world events (plagues, disasters, anomalies) are occasionally introduced when narratively appropriate
  4. NPCs learn about world events through location history, chronicle entries, and proximity/faction affiliation -- information does not teleport
**Plans**: TBD

Plans:
- [ ] 08-01: Faction Tick System
- [ ] 08-02: World Events + Information Flow

### Phase 9: Persistence
**Goal**: Player can save, load, and branch campaign state for death recovery and "what if" exploration
**Depends on**: Phase 3 (game state to snapshot)
**Requirements**: SAVE-01, SAVE-02, SAVE-03, SAVE-04
**Success Criteria** (what must be TRUE):
  1. Player can create a named checkpoint that snapshots state.db + vectors/ directory with timestamp
  2. Player can load any checkpoint to restore full campaign state (DB + vectors + chat history)
  3. Checkpoint list is visible in UI with timestamp and description; player can manage (load/delete) checkpoints
  4. The game auto-creates a checkpoint before potentially lethal encounters (HP <= 2 entering combat)
**Plans**: TBD

Plans:
- [ ] 09-01: Checkpoint Save/Load System
- [ ] 09-02: Auto-checkpoint + UI

### Phase 10: Image Generation
**Goal**: The game generates visual content -- character portraits, scene illustrations, location backgrounds -- through any supported image provider, with graceful degradation when disabled
**Depends on**: Phase 3 (location/entity state for image prompts)
**Requirements**: IMG-01, IMG-02, IMG-03, IMG-04, IMG-05, IMG-06, IMG-07
**Success Criteria** (what must be TRUE):
  1. Image generation works through any supported provider (fal, GLM, Stable Diffusion, DALL-E, ComfyUI, custom OpenAI-compatible) configured in Settings
  2. Character portraits are generated on character creation from appearance tags and cached for reuse
  3. High-importance events (new location discovery, boss encounter, dramatic moments) trigger async scene illustration without blocking narration
  4. Location backgrounds are generated on first visit and cached for return visits
  5. Image generation is togglable in Settings; when disabled or no provider configured, the game works identically without images
**Plans**: TBD

Plans:
- [ ] 10-01: Image Provider Integration + Settings
- [ ] 10-02: Portrait, Scene, and Location Image Pipeline

### Phase 11: Content Import
**Goal**: Players can import external content -- SillyTavern WorldBooks and web-sourced lore -- into their campaign worlds
**Depends on**: Phase 5 (lore card system for imported content)
**Requirements**: IMPT-01, IMPT-02, IMPT-03, IMPT-04
**Success Criteria** (what must be TRUE):
  1. Player can upload a SillyTavern WorldBook JSON file and see a preview of parsed entries before import
  2. WorldBook entries are cleaned of SillyTavern-specific data (activation keys, recursion settings) and classified by type (character, location, faction, bestiary, lore) via LLM
  3. Classified entries are routed to appropriate DB tables (NPCs, locations, factions) or stored as lore cards
  4. IP research supports multiple search sources (DuckDuckGo MCP, Z.AI search MCP) for broader lore discovery
**Plans**: TBD

Plans:
- [ ] 11-01: WorldBook Import Pipeline
- [ ] 11-02: Web Search Expansion

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11

Note: Phases 4, 9, 10, 11 have flexible ordering relative to later phases. Phase 4 can start after Phase 2. Phases 9-11 can run in any order after their dependencies are met.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Engine Foundation | 0/2 | Not started | - |
| 2. Turn Cycle | 0/2 | Not started | - |
| 3. World State Mechanics | 0/3 | Not started | - |
| 4. Story Control | 0/2 | Not started | - |
| 5. Episodic Memory | 0/2 | Not started | - |
| 6. NPC Agents | 0/2 | Not started | - |
| 7. Reflection + Progression | 0/2 | Not started | - |
| 8. World Engine | 0/2 | Not started | - |
| 9. Persistence | 0/2 | Not started | - |
| 10. Image Generation | 0/2 | Not started | - |
| 11. Content Import | 0/2 | Not started | - |
