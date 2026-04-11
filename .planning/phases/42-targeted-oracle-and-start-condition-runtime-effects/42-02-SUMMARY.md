---
phase: 42-targeted-oracle-and-start-condition-runtime-effects
plan: 02
subsystem: gameplay
tags: [start-conditions, opening-state, oracle, persistence, vitest]
requires:
  - phase: 42-targeted-oracle-and-start-condition-runtime-effects
    provides: target-aware Oracle seam that opening-state effects can now modulate honestly
  - phase: 41-checkpoint-complete-simulation-restore
    provides: restore-safe runtime boundary for re-deriving authoritative player state
provides:
  - backend-owned opening-state runtime seam derived from canonical start conditions
  - bounded early-game status flags and scene constraints that survive reload/retry/checkpoint
  - deterministic expiry on location change, explicit resolution, or small tick ceiling
affects: [gameplay, oracle, prompt-assembly, character-handoff]
tech-stack:
  added: []
  patterns: [status-flag-backed opening effects, deterministic start-condition re-derivation, bounded early-scene gating]
key-files:
  created: [backend/src/engine/start-condition-runtime.ts]
  modified: [backend/src/routes/character.ts, backend/src/engine/turn-processor.ts, backend/src/engine/prompt-assembler.ts, backend/src/routes/__tests__/character.test.ts, backend/src/engine/__tests__/turn-processor.test.ts, backend/src/character/__tests__/loadout-deriver.test.ts]
key-decisions:
  - "Active opening effects live through player state.statusFlags and are re-derived from canonical startConditions instead of client memory."
  - "Immediate situations normalize into a small structured effect set with bounded Oracle modifiers and scene constraints, not a free-form rule engine."
  - "Opening effects expire deterministically on first location change, explicit resolution, or a three-tick ceiling."
patterns-established:
  - "Pattern 1: save-character materializes opening-state flags into the canonical player record before handoff."
  - "Pattern 2: turn processing re-derives opening effects at turn start and persists post-turn expiry on the next authoritative boundary."
requirements-completed: [GSEM-02]
duration: 9min
completed: 2026-04-11
---

# Phase 42 Plan 02: Start-Condition Runtime Effects Summary

**Structured start conditions now produce bounded opening-scene status flags, Oracle modifiers, and scene constraints that persist through backend runtime state instead of living as flavor-only prompt text**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-11T15:59:22+03:00
- **Completed:** 2026-04-11T16:08:05+03:00
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- Added failing regressions that pin opening-state mechanics to `startLocationId`, `arrivalMode`, `startingVisibility`, `entryPressure`, `companions`, and `immediateSituation`.
- Implemented one backend seam that derives bounded opening effects into `state.statusFlags`, scene context, companion presence, and Oracle-facing modifiers.
- Wired save/handoff, prompt assembly, and live turn processing so opening effects survive reload/retry/checkpoint by authoritative state plus deterministic re-derivation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock start-condition runtime-effect regressions in tests** - `8ddeb5b` (`test`)
2. **Task 2: Implement backend-owned opening-state effects and preserve them through restore flows** - `2c09771` (`feat`)

## Files Created/Modified

- `backend/src/engine/start-condition-runtime.ts` - derives normalized opening-state effects, bounded status flags, prompt lines, and expiry rules from canonical start conditions
- `backend/src/routes/character.ts` - materializes opening-state flags during `save-character` using current tick and resolved start location
- `backend/src/engine/turn-processor.ts` - re-derives opening effects at turn start, feeds scene constraints into Oracle context, and persists deterministic expiry on the next turn boundary
- `backend/src/engine/prompt-assembler.ts` - keeps player-state prompt surfacing aligned with runtime opening-state flags instead of diverging into flavor-only text
- `backend/src/routes/__tests__/character.test.ts` - proves save/handoff persists bounded opening-state flags in canonical player state
- `backend/src/engine/__tests__/turn-processor.test.ts` - proves opening-state modifiers reach Oracle input and expire on location change or tick ceiling
- `backend/src/character/__tests__/loadout-deriver.test.ts` - keeps companion and pressure semantics out of inventory authority before Phase 38

## Decisions Made

- `immediateSituation` is classified once into a small normalized set (`pursuit`, `injured`, `questioned`, `concealed`, `escorted`) so turn processing does not reinterpret raw free text every turn.
- Companion handling remains bounded to presence/context and opening-scene affordances; no party-management or inventory mutation was added.
- The runtime carrier is the canonical player record itself, so restore flows from Phase 41 pick up opening-state behavior without introducing a second persistence store.

## Deviations from Plan

None - plan executed as specified.

## Issues Encountered

- `backend/src/engine/turn-processor.ts` and the neighboring gameplay files already had unrelated dirty worktree hunks. The implementation commit was built with selective staging so `42-02` did not absorb unrelated timeout or prompt-history changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `GSEM-02` is now covered by tests and backend runtime behavior.
- Phase 43 can build travel/location semantics on top of an opening-state contract that is already bounded and restore-safe.

## Self-Check: PASSED

- FOUND: `.planning/phases/42-targeted-oracle-and-start-condition-runtime-effects/42-02-SUMMARY.md`
- FOUND: `8ddeb5b`
- FOUND: `2c09771`
