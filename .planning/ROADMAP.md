# Roadmap: WorldForge

## Overview

Transform the existing world generation + chat pipeline (Tasks 1-14) into a full game engine with deterministic mechanics. The build order follows a strict dependency chain: Prompt Assembly and Oracle form the foundation that everything reads from, the Turn Cycle adds orchestration and tool calling, then mechanical systems (combat, inventory, navigation) plug into tools. Memory, NPC agents, reflection, and world simulation layer on top. Persistence, image generation, and content import are independent enrichment features that enhance the complete engine.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Engine Foundation** - Prompt assembler with token budgets, Oracle probability system, Storyteller tool schemas (completed 2026-03-18)
- [x] **Phase 2: Turn Cycle** - Full turn pipeline (input -> context -> Oracle -> roll -> narration with tools -> state update), SSE multi-event streaming (completed 2026-03-18)
- [x] **Phase 3: World State Mechanics** - HP/damage, inventory, location graph navigation, entity tracking, spawn/reveal tools (completed 2026-03-18)
- [x] **Phase 4: Story Control** - Retry/regenerate, undo, inline edit of AI output, quick action buttons (completed 2026-03-18)
- [x] **Phase 5: Episodic Memory** - Event embedding with importance scoring, composite retrieval, smart context compression, multi-hop graph queries (completed 2026-03-18)
- [x] **Phase 6: NPC Agents** - Autonomous Key Character agents, off-screen batch simulation, character promotion (completed 2026-03-18)
- [x] **Phase 7: Reflection + Progression** - Importance-triggered NPC reflection, wealth tiers, skill progression, relationship evolution (completed 2026-03-18)
- [x] **Phase 8: World Engine** - Faction macro-ticks, territory changes, world events, information flow to NPCs and player (completed 2026-03-18)
- [x] **Phase 9: Persistence** - Checkpoint save/load, branching, auto-checkpoint before lethal encounters (completed 2026-03-19)
- [x] **Phase 10: Image Generation** - Provider-agnostic image gen, portraits, scene illustrations, location backgrounds, graceful degradation (completed 2026-03-19)
- [x] **Phase 11: Content Import** - SillyTavern WorldBook import with entity classification, web search expansion (completed 2026-03-19)
- [x] **Phase 12: E2E QA & Bug Fixing** - Full browser-based verification of all features via Playwright MCP, iterative bug fixing until clean (completed 2026-03-19)
- [x] **Phase 13: Gameplay Playtest & AI Tuning** - Full gameplay playtesting across 3 scenarios, AI quality evaluation, system prompt tuning (completed 2026-03-20)
- [x] **Phase 14: Final Systems Verification & Bug Fixing** - Final QA pass, remaining bug fixes, and docs-driven end-to-end verification (completed 2026-03-20)
- [x] **Phase 15: Systematic Mechanics Fix & Docs-Driven Verification** - Backend enforcement for gameplay-breaking bugs plus mechanics verification (completed 2026-03-20)
- [x] **Phase 16: NPC System QA** - Verification of all NPC tiers across worldgen, review, and gameplay runtime (completed 2026-03-20)
- [x] **Phase 17: Unit Test Coverage** - Real backend/frontend tests and desloppify strict 95+ cleanup (completed 2026-03-21)
- [x] **Phase 23: Unified Research & World Generation Pipeline** - Single research cache feeding DNA and scaffold generation, with sufficiency checks on regeneration (completed 2026-03-30)
- [x] **Phase 24: Worldgen Known IP Quality** - Canonical DNA/premise/locations/factions/NPCs with butterfly-effect changes, key vs supporting NPC tiers, research-grounded lore (completed 2026-03-25)
- [x] **Phase 25: Replace premise-override heuristics with structured divergence interpretation** - Structured premise/world divergence interpretation for known-IP generation (completed 2026-03-30)
- [ ] **Phase 28: Research & Design Synthesis for Character Systems, Prompts, UI, and External References** - Consolidate prompt-engineering research, desktop UI patterns, character-model redesign direction, and Aventuras findings into a cohesive implementation spec
- [ ] **Phase 29: Unified Character Ontology & Tag System** - Replace flat noisy character tags with a shared structured profile model for player creation, NPC generation, editing, and runtime prompt usage
- [ ] **Phase 30: Start Conditions, Canonical Loadouts, and Persona Templates** - Make start selection about location plus arrival conditions, derive starting items from canonical scenario state, and introduce reusable base personas for player/NPC generation
- [ ] **Phase 31: Prompt System Harmonization & Audit** - Audit and refine prompts across worldgen, character, gameplay, and support systems so they operate as one coherent mechanism
- [ ] **Phase 32: Desktop-First Non-Game UI Overhaul** - Redesign campaign creation, world review, character creation, settings, and other non-game flows for FHD/1440p desktop using Tailwind, shadcn, and compatible libraries only
- [ ] **Phase 33: Browser E2E Verification for Redesigned Creation Flows** - Validate the new character/world creation, persona, prompt, and UI flows end-to-end in the browser and polish regressions

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
**Plans**: 2 plans

Plans:
- [x] 01-01: Prompt Assembler
- [x] 01-02: Oracle System

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
**Plans**: 2 plans

Plans:
- [x] 02-01-PLAN.md -- Tool schemas + Tool executor + Turn processor
- [x] 02-02-PLAN.md -- SSE streaming route + Frontend integration + Quick actions

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
**Plans**: 3 plans

Plans:
- [x] 03-01-PLAN.md -- Spawn/condition tools + prompt assembler inventory/death context
- [x] 03-02-PLAN.md -- Movement validation + world data enrichment + entity tracking
- [x] 03-03-PLAN.md -- Frontend sidebar real-time updates + clickable navigation

### Phase 4: Story Control
**Goal**: Player has full editorial control over the narrative -- can retry, undo, edit AI output, and use suggested action buttons
**Depends on**: Phase 2
**Requirements**: CTRL-01, CTRL-02, CTRL-03, CTRL-04
**Success Criteria** (what must be TRUE):
  1. Player can click "Retry" to regenerate the last Storyteller response with the same context (new roll, new narration)
  2. Player can click "Undo" to revert the last action+response -- chat history and game state both roll back
  3. Player can click on AI-generated narrative text and edit it inline; edited text becomes the canonical version in chat history
  4. Quick action buttons rendered below the narrative are clickable and send the action as if the player typed it
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md -- State snapshot + retry/undo/edit backend endpoints
- [x] 04-02-PLAN.md -- Frontend retry/undo/edit controls + CTRL-04 verification

### Phase 5: Episodic Memory
**Goal**: The game remembers what happened -- significant events are stored as searchable memories, context compression keeps prompts within budget over long sessions, and relationship chains enrich context
**Depends on**: Phase 2 (turn loop generates events), Phase 1 (prompt assembler consumes memories)
**Requirements**: MEMO-01, MEMO-02, MEMO-03, MEMO-04, MEMO-05, PRMT-03, PRMT-04
**Success Criteria** (what must be TRUE):
  1. After each significant action, an event summary is embedded in LanceDB with importance rating (1-10), tick, location, participants, and type metadata
  2. Prompt assembly retrieves top 3-5 episodic memories per turn using composite scoring (similarity x0.4 + recency x0.3 + importance x0.3)
  3. Over a 50+ turn session, the prompt stays within token budget by retaining first messages (world setup), last N turns, and high-importance anomalous events while dropping mundane middle turns
  4. Context assembly follows relationship chains (NPC -> location -> faction) via SQL JOINs to include relevant connected entities even if not explicitly mentioned
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md -- Episodic event embedding + composite retrieval scoring
- [x] 05-02-PLAN.md -- Smart context compression + multi-hop graph queries + prompt assembler integration

### Phase 6: NPC Agents
**Goal**: Key Characters act autonomously -- they pursue goals, speak unprompted, move between locations, and react to the player's presence
**Depends on**: Phase 5 (episodic memory for NPC context), Phase 3 (location graph for movement)
**Requirements**: NPC-01, NPC-02, NPC-03, NPC-04, NPC-05
**Success Criteria** (what must be TRUE):
  1. Key NPCs at the player's location get individual LLM calls per tick and can act (perform actions), speak (generate dialogue), move to another node, or update their own goals
  2. NPC actions are processed through the Oracle the same way player actions are -- probability evaluation + dice roll, not auto-success
  3. Off-screen Key Characters are batch-simulated every N ticks with structured updates (new location, action summary, goal progress)
  4. An NPC that becomes narratively important can be promoted from extra to persistent to key tier
**Plans**: 2 plans

Plans:
- [x] 06-01: NPC Agent Loop + Tick Scheduling
- [x] 06-02: Off-screen Simulation + Promotion

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
**Plans**: 2 plans

Plans:
- [x] 07-01: Reflection Agent + Triggers
- [x] 07-02: Tag-based Progression (Wealth, Skills, Relationships)

### Phase 8: World Engine
**Goal**: The world simulates at the macro level -- factions pursue goals, territories shift, world events occur, and information flows realistically through NPCs
**Depends on**: Phase 7 (reflection for NPC beliefs), Phase 6 (NPC agents for information delivery)
**Requirements**: WRLD-01, WRLD-02, WRLD-03, WRLD-04, WRLD-05
**Success Criteria** (what must be TRUE):
  1. Every N in-game days, each faction gets an LLM evaluation of its goals, tags, chronicle, and neighbors -- producing territory changes, faction tag updates, and World Chronicle entries
  2. Factions can take actions (expand territory, declare war, trade) and update goals via structured tools; results mutate location tags and faction state
  3. Unexpected world events (plagues, disasters, anomalies) are occasionally introduced when narratively appropriate
  4. NPCs learn about world events through location history, chronicle entries, and proximity/faction affiliation -- information does not teleport
**Plans**: 2 plans

Plans:
- [x] 08-01: Faction Tick System
- [x] 08-02: World Events + Information Flow

### Phase 9: Persistence
**Goal**: Player can save, load, and branch campaign state for death recovery and "what if" exploration
**Depends on**: Phase 3 (game state to snapshot)
**Requirements**: SAVE-01, SAVE-02, SAVE-03, SAVE-04
**Success Criteria** (what must be TRUE):
  1. Player can create a named checkpoint that snapshots state.db + vectors/ directory with timestamp
  2. Player can load any checkpoint to restore full campaign state (DB + vectors + chat history)
  3. Checkpoint list is visible in UI with timestamp and description; player can manage (load/delete) checkpoints
  4. The game auto-creates a checkpoint before potentially lethal encounters (HP <= 2 entering combat)
**Plans**: 2 plans

Plans:
- [x] 09-01: Checkpoint Save/Load System
- [x] 09-02: Auto-checkpoint + UI

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
**Plans**: 2 plans

Plans:
- [x] 10-01-PLAN.md -- Image generation module + prompt builder + cache + serving route
- [x] 10-02-PLAN.md -- Portrait on save + scene/location triggers + frontend display

### Phase 11: Content Import
**Goal**: Players can import external content -- SillyTavern WorldBooks and web-sourced lore -- into their campaign worlds
**Depends on**: Phase 5 (lore card system for imported content)
**Requirements**: IMPT-01, IMPT-02, IMPT-03, IMPT-04
**Success Criteria** (what must be TRUE):
  1. Player can upload a SillyTavern WorldBook JSON file and see a preview of parsed entries before import
  2. WorldBook entries are cleaned of SillyTavern-specific data (activation keys, recursion settings) and classified by type (character, location, faction, bestiary, lore) via LLM
  3. Classified entries are routed to appropriate DB tables (NPCs, locations, factions) or stored as lore cards
  4. IP research supports multiple search sources (DuckDuckGo MCP, Z.AI search MCP) for broader lore discovery
**Plans**: 3 plans

Plans:
- [x] 11-01: WorldBook Import Pipeline (completed 2026-03-19)
- [x] 11-02: Web Search Expansion
- [x] 11-03: WorldBook as scaffold foundation (upload on Step 1, background classification, feeds DNA generation)

### Phase 12: E2E QA & Bug Fixing
**Goal**: All 73 v1 requirements verified working in real browser usage via Playwright MCP -- every page renders, every flow completes, every interaction works. Bugs found are fixed immediately and re-tested.
**Depends on**: Phase 11
**Requirements**: All v1 requirements (cross-cutting QA validation)
**Success Criteria** (what must be TRUE):
  1. All backend unit tests pass (0 failures)
  2. Every page renders correctly with dark theme, passes 6-aspect visual rubric
  3. Campaign creation flow works end-to-end through browser
  4. Gameplay loop works: action -> Oracle -> narrative -> quick actions
  5. Story control works: retry, undo, inline edit
  6. WorldBook import works through browser upload
  7. Checkpoints save/load/delete work through browser
**Plans**: 5 plans

Plans:
- [x] 12-01-PLAN.md -- Fix failing unit tests (prerequisite) (completed 2026-03-19)
- [x] 12-02-PLAN.md -- UI Polish & Visual QA (every page screenshotted + rubric scored)
- [x] 12-03-PLAN.md -- Campaign Flow E2E (new campaign -> world review -> character -> game)
- [x] 12-04-PLAN.md -- Gameplay E2E (actions, Oracle, streaming, story control)
- [x] 12-05-PLAN.md -- Import & Persistence E2E (WorldBook import + checkpoints)

### Phase 13: Gameplay Playtest & AI Tuning
**Goal**: AI Game Master produces quality gameplay across 3 different scenarios -- Oracle gives reasonable probabilities, Storyteller narrates atmospherically with correct outcome tier differentiation, NPCs act autonomously, factions evolve the world, and combat mechanics work correctly under stress
**Depends on**: Phase 12
**Requirements**: Qualitative playtest (no formal requirement IDs)
**Success Criteria** (what must be TRUE):
  1. Known IP campaign (Naruto) uses canon terminology and research agent grounding
  2. Original world campaign produces unique setting via World DNA, maintains consistency over 15+ turns
  3. Oracle probabilities are reasonable (20-80 for standard actions, <15 absurd, >85 trivial)
  4. Storyteller differentiates strong_hit / weak_hit / miss narratively
  5. NPC agents take autonomous actions, reflect on events, show goal-driven behavior
  6. Faction ticks produce observable world changes
  7. HP tracking accurate, death at HP=0 is contextual, auto-checkpoint works
  8. Average gameplay quality >= 3.5/5.0 across all sessions
**Plans**: 3 plans

Plans:
- [x] 13-01-PLAN.md -- Known IP Playtest (Naruto) + initial tuning
- [x] 13-02-PLAN.md -- Original World Playtest (Dark Fantasy) + long-session tuning
- [x] 13-03-PLAN.md -- Combat & Mechanics Stress Test + final tuning

### Phase 14: Final Systems Verification & Bug Fixing
**Goal:** Fix all remaining bugs (lore extraction, LanceDB episodic events, DuckDuckGo MCP, location sidebar, quick actions fallback) and verify every system described in docs/ works end-to-end with GLM-5 Turbo. Final QA pass with 4.5+ quality across all areas.
**Requirements**: Qualitative verification (no formal requirement IDs)
**Depends on:** Phase 13
**Plans:** 3/3 plans complete

Plans:
- [x] 14-01-PLAN.md -- Fix backend bugs (episodic vector, MCP spawn, quick actions fallback)
- [x] 14-02-PLAN.md -- Fix frontend/lore bugs (location sidebar, lore extraction resilience)
- [x] 14-03-PLAN.md -- E2E verification playtest with GLM-5 Turbo

### Phase 15: Systematic Mechanics Fix & Docs-Driven Verification
**Goal:** Fix 6 gameplay-breaking bugs found in playtest (HP on Strong Hit, move_to missing, NPCs invisible, tool-call leaks, auto-checkpoint timing, HP=0 handling) with backend enforcement, then verify all mechanics from docs/ work correctly.
**Requirements**: Systematic fix + verification (no formal requirement IDs)
**Depends on:** Phase 14
**Plans:** 3/3 plans complete

Plans:
- [x] 15-01-PLAN.md -- Core mechanics fixes: HP guard, Storyteller move_to tool, NPC prompt instructions
- [x] 15-02-PLAN.md -- Safety nets: tool-call sanitization, reactive auto-checkpoint, HP=0 context injection
- [x] 15-03-PLAN.md -- Systematic verification playtest against all docs/ mechanics

## Progress

**Execution Order:**
Phases execute in numeric order across the active roadmap: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 -> 12 -> 13 -> 14 -> 15 -> 16 -> 17 -> 23 -> 24 -> 25 -> 26 -> 27 -> 28 -> 29 -> 30 -> 31 -> 32 -> 33

Note: Backlog phases (like 999.1) are tracked separately and are not part of the active execution order. Phase 4 can start after Phase 2. Phases 9-11 can run in any order after their dependencies are met.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Engine Foundation | 2/2 | Complete | 2026-03-18 |
| 2. Turn Cycle | 2/2 | Complete | 2026-03-18 |
| 3. World State Mechanics | 3/3 | Complete | 2026-03-18 |
| 4. Story Control | 2/2 | Complete | 2026-03-18 |
| 5. Episodic Memory | 2/2 | Complete | 2026-03-18 |
| 6. NPC Agents | 2/2 | Complete | 2026-03-18 |
| 7. Reflection + Progression | 2/2 | Complete | 2026-03-18 |
| 8. World Engine | 2/2 | Complete | 2026-03-18 |
| 9. Persistence | 2/2 | Complete | 2026-03-19 |
| 10. Image Generation | 2/2 | Complete | 2026-03-19 |
| 11. Content Import | 3/3 | Complete | 2026-03-19 |
| 12. E2E QA & Bug Fixing | 5/5 | Complete | 2026-03-19 |
| 13. Gameplay Playtest & AI Tuning | 3/3 | Complete | 2026-03-20 |
| 14. Final Systems Verification | 3/3 | Complete | 2026-03-20 |
| 15. Systematic Mechanics Fix | 3/3 | Complete | 2026-03-20 |
| 16. NPC System QA | 3/3 | Complete | 2026-03-20 |
| 17. Unit Test Coverage | 5/5 | Complete | 2026-03-21 |
| 23. Unified Research & World Generation Pipeline | 2/2 | Complete | 2026-03-30 |
| 24. Worldgen Known IP Quality | 4/4 | Complete | 2026-03-25 |
| 25. Structured Divergence Interpretation | 3/3 | Complete   | 2026-03-30 |
| 26. Reusable multi-worldbook library for campaign creation | 3/3 | Complete   | 2026-03-31 |
| 27. Lore card editing and deletion | 3/3 | Complete   | 2026-03-31 |
| 28. Research & Design Synthesis | 1/3 | In Progress|  |
| 29. Unified Character Ontology & Tag System | 0/0 | Not Started | - |
| 30. Start Conditions, Canonical Loadouts, and Persona Templates | 0/0 | Not Started | - |
| 31. Prompt System Harmonization & Audit | 0/0 | Not Started | - |
| 32. Desktop-First Non-Game UI Overhaul | 0/0 | Not Started | - |
| 33. Browser E2E Verification for Redesigned Creation Flows | 0/0 | Not Started | - |

### Phase 16: NPC System QA — Three NPC Tiers + World Gen Integration

**Goal:** Systematically verify the entire NPC system across all 3 tiers (key/persistent/temporary) and all lifecycle stages: world generation, world review, and gameplay runtime behavior.
**Requirements**: NPC QA verification (no formal requirement IDs)
**Depends on:** Phase 15
**Plans:** 3/3 plans complete

Plans:
- [x] 16-01-PLAN.md -- Scaffold NPC generation + DB integrity + NPC creation API modes
- [x] 16-02-PLAN.md -- World Review NPC tab display, editing, tier changes, duplicate warnings
- [x] 16-03-PLAN.md -- Gameplay NPC behavior: Key NPC ticks, spawn_npc, tier differentiation, off-screen sim

### Phase 17: Unit Test Coverage — real tests for untested backend and frontend modules, desloppify strict 95+

**Goal:** Write real unit tests for all untested backend logic modules (worldgen, campaign), backend routes (ai, images, character, worldgen), and frontend pure logic (world-data-helpers, v2-card-parser). Remove desloppify test_coverage ignore patterns. Target: desloppify strict score 95+.
**Requirements**: Unit test coverage (no formal requirement IDs)
**Depends on:** Phase 16
**Plans:** 5/5 plans complete

Plans:
- [x] 17-01-PLAN.md -- Worldgen logic tests: scaffold-saver + worldbook-importer
- [x] 17-02-PLAN.md -- Campaign logic tests: manager + checkpoints
- [x] 17-03-PLAN.md -- Frontend pure logic tests: world-data-helpers + v2-card-parser
- [x] 17-04-PLAN.md -- Route tests: ai + images + character
- [x] 17-05-PLAN.md -- Route tests: worldgen + desloppify ignore cleanup

### Phase 23: Unified Research & World Generation Pipeline

**Goal:** Single research pipeline with cached results, feeding both DNA and scaffold generation. AI evaluates research sufficiency before each generation step.
**Requirements**: TBD
**Depends on:** Phase 17
**Plans:** 2/2 plans complete

Plans:
- [x] 23-01-PLAN.md -- Persist ipContext in campaign config
- [x] 23-02-PLAN.md -- Research sufficiency check before scaffold steps

### Phase 24: Worldgen Known IP Quality

**Goal:** Intelligent world-building pipeline: (1) DNA with inter-category dependencies and reasoning, (2) incremental generation within each scaffold step (mini-calls building element-by-element from general to specific, each referencing already-created elements), (3) canonical fidelity for known IPs (butterfly-effect changes only), (4) key vs supporting NPC tiers (10-15 total), (5) research-grounded lore. Prompt engineering best practices throughout (stop-slop, anti-hallucination, structured reasoning).
**Requirements**: P24-01, P24-02, P24-03, P24-04, P24-05, P24-06, P24-07, P24-08, P24-09
**Depends on:** Phase 17
**Plans:** 4/4 plans complete

Plans:
- [x] 24-01-PLAN.md -- Types + prompt utilities + sequential DNA generation
- [x] 24-02-PLAN.md -- Premise step + locations step + factions step (plan+detail mini-calls)
- [x] 24-03-PLAN.md -- NPCs step (key/supporting tiers) + lore extractor (IP grounding)
- [x] 24-04-PLAN.md -- Orchestrator wiring + scaffold-saver tier mapping + route schema updates

### Phase 25: Replace premise-override heuristics with structured divergence interpretation

**Goal:** Known-IP world generation interprets the player's premise as canonical baseline plus structured divergence, then reuses that interpretation across DNA, scaffold, and lore generation without regressing Phase 24 canonical fidelity.
**Requirements**: P25-01, P25-02, P25-03, P25-04, P25-05, P25-06
**Depends on:** Phase 24
**Plans:** 3/3 plans complete

Plans:
- [x] 25-01-PLAN.md -- Divergence contract, interpreter, cache/schema handoff
- [x] 25-02-PLAN.md -- Divergence-aware prompt contracts across DNA, scaffold, and lore
- [x] 25-03-PLAN.md -- Legacy override cleanup plus regression lock-in





### Phase 26: Reusable multi-worldbook library for campaign creation

**Goal:** Campaign creation can reuse and combine multiple processed worldbooks from a local library, with backend-composed generation context and campaign-level source provenance preserved across DNA suggestion and direct world generation.
**Requirements**: P26-01, P26-02, P26-03, P26-04, P26-05
**Depends on:** Phase 25
**Plans:** 3/3 plans complete

Plans:
- [x] 26-01-PLAN.md -- Reusable library contracts, file-backed storage, and import/list routes
- [x] 26-02-PLAN.md -- Deterministic backend composition plus campaign/worldgen compatibility
- [x] 26-03-PLAN.md -- Wizard multi-source selection UX and frontend migration

### Phase 27: Lore card editing and deletion

**Goal:** World review users can edit or delete individual lore cards without destabilizing semantic search or forcing collection-wide cleanup.
**Requirements**: P27-01, P27-02, P27-03, P27-04, P27-05, P27-06
**Depends on:** Phase 26
**Success Criteria** (what must be TRUE):
  1. A user can edit a single lore card's term, definition, and category from the world review tab, and the saved change persists after refresh.
  2. A user can delete a single lore card without affecting the rest of the campaign lore collection.
  3. Invalid edit payloads are rejected clearly, and edit/delete requests for missing cards return 404 instead of silent success.
  4. Semantic lore search reflects edited content after save, proving vector freshness is maintained.
  5. Automated regressions cover edit success, delete success, validation failure, not-found handling, and UI refresh/pending behavior.
**Plans:** 3/3 plans complete

Plans:
- [x] 27-01-PLAN.md -- Backend lore item routes + stable-id vector mutation safety
- [x] 27-02-PLAN.md -- World-review lore edit/delete UI + client helpers
- [x] 27-03-PLAN.md -- Regression coverage + smoke verification

### Phase 28: Research & Design Synthesis for Character Systems, Prompts, UI, and External References

**Goal:** Build a research-grounded implementation foundation for the next milestone by studying prompt engineering, desktop UI patterns, WorldForge's current prompt/character architecture, and the Aventuras codebase, then synthesize those findings into one coherent redesign direction.
**Requirements**: P28-01, P28-02, P28-03, P28-04, P28-05, P28-06
**Depends on:** Phase 27
**Success Criteria** (what must be TRUE):
  1. A written synthesis explains what the new shared character model must be, why flat tags are insufficient, and how prompts/UI/runtime should consume the new structure.
  2. Aventuras is inspected for reusable concepts, patterns, or implementation ideas, with concrete take/do-not-take decisions recorded.
  3. Desktop UI direction is defined for non-game flows with explicit constraints: FHD/1440p first, Tailwind + shadcn only, no bespoke CSS files.
  4. Prompt-engineering findings are converted into actionable rules for WorldForge prompt rewrites instead of vague notes.
**Plans**: 3 plans

Plans:
- [x] 28-01-PLAN.md -- Character-system audit + canonical ontology/start/persona handoff for Phases 29-30
- [ ] 28-02-PLAN.md -- Prompt family inventory + rewrite rulebook + Phase 31 handoff
- [ ] 28-03-PLAN.md -- Aventuras adoption decisions + desktop UI workspace spec + Phase 32-33 handoff

### Phase 29: Unified Character Ontology & Tag System

**Goal:** Replace the current flat character tag pile with a structured character ontology shared by player characters and NPCs, with clear derivation rules for any remaining runtime tags.
**Requirements**: P29-01, P29-02, P29-03, P29-04, P29-05, P29-06
**Depends on:** Phase 28
**Success Criteria** (what must be TRUE):
  1. Player and NPC generation use the same underlying character profile shape instead of unrelated prompt contracts.
  2. Traits, skills, flaws, role/background, drives, and stateful conditions are separated into meaningful buckets with explicit semantics.
  3. Any flat tags retained for engine/runtime use are derived from the structured profile, not treated as the source of truth.
  4. Existing editing and prompt assembly flows can read the new structure without regressing gameplay/runtime behavior.
**Plans**: 0 plans

### Phase 30: Start Conditions, Canonical Loadouts, and Persona Templates

**Goal:** Treat character start as a full scenario (location + arrival conditions + canonical situation) and add reusable base personas that can seed both protagonist and NPC creation.
**Requirements**: P30-01, P30-02, P30-03, P30-04, P30-05, P30-06
**Depends on:** Phase 29
**Success Criteria** (what must be TRUE):
  1. The user can describe how and under what circumstances they enter the world, not just choose a location.
  2. Starting equipment derives from the resolved starting scenario and canonical baseline, rather than from a detached vibe list.
  3. Persona templates can be created, stored, selected, and used to generate or parse both player characters and NPCs.
  4. World and character prompts receive structured start-condition context they can reason about consistently.
**Plans**: 0 plans

### Phase 31: Prompt System Harmonization & Audit

**Goal:** Audit and rework prompts across WorldForge so generation, interpretation, runtime narration, and character systems behave as one consistent machine.
**Requirements**: P31-01, P31-02, P31-03, P31-04, P31-05, P31-06
**Depends on:** Phase 30
**Success Criteria** (what must be TRUE):
  1. Character, worldgen, prompt-assembler, runtime, and support prompts follow a coherent shared contract instead of drifting independently.
  2. Prompts explicitly preserve user-provided facts, constrain structured outputs correctly, and reflect the new character/start-condition model.
  3. Prompt changes are justified by concrete research findings and verified through targeted regressions or browser/API checks.
  4. The system no longer contains obviously stale, contradictory, or noise-inducing prompt instructions in critical flows.
**Plans**: 0 plans

### Phase 32: Desktop-First Non-Game UI Overhaul

**Goal:** Redesign the non-game product surface so campaign creation, world review, character creation, settings, and adjacent flows feel intentional, desktop-first, and production-ready.
**Requirements**: P32-01, P32-02, P32-03, P32-04, P32-05, P32-06
**Depends on:** Phase 31
**Success Criteria** (what must be TRUE):
  1. Non-game screens are visibly reworked for FHD/1440p desktop usage with better hierarchy, density, workflows, and visual consistency.
  2. The redesign uses Tailwind, shadcn, and compatible libraries only, with no custom CSS files introduced.
  3. Character creation and world review especially reflect the new ontology/start/persona systems cleanly.
  4. The redesign respects existing visual language where appropriate but removes the current broken or clumsy workflow hotspots.
**Plans**: 0 plans

### Phase 33: Browser E2E Verification for Redesigned Creation Flows

**Goal:** Validate the redesigned prompt, character, persona, start-condition, and UI flows through real browser testing and polish remaining regressions.
**Requirements**: P33-01, P33-02, P33-03, P33-04
**Depends on:** Phase 32
**Success Criteria** (what must be TRUE):
  1. End-to-end browser tests cover campaign creation, DNA/world generation entry, character creation, persona selection, starting situation resolution, and world review editing on the redesigned UI.
  2. Bugs discovered during E2E verification are fixed and re-tested in the same phase.
  3. At least one known-IP flow and one original-world flow are smoke-tested after the redesign.
  4. The resulting UX feels stable enough to hand back to the user without obvious broken states or blocking regressions.
**Plans**: 0 plans
