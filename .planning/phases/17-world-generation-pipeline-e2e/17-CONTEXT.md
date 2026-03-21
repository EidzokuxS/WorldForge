# Phase 17: World Generation Pipeline E2E - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify the entire world generation pipeline works end-to-end through real browser interaction with real LLM calls. Covers: campaign creation, World DNA (random + AI-generated seeds), scaffold generation (5-step pipeline: premise → locations → factions → NPCs → lore), scaffold editing/regeneration, and world review page functionality.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — E2E testing phase with full autonomy.
- Test scenarios should use a known IP (e.g., Witcher, Star Wars) to validate IP research + DNA + scaffold pipeline
- Also test an original world concept to validate non-IP path
- Use GLM as provider (default per project preferences)
- Quality threshold: 4.5/5 minimum for all generated content
- Real browser testing via Playwright MCP (no mocks, no grep, no fake scores)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- World gen pipeline: `backend/src/worldgen/` — scaffold-generator, seed-roller, suggest-seeds, scaffold-saver, ip-researcher
- Frontend: `frontend/components/title/` — TitleScreen, WorldDnaPanel
- Frontend: `frontend/components/world-review/` — PremiseSection, LocationsSection, FactionsSection, NpcsSection, LoreSection
- API endpoints: POST /api/worldgen/* (roll-seeds, suggest-seeds, generate, regenerate-section, save-edits)

### Established Patterns
- SSE streaming for pipeline progress
- Prior QA phases (12-16) used Playwright MCP for browser testing
- Quality scoring on 4.5/5 threshold

### Integration Points
- Title screen → campaign creation → World DNA → scaffold generation → world review → character creation
- Settings page must have GLM provider configured before testing

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard E2E testing approaches per prior QA phase patterns.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
