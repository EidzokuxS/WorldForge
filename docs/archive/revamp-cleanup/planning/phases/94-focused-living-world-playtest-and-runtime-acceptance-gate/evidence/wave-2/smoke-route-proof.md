# Phase 94-03 Smoke Route Proof

## Command

```powershell
$env:NODE_PATH='C:\Users\robra\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
node --import tsx e2e/94-focused-living-world-playtest.ts --profile smoke --routes tourist-courier --turns 2 --reuse-baselines --out output/playwright/phase-94-focused/smoke-rerun
```

## Result

The smoke command completed and wrote the expected route artifact bundle:

- `output/playwright/phase-94-focused/smoke-rerun/manifest.json`
- `output/playwright/phase-94-focused/smoke-rerun/baseline-pool.json`
- `output/playwright/phase-94-focused/smoke-rerun/route-results.json`
- `output/playwright/phase-94-focused/smoke-rerun/tourist-courier/turns.jsonl`
- `output/playwright/phase-94-focused/smoke-rerun/tourist-courier/sse-events.jsonl`
- `output/playwright/phase-94-focused/smoke-rerun/tourist-courier/turn-artifacts.jsonl`
- `output/playwright/phase-94-focused/smoke-rerun/tourist-courier/trace.jsonl`
- `output/playwright/phase-94-focused/smoke-rerun/tourist-courier/world-diffs.jsonl`
- `output/playwright/phase-94-focused/smoke-rerun/tourist-courier/job-proposal-ledger.json`
- `output/playwright/phase-94-focused/smoke-rerun/tourist-courier/latency-context-trace.jsonl`
- `route-start.png`, `turn-1.png`, `turn-2.png`, and `final-state.png`

## Route Assertion Outcome

`route-results.json` reports the tourist-courier smoke route as failed with one hard finding:

- `tourist-world-progress`: two terminal `done` turns produced non-empty narration and raw SSE/full artifacts, but the route did not show world hash, version, or time progress.

This is a valid Phase 94 hard finding, not a harness failure. The runner preserved the evidence instead of turning the route into a fake pass.

## Environment Notes

- Local backend health returned HTTP 200 before the live run.
- Local frontend health returned HTTP 200 before the live run.
- The repository does not currently install `playwright` locally. The smoke run used the bundled Codex runtime package path through `NODE_PATH`.
- `node --import tsx/esm` fails on Node 23 in this workspace with `ERR_REQUIRE_CYCLE_MODULE`; `node --import tsx` was used for all Phase 94 e2e verification commands.
