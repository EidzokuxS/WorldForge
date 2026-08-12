# Task 216: Narrator automatic recovery fresh deadline

## Contract and boundary

For every already-authorized automatic Campaign Play Narrator recovery, the
active deadline is now a fresh
`preparedAt + CAMPAIGN_PLAY_AUTOMATIC_NARRATION_WINDOW_MS` window. The original
`automaticDeadlineAt` remains the immutable audit value. The existing
attempt-one allowlist, two-attempt cap, lease and worker-epoch fencing,
operation/result/narration/packet/receipt identity, provider/model/mode,
recovery feedback, prompts, schemas, mechanics, and acceptance path are
unchanged. Manual recovery retains its prepared-at-based window.

Frozen r171 remains immutable. This task does not replay action 22 or infer a
provider cause from its bounded Narrator failure.

## Impact and implementation

The current GitNexus index was refreshed before inspection. The nested
`prepareRecovery` closure is not registered as a symbol, so the exact source
file was used as the impact target. File-level upstream impact is LOW with
three direct importers (`campaign-play-application.ts`, `turn-runtime.ts`,
and `turn-runtime.test.ts`), zero mapped processes, and zero mapped modules.
No HIGH or CRITICAL target was reported.

`narration-operation-repository.ts` now uses the automatic 90,000 ms window
for every authorized automatic recovery and removes only the old non-timeout
expiry/reuse check. `automaticDeadlineAt` is not updated. No schema, migration,
application allowlist, provider/model branch, structured-output mode, prompt,
UI, mechanics, operation identity, or acceptance shape changed.

The direct runtime regression is parameterized over `narration_invalid`,
`provider_unavailable`, and `stage_timeout`. Each failure is prepared after
the original audit deadline, preserves identity and mechanics, receives a
fresh active deadline, and accepts exactly one attempt-2 proper scene. The
late-provider fence test now also asserts the fresh automatic deadline.

## Static evidence

The focused fresh-deadline regression passed 3/3. The full directly affected
turn-runtime suite passed all 82/82 assertions under the single-threaded
`threads` pool; the default `forks` pool also passed all 82/82 assertions but
returned a Vitest worker-shutdown `onTaskUpdate` error after assertions
completed. The application recovery suite passed 15/15, the Narrator suite
passed 44/44, and the neighboring Opening runtime suite passed 15/15.
Backend typecheck, production build, and `git diff --check` passed. Staged
GitNexus `detect_changes --scope staged` returned no changes; the uncommitted
protected AGENTS.md and CLAUDE.md are intentionally outside the staged set.

The initial test invocation with a backend-prefixed test path was a command
path error (`No test files found`) and did not execute product code; the
corrected focused and full commands above are the authoritative results.

## Live r172 evidence

The single fixed lane was materialized exactly once as
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r172` from the canonical
campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`. The isolated materializer root
and the three pre-runtime hashes matched the canonical state, config, and
Brina card values. Exactly one live `prepare` phase ran before runtime,
browser, HTTP, or SQLite activity. The canonical Brina import, Continue,
arrival selections, Begin, and Opening completed; action 1 was dispatched and
bound once.

Actions 2 through 31 were each selected from the current ready API state,
clicked once after a visible enabled-button check, waited for a durable
completion, and bound once. Checkpoints 10, 20, and 30 were captured from
exact copies of state.db/WAL/SHM, with matching source/copy SHA-256 hashes,
`integrity_check=ok`, and zero foreign-key violations:

| checkpoint | bound actions | world/runtime | commands/receipts/events | proper scenes | operations/attempts |
| --- | ---: | ---: | ---: | ---: | ---: |
| action-10 | 10 | 21 / 234 | 38 / 38 / 38 | 10 | 10 / 15 |
| action-20 | 20 | 32 / 475 | 66 / 66 / 66 | 20 | 20 / 30 |
| action-30 | 30 | 41 / 660 | 87 / 87 / 87 | 30 | 30 / 42 |

At action 32, the natural Narrator recovery exercised Task 216 and the lane
hit its first genuine product boundary. The player turn completed, but the
operation ended failed and narration was absent, so the lane was frozen with
31 bound actions; no click, bind, retry, Resume, replay, provider/model
change, or later action was attempted. A bounded read-only copy captured the
boundary with 93 commands, 93 receipts, 93 world events, 713 runtime events,
33 turn results, 33 narrations, 31 proper scenes, 32 operations, and 45
attempts; integrity was `ok` and foreign-key violations were zero.

The failed operation was
`narration-operation:6b87e7be95a22eafa51b616657e26bfbc59abab7`, for result
`result:9ac325201b08988d0dcdff2d7e75396ab15abc47`, narration
`narration:49e56d3c7c884591ea03156c6458bceed800269b`, turn
`turn-player-action:b04992367e5d906bce66b719501d197629e8b3ed`, and packet
hash
`099c002c84ff3c8e81ee31afe823398924fc0b89b69dabde03bac86229c8d454`.
Attempt 1 (`narration-attempt:45947fe78d4dde74a5b95116f3d0ad7c5d76e57a`,
worker epoch 1) failed with `narration_invalid`; attempt 2
(`narration-attempt:4950ffd16fc5503d393e5f260a5f0a2a059a5f08`, worker epoch 2)
also failed with `narration_invalid`. Attempt 1 completed at
`1786569506679`; attempt 2 began at `1786569506680`, and the persisted active
deadline was `1786569596679`, exactly 90,000 ms after the attempt-1 completion.
The original automatic audit deadline `1786569589027` remained unchanged.
The operation has exactly two attempts, no attempt 3, no proper scene, no
acceptance, and no late write. Across the lane, 19 operations used one
attempt, 13 used two, and every one of the 31 accepted operations has exactly
one proper scene.

No r171 artifact was modified. The attempted long browser wait timed out at
the tool transport boundary while the application continued to a durable
failed terminal state; this is recorded as an execution/control boundary,
not a second product retry or an inferred provider cause.

## Acceptance handoff

1. Fresh automatic deadline for all allowlisted errors: static parameterized
   runtime regression passed 3/3; live action-32 `narration_invalid` recovery
   persisted the exact 90,000 ms fresh active window and immutable audit
   deadline.
2. No eligibility widening: application allowlist and attempt-one cap were
   unchanged; static application suite passed 15/15.
3. Attempt-2 acceptance and exactly-once scene/mechanics: runtime regression
   passed; live checkpoints show 31 accepted operations = 31 proper scenes,
   with commands/receipts/world events advancing once per bound action.
4. Terminal attempt-2 cap/no attempt 3: static runtime coverage passed; live
   action-32 operation has 2 failed attempts and no third attempt.
5. Late/stale fencing: existing runtime regression passed, including the
   late-provider fence; live failure has distinct worker epochs 1 and 2 and
   no acceptance after terminal failure.
6. Immutable automatic audit deadline/manual behavior: repository change and
   focused runtime tests cover the immutable field; manual recovery path was
   not changed. Live operation preserves the original audit value.
7. Provider/model/mode/prompt/schema/UI unchanged: source diff is limited to
   the repository deadline expression, owned tests, and this note.
8. Focused/full Narrator runtime, application, Narrator, Opening runtime,
   typecheck, production build, diff check, and staged GitNexus checks passed
   as recorded above. Built-product validation is unavailable beyond the
   first genuine live defect: checkpoints 40/50/60, final reload, and
   finalize were intentionally skipped after the frozen action-32 boundary.

Protected `AGENTS.md` and `CLAUDE.md` remain unstaged and byte-preserved.
