---
phase: 17-unit-test-coverage
plan: 01
subsystem: worldgen
tags: [testing, scaffold-saver, worldbook-importer, unit-tests]
dependency_graph:
  requires: []
  provides: [worldgen-test-coverage]
  affects: [backend/src/worldgen]
tech_stack:
  added: []
  patterns: [chainable-mock-db, predictable-uuid-mocking]
key_files:
  created:
    - backend/src/worldgen/__tests__/scaffold-saver.test.ts
    - backend/src/worldgen/__tests__/worldbook-importer.test.ts
  modified: []
decisions:
  - Inline vi.mock factories to avoid hoisting issues with external variable references
  - DbCall tracking array pattern for verifying all DB operations without real SQLite
metrics:
  duration: 4min
  completed: 2026-03-21T19:51:30Z
  tasks: 2
  files: 2
---

# Phase 17 Plan 01: Worldgen Test Coverage Summary

Unit tests for scaffold-saver (transaction, inserts, bidirectional adjacency, relationships) and worldbook-importer (parsing with HTML strip/dedup, LLM classification, import routing to DB tables and lore cards).

## Task Results

| Task | Name | Commit | Tests | Files |
|------|------|--------|-------|-------|
| 1 | Test scaffold-saver.ts | 669518c | 11 pass | scaffold-saver.test.ts |
| 2 | Test worldbook-importer.ts | f207efb | 11 pass | worldbook-importer.test.ts |

## What Was Tested

### scaffold-saver.ts (11 tests)
- Transaction execution with mock DB
- clearExistingScaffold deletes relationships, npcs, factions, locations in correct order
- insertLocations creates rows with correct fields (id, campaignId, name, description, tags as JSON, isStarting, connectedTo as "[]")
- updateAdjacency creates bidirectional connections (A->B implies B->A)
- insertFactions creates rows with tags/goals/assets as JSON
- insertNpcs sets tier="key", maps locationName to locationId, stores goals as {short_term, long_term}
- NPC with unknown locationName gets null currentLocationId
- insertMembershipRelationships creates ["Member"] tagged relationship for NPCs with factionName
- NPC with no factionName skips membership relationship
- insertTerritoryRelationships creates ["Controls"] tagged relationship, deduplicates territory names via Set
- Campaign premise updated via tx.update(campaigns)

### worldbook-importer.ts (11 tests)
- parseWorldBook extracts entries from valid WorldBook JSON
- HTML tags stripped from content
- Entries deduplicated by name (case-insensitive)
- Empty name/content entries skipped
- Invalid JSON structure throws (missing entries key)
- classifyEntries returns empty array for empty input (no LLM call)
- classifyEntries calls generateObject with prompt containing entry names
- classifyEntries returns classified entries from LLM result
- importClassifiedEntries routes characters->npcs, locations->locations, factions->factions
- importClassifiedEntries routes bestiary+lore_general to storeLoreCards
- ImportResult counts are correct

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED
