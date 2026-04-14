# Phase 2: Turn Cycle - Research

**Researched:** 2026-03-18
**Domain:** Turn processing pipeline, SSE streaming, LLM tool calling, state management
**Confidence:** HIGH

## Summary

Phase 2 transforms the existing basic chat loop (`POST /api/chat/action`) into a full turn processing pipeline. The current implementation already has Oracle evaluation and prompt assembly (Phase 1), but streams plain text via `toTextStreamResponse()` and passes Oracle results via `X-Oracle-Result` header. This phase replaces that with SSE typed events, adds Storyteller tool calling for state modifications, and introduces quick action buttons.

The Vercel AI SDK v6 (`ai@6.0.116` installed) natively supports tool calling via `streamText` with Zod schemas, multi-step execution via `stopWhen`, and a `fullStream` async iterable that emits typed parts (`text`, `tool-call`, `tool-result`). Hono's `streamSSE()` helper is already proven in the worldgen pipeline. The integration strategy is: consume AI SDK's `fullStream` inside a Hono `streamSSE()` handler, translating each stream part into typed SSE events.

**Primary recommendation:** Build a turn processor function that orchestrates Oracle -> Storyteller pipeline, use `streamText` with tools + `stopWhen(stepCountIs(2))` for multi-step tool calling, and pipe `fullStream` events through Hono `streamSSE()` as typed SSE events to the frontend.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- New `backend/src/engine/turn-processor.ts` orchestrates the full pipeline: receive action -> assemble Oracle context -> call Oracle -> roll dice -> assemble Storyteller context with action result -> call Storyteller with tools -> execute validated tool calls -> persist state changes
- Turn processor is a stateless function (not a class) -- takes campaign context and returns a structured result
- Post-turn async work (NPC ticks, reflection) is triggered via events/callbacks but NOT implemented in this phase -- just the hook points
- Replace plain text streaming with Server-Sent Events (SSE) using typed event names
- Event types: `narrative` (text chunks), `oracle_result` (structured JSON), `state_update` (tag/relationship changes), `quick_actions` (suggested buttons), `done` (turn complete)
- Frontend parses SSE event stream and routes each event type to appropriate UI component
- Use Hono's `streamSSE()` helper (already used in worldgen pipeline) -- consistent with existing codebase patterns
- Storyteller uses Vercel AI SDK `streamText` with `tools` parameter -- Zod schemas define each tool
- Phase 2 tools: `add_tag`, `remove_tag`, `set_relationship`, `add_chronicle_entry`, `log_event`, `offer_quick_actions`
- Tool calls are validated by backend before DB writes -- invalid entity IDs or malformed args rejected
- On invalid tool call: error injected into conversation, Storyteller continues (no hard crash)
- Tool results streamed as `state_update` SSE events to frontend for real-time UI updates
- Expanded system prompt includes: mechanical outcome tier, world state context, tool instructions
- Storyteller told to narrate differently based on outcome: Strong Hit = success + bonus, Weak Hit = success + complication, Miss = failure + consequences
- Tool usage is encouraged but not forced -- Storyteller decides when state changes are narratively appropriate
- `offer_quick_actions` tool returns array of `{label, action}` pairs (3-5 contextual suggestions)
- Frontend renders quick action buttons below the narrative
- Clicking a button sends the action text as the next turn input (same as typing it)
- Buttons clear when a new turn starts

### Claude's Discretion
- SSE event data structure specifics
- Tool validation error message format
- Storyteller prompt wording for outcome narration
- Quick action button styling/layout

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| TURN-01 | Full turn processing pipeline: player input -> context assembly -> Oracle -> D100 -> Storyteller with tools -> state update -> post-turn processing | Turn processor function consuming Phase 1's `callOracle` + `assemblePrompt`, adding tool calling via `streamText` tools parameter |
| TURN-02 | Storyteller receives Oracle outcome tier and narrates accordingly (Strong Hit/Weak Hit/Miss) | System prompt expansion with outcome-specific instructions; outcome tier already in `assemblePrompt` ACTION RESULT section |
| TURN-03 | SSE response streams typed events (narrative, oracle_result, state_updates, quick_actions) | Hono `streamSSE()` + AI SDK `fullStream` iterable; proven pattern in worldgen pipeline |
| TURN-04 | Post-turn processing triggers: NPC agent ticks, reflection checks, world engine ticks | Hook points only -- callback/event emitter pattern in turn processor |
| TOOL-04 | `add_tag`/`remove_tag` -- modify tags on any entity, validated against DB | Zod tool schemas + tool-executor validates entity exists before JSON array mutation on tags column |
| TOOL-05 | `set_relationship(a, b, tag, reason)` -- set relationship tag between entities | Drizzle upsert on `relationships` table (unique index on campaignId+entityA+entityB already exists) |
| TOOL-07 | `add_chronicle_entry(text)` -- add major event to World Chronicle | Insert into `chronicle` table with current tick |
| TOOL-08 | `log_event(text, importance, participants)` -- log event to episodic memory | LanceDB `EpisodicEvent` schema exists but has no storage implementation; needs `storeEpisodicEvent()` function |
| TOOL-09 | `offer_quick_actions(actions[])` -- generate 3-5 action buttons | Tool returns data, no DB write; SSE event carries buttons to frontend |
| TOOL-10 | All tool calls validated before execution; invalid calls rejected with error, Storyteller retries | Tool executor validates entity IDs against DB; multi-step via `stopWhen(stepCountIs(2))` allows recovery |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| ai | 6.0.116 | `streamText` with tools, `fullStream` iterable | Already used for Storyteller and Oracle; native tool calling support |
| hono | 4.12.3+ | `streamSSE()` for typed SSE events | Already used in worldgen pipeline |
| zod | 4.3.6 | Tool input schemas, validation | Already used for all schemas in project |
| drizzle-orm | 0.45.1+ | DB writes for tool results | Already used for all DB operations |
| @lancedb/lancedb | (installed) | Episodic event storage for `log_event` tool | Already used for lore cards |

### Supporting
No new dependencies needed. Everything required is already installed.

## Architecture Patterns

### Recommended Project Structure
```
backend/src/engine/
  turn-processor.ts         # Orchestrates full turn pipeline (NEW)
  tool-executor.ts          # Validates and executes tool calls (NEW)
  tool-schemas.ts           # Zod schemas for all 6 Storyteller tools (NEW)
  prompt-assembler.ts       # Already exists (Phase 1)
  oracle.ts                 # Already exists (Phase 1)
  index.ts                  # Re-export new symbols

backend/src/vectors/
  episodic-events.ts        # Add storeEpisodicEvent() (MODIFY - currently schema only)

backend/src/ai/
  storyteller.ts            # Add tool-aware callStorytellerWithTools() (MODIFY)

backend/src/routes/
  chat.ts                   # Rewrite /action endpoint to use turn processor + SSE (MODIFY)

frontend/app/game/
  page.tsx                  # SSE event parsing instead of plain text (MODIFY)

frontend/components/game/
  quick-actions.tsx          # Quick action buttons (NEW)
```

### Pattern 1: Turn Processor (Stateless Orchestrator)
**What:** A single async function that takes campaign context and yields turn events
**When to use:** Every player action
**Example:**
```typescript
// Source: Derived from CONTEXT.md decisions + existing codebase patterns
import { callOracle, assemblePrompt } from "./index.js";

export interface TurnEvent {
  type: "oracle_result" | "narrative" | "state_update" | "quick_actions" | "done" | "error";
  data: unknown;
}

export async function* processTurn(options: TurnOptions): AsyncGenerator<TurnEvent> {
  // 1. Call Oracle
  const oracleResult = await callOracle(payload, judgeProvider);
  yield { type: "oracle_result", data: oracleResult };

  // 2. Assemble prompt with Oracle result
  const assembled = await assemblePrompt({ ...opts, actionResult: oracleResult });

  // 3. Call Storyteller with tools via streamText
  const result = streamText({
    model,
    system: assembled.formatted,
    messages,
    tools: storytellerTools,
    stopWhen: stepCountIs(2),
    temperature,
    maxOutputTokens,
  });

  // 4. Iterate fullStream, yielding typed events
  for await (const part of result.fullStream) {
    if (part.type === "text") {
      yield { type: "narrative", data: { text: part.text } };
    } else if (part.type === "tool-result") {
      yield { type: "state_update", data: part };
    }
    // ... handle other part types
  }

  // 5. Post-turn hooks (emit but don't execute)
  yield { type: "done", data: { tick: newTick } };
}
```

### Pattern 2: Tool Executor (Trust Boundary)
**What:** Validates tool call arguments against DB before executing state changes
**When to use:** Every tool call from Storyteller
**Example:**
```typescript
// Source: CONTEXT.md + DB schema analysis
export async function executeToolCall(
  campaignId: string,
  toolName: string,
  args: unknown,
  tick: number,
): Promise<{ success: boolean; result: unknown; error?: string }> {
  // Validate entity exists in DB
  // Execute state change via Drizzle
  // Return result for tool response
}
```

### Pattern 3: SSE Event Bridge (fullStream -> streamSSE)
**What:** Consumes AI SDK fullStream and writes typed SSE events via Hono
**When to use:** In the /api/chat/action route handler
**Example:**
```typescript
// Source: Existing worldgen.ts SSE pattern + AI SDK fullStream docs
return streamSSE(c, async (stream) => {
  for await (const event of processTurn(turnOptions)) {
    await stream.writeSSE({
      event: event.type,
      data: JSON.stringify(event.data),
    });
  }
});
```

### Anti-Patterns to Avoid
- **Don't mix toTextStreamResponse() with SSE**: The current code returns `streamResult.toTextStreamResponse()`. This must be completely replaced with `streamSSE()` + manual fullStream consumption. Mixing formats will break the frontend parser.
- **Don't execute tool calls without validation**: Every tool call must go through the tool executor which checks entity existence in DB. The `execute` function in the tool definition IS the validation + execution point.
- **Don't block on episodic event embedding**: `log_event` should store the event text and metadata but can defer vector embedding to avoid blocking the turn. Fire-and-forget the embedding call.
- **Don't use maxSteps (deprecated in v6)**: AI SDK v6 uses `stopWhen` with `stepCountIs()`, not the old `maxSteps` parameter.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tool schema definitions | Manual JSON schema objects | `tool()` from `ai` + Zod schemas | Type-safe, auto-validates inputs, integrates with model providers |
| Multi-step tool calling | Manual loop re-calling streamText | `stopWhen: stepCountIs(N)` | Built into AI SDK, handles tool result injection automatically |
| SSE formatting | Manual `data:` line construction | Hono `streamSSE()` + `writeSSE()` | Handles encoding, newlines, event names correctly |
| Stream event types | Custom ReadableStream transforms | AI SDK `fullStream` iterable | Already typed, emits text/tool-call/tool-result/finish parts |
| Entity ID validation | String matching against hardcoded lists | Drizzle `select().where(eq(table.id, id)).get()` | Single source of truth, handles all entity types uniformly |

**Key insight:** The AI SDK's `tool()` function with `execute` callback IS the validation layer. Define tools with Zod schemas for inputs, and the execute function does both validation and DB mutation. No separate "tool call queue" needed.

## Common Pitfalls

### Pitfall 1: SSE Buffering
**What goes wrong:** SSE events get buffered by proxies/Node and arrive in batches instead of real-time
**Why it happens:** HTTP response buffering, compression middleware
**How to avoid:** Set `Cache-Control: no-cache, no-transform` headers (already done in current code). Ensure no compression middleware on SSE routes. Hono's `streamSSE` handles flushing correctly.
**Warning signs:** Frontend receives all events at once after stream completes

### Pitfall 2: Tool Call Validation Timing
**What goes wrong:** Tool executes, modifies DB, then validation fails -- leaving partial state
**Why it happens:** Validation done after execution instead of before
**How to avoid:** In the `execute` function: validate first, execute second. If validation fails, return error result (don't throw). The AI SDK will pass the error back to the model which can retry.
**Warning signs:** Orphaned DB records, inconsistent tag states

### Pitfall 3: fullStream Consumption Order
**What goes wrong:** Missing tool calls or text chunks because fullStream was consumed partially
**Why it happens:** Reading `toolCalls` promise AND iterating `fullStream` -- they compete for the same underlying stream
**How to avoid:** Use ONLY `fullStream` iteration. Don't also await `result.toolCalls` or `result.text`. Extract everything from the single `for await` loop over `fullStream`.
**Warning signs:** Missing narrative text, tool calls not appearing in SSE

### Pitfall 4: JSON Tags Column Mutation
**What goes wrong:** `add_tag`/`remove_tag` corrupts the JSON array in the tags column
**Why it happens:** Read-modify-write without proper JSON parsing, or concurrent modifications
**How to avoid:** Always: 1) read current tags via `JSON.parse()`, 2) modify the array, 3) write back via `JSON.stringify()`. Single-user so no true concurrency issue, but be defensive.
**Warning signs:** Tags column contains `"[\"tag1\",\"tag2\"[\"tag3\"]]"` malformed JSON

### Pitfall 5: Entity ID Resolution for Tool Calls
**What goes wrong:** Storyteller refers to entities by name ("the guard"), but tool calls need DB IDs
**Why it happens:** LLM doesn't know internal UUIDs
**How to avoid:** Tool schemas should accept entity name OR ID. The executor resolves names to IDs by querying the DB (campaign-scoped name lookup). Include a clear mapping in the system prompt showing entity names the LLM can reference.
**Warning signs:** All tool calls fail with "entity not found"

### Pitfall 6: Relationship Upsert Direction
**What goes wrong:** Setting relationship A->B and B->A creates duplicates
**Why it happens:** Unique index is on (campaignId, entityA, entityB) -- order matters
**How to avoid:** Normalize entity pair order (alphabetical sort of IDs) before insert, OR use `ON CONFLICT DO UPDATE` pattern. The existing unique index enforces directionality.
**Warning signs:** Duplicate relationship rows with swapped entityA/entityB

## Code Examples

### Storyteller Tool Definitions
```typescript
// Source: AI SDK tool() docs + project Zod patterns
import { tool } from "ai";
import { z } from "zod";

export const storytellerTools = {
  add_tag: tool({
    description: "Add a descriptive tag to any entity (player, NPC, location, item, faction)",
    inputSchema: z.object({
      entityName: z.string().describe("Name of the entity to tag"),
      entityType: z.enum(["player", "npc", "location", "item", "faction"]),
      tag: z.string().describe("The tag to add, e.g. 'Wounded' or 'On Fire'"),
    }),
    execute: async ({ entityName, entityType, tag }) => {
      // Tool executor handles validation + DB write
      return executeToolCall(campaignId, "add_tag", { entityName, entityType, tag }, tick);
    },
  }),

  remove_tag: tool({
    description: "Remove a tag from any entity",
    inputSchema: z.object({
      entityName: z.string().describe("Name of the entity"),
      entityType: z.enum(["player", "npc", "location", "item", "faction"]),
      tag: z.string().describe("The tag to remove"),
    }),
    execute: async ({ entityName, entityType, tag }) => {
      return executeToolCall(campaignId, "remove_tag", { entityName, entityType, tag }, tick);
    },
  }),

  set_relationship: tool({
    description: "Set or update a relationship tag between two entities",
    inputSchema: z.object({
      entityA: z.string().describe("First entity name"),
      entityB: z.string().describe("Second entity name"),
      tag: z.string().describe("Relationship tag, e.g. 'Trusted Ally' or 'Sworn Enemy'"),
      reason: z.string().describe("Brief reason for the relationship"),
    }),
    execute: async (args) => {
      return executeToolCall(campaignId, "set_relationship", args, tick);
    },
  }),

  add_chronicle_entry: tool({
    description: "Record a major event in the World Chronicle",
    inputSchema: z.object({
      text: z.string().describe("Factual description of the event"),
    }),
    execute: async ({ text }) => {
      return executeToolCall(campaignId, "add_chronicle_entry", { text }, tick);
    },
  }),

  log_event: tool({
    description: "Log a significant event to episodic memory with importance rating",
    inputSchema: z.object({
      text: z.string().describe("Factual summary of what happened"),
      importance: z.number().min(1).max(10).describe("1=trivial, 5=notable, 10=world-changing"),
      participants: z.array(z.string()).describe("Names of entities involved"),
    }),
    execute: async (args) => {
      return executeToolCall(campaignId, "log_event", args, tick);
    },
  }),

  offer_quick_actions: tool({
    description: "Suggest 3-5 contextual actions the player might take next",
    inputSchema: z.object({
      actions: z.array(z.object({
        label: z.string().describe("Short button label"),
        action: z.string().describe("Full action text sent when clicked"),
      })).min(3).max(5),
    }),
    execute: async ({ actions }) => {
      // No DB write -- just pass through to frontend via SSE
      return { actions };
    },
  }),
};
```

### Frontend SSE Parser for Turn Events
```typescript
// Source: Existing parseSSEStream pattern from frontend/lib/api.ts
interface TurnSSEEvent {
  type: "narrative" | "oracle_result" | "state_update" | "quick_actions" | "done" | "error";
  data: unknown;
}

async function parseTurnSSE(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onNarrative: (text: string) => void;
    onOracleResult: (result: OracleResultData) => void;
    onStateUpdate: (update: unknown) => void;
    onQuickActions: (actions: Array<{ label: string; action: string }>) => void;
    onDone: () => void;
    onError: (error: string) => void;
  }
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let currentData = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop()!;

    for (const line of lines) {
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        currentData = line.slice(5).trim();
      } else if (line === "") {
        if (currentEvent && currentData) {
          const parsed = JSON.parse(currentData);
          switch (currentEvent) {
            case "narrative": handlers.onNarrative(parsed.text); break;
            case "oracle_result": handlers.onOracleResult(parsed); break;
            case "state_update": handlers.onStateUpdate(parsed); break;
            case "quick_actions": handlers.onQuickActions(parsed.actions); break;
            case "done": handlers.onDone(); break;
            case "error": handlers.onError(parsed.error); break;
          }
        }
        currentEvent = "";
        currentData = "";
      }
    }
  }
}
```

### Narrative Text Accumulation Pattern
```typescript
// narrative SSE events carry incremental text chunks, not full text
// Frontend must accumulate:
let narrativeText = "";
onNarrative: (chunk: string) => {
  narrativeText += chunk;
  updateAssistantContent(narrativeText);
}
```

## State of the Art

| Old Approach (current) | New Approach (Phase 2) | Impact |
|------------------------|------------------------|--------|
| `toTextStreamResponse()` plain text | `streamSSE()` with typed events | Frontend gets structured data, not just text |
| `X-Oracle-Result` header | `oracle_result` SSE event | No header size limits, arrives in-order with stream |
| No tool calling | `streamText` with `tools` + `execute` | Storyteller can modify game state |
| Manual `appendChatMessages` in `onFinish` | Turn processor handles persistence after stream completes | Cleaner separation of concerns |
| `callStoryteller()` returns StreamTextResult | Turn processor yields `AsyncGenerator<TurnEvent>` | Route handler just bridges generator to SSE |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | `backend/vitest.config.ts` |
| Quick run command | `npm --prefix backend test -- --run` |
| Full suite command | `npm --prefix backend test -- --run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TURN-01 | Turn processor orchestrates full pipeline | unit | `npx --prefix backend vitest run src/engine/__tests__/turn-processor.test.ts -x` | No - Wave 0 |
| TURN-02 | System prompt includes outcome-specific instructions | unit | `npx --prefix backend vitest run src/engine/__tests__/turn-processor.test.ts -x` | No - Wave 0 |
| TURN-03 | SSE events have correct types and data shapes | unit | `npx --prefix backend vitest run src/engine/__tests__/turn-processor.test.ts -x` | No - Wave 0 |
| TURN-04 | Post-turn hook callback is invoked | unit | `npx --prefix backend vitest run src/engine/__tests__/turn-processor.test.ts -x` | No - Wave 0 |
| TOOL-04 | add_tag/remove_tag validate entity + modify tags | unit | `npx --prefix backend vitest run src/engine/__tests__/tool-executor.test.ts -x` | No - Wave 0 |
| TOOL-05 | set_relationship upserts in DB | unit | `npx --prefix backend vitest run src/engine/__tests__/tool-executor.test.ts -x` | No - Wave 0 |
| TOOL-07 | add_chronicle_entry inserts into chronicle table | unit | `npx --prefix backend vitest run src/engine/__tests__/tool-executor.test.ts -x` | No - Wave 0 |
| TOOL-08 | log_event stores episodic event | unit | `npx --prefix backend vitest run src/engine/__tests__/tool-executor.test.ts -x` | No - Wave 0 |
| TOOL-09 | offer_quick_actions returns action array | unit | `npx --prefix backend vitest run src/engine/__tests__/tool-executor.test.ts -x` | No - Wave 0 |
| TOOL-10 | Invalid tool calls rejected with error result | unit | `npx --prefix backend vitest run src/engine/__tests__/tool-executor.test.ts -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npm --prefix backend test -- --run`
- **Per wave merge:** `npm --prefix backend test -- --run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/engine/__tests__/turn-processor.test.ts` -- covers TURN-01 through TURN-04
- [ ] `backend/src/engine/__tests__/tool-executor.test.ts` -- covers TOOL-04, TOOL-05, TOOL-07, TOOL-08, TOOL-09, TOOL-10
- [ ] `backend/src/engine/__tests__/tool-schemas.test.ts` -- covers tool Zod schema validation

## Open Questions

1. **Entity name resolution strategy for tool calls**
   - What we know: LLM will use entity names (not UUIDs) in tool calls. DB uses UUID primary keys.
   - What's unclear: Should we do fuzzy matching? What if two NPCs have similar names?
   - Recommendation: Exact case-insensitive match scoped to campaign. If no match, return error to LLM with available entity names. Include entity name list in system prompt.

2. **Episodic event vector embedding timing**
   - What we know: `log_event` needs to store to LanceDB with vectors. Embedding is async and requires API call.
   - What's unclear: Should embedding block the tool result or be fire-and-forget?
   - Recommendation: Store event metadata immediately (text, importance, participants, tick). Defer vector embedding to post-turn async hook. This keeps tool execution fast and matches TURN-04's post-turn processing pattern.

3. **Narrative text chunk granularity**
   - What we know: AI SDK fullStream emits `text` parts as they arrive from the model (token-level).
   - What's unclear: Should each token be a separate SSE event, or should we batch?
   - Recommendation: Emit each text delta as its own `narrative` SSE event. The overhead is minimal and gives smoothest streaming UX. Frontend accumulates into full text.

## Sources

### Primary (HIGH confidence)
- AI SDK v6 official docs - streamText API reference, tool calling guide (https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text, https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- Existing codebase: `backend/src/routes/worldgen.ts` lines 124-173 (Hono streamSSE pattern)
- Existing codebase: `backend/src/ai/storyteller.ts` (current streamText usage)
- Existing codebase: `backend/src/routes/chat.ts` (current /action endpoint)
- Existing codebase: `backend/src/engine/oracle.ts`, `prompt-assembler.ts` (Phase 1 outputs)
- Existing codebase: `backend/src/db/schema.ts` (relationships, chronicle, npcs, items, locations tables)
- Existing codebase: `backend/src/vectors/episodic-events.ts` (EpisodicEvent interface)

### Secondary (MEDIUM confidence)
- AI SDK v6 blog post (https://vercel.com/blog/ai-sdk-6) - confirmed stopWhen replaces maxSteps

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and used in codebase
- Architecture: HIGH - patterns derived from existing codebase + official AI SDK docs
- Pitfalls: HIGH - based on actual codebase analysis (JSON tags columns, entity IDs, SSE patterns)

**Research date:** 2026-03-18
**Valid until:** 2026-04-18 (stable stack, no external dependencies added)
