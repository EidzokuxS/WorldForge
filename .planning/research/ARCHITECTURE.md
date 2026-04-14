# Architecture Patterns

**Domain:** AI Text RPG Game Engine (Game Engine, NPC Agents, World Simulation)
**Researched:** 2026-03-18
**Confidence:** HIGH (based on existing codebase analysis + design docs + validated research papers)

## Recommended Architecture

The new components layer between existing routes and the existing AI/DB layers. The key insight: the current `POST /api/chat` is a naive pass-through (player text -> Storyteller LLM -> stream back). The Game Engine replaces this with a multi-stage pipeline that orchestrates Oracle, Storyteller, NPC agents, and state updates in a deterministic sequence.

```
                        Frontend (Next.js :3000)
                              |
                    REST + SSE (turn results)
                              |
                  ┌───────────┴───────────┐
                  │      Route Layer       │  ← existing, extended
                  │  /api/chat (turn)      │
                  │  /api/engine/*         │
                  └───────────┬───────────┘
                              |
               ┌──────────────┴──────────────┐
               │        GAME ENGINE          │  ← NEW: src/engine/
               │                              │
               │  ┌────────────────────────┐  │
               │  │    Turn Processor      │  │  orchestrates full turn cycle
               │  └──────────┬─────────────┘  │
               │             |                 │
               │  ┌──────────┴─────────────┐  │
               │  │   Prompt Assembler     │  │  compiles context from 6+ sources
               │  └──────────┬─────────────┘  │
               │             |                 │
               │  ┌──────────┴─────────────┐  │
               │  │   Tool Executor        │  │  validates + executes LLM tool calls
               │  └──────────┬─────────────┘  │
               │             |                 │
               │  ┌──────────┴─────────────┐  │
               │  │   Tick Manager         │  │  tracks game ticks, triggers NPC/World
               │  └────────────────────────┘  │
               └──────────────┬──────────────┘
                              |
          ┌───────────────────┼───────────────────┐
          |                   |                     |
  ┌───────┴────────┐  ┌──────┴───────┐  ┌─────────┴────────┐
  │   AI Layer     │  │  State Layer │  │  Memory Layer    │
  │  (existing)    │  │  (existing)  │  │  (existing+new)  │
  │                │  │              │  │                  │
  │ Oracle (Judge) │  │ SQLite/      │  │ Episodic Events  │
  │ Storyteller    │  │ Drizzle      │  │ Lore Cards       │
  │ NPC Agent      │  │              │  │ Composite Score  │
  │ Reflection     │  │              │  │                  │
  │ World Engine   │  │              │  │ LanceDB          │
  └────────────────┘  └──────────────┘  └──────────────────┘
          |                   |                     |
  ┌───────┴────────┐  ┌──────┴───────┐  ┌─────────┴────────┐
  │ External LLMs  │  │ campaigns/   │  │ campaigns/       │
  │ (OpenRouter,   │  │ {id}/state.db│  │ {id}/vectors/    │
  │  Ollama, etc.) │  │              │  │                  │
  └────────────────┘  └──────────────┘  └──────────────────┘
```

### Component Boundaries

| Component | Location | Responsibility | Communicates With |
|-----------|----------|---------------|-------------------|
| **Turn Processor** | `src/engine/turn.ts` | Orchestrates full turn cycle: input -> context -> Oracle -> roll -> narration -> state update -> NPC ticks | Prompt Assembler, AI Layer, Tool Executor, Tick Manager |
| **Prompt Assembler** | `src/engine/prompt-assembler.ts` | Compiles structured context from SQLite state, LanceDB memories, lore, chat history, action result | State Layer, Memory Layer |
| **Tool Executor** | `src/engine/tool-executor.ts` | Validates LLM tool calls against Zod schemas, executes state mutations, returns results | State Layer, Memory Layer |
| **Tick Manager** | `src/engine/tick-manager.ts` | Tracks game tick counter, determines when NPC ticks and World Engine ticks fire | Turn Processor, NPC Orchestrator, World Engine |
| **NPC Orchestrator** | `src/engine/npc-orchestrator.ts` | Runs NPC agent LLM calls for Key Characters in player's location, batches off-screen NPCs | AI Layer, Prompt Assembler, Tool Executor |
| **World Engine** | `src/engine/world-engine.ts` | Faction macro-ticks: one LLM call per faction, territory changes, chronicle updates | AI Layer, State Layer |
| **Reflection Runner** | `src/engine/reflection.ts` | Checks NPC importance thresholds, runs reflection LLM calls, writes beliefs/goals | AI Layer, State Layer, Memory Layer |
| **Oracle** | `src/engine/oracle.ts` | Wraps Judge LLM call for probability evaluation, returns chance + reasoning | AI Layer, Prompt Assembler |
| **Checkpoint Manager** | `src/engine/checkpoint.ts` | Snapshots state.db + vectors/ for save/load/branching | State Layer, Memory Layer (filesystem) |
| **Image Generator** | `src/engine/image-gen.ts` | Async background image generation from game state, caching, provider-agnostic | AI Layer (image providers), State Layer |
| **Episodic Memory** | `src/vectors/episodic-events.ts` | Embed event summaries, composite retrieval (sim x 0.4 + rec x 0.3 + imp x 0.3) | Memory Layer (LanceDB), AI Layer (embeddings) |

### Data Flow: Full Turn Cycle

This is the critical path -- every player action flows through this sequence:

```
Player submits action
       |
       v
[1] Turn Processor receives action text
       |
       v
[2] Prompt Assembler gathers context:
    ├── SQLite: player state, current location, NPCs present, relationships, items
    ├── SQLite: recent chronicle entries (last 5-10)
    ├── LanceDB: top 3-5 episodic memories (composite score)
    ├── LanceDB: top 2-3 relevant lore cards
    ├── Chat history: last N turns (smart compression)
    └── World premise (from config.json, always injected)
       |
       v
[3] Oracle (Judge LLM) evaluates action:
    Input:  action intent, actor tags, target tags, environment tags
    Output: { chance: 0-100, reasoning: "..." }
       |
       v
[4] Turn Processor rolls D100, determines outcome tier:
    ├── Strong Hit: roll <= chance * 0.5
    ├── Weak Hit:   roll <= chance
    └── Miss:       roll > chance
       |
       v
[5] Storyteller LLM narrates outcome (STREAMED to frontend):
    Input:  full assembled context + action result + tools
    Output: prose narrative + tool calls (spawn_npc, add_tag, etc.)
       |
       v
[6] Tool Executor processes Storyteller tool calls:
    ├── Validate each call against Zod schema
    ├── Execute state mutations (INSERT/UPDATE in SQLite)
    ├── log_event calls -> embed in LanceDB (async)
    └── Return results to Storyteller (multi-turn tool use)
       |
       v
[7] Post-turn processing (async, non-blocking):
    ├── Tick Manager increments tick counter
    ├── Episodic Memory: embed turn summary
    ├── NPC Orchestrator: run NPC ticks (if applicable)
    ├── Reflection Runner: check importance thresholds
    ├── World Engine: check if macro-tick is due
    └── Image Generator: queue scene image (if high-importance event)
       |
       v
[8] SSE events stream results to frontend:
    ├── narrative (streamed text)
    ├── state_update (player HP/tags/items changed)
    ├── npc_actions (what NPCs did this tick)
    ├── world_event (chronicle update, if any)
    └── image (URL, when generation completes)
```

### Data Flow: NPC Agent Tick

After the player's turn resolves, Key Characters in the player's location get individual LLM calls:

```
[1] NPC Orchestrator identifies Key NPCs at player's location
       |
       v
[2] For each NPC (parallel via Promise.allSettled):
    ├── Prompt Assembler builds NPC-specific context:
    │   ├── NPC's tags, goals, beliefs, relationships
    │   ├── Current scene state (post-player-action)
    │   ├── NPC's recent episodic memories
    │   └── Location + entities present
    ├── Judge LLM call with NPC tools (act, speak, move_to, update_own_goal)
    ├── Tool Executor validates + executes NPC tool calls
    └── Results collected
       |
       v
[3] NPC actions aggregated and sent to frontend
       |
       v
[4] Off-screen Key NPCs: every N ticks, single batch LLM call
    ├── All off-screen Key NPCs in one prompt
    ├── Judge returns structured updates per NPC
    └── State mutations applied
```

**Why `Promise.allSettled`:** NPC calls are independent. One NPC's LLM timeout should not block others. Failed NPC calls are logged and skipped -- the NPC "does nothing this tick." This is critical for keeping turn latency reasonable when 3-5 Key NPCs are present.

### Data Flow: World Engine Macro-Tick

```
[1] Tick Manager determines macro-tick is due (every N game-ticks)
       |
       v
[2] For each faction (sequential -- order matters for state consistency):
    ├── Prompt Assembler builds faction context:
    │   ├── Faction tags, goals, assets, territory
    │   ├── Recent chronicle entries
    │   ├── Neighboring faction states
    │   └── World premise
    ├── Judge LLM call with faction tools
    ├── Tool Executor: territory changes, tag updates, chronicle entries
    └── Location tags updated (e.g., [War Zone] added)
       |
       v
[3] Chronicle entries broadcast to frontend
```

**Why sequential for factions:** Faction A's action may change the world state that Faction B's prompt needs to reflect. Running them in parallel risks contradictory outcomes. The N is large (every 10-20 game-ticks), so sequential is fine.

### Data Flow: Prompt Assembly Detail

The Prompt Assembler is the most critical new component. It must compose context from 6+ sources while staying within token budgets.

```typescript
// Conceptual structure of assembled prompt
interface AssembledPrompt {
  // ALWAYS included (system prompt + world premise)
  systemRules: string;          // ~200 tokens, static
  worldPremise: string;         // ~100 tokens, from config.json

  // SCENE context (from SQLite)
  scene: {
    location: LocationRow;      // name, description, tags
    entitiesPresent: Entity[];  // NPCs + items at this location
    playerState: PlayerRow;     // HP, tags, equipped items, location
  };

  // NPC context (from SQLite, only NPCs in scene)
  npcStates: {
    npc: NpcRow;               // name, persona, tags
    beliefs: string[];          // from NPC beliefs JSON
    goals: GoalSet;             // short_term + long_term
    relationshipToPlayer: string[]; // from relationships table
  }[];

  // MEMORY context (from LanceDB)
  episodicMemories: EpisodicEvent[];  // top 3-5 by composite score
  loreCards: LoreCard[];              // top 2-3 by vector similarity

  // CONVERSATION context (from chat_history.json)
  recentTurns: ChatMessage[];         // smart compression: first + last N + anomalies

  // ACTION RESULT (from Oracle + dice roll)
  actionResult?: {
    playerAction: string;
    chance: number;
    roll: number;
    outcome: 'strong_hit' | 'weak_hit' | 'miss';
    reasoning: string;
  };
}
```

**Token budget strategy:** Use a priority system. System rules and world premise are always included. Scene and player state are always included. Then fill remaining budget with memories, lore, and conversation in priority order. The Prompt Assembler should estimate token counts (rough: 4 chars per token) and trim lower-priority sections first.

### Data Flow: Image Generation

Image generation is async background work that never blocks the turn cycle:

```
[1] Turn Processor emits image_request event (high-importance events only)
       |
       v
[2] Image Generator checks:
    ├── Is image generation enabled in settings?
    ├── Is this asset type enabled (portraits/scenes/locations)?
    ├── Is there a cached image for this context?
    └── If no to any: skip
       |
       v
[3] Build image prompt from game state:
    ├── Character appearance tags -> portrait prompt
    ├── Location tags + premise -> scene prompt
    ├── Style suffix from settings appended
    └── Provider-specific format (DALL-E, fal, ComfyUI, SD API)
       |
       v
[4] Fire-and-forget HTTP call to image provider
       |
       v
[5] On completion:
    ├── Save to campaigns/{id}/images/{hash}.png
    ├── Cache mapping (context hash -> image path)
    └── SSE event to frontend with image URL
```

**Why fire-and-forget:** Image generation takes 5-30 seconds. The player should not wait. The image appears asynchronously in the UI when ready. If it fails, the game continues text-only -- graceful degradation.

### Data Flow: Checkpoint System

```
[1] Player requests checkpoint (manual save / auto before dangerous action)
       |
       v
[2] Checkpoint Manager:
    ├── Copy state.db -> campaigns/{id}/checkpoints/{timestamp}/state.db
    ├── Copy vectors/ -> campaigns/{id}/checkpoints/{timestamp}/vectors/
    ├── Copy chat_history.json -> same checkpoint dir
    └── Record checkpoint metadata (tick, timestamp, description)
       |
       v
[3] Restore checkpoint:
    ├── Close active DB connections
    ├── Replace state.db with checkpoint copy
    ├── Replace vectors/ with checkpoint copy
    ├── Replace chat_history.json with checkpoint copy
    ├── Reconnect DB + LanceDB
    └── Reload active campaign state
```

**SQLite + LanceDB are both file-based.** This makes checkpointing trivial -- just file copies. No dump/restore, no migration. The checkpoint is an atomic snapshot of the entire game state.

## Component Boundaries: Existing vs New

### What Changes in Existing Code

| Existing Component | Change Required |
|-------------------|-----------------|
| `POST /api/chat` | **Major rewrite.** Currently calls `callStoryteller` directly. Must now call Turn Processor instead, which orchestrates Oracle -> Storyteller -> state updates. Response changes from plain text stream to SSE with multiple event types. |
| `src/ai/storyteller.ts` | **Extended.** Add tool definitions (Zod schemas for spawn_npc, add_tag, etc.). Change from `streamText` without tools to `streamText` with tools. |
| `src/ai/index.ts` | **Extended.** Export new AI call functions: `callOracle`, `callNpcAgent`, `callReflection`, `callWorldEngine`. Each is a thin wrapper around `generateObject` or `streamText` with specific tool sets. |
| `src/db/schema.ts` | **Extended.** Add `tick` column to campaigns table. Add `locationHistory` to NPCs (JSON column for recent ticks). |
| `src/vectors/` | **Extended.** Add `episodic-events.ts` (new LanceDB table alongside existing `lore_cards`). |
| `src/campaign/manager.ts` | **Extended.** Add checkpoint create/restore methods. |

### What Stays Unchanged

- Frontend components (game layout, narrative log, settings) -- only extended, not rewritten
- World generation pipeline (`src/worldgen/`)
- Character creation (`src/character/`)
- Settings management (`src/settings/`)
- Provider registry (`src/ai/provider-registry.ts`)
- Campaign CRUD (create/load/delete)
- LanceDB connection management
- All Zod schemas for existing API endpoints

## Patterns to Follow

### Pattern 1: Pipeline Orchestration (Turn Processor)

The Turn Processor follows the same pattern as the existing World Gen pipeline -- a sequential series of steps where each step's output feeds the next. Use async generators or SSE for progress reporting.

**What:** Break the turn into discrete, testable steps. Each step is a pure function taking state in and returning state changes out.
**When:** Every player action.
**Example:**
```typescript
// src/engine/turn.ts
interface TurnContext {
  campaignId: string;
  playerAction: string;
  currentTick: number;
}

interface TurnResult {
  narrative: ReadableStream;     // streamed Storyteller output
  oracleResult: OracleResult;    // chance, roll, outcome tier
  toolResults: ToolCallResult[]; // executed tool calls
  stateChanges: StateChange[];   // what changed in DB
}

async function processTurn(ctx: TurnContext): Promise<TurnResult> {
  // 1. Assemble context
  const prompt = assemblePrompt(ctx);

  // 2. Oracle evaluation
  const oracle = await callOracle(prompt.oraclePayload);

  // 3. Dice roll
  const roll = crypto.randomInt(1, 101);
  const outcome = resolveOutcome(roll, oracle.chance);

  // 4. Storyteller narration (streamed, with tools)
  const storytellerResult = await callStorytellerWithTools({
    ...prompt.storytellerPayload,
    actionResult: { ...oracle, roll, outcome },
  });

  // 5. Execute tool calls (validated by Tool Executor)
  const toolResults = await executeToolCalls(storytellerResult.toolCalls);

  // 6. Post-turn async work
  queuePostTurnWork(ctx, oracle, toolResults);

  return { narrative: storytellerResult.stream, oracleResult: oracle, toolResults, stateChanges };
}
```

### Pattern 2: Tool Executor with Validation

**What:** Every LLM tool call goes through a single validation + execution layer. The LLM cannot modify state directly.
**When:** After any LLM call that uses tools (Storyteller, NPC Agent, Reflection, World Engine).
**Example:**
```typescript
// src/engine/tool-executor.ts
const toolHandlers: Record<string, ToolHandler> = {
  spawn_npc: {
    schema: spawnNpcSchema,
    execute: async (args, campaignId) => {
      // Validate: location exists, name not duplicate
      // Insert into NPCs table
      // Return { success: true, npcId: "..." }
    },
  },
  add_tag: {
    schema: addTagSchema,
    execute: async (args, campaignId) => {
      // Validate: entity exists
      // Update tags JSON column
      // Return { success: true }
    },
  },
  // ... all tools registered here
};

async function executeToolCall(
  call: ToolCall,
  campaignId: string
): Promise<ToolCallResult> {
  const handler = toolHandlers[call.name];
  if (!handler) return { success: false, error: "Unknown tool" };

  const parsed = handler.schema.safeParse(call.args);
  if (!parsed.success) return { success: false, error: parsed.error.message };

  return handler.execute(parsed.data, campaignId);
}
```

### Pattern 3: Prompt Assembler as Query Coordinator

**What:** The Prompt Assembler is a coordinator that queries multiple data sources and formats results into a structured prompt string. It does NOT contain LLM logic -- it only gathers and formats.
**When:** Before every LLM call (Oracle, Storyteller, NPC Agent, Reflection, World Engine).
**Example:**
```typescript
// src/engine/prompt-assembler.ts
interface PromptRequest {
  role: 'oracle' | 'storyteller' | 'npc_agent' | 'reflection' | 'world_engine';
  campaignId: string;
  // Role-specific fields
  playerAction?: string;        // for oracle/storyteller
  npcId?: string;               // for npc_agent/reflection
  factionId?: string;           // for world_engine
  actionResult?: ActionResult;  // for storyteller
}

async function assemblePrompt(req: PromptRequest): Promise<string> {
  // Gather from SQLite
  const player = getPlayer(req.campaignId);
  const location = getLocation(player.currentLocationId);
  const npcsPresent = getNpcsAtLocation(location.id);
  const relationships = getRelationships(req.campaignId, relevantEntityIds);
  const chronicle = getRecentChronicle(req.campaignId, 10);

  // Gather from LanceDB
  const memories = await retrieveEpisodicMemories(req.playerAction, 5);
  const lore = await searchLoreCards(req.playerAction, 3);

  // Gather from disk
  const chatHistory = getChatHistory(req.campaignId);

  // Format based on role
  return formatPrompt(req.role, { player, location, npcsPresent, ... });
}
```

### Pattern 4: SSE Multi-Event Streaming

The current chat endpoint returns a single text stream. The new turn endpoint must stream multiple event types (narrative text, state updates, NPC actions, images).

**What:** Use SSE with typed events instead of plain text streaming.
**When:** Turn response to frontend.
**Example:**
```typescript
// Response format
// event: narrative
// data: {"chunk": "The blade..."}
//
// event: oracle_result
// data: {"chance": 65, "roll": 23, "outcome": "strong_hit"}
//
// event: state_update
// data: {"hp": 4, "tagsAdded": ["Wounded"], "itemsGained": ["Ancient Sword"]}
//
// event: npc_action
// data: {"npcId": "...", "action": "Jackie draws his weapon"}
//
// event: image
// data: {"url": "/api/campaigns/{id}/images/abc123.png", "type": "scene"}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Monolithic Turn Handler
**What:** Putting all turn logic in the route handler (like the current `POST /api/chat`).
**Why bad:** Untestable. Cannot reuse Oracle/Storyteller/Tool logic for NPC agents or World Engine. The current chat.ts is 118 lines with everything inline.
**Instead:** Route handler calls Turn Processor. Turn Processor orchestrates components. Each component is independently testable.

### Anti-Pattern 2: LLM State Mutation Without Validation
**What:** Letting the LLM's tool call results directly modify the database.
**Why bad:** LLMs hallucinate entity names, create items that don't exist, reference locations the player hasn't visited. Every tool call must be validated against current DB state.
**Instead:** Tool Executor validates every argument against DB. `spawn_npc` checks for duplicate names. `add_tag` checks entity exists. `move_to` checks adjacency.

### Anti-Pattern 3: Sequential NPC Processing
**What:** Awaiting each NPC's LLM call one after another.
**Why bad:** 5 NPCs * 3-5 seconds per call = 15-25 seconds of latency per turn.
**Instead:** `Promise.allSettled` for NPC calls. Individual failures are caught and logged. 5 parallel calls complete in 3-5 seconds total.

### Anti-Pattern 4: Blocking Image Generation
**What:** Waiting for image generation to complete before returning the turn result.
**Why bad:** Image generation takes 5-30 seconds. The narrative should stream immediately.
**Instead:** Fire-and-forget. Image result arrives via SSE event when ready. Frontend renders a placeholder, replaces with image when received.

### Anti-Pattern 5: God Prompt
**What:** Assembling one massive prompt with everything crammed in, regardless of token budget.
**Why bad:** Exceeds context window. Irrelevant information dilutes important context. Costs more per call.
**Instead:** Prompt Assembler has a token budget. Priority ordering: system rules > world premise > scene > player state > NPC states > action result > memories > lore > chat history. Lower priority sections are trimmed first.

### Anti-Pattern 6: Shared Mutable State Between Parallel NPC Calls
**What:** NPC agents reading/writing the same game state concurrently.
**Why bad:** Race conditions. NPC A picks up an item, NPC B also picks it up.
**Instead:** NPC calls receive a snapshot of state at tick start. Tool calls are collected, then applied sequentially after all NPC calls complete. Conflicts are resolved deterministically (first NPC in order wins).

## New Directory Structure

```
backend/src/engine/           ← NEW: game engine layer
├── index.ts                  ← exports
├── turn.ts                   ← Turn Processor (orchestrates full turn cycle)
├── prompt-assembler.ts       ← Prompt Assembler (context compilation)
├── tool-executor.ts          ← Tool Executor (validates + executes LLM tool calls)
├── tool-definitions.ts       ← Zod schemas for all tools (storyteller, NPC, reflection, world)
├── tick-manager.ts           ← Tick counter, NPC/World tick scheduling
├── oracle.ts                 ← Oracle wrapper (Judge LLM for probability)
├── npc-orchestrator.ts       ← NPC agent tick orchestration
├── world-engine.ts           ← Faction macro-tick simulation
├── reflection.ts             ← NPC reflection (importance-triggered)
├── checkpoint.ts             ← Save/load/branch checkpoints
├── image-gen.ts              ← Async image generation + caching
└── __tests__/                ← Unit tests for each component
    ├── turn.test.ts
    ├── prompt-assembler.test.ts
    ├── tool-executor.test.ts
    ├── oracle.test.ts
    └── ...
```

## Suggested Build Order

Components have clear dependencies. Build order must respect these:

```
Phase 1: Foundation
  ├── Prompt Assembler (no dependencies on new code, only reads existing DB/vectors)
  ├── Oracle (wraps existing AI layer with Judge role)
  └── Tool Definitions (Zod schemas, no runtime logic)

Phase 2: Core Turn Loop
  ├── Tool Executor (depends on Tool Definitions)
  ├── Turn Processor (depends on Prompt Assembler, Oracle, Tool Executor)
  └── Storyteller Tools (extend existing storyteller with tool calling)
  └── SSE response format (replaces current text stream)

Phase 3: Memory Pipeline
  ├── Episodic Events (new LanceDB table, embed/retrieve)
  ├── Composite Retrieval (sim*0.4 + rec*0.3 + imp*0.3 scoring)
  └── Smart Context Compression (first + last N + anomalies)

Phase 4: NPC Agents
  ├── NPC Orchestrator (depends on Prompt Assembler, Tool Executor)
  ├── Tick Manager (depends on Turn Processor)
  └── Off-screen NPC batch simulation

Phase 5: Reflection + World Engine
  ├── Reflection Runner (depends on Episodic Events, Tool Executor)
  └── World Engine (depends on Prompt Assembler, Tool Executor, Tick Manager)

Phase 6: Persistence + Media
  ├── Checkpoint Manager (file copy, independent)
  └── Image Generator (async, independent)
```

**Why this order:**
1. **Prompt Assembler and Oracle first** because they have zero dependencies on new code -- they only read existing DB state. They can be tested immediately against real campaign data.
2. **Turn Processor second** because it is the central orchestrator. Everything else plugs into it.
3. **Memory Pipeline third** because Prompt Assembler needs episodic memories, but can work with empty results initially.
4. **NPC Agents fourth** because they reuse the same Prompt Assembler and Tool Executor patterns, just with different prompts and tools.
5. **Reflection and World Engine fifth** because they are periodic (not every turn) and depend on episodic memory being in place.
6. **Checkpoint and Image Generation last** because they are fully independent features that don't affect the core gameplay loop.

## Scalability Considerations

| Concern | At 1 NPC in scene | At 5 NPCs in scene | At 15+ NPCs in campaign |
|---------|-------------------|---------------------|-------------------------|
| Turn latency | ~5s (Oracle + Storyteller) | ~8s (+ parallel NPC calls) | Same as 5 NPCs (off-screen are batched) |
| LLM calls per turn | 2 (Oracle + Storyteller) | 7 (+ 5 NPC agents) | 7-8 (off-screen batch = 1 call) |
| Token cost per turn | ~2K tokens | ~6K tokens | ~7K tokens |
| Prompt assembly time | <50ms (SQLite is sync) | <100ms (more queries) | Same (query by location, not full scan) |
| Memory retrieval | <200ms (LanceDB brute force) | Same | Same (campaign-scale data is small) |

**The bottleneck is always LLM call latency**, not local computation. SQLite queries, LanceDB searches, and prompt assembly are all sub-200ms. Design decisions should minimize LLM calls, not optimize local code.

## Sources

- Existing codebase analysis: `backend/src/routes/chat.ts`, `backend/src/ai/storyteller.ts`, `backend/src/campaign/manager.ts`, `backend/src/db/schema.ts`, `backend/src/vectors/`
- Design docs: `docs/concept.md`, `docs/mechanics.md`, `docs/memory.md`, `docs/tech_stack.md`
- Validated research: `docs/research.md` -- RPGBENCH, Static vs Agentic GM, Stanford Generative Agents, Fate Core
- Vercel AI SDK patterns: `streamText` with tools, `generateObject` for structured output (already used in worldgen)
- Project requirements: `.planning/PROJECT.md`
