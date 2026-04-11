---
phase: 43-travel-and-location-state-contract-resolution
plan: 02
subsystem: backend
tags: [travel, location-graph, sqlite, vitest, turn-pipeline, npc]
requires:
  - phase: 43-travel-and-location-state-contract-resolution
    provides: normalized location edges, typed location lifecycle fields, and RED travel regressions from 43-01
provides:
  - authoritative graph path resolution with canonical destination lookup for player, NPC, and storyteller movement
  - explicit campaign tick advancement for travel turns that replaces the normal end-of-turn increment
  - normalized reveal-location writes that add ephemeral scene nodes plus bidirectional location_edges rows
affects: [43-03, 43-04, 43-05, gameplay travel contract, npc movement]
tech-stack:
  added: []
  patterns:
    - one shared location-graph seam for canonical destination lookup, reachability, and travel cost
    - travel turns advance the campaign clock once by path cost instead of paying travelCost plus the default +1
key-files:
  created:
    - backend/src/engine/location-graph.ts
  modified:
    - backend/src/campaign/manager.ts
    - backend/src/campaign/index.ts
    - backend/src/campaign/__tests__/manager.test.ts
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/npc-tools.ts
    - backend/src/engine/tool-executor.ts
    - backend/src/engine/__tests__/location-graph.test.ts
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/engine/__tests__/npc-agent.test.ts
    - backend/src/engine/__tests__/tool-executor.test.ts
key-decisions:
  - "Successful player travel now calls advanceCampaignTick(totalCost) and skips the normal end-of-turn increment for that turn."
  - "Inline movement detection, storyteller move_to, and NPC move_to all resolve destination names through the same canonical location-graph seam before any pathing runs."
  - "reveal_location creates ephemeral scene nodes plus normalized bidirectional edge rows while keeping locations.connectedTo as a compatibility projection."
patterns-established:
  - "Travel state updates now emit location_change with destination, path, travelCost, and tickAdvance payloads for downstream API/UI work."
  - "Backend movement uses weighted graph traversal rather than raw connectedTo adjacency checks in player/NPC/tool flows."
requirements-completed: [GSEM-03]
duration: 13min
completed: 2026-04-11
---

# Phase 43 Plan 02: Travel and Location-State Contract Resolution Summary

**Authoritative multi-edge travel with shared player/NPC/tool path resolution and travel-cost tick replacement at the turn boundary**

## Performance

- **Duration:** 13 min
- **Started:** 2026-04-11T15:51:00Z
- **Completed:** 2026-04-11T16:04:01Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments

- Added `backend/src/engine/location-graph.ts` as the shared authority for canonical destination lookup, weighted path resolution, and connected-path summaries.
- Rewired player movement, storyteller `move_to`, and NPC `move_to` onto the same graph contract so multi-edge travel is reachable without adjacency-only teleport rules.
- Made successful player travel advance campaign time exactly once by summed edge cost and updated `reveal_location` to write normalized bidirectional edge rows for new scene locations.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: lock the travel-graph and explicit tick-advance seam** - `ecda2ad` (test)
2. **Task 1 GREEN: implement authoritative path resolution and explicit tick advance** - `fd34828` (feat)
3. **Task 2 RED: lock shared travel rewiring and tick-replacement behavior** - `e079a18` (test)
4. **Task 2 GREEN: rewire player, NPC, and storyteller movement onto the shared graph** - `f019c0c` (feat)

_Note: This plan used TDD, so each task shipped as test then implementation commits._

## Files Created/Modified

- `backend/src/engine/location-graph.ts` - Adds canonical destination resolution, weighted path traversal, connected-path summaries, and DB-backed graph loading.
- `backend/src/campaign/manager.ts` and `backend/src/campaign/index.ts` - Expose `advanceCampaignTick()` and route `incrementTick()` through it for explicit travel-cost turns.
- `backend/src/engine/turn-processor.ts` - Applies shared graph travel to inline player movement, emits honest `location_change` payloads, and replaces the normal end-of-turn tick with travel cost on successful travel.
- `backend/src/engine/npc-tools.ts` - Replaces adjacency-only NPC `move_to` checks with shared path resolution and returns travel path metadata.
- `backend/src/engine/tool-executor.ts` - Rewrites storyteller `move_to` onto shared graph traversal and makes `reveal_location` insert ephemeral typed nodes plus normalized bidirectional edges.
- `backend/src/campaign/__tests__/manager.test.ts`, `backend/src/engine/__tests__/location-graph.test.ts`, `backend/src/engine/__tests__/turn-processor.test.ts`, `backend/src/engine/__tests__/npc-agent.test.ts`, `backend/src/engine/__tests__/tool-executor.test.ts` - Lock the travel resolver, tick replacement seam, shared NPC movement behavior, and normalized reveal-location writes.

## Decisions Made

- Player travel time is now authoritative campaign state rather than narration flavor: a successful travel turn advances time by graph `travelCost` and not by `travelCost + 1`.
- The movement contract stays intentionally minimal: pathfinding is weighted and believable, but Phase 43 still avoids per-edge subturn simulation.
- Temporary revealed locations are typed as ephemeral scene nodes anchored to an existing location so later plans can manage archival semantics without flattening them back into raw adjacency strings.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npm --prefix backend run typecheck` remains red for unrelated pre-existing errors in `src/ai/__tests__/provider-registry.test.ts`, `src/engine/target-context.ts`, and `src/routes/worldgen.ts`. The targeted travel suites for this plan are green.
- `backend/src/engine/turn-processor.ts` already had local worktree edits before Task 2. I read and preserved those changes while layering the travel-graph seam on top.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan `43-03` can now write location-local recent happenings against travel results that carry authoritative destination and tick-advance data.
- Plan `43-04` can expose `connectedPaths`, travel cost, and local history through route/prompt readers without inventing a second movement contract.
- `/game` payload work in `43-05` now has backend-emitted `location_change` travel metadata ready for UI rendering.

## Self-Check: PASSED

- Summary file present: `.planning/phases/43-travel-and-location-state-contract-resolution/43-02-SUMMARY.md`
- Task commit present: `ecda2ad`
- Task commit present: `fd34828`
- Task commit present: `e079a18`
- Task commit present: `f019c0c`
- Stub scan found no blocking placeholder markers in files created or modified by this plan.

---
*Phase: 43-travel-and-location-state-contract-resolution*
*Completed: 2026-04-11*
