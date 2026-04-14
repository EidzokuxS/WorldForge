# Phase 21: Memory Persistence and World Context E2E - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify memory persistence and world context systems work end-to-end. Covers: episodic memory (event embedding + retrieval via LanceDB), smart context compression (first+last+anomalous events in prompt), multi-hop graph queries (2-hop BFS relationship traversal), lore card semantic search, chat history persistence, and prompt assembly with token budgets.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — E2E testing phase with full autonomy.
- Use GLM as provider (default per project preferences)
- Quality threshold: 4.5/5 minimum
- Real browser testing via Playwright MCP (no mocks, no grep, no fake scores)
- NEVER accept fallback/degraded behavior as passing
- Test episodic memory: events should be embedded and retrievable via semantic search
- Test context compression: prompt assembler should include first messages + last N turns + anomalous events
- Test multi-hop queries: relationship chains (NPC→location→faction) should enrich context
- Test lore card search: semantic search via LanceDB should return relevant cards
- Test chat history: messages should persist across page reloads
- Test prompt assembly: verify token budgets are respected

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Episodic events: `backend/src/vectors/episodic-events.ts` — store, embed, search events
- Prompt assembler: `backend/src/ai/prompt-assembler.ts` — structured context assembly
- Lore cards: `backend/src/vectors/lore-cards.ts` — LanceDB semantic search
- Chat history: `backend/src/campaign/chat-history.ts` — disk-based persistence
- Graph queries: relationship traversal in prompt assembler

### Established Patterns
- Prior phases (17-20) used API-first then browser E2E pattern
- LanceDB: embedded vector DB, campaign-scoped in campaigns/{id}/vectors/
- Composite retrieval: sim×0.4 + rec×0.3 + imp×0.3

### Integration Points
- POST /api/chat — episodic events embedded post-turn
- GET /api/chat/history — chat history + premise
- GET /api/campaigns/:id/lore/search?q=&limit= — semantic lore search
- Prompt assembler feeds context to Judge and Storyteller

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard E2E testing approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
