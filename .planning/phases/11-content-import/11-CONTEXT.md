# Phase 11: Content Import - Context

**Gathered:** 2026-03-28 (updated)
**Status:** Ready for planning

<domain>
## Phase Boundary

WorldBook import as world generation foundation. A SillyTavern WorldBook JSON file becomes the knowledge base for scaffold generation — replacing or supplementing franchise research. WorldBook entries are parsed, classified by LLM, and converted into IpResearchContext that feeds the entire scaffold pipeline (DNA seeds → premise → locations → factions → NPCs → lore).

</domain>

<decisions>
## Implementation Decisions

### WorldBook → Scaffold Pipeline (UPDATED from original)
- **D-01:** WorldBook entries become `IpResearchContext` via `worldbookToIpContext()` — characters → `canonicalNames.characters`, locations → `canonicalNames.locations`, factions → `canonicalNames.factions`, all entries → `keyFacts`
- **D-02:** Scaffold gen runs on top of worldbook context — LLM creates proper scaffold entities (with tags, connectedTo, goals, assets) informed by worldbook knowledge. No separate DB import of raw entries.
- **D-03:** Worldbook and franchise research are mutually compatible — if both provided, worldbook entries merge into ipContext alongside research facts
- **D-04:** Premise is optional when worldbook is provided. If empty, LLM generates premise summary from classified entries.

### Classification
- **D-05:** Batch classification: chunks of 20 entries per LLM call (not single monolithic call — reasoning models need manageable context)
- **D-06:** Categories: character, location, faction, bestiary, lore_general
- **D-07:** Classification starts immediately on file upload, runs in background while user fills premise/name
- **D-08:** Strip HTML from content, deduplicate by name, skip empty entries

### UI Flow
- **D-09:** WorldBook upload field on Step 1 (Concept) — below franchise field
- **D-10:** File upload with drag-and-drop, accepts .json files
- **D-11:** Progress indicator during classification ("Classifying 220 entries... 7/11 batches")
- **D-12:** When user clicks Next→DNA, classified entries are passed as `worldbookEntries[]` to suggest-seeds

### What Already Works (from current session)
- `parseWorldBook()` — parses SillyTavern JSON, strips HTML, deduplicates (220/237 entries for test file)
- `classifyEntries()` — batched classification, 11 batches × ~60s = ~10 min for 220 entries
- `worldbookToIpContext()` — converts classified entries to IpResearchContext
- `suggest-seeds` route accepts `worldbookEntries[]` and uses them as ipContext
- Tested: Fantasy RPG Chickenmadness worldbook → DNA gen produced Flamburg, Aprida, Great Forest, Devereaux — all from worldbook

### Claude's Discretion
- Progress UI implementation details
- How to merge worldbook + franchise research contexts if both provided
- Classification prompt refinements

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Backend
- `backend/src/worldgen/worldbook-importer.ts` — parseWorldBook, classifyEntries, worldbookToIpContext, importClassifiedEntries
- `backend/src/worldgen/scaffold-steps/prompt-utils.ts` — buildIpContextBlock, buildCanonicalList
- `backend/src/routes/worldgen.ts` — suggest-seeds route (worldbookEntries handling)
- `backend/src/routes/schemas.ts` — suggestSeedsSchema (worldbookEntries field)

### Frontend
- `frontend/components/title/new-campaign-dialog.tsx` — Step 1 UI (needs worldbook upload)
- `frontend/components/title/use-new-campaign-wizard.ts` — wizard state (needs worldbook state + classify)
- `frontend/lib/api.ts` — suggestSeeds function, parseWorldBook, importWorldBook API calls

### Shared
- `shared/src/types.ts` — IpResearchContext interface (canonicalNames field)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `worldbookToIpContext()` already implemented and tested
- `parseWorldBook()` and `classifyEntries()` work end-to-end (tested with 220 entries)
- `suggest-seeds` route already accepts `worldbookEntries[]`
- `buildIpContextBlock()` and `buildCanonicalList()` inject worldbook data into scaffold prompts

### Established Patterns
- File upload: V2 card parser does client-side file reading (reference pattern)
- Background processing: scaffold gen uses SSE progress events
- State management: wizard hook pattern with phase state machine

### Integration Points
- Step 1 dialog needs: file input + classify trigger + progress state
- Wizard hook needs: worldbookEntries state + classify API call
- API: classify could use existing parse-worldbook endpoint or new client-side classify

</code_context>

<specifics>
## Specific Ideas

- Classification is the bottleneck (~10 min for 220 entries). Start immediately on file upload so it runs while user types premise.
- Worldbook entries with 0 content are already filtered by parseWorldBook.
- Test file: `X:\Models\Chars\main_Fantasy RPG - Chickenmadness_world_info (1).json` — 237 entries, 220 after dedup/filter.

</specifics>

<deferred>
## Deferred Ideas

- Wiki URL scraper (v2 — VIS-02)
- Worldbook entry preview/editing before generation (show classified entries, let user remove/reclassify)
- Merge strategy for worldbook + franchise research (when both provided)

</deferred>

---

*Phase: 11-content-import*
*Context gathered: 2026-03-28*
</content>
</invoke>