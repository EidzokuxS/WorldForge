---
phase: 37-campaign-loaded-gameplay-transport
plan: 02
subsystem: ui
tags: [nextjs, react, vitest, gameplay, transport]
requires:
  - phase: 37-01
    provides: explicit campaign-addressed backend chat contract for history, action, retry, undo, and edit
provides:
  - explicit frontend gameplay helpers that require campaignId
  - /game bootstrap and handlers wired to named campaign-aware helpers
  - regression coverage for remembered-campaign reload and explicit helper payloads
affects: [phase-38-authoritative-inventory, gameplay-runtime, frontend-api-contract]
tech-stack:
  added: []
  patterns:
    - explicit campaign-aware chat helper layer in frontend/lib/api.ts
    - canonical /game page delegates targeted gameplay transport through named helpers
key-files:
  created: []
  modified:
    - frontend/lib/api.ts
    - frontend/lib/__tests__/api.test.ts
    - frontend/app/game/page.tsx
    - frontend/app/game/__tests__/page.test.tsx
key-decisions:
  - "Shared ChatHistoryResponse now lives in frontend/lib/api.ts so /game imports one typed gameplay contract."
  - "The /game page keeps active-campaign-first bootstrap with remembered-campaign fallback, but every targeted gameplay request uses activeCampaign.id explicitly."
patterns-established:
  - "Frontend gameplay transport helpers must require campaignId instead of relying on hidden session state."
  - "Page-level gameplay code should call named chat helpers rather than raw apiGet/apiStreamPost for targeted chat routes."
requirements-completed: [RINT-01]
duration: 4 min
completed: 2026-04-08
---

# Phase 37 Plan 02: Campaign-Loaded Gameplay Transport Summary

**Explicit campaign-addressed frontend gameplay helpers and `/game` page wiring for reload-safe history, action, retry, undo, and edit flows**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-08T16:29:20Z
- **Completed:** 2026-04-08T16:33:44Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Added explicit `chatHistory(campaignId)` and `chatAction(campaignId, ...)` helpers and updated retry, undo, and edit to require `campaignId`.
- Rewired `/game` bootstrap to fetch history through `chatHistory(campaign.id)` after active-or-remembered campaign resolution.
- Rewired `/game` submit, retry, undo, and edit handlers to send `activeCampaign.id` through the named helper layer and locked the behavior with page regressions.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create explicit frontend gameplay helpers for query-based history and body-based action control** - `09c032f` (test), `d6fbd30` (feat)
2. **Task 2: Rewire `/game` to call the explicit campaign helpers after active-or-remembered bootstrap** - `b74dc84` (test), `3daffab` (feat)

## Files Created/Modified
- `frontend/lib/api.ts` - exports typed campaign-aware gameplay helpers and the shared `ChatHistoryResponse`.
- `frontend/lib/__tests__/api.test.ts` - verifies exact history URL and action/retry/undo/edit payloads, including streaming versus JSON helper behavior.
- `frontend/app/game/page.tsx` - routes bootstrap and gameplay handlers through the explicit helper surface.
- `frontend/app/game/__tests__/page.test.tsx` - proves remembered-campaign reload and gameplay handlers pass the explicit campaign id.

## Decisions Made
- Moved the page-local chat history type into the shared API layer so helper consumers use one frontend contract.
- Kept `/game` as the canonical route and preserved active-first bootstrap order while removing targeted chat-route calls to generic transport helpers.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Frontend and backend now agree on the explicit campaign-addressed gameplay transport seam required by `RINT-01`.
- Subsequent gameplay fidelity phases can build on `/game` without reintroducing session-coupled history or turn-control requests.

## Self-Check: PASSED

- Found `.planning/phases/37-campaign-loaded-gameplay-transport/37-02-SUMMARY.md`
- Found commits `09c032f`, `d6fbd30`, `b74dc84`, and `3daffab`

---
*Phase: 37-campaign-loaded-gameplay-transport*
*Completed: 2026-04-08*
