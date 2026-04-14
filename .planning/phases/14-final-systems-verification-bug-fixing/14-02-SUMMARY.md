---
phase: 14-final-systems-verification-bug-fixing
plan: 02
subsystem: bugfix
tags: [sse, state-update, lore-extraction, retry, resilience, glm]

requires:
  - phase: 03-world-state-mechanics
    provides: "World data refresh and location sidebar panels"
  - phase: 11-lore-cards
    provides: "Lore extraction pipeline with generateObject"
provides:
  - "Reactive location sidebar that updates on every state_update SSE event"
  - "Resilient lore extraction with retry + reduced-schema fallback"
affects: [gameplay, worldgen-pipeline]

tech-stack:
  added: []
  patterns:
    - "Retry with reduced schema fallback for structured LLM output"

key-files:
  created: []
  modified:
    - frontend/app/game/page.tsx
    - backend/src/worldgen/lore-extractor.ts

key-decisions:
  - "No debounce on onStateUpdate refresh -- state_update events are infrequent (1-3 per turn)"
  - "3 total lore extraction attempts: 2 full-size, 1 reduced-size (10-30 cards)"
  - "2s delay between retries to allow provider recovery"

patterns-established:
  - "Retry with schema reduction: when LLM provider fails on large structured output, retry with smaller min constraint"

requirements-completed: []

duration: 2min
completed: 2026-03-20
---

# Phase 14 Plan 02: Location Sidebar + Lore Extraction Bug Fixes Summary

**Reactive sidebar refresh on state_update SSE events + lore extraction retry with reduced-schema fallback for GLM-5 Turbo**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-20T06:35:22Z
- **Completed:** 2026-03-20T06:37:14Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Location sidebar now updates immediately when Storyteller calls movement/spawn tools mid-stream
- Lore extraction retries 2x at full size (20-60 cards), then falls back to reduced size (10-30 cards)
- Error messages include provider model name for debugging failed extractions

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix location sidebar to update on state_update events** - `199258b` (fix)
2. **Task 2: Make lore extraction resilient with retry and graceful fallback** - `5c64a2f` (fix)

## Files Created/Modified
- `frontend/app/game/page.tsx` - onStateUpdate callback now calls refreshWorldData in both submitAction and handleRetry
- `backend/src/worldgen/lore-extractor.ts` - Retry loop (MAX_RETRIES=2) + reduced-schema fallback + createLogger diagnostics

## Decisions Made
- No debounce on state_update refresh -- events are infrequent (1-3 per turn), multiple rapid GETs are harmless
- 3 total lore extraction attempts: 2 at full size (min 20), 1 at reduced size (min 10)
- 2-second delay between retries gives transient provider errors time to resolve

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both bugs fixed, ready for 14-03 (final verification pass)
- Location sidebar is fully reactive to game state changes
- Lore extraction is resilient against GLM-5 Turbo and other providers

---
*Phase: 14-final-systems-verification-bug-fixing*
*Completed: 2026-03-20*
