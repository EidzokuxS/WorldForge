# 94-02 Summary: Route Manifest and Clone Pool Harness

## Outcome

Phase 94-02 is implemented.

The Phase 94 harness now has a route manifest for all eight focused living-world route families and a dry-run clone-pool planner that records baseline lineage without mutating source campaigns. The harness writes `manifest.json`, `baseline-pool.json`, and preflight evidence, and it fails closed if routes are missing required hard invariants, trace assertions, raw artifact expectations, screenshots, or soft review metadata.

## Code Changes

- Added `e2e/94-focused-living-world-playtest.ts` with `--manifest-only`, `--prepare-baselines`, `--dry-run`, `--reuse-baselines`, `--profile`, `--routes`, `--turns`, and `--out`.
- Added `e2e/phase-94/route-manifest.ts` covering all eight Phase 94 route families.
- Added `e2e/phase-94/artifact-schema.ts` with manifest, baseline-pool, route result, turn row, trace row, hard failure, soft note, and report contracts.
- Added `e2e/phase-94/baseline-pool.ts` with path-safe baseline lookup and route clone planning.
- Added `evidence/wave-1/harness-preflight.md` with dry-run preflight and no-shortcut guard evidence.

## Verification

Passed with the Node 23-compatible loader:

```powershell
node --import tsx e2e/94-focused-living-world-playtest.ts --manifest-only
node --import tsx e2e/94-focused-living-world-playtest.ts --prepare-baselines --dry-run --out output/playwright/phase-94-focused/dry-run
```

Result:

- Manifest command emitted 8 route definitions.
- Dry run wrote `output/playwright/phase-94-focused/dry-run/manifest.json`.
- Dry run wrote `output/playwright/phase-94-focused/dry-run/baseline-pool.json`.
- Dry run planned 2 baseline sources and 8 route clones.
- No-shortcut guard passed with 0 failures.

## Risk Notes

`node --import tsx/esm` currently fails in this workspace on Node 23 with `ERR_REQUIRE_CYCLE_MODULE`; the same failure reproduces on an existing older e2e script. `node --import tsx` works and was used for verification.

This wave does not run live browser turns. It prepares manifest and clone lineage only; live route execution remains in 94-03.
