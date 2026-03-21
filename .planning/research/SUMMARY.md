# Project Research Summary

**Project:** WorldForge
**Domain:** AI Text RPG / LLM Game Engine with Deterministic Mechanics
**Researched:** 2026-03-18
**Confidence:** HIGH

## Executive Summary

WorldForge is building a game engine layer on top of a working world generation and chat pipeline. The core architectural bet -- deterministic engine + LLM narrator -- is rare in the competitive landscape (only Hidden Door and Intra attempt it) and validated by academic research (RPGBENCH, AIDM). The existing codebase (14 tasks shipped) provides a solid foundation: SQLite schema, LanceDB vectors, AI SDK integration, world gen pipeline, and character creation all work. What remains is the actual gameplay engine: Oracle probability resolution, Storyteller tool calling, NPC agents, memory pipeline, and world simulation.

The recommended approach is to build the engine as a new `src/engine/` layer that sits between the existing route handlers and the AI/DB layers. The Turn Processor orchestrates a strict sequence (context assembly -> Oracle -> dice roll -> Storyteller with tools -> state update -> NPC ticks). All state changes flow through a Tool Executor that validates every LLM tool call against the database before execution. This architecture reuses existing components (Drizzle queries, LanceDB search, AI SDK calls) while adding the missing orchestration layer. Only 5 new npm packages are needed (`@ai-sdk/fal`, `@ai-sdk/openai-compatible`, `p-queue`, `@crawlee/cheerio`, `chonkie`), and the state machine, save system, WorldBook import, and graph queries require zero new dependencies.

The dominant risks are state desynchronization (LLM narrates what the database contradicts), token budget explosion (unbounded prompt growth over long sessions), and NPC agent cascade loops (NPCs triggering each other in unbounded chains). All three have clear prevention strategies: post-narration state audits, a hard token budget system in the Prompt Assembler, and strict one-action-per-NPC-per-tick ordering. The most expensive mistake would be building the Prompt Assembler without token budgets -- retrofitting budgets onto an existing prompt assembly is painful and has caused rewrites in competitor projects.

## Key Findings

### Recommended Stack

The existing stack (Hono, Next.js, Drizzle/SQLite, LanceDB, AI SDK v6, Zod) is locked and sufficient. New additions are minimal and targeted. Most new features (state machine, save system, WorldBook import, graph queries, context compression) need zero new dependencies -- they are plain TypeScript, built-in Node.js APIs, or existing `better-sqlite3` methods.

**New technologies:**
- `@ai-sdk/fal` + `@ai-sdk/openai-compatible`: Image generation via AI SDK's `generateImage()` API. Provider-agnostic (fal hosts FLUX/SD/Recraft, OpenAI-compatible covers DALL-E/GLM/ComfyUI proxy). No vendor lock-in.
- `p-queue`: Concurrent LLM call management with priority levels (Oracle > Storyteller > NPC > background). Rate limiting via `intervalCap`. 15M+ weekly downloads, battle-tested.
- AI SDK v6 `ToolLoopAgent`: Reusable agent class for NPC agents, Reflection, World Engine. Replaces manual `maxSteps` loops with lifecycle hooks and stop conditions.
- `@crawlee/cheerio` + `chonkie`: Wiki scraping and RAG text chunking for future lore ingestion. Lower confidence (chonkie is pre-1.0).

**Explicitly rejected:** XState (overkill for sequential turn pipeline), Replicate (expensive), raw vendor SDKs (bypass AI SDK abstraction), graph databases (SQL JOINs sufficient).

### Expected Features

**Must have (table stakes):**
- Retry/Regenerate/Undo/Redo -- every competitor has these, low complexity
- Edit AI output -- LLMs produce errors, users must fix names/facts
- Oracle + dice roll -- any "game" needs mechanical resolution
- HP/damage with consequences -- combat without stakes is not an RPG
- Inventory management -- explicitly flagged as a gap by Intra developer
- Location awareness -- sidebar showing current location, entities present
- Context-sensitive suggested actions -- reduces blank-page anxiety (Hidden Door's core UX)
- Persistent memory across turns -- the #1 pain point across all competitors

**Should have (differentiators):**
- Deterministic engine with tool-calling state updates -- no other consumer product does this
- NPC autonomous agents with individual goals and reflection -- Stanford Generative Agents pattern
- World Engine faction macro-simulation -- unique, no competitor simulates macro-level dynamics
- Tag-based everything (no numeric stats) -- LLM-native approach validated by Fate Core
- Soft-fail system -- nothing hard-blocked, near-zero chance actions still attempted
- Death as narrative (not mechanical) -- HP=0 evaluated contextually
- Checkpoint branching for "what if" exploration
- Image generation (provider-agnostic, async, graceful degradation)

**Defer:**
- Wiki URL scraping (high complexity, WorldBook import covers community content)
- Web search expansion beyond current DuckDuckGo MCP

### Architecture Approach

The game engine is a new `src/engine/` directory with ~11 components that layer between routes and existing AI/DB code. The Turn Processor is the central orchestrator. The Prompt Assembler is the most critical new component (queries 6+ data sources, enforces token budgets). The Tool Executor is the trust boundary between LLM outputs and database state. NPC agents run via `Promise.allSettled` for parallel execution. The World Engine processes factions sequentially (order matters). Image generation is fire-and-forget async. The frontend receives SSE with typed events (narrative, oracle_result, state_update, npc_action, image).

**Major components:**
1. **Turn Processor** (`engine/turn.ts`) -- orchestrates input -> context -> Oracle -> roll -> narration -> state update -> NPC ticks
2. **Prompt Assembler** (`engine/prompt-assembler.ts`) -- compiles context from SQLite + LanceDB + chat history with hard token budgets per section
3. **Tool Executor** (`engine/tool-executor.ts`) -- validates every LLM tool call against Zod schemas and DB state before execution
4. **Oracle** (`engine/oracle.ts`) -- Judge LLM probability evaluation with structured input, temp 0, clamping
5. **NPC Orchestrator** (`engine/npc-orchestrator.ts`) -- parallel NPC agent ticks, one action per NPC per tick, timeout protection
6. **Tick Manager** (`engine/tick-manager.ts`) -- game tick counter, NPC/World Engine scheduling
7. **World Engine** (`engine/world-engine.ts`) -- faction macro-ticks with state validation
8. **Reflection Runner** (`engine/reflection.ts`) -- importance-triggered belief/goal synthesis
9. **Checkpoint Manager** (`engine/checkpoint.ts`) -- state.db backup + vectors/ copy
10. **Image Generator** (`engine/image-gen.ts`) -- async background generation with caching
11. **Episodic Memory** (`vectors/episodic-events.ts`) -- event embedding with importance threshold filtering

### Critical Pitfalls

1. **State Desynchronization** -- LLM narrates events that contradict the database (items that don't exist, dead NPCs alive in DB). Prevent with: tool-call-only state changes, post-narration state audit, failed tool call recovery. Must be addressed from the very first turn implementation.

2. **Token Budget Explosion** -- Prompt grows unbounded as the game progresses (more history, more lore, more NPCs). Prevent with: hard token limits per prompt section (total ~4200), conversation windowing (last 5-8 turns), NPC state pruning (only present NPCs), different budgets per LLM role.

3. **Tool Calling Unreliability** -- LLMs produce invalid tool arguments, call wrong tools, or omit tool calls while narrating state changes. Prevent with: minimal Zod schemas, entity ID validation, error recovery with retry, omission detection scanning narrative text.

4. **NPC Agent Cascade Loops** -- NPC A's action triggers NPC B's reaction, which triggers NPC C, creating unbounded chains. Prevent with: strict tick ordering (one action per NPC per tick, no within-tick reactions), circuit breaker, 10-second global timeout.

5. **Oracle Probability Inconsistency** -- Same action gets different probabilities due to tokenization variance. Prevent with: structured/normalized input (not free-text), temp 0, probability clamping to 5% increments, optional ruling cache.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Engine Foundation

**Rationale:** Prompt Assembler and Oracle have zero dependencies on new code -- they only read existing DB state. Tool Definitions are pure Zod schemas. These can be tested against real campaign data immediately.
**Delivers:** Prompt assembly with token budgets, Oracle probability evaluation, tool Zod schemas for all 10+ Storyteller tools.
**Addresses:** Prompt assembly, Oracle, tool definitions (FEATURES #1-3 in dependency chain).
**Avoids:** Token budget explosion (Pitfall 3) by building budgets first. Oracle inconsistency (Pitfall 2) by structuring input from day one.

### Phase 2: Core Turn Loop

**Rationale:** The Turn Processor is the central orchestrator -- everything else plugs into it. This phase transforms the current naive chat pass-through into a full game engine turn. Must include Tool Executor (the trust boundary) and SSE multi-event streaming.
**Delivers:** Complete turn cycle (input -> context -> Oracle -> roll -> narration with tools -> state update), SSE response format replacing current text stream, retry/undo/edit.
**Addresses:** Game turn cycle, Storyteller tool calling, HP/damage, inventory, location navigation, entity tracking, quick actions, retry/undo/edit.
**Avoids:** State desynchronization (Pitfall 1) via Tool Executor validation. Tool calling unreliability (Pitfall 4) via error recovery.

### Phase 3: Memory Pipeline

**Rationale:** The Prompt Assembler can work with empty memory results initially, but episodic memory is needed before NPC agents (reflection reads episodic memories). Smart context compression belongs here because it directly affects prompt assembly quality.
**Delivers:** Episodic event embedding with importance thresholds, composite retrieval scoring, smart context compression (first + last N + anomalies), multi-hop graph queries.
**Addresses:** Episodic memory, smart context compression, multi-hop graph queries.
**Avoids:** Episodic memory overhead (Pitfall 8) via importance threshold filtering and batch scoring.

### Phase 4: NPC Agents

**Rationale:** NPC agents reuse the same Prompt Assembler and Tool Executor patterns with different prompts and tools. Requires episodic memory (Phase 3) for reflection to work. This is where the game becomes a living world.
**Delivers:** Autonomous NPC agents with goals/beliefs, tick-based scheduling, off-screen batch simulation, reflection system for belief formation.
**Addresses:** NPC Agent system, off-screen NPC simulation, NPC Reflection, character promotion.
**Avoids:** NPC cascade loops (Pitfall 5) via strict tick ordering. Personality drift (Pitfall 6) via persona in system prompt + dialogue examples.
**Uses:** `p-queue` for concurrent LLM call management, AI SDK `ToolLoopAgent` for agent loops.

### Phase 5: World Engine

**Rationale:** Faction simulation depends on episodic memory and the full tool executor pipeline. It is periodic (not every turn) and adds the macro-level world dynamics that no competitor offers.
**Delivers:** Faction macro-ticks with territory changes, chronicle updates, location tag mutations. Information flow to player via NPCs and "you notice" blocks.
**Addresses:** World Engine, information flow, wealth system, skill progression, relationship evolution.
**Avoids:** Invisible chaos from faction ticks (Pitfall 10) via state validation and information delivery.

### Phase 6: Persistence and Media

**Rationale:** Checkpoints and image generation are fully independent features that don't affect the core gameplay loop. They enhance the experience but the game is complete without them.
**Delivers:** Checkpoint save/load/branching, provider-agnostic image generation (portraits, scenes, locations), death/defeat recovery.
**Addresses:** Save/Load/Checkpoints, image generation, death and defeat narrative.
**Avoids:** Image generation blocking gameplay (Pitfall 7) via fully async design. LanceDB snapshot corruption (Pitfall 11) via flush/compact before copy.
**Uses:** `@ai-sdk/fal`, `@ai-sdk/openai-compatible` for image providers. `better-sqlite3` `.backup()` for atomic DB snapshots.

### Phase 7: Content Import

**Rationale:** WorldBook import and web scraping are content ingestion features that benefit from having the full engine (entity types, lore cards, NPC creation) already working. Building import before the engine means importing into an incomplete system.
**Delivers:** SillyTavern WorldBook import with LLM-powered entity classification, wiki scraping pipeline for lore ingestion.
**Addresses:** WorldBook import, web search expansion.
**Avoids:** WorldBook import pollution (Pitfall 9) via LLM classification, preview UI, deduplication.
**Uses:** `@crawlee/cheerio`, `chonkie` for scraping and chunking.

### Phase Ordering Rationale

- **Dependency-driven:** Prompt Assembler feeds everything. Oracle is needed for turns. Turns are needed for NPC agents. Memory is needed for reflection. This is a strict dependency chain.
- **Architecture-aligned:** Each phase maps to a clean set of `src/engine/` components. Phase boundaries align with component boundaries.
- **Risk-ordered:** The highest-risk pitfalls (state desync, token budgets, tool calling) are addressed in Phases 1-2. By the time NPC agents arrive (Phase 4), the trust boundary (Tool Executor) is battle-tested.
- **Value-ordered:** Phase 2 delivers the core gameplay loop. A player can play a real game after Phase 2. Each subsequent phase adds depth without breaking what exists.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Core Turn Loop):** SSE multi-event streaming pattern needs prototyping. Tool call error recovery flow with AI SDK `maxSteps` needs validation.
- **Phase 4 (NPC Agents):** NPC prompt design is empirical. Personality preservation across sessions is unsolved. `ToolLoopAgent` API needs hands-on testing.
- **Phase 5 (World Engine):** No direct prior art for LLM-driven faction simulation. Constraint design is novel.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Engine Foundation):** Prompt assembly and Zod schemas are well-understood patterns already used in worldgen.
- **Phase 3 (Memory Pipeline):** Stanford Generative Agents paper provides the complete pattern. LanceDB integration already proven with lore cards.
- **Phase 6 (Persistence and Media):** `better-sqlite3` `.backup()` is documented. AI SDK `generateImage()` is stable. Standard async patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing stack locked. New additions are first-party Vercel packages or battle-tested (p-queue). Only chonkie (pre-1.0) has risk. |
| Features | HIGH | 8 competitor products analyzed. Dependency graph is clear. Feature prioritization backed by multiple sources. |
| Architecture | HIGH | Based on existing codebase analysis + design docs + validated research papers. Component boundaries align with existing code structure. |
| Pitfalls | HIGH | 5 critical pitfalls confirmed by 4+ independent sources each (RPGBENCH, Thirteen Hours paper, HuggingFace RPG agents, Intra). Prevention strategies are concrete. |

**Overall confidence:** HIGH

### Gaps to Address

- **NPC prompt design:** No proven template for RPG NPC agent prompts that maintain personality over long sessions. Will need empirical tuning during Phase 4.
- **Composite retrieval scoring parameters:** The 0.4/0.3/0.3 split (similarity/recency/importance) is from Stanford Generative Agents but untested for text RPGs. May need tuning during Phase 3.
- **Faction simulation constraints:** No prior art for LLM-driven faction macro-simulation. Phase 5 will need iterative design.
- **chonkie stability:** Pre-1.0 library. Fallback plan: custom recursive text splitter (~50 lines) if API shifts.
- **LanceDB snapshot safety:** Documentation doesn't specifically address snapshot safety during writes. Needs validation during Phase 6.

## Sources

### Primary (HIGH confidence)
- [RPGBENCH: Evaluating LLMs as RPG Engines](https://arxiv.org/abs/2502.00595) -- LLM consistency failures, validates deterministic engine
- [You Have Thirteen Hours (Function Calling for AI GMs)](https://arxiv.org/html/2409.06949v1) -- State management via tool calling, dice roll patterns
- [AI SDK 6 docs](https://ai-sdk.dev/) -- ToolLoopAgent, generateImage, tool calling, streaming
- [Intra: LLM Text Adventure Design Notes](https://ianbicking.org/blog/2025/07/intra-llm-text-adventure) -- State management, NPC behavior, inventory gaps, info leakage
- [Hidden Door Design Review](https://ianbicking.org/blog/2025/08/hidden-door-design-review-llm-driven-game) -- Mechanics critique, grounding problem
- [better-sqlite3 API](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md) -- .backup() for checkpoints

### Secondary (MEDIUM confidence)
- [HuggingFace RPG Agent Experiment](https://huggingface.co/blog/neph1/rpg-llm-agents) -- NPC loops, personality flatness, tool calling failures
- [AI Dungeon Memory System](https://help.aidungeon.com/faq/the-memory-system) -- Competitor memory architecture
- [SillyTavern World Info Docs](https://docs.sillytavern.app/usage/core-concepts/worldinfo/) -- WorldBook format
- [Stanford Generative Agents (2023)](https://arxiv.org/abs/2304.03442) -- Reflection, composite retrieval, importance scoring

### Tertiary (LOW confidence)
- [chonkie-ts](https://github.com/chonkie-inc/chonkiejs) -- Pre-1.0, API stability unconfirmed
- [LanceDB snapshot behavior](https://docs.lancedb.com/) -- Compaction documented, snapshot safety not explicitly addressed

---
*Research completed: 2026-03-18*
*Ready for roadmap: yes*
