# Task 2B4: Campaign Play provenance clone

Date: 2026-07-11  
Status: complete; independently verified.

## Outcome

The current campaign store manifest registers all twenty Campaign Play tables in dependency order. Clean-start cloning transfers an accepted Campaign World into a new campaign before character bootstrap, records explicit lineage, and starts the child with empty Campaign Play runtime state.

## Clone contract

- The source database contains exactly one campaign, passes SQLite foreign-key validation, and owns an accepted canonical Campaign World snapshot.
- The source may contain only the pre-character Campaign Play boundary: no player character, human player actor, player-creation command, turn, or setup phase beyond `character_required`.
- The child lineage records the clone operation ID, parent campaign ID, parent accepted snapshot hash, accepted source digest, and child campaign ID.
- Campaign and row ownership fields move to the child ID. Player-authored and generated content remains byte-for-byte meaningful content even when it contains the parent UUID.
- The child current World source snapshot is rebuilt from accepted provenance with child ownership. Its source digest and content hash are recomputed and compared with the accepted snapshot.
- Clean-start tables are purged globally inside the per-campaign database. Every Campaign Play table must contain zero rows after cloning.
- Source, backup, and child boundaries each require a single-campaign database and a clean foreign-key check.
- The target directory is reserved with one atomic directory creation. Cleanup removes only a directory reserved by the current clone operation.
- Clone mutation occurs only in the child database transaction. Protected Campaign World and Campaign Play triggers are restored before commit; the parent's existing bytes remain unchanged.
- A campaign after character bootstrap fails with `campaign_play_clone_requires_zero_turn` and HTTP status 409. Replay-preserving cloning remains outside this task.

## Review corrections

The first independent Sol review returned `REVISE` with three P1 findings. The implementation then replaced recursive UUID substitution with typed ownership rewrites, enforced single-campaign/global-empty isolation, and replaced target existence-check-then-create with atomic reservation plus ownership-gated cleanup. Regression fixtures cover all three counterexamples.

Droid GLM-5.2 reviewed the two player-visible clone errors with `humanizer` and `deslop` criteria. It returned `COPY_GATE: PASS` for:

- `You can clone this campaign once your Campaign World is accepted.`
- `You can only clone a fresh campaign before adding a character or starting play.`

Review log: `.codex/agent-logs/campaign-play-clone-copy-20260711-012528.out.log`.

## Verification

| Command | Result |
|---|---|
| `npm --prefix backend test -- src/campaign/__tests__/clone.test.ts src/campaign/__tests__/store-manifest.test.ts src/campaign/__tests__/store-manifest-executor.test.ts src/engine/__tests__/gameplay-control-plane-contract.test.ts src/campaign-play/campaign-play-database.test.ts` | 49 tests passed |
| `npm --prefix backend run typecheck` | passed |
| `npm --prefix backend run db:generate` | no schema changes |
| `git diff --check` | passed |

Focused regressions prove parent-UUID content preservation with valid current provenance hashes, rejection of a second campaign plus its play state, global emptiness of all twenty Campaign Play tables, preservation of a pre-existing target directory, accepted snapshot lineage, zero-turn rejection, and unchanged pre-existing parent files.

Independent Terra mechanical review returned `PASS`. Independent Sol semantic review first reproduced three P1 counterexamples, then re-ran those adversarial probes after correction and returned `ALIGNED` with zero remaining P0/P1 findings. Its final P2 wording correction was applied to the config manifest action note.

Standalone smoke additions: 0.
