---
phase: 59
plan: 01
status: complete
completed: 2026-04-17
---

# Plan 59-01 Summary — Frontend Shell Rewrite + Tests

## What was built

**Task 1 — Tests (TDD RED):**
- Extended existing `frontend/app/game/__tests__/page.test.tsx` with new `describe("Phase 59: shell contract")` block — asserts shell has `h-screen` class, `data-shell-region` markers present, action dock rendered without sticky positioning
- Created new `frontend/components/game/__tests__/lore-panel.layout.test.tsx` — unmocked real LorePanel component — asserts aside has `flex flex-col overflow-hidden w-full` + `[data-slot="scroll-area-viewport"]` child

**Task 2 — Implementation (GREEN):**
- `frontend/app/game/page.tsx`: `min-h-screen` → `h-screen` on game-shell; grid `xl:grid xl:grid-cols-[...] xl:items-start` → flex-row `xl:flex-row xl:items-stretch`; fixed-width asides `xl:w-80 xl:flex-none flex flex-col overflow-hidden`; middle column `flex-1 flex flex-col min-w-0 overflow-hidden`; action dock `flex-none` (no sticky, no negative-margin hack); right column CharacterPanel + LorePanel each `flex-1 min-h-0` (50/50 split); added `data-shell-region` markers at 6 sites (game-root, game-columns, aside-left, reader, action-dock, aside-right)
- `frontend/components/game/lore-panel.tsx`: aside outer wrapper `flex flex-col overflow-hidden` on both branches (null campaign + real)

## Commits

- `f902500`: test(59-01): add failing shell structure tests for game page and lore panel
- `cc772f7`: feat(59-01): rewrite /game shell to viewport-locked flex layout

## Verification evidence

- Tests pass (page.test.tsx + lore-panel.layout.test.tsx)
- Runtime check via PinchTab (see Plan 59-02 smoke):
  - `[data-shell-region]` markers: 6 present in DOM
  - Shell height === viewport height (delta=0)
  - Action dock rect.bottom=1134 <= viewport.height=1345 (visible)
  - 2x `[data-slot="scroll-area-viewport"]` present (CharacterPanel + LorePanel)

## Must-haves met

- [x] Shell uses h-screen (viewport-locked)
- [x] Grid → flex-row conversion
- [x] LorePanel aside has overflow-hidden (both branches)
- [x] Right column panels each scroll internally
- [x] Action bar visible in viewport
- [x] data-shell-region markers added for test stability
- [x] Match docs/ui_concept_hybrid.html pattern

## Out of scope (documented)

- Regression smoke over `/campaign/new`, `/settings`, `/campaign/[id]/character` — dropped from must_haves per REVIEWS.md resolution
