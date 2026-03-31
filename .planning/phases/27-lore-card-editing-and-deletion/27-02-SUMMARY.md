---
phase: 27-lore-card-editing-and-deletion
plan: 02
subsystem: ui
tags: [react, nextjs, vitest, lore, world-review]
requires:
  - phase: 27-01
    provides: backend lore item PUT/DELETE routes plus stable-id edit semantics
provides:
  - frontend lore item update and delete helpers
  - per-card lore edit and delete controls in world review
  - component and API regression coverage for lore item mutations
affects: [27-03, world-review, lore]
tech-stack:
  added: []
  patterns: [server-authoritative lore refresh, per-card mutation state, narrowed edit payload with tolerant read model]
key-files:
  created: []
  modified:
    - frontend/lib/api-types.ts
    - frontend/lib/api.ts
    - frontend/lib/__tests__/api.test.ts
    - frontend/components/world-review/lore-section.tsx
    - frontend/components/world-review/__tests__/lore-section.test.tsx
key-decisions:
  - "LoreSection clears local search results before awaiting onRefresh so the parent review page remains the source of truth after mutations."
  - "LoreCardUpdateInput stays constrained to canonical categories while LoreCardItem keeps a string category to avoid breaking existing callers and fixtures."
patterns-established:
  - "Lore item mutations live in frontend/lib/api.ts and return backend error text directly to the calling UI."
  - "World-review per-card actions own only transient dialog/pending/error state and always refresh canonical data from the parent seam."
requirements-completed: [P27-06]
duration: 11min
completed: 2026-03-31
---

# Phase 27 Plan 02: Lore card editing and deletion Summary

**World-review lore cards now support per-card edit and delete flows backed by typed client helpers and server-authoritative refresh behavior**

## Performance

- **Duration:** 11 min 2 sec
- **Started:** 2026-03-31T13:28:51.9631127+03:00
- **Completed:** 2026-03-31T13:39:54.2082288+03:00
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added typed lore item update/delete helpers, including a reusable `apiPut()` seam and regression tests for payload shape and error propagation.
- Upgraded `LoreSection` from read-only cards to per-card edit/delete management with dialog-based editing, delete confirmation, per-card pending state, and visible mutation errors.
- Locked the world-review behavior with targeted UI tests covering edit, delete, search overlay clearing, pending scope, and failure visibility.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add lore item client helpers and frontend typing** - `241650b` (test), `1b39775` (feat)
2. **Task 2: Build per-card edit/delete UX in LoreSection** - `5ebd866` (test), `3f41651` (feat)

_Note: Both tasks followed TDD with separate red and green commits._

## Files Created/Modified
- `frontend/lib/api-types.ts` - Added canonical lore edit payload/category types while keeping lore item reads tolerant.
- `frontend/lib/api.ts` - Added `apiPut()`, `updateLoreCard()`, and `deleteLoreCardById()`.
- `frontend/lib/__tests__/api.test.ts` - Added API contract tests for lore item update/delete helpers.
- `frontend/components/world-review/lore-section.tsx` - Added edit dialog, delete confirmation, per-card pending/error state, and refresh-on-success behavior.
- `frontend/components/world-review/__tests__/lore-section.test.tsx` - Added component tests for edit/delete flows, search result clearing, pending scope, and failure visibility.

## Decisions Made

- Used a dialog for lore editing and an alert dialog for deletion to match existing world-review UI primitives instead of building inline card editors.
- Kept the review page authoritative for lore data and avoided optimistic cache mutation beyond local dialog/pending/error state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Preserved tolerant lore item reads while constraining edit payloads**
- **Found during:** Task 2 (Build per-card edit/delete UX in LoreSection)
- **Issue:** Narrowing `LoreCardItem.category` to canonical values broke existing fixtures and unrelated callers that still surface arbitrary category strings.
- **Fix:** Kept `LoreCardItem.category` as `string`, added category normalization inside `LoreSection`, and left `LoreCardUpdateInput` constrained to canonical editable categories.
- **Files modified:** `frontend/lib/api-types.ts`, `frontend/components/world-review/lore-section.tsx`
- **Verification:** `npm exec vitest run lib/__tests__/api.test.ts components/world-review/__tests__/lore-section.test.tsx`; filtered `npx tsc --noEmit` reported `NO_PLAN_FILE_ERRORS`
- **Committed in:** `3f41651`

**2. [Rule 3 - Blocking] Added jsdom polyfills needed for Radix Select component tests**
- **Found during:** Task 2 (Build per-card edit/delete UX in LoreSection)
- **Issue:** The edit dialog category select could not run in Vitest/jsdom because pointer-capture and `scrollIntoView()` APIs used by Radix Select are missing by default.
- **Fix:** Added lightweight pointer-capture and `scrollIntoView()` polyfills in the lore section test setup.
- **Files modified:** `frontend/components/world-review/__tests__/lore-section.test.tsx`
- **Verification:** `npm exec vitest run components/world-review/__tests__/lore-section.test.tsx`
- **Committed in:** `5ebd866`

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Both fixes were required to complete the planned UI work and verification without changing scope or runtime behavior.

## Issues Encountered

- Frontend Vitest and ESLint commands needed to run from `frontend/` because repo-root invocation breaks alias resolution and file-pattern matching for this package.
- Full `npx tsc --noEmit` still fails on pre-existing nullability errors outside this plan in `frontend/app/character-creation/page.tsx` and `frontend/app/world-review/page.tsx`. Plan files were checked separately and reported `NO_PLAN_FILE_ERRORS`.
- Radix Select still emits React `act(...)` warnings under Vitest/jsdom even though the lore-section tests pass.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 27-03 can use the new frontend item helpers and world-review actions for end-to-end regression and smoke verification.
- Remaining frontend typecheck failures are pre-existing and outside the files touched by this plan.

## Self-Check: PASSED

---
*Phase: 27-lore-card-editing-and-deletion*
*Completed: 2026-03-31*
