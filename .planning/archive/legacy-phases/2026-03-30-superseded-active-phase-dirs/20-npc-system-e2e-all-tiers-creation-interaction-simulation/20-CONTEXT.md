# Phase 20: NPC System E2E — All Tiers Creation Interaction Simulation - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify the entire NPC system works end-to-end through real browser interaction with real LLM calls. Covers: all 3 NPC tiers (key/persistent/temporary), NPC creation during world gen (scaffold NPCs), NPC creation during gameplay (spawn_npc tool), NPC interaction during gameplay (talk to NPC, NPC autonomous actions), NPC tick system (key NPCs act on their own), off-screen simulation, and character promotion (extra→persistent→key).

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — E2E testing phase with full autonomy.
- Use GLM as provider (default per project preferences)
- Quality threshold: 4.5/5 minimum
- Real browser testing via Playwright MCP (no mocks, no grep, no fake scores)
- NEVER accept fallback/degraded behavior as passing
- Test NPC autonomous behavior: key NPCs should act, speak, move on their own during ticks
- Test spawn_npc tool: Storyteller should spawn new NPCs during gameplay
- Test NPC interaction: player talks to NPC, NPC responds in character
- Test off-screen simulation: NPCs not in player's location get batch-processed
- Test character promotion API if accessible through gameplay
- Verify NPC data persists correctly in DB (npcs table)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- NPC agent: `backend/src/engine/npc-agent.ts` — autonomous Key Character actions
- Off-screen sim: `backend/src/engine/npc-agent.ts` — simulateOffscreenNpcs
- NPC generator: `backend/src/character/npc-generator.ts` — 3 creation modes
- Tool executor: `backend/src/campaign/tool-executor.ts` — spawn_npc tool
- Frontend: game page sidebar shows NPCs present at location

### Established Patterns
- Prior phases (17-19) used API-first then browser E2E pattern
- Phase 19 confirmed core gameplay loop works with real Oracle + no fallbacks
- Phase 16 did NPC system QA at code level — this phase tests through browser

### Integration Points
- POST /api/chat — NPC ticks happen post-turn in chat route
- GET /api/campaigns/:id/world — returns NPCs with tier info
- NPC autonomous actions appear as narrative events after player turns

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard E2E testing approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
