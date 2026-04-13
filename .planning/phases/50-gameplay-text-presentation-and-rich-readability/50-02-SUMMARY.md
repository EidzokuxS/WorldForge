---
phase: 50-gameplay-text-presentation-and-rich-readability
plan: 02
subsystem: ui
tags: [game-ui, readability, react, vitest, tailwind]
requires:
  - phase: 50-01
    provides: reader-oriented narrative rendering, RP-formatting surface, and compact progress blocks for /game
provides:
  - reader-centered /game shell with sticky plain-text action dock
  - scan-friendly location and character side rails aligned to the hybrid concept
  - higher-contrast quick-action tiles that preserve authoritative post-turn unlock behavior
affects: [50-04, game-ui, gameplay-readability, scene-panels]
tech-stack:
  added: []
  patterns: [reader-shell presentation, sticky action dock, sectioned gameplay rails, support-action tile row]
key-files:
  created: []
  modified:
    - frontend/app/game/page.tsx
    - frontend/app/game/__tests__/page.test.tsx
    - frontend/components/game/action-bar.tsx
    - frontend/components/game/__tests__/action-bar.test.tsx
    - frontend/components/game/location-panel.tsx
    - frontend/components/game/__tests__/location-panel.test.tsx
    - frontend/components/game/character-panel.tsx
    - frontend/components/game/quick-actions.tsx
key-decisions:
  - "The /game action surface stays a normal textarea with a lightweight RP markup hint instead of adding formatting controls or WYSIWYG behavior."
  - "The central log, quick actions, and input now live inside one reader shell and sticky dock, but all turn-phase, retry, travel, and SSE contracts remain untouched."
  - "The location rail keeps the broad location as the main place text while the immediate scene remains a separate bounded layer, preserving the Phase 46 scene-truth contract."
patterns-established:
  - "Gameplay shell composition: center the narrative surface, then attach quick actions and action input as one sticky dock below it."
  - "Rail readability: always render core section labels with explicit empty states instead of hiding whole sections when lists are empty."
requirements-completed: [UX-01]
duration: 5min
completed: 2026-04-13
---

# Phase 50 Plan 02: Gameplay Text Presentation & Rich Readability Summary

**Reader-centered /game shell with a sticky plain-text action dock, clearer side rails, and support-action tiles aligned to the hybrid concept**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-13T08:09:34+03:00
- **Completed:** 2026-04-13T08:14:07+03:00
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments

- Rebuilt `/game` into a darker reader-centered shell with a sticky dock that keeps `QuickActions` and `ActionBar` visually attached to the narrative surface.
- Kept the action input plain text while upgrading its affordances: new placeholder copy, one-line RP markup hint, and utilitarian input styling that still respects turn busy/finalizing locks.
- Restyled the location, character, and quick-action rails into clearer sectioned cards without changing scene authority, travel semantics, or authoritative quick-action unlock timing.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rebuild the central gameplay shell and sticky input presentation** - `27a0ca7` (test), `4a64647` (feat)
2. **Task 2: Upgrade panel and quick-action readability without changing scene semantics** - `5e1221c` (test), `0ec5ace` (feat)

_Note: Both tasks followed TDD with test → feat commits._

## Files Created/Modified

- `frontend/app/game/page.tsx` - wraps `/game` in a concept-style reader shell and moves quick actions plus input into one sticky dock.
- `frontend/app/game/__tests__/page.test.tsx` - locks the new shell wrappers while preserving scene/travel/finalizing regression coverage.
- `frontend/components/game/action-bar.tsx` - keeps the textarea contract but adds the new placeholder, RP hint, and dock-friendly styling.
- `frontend/components/game/__tests__/action-bar.test.tsx` - verifies the updated placeholder, RP hint, and finalizing warning contract.
- `frontend/components/game/location-panel.tsx` - upgrades the location rail into persistent scan-friendly sections with explicit empty states.
- `frontend/components/game/__tests__/location-panel.test.tsx` - verifies the stable People Here/Paths section contract alongside Phase 46 scene expectations.
- `frontend/components/game/character-panel.tsx` - strengthens equipment and inventory hierarchy with clearer card grouping.
- `frontend/components/game/quick-actions.tsx` - renders higher-contrast support tiles while preserving the existing `actions`/`onAction`/`disabled` API.

## Decisions Made

- The action dock remains plain text and render-time driven; RP markup help is informational only, so chat transport and stored message payloads stay unchanged.
- The new shell keeps `NarrativeLog`, `QuickActions`, and `ActionBar` in one visual stack because the concept reference depends on the input feeling attached to the reader surface rather than to the page footer.
- Location and character readability changes stay inside their existing panel seams instead of introducing a new app-shell abstraction or altering world payload semantics.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Running `gitnexus_detect_changes({ scope: "all" })` near closeout surfaced unrelated dirty-worktree changes in `backend/src/ai/generate-object-safe.ts` and `frontend/components/character-creation/character-card.tsx`. Scope for Plan `50-02` was therefore confirmed with the four task commits plus `git diff --name-only 27a0ca7^..0ec5ace`, which isolated the change set to the expected `/game` shell, panel, and action-surface files.
- The plan’s vitest command only works from the repository root; running it from `frontend/` produced a no-files-found error because the file arguments include the `frontend/` path prefix.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `/game` now has the intended reader shell, sticky plain-text action surface, and clearer side rails without reopening gameplay logic.
- Later Phase 50 work can build on this presentation baseline instead of compensating for a flat app-layout shell.

## Self-Check

PASSED

---
*Phase: 50-gameplay-text-presentation-and-rich-readability*
*Completed: 2026-04-13*
