# Phase 19: Core Gameplay Loop E2E — Oracle Storyteller Tools Movement HP - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify the core gameplay loop works end-to-end through real browser interaction with real LLM calls. Covers: player action submission, Oracle probability evaluation (Judge LLM), D100 roll with 3-tier outcomes (Strong Hit/Weak Hit/Miss), Storyteller narration with tool calling (spawn_npc, add_tag, remove_tag, set_relationship, set_condition, transfer_item, log_event, quick_actions), location movement (move_to), HP damage/healing system, and quick action buttons. This is the heart of the game — the turn cycle that makes everything work.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — E2E testing phase with full autonomy.
- Use GLM as provider for both Judge and Storyteller roles
- Quality threshold: 4.5/5 minimum for narrative quality and mechanical correctness
- Real browser testing via Playwright MCP (no mocks, no grep, no fake scores)
- Test multi-turn gameplay (at least 5-10 turns) to verify sustained loop
- Verify Oracle shows probability, roll, and tier in OraclePanel
- Verify Storyteller uses tools correctly (state updates visible in sidebar)
- Verify movement between locations updates location panel
- Verify HP changes from combat are reflected in character panel
- Verify quick action buttons appear and are clickable
- Test both narrative actions and combat scenarios
- Use existing campaign with world scaffold from prior phases

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Turn processor: `backend/src/campaign/turn-processor.ts` — full Oracle→Storyteller pipeline
- Oracle: `backend/src/ai/oracle.ts` — Judge LLM probability evaluation
- Storyteller: `backend/src/ai/storyteller.ts` — narrative generation with tool calling
- Tool executor: `backend/src/campaign/tool-executor.ts` — validates and executes LLM tool calls
- Prompt assembler: `backend/src/ai/prompt-assembler.ts` — structured context assembly
- Frontend game page: `frontend/app/game/page.tsx`
- Frontend components: NarrativeLog, ActionBar, OraclePanel, CharacterPanel, LocationPanel

### Established Patterns
- SSE streaming with typed events (narrative, oracle_result, state_update, quick_actions, done)
- Prior phases (17-18) confirmed API and browser testing patterns work

### Integration Points
- POST /api/chat — main gameplay endpoint, streams Storyteller response
- GET /api/chat/history — chat history + premise
- Game page sidebar panels reflect world state changes from tool calls

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard E2E testing approaches per prior QA phase patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
