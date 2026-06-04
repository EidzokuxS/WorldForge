# 94-04 Summary: Fail-Closed Acceptance Report

## Outcome

Phase 94-04 report tooling is implemented, and the Phase 94 full acceptance gate is still blocked by hard runtime evidence.

The new report layer reads manifest, clone lineage, route results, route assertions, raw SSE JSONL, full turn artifacts, trace rows, world diffs, job/proposal ledger, latency/context rows, screenshots, and hard invariant coverage. It writes `acceptance-report.json`, `living-world-assertions.json`, and `acceptance-report.md`, and exits nonzero whenever required artifacts, route coverage, terminal closeout, clone isolation, or hard assertions fail.

## Code Changes

- Added `e2e/phase-94/report-validation.ts` for artifact validation, route summaries, hard diagnostics, and living-world metrics.
- Added `e2e/phase-94/acceptance-report.ts` as the CLI report writer.
- Extended `e2e/phase-94/artifact-schema.ts` with report diagnostics, route validation summaries, living-world metrics, and expanded hard failure records.
- Extended `e2e/94-focused-living-world-playtest.ts` so harness runs write root `hard-invariants.json` and include report files in the no-shortcut guard.

## Verification

Passed:

```powershell
npm --prefix backend run test -- src/engine/__tests__/phase-94-runtime-invariants.test.ts
npm --prefix backend run typecheck
node --import tsx e2e/94-focused-living-world-playtest.ts --manifest-only
node --import tsx e2e/94-focused-living-world-playtest.ts --prepare-baselines --dry-run --out output/playwright/phase-94-focused/dry-run
node --import tsx e2e/phase-94/acceptance-report.ts --input output/playwright/phase-94-focused/report-fixtures/passing-smoke --allow-subset
git diff --check
```

Expected fail-closed:

```powershell
node --import tsx e2e/phase-94/acceptance-report.ts --input output/playwright/phase-94-focused/smoke-rerun --allow-subset
node --import tsx e2e/phase-94/acceptance-report.ts --input output/playwright/phase-94-focused/dry-run --require-all-routes
```

## Risk Notes

The current live smoke output remains failed, not waived. The blocker is the `tourist-courier` route: it reached terminal `done` turns with non-empty narration, but no world hash/version/time progress was observed, and trace/ledger collection is still incomplete. Soft prose/playfeel review remains separated into Phase 94-05 and cannot override this hard gate.
