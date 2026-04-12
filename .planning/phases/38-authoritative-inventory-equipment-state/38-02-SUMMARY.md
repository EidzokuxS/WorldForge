---
phase: 38-authoritative-inventory-equipment-state
plan: 02
subsystem: api
tags: [inventory, equipment, sqlite, prompt, authoritative-state]
requires:
  - phase: 38-01
    provides: item-row equip metadata, legacy backfill, shared authoritative inventory resolver
provides:
  - live `transfer_item` carry/equip/drop semantics on authoritative item rows
  - prompt and `/world` reads sourced from `loadAuthoritativeInventoryView()`
  - transitional compatibility projection derived one-way from authoritative items
affects: [38-03, frontend inventory UI, gameplay prompts, world payloads]
tech-stack:
  added: []
  patterns:
    - shared backend inventory authority resolver
    - one-way legacy compatibility projection
    - TDD for writer and reader convergence
key-files:
  created:
    - backend/src/engine/__tests__/tool-schemas.inventory-authority.test.ts
    - backend/src/engine/__tests__/turn-processor.inventory-authority.test.ts
    - backend/src/engine/__tests__/prompt-assembler.inventory-authority.test.ts
    - backend/src/routes/__tests__/campaigns.inventory-authority.test.ts
  modified:
    - backend/src/inventory/authority.ts
    - backend/src/engine/tool-schemas.ts
    - backend/src/engine/tool-executor.ts
    - backend/src/character/record-adapters.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/routes/campaigns.ts
    - backend/src/engine/__tests__/tool-executor.test.ts
    - backend/src/character/__tests__/record-adapters.test.ts
key-decisions:
  - "Kept `transfer_item` as the only storyteller item-state mutation tool and extended it with optional `equipState` plus `equippedSlot` for character targets."
  - "Removed post-start prompt/world fallback to legacy loadout arrays by sourcing carried, equipped, and signature views from `loadAuthoritativeInventoryView()`."
  - "Preserved temporary `equippedItems` compatibility output only as a derived projection from authoritative item rows."
patterns-established:
  - "Pattern 1: Runtime writes mutate one item row contract (`ownerId`, `locationId`, `equipState`, `equippedSlot`, `isSignature`) instead of dual-writing legacy lists."
  - "Pattern 2: Backend readers consume authoritative inventory via `loadAuthoritativeInventoryView()` and only project legacy arrays at the boundary."
requirements-completed: [RINT-04]
duration: 7min
completed: 2026-04-12
---

# Phase 38 Plan 02: Backend Authority Convergence Summary

**Authoritative item-row equip semantics now drive storyteller mutations, prompt inventory text, `/world` player payloads, and transitional compatibility projections**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-12T08:30:29+03:00
- **Completed:** 2026-04-12T08:37:45+03:00
- **Tasks:** 3
- **Files modified:** 13

## Accomplishments
- Extended `transfer_item` so pickup, equip, unequip, and drop all mutate authoritative item rows without introducing new tool names.
- Materialized explicit default item metadata for `spawn_item` and proved live runtime reachability through `processTurn()`.
- Rewired prompt assembly, `/api/campaigns/:id/world`, and player compatibility projections to derive inventory/equipment from the shared authority resolver.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock `transfer_item` runtime reachability and authoritative mutation semantics** - `7333e9e`, `66e6168` (test, feat)
2. **Task 2: Lock backend reader convergence on the authoritative inventory seam** - `998825f`, `7db10ae` (test, feat)
3. **Task 3: Rewire runtime writes, prompt reads, and compatibility outputs to authoritative items only** - `1776be2` (chore)

## Files Created/Modified
- `backend/src/inventory/authority.ts` - shared defaults and transfer-state helpers for authoritative item metadata
- `backend/src/engine/tool-schemas.ts` - storyteller-facing `transfer_item` schema with structured carry/equip semantics
- `backend/src/engine/tool-executor.ts` - authoritative `transfer_item` and `spawn_item` writes
- `backend/src/character/record-adapters.ts` - one-way legacy player compatibility projection from authoritative inventory
- `backend/src/engine/prompt-assembler.ts` - player and NPC prompt inventory/equipment reads via `loadAuthoritativeInventoryView()`
- `backend/src/routes/campaigns.ts` - `/world` player inventory/equipment arrays derived from authoritative items
- `backend/src/engine/__tests__/tool-schemas.inventory-authority.test.ts` - tool-schema regression for locked `transfer_item` direction
- `backend/src/engine/__tests__/tool-executor.test.ts` - authoritative pickup/drop/equip/unequip and spawn defaults coverage
- `backend/src/engine/__tests__/turn-processor.inventory-authority.test.ts` - live storyteller reachability proof
- `backend/src/engine/__tests__/prompt-assembler.inventory-authority.test.ts` - prompt authority regressions for player and NPC equipment
- `backend/src/routes/__tests__/campaigns.inventory-authority.test.ts` - `/world` authority payload regression
- `backend/src/character/__tests__/record-adapters.test.ts` - compatibility projection regression against stale loadout data

## Decisions Made

- `transfer_item` stayed as the single mutation seam for item-state changes; equip intent is expressed with optional structured arguments, not new tool names.
- Player-facing world payloads now carry `inventoryItems`, `equippedItems`, and `signatureItems` arrays derived from authoritative rows while top-level `items` remains available for scene rendering.
- Transitional legacy compatibility remains allowed only at projection boundaries, never as a live read source.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The new RED/GREEN test harness initially resolved Drizzle tables through the wrong metadata field. The fix was to use `Symbol.for("drizzle:Name")` in mutable DB stubs so test behavior matched real query targets.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend authority contract is ready for Phase `38-03` frontend parsing and rendering work.
- The targeted backend suite now proves writer and reader convergence on one item-row authority seam.

## Self-Check: PASSED

- Verified summary file exists at `.planning/phases/38-authoritative-inventory-equipment-state/38-02-SUMMARY.md`.
- Verified task commits exist: `7333e9e`, `66e6168`, `998825f`, `7db10ae`, `1776be2`.

---
*Phase: 38-authoritative-inventory-equipment-state*
*Completed: 2026-04-12*
