---
phase: 46-encounter-scope-presence-and-knowledge-boundaries
plan: 04
subsystem: ui
tags: [encounter-scope, game-ui, world-payload, api-contract, scene-presence]
requires:
  - phase: 46-03
    provides: backend encounter-scoped presence, awareness, and routing truth
provides:
  - explicit currentScene world payload for immediate-scene participants and awareness
  - frontend parser support for scene-scoped world reads with bounded fallback
  - /game People Here rendering driven by immediate scene instead of broad location membership
affects: [47, game-ui, world-payload, parser-contracts]
tech-stack:
  added: []
  patterns: [bounded currentScene contract, scene-first fallback chain, broad-location-plus-scene UI split]
key-files:
  created: []
  modified:
    - backend/src/routes/campaigns.ts
    - backend/src/routes/__tests__/campaigns.inventory-authority.test.ts
    - frontend/lib/api.ts
    - frontend/lib/api-types.ts
    - frontend/lib/__tests__/api.test.ts
    - frontend/app/game/page.tsx
    - frontend/app/game/__tests__/page.test.tsx
    - frontend/components/game/location-panel.tsx
    - frontend/components/game/__tests__/location-panel.test.tsx
key-decisions:
  - "The backend /world route now emits one bounded currentScene object with sceneNpcIds, clearNpcIds, and awareness instead of forcing /game to infer scene truth from broad-location membership."
  - "The /game page treats currentScene as authoritative and only falls back to sceneScopeId or currentLocationId when currentScene is absent during transitional reads."
  - "The location panel keeps the broad location as the main place description while showing the immediate scene label and bounded hint signals separately."
patterns-established:
  - "World payload scene scope: use currentScene for authoritative immediate-scene reads, not ad hoc location-level helper fields."
  - "UI scene presence: People Here should render clearNpcIds from currentScene; broad-location filtering is legacy fallback only."
requirements-completed: [SCEN-02]
duration: 9min
completed: 2026-04-12
---

# Phase 46 Plan 04: Encounter Scope, Presence & Knowledge Boundaries Summary

**Scene-scoped world reads now flow from `/api/campaigns/:id/world` through the shared parser into `/game`, so large locations keep their broad place identity while People Here reflects only immediate-scene participants**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-12T10:55:00Z
- **Completed:** 2026-04-12T11:04:01Z
- **Tasks:** 1
- **Files modified:** 9

## Accomplishments

- Added an explicit bounded `currentScene` payload on the backend with authoritative scene NPC ids, clear-visible NPC ids, and awareness hints.
- Extended the frontend world parser/types so scene-scoped fields survive transport instead of disappearing between `/world` and `/game`.
- Rewired `/game` and `LocationPanel` to keep the broad location description while rendering People Here and nearby signs from immediate-scene truth.

## Task Commits

Each task was committed atomically:

1. **Task 1: Expose scene-scoped world reads and consume them on `/game`** - `6c10d53` (feat)

## Files Created/Modified

- `backend/src/routes/campaigns.ts` - emits explicit `currentScene` payload alongside existing broad-location world data
- `backend/src/routes/__tests__/campaigns.inventory-authority.test.ts` - locks the backend `/world` scene-scope contract in regression coverage
- `frontend/lib/api.ts` - parses `currentScene` and preserves scene-scoped ids on player/NPC rows
- `frontend/lib/api-types.ts` - defines explicit `WorldCurrentScene` and scene-scope-aware world types
- `frontend/lib/__tests__/api.test.ts` - regression for parser preservation of `currentScene` and `sceneScopeId`
- `frontend/app/game/page.tsx` - derives People Here from scene-scoped payload with bounded fallback chain
- `frontend/app/game/__tests__/page.test.tsx` - regression for `/game` immediate-scene participant rendering
- `frontend/components/game/location-panel.tsx` - presents immediate scene label and nearby hint signals separately from the broad location
- `frontend/components/game/__tests__/location-panel.test.tsx` - panel regressions for scene label and bounded hint rendering

## Decisions Made

- `currentScene` is now the authoritative `/world` contract for immediate-scene presence, because relying on location-wide membership kept reintroducing the “whole district is one room” bug in the UI.
- The fallback order is explicit: `currentScene` first, then `sceneScopeId`, then legacy broad-location membership only if the new scene payload is absent.
- The panel keeps the broad place description as the main location surface, while immediate-scene details are presented as a separate layer instead of replacing the location entirely.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `gitnexus` MCP `query`/`detect_changes` were unavailable during execution because `.gitnexus/kuzu` was missing while stale metadata still let plain `npx gitnexus analyze` report "Already up to date". This was later repaired with `npx gitnexus analyze --force .`; verification for the plan itself used targeted route/frontend tests plus direct source inspection.
- `gsd-tools state record-metric` failed to parse the existing `STATE.md` metrics section, so the final progress percentage and recent execution entry were updated manually after the standard state/roadmap commands completed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 46 is now fully implemented end-to-end: backend routing, parser contract, and `/game` rendering agree on immediate-scene presence.
- Follow-on work can treat `SCEN-02` as complete and build on the explicit `currentScene` transport surface instead of re-deriving encounter scope in the UI.

## Self-Check

PASSED
