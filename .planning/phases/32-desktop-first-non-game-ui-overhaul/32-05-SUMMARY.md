---
phase: 32-desktop-first-non-game-ui-overhaul
plan: 05
subsystem: ui
tags: [nextjs, tailwind, character-creation, persona-templates, loadout, redirect]
requires:
  - phase: 32-01
    provides: shared non-game shell and layout primitives
  - phase: 29-unified-character-ontology-and-tag-system
    provides: canonical `CharacterDraft` editing seam
  - phase: 30-start-conditions-canonical-loadouts-and-persona-templates
    provides: persona-template, start-condition, and canonical loadout preview seams
provides:
  - canonical shell-owned character-authoring route
  - desktop character workspace around the current draft/start/loadout model
  - redirect-only legacy `/character-creation` compatibility page
affects: [character creation flow, game handoff, phase 33 verification]
tech-stack:
  added: []
  patterns: [canonical campaign route ownership, workspace around existing draft seam, redirect-only legacy pages]
key-files:
  created:
    - frontend/app/(non-game)/campaign/[id]/character/page.tsx
    - frontend/components/character-creation/character-workspace.tsx
    - frontend/components/character-creation/__tests__/character-workspace.test.tsx
  modified:
    - frontend/components/character-creation/character-card.tsx
    - frontend/app/character-creation/page.tsx
    - frontend/app/character-creation/__tests__/page.test.tsx
key-decisions:
  - "Character authoring stays on the existing `CharacterDraft` seam rather than introducing a second model for the redesign."
  - "The legacy `/character-creation` route is reduced to redirect-only compatibility while `/game` remains outside the shell."
patterns-established:
  - "Desktop workspaces elevate existing canonical data seams instead of forking them for UI convenience."
requirements-completed: [P32-04, P32-06]
duration: 8min
completed: 2026-04-01
---

# Phase 32 Plan 05: Summary

**Character creation now uses a canonical shell-owned workspace that surfaces persona templates, start conditions, and canonical loadout preview on the existing `CharacterDraft` seam.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-01T19:41:40+03:00
- **Completed:** 2026-04-01T19:48:55+03:00
- **Tasks:** 3
- **Files modified:** 8

## Accomplishments

- Moved character authoring to `/campaign/[id]/character` under the non-game shell.
- Added a workspace container and upgraded `CharacterCard` to make persona-template, start-condition, and loadout-preview seams first-class on desktop.
- Replaced the old `/character-creation` page with a redirect stub while keeping `/game` structurally separate.

## Task Commits

1. **Plans 32-05 Tasks 1-3** - `38e6452` (feat)

## Files Created/Modified

- `frontend/app/(non-game)/campaign/[id]/character/page.tsx` - canonical shell-owned character page
- `frontend/components/character-creation/character-workspace.tsx` - desktop character workspace composition
- `frontend/components/character-creation/character-card.tsx` - upgraded structured draft editor for the new workspace
- `frontend/app/character-creation/page.tsx` - redirect-only compatibility stub
- `frontend/app/game/__tests__/page.test.tsx` - smoke coverage that gameplay stays outside the non-game shell

## Decisions Made

- The redesign stays on the canonical `CharacterDraft` pipeline from Phases 29-30 instead of flattening the editor back into tag-heavy form state.
- `/game` was intentionally left untouched except for smoke coverage so Phase 32 does not bleed into gameplay UI redesign.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Root-invoked Vitest still emits the previously recorded `environmentMatchGlobs` deprecation warning, but the Phase 32 verification path is green.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 32 UI route migration is complete and ready for browser E2E verification in Phase 33.
- The canonical character flow, legacy redirect, and `/game` separation all have targeted regression coverage.

## Self-Check: PASSED

---
*Phase: 32-desktop-first-non-game-ui-overhaul*
*Completed: 2026-04-01*
