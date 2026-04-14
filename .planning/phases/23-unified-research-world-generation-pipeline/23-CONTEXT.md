# Phase 23: Unified Research & World Generation Pipeline - Context

**Gathered:** 2026-03-25
**Status:** Ready for planning
**Mode:** Infrastructure phase — discuss skipped

<domain>
## Phase Boundary

Refactor the research + world generation pipeline into a clear tree structure:
1. Research runs ONCE (detect franchise → web search → compile facts)
2. Results cached in campaign config.json (not re-fetched on regeneration)
3. DNA seeds generated from cached research
4. World scaffold generated from cached research + DNA seeds
5. On regenerate-section: AI checks if research is sufficient, searches more if needed
6. ipContext flows through entire pipeline without duplication

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure refactoring phase.

Key constraints from user:
- Research runs once, results persist in campaign config.json
- No duplicate searches between DNA and scaffold generation
- On regenerate: AI evaluates sufficiency of cached research before searching more
- Pipeline should be tree-like: research → DNA → scaffold (not research-then-research)

</decisions>

<code_context>
## Existing Code Insights

### Current Flow (Problems)
1. `suggest-seeds` route → `suggestWorldSeeds()` → `researchKnownIP()` → research runs here
2. `generate` route → `generateWorldScaffold()` → `researchKnownIP()` → research runs AGAIN
3. `regenerate-section` route → NO research at all (ipContext lost)
4. `suggest-seed` (single) → uses ipContext from frontend state (React `useState`)
5. Frontend `use-new-campaign-wizard.ts` stores ipContext in transient React state — lost on page reload

### Data Structures
- `IpResearchContext`: { franchise, keyFacts[], tonalNotes[], source }
- Stored nowhere persistently — only in React state during wizard flow
- `config.json` per campaign: { name, premise, seeds } — no ipContext field

### Integration Points
- `backend/src/worldgen/ip-researcher.ts` — `researchKnownIP()`, `researchViaWebSearch()`
- `backend/src/worldgen/seed-suggester.ts` — `suggestWorldSeeds()`, `suggestSingleSeed()`
- `backend/src/worldgen/scaffold-generator.ts` — `generateWorldScaffold()`, all step functions
- `backend/src/routes/worldgen.ts` — suggest-seeds, suggest-seed, generate, regenerate-section
- `frontend/components/title/use-new-campaign-wizard.ts` — wizard flow, ipContext state
- `backend/src/campaign/manager.ts` — config.json read/write

### Reusable Assets
- `webSearch()` dispatcher in `web-search.ts` — Brave/DDG/ZAI
- `researchKnownIP()` already handles detect → verify → research → compile
- `safeGenerateObject()` for LLM calls with fallback

</code_context>

<specifics>
## Specific Ideas

User's exact words: "Нужен обговоренный ранее пайплайн ресерча и того, что искать. Потом генерируется DNA. Данные ресерча должны храниться, чтобы при перегенерации не дергать поиск каждый раз. Затем мы идем в генерацию мира. Нам нужно чтобы ИИ смотрел на доступные данные с ресерча и на сид, думал, хватает ли ему этого для полноценной картины, если не хватает доискивал чего там надо и потом уже генерировал."

Pipeline tree:
```
premise + name
    │
    ▼
[Research] ← runs once, cached
    │
    ├──▶ [DNA Seeds] ← uses cached research
    │
    ▼
[Scaffold Generation] ← uses cached research + seeds
    ├── premise step
    ├── locations step  ← AI checks: enough data? search more if not
    ├── factions step   ← same check
    ├── npcs step       ← same check
    └── lore extraction
```

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>
