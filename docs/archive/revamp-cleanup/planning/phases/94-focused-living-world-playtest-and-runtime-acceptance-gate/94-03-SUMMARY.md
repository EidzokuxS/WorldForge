# 94-03 Summary: Live Route Runner and Trace Assertions

## Outcome

Phase 94-03 is implemented.

The Phase 94 harness can now execute live `/game` smoke routes on cloned campaigns, capture raw SSE and full per-turn artifacts, write screenshots and trace rows, and produce route assertion results without passing from missing evidence.

## Code Changes

- Added `e2e/phase-94/live-runner.ts` for Playwright-backed route execution.
- Added `e2e/phase-94/trace-collector.ts` for raw SSE parsing, assistant text extraction, world snapshots, JSONL artifacts, and per-turn trace rows.
- Added `e2e/phase-94/route-assertions.ts` for route-level hard/soft findings.
- Extended `e2e/94-focused-living-world-playtest.ts` to run live routes when not in `--prepare-baselines` mode.
- Adjusted manifest/baseline validators so smoke subsets can run while full manifest validation still requires all eight routes.
- Fixed live clone planning so route clones are created from reusable baselines instead of running against the shared source campaigns.

## Verification

Passed:

```powershell
node --import tsx e2e/94-focused-living-world-playtest.ts --manifest-only
node --import tsx e2e/94-focused-living-world-playtest.ts --prepare-baselines --dry-run --out output/playwright/phase-94-focused/dry-run
$env:NODE_PATH='C:\Users\robra\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node --import tsx e2e/94-focused-living-world-playtest.ts --profile smoke --routes tourist-courier --turns 2 --reuse-baselines --out output/playwright/phase-94-focused/smoke-rerun
```

Result:

- Manifest command emitted all 8 route definitions.
- Dry-run command planned 2 baselines and 8 route clones.
- Smoke command created a tourist-courier route clone and wrote route artifacts.
- The smoke route produced terminal `done` events and non-empty narration for 2 turns.
- Route assertions failed the route with 1 hard product finding: no world hash/version/time progress was observed.

## Risk Notes

The smoke route failure is intentionally preserved as evidence for Phase 94 final acceptance; the harness did not fake-pass it. Live Playwright requires a browser package. This repo does not currently install `playwright`, so verification used the bundled Codex runtime package through `NODE_PATH`.
