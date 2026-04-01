---
phase: 32-desktop-first-non-game-ui-overhaul
plan: 01
subsystem: ui
tags: [nextjs, tailwind, shadcn, sidebar, resizable, layout]
requires:
  - phase: 32-00
    provides: green baseline gate for the current Phase 29/30 worktree seams
provides:
  - shared non-game route-group shell for desktop workflows
  - shadcn-compatible sidebar, separator, and resizable primitives
  - reusable page header, inspector rail, and sticky action bar seams
affects: [32-02, 32-03, 32-04, 32-05, frontend non-game routes]
tech-stack:
  added: [react-resizable-panels]
  patterns: [route-group shell ownership, sidebar-plus-canvas layout, sticky primary actions]
key-files:
  created:
    - frontend/app/(non-game)/layout.tsx
    - frontend/components/non-game-shell/app-shell.tsx
    - frontend/components/non-game-shell/app-sidebar.tsx
    - frontend/components/non-game-shell/page-header.tsx
    - frontend/components/non-game-shell/inspector-rail.tsx
    - frontend/components/non-game-shell/sticky-action-bar.tsx
    - frontend/components/ui/sidebar.tsx
    - frontend/components/ui/resizable.tsx
    - frontend/components/ui/separator.tsx
  modified:
    - frontend/package.json
    - package-lock.json
key-decisions:
  - "The non-game experience now owns a dedicated route-group layout instead of embedding desktop workflows inside isolated pages."
  - "Resizable shell primitives are introduced once and reused by later campaign, review, and character workspaces."
patterns-established:
  - "Desktop non-game pages compose `AppShell` plus route-local workspaces instead of hand-rolled full-page layouts."
requirements-completed: [P32-01, P32-06]
duration: 7min
completed: 2026-04-01
---

# Phase 32 Plan 01: Summary

**Shared non-game shell foundation with sidebar navigation, desktop canvas framing, inspector seams, and shadcn-compatible resizable primitives.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-01T19:26:00+03:00
- **Completed:** 2026-04-01T19:33:29+03:00
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Added the canonical `(non-game)` route-group layout that wraps desktop flows in one shared shell.
- Introduced reusable shell building blocks for sidebar navigation, page headers, inspector rails, and sticky action areas.
- Added shadcn-compatible sidebar, separator, and resizable primitives plus the required dependency seam for later workspace plans.

## Task Commits

1. **Task 1: Lock the non-game shell contract in tests before page adoption** - `c821945` (feat)
2. **Task 2: Add the required shadcn-compatible shell primitives and dependency seam** - `6a5c270` (chore)

## Files Created/Modified

- `frontend/app/(non-game)/layout.tsx` - mounts the shared non-game shell around route-group pages
- `frontend/components/non-game-shell/app-shell.tsx` - primary desktop shell composition
- `frontend/components/non-game-shell/app-sidebar.tsx` - persistent non-game navigation rail
- `frontend/components/non-game-shell/page-header.tsx` - reusable desktop page header seam
- `frontend/components/non-game-shell/inspector-rail.tsx` - right-rail framing for supporting context
- `frontend/components/non-game-shell/sticky-action-bar.tsx` - sticky footer action seam for workspaces
- `frontend/components/ui/sidebar.tsx` - shadcn-compatible sidebar primitive
- `frontend/components/ui/resizable.tsx` - resizable panel primitive backed by `react-resizable-panels`

## Decisions Made

- `react-resizable-panels` was added as the only new library because later desktop workspaces need a stable split-pane primitive.
- The shared shell stays route-group-owned so `/game` remains outside the non-game framing.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `32-02` can mount the launcher and campaign-creation flows directly into the new shell.
- The shared shell primitives are in place for settings, review, and character workspaces.

## Self-Check: PASSED

---
*Phase: 32-desktop-first-non-game-ui-overhaul*
*Completed: 2026-04-01*
