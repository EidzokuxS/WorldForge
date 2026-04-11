---
phase: 43-travel-and-location-state-contract-resolution
plan: 04
subsystem: backend
tags: [travel, locations, prompt, hono, vitest]
requires:
  - phase: 43-travel-and-location-state-contract-resolution
    provides: authoritative graph traversal, normalized location edges, and SQLite-backed recent-happenings projection
provides:
  - world payload locations with normalized connectedPaths and recentHappenings from authoritative backend seams
  - prompt scene narration that reads current-location recent history from the same location-events seam
  - bounded empty-state fallbacks for location history in both world payloads and prompts
affects: [43-05, world payloads, prompt assembly, location-panel contract]
tech-stack:
  added: []
  patterns:
    - one read authority for location-local history: API and prompts both consume backend/src/engine/location-events.ts
    - world payload enriches locations with frontend-ready connectedPaths instead of exposing raw connectedTo compatibility strings
    - scene prompts surface at most five recent local events within a 50-tick window and fall back explicitly when history is empty
key-files:
  created: []
  modified:
    - backend/src/engine/location-events.ts
    - backend/src/routes/campaigns.ts
    - backend/src/routes/__tests__/campaigns.test.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/__tests__/prompt-assembler.test.ts
key-decisions:
  - "The world API omits raw connectedTo from location payloads and instead emits normalized connectedPaths with edgeId, destination, and travelCost."
  - "Prompt assembly reads listRecentLocationEvents from the shared location-events seam and limits local memory to the last 50 ticks or five events."
  - "A bulk location-events reader lives in location-events.ts so world-route assembly and prompt assembly do not reconstruct local history through separate ad hoc queries."
patterns-established:
  - "Location-local history is now read as a bounded backend projection, not inferred from chronicle prose or vector-only context."
  - "Revisit narration and world payloads stay aligned because both consume the same authoritative event summaries."
requirements-completed: [GSEM-04]
duration: 6 min
completed: 2026-04-11
---

# Phase 43 Plan 04: Travel and Location-State Contract Resolution Summary

**Authoritative world-route connected paths plus shared-seam local-history readback in scene prompts and world payloads**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-11T16:24:44Z
- **Completed:** 2026-04-11T16:31:42Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Enriched `/api/campaigns/:id/world` locations with normalized `connectedPaths` and bounded `recentHappenings` while removing the raw `connectedTo` compatibility field from the response contract.
- Added a bulk location-history reader to the authoritative `location-events.ts` seam so route payload assembly can batch-read recent local events once per campaign response.
- Extended scene prompt assembly to surface `Recent happenings here` from the same seam, including anchored archived-scene spillover and an explicit empty-history fallback.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: lock the world API location contract** - `effa648` (test)
2. **Task 1 GREEN: expose authoritative world location reads** - `788bae5` (feat)
3. **Task 2 RED: lock prompt local-history seam usage** - `39a86a2` (test)
4. **Task 2 GREEN: surface local history in scene prompts** - `386067d` (feat)

_Note: This plan used TDD, so each task shipped as test then implementation commits._

## Files Created/Modified

- `backend/src/engine/location-events.ts` - Adds a bulk recent-events reader keyed by location id so downstream readers can share one authoritative location-history seam.
- `backend/src/routes/campaigns.ts` - Normalizes world locations into frontend-ready `connectedPaths` and `recentHappenings`.
- `backend/src/routes/__tests__/campaigns.test.ts` - Locks shared-seam world payload reads, normalized path shaping, and explicit empty-array fallbacks.
- `backend/src/engine/prompt-assembler.ts` - Reads current-location history from `location-events.ts` and appends bounded `Recent happenings here` lines to scene context.
- `backend/src/engine/__tests__/prompt-assembler.test.ts` - Locks prompt-level seam usage, archived-scene spillover visibility, and empty-history fallback wording.

## Decisions Made

- The world-route contract is now normalized for consumers: raw adjacency compatibility data stays in storage, not in the read payload.
- Prompt-local history is bounded by both count and recency so local memory stays useful without crowding out the rest of the scene prompt.
- Shared seam integrity mattered more than keeping all reads inside the route file, so the location-events module now owns both single-location and batched recent-history reads.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added a batched location-history reader to preserve one authoritative read seam**
- **Found during:** Task 1 (Expose normalized path and local-history reads through the world API)
- **Issue:** The route needed bounded per-location recent history for every world payload location, but reading via per-location queries would recreate local-history assembly in the route and violate the "one read authority" constraint.
- **Fix:** Added `listRecentLocationEventsForLocations(...)` to `backend/src/engine/location-events.ts` and routed world payload assembly through that shared seam.
- **Files modified:** `backend/src/engine/location-events.ts`, `backend/src/routes/campaigns.ts`
- **Verification:** `npm --prefix backend test -- src/routes/__tests__/campaigns.test.ts`
- **Committed in:** `788bae5`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** The deviation tightened the plan’s stated contract by preventing API/prompt seam drift and avoiding ad hoc per-location reconstruction.

## Issues Encountered

- `src/engine/__tests__/prompt-assembler.test.ts` still prints a non-blocking warning from the unmocked episodic-vector lookup path during the lore-context test. The suite passes because prompt assembly already degrades gracefully when episodic memory is unavailable. No change was needed for this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan `43-05` can consume stable world payload `connectedPaths` and `recentHappenings` without reconstructing them from `connectedTo` or chronicle prose.
- Prompt assembly and world payloads now agree on the authoritative location-history seam, so downstream UI work can trust one backend contract for revisit memory.

## Self-Check: PASSED

- Summary file present: `.planning/phases/43-travel-and-location-state-contract-resolution/43-04-SUMMARY.md`
- Task commit present: `effa648`
- Task commit present: `788bae5`
- Task commit present: `39a86a2`
- Task commit present: `386067d`
- Stub scan found no blocking placeholder markers in files modified by this plan.

---
*Phase: 43-travel-and-location-state-contract-resolution*
*Completed: 2026-04-11*
