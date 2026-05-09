---
phase: 77-scene-first-vn-rpg-play-surface-and-weekend-playable-ux-slic
plan: 05
subsystem: frontend-game-surface
tags:
  - game-page
  - actor-presence
  - inspect-drawer
  - debug-containment
dependency_graph:
  requires:
    - 77-04
  provides:
    - PresenceLayer
    - InspectDrawer
    - fiction-facing mechanic beat hardening
  affects:
    - frontend/app/game/page.tsx
    - frontend/app/game/use-game-play-surface-state.ts
    - frontend/lib/display-beats.ts
tech_stack:
  added: []
  patterns:
    - clear scene actors render as selectable presence chips
    - hint/off-screen presence renders as non-target scene cues
    - raw mechanic/debug data lives behind Inspect and debug gating
key_files:
  created:
    - frontend/components/game/play-surface/presence-layer.tsx
    - frontend/components/game/play-surface/inspect-drawer.tsx
    - frontend/components/game/play-surface/__tests__/presence-layer.test.tsx
    - frontend/components/game/play-surface/__tests__/inspect-drawer.test.tsx
  modified:
    - frontend/app/game/page.tsx
    - frontend/app/game/use-game-play-surface-state.ts
    - frontend/app/game/__tests__/page.test.tsx
    - frontend/components/game/play-surface/types.ts
    - frontend/lib/display-beats.ts
    - frontend/lib/__tests__/display-beats.test.ts
decisions:
  - Scene-layer actor chips come only from authoritative clear scene NPCs; hints and off-screen anchors are non-target cues.
  - Opening Character from the rail clears selectedActorId and falls back to the player; clicking a visible actor scopes Character to that actor.
  - InspectDrawer replaces inline OraclePanel rendering for the Inspect drawer and gates raw reasoning behind settings.ui.showRawReasoning.
  - Miss margins may surface as Close call or Bad break while chance, roll, and reasoning remain rawDetails for Inspect.
metrics:
  completed_at: 2026-05-03T00:19:24Z
  tasks_completed: 2
  commits: 3
---

# Phase 77 Plan 05: Presence and Inspect Containment Summary

Honest scene presence and optional mechanic/debug disclosure for the scene-first `/game` play surface.

## Completed Tasks

| Task | Name | Commit | Result |
| ---- | ---- | ------ | ------ |
| 1 | Render honest actor presence bands | aa5cfaa | Added `PresenceLayer`, wired clear NPCs, hint signals, off-screen anchor counts, visible actor Character scoping, and player fallback from the rail. |
| 2 | Move raw mechanics/debug into Inspect | ce9bbc7 | Added `InspectDrawer`, removed inline OraclePanel usage from page inspect content, hardened miss labels, and kept raw chance/roll/reasoning out of default scene UI. |

## What Changed

- `PresenceLayer` now renders visible/interactable actors as accessible buttons and renders sensed hints/off-screen anchors as muted non-target cues.
- `/game` derives presence from existing `npcsHere` and `currentScene.awareness.hintSignals`; broad-location fallback is still limited to legacy `currentScene: null` behavior and is not used for direct scene chips when `currentScene` exists.
- Visible actor clicks open Character scoped to that actor. Opening Character from `WidgetRail` clears actor selection and shows the player sheet.
- `InspectDrawer` provides Beat, Oracle, State, Events, and optional Debug sections.
- `deriveDisplayBeats` keeps raw Oracle data in `rawDetails` and adds player-facing `Close call` and `Bad break` miss labels.
- `GamePage` passes the most relevant mechanic beat into Inspect so raw details stay inspectable even when the local beat cursor is on narration.

## Verification

| Command | Result |
| ------- | ------ |
| `npm --prefix frontend run test -- run components/game/play-surface/__tests__/presence-layer.test.tsx` | Passed: 4 tests. |
| `npm --prefix frontend run test -- run app/game/__tests__/page.test.tsx` | Passed: 43 tests. |
| `npm --prefix frontend run test -- run components/game/play-surface/__tests__/inspect-drawer.test.tsx` | Passed: 3 tests. |
| `npm --prefix frontend run test -- run lib/__tests__/display-beats.test.ts` | Passed: 11 tests. |
| `npm --prefix frontend run test -- run components/game/play-surface/__tests__/presence-layer.test.tsx components/game/play-surface/__tests__/inspect-drawer.test.tsx lib/__tests__/display-beats.test.ts app/game/__tests__/page.test.tsx` | Passed: 61 tests across 4 files. |
| `npm --prefix frontend run lint -- app/game/page.tsx components/game/play-surface/presence-layer.tsx components/game/play-surface/inspect-drawer.tsx lib/display-beats.ts` | Passed with 0 warnings after cleanup. |
| `npm --prefix frontend run typecheck` | Passed. |
| `npx gitnexus analyze` | Completed and indexed commit `ce9bbc7`; emitted known Node `MaxListenersExceededWarning` warnings. |
| `npx gitnexus status` | Up to date at commit `ce9bbc7`. |

The page test command still emits an existing jsdom stderr warning, `Maximum update depth exceeded`, in the quick-actions test, but the command exits green and all assertions pass.

## GitNexus Impact and Scope

- Pre-edit impact:
  - `GamePage`: LOW, no upstream callers.
  - `getAuthoritativeSceneNpcs`: LOW, direct caller `GamePage`.
  - `getFallbackSceneNpcs`: LOW, direct caller `GamePage`.
  - `buildScenePanelData`: LOW, direct caller `GamePage`.
  - `deriveDisplayBeats`: LOW, direct caller `useGamePlaySurfaceState`, then `GamePage`.
  - `useGamePlaySurfaceState`: LOW, direct caller `GamePage`.
- Pre-commit staged detect for Task 1: HIGH scope because staged hunks touched `GamePage` and `useGamePlaySurfaceState`; this matched the planned frontend presence wiring and passed targeted tests.
- Pre-commit staged detect for Task 2: HIGH scope because staged hunks touched `GamePage`, `MechanicSummary`, and display-beat helpers; this matched the planned mechanic/Inspect disclosure changes and passed targeted tests, lint, and typecheck.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cleared selected actor when Character opens from the rail**
- **Found during:** Task 1 page test.
- **Issue:** The existing selected actor could survive drawer close, so opening Character from the rail after actor inspection could keep showing the NPC instead of the player fallback.
- **Fix:** `useGamePlaySurfaceState.openDrawer("character")` now clears `selectedActorId` unless actor selection explicitly opens the drawer.
- **Files modified:** `frontend/app/game/use-game-play-surface-state.ts`
- **Commit:** aa5cfaa

**2. [Rule 1 - Bug] Removed scoped lint warning in touched display-beat helper**
- **Found during:** Task 2 scoped lint.
- **Issue:** `getInitialBeatIndex(_beats)` emitted an unused parameter warning in a file modified by the plan.
- **Fix:** Marked the parameter intentionally consumed with `void _beats`.
- **Files modified:** `frontend/lib/display-beats.ts`
- **Commit:** ce9bbc7

### Process Deviations

- `gsd-sdk query init.execute-phase 77` is unavailable in this environment because the installed CLI only accepts `run`, `auto`, and `init`. Execution continued from the provided plan path and local state files.
- Shared GSD bookkeeping files (`.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`) were not updated by explicit user/orchestrator instruction.

## Known Stubs

None that block this plan's goal.

- Stub scan found `placeholder` only in `frontend/app/game/__tests__/page.test.tsx` test/mock wording, not production UI data.
- Empty arrays/null/strings found in touched production files are control-flow defaults, existing stream accumulators, or local presentation fallbacks, not prototype-only fake data.

## Threat Flags

None. The plan did not add network endpoints, auth paths, filesystem access, persistence writes, or schema trust boundaries. It changed frontend rendering/disclosure over existing backend-provided scene and Oracle data.

## Deferred Issues

- The existing `Maximum update depth exceeded` stderr warning remains in `frontend/app/game/__tests__/page.test.tsx` under the quick-actions test even though the test command is green. It predates this plan's behavior and did not block 77-05 acceptance.
- `npx gitnexus analyze` still emits repeated Node `MaxListenersExceededWarning` warnings but completes successfully and reports the index current.

## Self-Check: PASSED

- Found created files: `presence-layer.tsx`, `inspect-drawer.tsx`, and both test files.
- Found modified files: `page.tsx`, `use-game-play-surface-state.ts`, `page.test.tsx`, `types.ts`, `display-beats.ts`, and `display-beats.test.ts`.
- Found commits: `aa5cfaa`, `ce9bbc7`.
- Confirmed no tracked file deletions in task commits.
- Confirmed shared bookkeeping files were left untouched by this executor.
