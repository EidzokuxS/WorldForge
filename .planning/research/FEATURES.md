# Feature Landscape

**Domain:** AI text RPG / Interactive Fiction with LLM Game Master
**Researched:** 2026-03-18
**Scope:** Gameplay features only (world gen, character creation, settings already shipped)

## Competitive Landscape Summary

Competitors researched: AI Dungeon, SillyTavern (as RPG), NovelAI, KoboldAI, Hidden Door, Infinite Adventures, Character.AI (roleplay), Intra (indie LLM text adventure).

**Key insight:** Most competitors are pure-LLM systems -- the AI generates everything including mechanics, with no deterministic engine. WorldForge's separation of deterministic engine + LLM narrator is rare and represents the primary architectural differentiator. Only Hidden Door and Intra attempt similar separation, and both struggle with it (per design reviews).

**Second insight:** Memory and context management is the #1 pain point across all platforms. AI Dungeon invested heavily in SCORE/Memory Bank, NovelAI has lorebooks, SillyTavern has World Info -- all attempting to solve "the AI forgot what happened 20 turns ago." WorldForge's dual-store architecture (SQLite facts + LanceDB semantic memory) is architecturally ahead of all competitors.

## Table Stakes

Features users expect. Missing = product feels incomplete or broken.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Retry/Regenerate response | Every competitor has it. AI Dungeon, NovelAI, KoboldAI all offer retry. Users expect bad outputs to be disposable. | Low | Store previous response, re-call Storyteller on retry. Keep retry tree optional (NovelAI has full tree, AI Dungeon has simple retry). |
| Undo/Redo actions | AI Dungeon and NovelAI both offer undo. Users expect to rewind mistakes. | Low | Pop last action+response from chat history, restore state snapshot. Redo = re-apply. |
| Edit AI output | AI Dungeon "Alter", NovelAI inline editing. LLMs produce errors -- users must be able to fix names, facts, inconsistencies. | Low | Allow editing response text in narrative log. Edited text stored as canonical. |
| Action probability + dice roll | Hidden Door uses d20, AI Dungeon has implicit success/fail, Infinite Adventures has optional dice. Any "game" (vs pure chat) needs mechanical resolution. | Medium | Oracle system already designed. Judge LLM evaluates 0-100 chance, backend rolls D100, 3-tier outcome. |
| HP/damage with consequences | Expected in any RPG framing. Without it, combat has no stakes. | Medium | 5-point HP scale, set_condition tool, death/defeat narrative system. |
| Inventory management | Intra developer explicitly flagged lack of inventory as a major gap. Players expect to find, carry, use, trade items. | Medium | Strict item table, item transfers (loot/trade/drop), equipment slots. Backend validates -- Storyteller cannot hallucinate items into existence. |
| Location awareness | Players need to know where they are, what's around them, who's present. AI Dungeon lacks this (pure narrative), Hidden Door has it vaguely. | Medium | Left sidebar shows current location, present NPCs/items, connected locations. Already have location graph in DB. |
| Save/Load | AI Dungeon auto-saves adventures. NovelAI saves stories. Users expect persistence. | Low | Already auto-saving (SQLite + files on disk). Need checkpoint/snapshot for manual save points. |
| Context-sensitive suggested actions | Hidden Door's core UX -- generated choices alongside free text. Reduces blank-page anxiety. AI Dungeon relies on pure free text (weakness). | Medium | offer_quick_actions tool for Storyteller to suggest 3-5 contextual actions as clickable buttons. |
| Persistent memory across turns | AI Dungeon's SCORE system, SillyTavern's World Info triggers, NovelAI's lorebook. Users rage when the AI "forgets." | High | Episodic memory (LanceDB) + lore cards (already shipped) + composite retrieval scoring. The full memory pipeline. |
| Streaming narrative | All competitors stream responses. Users expect text to appear progressively. | Low | Already implemented. |

## Differentiators

Features that set WorldForge apart. Not universally expected, but provide competitive advantage.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Deterministic engine (engine != narrator) | No competitor does this well. AI Dungeon/NovelAI/KoboldAI let the LLM decide everything -- inconsistent mechanics, hallucinated inventory, forgotten HP. WorldForge's backend is source of truth. | Already architected | This is the core value prop. Every feature below reinforces it. |
| Storyteller tool calling (structured state updates) | Instead of LLM prose implying state changes, Storyteller explicitly calls tools (spawn_npc, add_tag, set_condition). Backend validates and executes. No other consumer product does this. | High | 10+ tools defined in mechanics.md. Each needs Zod schema, validation, DB write, and prompt injection on next turn. |
| NPC autonomous agents | Key Characters with individual goals, beliefs, actions. Hidden Door generates NPCs reactively. WorldForge simulates them proactively -- NPCs act even without player prompting. | High | Individual LLM calls per NPC in scene (expensive). Off-screen batch simulation for distant NPCs. Reflection system for belief formation. |
| World Engine (faction macro-simulation) | Factions that fight wars, gain/lose territory, create world events -- independent of player. No competitor simulates macro-level world dynamics. | High | LLM call per faction every N ticks. Territory changes, chronicle updates, location tag mutations. |
| Tag-based everything (no numeric stats) | Unique approach validated by Fate Core. Tags like [Master Swordsman] are LLM-native -- the AI naturally reasons about them better than "STR: 16". | Already designed | Skills, wealth, relationships, status effects all as tags. Only numeric: HP (1-5). |
| Soft-fail system (nothing hard-blocked) | Most RPG systems block impossible actions. WorldForge lets you attempt anything -- the Oracle assigns near-zero probability, and failure is narrated with consequences. | Low | Oracle naturally handles this -- just never return chance=0. |
| NPC Reflection (belief synthesis) | Stanford Generative Agents pattern. NPCs form beliefs, update goals, evolve relationships based on accumulated experiences. No consumer product implements this. | High | Importance-triggered (sum >= 15), reads episodic memories, writes beliefs/goals to SQLite. |
| Death as narrative (not mechanical) | HP=0 does not equal death. GM evaluates context: bar brawl = knockout, assassination = death. Meaningful, dramatic deaths. | Medium | Storyteller receives context about attacker intent, situation, drama level. Checkpoint system allows recovery. |
| Checkpoint branching ("what if") | Snapshot state for death recovery OR deliberate "what if" exploration. More than save/load -- explicit branching. | Medium | Copy state.db + vectors/ to timestamped subdirectory. Load = swap active DB. |
| Image generation (portraits, scenes) | AI Dungeon has "See" button for scene illustrations. Most competitors lack integrated images. WorldForge plans provider-agnostic image gen. | High | Multiple providers (fal, GLM, SD, DALL-E, ComfyUI). Style prompts derived from world state. Caching. Graceful degradation when no provider configured. |
| Multi-hop graph queries | Follow relationship chains (NPC -> location -> faction) via SQL JOINs for richer context assembly. No competitor has structured relationship graphs. | Medium | Already have relationships table. Need graph traversal queries for context building. |
| Smart context compression | First messages + last N turns + anomalous events. Better than AI Dungeon's simple "25% story cards, 50% history, 25% memory bank" allocation. | Medium | Prioritize: world setup (always), recent turns (sliding window), high-importance events (anomaly detection). |
| WorldBook import with entity separation | SillyTavern WorldBooks contain mixed data. WorldForge separates into characters, locations, factions, lore -- each going to the right DB table. No other tool does clean separation. | Medium | Parse WorldBook JSON, LLM classifies entries by type, route to appropriate DB tables. |

## Anti-Features

Features to explicitly NOT build. These are traps.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Multiplayer / co-op | AI Dungeon has multiplayer but it's chaotic and poorly reviewed. Destroys single-protagonist focus. Massive complexity for marginal value. | Keep singleplayer. NPCs are the "other players." |
| Numeric stat sheets (STR/DEX/INT) | Traditional RPG stats create a false sense of precision that LLMs cannot maintain. AI Dungeon's lack of stats is actually a feature -- they tried D&D mode and it was inconsistent. | Tag-based system. [Master Swordsman] not STR:18. |
| Hardcoded action menus (CYOA-style) | Hidden Door's "choose from 3 options" without free text is restrictive. Infinite Adventures' pure choice mode limits creativity. | Suggested actions as supplement to free text, never replacement. Always allow typing. |
| XP / leveling system | Numeric progression creates grinding incentive. LLMs cannot reliably track XP across sessions. Creates expectation of "balanced encounters." | Tag-tier progression via Reflection (Novice -> Skilled -> Master). Progression is narrative, not mechanical. |
| Map / 2D spatial grid | Seductive but impossible to maintain with LLM narration. Coordinates conflict with narrative descriptions. AI Dungeon tried and abandoned visual maps. | Location graph (nodes + edges). Abstract, narrative-friendly, extensible. |
| Voice input/output | Multimodal is trendy but adds massive complexity, latency, and provider dependency. Character.AI's voice mode is a different product category. | Text-first. Clean typography, solid UI. |
| Community sharing / scenario marketplace | AI Dungeon's scenario sharing is a moderation nightmare. Distracts from core product. | Focus on single-player local experience. Import V2 cards and WorldBooks for community content. |
| Real-time combat system | Turn-based is mandatory for LLM latency. Real-time creates impossible timing expectations. | Turn-based resolution through Oracle. Each action is one turn. |
| Automated story summary / recap | AI Dungeon's auto-summaries are frequently wrong, creating false memories. NovelAI's are better but still lossy. | Let the World Chronicle serve as the factual record. Episodic memory retrieves relevant events on demand. Manual summaries via edit if user wants. |
| Player-accessible "memory" commands | AI Dungeon's /remember command lets users inject context -- often gamed to force the AI into specific behavior. Breaks the simulation. | Backend controls context assembly. User cannot directly inject prompt text. Tags and lore cards are the structured way to define world rules. |

## Feature Dependencies

```
Oracle (probability evaluation)
  └─> Game Turn Cycle (needs Oracle for action resolution)
       └─> Storyteller Tool Calling (needs turn cycle to trigger tools)
            ├─> HP/Damage System (set_condition tool)
            ├─> Inventory System (spawn_item, item transfers)
            ├─> Location Navigation (reveal_location, movement)
            ├─> Entity Tracking (NPCs/items per location)
            └─> Quick Action Buttons (offer_quick_actions tool)

Episodic Memory (event embedding)
  └─> NPC Reflection (reads episodic memories, writes beliefs)
       └─> NPC Autonomous Agents (needs beliefs/goals from reflection)
            └─> Off-screen NPC Simulation (batch processing distant NPCs)

Prompt Assembly (context compilation)
  ├─> Smart Context Compression (optimizes what goes into prompt)
  └─> Multi-hop Graph Queries (enriches context with relationship chains)

World Engine (faction macro-simulation)
  └─> requires: Location Graph, Factions, Chronicle (all in DB)

Checkpoint System
  └─> Death/Defeat Narrative (needs checkpoints for recovery)

Image Generation (standalone, no hard dependencies)

WorldBook Import (standalone, no hard dependencies)

Retry/Undo/Edit (standalone, UI-level features)
```

## MVP Recommendation

**Note:** Per project constraints, there is no MVP phasing -- everything ships complete. However, the dependency graph dictates build order.

**Build first (foundation):**
1. Oracle (probability evaluation) -- everything else depends on mechanical resolution
2. Game Turn Cycle -- the core gameplay loop
3. Prompt Assembly -- context for all LLM calls
4. Storyteller Tool Calling -- state updates from narration
5. Retry/Undo/Edit -- basic story control (table stakes, low complexity)

**Build second (game mechanics):**
6. HP/Damage + Death/Defeat -- combat stakes
7. Inventory System -- item management
8. Location Graph Navigation -- movement and exploration
9. Entity Tracking -- who/what is where
10. Quick Action Buttons -- UX improvement

**Build third (living world):**
11. Episodic Memory -- event persistence
12. Smart Context Compression -- prompt optimization
13. Multi-hop Graph Queries -- richer context
14. NPC Reflection -- belief formation
15. NPC Autonomous Agents -- proactive NPCs
16. World Engine -- faction simulation

**Build fourth (enrichment):**
17. Checkpoint/Branching -- save states
18. Image Generation -- visual enhancement
19. WorldBook Import -- content ingestion
20. Off-screen NPC Simulation -- distant NPC processing

**Defer indefinitely:**
- Wiki URL scraping (mentioned in concept.md but high complexity, low priority vs WorldBook import)
- Web search expansion (current DuckDuckGo MCP + LLM fallback is sufficient)

## Sources

- [AI Dungeon Memory System](https://help.aidungeon.com/faq/the-memory-system) -- SCORE, Memory Bank, Story Cards
- [AI Dungeon Story Cards](https://help.aidungeon.com/faq/story-cards) -- trigger-based context injection
- [AI Dungeon Context Allocation](https://help.aidungeon.com/faq/what-goes-into-the-context-sent-to-the-ai) -- 25/50/25 split
- [AI Dungeon Basics](https://help.aidungeon.com/faq/the-basics) -- Undo/Redo/Retry/Edit/Alter
- [AI Dungeon Erase to Here](https://help.aidungeon.com/faq/what-is-erase-to-here) -- branching story control
- [AI Dungeon Image Generation](https://help.aidungeon.com/faq/how-do-i-create-pictures-in-ai-dungeon) -- "See" button, auto-prompt from context
- [Hidden Door Design Review](https://ianbicking.org/blog/2025/08/hidden-door-design-review-llm-driven-game) -- mechanics critique, grounding problem
- [Intra: LLM Text Adventure Design Notes](https://ianbicking.org/blog/2025/07/intra-llm-text-adventure) -- state management, NPC behavior, inventory gaps, action resolution pipeline
- [NovelAI Text Adventure Mode](https://docs.novelai.net/en/text/textadventure/) -- command-based input
- [NovelAI Editor Features](https://docs.novelai.net/en/text/editor/) -- retry tree, undo/redo, inline editing
- [NovelAI Lorebook](https://docs.novelai.net/en/text/lorebook/) -- keyword-triggered context injection
- [SillyTavern World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/) -- dynamic dictionary, character binding
- [KoboldAI GitHub](https://github.com/KoboldAI/KoboldAI-Client) -- Adventure Mode, Story Mode, memory, World Info
- [RPGBENCH Paper](https://arxiv.org/abs/2502.00595) -- LLMs struggle with consistent game mechanics (validates deterministic engine approach)
- [Hidden Door Launch (Variety)](https://variety.com/2025/gaming/news/hidden-door-ai-role-playing-fan-fiction-game-platform-1236488265/) -- fan fiction worlds, choice-based
- [Infinite Adventure Simulator](https://play.google.com/store/apps/details?id=com.ArcticSkyGames.ChooseYourAIAdventure) -- optional dice, multiplayer, image gen
