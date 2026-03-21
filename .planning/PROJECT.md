# WorldForge

## What This Is

An AI-driven text RPG sandbox where an LLM Game Master narrates a living world while a deterministic engine handles all mechanics. The player defines any universe — original or from a known IP — and lives inside it as a single protagonist. NPCs pursue their own goals, factions clash, events ripple outward. Singleplayer, browser-based, fully local.

## Core Value

The LLM is the narrator, never the engine. All mechanical outcomes (probability, inventory, movement, HP) are resolved by backend code. The LLM only translates results into prose. This separation ensures consistency, consequences, and fairness in an open-ended sandbox.

## Requirements

### Validated

<!-- Shipped and confirmed working (Tasks 1-14). -->

- ✓ Hono backend + Next.js frontend + health check — Task 1
- ✓ Three-column "Solid Slate" CRPG layout, title screen, dark theme — Task 2
- ✓ Settings panel: providers CRUD, 4 roles (Judge/Storyteller/Generator/Embedder), images tab — Task 3
- ✓ SQLite schema: 8 tables (campaigns, players, npcs, locations, items, factions, relationships, chronicle) — Task 4
- ✓ Campaign manager: create/load/delete, file-based campaign directories — Task 5
- ✓ AI integration: test connection, test role, resolveRoleModel, provider registry — Task 6
- ✓ Narrative chat: Storyteller streaming, chat history on disk, action bar — Task 7
- ✓ World DNA: 6 categories, AI-generated or random seeds, toggleable/editable — Task 8
- ✓ Scaffold generation: 5-step pipeline (premise→locations→factions→NPCs→lore) with SSE progress — Task 9
- ✓ Scaffold saver: DB integration, isStarting locations, bidirectional location graph — Task 10
- ✓ Lore cards: 30-50 auto-extracted from scaffold, LanceDB embeddings, semantic search, lore panel — Task 11
- ✓ Research agent: IP researcher with DuckDuckGo MCP + LLM fallback, configurable — Task 12
- ✓ Player character: creation page (parse description / AI generate / import V2-V3 card), save to DB — Task 13
- ✓ NPC generation: 3 creation modes in world-review, stable keys, duplicate warnings — Task 14
- ✓ Prompt assembler: structured context from 6+ sources with token budgets — Phase 1
- ✓ Oracle probability system: Judge LLM evaluation, D100 roll, 3-tier outcomes, soft-fail — Phase 1
- ✓ OraclePanel: collapsible UI showing chance%, roll, tier, reasoning — Phase 1
- ✓ Turn processor: full Oracle→Storyteller pipeline as async generator — Phase 2
- ✓ Storyteller tool calling: 6 tools (add_tag, remove_tag, set_relationship, chronicle, log_event, quick_actions) — Phase 2
- ✓ SSE streaming: typed events (narrative, oracle_result, state_update, quick_actions, done) — Phase 2
- ✓ Quick action buttons: context-sensitive clickable suggestions from Storyteller — Phase 2
- ✓ Spawn tools: spawn_npc, spawn_item, reveal_location, set_condition, transfer_item — Phase 3
- ✓ HP/damage system: 5-point scale, contextual death narration at HP=0 — Phase 3
- ✓ Inventory system: strict item table, backend-validated transfers — Phase 3
- ✓ Location navigation: movement detection, on-the-fly generation, entity tracking — Phase 3
- ✓ Frontend sidebars: live HP/inventory character panel, clickable location panel — Phase 3
- ✓ Story control: retry/regenerate, undo with state rollback, inline edit — Phase 4
- ✓ Episodic memory: event embedding, composite retrieval (sim×0.4+rec×0.3+imp×0.3) — Phase 5
- ✓ Smart context compression: first+last+anomalous events, token-budget aware — Phase 5
- ✓ Multi-hop graph queries: 2-hop BFS relationship traversal for context enrichment — Phase 5
- ✓ NPC agents: autonomous Key Characters with 4 tools, Oracle-based actions, tick scheduling — Phase 6
- ✓ Off-screen simulation: batch LLM processing of distant Key NPCs every N ticks — Phase 6
- ✓ Character promotion: extra→persistent→key tier upgrades via API — Phase 6
- ✓ NPC reflection: importance-triggered belief/goal/relationship synthesis — Phase 7
- ✓ Wealth/skill progression: tag-tier upgrades via Reflection Agent — Phase 7
- ✓ Relationship evolution: qualitative tags updated by Reflection — Phase 7
- ✓ World Engine: faction macro-ticks, territory changes, world events — Phase 8
- ✓ Information flow: NPC knowledge from location/faction/chronicle context — Phase 8
- ✓ Checkpoints: save/load/branch, auto-checkpoint before lethal encounters — Phase 9
- ✓ Image generation: provider-agnostic portraits/scenes/locations, optional — Phase 10
- ✓ WorldBook import: parse → clean → classify → route to DB tables — Phase 11
- ✓ Web search expansion: multi-provider MCP (DuckDuckGo + Z.AI) — Phase 11
- ✓ World Engine: faction macro-ticks, territory changes, world events — Phase 8
- ✓ Information flow: NPC knowledge from location/faction/chronicle context — Phase 8

### Active

<!-- Full remaining scope from design docs. No MVP, no corners cut. -->

- [ ] Probability Oracle — Judge LLM evaluates action probability (0-100), backend rolls D100, 3-tier outcomes (Strong Hit / Weak Hit / Miss)
- [ ] Game Engine turn processing — full turn cycle: input → context assembly → Oracle → roll → narration → state update
- [ ] Storyteller tool calling — spawn_npc, spawn_item, reveal_location, add_tag, remove_tag, set_relationship, set_condition, add_chronicle_entry, log_event, offer_quick_actions
- [ ] Quick-action buttons — context-sensitive actions generated by backend, rendered as clickable buttons in UI
- [ ] HP & damage system — 5-point scale, set_condition tool, Storyteller determines death/defeat outcomes at HP=0
- [ ] Inventory system — strict item table, item transfers (loot/trade), equipment, backend-validated
- [ ] Location graph navigation — player movement between nodes, travel time, on-the-fly node generation beyond scaffold
- [ ] Entity tracking — NPCs and items tracked per location node, presence lists in prompts
- [ ] Prompt assembly — full structured context (system rules, world premise, scene, player state, NPC state, lore, memories, conversation, action result)
- [ ] Episodic memory — embed event summaries per turn in LanceDB, composite retrieval (sim×0.4 + rec×0.3 + imp×0.3), importance scoring (1-10)
- [ ] NPC Agent system — Key Characters as autonomous agents with goals, act/speak/move/update_goal tools, individual LLM calls per tick when in player's location
- [ ] Off-screen NPC simulation — batch LLM call every N ticks for off-screen Key Characters, structured action/location updates
- [ ] NPC Reflection — importance-triggered (sum≥15) synthesis of episodic memories into beliefs, goals, relationship tags via Reflection Agent tools
- [ ] Character promotion — extras → persistent → key tier upgrades
- [ ] World Engine — faction macro-ticks every N in-game days, territory changes, world events, chronicle updates, location tag changes
- [ ] Information flow — NPCs learn events through location history + chronicle + proximity/faction affiliation inference
- [ ] Multi-hop graph queries — follow relationship chains (NPC→location→faction) via SQL JOINs for context assembly
- [ ] Smart context compression — first messages (world setup) + last N turns + anomalous events (fights, deaths, discoveries) in prompt window
- [ ] Save/Load/Checkpoints — snapshot state.db + vectors for death recovery and "what if" branching
- [ ] Image generation — provider-agnostic (fal, GLM, Stable Diffusion, DALL-E, ComfyUI, custom), portraits/scenes/locations/items, style prompts from world state, caching, graceful degradation
- [ ] WorldBook import — SillyTavern WorldBook JSON → clean from junk → separate entities by type (characters, bestiary, locations, lore) → ingest into Lore DB
- [ ] Web search expansion — multiple search sources (DuckDuckGo MCP, Z.AI search MCP, others) for IP research and lore ingestion
- [ ] Death & defeat — GM-driven narrative outcomes at HP=0 based on attacker intent, situation, drama. Not automatic death.
- [ ] Wealth system — tag-based tiers (Destitute→Obscenely Rich), Oracle-evaluated trading
- [ ] Skill progression — descriptive tag tiers (Novice→Skilled→Master), Reflection-driven progression
- [ ] Relationship evolution — qualitative tags updated by Reflection Agent, no numeric scores
- [ ] Soft-fail system — nothing hard-blocked, near-zero chance actions still attempted, consequences always narrated

### Out of Scope

- Electron/Tauri desktop wrapper — can't E2E test through browser properly
- Multiplayer — singleplayer only by design
- Cloud deployment / accounts — localhost only, local files
- Mobile app — web-first
- Tactical squad control / party management — one protagonist
- Docker — not planned for initial version

## Context

**Existing codebase:** 14 tasks completed. Full world generation pipeline works end-to-end (research→DNA→scaffold→lore→character→game). Basic Storyteller chat loop functional but without Oracle, tools, or game mechanics. DB schema has all 8 tables but most are only written during world gen, not used during gameplay.

**Tech stack locked:** Hono + Next.js + Drizzle/SQLite + LanceDB + Vercel AI SDK + Zod. All decisions validated through research (see docs/research.md).

**Architecture validated:** Deterministic engine + LLM narrator split confirmed by academic research (RPGBENCH, AIDM). Multi-agent separation (Oracle/Storyteller/NPC/Reflection/WorldEngine) confirmed by Static vs Agentic GM paper. Tag-based mechanics validated by Fate Core and Disco Elysium analysis.

**Provider ecosystem:** GLM (Z.AI), OpenRouter, OpenAI, Anthropic, Ollama. MiniMax deprecated. Image generation needs broad provider support (fal, GLM, SD, DALL-E, ComfyUI, custom OpenAI-compatible).

## Constraints

- **Single-user local:** No auth, no multi-tenancy. One campaign active at a time.
- **LLM cost awareness:** Judge role should use cheap/fast models. Storyteller uses flagship. Minimize unnecessary LLM calls.
- **No Python:** All components must be JS/TS native. LanceDB is Rust-based with JS bindings.
- **Tag-based only:** No numeric stats except HP (1-5). Wealth, skills, relationships are all tag tiers.
- **Provider-agnostic:** Every LLM and image gen integration must work through OpenAI-compatible API pattern.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Deterministic engine + LLM narrator | LLMs hallucinate mechanics; backend must be source of truth | ✓ Good |
| Tag-based system (no numeric stats) | Scales in open-ended sandbox; Fate Core validated | ✓ Good |
| 3-tier outcomes (Strong Hit / Weak Hit / Miss) | Richer than binary; PbtA/Ironsworn validated | — Pending |
| Composite retrieval scoring (sim×0.4+rec×0.3+imp×0.3) | Stanford Generative Agents pattern | — Pending |
| Reflection by importance threshold (sum≥15) | Drama-driven, not timer-driven | — Pending |
| No graph DB (Neo4j rejected) | SQL JOINs on relationships table sufficient | — Pending |
| WorldBook cleaning on import | SillyTavern cards have irrelevant data for our system | — Pending |

---
*Last updated: 2026-03-19 after all 11 phases complete — v1 feature-complete*
