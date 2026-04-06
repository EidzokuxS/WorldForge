---
phase: quick
plan: 260404-e0m
subsystem: worldgen
tags: [worldbook, composition, prompt-engineering, multi-source]
dependency_graph:
  requires: []
  provides: [source-grouped-ipcontext, priority-aware-prompt-rendering]
  affects: [scaffold-generation, worldgen-prompts]
tech_stack:
  added: []
  patterns: [source-priority-detection, premise-relevance-scoring, entry-capping]
key_files:
  created: []
  modified:
    - shared/src/types.ts
    - backend/src/worldbook-library/composition.ts
    - backend/src/worldgen/worldbook-importer.ts
    - backend/src/worldgen/scaffold-steps/prompt-utils.ts
    - backend/src/worldgen/__tests__/worldbook-composition.test.ts
    - backend/src/routes/worldgen.ts
decisions:
  - "Source priority derived from premise text parsing, not UI selection (backend-only fix)"
  - "Supplementary cap at 15 entries with premise-relevance scoring for selection"
  - "Single-source paths unchanged — sourceGroups always present but flat format used for 1 group"
metrics:
  duration: "~10 minutes"
  completed: "2026-04-04"
  tasks_completed: 2
  tasks_total: 2
---

# Quick Plan 260404-e0m: Fix Lorebook Over-Influence in Worldgen Summary

Source-grouped worldbook composition with premise-based priority detection and capped supplementary entries to prevent large worldbooks from overwhelming small primary sources in multi-worldbook campaigns.

## What Changed

### Task 1: Source-tagged composition and capped supplementary entries
**Commit:** `ded9764`

- Added `IpResearchContext.sourceGroups` optional field in shared types — per-source keyFacts, canonicalNames, and priority label
- Extracted `extractSourceData()` helper from `worldbookToIpContext()` for reuse by composition
- Updated `composeWorldbookLibraryRecords()` to accept optional `premise` parameter, detect primary source from premise text (patterns: "mainly X", "primarily X", "based on X"), and build per-source groups
- Supplementary sources capped at 15 entries using premise-relevance word-overlap scoring
- Updated `composeSelectedWorldbooks()` to pass premise through
- Updated both call sites in `backend/src/routes/worldgen.ts` to pass premise
- Added 5 new tests covering: single-source backward compat, two-source priority detection, 60-entry supplementary capping, no-premise fallback, canonical name merging

### Task 2: Priority-aware prompt rendering in buildIpContextBlock
**Commit:** `fc6f6e7`

- Refactored `buildIpContextBlock()` into flat vs grouped renderers
- When `sourceGroups` has multiple groups: renders PRIMARY sources as "ground truth" and SUPPLEMENTARY as "background flavor material" with explicit "Do NOT let supplementary content dominate" instruction
- When single source or no sourceGroups: renders identical flat format (zero behavioral change)
- Added 3 new priority-aware fidelity rules prepended to the existing 8 rules

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- All 8 composition tests pass (3 existing + 5 new)
- Backend typecheck: 86 errors (all pre-existing, zero new errors introduced)
- No frontend changes required

## Known Stubs

None.

## Self-Check: PASSED
