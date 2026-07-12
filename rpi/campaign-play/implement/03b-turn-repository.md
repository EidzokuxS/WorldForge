# Task 3B: Campaign Play turn repository

Date: 2026-07-11  
Status: complete.

## Recovery storage prerequisite

Migration `0030_campaign_play_turn_recovery.sql` adds protected canonical model-artifact bytes and the `worker_lease_renewed` runtime event.

- Accepted model stages require valid `artifact_json` and its paired SHA-256. Started, interrupted, and failed attempts carry neither artifact field.
- Lease expiry remains part of runtime truth. A successful renewal therefore advances one runtime revision and emits one fenced, turn-owned renewal event.
- The migration rebuilds only model-stage and runtime-event tables, then recreates all ten triggers owned by those tables.
- The `0029` upgrade fixture preserves Campaign Play state, turn, runtime events, and an unfinished model attempt. A historical accepted attempt without recoverable bytes is rejected instead of receiving fabricated content.

## Verification to date

| Command | Result |
|---|---|
| `npm --prefix backend test -- src/campaign-play/contracts.test.ts src/campaign-play/campaign-play-database.test.ts src/campaign-play/campaign-play-state-repository.test.ts` | 54 tests passed |
| `npm --prefix backend run typecheck` | passed |
| `npm --prefix backend run db:generate` | no schema changes |
| `git diff --check` | passed; inherited line-ending warnings only |

Terra mechanical review returned `PASS` with no blocker. Standalone smoke additions: `0`.

## Turn repository

Task 3B-B2 now implements the complete durable turn state machine.

- Deterministic workers commit primary settlement, repeatable actor-job transitions, the actors-settled boundary, and visibility projection through exact lease tokens. Every transition pairs one protected runtime event with one sanitized turn event.
- Visibility freezes `SHA-256(canonical({ domain: "campaign_play_narrator_packet", turnId, packet }))` before narration starts. Every visible, interrupted-narrator, and completed reload recomputes that hash from the exact persisted canonical packet bytes. Active visibility and narrator interruption require an exact pending narration row with no terminal fields; completion requires an exact complete row. Narrator bytes, execution evidence, narration storage, turn completion, active-lock release, and terminal events commit atomically.
- Pre-settlement terminal failure stores the final world version, internal error authority, public terminal event, and canonical mutation audit while releasing the active turn.
- Recovery distinguishes completed and terminal-failure outcomes and verifies deterministic, interruption, resume, and terminal order by replaying the complete turn ledger.
- Every durable mutation runs inside an outer immediate transaction. Final state and turn reload therefore participate in commit authority; a failed final verification rolls back state revisions, runtime and turn events, model attempts, turn fields, and domain writes.
- Interrupted model recovery selects evidence by interrupted stage identity and worker epoch. A player-action regression proves Judge retry followed by Game Master interruption, database reopen, exact recovery, and Game Master attempt 2 resume.

## B2 verification

| Command | Result |
|---|---|
| `npm --prefix backend test -- src/campaign-play/campaign-play-turn-repository.test.ts src/campaign-play/campaign-play-state-repository.test.ts src/campaign-play/campaign-play-projection.test.ts` | 55 tests passed: 31 turn, 11 state, 13 projection |
| `npm --prefix backend run typecheck` | passed |
| `git diff --no-index --check NUL <new file>` for repository and adjacent test | no whitespace errors; expected untracked-file and LF/CRLF notices only |

Named fault evidence covers callback rollback, post-mutation final-verification rollback, stale fences, restart recovery, deterministic/terminal ledger corruption, packet-bytes/hash mismatch rollback and reopen rejection, premature complete/invalid visibility rollback, and narration atomicity. Standalone smoke additions remain `0`.

## Final review

- Fresh Sol semantic verification returned `ALIGNED` with P0/P1 `0` after independently checking the Judge-to-Game-Master recovery path, outer-transaction rollback, packet byte/hash authority, narration lifecycle, terminal completion, and reopen behavior.
- Terra mechanical verification returned `PASS`: the 55-test lifecycle suite, 54-test contracts/migration suite, backend typecheck, repeat schema generation, exports, migration metadata, and evidence counts agree.
- GitNexus cannot resolve the new Task 3B symbols in its older index. Whole-worktree detection reports critical scope from 45 inherited dirty files; Task 3B remains isolated to the documented Campaign Play storage and repository surfaces, and no commit was attempted.
