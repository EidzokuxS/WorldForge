---
phase: quick-260404-csj
plan: 01
subsystem: frontend/shell, frontend/character-creation
tags: [performance, css, compositing, textarea]
dependency_graph:
  requires: []
  provides: [opaque-shell-surfaces, no-backdrop-blur]
  affects: [all-non-game-shell-pages, character-creation-page]
tech_stack:
  added: []
  patterns: [opaque-css-vars-over-alpha, plain-textarea-over-field-sizing]
key_files:
  created: []
  modified:
    - frontend/components/non-game-shell/shell-primitives.tsx
    - frontend/app/globals.css
    - frontend/components/character-creation/character-form.tsx
    - frontend/components/character-creation/character-card.tsx
decisions:
  - Replaced rgba() shell surface vars with pre-computed opaque rgb() equivalents blended against #111114 base
  - Removed backdrop-blur-xl entirely rather than reducing blur radius
  - Kept --shell-border as rgba since thin borders have negligible compositing cost
  - ExpandableText already had minH support (no CompactTextarea exists in current codebase)
metrics:
  duration: 4m44s
  completed: 2026-04-04
---

# Quick Task 260404-csj: Fix Critical Page Performance on Character Creation Summary

Eliminated GPU compositing bottlenecks from the non-game shell by removing backdrop-blur-xl, converting alpha-channel surfaces to opaque equivalents, and replacing shadcn Textarea with a plain textarea to avoid field-sizing-content layout thrashing.

## Changes Made

### Task 1: Kill CSS compositing bottlenecks (8d9e25e)

**shell-primitives.tsx:**
- Removed `backdrop-blur-xl` from `ShellFrame` className
- Removed `backdrop-blur-xl` from `shellSurfaceBase` (used by deprecated ShellPanel, ShellRail, ShellActionTray)
- Reduced ShellFrame shadow from `shadow-[0_32px_120px_rgba(0,0,0,0.35)]` to `shadow-[0_8px_30px_rgba(0,0,0,0.35)]`
- Removed gradient overlay from `ShellMainPanel` background (imperceptible 2% white gradient)

**globals.css:**
- `--shell-frame-surface`: `rgba(10,10,12,0.82)` -> `rgb(11,11,13)`
- `--shell-rail-surface`: `rgba(24,24,27,0.9)` -> `rgb(23,23,26)`
- `--shell-panel-surface`: `rgba(18,18,22,0.84)` -> `rgb(17,17,22)`
- `--shell-panel-muted`: `rgba(39,39,42,0.62)` -> `rgb(31,31,34)`
- Applied to both `:root` and `.dark` blocks
- Kept `--shell-border`, `--shell-highlight`, `--shell-highlight-strong` as rgba (thin borders and static gradients are fine)

### Task 2: Fix character form textarea (8a3f365)

**character-form.tsx:**
- Replaced shadcn `<Textarea>` with plain `<textarea>` in full mode hero description box
- Eliminates `field-sizing-content` CSS that triggers layout recalculation on every keystroke
- Removed unused `Textarea` import
- Preserved all styling classes and behavior

**character-card.tsx (from stash):**
- `ExpandableText` component (replacement for old `CompactTextarea`) already accepts `minH: string` prop
- Already applied at lines 182, 193, 201 with `minH="120px"` for appearance/background/persona fields

## Deviations from Plan

### Auto-adjusted (Rule 2)

**1. CompactTextarea -> ExpandableText already resolved**
- **Found during:** Task 2
- **Issue:** Plan referenced `CompactTextarea` component that no longer exists. The codebase had already been refactored to use `ExpandableText` which correctly accepts and applies `minH` prop.
- **Fix:** No code change needed -- verified the existing implementation is correct.

## Verification

- `npm --prefix frontend run lint` passes with 0 errors (8 pre-existing warnings in unrelated test files)
- No `backdrop-blur` anywhere in shell-primitives.tsx
- No `rgba()` in any `--shell-*-surface` or `--shell-panel-muted` CSS variables
- No shadcn Textarea import in character-form.tsx
- `ExpandableText` type signature includes `minH: string`

## Known Stubs

None -- all changes are complete.

## Self-Check: PASSED
