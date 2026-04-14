# Phase 14: Final Systems Verification & Bug Fixing - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning
**Source:** QA Audit + docs/ systems checklist

<domain>
## Phase Boundary

Fix all remaining bugs discovered in QA audit and phase 13 playtesting. Verify every system described in docs/ works end-to-end. Final comprehensive browser playtest at 4.5+ quality. Models switched to GLM-5 Turbo — verify compatibility.

</domain>

<decisions>
## Implementation Decisions

### Known Bugs to Fix
- Lore extraction fails with provider error during scaffold generation — 0 lore cards produced. Must work with GLM-5 Turbo or fall back gracefully with user notification.
- LanceDB episodic events schema error: `Failed to infer data type for field vector at row 0` — vectors stored as empty/wrong type. Fix vector initialization in episodic event storage.
- DuckDuckGo MCP `spawn npx ENOENT` — MCP path broken. Fix or provide working alternative (Z.AI search MCP, or direct search integration).
- Location sidebar doesn't update when player moves to new location via Storyteller tool `reveal_location` or movement narration.
- Quick actions (`offer_quick_actions`) only appear ~80% of turns — must be 100% or have server-side fallback.

### Systems to Verify Against docs/
- Oracle: probability returns, 3-tier outcomes, tag interaction, HP awareness
- Storyteller: tool calling (all tools in mechanics.md), outcome tier narration, no metadata leaks
- NPC agents: autonomous actions, speak/act/move tools, goal-driven behavior
- NPC off-screen simulation: batch processing, action summaries
- NPC reflection: importance accumulation ≥15 trigger, belief/goal formation, reflection tools
- Faction ticks: every 5 turns, structured actions, territory changes, chronicle entries
- Episodic memory: event storage, vector search retrieval, composite scoring (sim×0.4 + recency×0.3 + importance×0.3)
- Lore cards: extraction from scaffold, vector search, injection into prompts as [LORE CONTEXT]
- Prompt assembly: all sections present ([SYSTEM RULES], [WORLD PREMISE], [SCENE], [PLAYER STATE], [NPC STATE], [LORE CONTEXT], [RETRIEVED MEMORIES], [RECENT CONVERSATION], [ACTION RESULT], [TASK])
- Context compression: token budget management over long sessions
- Save/checkpoint: auto-checkpoint at HP≤2, manual save, checkpoint restore
- World gen pipeline: research → DNA → scaffold → lore (all steps with SSE progress)
- Character creation: parse/generate/import V2 card, all 3 modes
- Campaign CRUD: create/load/delete
- Settings: provider management, role assignment, all tabs functional

### Quality Target
- Minimum 4.5/5 across all areas (gameplay, UX, UI, error handling)
- GLM-5 Turbo model compatibility verified for Judge, Storyteller, Generator roles

### Claude's Discretion
- Implementation approach for fixes (minimal changes to resolve bugs)
- Test campaign scenarios for verification playtest
- Order of bug fixes vs verification

</decisions>

<code_context>
## Existing Code Insights

### Key Engine Files
- backend/src/engine/oracle.ts — Oracle probability engine
- backend/src/engine/turn-processor.ts — Turn pipeline, sanitizeNarrative
- backend/src/engine/prompt-assembler.ts — SYSTEM_RULES, context assembly
- backend/src/engine/npc-agent.ts — NPC autonomous behavior
- backend/src/engine/npc-offscreen.ts — Off-screen NPC simulation
- backend/src/engine/reflection-agent.ts — NPC reflection system
- backend/src/engine/world-engine.ts — Faction ticks, world simulation
- backend/src/engine/tool-schemas.ts — All tool definitions
- backend/src/engine/tool-executor.ts — Tool call execution
- backend/src/engine/state-snapshot.ts — Checkpoint system
- backend/src/engine/graph-queries.ts — Relationship graph queries
- backend/src/engine/token-budget.ts — Context compression

### Key Vector/Memory Files
- backend/src/vectors/embeddings.ts — Embedding generation
- backend/src/vectors/lore-cards.ts — Lore card storage and search
- backend/src/vectors/connection.ts — LanceDB connection management

### Key Route Files
- backend/src/routes/chat.ts — Chat/gameplay endpoint
- backend/src/routes/worldgen.ts — World generation endpoints
- backend/src/routes/campaigns.ts — Campaign CRUD

### Frontend Game Components
- frontend/components/game/ — All game UI components
- frontend/app/game/page.tsx — Game page
- frontend/app/campaign/[id]/character/ — Character creation
- frontend/app/campaign/[id]/review/ — World review

</code_context>

<specifics>
## Specific Ideas

- Use Z.AI search MCP (already configured in MCP servers) as replacement for broken DuckDuckGo MCP
- For quick actions fallback: if Storyteller doesn't call offer_quick_actions, make a separate lightweight LLM call to generate them
- For episodic memory vector fix: ensure embeddings are generated before LanceDB insert, handle empty vector gracefully
- All roles now on GLM-5 Turbo (glm-provider) — test connection first

</specifics>

<deferred>
## Deferred Ideas

None — this is the final verification phase.

</deferred>

---

*Phase: 14-final-systems-verification-bug-fixing*
*Context gathered: 2026-03-20 via QA Audit + docs/ checklist*
