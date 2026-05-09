---
phase: 77-scene-first-vn-rpg-play-surface-and-weekend-playable-ux-slic
plan: 03
subsystem: frontend-game-surface
tags:
  - game-page
  - scene-shell
  - action-dock
  - tdd
dependency_graph:
  requires:
    - 77-01
    - 77-02
  provides:
    - ActionDock
    - useGamePlaySurfaceState
    - scene-first /game vertical slice
  affects:
    - frontend/app/game/page.tsx
    - frontend/app/game/__tests__/page.test.tsx
    - frontend/components/game/play-surface/action-dock.tsx
tech_stack:
  added:
    - React controlled textarea action dock
    - route-local play-surface state hook
  patterns:
    - TDD RED/GREEN per task
    - backend turn ownership remains in GamePage
    - local-only narration cadence controls
key_files:
  created:
    - frontend/components/game/play-surface/action-dock.tsx
    - frontend/components/game/play-surface/__tests__/action-dock.test.tsx
    - frontend/app/game/use-game-play-surface-state.ts
  modified:
    - frontend/app/game/page.tsx
    - frontend/app/game/__tests__/page.test.tsx
decisions:
  - Keep submitAction, lookup, retry, undo, edit, opening, SSE parsing, and refresh ownership in GamePage.
  - Use CONTINUE_ACTION_PAYLOAD for visible Continue instead of duplicating a literal in the page.
  - Extract beat index, autoplay, draft, drawer, actor selection, and stage-signal state into useGamePlaySurfaceState.
metrics:
  started_at: 2026-05-02T23:41:04Z
  completed_at: 2026-05-02T23:51:32Z
  duration: 10m28s
  tasks_completed: 2
  commits: 4
---

# Phase 77 Plan 03: First Game Scene Slice Summary

Scene-first `/game` vertical slice with ActionDock, Continue, draft persistence, and local beat controls wired over the existing runtime backend state.

## Completed Tasks

| Task | Name | Commit | Result |
| ---- | ---- | ------ | ------ |
| 1 RED | Build ActionDock controls tests | 12dd1d0 | Added failing tests for Send, Continue, busy state, quick choices, placement, taxonomy removal, and keyboard behavior. |
| 1 GREEN | Build ActionDock controls | 1f00c6a | Added controlled ActionDock with one raw narrative textarea, Send, visible Continue, quick choices, and no backend imports. |
| 2 RED | Wire GamePage scene-slice tests | b79e88d | Added failing page tests for scene shell wiring, local-only Next/Auto/Log, Send/Continue backend payloads, draft restore, and hook extraction. |
| 2 GREEN | Wire scene-first GamePage slice | db1253e | Replaced the first viewport with GameSceneShell, NarrationDock, ActionDock, scene backdrop/HUD/stage overlay, and useGamePlaySurfaceState. |

## What Changed

- `ActionDock` now owns the bottom action lane UI with one controlled freeform input, Send, Continue, quick choices, busy-state disabling, and Enter/Shift+Enter behavior.
- `/game` now renders the Phase 77 scene shell vertical slice instead of the old permanent cockpit column layout.
- `useGamePlaySurfaceState` centralizes local presentation state for beat index, autoplay, campaign draft, active drawer, selected actor, and current stage signals.
- Send still submits through `submitAction` and calls `chatAction(campaignId, actionText, actionText, "")`.
- Continue now submits through the same existing action path using `CONTINUE_ACTION_PAYLOAD`.
- Next, Auto, and Log are local-only controls and page tests verify they do not call backend turn helpers.

## Verification

| Command | Result |
| ------- | ------ |
| `npm --prefix frontend run test -- run components/game/play-surface/__tests__/action-dock.test.tsx` | Passed: 7 tests. |
| `npm --prefix frontend run test -- run app/game/__tests__/page.test.tsx` | Passed: 39 tests. |
| `npm --prefix frontend run test -- run app/game/__tests__/page.test.tsx components/game/play-surface/__tests__/action-dock.test.tsx components/game/play-surface/__tests__/narration-dock.test.tsx` | Passed: 53 tests across 3 files. |
| `npm --prefix frontend run lint -- app/game/page.tsx components/game/play-surface/action-dock.tsx` | Passed. |
| `npm --prefix frontend run typecheck` | Passed. |
| `npx gitnexus analyze` | Completed and updated the index to commit `db1253e`; Node emitted repeated `MaxListenersExceededWarning` warnings. |
| `npx gitnexus status` | Confirmed the GitNexus index was up to date at `db1253e`. |

## GitNexus Impact and Scope

- `GamePage`: LOW impact, no upstream callers reported.
- `getAuthoritativeSceneNpcs`: LOW impact, direct caller `GamePage`.
- `getFallbackSceneNpcs`: LOW impact, direct caller `GamePage`.
- `buildScenePanelData`: LOW impact, direct caller `GamePage`.
- `submitAction`: HIGH impact because direct callers include `handleSubmitAction`, `handleQuickAction`, and `handleMove`. The implementation preserved the `submitAction(actionText)` contract and added Continue through the same path.
- Pre-commit `gitnexus.detect_changes({scope: "staged", repo: "WorldForge"})` reported CRITICAL affected scope for the staged GamePage changes. This matched the plan's expected `/game` surface replacement; backend helper contracts were preserved and targeted tests/typecheck passed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated stale page tests for the scene-shell contract**
- **Found during:** Task 2 RED.
- **Issue:** Existing tests still asserted the old cockpit/ActionBar surface, which conflicted with the plan requirement that `[data-shell-region="game-columns"]` no longer render by default.
- **Fix:** Reworked those assertions to target `GameSceneShell`, `ActionDock`, local-only cadence controls, and preservation of existing backend action semantics.
- **Files modified:** `frontend/app/game/__tests__/page.test.tsx`
- **Commit:** b79e88d

**2. [Rule 1 - Bug] Removed stale unused imports and handlers after the UI replacement**
- **Found during:** scoped lint for Task 2.
- **Issue:** Old dialog imports and handlers from the previous cockpit layout became unused after the scene-shell replacement.
- **Fix:** Removed the stale code without changing backend turn ownership or helper contracts.
- **Files modified:** `frontend/app/game/page.tsx`
- **Commit:** db1253e

## Known Stubs

- None that block this plan's goal.
- `widgetRail` and hidden `drawerHost` in `GamePage` are transitional integration points for Plan 77-04. Existing real panels and data wiring are preserved there instead of replacing backend-connected data with prototype fields.
- The `placeholder` text in `ActionDock` is textarea affordance copy, not a hardcoded data stub.

## Threat Flags

No unplanned security-relevant surface was introduced. The touched trust boundaries match the plan threat model: player input to backend turn route, local cadence controls to page state, and campaign-scoped draft persistence.

## TDD Gate Compliance

- RED commits exist before implementation: `12dd1d0`, `b79e88d`.
- GREEN commits exist after the matching RED commits: `1f00c6a`, `db1253e`.

## Deferred Issues

- GitNexus CLI completed re-analysis but emitted Node `MaxListenersExceededWarning` warnings. The index was still updated and `npx gitnexus status` reported current commit coverage.

## Self-Check

PASSED.

- Verified all created/modified plan files exist.
- Verified task commits exist: `12dd1d0`, `1f00c6a`, `b79e88d`, `db1253e`.
