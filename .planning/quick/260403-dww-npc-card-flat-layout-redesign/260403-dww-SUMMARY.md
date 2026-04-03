---
phase: quick
plan: 260403-dww
subsystem: frontend/world-review
tags: [ui, layout, refactor]
dependency_graph:
  requires: []
  provides: [flat-npc-cards]
  affects: [npcs-section]
tech_stack:
  added: []
  patterns: [clamp-based-responsive-spacing, flat-div-layout]
key_files:
  created: []
  modified:
    - frontend/components/world-review/npcs-section.tsx
decisions: []
metrics:
  duration: 4m
  completed: "2026-04-03T07:08:22Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 1
---

# Quick Task 260403-dww: NPC Card Flat Layout Redesign Summary

Replaced Card/CardHeader/CardContent Shadcn wrappers in npcs-section.tsx with plain div containers using border-border/40, rounded-lg, and clamp-based responsive spacing to match the desktop-first flat layout pattern from Phase 32.

## Changes Made

### Task 1: Replace Card wrappers with flat div layout (e8e24bf)

- Removed `Card`, `CardHeader`, `CardContent` imports from `@/components/ui/card`
- Replaced `<Card>` wrapper with `<div className="relative rounded-lg border border-border/40 p-[clamp(16px,1.4vw,28px)]">`
- Replaced `<CardHeader className="pb-2 pr-10">` with `<div className="mb-[clamp(8px,0.6vw,14px)] pr-10">`
- Replaced `<CardContent className="space-y-3">` with `<div className="space-y-[clamp(8px,0.7vw,14px)]">`
- Updated NPC name Input to `text-[clamp(14px,1vw,18px)]` font sizing
- Updated grid container to `gap-[clamp(12px,1vw,20px)]` spacing

### Task 2: Verify test assertions

- All 4 existing NpcsSection tests pass unchanged -- they use content-based selectors (getByDisplayValue, getByText, getAllByText) not Card-dependent structure
- Full frontend test suite: 38 files, 250 tests, all passing

## Deviations from Plan

None -- plan executed exactly as written.

## Verification

- Lint: clean (0 errors)
- Tests: 250/250 pass (38 files)
- Build: pre-existing type error in `character-creation/page.tsx` (unrelated to this change, confirmed present before this commit)
- No Card/CardHeader/CardContent imports remain in npcs-section.tsx

## Known Stubs

None.

## Self-Check: PASSED

- [x] frontend/components/world-review/npcs-section.tsx modified with flat layout
- [x] Commit e8e24bf exists
- [x] All tests pass
- [x] No Card imports remain
