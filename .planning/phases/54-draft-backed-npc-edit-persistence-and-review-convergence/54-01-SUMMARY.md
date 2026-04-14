---
phase: 54-draft-backed-npc-edit-persistence-and-review-convergence
plan: 01
subsystem: backend
tags: [worldgen, npc, draft, persistence, vitest]
requires:
  - phase: 54-draft-backed-npc-edit-persistence-and-review-convergence
    provides: backend draft/save/load convergence for draft-backed NPC edits
provides:
  - Reconciled draft-backed NPC save path
  - Save/load/world-payload regression coverage
  - Route-safe fallback against stale draft overwrites
affects: [worldgen save-edits, scaffold persistence, world route reload]
tech-stack:
  added: []
  patterns: [single authoritative draft lane, bounded reconciliation helper, route-to-persistence proof]
key-files:
  created:
    - .planning/phases/54-draft-backed-npc-edit-persistence-and-review-convergence/54-01-SUMMARY.md
  modified:
    - backend/src/character/record-adapters.ts
    - backend/src/routes/worldgen.ts
    - backend/src/worldgen/scaffold-saver.ts
    - backend/src/routes/__tests__/worldgen.test.ts
    - backend/src/routes/__tests__/campaigns.test.ts
    - backend/src/worldgen/__tests__/scaffold-saver.test.ts
key-decisions:
  - "fromLegacyScaffoldNpc remains untouched as the broad high-risk legacy adapter; draft-backed save repair happens through reconcileDraftBackedScaffoldNpc."
  - "Both route normalization and saveScaffoldToDb now reconcile draft-backed NPCs so stale draft cannot survive via either entry path."
  - "Supporting review-tier stays supporting inside CharacterDraft/CharacterRecord, while the DB row compatibility tier remains persistent."
patterns-established:
  - "Editable shallow NPC fields are merged back into the authoritative draft lane before persistence instead of competing with it."
  - "Regression fixtures now prove route parse, scaffold persistence, and /api/campaigns/:id/world reload as one round-trip."
requirements-completed: [UX-02]
completed: 2026-04-13
---

# Phase 54 Plan 01: Backend Draft Convergence Summary

## Accomplishments

- Fixed `normalizeSavedScaffold()` so draft-backed NPCs are normalized through the shared reconciliation helper instead of carrying malformed or stale draft truth forward.
- Fixed `saveScaffoldToDb()` so direct scaffold persistence also reconciles draft-backed NPCs before deriving `characterRecord`, `draft`, and compatibility `npc`.
- Corrected the draft reconciliation tier mapping so `supporting` stays `supporting` in the shared draft/record lane.
- Added and greened backend regressions for the audited save/load/world-payload round-trip bug.
- Captured the GitNexus risk picture before edits:
  - `normalizeSavedScaffold`: `LOW`
  - `saveScaffoldToDb`: `LOW`
  - `fromLegacyScaffoldNpc`: `HIGH`

## Verification

- `npm --prefix backend exec vitest run src/routes/__tests__/worldgen.test.ts src/worldgen/__tests__/scaffold-saver.test.ts src/routes/__tests__/campaigns.test.ts`
  - `81/81` passed

## Notes

- The repair stayed additive. No second editable NPC model was introduced.
- `fromLegacyScaffoldNpc` was intentionally left as-is because its blast radius remains broad.
