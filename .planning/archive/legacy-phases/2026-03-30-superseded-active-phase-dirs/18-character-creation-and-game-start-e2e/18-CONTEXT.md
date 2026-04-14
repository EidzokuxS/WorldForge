# Phase 18: Character Creation and Game Start E2E - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify the character creation page and game start flow work end-to-end through real browser interaction with real LLM calls. Covers: all 3 character creation modes (parse description, AI generate, import V2/V3 card), character save to DB, starting location resolution, redirect to game page, and first turn readiness.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — E2E testing phase with full autonomy.
- Test all 3 character creation modes: parse free-text description, AI generate from archetype, import SillyTavern V2/V3 card
- Use GLM as provider (default per project preferences)
- Quality threshold: 4.5/5 minimum for generated characters
- Real browser testing via Playwright MCP (no mocks, no grep, no fake scores)
- Test with campaign created in Phase 17 or create new test campaign
- Verify character save writes to players table correctly
- Verify starting location resolution picks an isStarting location
- Verify redirect to /game page after character save
- Verify game page loads with character data in sidebar

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Character creation: `backend/src/character/` — generator.ts, npc-generator.ts, archetype-researcher.ts
- Frontend: `frontend/app/campaign/[id]/character/` — character creation page
- Frontend: `frontend/components/character-creation/` — CharacterForm, CharacterCard
- V2 parser: `frontend/lib/v2-card-parser.ts` — client-side V2/V3 card parsing
- API endpoints: POST /api/worldgen/parse-character, generate-character, research-character, import-v2-card, save-character, resolve-starting-location

### Established Patterns
- Prior QA phases (12-17) used Playwright MCP for browser testing
- Phase 17 confirmed worldgen pipeline works — campaigns exist for testing

### Integration Points
- World review page → character creation page (after save-edits)
- Character creation → save-character → resolve-starting-location → redirect to /game
- Game page loads player data from DB

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard E2E testing approaches per prior QA phase patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
