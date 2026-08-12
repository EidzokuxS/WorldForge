# Task 213 — Actor Replanner stage-timeout fresh recovery

## Contract and boundary

This task adds one bounded automatic recovery for an Actor Replanner attempt
whose first model stage reaches its local `stage_timeout` deadline. Attempt 1
keeps the configured Actor Replanner language model, normal proposal
schema/prompt, `auto` structured-output mode, and its own 90,000 ms deadline.
Only that exact first-attempt timeout may open attempt 2. Attempt 2 receives a
new controller and a fresh deadline prepared at retry time, while retaining
the same job, stage, turn, actor/frame, frozen base world, model/provider,
lease/epoch, CAS, and two-attempt fence. Mechanics are never replayed. Existing
`model_contract_invalid`, route-specific, provider, budget, persistence, and
lease-loss paths remain unchanged. No prompt, schema, UI, copy, public type,
database table/column, or retry-count change is included.

## Impact gate

Exact current-source GitNexus impact was run before editing the two production
owners. `actor-replanner.ts` is LOW (7 impacted symbols, 2 direct callers, no
mapped processes/modules). `campaign-play-turn-repository.ts` is MEDIUM (15
impacted symbols, 10 direct callers, no mapped processes/modules). The
enclosing Campaign Play runtime fan-out is acknowledged but no additional
production owner was edited. `backend/src/db/schema.ts` was intentionally not
touched; its known CRITICAL fan-out is outside this task. The new migration is
SQL trigger surface only and has no source symbol.

## Implementation

`actor-replanner.ts` now gives every attempt its own local operation,
AbortController, deadline, and provider race. A first timeout is normalized to
the existing `transport_error`/`stage_timeout` classification and is eligible
for exactly one retry while the original lease and epochs remain live. The
retry persists attempt 1 as interrupted, consumes the retry marker once, and
creates attempt 2 with the original normal model/schema/prompt and `auto`
mode, a new controller, and `retryPreparedAt + externalOperationDeadlineMs`.
Contract-invalid recovery still uses its previous shared deadline and recovery
model/schema/prompt branches. Acceptance remains behind the existing plan,
lease, epoch, deadline, and CAS fences.

`campaign-play-turn-repository.ts` now validates the same reason-aware chain:
`model_contract_invalid` requires retry preparation before the original
deadline and the shared deadline; `stage_timeout` requires transport-error
classification, retry preparation at/after the first deadline, and a strictly
fresh later deadline. Identity, uniqueness, delete, lease, and artifact
checks remain unchanged.

Migration `0052_campaign_play_actor_replan_timeout_recovery.sql` replaces only
the actor-replan attempt insert/update guards. It keeps migration 0050 and the
delete guard byte-for-byte unchanged, adds the reason-aware marker/insert
matrix, and leaves every unrelated trigger intact. The Drizzle journal records
the forward migration at index 52.

## Static evidence

- Actor Replanner: 18/18 assertions passed.
- Database trigger matrix: 19/19 assertions passed, including shared and
  fresh model-contract deadlines, fresh/expired/shared stage-timeout cases,
  provider/other errors, attempt-3 rejection, marker immutability, and
  `integrity_check`/`foreign_key_check`.
- Turn repository: 35/35 assertions passed.
- Campaign Play application: 15/15 assertions passed.
- Turn runtime: all 80 assertions passed in the full suite; Vitest then
  reported the known post-pass `onTaskUpdate` worker-shutdown error. A clean
  bounded rerun of the directly affected timeout/recovery cases passed 4/4
  with exit 0 (the remaining 76 tests were skipped by the narrow filter).
- `git diff --check` has no errors (only the repository's normal LF/CRLF
  warnings).
- Typecheck, production build, and staged GitNexus `detect_changes` are run
  before the implementation commit and recorded below.

No prompt or player-facing prose changed; humanizer/deslop review is not
applicable. Generated r166 evidence is intentionally not tracked.

## Live evidence

Pending implementation push and the single fresh lane
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r166` on ports 4520/4521/4522.
The lane must use the materializer-returned isolated `GSD_CAMPAIGNS_ROOT`, an
external run-config, one pre-runtime `--live-phase prepare`, canonical state,
config, and Brina hashes, one canonical setup, sequential read-before-click
actions, checkpoints at 10/20/30/40/50/60, and one same-page reload only after
60 bindings. Natural Task 213 recovery will be reported only if observed;
otherwise it is unavailable rather than inferred.

## Acceptance handoff

Static evidence covers the exact fresh-timeout attempt lifecycle, accepted and
terminal retry fences, migration trigger matrix, repository parity, and
neighboring recovery behavior. Live acceptance remains pending until r166
freezes at its first authoritative defect or reaches 60/60 plus reload. The
natural timeout-recovery criterion, checkpoints, persistence integrity, and
reload are unavailable until that run completes.
