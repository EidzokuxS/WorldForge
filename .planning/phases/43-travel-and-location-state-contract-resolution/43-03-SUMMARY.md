---
phase: 43-travel-and-location-state-contract-resolution
plan: 03
subsystem: backend
tags: [travel, locations, sqlite, lance, vitest, checkpoints]
requires:
  - phase: 43-travel-and-location-state-contract-resolution
    provides: authoritative graph travel, ephemeral scene metadata, and normalized location_recent_events storage
  - phase: 41-checkpoint-complete-simulation-restore
    provides: authoritative restore bundle for state.db-backed runtime state
provides:
  - authoritative location-events seam for SQLite-backed recent happenings with episodic source traceability
  - write-through projection from episodic event commits into anchored location_recent_events rows
  - unified runtime-writer integration for player, present-NPC, off-screen NPC, and faction/world location history
affects: [43-04, 43-05, prompt assembly, world payloads, checkpoint restore]
tech-stack:
  added: []
  patterns:
    - one authoritative location-history seam: episodic events write through to SQLite projections instead of parallel ad hoc writers
    - archived ephemeral scenes spill over into anchored persistent locations at write time so reads stay simple
key-files:
  created:
    - backend/src/engine/location-events.ts
    - backend/drizzle/0006_gigantic_chronomancer.sql
    - backend/drizzle/meta/0006_snapshot.json
  modified:
    - backend/src/db/schema.ts
    - backend/src/vectors/episodic-events.ts
    - backend/src/engine/tool-executor.ts
    - backend/src/engine/npc-tools.ts
    - backend/src/engine/npc-offscreen.ts
    - backend/src/engine/faction-tools.ts
    - backend/src/vectors/__tests__/episodic-events.test.ts
    - backend/src/engine/__tests__/tool-executor.test.ts
    - backend/src/engine/__tests__/npc-agent.test.ts
    - backend/src/engine/__tests__/npc-offscreen.test.ts
    - backend/src/engine/__tests__/world-engine.test.ts
    - backend/src/campaign/__tests__/checkpoints.test.ts
key-decisions:
  - "Episodic commits stay the only source path for source-traceable local history; storeEpisodicEvent writes through to location_recent_events instead of duplicating writer logic."
  - "Ephemeral scene consequences are anchored at write time via anchorLocationId/sourceLocationId so archived scene nodes can disappear without erasing location-local history."
  - "Faction and world simulation writes use recordLocationRecentEvent directly only when they have concrete target locations and no episodic source event exists."
patterns-established:
  - "Runtime writers resolve concrete location names before commit and skip projection when authoritative state cannot identify a location."
  - "Checkpoint fidelity for local history remains a state.db concern; tests prove restore ordering against the authoritative SQLite bundle."
requirements-completed: [GSEM-04]
duration: 10min
completed: 2026-04-11
---

# Phase 43 Plan 03: Travel and Location-State Contract Resolution Summary

**Authoritative SQLite location-history seam with episodic write-through, anchored ephemeral-scene spillover, and unified runtime writer integration**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-11T16:10:13Z
- **Completed:** 2026-04-11T16:20:43Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments

- Added `backend/src/engine/location-events.ts` as the single authoritative seam for recording and listing location-local recent happenings from SQLite state.
- Rewired episodic event commits to project into `location_recent_events` with `sourceEventId`, and anchored ephemeral-scene consequences onto persistent parent locations instead of letting them vanish with archived scene nodes.
- Finished writer integration for player `log_event`, present-NPC dialogue, off-screen NPC updates, and faction/world simulation events, while keeping checkpoint restore proof on the authoritative `state.db` bundle.

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: add failing tests for authoritative location recent-event projection and anchored ephemeral spillover** - `9afe672` (test)
2. **Task 1 GREEN: implement the location-events seam, write-through projection, and player runtime location resolution** - `8eb5ab4` (feat)
3. **Task 2 RED: add failing coverage for remaining runtime writers and restore-order proof** - `e9dde66` (test)
4. **Task 2 GREEN: wire present/off-screen NPC plus faction/world writers into the shared seam** - `c50badb` (feat)

## Files Created/Modified

- `backend/src/engine/location-events.ts` - Adds authoritative `recordLocationRecentEvent()` and `listRecentLocationEvents()` helpers over SQLite-backed local history.
- `backend/src/vectors/episodic-events.ts` - Makes `storeEpisodicEvent()` write through to `location_recent_events` with `sourceEventId` traceability.
- `backend/src/engine/tool-executor.ts` - Resolves player `log_event` writes to the current authoritative location when available.
- `backend/src/engine/npc-tools.ts` - Attaches present-NPC dialogue writes to canonical current-location context.
- `backend/src/engine/npc-offscreen.ts` - Stops off-screen updates from writing `"unknown"` when the NPC already has authoritative location state.
- `backend/src/engine/faction-tools.ts` - Projects location-targeted faction/world simulation events through the shared local-history seam.
- `backend/src/db/schema.ts`, `backend/drizzle/0006_gigantic_chronomancer.sql`, and `backend/drizzle/meta/0006_snapshot.json` - Add `source_event_id` persistence so the new seam works on existing SQLite campaigns.
- `backend/src/vectors/__tests__/episodic-events.test.ts`, `backend/src/engine/__tests__/tool-executor.test.ts`, `backend/src/engine/__tests__/npc-agent.test.ts`, `backend/src/engine/__tests__/npc-offscreen.test.ts`, `backend/src/engine/__tests__/world-engine.test.ts`, and `backend/src/campaign/__tests__/checkpoints.test.ts` - Lock the writer contract, anchored spillover, and restore-order expectations.

## Decisions Made

- Local history stays SQLite-first and event-source-aware: `location_recent_events` is the runtime projection to read later, while episodic events remain the canonical source only when there is a real episodic commit to trace.
- Anchoring happens at write time, not read time, so archived ephemeral scenes do not force downstream prompt/API readers to reconstruct spillover semantics.
- Faction/world writers do not fabricate episodic events just to populate local history; they call the shared seam directly when they already have concrete location context.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added `sourceEventId` schema support and migration for the new authoritative seam**
- **Found during:** Task 1 GREEN (location-events seam implementation)
- **Issue:** The plan required persisted source traceability, but `location_recent_events` had no `source_event_id` column, so write-through rows could not safely point back to their episodic source on existing SQLite campaigns.
- **Fix:** Extended the schema, generated Drizzle migration `0006_gigantic_chronomancer.sql`, and updated the snapshot/journal metadata before wiring the seam into runtime writers.
- **Files modified:** `backend/src/db/schema.ts`, `backend/drizzle/0006_gigantic_chronomancer.sql`, `backend/drizzle/meta/0006_snapshot.json`, `backend/drizzle/meta/_journal.json`
- **Verification:** `npm --prefix backend exec vitest run src/vectors/__tests__/episodic-events.test.ts src/engine/__tests__/tool-executor.test.ts src/campaign/__tests__/checkpoints.test.ts`
- **Committed in:** `8eb5ab4`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Required for correctness on real SQLite campaign state. No product-scope expansion.

## Issues Encountered

- The new write-through seam caused pre-existing episodic-event tests to fail until the test harness provided a default mocked state DB. I updated the harness rather than weakening the seam.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan `43-04` can now read one authoritative `location_recent_events` seam for prompt assembly and world payloads instead of re-deriving local history from prose or vectors.
- Plan `43-05` has stable backend travel/history metadata to render on `/game`, including anchored spillover from archived scene nodes.
- Checkpoint restore already proves the relevant bundle boundary: `location_recent_events` survives because it lives in authoritative `state.db`.

## Known Stubs

None.

## Self-Check: PASSED

- Summary and key implementation artifacts exist on disk.
- Task commits `9afe672`, `8eb5ab4`, `e9dde66`, and `c50badb` are present in git history.
- Stub scan found no blocking placeholder markers in files changed for this plan.

---
*Phase: 43-travel-and-location-state-contract-resolution*
*Completed: 2026-04-11*
