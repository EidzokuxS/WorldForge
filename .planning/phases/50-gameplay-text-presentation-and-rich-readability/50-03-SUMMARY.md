---
phase: 50-gameplay-text-presentation-and-rich-readability
plan: 03
subsystem: settings
tags: [settings, ui, nextjs, zod, vitest, typescript]
requires: []
provides:
  - persisted `settings.ui.showRawReasoning` contract across shared, backend, and frontend settings flows
  - dedicated `Gameplay` settings tab with a debug-only raw reasoning toggle
affects: [phase-50-04, settings, gameplay-ui, reasoning-disclosure]
tech-stack:
  added: []
  patterns:
    - shared gameplay/debug toggles live under `settings.ui`
    - settings toggles persist through the existing page-level debounced save flow
key-files:
  created:
    - frontend/components/settings/gameplay-tab.tsx
  modified:
    - shared/src/types.ts
    - shared/src/settings.ts
    - backend/src/settings/manager.ts
    - backend/src/routes/schemas.ts
    - backend/src/routes/__tests__/settings.test.ts
    - frontend/app/(non-game)/settings/page.tsx
    - frontend/app/(non-game)/settings/__tests__/page.test.tsx
key-decisions:
  - "Raw reasoning visibility lives in `settings.ui.showRawReasoning` so future gameplay/debug toggles stay under one namespace."
  - "The Gameplay toggle reuses the existing settings fetch/save path instead of local storage or component-only state."
patterns-established:
  - "Settings namespace pattern: add new persisted UI flags under `settings.ui` and normalize them in backend settings authority."
  - "Settings page pattern: new settings surfaces plug into page-level `settings` state and inherit the debounced autosave behavior."
requirements-completed: [UX-01]
duration: 12 min
completed: 2026-04-13
---

# Phase 50 Plan 03: Persisted reasoning-visibility settings gate and Gameplay settings tab Summary

**Persisted `ui.showRawReasoning` settings contract with backend normalization and a dedicated Gameplay settings tab for the debug-only raw reasoning toggle**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-13T07:50:00+03:00
- **Completed:** 2026-04-13T08:01:40+03:00
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Added one authoritative persisted settings field, `ui.showRawReasoning`, with shared types, default `false`, backend normalization, and route validation.
- Proved the backend round-trip and legacy normalization behavior with RED/GREEN route tests.
- Added a dedicated `Gameplay` tab to Settings with a debug-only `Show raw reasoning` switch wired through the existing autosave flow and remount persistence.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend the shared and backend settings contract for raw reasoning visibility** - `fae4947` (test), `ff730ea` (feat)
2. **Task 2: Add the dedicated Gameplay settings tab and reasoning toggle UI** - `66f8151` (test), `728df41` (feat)

_Note: Both tasks followed TDD with separate RED and GREEN commits._

## Files Created/Modified
- `shared/src/types.ts` - Added `UiConfig` and `settings.ui.showRawReasoning` to the shared settings contract.
- `shared/src/settings.ts` - Defaulted `ui.showRawReasoning` to `false`.
- `backend/src/settings/manager.ts` - Normalized and persisted the new `ui` settings namespace for legacy and current payloads.
- `backend/src/routes/schemas.ts` - Extended `/api/settings` payload validation with `ui.showRawReasoning`.
- `backend/src/routes/__tests__/settings.test.ts` - Locked route round-trip and legacy normalization behavior for the new flag.
- `frontend/components/settings/gameplay-tab.tsx` - Added the dedicated Gameplay settings surface with the debug-only raw reasoning switch.
- `frontend/app/(non-game)/settings/page.tsx` - Mounted the new `Gameplay` tab in the existing settings page save flow.
- `frontend/app/(non-game)/settings/__tests__/page.test.tsx` - Proved the Gameplay tab, save payload, and remount persistence path.

## Decisions Made
- Used the shared `settings.ui` namespace instead of a standalone root boolean so future gameplay/debug toggles have one persisted home.
- Kept the toggle on the existing settings page autosave path to avoid local-only state drift and keep `/api/settings` as the authority.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `gitnexus_detect_changes({ scope: "all" })` was contaminated by unrelated pre-existing and parallel workspace changes, so it could not isolate Plan `50-03` scope on its own.
- Commit-local verification via `git show` for `fae4947`, `ff730ea`, `66f8151`, and `728df41` confirmed the plan's actual file set stayed limited to the expected settings-contract and settings-UI files.
- GitNexus did not index `settingsPayloadSchema` as a standalone impact target even after re-analysis; validation coverage was therefore enforced by direct source review plus route tests.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase `50-04` can now consume `settings.ui.showRawReasoning` as the persisted gate for reasoning transport and `/game` disclosure rendering.
- Backend and frontend settings seams are in place; the remaining work is transport/render behavior, not settings persistence.

## Self-Check

PASSED

- FOUND: `.planning/phases/50-gameplay-text-presentation-and-rich-readability/50-03-SUMMARY.md`
- FOUND commit: `fae4947`
- FOUND commit: `ff730ea`
- FOUND commit: `66f8151`
- FOUND commit: `728df41`

---
*Phase: 50-gameplay-text-presentation-and-rich-readability*
*Completed: 2026-04-13*
