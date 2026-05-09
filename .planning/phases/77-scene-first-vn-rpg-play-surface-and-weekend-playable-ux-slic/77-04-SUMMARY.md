---
phase: 77-scene-first-vn-rpg-play-surface-and-weekend-playable-ux-slic
plan: 04
subsystem: frontend-game-surface
tags:
  - game-page
  - drawers
  - widget-rail
  - tdd
dependency_graph:
  requires:
    - 77-03
  provides:
    - WidgetRail
    - DrawerHost
    - drawer-backed /game secondary surfaces
  affects:
    - frontend/app/game/page.tsx
    - frontend/app/game/__tests__/page.test.tsx
    - frontend/components/game/play-surface/widget-rail.tsx
    - frontend/components/game/play-surface/drawer-host.tsx
    - frontend/components/game/play-surface/__tests__/drawer-host.test.tsx
tech_stack:
  added: []
  patterns:
    - controlled Radix dialog drawer host
    - compact lucide widget rail
    - existing panel content reused as drawer slots
key_files:
  created:
    - frontend/components/game/play-surface/widget-rail.tsx
    - frontend/components/game/play-surface/drawer-host.tsx
    - frontend/components/game/play-surface/__tests__/drawer-host.test.tsx
  modified:
    - frontend/app/game/page.tsx
    - frontend/app/game/__tests__/page.test.tsx
decisions:
  - Reused existing Log, World, Character, Journal, Inspect, and Saves content sources as drawer slots instead of rewriting panel data contracts.
  - Kept GamePage as the owner of backend turn callbacks, movement, retry, undo, edit, lookup, opening, and world refresh behavior.
  - Inventory drawer reads only authoritative player carried/equipped collections, not location/world item rows.
metrics:
  completed_at: 2026-05-03T00:06:37Z
  tasks_completed: 2
  commits: 4
---

# Phase 77 Plan 04: Widgets and Drawer Migration Summary

Secondary `/game` information moved behind compact widgets and controlled drawers while preserving the scene-first play surface and existing backend-connected panel behavior.

## Completed Tasks

| Task | Name | Commit | Result |
| ---- | ---- | ------ | ------ |
| 1 RED | Drawer host containment tests | bd4650c | Added failing tests for rail routing, active state, controlled drawer close, scroll containment, labels, and Character fallback scope. |
| 1 GREEN | WidgetRail and DrawerHost | a29ff64 | Added compact lucide WidgetRail and a single controlled DrawerHost overlay with player-facing labels and scroll containment. |
| 2 RED | GamePage drawer migration tests | 91fd08f | Added failing page tests for no default secondary panels, drawer access, and draft/scene preservation. |
| 2 GREEN | GamePage drawer migration | e83295b | Wired WidgetRail/DrawerHost into `/game`, migrated Log/World/Character/Journal/Inventory/Inspect/Saves into drawer homes, and preserved existing callbacks. |

## What Changed

- `WidgetRail` opens exactly `Log`, `World`, `Inventory`, `Journal`, `Character`, `Inspect`, and `Saves` with neutral inactive styling and accent only for the active drawer.
- `DrawerHost` renders one controlled overlay at a time with a close control, internal scroll area, and selected actor/player fallback scope for Character.
- `/game` no longer mounts Location, Character, Lore, Oracle, or full NarrativeLog panels as default permanent sidebars.
- Existing `NarrativeLog`, `LocationPanel`, `CharacterPanel`, `LorePanel`, `OraclePanel`, and `CheckpointPanel` remain the content sources behind drawers.
- Inventory drawer uses `player.inventory` and `player.equipment` only.
- Visible scene NPC chips can open Character scoped to that actor; no selected actor falls back to the player character.

## Verification

| Command | Result |
| ------- | ------ |
| `npm --prefix frontend run test -- run components/game/play-surface/__tests__/drawer-host.test.tsx` | Passed: 7 tests. |
| `npm --prefix frontend run test -- run app/game/__tests__/page.test.tsx components/game/play-surface/__tests__/drawer-host.test.tsx` | Passed: 48 tests across 2 files. |
| `npm --prefix frontend run lint -- app/game/page.tsx components/game/play-surface/widget-rail.tsx components/game/play-surface/drawer-host.tsx` | Passed. |
| `npm --prefix frontend run typecheck` | Passed. |
| `npx gitnexus analyze` | Completed; emitted known Node `MaxListenersExceededWarning` warnings. |
| `npx gitnexus status` | Up to date at commit `e83295b`. |

## GitNexus Impact and Scope

- Pre-edit `gitnexus_impact` for `GamePage`: LOW risk, no direct upstream dependents.
- Pre-edit `gitnexus_impact` for `useGamePlaySurfaceState`: LOW risk, direct caller `GamePage`. No hook code changes were needed.
- Pre-commit staged `gitnexus_detect_changes`: HIGH scope because `GamePage` is broad and staged hunks touched indexed `GamePage`, `submitLookup`, and `getHudStatus` regions. The implementation preserved existing transport/helper contracts and passed focused page/drawer tests, lint, and typecheck.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated stale page tests for drawer-backed panel homes**
- **Found during:** Task 2 GREEN verification.
- **Issue:** Existing page tests expected panels to be permanently mounted by default, which contradicted the 77-04 drawer migration requirement.
- **Fix:** Updated tests to open the relevant drawer before asserting migrated panel data/callbacks.
- **Files modified:** `frontend/app/game/__tests__/page.test.tsx`
- **Commit:** e83295b

**2. [Rule 3 - Blocking] Preserved existing Saves behavior through the drawer path**
- **Found during:** Task 2 implementation.
- **Issue:** `CheckpointPanel` already owns its own controlled dialog behavior.
- **Fix:** Routed Saves through the drawer active state while reusing the existing `CheckpointPanel` content source and close callback instead of rewriting checkpoint internals.
- **Files modified:** `frontend/app/game/page.tsx`
- **Commit:** e83295b

## Known Stubs

None that block this plan's goal.

- `placeholder="Detail your next action..."` appears only in the page test's mocked legacy `ActionBar`; production 77-04 code did not introduce prototype-only fake fields.
- Empty array/string/null matches in touched production files are control-flow defaults or existing turn-stream variables, not UI data stubs.

## Threat Flags

None. The plan changed frontend presentation/disclosure only. No new network endpoints, auth paths, file access patterns, persistence writes, or schema trust boundaries were introduced.

## Deferred Issues

- `npx gitnexus analyze` still emits repeated Node `MaxListenersExceededWarning` warnings but completes successfully and reports the index current.
- Saves still reuses `CheckpointPanel`'s existing dialog implementation inside the drawer route. Behavior is preserved; a future visual polish pass can split checkpoint content from its modal shell if needed.

## Self-Check: PASSED

- Found created files: `widget-rail.tsx`, `drawer-host.tsx`, and `drawer-host.test.tsx`.
- Found modified files: `page.tsx` and `page.test.tsx`.
- Found commits: `bd4650c`, `a29ff64`, `91fd08f`, `e83295b`.
- Confirmed pre-existing `.planning/STATE.md` and `.planning/ROADMAP.md` working-tree diffs were left untouched by this executor.
