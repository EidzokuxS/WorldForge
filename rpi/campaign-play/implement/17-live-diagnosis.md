# Task 17: live causal and diagnostic lanes

## Checkpoint and reload evidence contract

- `causal-20` is pinned to exactly 20 completed player actions and declared reload checkpoints `[1, 5, 10, 20]`.
- A live checkpoint is captured only from `phase=ready`, with no unfinished player turn and with the requested completed-action count equal to SQLite truth.
- Each checkpoint compares the public API bytes, canonical replay hash, SQLite/public/protected authority hashes, integrity result, foreign keys, and runtime-event cursor before and after the browser reload.
- A matching reload writes `checkpoints/action-<n>.json` and `probes/reload-action-<n>-proof.json`. Divergent reloads retain their proof but cannot produce an accepted checkpoint.
- Bundle finalization copies and validates staged historical checkpoints. It refuses a staged final checkpoint whose authority differs from the final replay and requires every checkpoint declared by the live run config.
- Live run configs now reject `maximumOutputTokens < 32_768`; deterministic seeded evidence uses the same minimum.

## Verification

- `npx vitest run e2e/campaign-play/contracts.test.ts e2e/campaign-play/live-session.test.ts e2e/campaign-play/bundle-writer.test.ts e2e/campaign-play/probes.test.ts`
- `npm --prefix backend run typecheck`
- `npm --prefix frontend run typecheck`
- The previously accepted clean-14 first-playable bundle remains valid and promotion-eligible under the updated validator.

The next execution step is a clone-based 20-action GLM 5.2 rehearsal. It is diagnostic preparation, not the fresh-campaign acceptance lane required by Task 17.
