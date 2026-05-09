# Phase 87 Plan 87-02 Summary

## Outcome

Completed the code-side burn-down for `P86-F002`: accepted turns should no longer settle as successful empty assistant beats.

This is deliberately fail-closed, not a prose fallback. If final visible narration is blank after validation/retry, backend turn processing aborts before assistant append, tick advance, finalizing event, `done`, or post-turn hooks. The route layer then restores the pre-turn snapshot and emits an SSE `error`.

Frontend SSE parsing also rejects accepted-turn completion when `finalizing_turn` reaches `done` without a non-blank `narrative` event. Lookup-only streams remain allowed to complete without narration.

## Changed Files

- `backend/src/engine/turn-processor.ts`
  - Added `assertNonEmptyFinalVisibleNarration`.
  - Applied it to scene-plan packet-guarded final narration.
  - Applied it to legacy final narration.
- `backend/src/engine/__tests__/turn-processor.empty-narration.test.ts`
  - Added scene-plan and legacy regressions proving blank final narration does not emit `narrative`, `finalizing_turn`, or `done`, does not append blank assistant text, does not advance tick, and does not run post-turn hooks.
- `frontend/lib/api.ts`
  - Added parser state for visible narration, terminal `done`, backend `error`, lookup-only completion, and finalizing-turn accepted completion.
  - Treats `done` after `finalizing_turn` without visible narration as `onError("Turn finished without visible narration. Please retry.")`.
  - Treats a closed stream with no terminal event, no narrative, and no lookup result as `onError("Turn stream ended before completion.")`.
- `frontend/lib/__tests__/api.test.ts`
  - Added done-without-narrative, whitespace-only narrative, closed-stream, and lookup-only regressions.
  - Updated the optional `onFinalizing` test so finalizing can be unobserved by callback, but still requires visible narration before done.

## Verification

- `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.empty-narration.test.ts src/engine/__tests__/visible-narration-output-guard.test.ts`
  - Passed: 2 files, 7 tests.
- `npm --prefix frontend run test -- run lib/__tests__/api.test.ts`
  - Passed: 1 file, 36 tests.
- `npm --prefix backend run typecheck`
  - Passed.
- `npm --prefix frontend run typecheck`
  - Passed.
- `git diff --check -- backend/src/engine/turn-processor.ts backend/src/engine/__tests__/turn-processor.empty-narration.test.ts frontend/lib/api.ts frontend/lib/__tests__/api.test.ts`
  - Passed with only existing CRLF warnings.

## Live Evidence Note

While this plan was being implemented, Phase 86 continued running under PID `79464`. It produced additional pre-fix `P86-F002` evidence in `drowned-observatory/tourist-observer` turns 1-3, all with `assistantText: ""`.

`P86-F002` should remain rerun-pending in the accepted findings ledger until a focused Phase 87 live rerun proves the fixed backend/frontend boundary under real turn streaming.

## Residual Risk

- Existing dirty worktree contains unrelated Phase 83/84/86 visual/worldgen/backend edits, so GitNexus/diff-change scope reports are noisy outside this plan's four touched files.
- Retry streams that emit `finalizing_turn` and no visible narration now fail visibly too. This matches the fail-closed rule; retry success still works when real narration arrives.
