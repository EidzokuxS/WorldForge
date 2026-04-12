---
phase: 46-encounter-scope-presence-and-knowledge-boundaries
plan: 02
subsystem: gameplay-runtime
tags: [scene-scope, presence, awareness, drizzle, sqlite, vitest]
requires:
  - phase: 46-01
    provides: red regressions for encounter scope, presence, and knowledge boundaries
provides:
  - durable nullable actor scene-scope state with legacy fallback
  - shared scene presence resolver for presence, awareness, and knowledge basis
  - authoritative movement and arrival sync for player, NPC, and opening paths
affects: [46-03, 46-04, scene-assembly, chat-route, npc-routing]
tech-stack:
  added: []
  patterns: [nullable scene-scope persistence with compatibility fallback, shared presence snapshot resolver]
key-files:
  created: [backend/src/engine/scene-presence.ts, backend/drizzle/0008_dusty_tana_nile.sql]
  modified: [backend/src/db/schema.ts, backend/src/engine/turn-processor.ts, backend/src/engine/tool-executor.ts, backend/src/engine/scene-assembly.ts, backend/src/routes/chat.ts, backend/src/routes/campaigns.ts]
key-decisions:
  - "Persist only local scene scope; keep awareness and knowledge basis derived at read time."
  - "Real movement and arrival writers must set scene scope immediately instead of relying on later backfill."
patterns-established:
  - "Actor scene scope = currentSceneLocationId ?? currentLocationId."
  - "Player-facing scene reads consume a shared presence snapshot instead of raw same-location membership."
requirements-completed: [SCEN-02]
duration: 15min
completed: 2026-04-12
---

# Phase 46 Plan 02: Encounter Scope, Presence & Knowledge Boundaries Summary

**Durable local scene scope with shared presence resolution, legacy fallback, and authoritative movement/arrival sync**

## Performance

- **Duration:** 15 min
- **Started:** 2026-04-12T13:14:00+03:00
- **Completed:** 2026-04-12T13:28:50+03:00
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Added nullable `currentSceneLocationId` columns for players and NPCs through an additive SQLite-safe migration.
- Synced player, NPC, opening, save-character, and off-screen re-entry paths so local scene scope stays authoritative instead of inert.
- Introduced `scene-presence.ts` as the shared resolver for encounter presence, awareness hints, and justified knowledge basis, then fed scene assembly from it.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add minimal durable scene-scope state with safe fallback for legacy campaigns** - `d93d3f9` (`feat`)
2. **Task 2: Implement the shared presence snapshot resolver** - `14a7bc8` (`feat`)
3. **Plan metadata:** pending final docs commit

## Files Created/Modified

- `backend/src/engine/scene-presence.ts` - Shared encounter-scope, awareness, and knowledge-basis resolver.
- `backend/src/db/schema.ts` - Durable actor scene-scope columns.
- `backend/drizzle/0008_dusty_tana_nile.sql` - Additive SQLite migration for scene-scope columns.
- `backend/src/engine/turn-processor.ts` - Opening/movement scene-scope alignment and pre-visible handoff.
- `backend/src/engine/tool-executor.ts` - Player movement and spawned NPC scene-scope sync.
- `backend/src/engine/npc-tools.ts` - NPC movement scene-scope sync.
- `backend/src/engine/npc-offscreen.ts` - Off-screen re-entry scene-scope realignment.
- `backend/src/engine/scene-assembly.ts` - Shared presence-driven visible scene assembly with awareness hints.
- `backend/src/routes/chat.ts` - Present-scene settlement now keys off local scene scope.
- `backend/src/routes/campaigns.ts` - World payload compatibility fields expose `sceneScopeId`.
- `backend/src/routes/character.ts` - Save-character initialization aligns starting scene scope.
- `backend/src/engine/__tests__/scene-presence.test.ts` - Resolver contract coverage.
- `backend/src/engine/__tests__/tool-executor.test.ts` - Movement/arrival lifecycle coverage.
- `backend/src/engine/__tests__/turn-processor.test.ts` - Legacy fallback and player movement lifecycle coverage.
- `backend/src/routes/__tests__/chat.test.ts` - Local scene settlement coverage in the route seam.

## Decisions Made

- Used a nullable actor-level `currentSceneLocationId` field as the minimum durable seam. This separates broad location membership from immediate encounter scope without forcing a backfill or table rebuild.
- Kept awareness and knowledge basis read-derived inside one resolver. That preserves flexibility for later prompt/NPC routing work without storing brittle omniscience state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Extended scene-scope sync to off-screen re-entry and start-of-play initialization**
- **Found during:** Task 1 (durable scene-scope lifecycle wiring)
- **Issue:** Limiting sync to the originally listed movement writers would leave `currentSceneLocationId` stale for NPC off-screen re-entry and fresh player start-of-play initialization.
- **Fix:** Updated `backend/src/engine/npc-offscreen.ts` and `backend/src/routes/character.ts` so real arrival paths also set local scene scope authoritatively.
- **Files modified:** `backend/src/engine/npc-offscreen.ts`, `backend/src/routes/character.ts`
- **Verification:** `npm --prefix backend exec vitest run src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts`
- **Committed in:** `d93d3f9`

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Necessary for correctness. The plan goal stayed the same; the extra wiring closed real lifecycle gaps so the durable field is authoritative on actual arrival paths.

## Issues Encountered

- `npm --prefix backend run typecheck` still fails in unrelated pre-existing files outside this plan. Those failures were logged in `deferred-items.md`; task verification relied on the targeted backend Vitest suites instead.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Local scene scope now exists as durable runtime truth and scene assembly can read one shared presence snapshot.
- Phase `46-03` can rewire prompt assembly and NPC routing to the same resolver instead of same-location shortcuts.
- Repo-wide backend typecheck still has unrelated outstanding failures recorded in `deferred-items.md`.

## Self-Check: PASSED

- Verified summary file exists.
- Verified task commits `d93d3f9` and `14a7bc8` exist in git history.
