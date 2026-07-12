# Campaign Play Task 10A — Fenced Turn Worker and Recovery

Date: 2026-07-11  
Branch: `feat/revamp`

## Result

Task 10A adds a campaign-scoped mechanics worker over the existing SQLite turn ledger. The service claims one stage at a time, starts external attempts in the same claim transaction, performs provider work after that transaction has committed, renews the same owner/epoch lease, and settles through the repository's fenced completion contracts.

The service is stage-neutral. Opening and player-action orchestration remain owned by Tasks 10B and 10C, which supply typed external and deterministic handlers.

## Ownership and fencing

- One `CampaignPlayTurnService` instance owns a unique worker identity and an injected monotonic clock.
- External claim creates one durable started attempt and returns its epoch-bearing worker token before provider execution.
- Heartbeats renew the existing lease with the same owner and epoch. They create no attempt and invoke no provider.
- Provider completion uses the latest renewed token. A completion from an older epoch is reported as stale and leaves artifacts, stage, versions, runtime events, and sanitized turn events unchanged.
- Queue and stage durations come from repository timestamps. Reopening the database reconstructs the same measurements from the durable turn and model-stage ledgers.
- Recovery reads the exact claim/resume boundary and same-epoch renewal count by joining the durable runtime event to its consecutive turn events; a restarted worker therefore reports the original queue and renewal history.
- Stage settlement checks the same turn, stage, owner, and epoch authority independently of lease-expiry extension. A handler that only renews its lease is reported as stalled.

## Recovery contract

| Durable state | Startup behavior | Provider calls | Continuation |
| --- | --- | ---: | --- |
| unowned external stage | ordinary `runNextStage` may claim | 1 after committed claim | fenced completion |
| live external attempt | preserve current owner until expiry | 0 | wait |
| expired external attempt | record one typed interruption, retain active-turn lock | 0 | explicit resume required |
| interrupted external attempt | preserve interruption | 0 | explicit resume required |
| explicit external resume | create a new lease epoch and attempt | 1 | fenced completion |
| deterministic stage with committed prerequisite | claim or take over after expiry | 0 | advance once |
| deterministic stage without prerequisite | leave durable state unchanged | 0 | wait for its artifact |

A killed process becomes recoverable when its lease expires. Treating a live lease as authoritative avoids a second provider call while the original process may still be executing.

## Repository boundary

The repository now exposes the exact accepted model artifact required by deterministic readiness checks: canonical bytes, artifact hash, requested model, execution evidence, and attempt timestamps. Recovery states expose the started-at timestamp of an active or interrupted external attempt. Existing 0027–0030 storage already supplies every required invariant, so Task 10A adds no migration.

## Integration evidence

The focused SQLite tests prove:

- two independent service/database handles produce one claim, one started attempt, one provider call, one accepted artifact, and one transition;
- a worker that read a ready stage before a peer advances it revalidates the changed stage/epoch and returns the current snapshot with zero duplicate provider calls;
- the provider can observe the committed started attempt and acquire a separate `BEGIN IMMEDIATE`, proving it runs outside the claim transaction;
- a same-epoch heartbeat renews the lease and advances the durable ledgers without another attempt or provider call;
- reopening an external attempt performs zero provider calls; expiry records one interruption and keeps the campaign's active turn;
- explicit resume creates attempt 2 at epoch 2 and invokes the provider once;
- an epoch-1 completion arriving after epoch 2 settles returns stale telemetry and leaves an exact database snapshot unchanged;
- an unexpected handler exception and an active-token `turn_stage_invalid` repository defect propagate to the worker host and remain eligible for ordinary expiry recovery; only a typed external interruption becomes a durable operational incident;
- a typed provider interruption records its supplied execution evidence and moves the same attempt to explicit-resume-required state;
- completion callbacks have a structurally synchronous `undefined` return contract; a Promise-like result is rejected while the started attempt remains under ordinary expiry recovery;
- a committed opening artifact survives close/reopen and permits one deterministic transition with zero provider calls;
- a missing deterministic prerequisite leaves the turn unchanged;
- queue time `100 ms`, stage time `50 ms`, and one renewal reconstruct identically from the reopened durable ledgers.
- an expired attempt reopened after one renewal reports queue time `100 ms`, stage time `100 ms`, and one renewal instead of restart-local zeroes;
- a completion callback that renews the same epoch without settling the stage raises `turn_stage_stalled`.

This is worker/recovery integration evidence for opening turn zero. It contains `0` completed player actions; multi-action gameplay remains owned by Tasks 10C and 17–19.

## Verification

- `npm --prefix backend run typecheck` — passed.
- `npm --prefix backend test -- --run src/campaign-play/turn-service.test.ts src/campaign-play/campaign-play-turn-repository.test.ts` — 2 files, 42/42 passed.
- `npm --prefix backend test -- --run src/campaign-play` — 16 files, 250/250 passed.
- `git diff --check` — passed; only inherited line-ending warnings were emitted.
- GitNexus change detection reports `CRITICAL` across 45 inherited tracked files and 22 existing flows. Task 10A remains in the untracked Campaign Play tree and is absent from the current index.
- Krypton POST, repaired maintainability/correctness, and fresh final semantic gates passed with remaining P0/P1 `0`.
- No standalone smoke suite was added. Focused SQLite integration tests exercise the production service and repository.

## Scope note

The worktree contains substantial inherited Campaign World, Campaign Play, frontend, and documentation changes. Task 10A touches only the execution packet's allowed files. Nothing is staged or committed.
