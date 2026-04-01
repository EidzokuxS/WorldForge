---
phase: 32-desktop-first-non-game-ui-overhaul
plan: 02
subsystem: ui
tags: [nextjs, tailwind, workspace, campaign-creation, routing]
requires:
  - phase: 32-01
    provides: shared non-game shell and route-group layout
provides:
  - shell-owned launcher at `/`
  - canonical `/campaign/new` workspace for concept entry
  - canonical `/campaign/new/dna` workspace for DNA authoring
affects: [campaign creation flow, 32-03, 32-04, 32-05]
tech-stack:
  added: []
  patterns: [route-per-step creation flow, workspace container components, shell-first page ownership]
key-files:
  created:
    - frontend/app/(non-game)/page.tsx
    - frontend/app/(non-game)/campaign/new/layout.tsx
    - frontend/app/(non-game)/campaign/new/page.tsx
    - frontend/app/(non-game)/campaign/new/dna/page.tsx
    - frontend/components/campaign-new/concept-workspace.tsx
    - frontend/components/campaign-new/dna-workspace.tsx
    - frontend/components/campaign-new/flow-provider.tsx
  modified:
    - frontend/app/page.tsx
key-decisions:
  - "Campaign creation now advances through shell-owned routes instead of a modal-first landing surface."
  - "Existing wizard logic is preserved behind route-local workspace wrappers instead of being rewritten."
patterns-established:
  - "Large creation flows use dedicated route steps under `(non-game)` and keep state in shared providers."
requirements-completed: [P32-02, P32-06]
duration: 3min
completed: 2026-04-01
---

# Phase 32 Plan 02: Summary

**Launcher, concept entry, and DNA authoring now route through shell-owned desktop workspaces instead of the old modal-first root page.**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-01T19:33:29+03:00
- **Completed:** 2026-04-01T19:36:51+03:00
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- Moved the launcher to the shared non-game shell and gave campaign creation a clearer desktop entry point.
- Split concept and DNA authoring into canonical `/campaign/new` and `/campaign/new/dna` routes.
- Preserved the existing creation flow seam via a shared flow provider instead of introducing a second wizard model.

## Task Commits

1. **Plans 32-02 Tasks 1-3** - `bf08abb` (feat)

## Files Created/Modified

- `frontend/app/(non-game)/page.tsx` - shell-owned launcher page
- `frontend/app/(non-game)/campaign/new/page.tsx` - concept-entry workspace route
- `frontend/app/(non-game)/campaign/new/dna/page.tsx` - DNA authoring workspace route
- `frontend/components/campaign-new/concept-workspace.tsx` - desktop concept-entry layout
- `frontend/components/campaign-new/dna-workspace.tsx` - desktop DNA workspace layout
- `frontend/components/campaign-new/flow-provider.tsx` - shared state seam across routed creation steps
- `frontend/app/page.tsx` - removed old root-page implementation in favor of the shell route

## Decisions Made

- Route ownership now mirrors the creation flow stages so future browser verification can target stable URLs.
- The existing creation state model was retained to avoid cross-phase regressions in Phases 29-31 seams.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `32-03` can reuse the shell layout without modifying creation-state plumbing.
- The campaign-creation entry flow is ready for desktop E2E validation in Phase 33.

## Self-Check: PASSED

---
*Phase: 32-desktop-first-non-game-ui-overhaul*
*Completed: 2026-04-01*
