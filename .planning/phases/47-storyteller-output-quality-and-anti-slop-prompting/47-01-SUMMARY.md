---
phase: 47-storyteller-output-quality-and-anti-slop-prompting
plan: 01
subsystem: ai-engine
tags: [storyteller, prompt-engineering, ai-model]

requires:
  - phase: 46-encounter-scope-presence-and-knowledge-boundaries
    provides: "Scene presence/awareness and prompt assembly foundations that this plan now reuses for storyteller contract assembly"
provides:
  - "Portable storyteller preset builders (baseline + GLM overlay)"
  - "Storyteller contract assembly based on shared preset source"
  - "Storyteller-aware model-creation options with explicit GLM bypass behavior"
affects:
  - 47-02-storyteller-output-quality-runtime-integration
  - 47-03-storyteller-output-quality-live-runtime-testing

tech-stack:
  added: []
  patterns:
    - "Data-driven, seam-based prompt motif builders replacing inline prompt strings"
    - "Pass-specific contract assembly with shared preset source and optional GLM overlay"
    - "Role+family optional hints in model factory to gate behavior changes"

key-files:
  created:
    - backend/src/engine/storyteller-presets.ts
  modified:
    - backend/src/engine/storyteller-contract.ts
    - backend/src/engine/__tests__/storyteller-presets.test.ts
    - backend/src/engine/__tests__/storyteller-contract.test.ts
    - backend/src/ai/provider-registry.ts
    - backend/src/ai/__tests__/provider-registry.test.ts

key-decisions:
  - "Do not create per-provider prompt dashboards; keep GLM support as one overlay option on shared OpenAI-compatible path"
  - "Preserve existing `createModel(config)` behavior by default and gate storyteller-specific behavior with explicit options"
  - "Keep hidden-tool-driving and final-visible passes sharing one preset source to avoid divergent doctrine"

requirements-completed:
  - WRIT-01

duration: 2 min
completed: 2026-04-12
---

# Phase 47 Plan 01: Storyteller-output-quality and anti-slop foundation

**Introduced a backend-owned storyteller preset seam with shared hidden/final contract assembly and explicit storyteller GLM model-path control**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-12T16:47:29+03:00
- **Completed:** 2026-04-12T16:48:34+03:00
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Added `backend/src/engine/storyteller-presets.ts` with portable anti-slop motif builders (baseline and GLM overlay) and explicit scene-mode adaptations.
- Reassembled `buildStorytellerContract()` to compose pass-specific prompts from the shared preset source and conditionally include the GLM overlay.
- Extended `createModel` with `ModelRole` and `ModelCreationOptions` to keep default behavior backward-compatible while allowing explicit storyteller+GLM bypass and explicit non-GLM baseline paths.

## Task Commits

Each task was committed atomically:

1. **Task 47-01-01: Build the portable preset matrix and export baseline plus GLM overlay blocks** - `e3045d6` (feat)
2. **Task 47-01-02: Reassemble the storyteller contract around the preset seam and add a storyteller-aware GLM model hook** - `ec7f88b` (feat)

## Files Created/Modified
- `backend/src/engine/storyteller-presets.ts` - Added baseline and GLM overlay builders for simulation-first, anti-impersonation, anti-omniscience, and anti-repetition rules.
- `backend/src/engine/storyteller-contract.ts` - Switched contract assembly to shared preset source with optional overlay and scene-aware knobs.
- `backend/src/ai/provider-registry.ts` - Added `ModelRole`, `ModelCreationOptions`, and explicit storyteller GLM handling in `createModel`.
- `backend/src/engine/__tests__/storyteller-presets.test.ts` - Added tests for motif inclusion, additive overlay behavior, and banned-motif rejection.
- `backend/src/engine/__tests__/storyteller-contract.test.ts` - Added pass-sharing and overlay-only tests for contract behavior.
- `backend/src/ai/__tests__/provider-registry.test.ts` - Added coverage for default compatibility and storyteller override behavior.

## Decisions Made
- Keep `createModel(config)` fully backward-compatible and require explicit `options` to change model-behavior for storyteller routing.
- Keep GLM quality improvements as an overlay path instead of introducing provider-specific prompt trees.
- Centralize stylistic prompt rules in `storyteller-presets.ts` to keep contract assembly deterministic and testable.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stabilized assertion against wrapped model object for storyteller non-GLM test**
- **Found during:** Task 47-01-02
- **Issue:** Test expected raw model object when `createModel` returns wrapped model with `baseModel` in the baseline path.
- **Fix:** Updated test assertion to check `result.baseModel`.
- **Files modified:** `backend/src/ai/__tests__/provider-registry.test.ts`
- **Verification:** `npm --prefix backend exec vitest run src/engine/__tests__/storyteller-contract.test.ts src/ai/__tests__/provider-registry.test.ts`
- **Committed in:** `ec7f88b`

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact:** No scope creep; only corrected unstable test expectation to match existing wrapper behavior.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
Plan 47-01 is complete and ready for 47-02 runtime integration of these presets and model hooks.

---
*Phase: 47-storyteller-output-quality-and-anti-slop-prompting*
*Completed: 2026-04-12*

## Self-Check: PASSED

