---
phase: 33-browser-e2e-verification-for-redesigned-creation-flows
plan: 07
subsystem: ui
tags: [nextjs, react, hono, vitest, route-guards]
requires:
  - phase: 33-05
    provides: shared shell foundation and routed creation flow baseline
provides:
  - readiness-aware shell navigation for review and character routes
  - explicit load-button-only campaign activation in the launcher dialog
  - frontend generation-required guards for review and character pages
  - backend generated-world guard on /api/campaigns/:id/world
affects: [non-game-shell, campaign-routes, backend-campaigns, phase-33-uat-gap-2]
tech-stack:
  added: []
  patterns: [shell-scoped campaign readiness context, 409 generated-world guard]
key-files:
  created: [frontend/components/non-game-shell/campaign-status-provider.tsx]
  modified:
    [
      frontend/app/(non-game)/layout.tsx,
      frontend/components/non-game-shell/app-shell.tsx,
      frontend/components/non-game-shell/app-sidebar.tsx,
      frontend/components/title/load-campaign-dialog.tsx,
      frontend/app/(non-game)/campaign/[id]/review/page.tsx,
      frontend/app/(non-game)/campaign/[id]/character/page.tsx,
      backend/src/routes/helpers.ts,
      backend/src/routes/campaigns.ts,
      frontend/components/title/__tests__/load-campaign-dialog.test.tsx,
      frontend/app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx,
      frontend/app/(non-game)/campaign/[id]/character/__tests__/page.test.tsx,
      backend/src/routes/__tests__/campaigns.test.ts,
    ]
key-decisions:
  - "Campaign readiness is derived from the routed campaign id plus active-campaign fallback so shell links reflect real generation state."
  - "Generated-world requests now return HTTP 409 with a clear readiness error instead of serving empty pseudo-world data."
patterns-established:
  - "Non-game shell navigation reads a shared campaign-status context with a safe no-provider fallback for isolated renders."
  - "Review and character routes show a generation-required callout whenever campaign metadata or the backend reports the world is incomplete."
requirements-completed: [P33-01, P33-02, P33-04]
duration: 6 min
completed: 2026-04-02
---

# Phase 33 Plan 07: Readiness Guard Summary

**Shell-scoped campaign readiness context, generation-required page guards, explicit load-button activation, and a 409 backend world-readiness seam**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-02T01:24:33+03:00
- **Completed:** 2026-04-02T01:30:16+03:00
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Added failing regressions for whole-card campaign loading, not-ready review/character routes, and incomplete generated-world API access.
- Mounted a shared campaign-status provider in the non-game layout so the sidebar only exposes review/character navigation after generation completes.
- Guarded review and character pages with a clear "World generation required" callout and made `/api/campaigns/:id/world` fail fast with a 409 readiness response.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add readiness and campaign-loading regressions** - `bb58a6c` (`test`)
2. **Task 2: Implement frontend readiness gating and the backend generated-world guard** - `f8743e6` (`feat`)

## Files Created/Modified

- `frontend/components/non-game-shell/campaign-status-provider.tsx` - Shared campaign readiness state for shell navigation.
- `frontend/app/(non-game)/layout.tsx` - Mounts the readiness provider around the non-game shell.
- `frontend/components/non-game-shell/app-shell.tsx` - Suppresses the redundant creation-route fallback CTA.
- `frontend/components/non-game-shell/app-sidebar.tsx` - Hides review/character links until the current campaign is generation-ready.
- `frontend/components/title/load-campaign-dialog.tsx` - Removes whole-card loading so only the explicit Load button activates a campaign.
- `frontend/app/(non-game)/campaign/[id]/review/page.tsx` - Blocks review with a generation-required callout before scaffold loading.
- `frontend/app/(non-game)/campaign/[id]/character/page.tsx` - Blocks character creation with a generation-required callout before editor loading.
- `backend/src/routes/helpers.ts` - Adds `requireGeneratedCampaign` for generated-world route guards.
- `backend/src/routes/campaigns.ts` - Uses the generated-world readiness guard on `/api/campaigns/:id/world`.
- `frontend/components/title/__tests__/load-campaign-dialog.test.tsx` - Proves whole-card clicks no longer load campaigns.
- `frontend/app/(non-game)/campaign/[id]/review/__tests__/page.test.tsx` - Covers the blocked review path for incomplete campaigns.
- `frontend/app/(non-game)/campaign/[id]/character/__tests__/page.test.tsx` - Covers the blocked character path for backend not-ready responses.
- `backend/src/routes/__tests__/campaigns.test.ts` - Verifies `/world` returns a clear 409 not-ready response.

## Decisions Made

- Used a shell-level readiness provider that resolves the routed campaign from `getActiveCampaign()` with `loadCampaign()` fallback, so navigation state is based on campaign readiness instead of pathname shape alone.
- Standardized incomplete generated-world access on a 409 API response, then treated that response as a first-class frontend guard condition.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added a safe default for isolated shell renders**
- **Found during:** Task 2
- **Issue:** Moving readiness state into shell context caused isolated `AppShell` renders and tests to depend on the non-game layout provider.
- **Fix:** Changed `useCampaignStatus()` to return a safe default when no provider is mounted, while keeping the real provider active in the non-game layout.
- **Files modified:** `frontend/components/non-game-shell/campaign-status-provider.tsx`
- **Verification:** `npm --prefix frontend exec vitest run "frontend/components/non-game-shell/__tests__/app-shell.test.tsx"`
- **Committed in:** `f8743e6`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The deviation preserved the intended shared readiness contract without broadening scope or breaking isolated shell tests.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Gap 2 readiness coverage is now in place across shell navigation, page entry, and the `/world` API seam.
- Ready for the remaining Phase 33 plans to validate creation-flow reruns against these guards.
- Plan `33-06` still remains open separately in the phase directory, so overall Phase 33 execution is not yet complete.

## Self-Check: PASSED

---
*Phase: 33-browser-e2e-verification-for-redesigned-creation-flows*
*Completed: 2026-04-02*
