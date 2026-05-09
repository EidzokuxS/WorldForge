# Wave 3 Route Failure Rollback Proof

Wave 3 keeps the existing route rollback guarantee and adds the simulation-proposal boundary on top of it.

## Covered Route Failures

- `/chat/action` failure after finalization restores the pre-turn bundle and drains pending committed events for that tick.
- `/chat/retry` restores the same saved bundle before replay and restores it again if replay fails.
- Undo snapshots are stored before `done`, so the client never receives a successful boundary without a matching retry/undo snapshot.
- Proposal commits reject when their base world version is stale, so a queued off-screen proposal cannot rewrite the restored/current branch.

## Test Evidence

- `backend/src/routes/__tests__/chat.test.ts:1315` covers `/chat/action` restore on finalization failure.
- `backend/src/routes/__tests__/chat.test.ts:1359` covers `/chat/retry` restore before and after failed replay.
- `backend/src/routes/__tests__/chat.scene-plan.test.ts` covers snapshot storage before `done` metadata emission.
- `backend/src/engine/__tests__/turn-boundary-authority.test.ts` covers proposal rejection after the world advances past the proposal's base version.

## Result

The route can still fail closed and restore the authoritative bundle, while simulation proposals created around that boundary cannot later commit into the wrong branch without passing version validation.
