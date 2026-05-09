# 87-01 Summary: Accepted Findings and Focused Rerun Controls

Status: complete.

## Changed

- Added `87-ACCEPTED-FINDINGS.md` with accepted owners for `P86-CAL-001`, `P86-F001` through `P86-F006`, and protected invariant `P86-OK-001`.
- Added `87-FINDING-RERUN-MATRIX.md` mapping accepted findings to campaign/route filters, evidence turns, and focused assertions.
- Extended `e2e/86-exhaustive-playtest.ts` with additive Phase 87 controls:
  - `PHASE87_FINDING_FILTER`
  - `PHASE87_ASSERT_FIXED`
  - manifest serialization of selected Phase 87 findings/assertions
  - fixed-finding hard assertions for empty narration, Cyrillic narration, prose-only mutation pressure, combat ambiguity, false-claim grants, and visible overflow

## Verification

- Ledger coverage check passed for all required IDs.
- Dry-run passed with:

```powershell
$env:PHASE86_DRY_RUN='1'
$env:PHASE86_MODE='pilot'
$env:PHASE87_FINDING_FILTER='P86-F002'
$env:ARTIFACT_DIR='output/playwright/phase-87-rerun/dry-run'
npm --prefix backend exec tsx -- e2e/86-exhaustive-playtest.ts
```

The dry-run manifest selected 2 campaigns x 5 routes x 2 turns and recorded the `P86-F002` finding filter in `manifest.json`.

## Notes

- The original plan command used `npx tsx`; this environment does not expose `tsx` through root `npx`, so verification uses the installed backend `tsx` binary through `npm --prefix backend exec`.
- GitNexus did not index the local e2e harness helper symbols, so symbol-level impact was unavailable for `selectedByFilter`, `hardFailures`, and `softFailures`. The change is additive and verified through the focused harness dry-run.
- Phase 86 overnight run remains active under PID `79464`; this plan does not stop, replace, or fake-close that run.
