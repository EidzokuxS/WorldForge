# 88-11 Final Gate Preflight

Date: 2026-05-08

## GitNexus Impact

- `loadCheckpoint` (`backend/src/campaign/checkpoints.ts`): LOW. Direct dependent: `backend/src/routes/campaigns.ts`.
- `restoreCampaignBundle` (`backend/src/campaign/restore-bundle.ts`): LOW. Direct dependents: `restoreSnapshot`, `loadCheckpoint`; indirect route files: `backend/src/routes/chat.ts`, `backend/src/routes/campaigns.ts`.
- `invalidateAuthorityAfterRestore` (`backend/src/engine/living-world-authority.ts`): LOW. Existing direct dependent before this gate: `restoreSnapshot`; indirect route file: `backend/src/routes/chat.ts`.
- `/api/chat`: LOW API impact. GitNexus route map resolves handler to `backend/src/index.ts` with no indexed consumers.

## Evidence Inventory

- `evidence/wave-1`: rollback/job/proposal/world-version proof artifacts present.
- `evidence/wave-2`: actor-frame/context-budget/packet-surface proof artifacts present.
- `evidence/wave-3`: route rollback/SSE/stale-proposal proof artifacts present.
- `evidence/wave-4`: scheduler, actor tool ledger, and agency debt proof artifacts present.
- `evidence/wave-5`: context budget and actor memory/provenance proof artifacts present.
- `evidence/wave-6`: faction/thread verification artifact present.
- `evidence/wave-7`: latency/context/runtime-shortcut proof artifacts present.

## Preflight Finding

Manual checkpoint restore used `restoreCampaignBundle` but did not run the same living-world authority invalidation that turn-boundary rollback runs through `restoreSnapshot`. This could leave post-checkpoint jobs, proposals, actor process rows, knowledge, faction work, and world threads visible after loading an older checkpoint.

Fix started in this gate: `loadCheckpoint` now reads the restored world clock after bundle restore and calls `invalidateAuthorityAfterRestore` with reason `checkpoint restored`.

## Checkpoint Verification

- `npm --prefix backend run test -- src/campaign/__tests__/checkpoints.test.ts`
- Result: passed, 1 file / 20 tests.
