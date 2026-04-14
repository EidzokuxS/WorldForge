# Phase 22: Safety Systems E2E — Checkpoints Death Save Load - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify safety systems work end-to-end through real browser interaction with real LLM calls. Covers: checkpoint save/load/branch, auto-checkpoint before lethal encounters, death/defeat handling (HP=0 narration), save game persistence, and "what if" branching for exploration.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — E2E testing phase with full autonomy.
- Use GLM as provider (default per project preferences)
- Quality threshold: 4.5/5 minimum
- Real browser testing via Playwright MCP (no mocks, no grep, no fake scores)
- NEVER accept fallback/degraded behavior as passing
- Test checkpoint creation: manual save creates snapshot of state.db + vectors
- Test checkpoint load: restoring a checkpoint reverts game state
- Test checkpoint branching: creating a branch from a checkpoint
- Test auto-checkpoint: system auto-saves before lethal encounters
- Test death/defeat: HP=0 triggers contextual death narration
- Test save persistence: checkpoints survive page reload
- Verify checkpoint API endpoints work correctly

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Checkpoints: `backend/src/campaign/` — checkpoint save/load/branch logic
- Death handling: turn processor + storyteller handle HP=0
- Auto-checkpoint: reactive checkpoint before lethal encounters
- API: checkpoint-related routes in campaigns

### Established Patterns
- Prior phases (17-21) used API-first then browser E2E pattern
- Phase 19 confirmed HP tracking works (3→2→1 visible in CharacterPanel)

### Integration Points
- Checkpoint API endpoints in campaign routes
- Game page may have save/load UI
- HP=0 handling in turn processor

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard E2E testing approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
