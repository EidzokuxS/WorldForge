# Phase 94-04 Report Validation Proof

## Commands

Passed:

```powershell
node --import tsx e2e/94-focused-living-world-playtest.ts --manifest-only
node --import tsx e2e/94-focused-living-world-playtest.ts --prepare-baselines --dry-run --out output/playwright/phase-94-focused/dry-run
npm --prefix backend run test -- src/engine/__tests__/phase-94-runtime-invariants.test.ts
npm --prefix backend run typecheck
node --import tsx e2e/phase-94/acceptance-report.ts --input output/playwright/phase-94-focused/report-fixtures/passing-smoke --allow-subset
git diff --check
```

Expected fail-closed:

```powershell
node --import tsx e2e/phase-94/acceptance-report.ts --input output/playwright/phase-94-focused/smoke-rerun --allow-subset
node --import tsx e2e/phase-94/acceptance-report.ts --input output/playwright/phase-94-focused/dry-run --require-all-routes
```

## Results

- Manifest generation emitted all 8 required route definitions.
- Dry-run planned 2 baselines and 8 route clones, wrote `hard-invariants.json`, and passed the no-shortcut guard over the Phase 94 harness/report files.
- Deterministic runtime invariant test passed 4/4.
- Backend typecheck passed.
- Synthetic completed-smoke fixture passed report validation with `status: passed`, `routeCount: 1`, `hardFailureCount: 0`, and `missingArtifactCount: 0`.
- Existing live smoke output failed report validation with `status: failed`, `routeCount: 1`, and `hardFailureCount: 6`.
- Dry-run full-matrix output failed report validation with `status: failed`, `routeCount: 8`, `hardFailureCount: 97`, and `missingArtifactCount: 96`.

## Blocker

The full focused live matrix was not promoted to a green acceptance run. The prior live smoke remains a hard blocker: `tourist-courier` completed 2 terminal turns but did not show world hash, world version, or world time progress, and the collected latency/ledger artifacts still report trace collection gaps. Phase 94-05 soft review should not run as a pass gate until these hard gates are green.

## Loader Note

Use `node --import tsx` on this workspace. `node --import tsx/esm` fails on the active Node runtime with `ERR_REQUIRE_CYCLE_MODULE`.
