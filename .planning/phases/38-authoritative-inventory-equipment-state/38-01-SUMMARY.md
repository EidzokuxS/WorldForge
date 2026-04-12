---
phase: 38-authoritative-inventory-equipment-state
plan: 01
subsystem: database
tags: [sqlite, drizzle, inventory, migration, checkpoints]
requires:
  - phase: 36-gameplay-docs-to-runtime-reconciliation-audit
    provides: inventory/equipment authority baseline and contradiction targets
  - phase: 41-checkpoint-complete-simulation-restore
    provides: restore-bundle reopen seams that now rerun inventory authority
provides:
  - explicit item-row equipment metadata on `items`
  - shared backend authority helpers for authoritative inventory views
  - idempotent `loadCampaign()` backfill for legacy inventory/equipment state
  - regression coverage for save-character seeding and reopen seams
affects: [38-02, 38-03, retry, undo, checkpoints, prompts, world payloads]
tech-stack:
  added: []
  patterns: [authoritative item-row state, load-time legacy migration, one-way compatibility projection]
key-files:
  created:
    - backend/src/inventory/authority.ts
    - backend/src/inventory/index.ts
    - backend/src/inventory/legacy-migration.ts
    - backend/src/inventory/__tests__/inventory-authority.test.ts
    - backend/src/routes/__tests__/chat.inventory-authority.test.ts
    - backend/drizzle/0007_spooky_warlock.sql
  modified:
    - backend/src/db/schema.ts
    - backend/src/routes/character.ts
    - backend/src/campaign/manager.ts
    - backend/drizzle/meta/_journal.json
    - backend/drizzle/meta/0007_snapshot.json
key-decisions:
  - "The minimum authoritative contract lives directly on `items` as `equipState`, nullable `equippedSlot`, and boolean `isSignature`."
  - "Legacy campaigns are upgraded inside `loadCampaign()` and restore flows inherit that seam by reopening through `loadCampaign()`."
  - "Legacy `characterRecord.loadout` and `players.equippedItems` survive only as one-way compatibility projections rewritten from authoritative items."
patterns-established:
  - "Authoritative inventory helpers derive carried, equipped, and signature projections from item rows only."
  - "Load-time migration backfills missing authoritative rows without duplicating existing items and fails closed on contradictory legacy sources."
requirements-completed: [RINT-04]
duration: 9min
completed: 2026-04-12
---

# Phase 38 Plan 01: Authoritative Inventory & Equipment State Summary

**Explicit item-row equipment metadata with load-time legacy backfill and restore-safe inventory authority seeding**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-12T05:13:00Z
- **Completed:** 2026-04-12T05:22:31Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Added the minimum queryable equipment contract to `items` and generated the matching Drizzle migration.
- Seeded fresh canonical loadouts onto authoritative item rows with explicit carried/equipped/signature metadata.
- Added a shared inventory authority module and an idempotent `loadCampaign()` migration that backfills legacy saves, rewrites compatibility projections, and fails closed on contradictory legacy sources.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock authoritative item-row and legacy-migration regressions** - `507755f` (test)
2. **Task 2: Implement item-row authority, structured equipment metadata, and fail-closed backfill** - `75fc0cd` (feat)

**Plan metadata:** pending

## Files Created/Modified
- `backend/src/db/schema.ts` - adds explicit equip-state/signature columns to `items`
- `backend/src/inventory/authority.ts` - shared item-row authority helpers and compatibility view derivation
- `backend/src/inventory/legacy-migration.ts` - idempotent legacy backfill and projection rewrite on campaign load
- `backend/src/routes/character.ts` - seeds authoritative item metadata from canonical loadout slots
- `backend/src/campaign/manager.ts` - reruns the inventory authority seam on every campaign reopen
- `backend/src/inventory/__tests__/inventory-authority.test.ts` - locks schema, seeding, idempotence, and fail-closed migration behavior
- `backend/src/routes/__tests__/chat.inventory-authority.test.ts` - proves retry/undo reopen flows pass through the same restore seam
- `backend/drizzle/0007_spooky_warlock.sql` - migration for the new `items` columns

## Decisions Made

- Equipment truth is now encoded on `items` rows instead of inferred from tags or parallel character arrays because downstream readers need discrete queryable fields.
- `loadCampaign()` owns legacy reconciliation so checkpoint, retry, and undo restore flows inherit the same authority seam automatically through existing reopen behavior.
- Compatibility projections remain updated for now instead of being deleted immediately, which keeps current readers stable until Plans `38-02` and `38-03` switch them over fully.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Generated a Drizzle migration for the new item-row contract**
- **Found during:** Task 2 (Implement item-row authority, structured equipment metadata, and fail-closed backfill)
- **Issue:** Updating `schema.ts` alone left `runMigrations()` unable to create the new columns in fresh or restored SQLite databases.
- **Fix:** Generated `backend/drizzle/0007_spooky_warlock.sql` plus updated Drizzle metadata snapshots.
- **Files modified:** `backend/drizzle/0007_spooky_warlock.sql`, `backend/drizzle/meta/0007_snapshot.json`, `backend/drizzle/meta/_journal.json`
- **Verification:** Targeted Phase 38 authority tests passed against `runMigrations()`-created databases.
- **Committed in:** `75fc0cd`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for correctness. No scope creep beyond making the planned schema contract actually migratable.

## Issues Encountered

- Backend-wide `npm --prefix backend run typecheck` still fails in pre-existing unrelated files under `src/ai/__tests__`, `src/engine/location-events.ts`, `src/engine/target-context.ts`, and `src/routes/worldgen.ts`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend now has a real inventory authority seam for Plans `38-02` and `38-03` to consume.
- Existing prompt/world/frontend readers can be rewired next without inventing schema semantics.

## Self-Check: PASSED

- Verified `.planning/phases/38-authoritative-inventory-equipment-state/38-01-SUMMARY.md` exists.
- Verified task commits `507755f` and `75fc0cd` exist in git history.
