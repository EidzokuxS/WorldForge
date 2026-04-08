---
phase: 37-campaign-loaded-gameplay-transport
plan: 01
subsystem: api
tags: [hono, zod, vitest, gameplay, campaign-loading]
requires:
  - phase: 36-gameplay-docs-to-runtime-reconciliation-audit
    provides: session-coupling audit for gameplay transport and the Phase 37 integrity boundary
provides:
  - explicit `campaignId` validation for `/api/chat/history`, `/api/chat/action`, `/api/chat/retry`, `/api/chat/undo`, and `/api/chat/edit`
  - `requireLoadedCampaign()` resolution for targeted gameplay routes after reload
  - campaign-scoped in-memory retry and undo snapshots keyed by `campaignId`
affects: [37-02 frontend gameplay wiring, 39 honest retry-and-undo boundary]
tech-stack:
  added: []
  patterns: [explicit campaign-addressed gameplay requests, reload-safe campaign resolution, campaign-scoped snapshot maps]
key-files:
  created: [.planning/phases/37-campaign-loaded-gameplay-transport/37-01-SUMMARY.md]
  modified: [backend/src/routes/chat.ts, backend/src/routes/schemas.ts, backend/src/routes/__tests__/chat.test.ts]
key-decisions:
  - "GET /api/chat/history stays under `/api/chat/*` and takes `campaignId` via query string, not a GET body."
  - "The targeted gameplay routes now trust `requireLoadedCampaign()` instead of an already-active singleton session."
  - "Undo and retry snapshot state is keyed by `campaignId` so campaigns cannot consume each other's in-memory rollback state."
patterns-established:
  - "Gameplay transport contract: history uses `?campaignId=...`; targeted POST routes require `campaignId` in JSON."
  - "Reload-safe route pattern: validate request identity first, then call `await requireLoadedCampaign(c, campaignId)` before route logic."
requirements-completed: [RINT-01]
duration: 8min
completed: 2026-04-08
---

# Phase 37 Plan 01: Campaign-Loaded Gameplay Transport Summary

**Reload-safe `/api/chat/*` transport with explicit `campaignId` validation, `requireLoadedCampaign()` resolution, and campaign-scoped undo/retry snapshots**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-08T16:18:16Z
- **Completed:** 2026-04-08T16:26:06Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added explicit request validation for the targeted gameplay routes so campaign identity is carried in the transport contract instead of hidden in process state.
- Switched `history`, `action`, `retry`, `undo`, and `edit` to `requireLoadedCampaign()` so a reloaded campaign can be addressed directly.
- Replaced the single last-turn snapshot with a `Map<string, TurnSnapshot>` and locked the behavior with backend regression tests.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add explicit `campaignId` validation for every targeted gameplay route** - `17f2a7b` (test), `1dbf38a` (feat)
2. **Task 2: Resolve targeted gameplay routes through `requireLoadedCampaign()` and isolate snapshots by `campaignId`** - `04d34ce` (test), `17a5b69` (feat)

_Note: TDD tasks produced separate RED and GREEN commits._

## Files Created/Modified
- `backend/src/routes/schemas.ts` - reusable `campaignId` schema plus history/retry/undo request schemas.
- `backend/src/routes/chat.ts` - async history loading, `requireLoadedCampaign()` authority, and campaign-scoped snapshot storage.
- `backend/src/routes/__tests__/chat.test.ts` - route regressions for explicit contract, reload-safe history, and snapshot isolation.

## Decisions Made

- Used a query-string `campaignId` for `GET /api/chat/history` to stay HTTP-conventional while making campaign identity explicit.
- Left the legacy plain-text `POST /api/chat` route on `getActiveCampaign()` to preserve the scoped Phase 37 boundary.
- Scoped retry/undo snapshot state by `campaignId` instead of widening into persistent rollback history.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- Existing history tests assumed singleton session authority; they were updated to the explicit query-param contract during Task 2.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 37-02 can now wire frontend gameplay helpers to a precise backend contract: `GET /api/chat/history?campaignId=<id>` plus targeted POST bodies that include `campaignId`.
- The backend seam is still intentionally narrow: legacy `POST /api/chat` remains active-session based, and snapshot history is still single-step and in-memory only.

## Self-Check: PASSED

- Found `.planning/phases/37-campaign-loaded-gameplay-transport/37-01-SUMMARY.md`
- Verified task commits `17f2a7b`, `1dbf38a`, `04d34ce`, and `17a5b69` in git history

---
*Phase: 37-campaign-loaded-gameplay-transport*
*Completed: 2026-04-08*
