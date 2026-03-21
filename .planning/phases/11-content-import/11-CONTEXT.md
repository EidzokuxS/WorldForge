# Phase 11: Content Import - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase adds WorldBook import (SillyTavern JSON → clean → classify → route to DB) and web search expansion (multiple search sources for IP research). WorldBook entries are cleaned of SillyTavern-specific data and classified by entity type via LLM before being routed to appropriate database tables.

</domain>

<decisions>
## Implementation Decisions

### WorldBook Import Pipeline
- Upload SillyTavern WorldBook JSON file via frontend
- Parse WorldBook format: entries[] with keys, content, extensions, etc.
- Clean: strip SillyTavern-specific fields (selectiveLogic, constant, vectorized, excludeRecursion, etc.)
- Classify: LLM (Generator role) classifies each entry as character/location/faction/bestiary/lore
- Route: characters → npcs table, locations → locations table, factions → factions table, bestiary/lore → lore cards in LanceDB
- Preview before import: show classified entries, let user confirm/adjust

### WorldBook Cleaning Rules
- Remove: activation keys (key, keysecondary), recursion settings, position/depth, selectiveLogic, vectorized, extensions
- Keep: content (the actual lore text), comment (name/title)
- Strip HTML/formatting from content if present
- Deduplicate entries with same name

### Entity Classification
- Single LLM call with all entries as batch — returns classification per entry
- Categories: character, location, faction, bestiary, lore_general
- character → parse into NPC format (persona from content, infer tags)
- location → parse into location format (description from content, infer tags)
- faction → parse into faction format (goals from content, infer tags)
- bestiary/lore_general → store as lore cards in LanceDB

### Web Search Expansion
- Current: DuckDuckGo MCP for IP research
- Add: Z.AI search MCP as additional/alternative source
- Research config: allow selecting which search provider to use
- Fallback chain: primary search → fallback search → LLM-only

### Claude's Discretion
- WorldBook parser implementation details
- Classification prompt wording
- How to handle ambiguous entries (entries that could be multiple types)
- Z.AI MCP integration specifics

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `backend/src/worldgen/ip-researcher.ts` — existing DuckDuckGo MCP integration
- `backend/src/worldgen/lore-extractor.ts` — lore card creation and embedding pattern
- `backend/src/vectors/lore-cards.ts` — lore card storage in LanceDB
- `backend/src/worldgen/scaffold-saver.ts` — DB write patterns for NPCs, locations, factions
- `backend/src/lib/mcp-client.ts` — MCP client for tool calling
- `frontend/lib/v2-card-parser.ts` — V2 card parsing (reference for data extraction patterns)

### Integration Points
- New `backend/src/worldgen/worldbook-importer.ts` module
- New upload endpoint in worldgen or campaigns routes
- Frontend WorldBook import UI (in world-review or settings)
- Update ip-researcher to support multiple search providers
- Settings: research config with provider selection

</code_context>

<specifics>
## Specific Ideas

WorldBook entries contain lots of junk — the cleaning step is critical. Entity classification must be LLM-driven since WorldBook entries have no standardized type field.

</specifics>

<deferred>
## Deferred Ideas

- Wiki URL scraper (v2 — VIS-02)

</deferred>
