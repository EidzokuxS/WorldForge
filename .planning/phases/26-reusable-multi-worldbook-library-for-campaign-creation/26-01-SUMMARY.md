---
phase: 26-reusable-multi-worldbook-library-for-campaign-creation
plan: 01
subsystem: api
tags: [worldbook-library, local-first, file-storage, hono, vitest]
requires:
  - phase: 25-replace-premise-override-heuristics-with-structured-divergence-interpretation
    provides: cached ipContext and premiseDivergence campaign config seams for worldgen
provides:
  - shared reusable worldbook summary and campaign selection contracts
  - campaign config persistence for worldbookSelection snapshots
  - file-backed reusable worldbook library under campaigns/_worldbook-library
  - campaign-free worldbook library list/import endpoints
affects: [campaign-config, worldgen-routes, reusable-worldbook-library, phase-26]
tech-stack:
  added: []
  patterns: [content-hash record identity, immutable file-backed records plus index, campaign source snapshot persistence]
key-files:
  created:
    - backend/src/worldbook-library/paths.ts
    - backend/src/worldbook-library/manager.ts
    - backend/src/worldbook-library/index.ts
    - backend/src/worldbook-library/__tests__/manager.test.ts
  modified:
    - shared/src/types.ts
    - shared/src/index.ts
    - backend/src/campaign/manager.ts
    - backend/src/campaign/__tests__/manager.test.ts
    - backend/src/routes/schemas.ts
    - backend/src/routes/worldgen.ts
    - backend/src/routes/__tests__/worldgen.test.ts
key-decisions:
  - "Reusable worldbooks live under campaigns/_worldbook-library with one immutable record file per normalized content hash plus a lightweight index.json."
  - "Campaigns persist worldbookSelection as a structured snapshot beside ipContext and premiseDivergence instead of owning reusable records."
  - "The library import route parses raw JSON first, then lets the manager decide whether classification is needed so duplicate uploads skip reclassification."
patterns-established:
  - "Library identity is SHA-256 of normalized parsed WorldBook entries, not the uploaded filename."
  - "Reusable library routes do not require an active campaign; they act as local storage infrastructure for later composition flows."
requirements-completed: [P26-01]
duration: 9min
completed: 2026-03-31
---

# Phase 26 Plan 01: Reusable worldbook library contracts, storage, and routes summary

**Reusable worldbook summaries, campaign source snapshots, and content-hash file storage with campaign-free list/import routes**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-31T05:07:00Z
- **Completed:** 2026-03-31T05:15:35Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Added shared reusable worldbook metadata contracts and persisted `worldbookSelection[]` in campaign config beside cached `ipContext` and `premiseDivergence`.
- Hardened campaign listing to skip underscored storage directories so `campaigns/_worldbook-library` never appears as a broken campaign.
- Built a file-backed reusable library manager with SHA-256 content dedupe and exposed `GET /api/worldgen/worldbook-library` plus `POST /api/worldgen/worldbook-library/import`.

## Verification

- `npm --prefix backend exec vitest run src/campaign/__tests__/manager.test.ts src/worldbook-library/__tests__/manager.test.ts src/routes/__tests__/worldgen.test.ts`

## Task Commits

Each task was committed atomically:

1. **Task 1: Define reusable worldbook contracts and campaign selection persistence (RED)** - `3f3a1c5` (test)
2. **Task 1: Define reusable worldbook contracts and campaign selection persistence (GREEN)** - `df10b30` (feat)
3. **Task 2: Build the file-backed worldbook library manager and import/list routes (RED)** - `611fa16` (test)
4. **Task 2: Build the file-backed worldbook library manager and import/list routes (GREEN)** - `97939d8` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified

- `shared/src/types.ts` - shared reusable worldbook summary and campaign selection snapshot contracts.
- `shared/src/index.ts` - re-exports new shared worldbook types.
- `backend/src/campaign/manager.ts` - persists `worldbookSelection[]` and ignores underscored storage directories when listing campaigns.
- `backend/src/campaign/__tests__/manager.test.ts` - locks campaign snapshot persistence and `_worldbook-library` filtering behavior.
- `backend/src/worldbook-library/paths.ts` - defines library directory, index path, record path, and ID validation helpers.
- `backend/src/worldbook-library/manager.ts` - manages content-hash dedupe, immutable record writes, index maintenance, and record loading.
- `backend/src/worldbook-library/index.ts` - exports the library manager and path surface.
- `backend/src/worldbook-library/__tests__/manager.test.ts` - verifies duplicate imports reuse the same record and list ordering stays stable.
- `backend/src/routes/schemas.ts` - adds the reusable worldbook library import payload schema.
- `backend/src/routes/worldgen.ts` - adds reusable worldbook list/import endpoints while keeping legacy parse/import routes intact.
- `backend/src/routes/__tests__/worldgen.test.ts` - verifies the new campaign-free list/import route behavior.

## Decisions Made

- Used the normalized content hash as both stable library identity and the stored `normalizedSourceHash` so re-uploads dedupe without filename dependence.
- Kept record files immutable after first import and used `index.json` as the lightweight listing surface for later UI selection.
- Reused the shared worldbook summary shape for campaign snapshots to avoid backend/frontend contract drift.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- GitNexus MCP resources were not exposed in this session, so repo context and index freshness checks were performed through `npx gitnexus status` instead. The local index was already up to date.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 26 now has durable reusable worldbook storage and campaign-side source snapshots ready for backend multi-source composition in `26-02`.
- Later composition work can load reusable records by stable ID without reclassifying uploads or coupling them to campaign directories.

## Self-Check: PASSED

- Found summary file: `.planning/phases/26-reusable-multi-worldbook-library-for-campaign-creation/26-01-SUMMARY.md`
- Found commits: `3f3a1c5`, `df10b30`, `611fa16`, `97939d8`

---
*Phase: 26-reusable-multi-worldbook-library-for-campaign-creation*
*Completed: 2026-03-31*
