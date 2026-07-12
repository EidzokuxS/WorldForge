# Task 6B: atomic Rulebook execution

Date: 2026-07-11  
Status: complete; independent mechanical and semantic reviews passed.

## Outcome

The Rulebook now converts only a genuine, integrity-sealed Task 6A preflight result into durable mechanical truth. One outer immediate SQLite transaction owns the command batch, per-command receipt, causal event, exposure rows, live entity mutations, logical world-version advance, final mechanical hash, runtime revision/hash, runtime event, and fenced turn-stage transition.

`preflightCampaignPlayRulebook` retains a sorted mechanical checkpoint before the batch and after every command. The result is recursively frozen and registered under a module-private canonical integrity seal. Execution verifies the seal, campaign, turn shape, base version, target version, checkpoint count, deterministic command identity, initial persisted hash, and every intermediate persisted hash before the transaction may commit.

## Transaction contract

- `CampaignPlayMutationContext.mechanicalHash()` projects canonical truth from the transaction's current rows.
- Mechanical repository commits carry an explicit positive `worldVersionAdvance`; combined commits may advance by the exact count of mutating commands rather than one physical transaction.
- Deterministic turn commits carry the same numeric advance. A receipt-only primary batch may use zero and commits through the runtime-only boundary.
- Command, receipt, event, and exposure identities are deterministic over campaign, turn, batch, order, and exposure order.
- Command arguments and protected payloads use canonical JSON and exact SHA-256 digests. Event payload hashes cover the exact canonical `{ before, after }` bytes.
- One command emits exactly one receipt and one causal event. The executor checks complete batch row counts before commit; migration triggers enforce command/receipt/event/exposure correspondence.
- Character creation requires a typed CharacterRecord writer inside the same transaction. Opening completion changes setup phase to `ready` only after every placement, clock, and pressure command succeeds.
- Fault injection exists before and after every command and immediately before commit.

## Failure evidence

The focused transaction tests prove zero durable writes for:

- every before/after boundary of the multi-command opening batch;
- the final pre-commit boundary;
- stale base version;
- duplicate batch/command identity;
- a real SQLite uniqueness/constraint failure;
- a second writer blocked by an existing `BEGIN IMMEDIATE` owner;
- a forged or mutated preflight result whose integrity seal is absent or changed.

The persisted execution matrix covers all twelve command kinds. It includes first-human creation with CharacterRecord, initial player placement, world clock and every pressure state, all eight ordinary command kinds, a non-mutating world event, one projectable direct-perception exposure, per-step receipts/events, the final world hash, and the fenced `planned -> primary_settled` opening transition.

## Verification

```text
npm --prefix backend test -- src/campaign-play/rulebook.test.ts src/campaign-play/campaign-play-state-repository.test.ts src/campaign-play/campaign-play-turn-repository.test.ts src/campaign-play/opening-planner.test.ts
4 files, 90 tests passed

npm --prefix backend run typecheck
passed
```

Standalone smoke additions: `0`.

Independent Terra mechanical verification returned `PASS`: 90/90 focused tests, all twelve persisted command kinds, the full fault matrix, exposure persistence, and typecheck passed. Fresh Sol semantic verification returned `PASS` with P0/P1/P2 `0/0/0` after correcting collective accepted-base hash compression, permitting zero-version primary receipt batches, validating turn identity, and sealing accepted preflight results against mutation or forgery.

GitNexus impact was attempted for `createCampaignPlayStateRepository` and `preflightCampaignPlayRulebook`; both targets remain outside the stale index because the Campaign Play files are untracked in the inherited worktree. The implementation therefore treats the state/turn transaction change as semantically high risk and requires focused integration tests plus fresh independent semantic review before completion.
