---
phase: 47-storyteller-output-quality-and-anti-slop-prompting
plan: 03
subsystem: engine
tags: [storyteller, runtime-guard, anti-slop, glm, sse]
requires:
  - phase: 47-storyteller-output-quality-and-anti-slop-prompting
    provides: scene-adaptive storyteller prompt assembly and storyteller-role model routing from 47-02
provides:
  - bounded final-visible narration guard with at most one retry
  - regression coverage for repeated lead, instruction echo, and high-signal slop clusters
  - live GLM smoke checklist for combat, dialogue, quiet, and eerie scenes
affects:
  - phase-47 live quality verification
  - milestone closeout gameplay review

tech-stack:
  added: []
  patterns:
    - One-shot visible narration retry with failure-specific addendum instead of rewrite pipeline
    - Evidence-gated post-generation checks layered after existing sanitize and duplicate-collapse filters
    - Single visible SSE narrative event even when internal visible-pass retry fires

key-files:
  created:
    - .planning/phases/47-storyteller-output-quality-and-anti-slop-prompting/47-SMOKE-CHECKLIST.md
  modified:
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/routes/__tests__/chat.test.ts

key-decisions:
  - "Keep the guard bounded to four evidence-backed failure classes: repeated lead, residual leak, instruction echo, and a tiny high-signal slop cluster set."
  - "Use existing sanitizeNarrative() plus duplicate collapse first; only retry once if those layers still leave visible failures."
  - "Keep route-visible SSE single-pass by resolving any retry fully inside turn-processor before emitting the single narrative event."

patterns-established:
  - "Score retry candidates and keep the better visible narration instead of blindly trusting the second pass."
  - "Treat prompt-instruction echo as a detectable quality regression, not as normal model variance."

requirements-completed:
  - WRIT-01

duration: 8 min
completed: 2026-04-12
---

# Phase 47 Plan 03: Bounded visible-pass guard and live smoke checklist

**Added a one-shot visible narration quality guard that catches repeated lead restarts, prompt leakage, and high-signal slop without introducing a rewrite stack.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-12T17:07:00+03:00
- **Completed:** 2026-04-12T17:15:00+03:00
- **Tasks:** 1 automated task completed, 1 human checkpoint pending
- **Files modified:** 4

## Accomplishments
- Added a bounded visible-pass quality check in `turn-processor.ts` that reuses existing sanitization first and only retries once with a short corrective addendum.
- Added regression coverage for instruction echo, repeated lead paragraph restarts, high-signal slop clusters, and the no-retry path when existing sanitizers already fix the output.
- Wrote `47-SMOKE-CHECKLIST.md` so live GLM quality can be judged against the exact failure modes guarded in code.

## Task Commits

1. **Task 47-03-01: Add the bounded final-visible guard and smoke checklist** - `59a51d2` (feat/docs)

## Files Created/Modified
- `backend/src/engine/turn-processor.ts` - Added filtered visible-pass quality analysis, one-shot retry logic, and shared opening/final narration guard path.
- `backend/src/engine/__tests__/turn-processor.test.ts` - Added regressions for instruction echo, repeated lead restarts, slop-cluster retry, and sanitize-only success.
- `backend/src/routes/__tests__/chat.test.ts` - Added SSE transport check that `/chat/action` still emits a single visible `narrative` event.
- `.planning/phases/47-storyteller-output-quality-and-anti-slop-prompting/47-SMOKE-CHECKLIST.md` - Added live GLM review rubric for combat, dialogue, quiet, and eerie scenes.

## Decisions Made
- Keep the slop detector intentionally tiny and require a cluster signal before retrying, instead of growing a large phrase blacklist.
- Apply the same guard path to opening narration and normal final narration so visible quality behavior stays consistent.
- Treat retry failure as non-fatal: keep the first cleaned narration if the corrective pass errors or does not improve the candidate.

## Deviations from Plan

None - plan executed exactly as written for the automated task.

## Issues Encountered
- Subagent execution for 47-03 was blocked by GPT-5.3-Codex-Spark quota exhaustion, so the plan was completed inline in the main thread.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Automated work for 47-03 is complete and phase-local/full smoke suites are green.
- The remaining step is the plan's live GLM human checkpoint using `47-SMOKE-CHECKLIST.md`.

---
*Phase: 47-storyteller-output-quality-and-anti-slop-prompting*
*Completed: 2026-04-12*

## Self-Check: PASSED
- Created file: `.planning/phases/47-storyteller-output-quality-and-anti-slop-prompting/47-SMOKE-CHECKLIST.md`
- Created file: `.planning/phases/47-storyteller-output-quality-and-anti-slop-prompting/47-03-SUMMARY.md`
- Verified key links: `node "$HOME/.codex/get-shit-done/bin/gsd-tools.cjs" verify key-links '.planning/phases/47-storyteller-output-quality-and-anti-slop-prompting/47-03-PLAN.md'`
- Verified runtime smoke: `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts`
- Verified full phase smoke: `npm --prefix backend exec vitest run src/engine/__tests__/storyteller-contract.test.ts src/engine/__tests__/storyteller-presets.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts src/ai/__tests__/provider-registry.test.ts src/routes/__tests__/chat.test.ts`
