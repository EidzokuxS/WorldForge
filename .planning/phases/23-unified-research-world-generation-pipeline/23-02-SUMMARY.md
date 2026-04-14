---
phase: 23-unified-research-world-generation-pipeline
plan: 02
subsystem: worldgen
tags: [research-sufficiency, targeted-search, scaffold-generator, known-ip]

requires:
  - phase: 23-unified-research-world-generation-pipeline (plan 01)
    provides: cached `ipContext` available to world generation
provides:
  - Research sufficiency evaluation before locations/factions/NPCs generation
  - Targeted search enrichment instead of full duplicate franchise research
  - Enriched `ipContext` written back to campaign cache after generation
affects: [worldgen-pipeline, known-ip-generation, regeneration]

tech-stack:
  added: []
  patterns: [step-specific-sufficiency-check, targeted-gap-search, enriched-cache-writeback]

key-files:
  modified:
    - backend/src/worldgen/ip-researcher.ts
    - backend/src/worldgen/scaffold-generator.ts
    - backend/src/routes/worldgen.ts
    - backend/src/worldgen/ip-context-overrides.ts
    - backend/src/routes/__tests__/worldgen.test.ts

key-decisions:
  - "Sufficiency is evaluated per scaffold step (locations, factions, npcs) instead of a second full research pass"
  - "Gap-filling searches are capped and targeted by missingTopics, not open-ended"
  - "Enriched keyFacts are saved back to config only when the fact set actually grows"

patterns-established:
  - "Check-before-generate pattern for known-IP substeps"
  - "Research enrichment compounds over time through config cache writeback"

requirements-completed: [23-02]

duration: retroactive-closeout
completed: 2026-03-30
---

# Phase 23 Plan 02: Research Sufficiency Check Before Scaffold Steps Summary

**Retroactive closeout during planning reconciliation.**

## Accomplishments

- Added `evaluateResearchSufficiency()` to assess whether cached research is enough for each major scaffold step.
- `generateWorldScaffold()` now runs sufficiency checks before `locations`, `factions`, and `npcs`.
- When research is insufficient, the pipeline performs targeted web searches, extracts additional canonical facts, and merges them into `ipContext`.
- The generate route writes enriched `ipContext` back to campaign config when new facts are discovered.

## Evidence

- `backend/src/worldgen/ip-researcher.ts` exports `evaluateResearchSufficiency()`.
- `backend/src/worldgen/scaffold-generator.ts` calls sufficiency checks before the three step generators.
- `backend/src/routes/worldgen.ts` persists enriched `ipContext` after scaffold generation when fact count increases.

## Verification

- `npm --prefix backend exec vitest run src/routes/__tests__/worldgen.test.ts`
- `npm run typecheck`

## Notes

- This phase intentionally keeps an on-demand research fallback in `/generate` when no cached `ipContext` exists at all. That is a resilience path for “skip DNA and generate immediately”, not a duplicate-research regression in the normal cached flow.
