---
phase: 47-storyteller-output-quality-and-anti-slop-prompting
plan: 02
subsystem: engine
tags: [storyteller, prompt-engineering, glm, runtime-seams, model-routing]
requires:
  - phase: 47-storyteller-output-quality-and-anti-slop-prompting
    provides: baseline scene and contract modules from Phase 47-01
provides:
  - scene-adaptive storyteller prompt assembly with deterministic runtime mode selection
  - runtime storyteller model routing through storyteller role + GLM family
  - bound contract assertions for hidden and final-visible narration prompts
affects:
  - phase-47 turn-sequencing path
  - route-level gameplay narration responses

tech-stack:
  added: []
  patterns:
    - Deterministic runtime-based scene-mode classification for prompt assembly
    - Bounded prompt contract composition with GLM overlay
    - Storyteller role-based model routing without rewrite stages

key-files:
  created: []
  modified:
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/__tests__/prompt-assembler.test.ts
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/__tests__/turn-processor.test.ts

key-decisions:
  - "Use deterministic runtime signals (scene effects, tags, pressure) for storyteller scene mode instead of heuristics."
  - "Pass storyteller role + GLM family into `createModel(...)` for hidden, final-visible, and opening narration passes."
  - "Keep GLM application bounded within prompt contracts to avoid prompt bloat regressions."

patterns-established:
  - "Classify scene style from authoritative runtime context and feed bounded storyteller contract overlays."
  - "Treat storyteller model selection as a role/family seam; do not add an extra rewrite LLM pass."

requirements-completed: [WRIT-01]

duration: 7min
completed: 2026-04-12
---

# Phase 47: Storyteller Output Quality and Anti-Slop Prompting Summary

**Implemented deterministic scene-adaptive storyteller contracts and routed hidden/final/opening narration through the storyteller model seam with GLM hints, without adding a rewrite pass.**

## Performance

- **Duration:** 7 min (approx.)
- **Started:** 2026-04-12T17:00:00Z
- **Completed:** 2026-04-12T17:07:00Z
- **Tasks:** 2 completed
- **Files modified:** 4

## Accomplishments
- Added runtime-scoped scene-mode classification in prompt assembly (combat, dialogue, quiet, horror, default) from trusted game-state signals.
- Injected bounded GLM overlay guidance into both hidden-tool-driving and final-visible storyteller system prompts.
- Routed hidden-tool-driving, final-visible, and opening narration model creation through `createModel(..., { role: "storyteller", familyHint: "glm" })`.

## Task Commits

1. **Task 47-02-01** - Scene-adaptive bounded prompt assembly — `8bbf0f2` (feat)
2. **Task 47-02-02** - Storyteller model seam wiring for live narration passes — `5884606` (feat)

## Files Created/Modified
- `backend/src/engine/prompt-assembler.ts` - Added deterministic storyteller scene-mode classification and GLM/contract injection for hidden and final narration prompt builds.
- `backend/src/engine/__tests__/prompt-assembler.test.ts` - Added/updated tests for scene-adaptive contract behavior and baseline anti-slop parity.
- `backend/src/engine/turn-processor.ts` - Routed hidden, final, and opening narration model calls through storyteller model seam with GLM hints.
- `backend/src/engine/__tests__/turn-processor.test.ts` - Added assertions that live passes use storyteller model seam and preserved narrative flow checks.

## Decisions Made
- Keep scene-adaptive selection bounded and deterministic via a fixed priority list (outcome/effects, dialogue, tag-based, pressure/horror signals).
- Apply the same scene-mode contract for both hidden-tool-driving and final-visible prompts to avoid dual doctrine drift.
- Preserve non-storyteller behavior and only target the storyteller runtime seam, avoiding a second rewrite LLM stage.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adjusted anti-slop assertion to avoid brittle case mismatch**
- **Found during:** Task 47-02-01
- **Issue:** Case in the generated baseline contract line differed (`do not claim...` vs capitalized variant).
- **Fix:** Updated prompt assembly test assertion to check a lowercase-normalized anti-slop baseline phrase.
- **Files modified:** `backend/src/engine/__tests__/prompt-assembler.test.ts`
- **Verification:** `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts`
- **Committed in:** `8bbf0f2`

**2. [Rule 1 - Bug] Adjusted createModel expectation to allow for judge/movement calls**
- **Found during:** Task 47-02-02
- **Issue:** Test expected exactly two storyteller model calls, but full flow includes additional `createModel` usage in movement detection.
- **Fix:** Updated assertion to filter for storyteller role/family calls and validate two required storyteller-path invocations.
- **Files modified:** `backend/src/engine/__tests__/turn-processor.test.ts`
- **Verification:** `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts`
- **Committed in:** `5884606`

---

**Total deviations:** 2 auto-fixed (Rule 1 - 2)
**Impact on plan:** Minimal test-only adjustments required for brittle assertions; production behavior remained in-plan.

## Issues Encountered
- No blocking issues remained after test assertion fixes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 47-03 has a runtime-focused follow-up and can proceed with this seeded contract/model seam behavior in place.
- Scene-mode constants and model-role seams are now in a stable shape for downstream tuning.

---
*Phase: 47-storyteller-output-quality-and-anti-slop-prompting*
*Completed: 2026-04-12*

## Self-Check: PASSED
- Created file: `.planning/phases/47-storyteller-output-quality-and-anti-slop-prompting/47-02-SUMMARY.md`
- Verified commits exist: `8bbf0f2`, `5884606`

