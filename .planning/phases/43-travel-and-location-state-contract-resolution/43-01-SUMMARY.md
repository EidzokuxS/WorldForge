---
phase: 43-travel-and-location-state-contract-resolution
plan: 01
subsystem: database
tags: [drizzle, sqlite, vitest, worldgen, travel, prompt]
requires:
  - phase: 36-gameplay-docs-to-runtime-reconciliation-audit
    provides: documented travel-by-distance and location-history gaps that Phase 43 reconciles
  - phase: 39-honest-turn-boundary-and-rollback-critical-post-turn-simulation
    provides: rollback-safe turn boundary that local location state must respect
  - phase: 41-checkpoint-and-restore-authoritative-bundle-contract
    provides: restore-safe campaign bundle contract for new location persistence
provides:
  - shared location taxonomy and summary contracts for macro, persistent sublocation, and ephemeral scene nodes
  - normalized SQLite tables for location edges and location recent events with additive migration artifacts
  - migration/backfill runner that projects legacy connected_to adjacency into location_edges without aborting on malformed payloads
  - worldgen defaults that write Phase 43 location metadata and normalized edges for fresh campaigns
  - RED backend regressions for multi-edge travel cost, shared player/NPC traversal, connectedPaths payloads, and location-local recent happenings
affects: [43-02, 43-03, 43-04, 43-05]
tech-stack:
  added: []
  patterns:
    - normalized location graph with connectedTo kept as read-only compatibility projection
    - contract-first RED backend coverage before travel and local-history implementation
key-files:
  created:
    - backend/drizzle/0005_ordinary_misty_knight.sql
    - backend/drizzle/meta/0005_snapshot.json
    - backend/src/engine/__tests__/location-graph.test.ts
  modified:
    - shared/src/types.ts
    - shared/src/index.ts
    - backend/src/db/schema.ts
    - backend/src/db/migrate.ts
    - backend/src/worldgen/scaffold-saver.ts
    - backend/src/worldgen/__tests__/scaffold-saver.test.ts
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/engine/__tests__/npc-agent.test.ts
    - backend/src/routes/__tests__/campaigns.test.ts
    - backend/src/engine/__tests__/prompt-assembler.test.ts
    - backend/drizzle/meta/_journal.json
key-decisions:
  - "locations.connectedTo stays only as a compatibility projection while location_edges becomes the authoritative travel graph."
  - "Phase 43 starts with failing backend regressions for multi-edge travel cost, connectedPaths payloads, and location-local recent happenings before implementation wiring."
patterns-established:
  - "Schema-first repair: add location kind, persistence, archive metadata, normalized edges, and recent-event projection storage before changing runtime readers."
  - "Travel/history fidelity is guarded by targeted RED tests in turn, NPC, route, and prompt seams instead of relying on doc interpretation."
requirements-completed: [GSEM-03, GSEM-04]
duration: 9min
completed: 2026-04-11
---

# Phase 43 Plan 01: Travel and Location State Contract Resolution Summary

**Typed location taxonomy, normalized edge persistence, compatibility backfill, and RED backend regressions for travel cost plus local recent happenings**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-11T15:36:54Z
- **Completed:** 2026-04-11T15:46:08Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments

- Added the shared Phase 43 location vocabulary in `@worldforge/shared`, covering node kind, persistence, connected path summaries, and recent-happening summaries.
- Extended the SQLite contract with typed location metadata, normalized `location_edges` / `location_recent_events` tables, generated Drizzle migration artifacts, and a backfill that converts legacy `connected_to` JSON into normalized edges without hard-failing on malformed payloads.
- Updated worldgen scaffold persistence to emit the same defaults as migrated campaigns and pinned the remaining work behind failing backend regressions for path-bound travel, `connectedPaths`, and location-local recent happenings.

## Task Commits

Each task was committed atomically:

1. **Task 1: Define the shared Phase 43 location contract, migration/backfill path, and worldgen-safe defaults** - `172387e` (feat)
2. **Task 2: Lock backend regressions for path-bound travel and local recent happenings** - `202ba33` (test)

## Files Created/Modified

- `shared/src/types.ts` - Adds `LocationKind`, `LocationPersistence`, graph/path summaries, and recent-happening summaries for shared Phase 43 vocabulary.
- `shared/src/index.ts` - Re-exports the new shared location types/constants.
- `backend/src/db/schema.ts` - Adds typed location lifecycle fields and normalized `location_edges` / `location_recent_events` tables.
- `backend/src/db/migrate.ts` - Runs additive Drizzle migrations, backfills legacy `connected_to` rows into normalized edges, and rewrites compatibility projections safely.
- `backend/src/worldgen/scaffold-saver.ts` - Persists new campaigns with Phase 43 defaults and normalized edge rows while keeping `connectedTo` as compatibility output.
- `backend/src/worldgen/__tests__/scaffold-saver.test.ts` - Verifies worldgen defaults, new cleanup order, and normalized edge writes.
- `backend/drizzle/0005_ordinary_misty_knight.sql` and `backend/drizzle/meta/0005_snapshot.json` - Generated additive migration artifacts for the new contract.
- `backend/src/engine/__tests__/location-graph.test.ts` - RED contract file for `resolveTravelPath` path resolution and travel cost accumulation.
- `backend/src/engine/__tests__/turn-processor.test.ts` - RED player-travel expectations for multi-edge movement and summed cost.
- `backend/src/engine/__tests__/npc-agent.test.ts` - RED NPC `move_to` expectation for the same shared travel contract.
- `backend/src/routes/__tests__/campaigns.test.ts` - RED route expectation for `connectedPaths` and per-location `recentHappenings`.
- `backend/src/engine/__tests__/prompt-assembler.test.ts` - RED prompt expectation for location-local recent happenings, including archived ephemeral-scene spillover.

## Decisions Made

- `locations.connectedTo` is still present in schema and worldgen output, but only as a read-only compatibility projection derived from normalized edges. New Phase 43 work should not treat it as graph authority.
- The migration runner fails closed on malformed legacy `connected_to` payloads by logging a warning and projecting an empty edge set, which keeps old campaigns loadable without silently preserving corrupt graph state.
- The RED suite intentionally requires later plans to implement `resolveTravelPath`, shared player/NPC traversal semantics, `connectedPaths`, and location-local recent-happenings readers before the tests can pass.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `backend/src/engine/__tests__/turn-processor.test.ts` and `backend/src/engine/__tests__/prompt-assembler.test.ts` already had local worktree edits before Task 2 started. I inspected them and layered the Phase 43 RED assertions on top without reverting or discarding those local changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan `43-02` can now implement `resolveTravelPath`, authoritative multi-edge travel cost, and shared player/NPC traversal against committed failing tests.
- Plans `43-03` and `43-04` can wire SQLite-backed `location_recent_events` writes and reader payloads for prompts/routes without having to redefine the schema contract.
- The current RED verifier for Task 2 fails for the intended reasons: missing `backend/src/engine/location-graph.ts` implementation plus unmet assertions for multi-edge travel, `connectedPaths`, and recent-happenings readback.

## Self-Check: PASSED

- Summary and generated Phase 43 files exist on disk.
- Task commits `172387e` and `202ba33` are present in git history.
- No placeholder/stub markers were found in the files changed for this plan.

---
*Phase: 43-travel-and-location-state-contract-resolution*
*Completed: 2026-04-11*
