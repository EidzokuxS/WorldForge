---
phase: 33-browser-e2e-verification-for-redesigned-creation-flows
plan: 05
subsystem: ui
tags: [nextjs, tailwind, vitest, non-game-shell]
requires:
  - phase: 32-desktop-first-non-game-ui-overhaul
    provides: Shared non-game route shell and launcher/review/character workspaces that this plan hardens visually
provides:
  - Shared non-game shell token contract in `frontend/app/globals.css`
  - Reusable shell frame, rail, panel, and action-tray primitives for non-game routes
  - Regression coverage for shell-region hooks across launcher, review, and character workspaces
affects: [phase-33-gap-closure, launcher, world-review, character-creation]
tech-stack:
  added: []
  patterns:
    - CSS custom properties govern non-game shell geometry and surfaces
    - `data-shell-region` and `data-shell-surface` hooks define the shell contract for regressions
key-files:
  created:
    - frontend/components/non-game-shell/shell-primitives.tsx
  modified:
    - frontend/app/globals.css
    - frontend/components/non-game-shell/app-shell.tsx
    - frontend/components/non-game-shell/app-sidebar.tsx
    - frontend/components/ui/sidebar.tsx
    - frontend/app/(non-game)/page.tsx
    - frontend/components/world-review/review-workspace.tsx
    - frontend/components/character-creation/character-workspace.tsx
    - frontend/components/non-game-shell/__tests__/app-shell.test.tsx
    - frontend/app/(non-game)/__tests__/page.test.tsx
    - frontend/app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx
    - frontend/app/(non-game)/campaign/[id]/character/__tests__/page.test.tsx
key-decisions:
  - "Non-game shell visuals now flow through shell-specific CSS variables instead of generic card/sidebar theme buckets."
  - "Shared shell regressions assert `data-shell-region` and `data-shell-surface` hooks so page tests pin the contract without depending on one-off class strings."
patterns-established:
  - "Shell primitive layer: `ShellFrame`, `ShellNavigationRail`, `ShellMainPanel`, `ShellPanel`, `ShellRail`, and `ShellActionTray` own radius, border, and surface treatment."
  - "Workspace wrappers consume shared shell primitives while route pages keep ownership of business logic and content slots."
requirements-completed: [P33-01, P33-04]
duration: 7 min
completed: 2026-04-01
---

# Phase 33 Plan 05: Unify Shell Tokens And Shared Non-Game Workspace Primitives Summary

**Dedicated shell tokens and reusable frame or panel primitives now govern the launcher, shell chrome, review workspace, and character workspace.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-01T22:03:45Z
- **Completed:** 2026-04-01T22:10:59Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Added focused Vitest regressions that describe the UAT Gap 1 shell contract through shared shell-region hooks.
- Introduced a dedicated non-game shell token layer plus reusable frame, rail, panel, and action-tray primitives.
- Migrated the launcher, shell chrome, review workspace, and character workspace wrappers onto the shared primitive contract.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock the shell primitive contract in frontend regressions** - `6271a58` (test)
2. **Task 2: Implement one non-game shell token and primitive layer** - `79a281c` (feat)

**Plan metadata:** Pending

## Files Created/Modified
- `frontend/components/non-game-shell/shell-primitives.tsx` - Shared frame, rail, panel, and action-tray primitives with testable shell hooks.
- `frontend/app/globals.css` - Shell-specific CSS variables for backdrop, surfaces, border strength, highlight, and radius scale.
- `frontend/components/non-game-shell/app-shell.tsx` - Unified shell frame, navigation rail, main canvas, inspector panel, and sticky action tray.
- `frontend/components/non-game-shell/app-sidebar.tsx` - Sidebar header and footer now sit inside the shell token language instead of ad hoc background or radius choices.
- `frontend/components/ui/sidebar.tsx` - Sidebar buttons now follow the shell radius and highlight treatment used by the non-game shell.
- `frontend/app/(non-game)/page.tsx` - Launcher cards now use shared shell panels instead of mixed card and rounded block recipes.
- `frontend/components/world-review/review-workspace.tsx` - Section rail, summary panel, and action tray now share the shell primitive layer.
- `frontend/components/character-creation/character-workspace.tsx` - Input rail, summary panel, and action tray now share the shell primitive layer.
- `frontend/components/non-game-shell/__tests__/app-shell.test.tsx` - Pins outer frame, navigation rail, main panel, and action-tray hooks.
- `frontend/app/(non-game)/__tests__/page.test.tsx` - Pins launcher surfaces to shared shell panels.
- `frontend/app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx` - Pins review rail, summary panel, and action tray to shared primitives.
- `frontend/app/(non-game)/campaign/[id]/character/__tests__/page.test.tsx` - Pins character rail, summary panel, and action tray to shared primitives.

## Decisions Made
- Used shell-specific CSS variables in the existing global theme file instead of expanding generic shadcn card or sidebar tokens.
- Standardized shell-region assertions on semantic data attributes so future visual refinements do not require brittle class-name matching in regressions.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- UAT Gap 1 is structurally addressed: shell visuals now flow through one shared token and primitive layer.
- Ready for `33-06` to tackle the routed creation-flow orchestration and persistence issues that still block broader browser retesting.

## Self-Check: PASSED

- Summary file exists on disk.
- Task commits `6271a58` and `79a281c` are present in git history.

---
*Phase: 33-browser-e2e-verification-for-redesigned-creation-flows*
*Completed: 2026-04-01*
