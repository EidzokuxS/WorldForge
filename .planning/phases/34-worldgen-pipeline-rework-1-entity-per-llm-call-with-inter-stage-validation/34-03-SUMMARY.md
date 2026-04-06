---
phase: 34-worldgen-pipeline-rework-1-entity-per-llm-call-with-inter-stage-validation
plan: 03
subsystem: worldgen
tags: [npc-generation, lore-extraction, per-entity, dedup, progress]

requires:
  - phase: 34-worldgen-pipeline-rework
    plan: 01
    provides: GenerationProgress sub-fields, reportSubProgress helper
provides:
  - Per-entity NPC detail generation with cross-tier accumulator and name forcing
  - 4 category-specific lore extraction calls with post-filtering and deduplication
  - Entity-level sub-progress reporting for both NPC and lore steps
affects: [scaffold-generator, worldgen routes]

tech-stack:
  added: []
  patterns: [per-entity-detail-loop, category-specific-extraction, post-filter-dedup]

key-files:
  created: []
  modified:
    - backend/src/worldgen/scaffold-steps/npcs-step.ts
    - backend/src/worldgen/lore-extractor.ts
    - backend/src/worldgen/types.ts
    - backend/src/worldgen/scaffold-steps/prompt-utils.ts

key-decisions:
  - "Per-entity NPC detail loop replaces batch-of-5 for richer cross-references between characters"
  - "Schema excludes name field to force planned name as authoritative (review fix #6)"
  - "4 category-specific lore calls with post-filtering prevent cross-category leaks (review fix #5)"
  - "Failed lore category logs warning and returns empty array rather than failing entire extraction"

duration: 6min
completed: 2026-04-04
---

# Phase 34 Plan 03: Per-Entity NPC Generation and Category-Specific Lore Extraction Summary

**Per-entity NPC detail calls with cross-tier accumulator and name forcing, plus 4 category-specific lore extraction calls with post-filtering and case-insensitive dedup.**

## What Was Built

### Task 1: Per-Entity NPC Detail Calls (npcs-step.ts)

Replaced the batch-of-5 detail generation with a sequential per-entity loop where each NPC is detailed in its own LLM call:

- **Cross-tier accumulator**: Each NPC detail call receives FULL details (persona, tags, goals) of ALL previously detailed NPCs, spanning both key and supporting tiers. This enables richer cross-references.
- **Canonical names (D-05)**: Every detail prompt includes ALL planned NPC names, KNOWN LOCATIONS, and KNOWN FACTIONS so the LLM can reference any entity.
- **Name forcing (review fix #6)**: The schema (`npcDetailSingleSchema`) excludes the `name` field entirely. The planned name is always used as authoritative.
- **Sub-progress**: Reports entity-level progress via `reportSubProgress` (e.g., "NPC: Gandalf (key) 3/12").
- **Backward-compatible**: `generateNpcsStep` gains optional `onProgress`, `progressStep`, `progressTotalSteps` params.

Removed: `detailNpcBatch`, `chunk`, `npcDetailSchema` (batch schema).

### Task 2: Category-Specific Lore Extraction (lore-extractor.ts)

Split the monolithic 20-60 card extraction into 4 focused calls:

| Call | Categories | Min-Max |
|------|-----------|---------|
| Location lore | location, event | 3-15 |
| Faction lore | faction, rule | 3-15 |
| NPC lore | npc, ability | 3-15 |
| Concept lore | concept, rule, ability, item, event | 5-20 |

- **Post-filtering (review fix #5)**: Each call's output is filtered to only its allowed categories, preventing the LLM from emitting cards outside the expected set.
- **Deduplication**: Merged results are deduplicated by `term.toLowerCase()`.
- **Retry + fallback**: Each category call has independent retry (2 attempts), reduced schema fallback, and fallback model support. A failed category returns empty and logs a warning rather than failing the entire extraction.
- **Sub-progress**: Reports per-category progress (0/4 through 3/4).
- **Backward-compatible**: `extractLoreCards` gains optional `onProgress`, `progressStep`, `progressTotalSteps` params.

Removed: `loreExtractionSchema` (monolithic min(20).max(60) schema).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing GenerationProgress sub-fields and reportSubProgress helper**
- **Found during:** Task 1 (pre-execution read)
- **Issue:** Plan depends on 34-01 which adds `subStep/subTotal/subLabel` to GenerationProgress and `reportSubProgress` to prompt-utils.ts, but 34-01's commits weren't in this worktree yet (parallel execution).
- **Fix:** Added the 3 optional fields to GenerationProgress in types.ts and added `reportSubProgress` function to prompt-utils.ts inline.
- **Files modified:** backend/src/worldgen/types.ts, backend/src/worldgen/scaffold-steps/prompt-utils.ts
- **Commit:** 28a1031 (included in Task 1 commit)

## Commits

| # | Hash | Message |
|---|------|---------|
| 1 | 28a1031 | feat(34-03): refactor npcs-step to per-entity detail calls with cross-tier accumulator |
| 2 | 9e29624 | feat(34-03): split lore-extractor into 4 category-specific calls with post-filtering and dedup |

## Known Stubs

None -- all functions are fully implemented with real LLM call paths.

## Verification

- `npm --prefix backend run typecheck` -- no errors in modified files (pre-existing hono type errors unrelated)
- All acceptance criteria verified via grep: no batch functions, per-entity loop present, name forcing confirmed, post-filtering confirmed, dedup logic present

## Self-Check: PASSED
