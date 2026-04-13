---
phase: 53-gameplay-route-convergence-and-reload-stable-research-log
plan: 01
subsystem: api
tags: [chat, gameplay, sse, history, vitest]
requires:
  - phase: 45-authoritative-scene-assembly-and-start-of-play-runtime
    provides: authoritative opening/action narration lanes
  - phase: 47-storyteller-output-quality-and-anti-slop-prompting
    provides: guarded storyteller preset path for live narration
  - phase: 49-search-grounding-and-in-game-research-semantics
    provides: grounded lookup SSE flow and lookup semantics
provides:
  - Shared lookup-log formatter/parser contract for persisted factual replies
  - Hard-failed legacy POST /api/chat route that can no longer bypass authoritative gameplay narration
  - Reload-stable lookup and compare persistence on chat_history.json
affects: [53-02 frontend route-matrix convergence, gameplay reload hydration, research-log rendering]
tech-stack:
  added: []
  patterns: [shared lookup-log contract, factual lookup persistence before SSE success, route retirement via 410]
key-files:
  created: [.planning/phases/53-gameplay-route-convergence-and-reload-stable-research-log/53-01-SUMMARY.md]
  modified:
    - shared/src/chat.ts
    - shared/src/index.ts
    - shared/src/__tests__/chat.test.ts
    - backend/src/campaign/chat-history.ts
    - backend/src/campaign/__tests__/chat-history.test.ts
    - backend/src/routes/chat.ts
    - backend/src/routes/__tests__/chat.test.ts
key-decisions:
  - "Legacy POST /api/chat now returns 410 Gone immediately instead of attempting compatibility behavior."
  - "Persisted compare replies use [Lookup: compare] while live lookup_result SSE keeps the original grounded lookup payload."
  - "Lookup success now requires history persistence first, so reload truth cannot drift behind the live SSE reply."
patterns-established:
  - "Shared lookup-log text is formatted and parsed in @worldforge/shared instead of backend/frontend regex drift."
  - "Lookup and compare writes reuse chat_history.json with raw slash-command user entries plus factual assistant entries."
requirements-completed: [SCEN-01, WRIT-01, RES-01]
duration: 8 min
completed: 2026-04-13
---

# Phase 53 Plan 01: Gameplay Route Convergence Summary

**Legacy gameplay narration bypass retired with 410 responses, plus reload-stable lookup/compare history persisted through the authoritative chat lane**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-13T11:30:14Z
- **Completed:** 2026-04-13T11:37:59Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- Added canonical `formatLookupLogEntry()` and `parseLookupLogEntry()` helpers in `@worldforge/shared`.
- Retired legacy `POST /api/chat` so live narration cannot bypass Phase 45/47 gameplay routes.
- Persisted `/chat/lookup` and compare exchanges into `chat_history.json` without creating live turn snapshots.
- Locked the backend/shared contract with targeted regressions for lookup history, compare history, and route retirement.
- Completed pre-edit GitNexus impact checks for `appendChatMessages`, `getChatHistory`, `isChatMessage`, and `callStoryteller`; all returned `LOW`, so no HIGH/CRITICAL pre-edit risk was ignored.

## Task Commits

1. **Task 1: Lock the backend lookup-history and route-retirement contract in regressions** - `bd45f56` (`test`)
2. **Task 2: Implement one authoritative backend gameplay lane and persisted factual lookup logging** - `25518a5` (`feat`)

## Files Created/Modified

- `shared/src/chat.ts` - shared formatter/parser for persisted lookup log entries
- `shared/src/index.ts` - re-export surface for the new shared lookup helpers
- `shared/src/__tests__/chat.test.ts` - round-trip coverage for lookup, compare, and power_profile log entries
- `backend/src/campaign/chat-history.ts` - helper for canonical persisted lookup message pairs
- `backend/src/campaign/__tests__/chat-history.test.ts` - persistence round-trip coverage for lookup and compare entries
- `backend/src/routes/chat.ts` - 410 retirement for legacy `/chat` plus lookup persistence on success
- `backend/src/routes/__tests__/chat.test.ts` - route coverage for 410, persisted lookup history, compare history, and no snapshot unlock

## Decisions Made

- Legacy `/api/chat` was hard-failed instead of translated onto `/action`; the old route contract lacks campaign-targeted SSE semantics and keeping it live would preserve the bypass.
- Compare persistence is stored as `[Lookup: compare]` so history distinguishes compare responses from generic lookup replies, while the live lookup SSE payload remains unchanged for existing clients.
- Lookup writes happen before `lookup_result`/`done` emission so reload history stays truthful when the response succeeds.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reset route test defaults to avoid leaked mock implementations**
- **Found during:** Task 2 (green verification)
- **Issue:** An earlier route test left `mockedGetPremise` throwing, which made the new lookup-history GET assertions fail with a false 500.
- **Fix:** Re-established default campaign/premise mocks in the shared `beforeEach` harness for `backend/src/routes/__tests__/chat.test.ts`.
- **Files modified:** `backend/src/routes/__tests__/chat.test.ts`
- **Verification:** Phase 53 shared/backend suite passed cleanly after the harness reset.
- **Committed in:** `25518a5`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** No scope creep. The fix only stabilized the intended regression surface.

## Issues Encountered

- The initial Vitest invocation hit a Node OOM in the shared runner. Re-running with `NODE_OPTIONS=--max-old-space-size=4096` resolved the environment issue and produced stable verification.
- `gitnexus_detect_changes({ scope: "all" })` reported `CRITICAL` because the repository already had extensive unrelated local changes. Using `scope: "staged"` isolated the Phase 53 files; the green implementation then showed `HIGH` because `backend/src/routes/chat.ts` is a route-level surface, but targeted tests for the affected seams passed.
- `backend/src/ai/storyteller.ts:callStoryteller` no longer has a live gameplay caller after the 410 retirement. The orphaned legacy seam was intentionally deferred rather than removed in this plan because it is outside the user-owned file scope.

## Known Stubs

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend/shared lookup logging and legacy-route retirement are complete and regression-covered.
- Phase 53-02 can now consume the shared parser on the frontend to finish compare/lookup reload rendering convergence on `/game`.

## Self-Check

PASSED

- FOUND: `.planning/phases/53-gameplay-route-convergence-and-reload-stable-research-log/53-01-SUMMARY.md`
- FOUND: `bd45f56`
- FOUND: `25518a5`

---
*Phase: 53-gameplay-route-convergence-and-reload-stable-research-log*
*Completed: 2026-04-13*
