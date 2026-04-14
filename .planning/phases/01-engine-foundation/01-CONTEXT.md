# Phase 1: Engine Foundation - Context

**Gathered:** 2026-03-18
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers the Prompt Assembler (structured context compilation from 6+ data sources with token budgets) and the Oracle probability system (Judge LLM evaluation + D100 roll + 3-tier outcomes). It does NOT deliver the full turn cycle, Storyteller tool calling, or state updates — those are Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Prompt Assembly Architecture
- Prompt Assembler lives in new `backend/src/engine/prompt-assembler.ts` — clean separation from existing AI layer
- Token budgets estimated via char-based approximation (4 chars ≈ 1 token), configurable max per section — no tokenizer dependency
- Token budget overflow handled by priority-based truncation: system rules (never cut) > world premise (never cut) > recent turns (sliding window) > memories (reduce count) > lore (reduce count)
- Section budgets are dynamic per model — different models have different context windows; store model context size in provider config, allocate proportionally

### Oracle Design
- Oracle receives structured JSON payload: `{intent, method, actorTags, targetTags, environmentTags}` — matches mechanics.md spec
- Oracle output via Zod-validated `generateObject`: `{chance: number, reasoning: string}` — same pattern as existing worldgen
- On Oracle call failure: fallback to 50% chance (coin flip) with warning logged — game never blocks on Oracle failure
- D100 roll via `crypto.randomInt(1, 101)` — already used in seed-roller.ts, cryptographically random

### Integration with Existing Chat
- Extend current routes — add `/api/chat/action` for Oracle+Storyteller pipeline, keep existing `/api/chat` as fallback during development
- Oracle result shown in UI in a collapsible panel above narrative — player sees chance%, tier, and reasoning
- Dev-only debug endpoint `GET /api/debug/prompt?action=...` returns compiled prompt with section sizes
- Tick counter stored as `currentTick` in campaign config.json, incremented per turn

### Claude's Discretion
- Internal module organization within `backend/src/engine/` (file splits, helper functions)
- Exact token budget percentages per section
- Oracle system prompt wording

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/ai/provider-registry.ts` — `createModel()` creates OpenAI-compatible models from provider config
- `backend/src/ai/storyteller.ts` — current `callStoryteller()` with `streamText`, system prompt, chat history slice. Will be extended/replaced
- `backend/src/routes/helpers.ts` — `resolveStoryteller()`, `resolveGenerator()`, `resolveEmbedder()` resolve role configs. Need `resolveJudge()` equivalent
- `backend/src/worldgen/seed-roller.ts` — uses `crypto.randomInt()` for dice rolls
- `backend/src/db/schema.ts` — 8 tables including players (HP, tags, currentLocationId), npcs (tags, tier, goals, beliefs, currentLocationId), locations (tags, connectedTo), factions (tags, goals), relationships (entityA, entityB, tags), chronicle (tick, text)
- `backend/src/vectors/lore-cards.ts` — `searchLoreCards()` for semantic lore retrieval
- `backend/src/campaign/manager.ts` — `getActiveCampaign()`, campaign config read/write

### Established Patterns
- All LLM calls use Vercel AI SDK (`generateObject` for structured output, `streamText` for streaming)
- Zod schemas for all structured output validation
- Routes use `parseBody()` + outer try/catch + `getErrorStatus()`
- Role resolution pattern: `resolveXxx(settings)` returns `{ resolved } | { error, status }`

### Integration Points
- New `/api/chat/action` route in `backend/src/routes/chat.ts`
- New `backend/src/engine/` directory for game engine modules
- `resolveJudge()` helper needed in `backend/src/routes/helpers.ts`
- Campaign config.json needs `currentTick` field

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard implementation following design docs (mechanics.md prompt assembly template, memory.md retrieval scoring).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
