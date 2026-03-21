# Phase 2: Turn Cycle - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase transforms the basic chat loop into a full game turn pipeline. Player actions flow through Oracle evaluation (from Phase 1) → D100 roll → Storyteller narration with structured tool calling → state updates. Response format changes from plain text to SSE with typed events. Storyteller gains 6 tools for modifying world state (add_tag, remove_tag, set_relationship, add_chronicle_entry, log_event, offer_quick_actions). Quick action buttons appear in UI.

This phase does NOT add: spawn_npc/item, reveal_location, set_condition (HP), inventory, location navigation — those are Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Turn Processor Architecture
- New `backend/src/engine/turn-processor.ts` orchestrates the full pipeline: receive action → assemble Oracle context → call Oracle → roll dice → assemble Storyteller context with action result → call Storyteller with tools → execute validated tool calls → persist state changes
- Turn processor is a stateless function (not a class) — takes campaign context and returns a structured result
- Post-turn async work (NPC ticks, reflection) is triggered via events/callbacks but NOT implemented in this phase — just the hook points

### SSE Streaming Format
- Replace plain text streaming with Server-Sent Events (SSE) using typed event names
- Event types: `narrative` (text chunks), `oracle_result` (structured JSON), `state_update` (tag/relationship changes), `quick_actions` (suggested buttons), `done` (turn complete)
- Frontend parses SSE event stream and routes each event type to appropriate UI component
- Use Hono's `streamSSE()` helper (already used in worldgen pipeline) — consistent with existing codebase patterns

### Storyteller Tool Calling
- Storyteller uses Vercel AI SDK `streamText` with `tools` parameter — Zod schemas define each tool
- Phase 2 tools: `add_tag`, `remove_tag`, `set_relationship`, `add_chronicle_entry`, `log_event`, `offer_quick_actions`
- Tool calls are validated by backend before DB writes — invalid entity IDs or malformed args rejected
- On invalid tool call: error injected into conversation, Storyteller continues (no hard crash)
- Tool results streamed as `state_update` SSE events to frontend for real-time UI updates

### Storyteller System Prompt
- Expanded system prompt includes: mechanical outcome tier, world state context, tool instructions
- Storyteller told to narrate differently based on outcome: Strong Hit = success + bonus, Weak Hit = success + complication, Miss = failure + consequences
- Tool usage is encouraged but not forced — Storyteller decides when state changes are narratively appropriate

### Quick Action Buttons
- `offer_quick_actions` tool returns array of `{label, action}` pairs (3-5 contextual suggestions)
- Frontend renders as clickable buttons below the narrative
- Clicking a button sends the action text as the next turn input (same as typing it)
- Buttons clear when a new turn starts

### Claude's Discretion
- SSE event data structure specifics
- Tool validation error message format
- Storyteller prompt wording for outcome narration
- Quick action button styling/layout

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/engine/prompt-assembler.ts` — `assemblePrompt()` (from Phase 1)
- `backend/src/engine/oracle.ts` — `callOracle()`, `rollD100()`, `resolveOutcome()` (from Phase 1)
- `backend/src/ai/storyteller.ts` — current `callStoryteller()` with `streamText`
- `backend/src/routes/chat.ts` — has `/api/chat/action` endpoint stub from Phase 1
- `backend/src/worldgen/index.ts` — uses `streamSSE()` pattern for SSE streaming
- `backend/src/db/schema.ts` — relationships, chronicle tables for tool call DB writes

### Established Patterns
- SSE streaming via `streamSSE()` from `hono/streaming` — used in worldgen pipeline
- Zod schemas for tool definitions — same pattern as worldgen `generateObject`
- `parseBody()` for request validation
- Error handling: outer try/catch with `getErrorStatus()`

### Integration Points
- Modify `backend/src/routes/chat.ts` — `/api/chat/action` endpoint to use turn processor + SSE
- Modify `backend/src/ai/storyteller.ts` — add tool definitions for streamText
- Modify `frontend/app/game/page.tsx` — SSE event parsing instead of plain text
- New `frontend/components/game/quick-actions.tsx` — quick action buttons
- New `backend/src/engine/tool-executor.ts` — validates and executes tool calls against DB

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard implementation following design docs (mechanics.md tool system, concept.md turn anatomy).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
