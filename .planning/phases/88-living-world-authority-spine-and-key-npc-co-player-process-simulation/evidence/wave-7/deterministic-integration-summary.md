# 88-11 Deterministic Integration Summary

Date: 2026-05-08

## Backend Integration

- `npm --prefix backend run test -- src/campaign/__tests__/checkpoints.test.ts`
  - Passed: 1 file / 20 tests.
  - Added checkpoint restore assertion: after bundle restore, `loadCheckpoint` reads restored world clock and calls `invalidateAuthorityAfterRestore`.
- `npm --prefix backend run test -- src/engine/__tests__/phase-88-integration.test.ts`
  - Passed: 1 file / 2 tests.
  - Covers rollback boundary across simulation jobs, simulation proposals, actor process state, actor knowledge, faction reports, faction operations, world threads, and world clock.
  - Covers stale future proposal after restore: canceled proposal rejects commit with `not_pending`.
  - Covers context-budget fail-closed behavior for hidden truth, source-free truth, full-history dump, summary-as-truth, source-free memory, and model output clipping.

## E2E Harness Dry Run

- Initial planned command `node --import tsx/esm ...` failed because root package scope does not expose `tsx`.
- Correct command is `npm --prefix backend exec -- tsx e2e/88-living-world-playtest.ts`.
- `PHASE88_MODE=deterministic PHASE88_PROFILE=smoke npm --prefix backend exec -- tsx e2e/88-living-world-playtest.ts`
  - Passed.
  - Wrote stable summary to `output/playwright/phase-88-living-world/summary.json`.
  - Generated route artifacts and soft-review samples for `tourist-pressure` and `false-claim-boundary`.
- `npm --prefix backend exec -- tsx e2e/88-living-world-judge-calibration.ts --dry-run`
  - Passed.
  - Wrote `output/playwright/phase-88-living-world/judge-calibration.json`.

## Important Guardrails

- The E2E harness does not enforce arbitrary model-turn duration caps.
- Assistant output is preserved in full in `turns.jsonl`; the harness does not clip model output.
- Code does not assign final prose/playfeel quality scores. It queues examples for calibrated LLM/human review and only detects hard mechanical failures or obvious private/backend leaks.
