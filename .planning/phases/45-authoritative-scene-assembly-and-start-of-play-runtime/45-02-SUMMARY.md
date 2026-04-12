---
phase: 45-authoritative-scene-assembly-and-start-of-play-runtime
plan: 02
subsystem: api
tags: [backend, sse, runtime, narration, scene-assembly]
requires:
  - phase: 45-01
    provides: failing regressions and product contract for authoritative scene assembly
provides:
  - authoritative scene-assembly seam for final visible narration
  - split hidden tool-driving resolution from persisted visible narration
  - pre-narration present-scene settlement and explicit opening-scene SSE path
affects: [phase-45, gameplay-runtime, chat-routes, turn-processing]
tech-stack:
  added: []
  patterns: [two-pass storyteller flow, typed scene-effects assembly, pre-narration local settlement]
key-files:
  created: [backend/src/engine/scene-assembly.ts]
  modified: [backend/src/engine/turn-processor.ts, backend/src/engine/storyteller-contract.ts, backend/src/engine/prompt-assembler.ts, backend/src/engine/index.ts, backend/src/engine/__tests__/turn-processor.test.ts, backend/src/engine/__tests__/prompt-assembler.test.ts, backend/src/routes/chat.ts, backend/src/routes/schemas.ts, backend/src/routes/__tests__/chat.test.ts]
key-decisions:
  - "Hidden tool-driving resolution and visible narration now run as separate storyteller passes so no partial hidden prose can leak into persisted assistant output."
  - "Present-scene NPC settlement now runs before the final narration pass, while off-screen NPC, reflection, and faction work stays inside rollback-critical post-narration finalization."
  - "Campaigns with no assistant history must request an opening scene through a dedicated backend SSE path instead of premise fallback."
patterns-established:
  - "Authoritative scene assembly: final narration consumes a typed scene-effects contract built from settled runtime state."
  - "Scene-settling progress: the runtime emits explicit settling phases for hidden resolution, local settlement, and opening generation."
requirements-completed: [SCEN-01]
duration: 5 min
completed: 2026-04-12
---

# Phase 45 Plan 02: Authoritative Scene Assembly & Start-of-Play Runtime Summary

**Two-pass turn narration with authoritative scene assembly, pre-narration present-scene settlement, and a dedicated opening-scene backend path**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-12T10:53:33+03:00
- **Completed:** 2026-04-12T10:58:27+03:00
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Added a dedicated `scene-assembly.ts` seam so final visible narration is assembled from authoritative opening state, local scene facts, and player-perceivable same-turn effects.
- Split turn processing into a hidden tool-driving pass and a final visible narration pass, with duplicate-block collapse before assistant persistence.
- Moved local present-scene NPC settlement ahead of narration, kept off-screen/reflection/faction work inside rollback-critical finalization, and added `POST /chat/opening` for zero-assistant campaigns.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add an authoritative scene-assembly seam and split hidden resolution from visible narration** - `8b7e5a3` (feat)
2. **Task 2: Move local present-scene settlement ahead of visible narration and leave global finalization post-narration** - `a98eecf` (feat)

## Files Created/Modified
- `backend/src/engine/scene-assembly.ts` - Typed authoritative scene-effects assembly for opening and same-turn visible narration inputs.
- `backend/src/engine/turn-processor.ts` - Two-pass storyteller sequencing, scene-settling progress events, duplicate-block collapse, and opening-scene generation.
- `backend/src/engine/storyteller-contract.ts` - Distinct bounded rules for hidden tool-driving and final visible narration passes.
- `backend/src/engine/prompt-assembler.ts` - Final narration prompt assembly from authoritative scene state instead of premise fallback.
- `backend/src/engine/index.ts` - Engine exports for the new opening-scene and scene-settlement seams.
- `backend/src/engine/__tests__/turn-processor.test.ts` - Regressions covering final narration ordering, scene settlement, and duplicate visible-block suppression.
- `backend/src/engine/__tests__/prompt-assembler.test.ts` - Coverage for bounded final narration inputs and pass-specific prompt rules.
- `backend/src/routes/chat.ts` - Opening-scene SSE route plus sequencing split between pre-narration local settlement and post-narration rollback-critical work.
- `backend/src/routes/schemas.ts` - Request schema for the opening-scene route.
- `backend/src/routes/__tests__/chat.test.ts` - Route coverage for `/chat/opening` and ordering assertions for `tickPresentNpcs` before `finalizing_turn`.

## Decisions Made

- Hidden action resolution remains quality-first and tool-capable, but only the final visible pass may emit persisted assistant narration.
- Scene-settling progress is surfaced explicitly instead of pretending narration generation and authoritative settlement are the same phase.
- Opening narration is now an explicit backend flow guarded against duplicate assistant history rather than a fallback side effect of empty chat logs.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The mapped backend suites pass cleanly. `prompt-assembler.test.ts` still logs the existing mocked vector-connection warning path, but it remains non-blocking and did not require code changes for this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The runtime now has the authoritative scene-assembly seam Phase 45 needed before later encounter-scope and writing-quality phases.
- `/game` can distinguish scene-settling from post-narration finalization through explicit SSE progress phases.

---
*Phase: 45-authoritative-scene-assembly-and-start-of-play-runtime*
*Completed: 2026-04-12*

## Self-Check: PASSED

- FOUND: `.planning/phases/45-authoritative-scene-assembly-and-start-of-play-runtime/45-02-SUMMARY.md`
- FOUND: `8b7e5a3`
- FOUND: `a98eecf`
