# Phase 5: Episodic Memory - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase wires episodic memory into the gameplay loop: events are embedded into LanceDB per turn with importance scoring, retrieved via composite scoring (similarity×0.4 + recency×0.3 + importance×0.3), and injected into prompt assembly. Smart context compression keeps prompts within token budget over long sessions. Multi-hop graph queries follow relationship chains to enrich context.

This phase does NOT add: NPC agents, reflection, world engine, or save/checkpoints.

</domain>

<decisions>
## Implementation Decisions

### Episodic Event Storage
- `log_event` tool (already built in Phase 2) stores events to LanceDB via `storeEpisodicEvent()`
- Events need real embeddings (not placeholder zero vectors from Phase 2) — use Embedder role to generate vectors
- Each event: text summary, tick, location, participants[], importance (1-10), type
- Importance scored by a fast LLM (Judge role) call — or can be estimated heuristically from tool calls in the turn

### Composite Retrieval
- Score = similarity×0.4 + recency×0.3 + importance×0.3
- Recency normalized: recent ticks get higher score, decays over time
- Top 3-5 memories per standard prompt, more for reflection phases (Phase 7)
- Retrieval function in `backend/src/vectors/episodic-events.ts`

### Smart Context Compression
- Always include: first messages (world setup, character intro), last N turns (sliding window)
- Anomaly detection: high-importance events (fights, deaths, discoveries) always included regardless of recency
- Middle turns (non-anomalous, non-recent) are dropped first when token budget is tight
- Integrated into prompt assembler's conversation section

### Multi-hop Graph Queries
- Follow relationship chains via SQL JOINs on relationships table
- Example: player asks about an NPC → query NPC's relationships → include related factions/locations in context
- Integrated into prompt assembler's NPC state section — when NPC is in scene, include their relationship graph
- Depth limit: 2 hops (direct relationships + one level of transitive)

### Embedding Pipeline
- Post-turn hook: after Storyteller finishes, summarize the turn into a factual event sentence
- Use Embedder role to generate vector embedding
- Store in LanceDB episodic_events table
- Deferred (async, non-blocking) — don't slow down the turn response

### Claude's Discretion
- Exact recency decay formula
- How to summarize turns into event sentences (LLM call vs template)
- Importance estimation approach (LLM vs heuristic)
- Graph query depth and what relationships to follow

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/vectors/episodic-events.ts` — `storeEpisodicEvent()` already exists (Phase 2), stores with zero vector
- `backend/src/vectors/embeddings.ts` — `embedTexts()` generates embeddings via Embedder role
- `backend/src/vectors/lore-cards.ts` — `searchLoreCards()` pattern for vector search
- `backend/src/engine/prompt-assembler.ts` — prompt assembly with token budgets
- `backend/src/engine/turn-processor.ts` — `onPostTurn` hook exists but unused
- `backend/src/db/schema.ts` — relationships table with entityA, entityB, tags, reason

### Established Patterns
- LanceDB tables: campaign-scoped in `campaigns/{id}/vectors/`
- Vector search: cosine similarity via LanceDB `.search().limit(N)`
- Embeddings: `embedTexts()` calls Embedder provider via AI SDK
- Post-turn processing: `onPostTurn` callback in turn processor options

### Integration Points
- Wire `onPostTurn` in `/api/chat/action` route to trigger event embedding
- Add `searchEpisodicEvents()` to vectors layer
- Update prompt assembler to include retrieved memories section
- Add graph query helper to DB layer or prompt assembler
- Update chat history handling for smart compression

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard implementation following design docs (memory.md retrieval scoring, concept.md episodic memory).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
