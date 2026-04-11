# 41-01 Summary

## Outcome

Implemented a shared authoritative campaign bundle seam for capture/restore and moved both checkpoint load and Phase 39 turn-boundary restore onto it.

## What changed

- Added `backend/src/campaign/restore-bundle.ts` with:
  - `captureCampaignBundle()`
  - `restoreCampaignBundle()`
- Updated `backend/src/campaign/checkpoints.ts` to:
  - capture `state.db`, `config.json`, `chat_history.json`, and optional `vectors/` through the shared helper
  - restore through the shared helper instead of ad-hoc reconnect logic
- Updated `backend/src/engine/state-snapshot.ts` to:
  - reuse the same helper with `includeVectors: false`
  - preserve Phase 39 vector-exclusion semantics
- Tightened tests in:
  - `backend/src/campaign/__tests__/checkpoints.test.ts`
  - `backend/src/engine/__tests__/state-snapshot.test.ts`

## Verification

- `npm --prefix backend exec vitest run src/campaign/__tests__/checkpoints.test.ts src/engine/__tests__/state-snapshot.test.ts`
  - passed (`22/22`)
- `npx tsc --noEmit -p backend/tsconfig.json`
  - still fails on pre-existing unrelated issues in:
    - `backend/src/ai/__tests__/provider-registry.test.ts`
    - `backend/src/engine/__tests__/turn-processor.test.ts`
    - `backend/src/routes/worldgen.ts`

## Contract now locked

- Checkpoints capture `config.json` as authoritative runtime state.
- Checkpoint restore and turn-boundary restore share one invalidate-copy-reload primitive.
- Checkpoint restore includes vectors; turn-boundary restore does not.
