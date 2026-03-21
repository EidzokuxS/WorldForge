# Phase 4: Story Control - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase gives players editorial control over the narrative: retry/regenerate the last Storyteller response, undo the last action+response (rolling back both chat history and game state), and edit AI output inline. Quick action button rendering was already built in Phase 2 — this phase adds the retry/undo/edit controls around them.

This phase does NOT add: episodic memory, NPC agents, save/checkpoints, or any new game mechanics.

</domain>

<decisions>
## Implementation Decisions

### Retry/Regenerate
- "Retry" button next to the last AI response re-calls Storyteller with the same context (new Oracle roll, new narration)
- Backend endpoint: `POST /api/chat/retry` — pops last assistant message from chat history, re-runs turn processor with same player action
- State rollback: undo any tool call effects from the original response before re-running (revert tag changes, HP changes, spawned entities)
- On retry, the Oracle re-rolls — different probability outcome possible

### Undo
- "Undo" button reverts the last action+response pair — pops both user and assistant messages from chat history
- Backend endpoint: `POST /api/chat/undo` — removes last turn, reverts game state to pre-turn snapshot
- State snapshot: before each turn, capture a lightweight state snapshot (player HP, tags, location, recent entity changes) — stored in memory, not persisted
- Redo not needed for v1 — undo is single-step only

### Inline Edit
- Player can click on AI-generated narrative text and edit it inline
- Edited text replaces the original in chat history (edited version is canonical)
- Backend endpoint: `POST /api/chat/edit` with `{ messageIndex, newContent }` — updates chat history file
- No state rollback on edit — editing is cosmetic (fixes names, facts, tone), not mechanical
- Edit indicator: subtle "edited" label on modified messages

### Quick Action Buttons (already built)
- QuickActions component from Phase 2 already renders buttons and triggers submitAction
- CTRL-04 is satisfied by Phase 2 implementation — just verify it works correctly

### Claude's Discretion
- UI layout of retry/undo/edit controls (placement, icons, keyboard shortcuts)
- State snapshot format and what exactly to capture
- How to handle retry when the original response had tool calls that created entities (delete them or keep them)
- Edit UI interaction pattern (click-to-edit vs edit button)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/campaign/chat-history.ts` — `getChatHistory()`, `appendChatMessages()` for reading/writing chat history
- `backend/src/routes/chat.ts` — existing `/api/chat/action` endpoint with turn processor
- `backend/src/engine/turn-processor.ts` — `processTurn()` async generator
- `frontend/app/game/page.tsx` — game page with SSE parsing, narrative log
- `frontend/components/game/quick-actions.tsx` — already built in Phase 2

### Established Patterns
- Chat history as JSON file per campaign (`chat_history.json`)
- SSE streaming for turn responses
- `appendChatMessages()` for persisting messages

### Integration Points
- New endpoints in `backend/src/routes/chat.ts`: `/retry`, `/undo`, `/edit`
- Frontend buttons in narrative log or action bar area
- Chat history manipulation functions in `campaign/chat-history.ts`

</code_context>

<specifics>
## Specific Ideas

No specific requirements — standard implementation following design docs.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
