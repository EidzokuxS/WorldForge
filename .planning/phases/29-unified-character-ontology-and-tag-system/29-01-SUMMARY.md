---
phase: 29-unified-character-ontology-and-tag-system
plan: 01
status: completed
---

# Phase 29 Plan 01 Summary

Canonical character storage and adapter seams were added for players and NPCs, with derived runtime tags treated as a cache instead of the source of truth.

## Completed Work

- Added shared canonical character draft/record types in `shared/src/types.ts` and re-exported them from `shared/src/index.ts`.
- Added backend adapters in `backend/src/character/record-adapters.ts` plus centralized runtime tag derivation in `backend/src/character/runtime-tags.ts`.
- Extended DB storage with `character_record` and `derived_tags` columns for `players` and `npcs`.
- Updated route schemas to accept canonical draft payloads while preserving legacy compatibility input/output shapes.
- Generated Drizzle migration `backend/drizzle/0004_illegal_hitman.sql`.

## Verification

- `npm --prefix backend exec vitest run src/character/__tests__/record-adapters.test.ts`
  Result: passed, 3 tests.
- `npm --prefix backend exec vitest run src/routes/__tests__/schemas.test.ts`
  Result: passed, 174 tests.
- `npm --prefix backend exec vitest run src/character/__tests__/record-adapters.test.ts src/routes/__tests__/schemas.test.ts`
  Result: passed, 177 tests.

## Commits

- `2f0e55b` `test(29-01): add failing test for canonical record adapters`
- `f55cc2b` `feat(29-01): add canonical character adapters`
- `ebaded9` `test(29-01): add failing schema coverage for canonical character seams`
- `f3d5a49` `feat(29-01): add canonical character storage seam`

## Deviations

- None beyond the planned additive compatibility seam.
