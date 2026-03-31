---
phase: 26-reusable-multi-worldbook-library-for-campaign-creation
plan: 03
subsystem: ui
tags: [react, nextjs, vitest, campaign-wizard, worldbook-library]
requires:
  - phase: 26-02
    provides: backend reusable worldbook library routes and campaign/worldgen selection contracts
provides:
  - Wizard hook state for reusable worldbook library loading, import, and ordered selection
  - Step 1 dialog UI for selecting saved worldbooks and importing new JSON files in-session
  - Frontend API helpers for listing/importing reusable worldbooks and sending selection payloads
affects: [campaign-creation, worldgen, phase-27-lore-editing]
tech-stack:
  added: []
  patterns: [backend-owned worldbook composition, reusable source collection state, TDD for wizard flows]
key-files:
  created: [frontend/components/title/__tests__/use-new-campaign-wizard.test.tsx]
  modified:
    - frontend/lib/api-types.ts
    - frontend/lib/api.ts
    - frontend/lib/types.ts
    - frontend/components/title/use-new-campaign-wizard.ts
    - frontend/components/title/new-campaign-dialog.tsx
    - frontend/components/title/__tests__/new-campaign-dialog.test.tsx
key-decisions:
  - "The wizard now tracks reusable library items plus an ordered selected source set instead of transient classified entries."
  - "Direct create no longer rebuilds ipContext in the browser; worldbookSelection is enough for backend-owned composition."
  - "Step 1 keeps upload and library selection in one surface while leaving advanced management out of scope."
patterns-established:
  - "Campaign wizard Step 1 treats selected worldbooks as the premise-optional condition."
  - "Reusable worldbook uploads validate JSON locally, then persist through the backend library import endpoint before selection."
requirements-completed: [P26-04, P26-05]
duration: 8min
completed: 2026-03-31
---

# Phase 26 Plan 03: Reusable multi-worldbook wizard summary

**Campaign creation now reuses saved worldbooks, imports new JSON sources into the shared library, and sends only reusable source selections to backend worldgen contracts.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-31T05:34:00Z
- **Completed:** 2026-03-31T05:42:20Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Replaced the wizard's single transient worldbook slot with reusable library loading, import, and ordered selection state.
- Stopped direct create and DNA suggestion flows from composing `ipContext` in the browser; both now hand selected reusable items to backend contracts.
- Redesigned Step 1 around one knowledge-source surface that combines saved library selection with same-session JSON upload.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace single-worldbook wizard state with reusable source collection state** - `ae599a7` (test), `54662db` (feat)
2. **Task 2: Redesign Step 1 UI for library selection plus upload-in-session** - `e198fb1` (test), `be8a42d` (feat)

## Files Created/Modified

- `frontend/components/title/__tests__/use-new-campaign-wizard.test.tsx` - TDD coverage for library loading, import auto-select, selected-worldbook suggestion payloads, and direct create payloads.
- `frontend/lib/api-types.ts` - Reusable worldbook frontend type export.
- `frontend/lib/api.ts` - Library list/import helpers plus selected-worldbook support in `suggestSeeds()`.
- `frontend/lib/types.ts` - Shared worldbook selection type re-export for frontend consumers.
- `frontend/components/title/use-new-campaign-wizard.ts` - Collection-based reusable worldbook state and backend-only handoff for create/DNA flows.
- `frontend/components/title/__tests__/new-campaign-dialog.test.tsx` - TDD coverage for the Step 1 library selection/upload UI.
- `frontend/components/title/new-campaign-dialog.tsx` - Knowledge-source section, selection controls, upload affordance, and selected-worldbook premise copy.

## Decisions Made

- Reused the backend `CampaignWorldbookSelection` shape on the frontend instead of inventing a second selection model.
- Kept `worldbookToIpContext()` exported only as a compatibility helper; the wizard no longer uses it.
- Kept Step 1 intentionally narrow: selection, upload, and status only, with no rename/delete/conflict tooling.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Re-exported shared worldbook selection types for frontend API contracts**
- **Found during:** Task 1 (Replace single-worldbook wizard state with reusable source collection state)
- **Issue:** Frontend API typings could not consume the backend worldbook selection contract through the existing `@/lib/types` surface.
- **Fix:** Re-exported the shared worldbook selection types from `frontend/lib/types.ts` and used them in the new API helper types.
- **Files modified:** `frontend/lib/types.ts`, `frontend/lib/api-types.ts`, `frontend/lib/api.ts`
- **Verification:** `components/title/__tests__/use-new-campaign-wizard.test.tsx` passes against the typed API surface.
- **Committed in:** `54662db`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation kept the frontend aligned with backend contracts and stayed within plan scope.

## Issues Encountered

- Running `npm --prefix frontend exec vitest ...` from the repo root in this workspace did not pick up the frontend Vitest jsdom config, so focused frontend suites were executed from `frontend/` directly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Campaign creation now exposes reusable worldbook selection end-to-end on the frontend and preserves backend-owned composition.
- Phase 27 can build on the same library-backed source model without reworking campaign creation again.

## Self-Check: PASSED

---
*Phase: 26-reusable-multi-worldbook-library-for-campaign-creation*
*Completed: 2026-03-31*
