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

## Live r173 evidence

The one authorized evidence-only lane was
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r173` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`, on `feat/revamp` at accepted Task 216
commit `5520bb40a5274b52efb413af047c80ca2dd8df2a`. The isolated materializer
returned the campaign root
`R:\Projects\WorldForge\output\playtests\campaign-world-runs\pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r173\campaigns`.
The external run configuration was
`R:\Temp\WorldForge-task216-r173\run-config.json` and was removed after the
lane. The sole pre-runtime `prepare` phase ran before runtime, HTTP, browser,
or SQLite activity. The canonical state, config, and Brina card hashes were,
respectively, `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`,
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

The task-owned backend/frontend/CDP ports were 4580, 4581, and 4582. Backend
health, frontend page, matching API/CORS, and durable logging all passed:
backend stdout existed and grew after the health check and before import;
backend stderr was empty. The canonical rendered Brina import, Save/Continue,
lower-wards, Local, Already here, Looking for work, Begin, and Opening all
completed once. Opening was ready at world version 12/runtime revision 15.

The first action's long browser wait reached a transport timeout, but one
authoritative read proved its existing turn completed; it was bound exactly
once and was not clicked again. Actions 1-8 then each used one visible enabled
choice, one click, one durable completed player turn, and one proper-scene
binding. The terminal read-only copy records 8 completed player actions, 8
unique proper-scene bindings, 8 browser actions, and no duplicate command,
receipt, turn, operation, attempt, or proper-scene identities.

Action 9 selected one enabled choice (handle
`choice_91443334cd7bbbab7d491a68`) and was clicked once. Its exact turn was
`turn-player-action:c8b7023a53c534d7e75368aa9f2f5e399aaa8da2`. The authoritative
state and the SQLite copy both ended at world version 21/runtime revision 201
with phase `turn_active`, active turn status `interrupted`, retry eligibility
true, location `location_cbc8b9a0d481ecfabeb04fd9`, journal cursor 14, and
projection hash
`d51263f03350b4030e094831183127589f97ed8e08296473e81c6c3849a8444e`.
The turn row remained `primary_settled` with no completion timestamp; its
actor job `actor-job:0000:3cb6525b3053a81e9b815722` was `interrupted`. The
terminal copy had 35 commands, 35 receipts, 35 world events, 201 runtime
events, 8 Narrator operations, 9 Narrator attempts, 6 Actor jobs, 5 Actor
plans, and 8 Actor replanning attempts. `integrity_check` was `ok`, foreign-key
violations were zero, and all duplicate checks were empty. The frozen rendered
state showed `alderman-hallway`, a visible Your move surface, and four disabled
choice buttons.

This is the first genuine product boundary, not a browser timeout or an
unresolved admission: the exact admitted turn reached durable `interrupted`
state after its bounded actor replanning path. The preserved scalar window is
`backend-scalar-window-action-009.jsonl`, source backend lines 3072-3350,
window 01:31:45.000-01:32:40.000, exact turn
`turn-player-action:c8b7023a53c534d7e75368aa9f2f5e399aaa8da2`, and contains 10
scalar-only records. Attempt 1
`actor-replan-attempt:724e48ccc537e82fc948dff723142f26` recorded
`model_contract_invalid`; attempt 2
`actor-replan-attempt:9fec0befb7073f144245640fff438b29` recorded
`stage_timeout`, with worker epochs 1 and 2 and the same persisted deadline
`1786573957103`. The window contains only event names, timestamps, phases,
identities, provider/model/mode, finish, usage, status, and latency metadata;
prompts, bodies, candidates, tool arguments, prose, private reasoning,
secrets, and stacks were excluded. There was no attempt 3. No Resume, retry,
replay, bind, provider/model change, or later click was attempted.

Task 216's automatic Narrator recovery occurred naturally at action 7. Its
operation was
`narration-operation:d55bf1568dadbe99df9023f51e1ba5b612ef7d96` for turn
`turn-player-action:eb24dc9e71dd145a0fa4ca00ea9785c59f822783`; attempt 2
`narration-attempt:d1d3b94265a661cc8a71107dfaa20550cb6e5458` was accepted with
provider `zai-coding-plan`, model `glm-5-turbo`, strategy `strict_object`,
finish `stop`, valid schema outcome, worker epoch 2, and duration 7380 ms.
The immutable automatic deadline was `1786573880241`; the refreshed active
deadline was `1786573887239`; the operation completed with exactly two
attempts and no attempt 3.

Checkpoints 10, 20, 30, 40, 50, and 60, the 60-action completion, same-page
reload proof, and finalize phase are unavailable/skipped because the lane was
frozen at action 9. The preserved session root is
`R:\Projects\WorldForge\output\playtests\campaign-play\pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r173.session`.
Its `r173-evidence-hashes.json` (SHA-256
`f65dda901f0faf5c524a8ec44e789ce8240f8763c444fed6fa0bc722db7c84c1`)
enumerates the preserved evidence. Key hashes are: backend stdout
`d0cd71d9f1d9d9550a11987e7a986ad979bbfa15a3b8d021956919f63a88995e`, backend
stderr (empty) `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`,
frontend stdout `09a32abf6ad088bad531074fab307adfd262795af8ce2d88200be528f95da8db`,
frontend stderr `dbbd6a2a074bcbd701dd1b1de55e599ed36a7c49c4d16abd1d269f32630d27cf`,
journey result `e27919b831f06ac61fc78a908793ff3f97a2c96c41b73e9144cfa5f5322c6d28`,
journey log `c7516e39375631964c5b37f1c80e6b4f54b02419bfc93789513f144423da95c6`,
terminal checkpoint `58c9aa3886140b29295334b34b07bdd6e25ce25521712b1decfa23d1fa1fac44`,
rendered terminal state `1f22ed9e0b9b6af0539fe3885dec576ee302f4dcc105df74823b2afdddb5e33d`,
frozen screenshot `5472a0ec3c79a590837dcec65d061d4f3546e7848d76d1569014fa91c7d1fec4`,
scalar window `49c8c96db8f41bf4a305df6739f746a85caaa4d26b215eadf7d27be85e4ed7b9`,
scalar metadata `f52471a81535d9a08c65cec008ff91368d5820e09ab54336e39ebc75d93ea9c4`,
state.db `0f5e5445f3abdc4a2b46d493b7350ac2685f0bc383be3d9296298a7039092cdc`,
state.db-wal `edcc6348bdd99a693dfc6dc6c087cc603f3346f38a576990863fb3d0279aa7ac`,
and state.db-shm `db8d9d8410d03a6dfeb23475c5fe5966a02671551176efadc5d49fb748768a55`.

All task-owned processes were stopped and ports 4580-4582 were no longer
listening. The browser profile, external run configuration, temporary
helpers, and temporary read-only copies were removed; the r173 session/world
evidence and full backend logs were preserved. The only tracked change remains
this note; protected `AGENTS.md` and `CLAUDE.md` remain unstaged and
byte-preserved.

### r173 acceptance handoff

1. Setup, canonical rendered journey through Opening, durable backend logging,
   and cleanup: passed.
2. Actions 1-8: passed, with one admitted/completed turn and one unique proper
   scene per action; action 9: failed at the first product boundary with one
   click, no bind, and the exact persisted interrupted turn retained.
3. Terminal read-only reconciliation, integrity, foreign keys, duplicate
   checks, and scalar-only backend extraction: passed.
4. Natural Task 216 automatic recovery: passed at action 7; exact two-attempt
   cap and immutable automatic deadline were preserved; no attempt 3.
5. Actions 10-60, checkpoints 10-60, same-page reload, and finalize:
   skipped/unavailable by the required hard stop.
6. No source, test, configuration, prompt, schema, provider/model, or recovery
   behavior was changed; only this factual evidence note is tracked.
