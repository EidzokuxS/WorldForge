---
phase: 38-authoritative-inventory-equipment-state
plan: 03
subsystem: ui
tags: [react, nextjs, vitest, inventory, api-contract]
requires:
  - phase: 38-02
    provides: backend authoritative inventory resolver and world payload compatibility projections
provides:
  - frontend parser support for structured authoritative player inventory/equipment rows
  - /game rendering that consumes authoritative carried and equipped arrays directly
  - character panel props aligned to explicit carried/equipped item collections
affects: [phase-38, gameplay-ui, world-payload]
tech-stack:
  added: []
  patterns: [backend-emitted structured world payload rows, single-source gameplay inventory rendering]
key-files:
  created: [frontend/lib/__tests__/api.inventory-authority.test.ts]
  modified:
    [
      frontend/lib/api-types.ts,
      frontend/lib/api.ts,
      frontend/app/game/page.tsx,
      frontend/components/game/character-panel.tsx,
      frontend/app/game/__tests__/page.test.tsx,
      frontend/components/game/__tests__/character-panel.test.tsx,
      backend/src/routes/campaigns.ts,
      backend/src/routes/__tests__/campaigns.inventory-authority.test.ts,
    ]
key-decisions:
  - "The frontend now treats `player.inventory` and `player.equipment` as the authoritative UI contract; legacy string arrays remain compatibility-only."
  - "A Rule 3 blocker fix extended `/api/campaigns/:id/world` to emit structured authoritative item rows because frontend-only parsing could not satisfy the plan."
patterns-established:
  - "World payloads expose player-scoped authoritative item rows with equip metadata, not only legacy name arrays."
  - "Gameplay UI passes explicit carried/equipped collections into panels instead of reconstructing inventory authority from `world.items`."
requirements-completed: [RINT-04]
duration: 8min
completed: 2026-04-12
---

# Phase 38 Plan 03: Authoritative Frontend Inventory Summary

**Structured authoritative player inventory/equipment rows now flow from `/world` into `/game` and `CharacterPanel` without client-side reconstruction from legacy fields**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-12T05:42:03Z
- **Completed:** 2026-04-12T05:50:23Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Added frontend parser coverage for structured authoritative inventory/equipment rows and proved the old mixed-authority model failed red.
- Rewired `/game` to consume `player.inventory` and `player.equipment` directly instead of filtering `world.items` for player authority.
- Updated `CharacterPanel` to render explicit carried/equipped collections and added the backend world payload rows required for that contract.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock frontend parsing and rendering against the authoritative world contract** - `15d13e3` (`test`)
2. **Task 2: Rewire frontend world parsing and `/game` rendering to authoritative inventory/equipment payloads** - `fbfcc96` (`feat`)

## Files Created/Modified
- `frontend/lib/__tests__/api.inventory-authority.test.ts` - Locks parser expectations around authoritative player inventory/equipment arrays.
- `frontend/lib/api-types.ts` - Adds structured player inventory/equipment item types to the world contract.
- `frontend/lib/api.ts` - Parses authoritative player inventory/equipment rows from `/world`.
- `frontend/app/game/page.tsx` - Passes authoritative carried/equipped collections into `CharacterPanel`.
- `frontend/components/game/character-panel.tsx` - Renders explicit equipped and carried item collections with empty states.
- `frontend/app/game/__tests__/page.test.tsx` - Proves `/game` no longer derives player inventory authority from top-level `world.items`.
- `frontend/components/game/__tests__/character-panel.test.tsx` - Covers the new panel prop contract and empty-state behavior.
- `backend/src/routes/campaigns.ts` - Emits structured authoritative player inventory/equipment rows in the world payload.
- `backend/src/routes/__tests__/campaigns.inventory-authority.test.ts` - Verifies the backend world payload exposes the new structured rows.

## Decisions Made
- `player.inventory` and `player.equipment` are now the authoritative frontend-facing arrays for carried and equipped state; `player.equippedItems` remains transitional compatibility only.
- `CharacterPanel` now receives explicit `carriedItems` and `equippedItems` props so UI authority stays aligned with one parsed payload contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended the backend `/world` payload with structured authoritative item rows**
- **Found during:** Task 2 (Rewire frontend world parsing and `/game` rendering to authoritative inventory/equipment payloads)
- **Issue:** The backend still emitted only legacy name arrays, which was insufficient for a frontend-only implementation of authoritative carried/equipped rendering.
- **Fix:** Added structured `player.inventory` and `player.equipment` rows in `backend/src/routes/campaigns.ts` and updated the existing backend route test.
- **Files modified:** `backend/src/routes/campaigns.ts`, `backend/src/routes/__tests__/campaigns.inventory-authority.test.ts`
- **Verification:** `npm --prefix backend exec vitest run src/routes/__tests__/campaigns.inventory-authority.test.ts`
- **Committed in:** `fbfcc96`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation was required for correctness. It kept the plan on the same authority seam and avoided a fake frontend-only contract.

## Issues Encountered
- A transient `.git/index.lock` was left behind during parallel staging; it was removed and staging was retried sequentially before the Task 2 commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 38 now has backend and frontend alignment on authoritative inventory/equipment rendering, satisfying `RINT-04`.
- The remaining work is planning metadata finalization and roadmap/state advancement only.

## Self-Check: PASSED
- Found `.planning/phases/38-authoritative-inventory-equipment-state/38-03-SUMMARY.md`.
- Verified task commits `15d13e3` and `fbfcc96` exist in git history.
