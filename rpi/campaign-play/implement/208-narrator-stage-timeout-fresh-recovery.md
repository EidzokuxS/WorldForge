# Task 208: Narrator stage-timeout fresh recovery

## Contract and boundary

When the first Campaign Play Narrator attempt fails with `stage_timeout`, the
existing single automatic recovery now receives a fresh 90,000 ms active
deadline. The recovery preserves the operation, result, narration, packet,
receipt, runtime, provider/model, structured-output mode, undefined feedback,
one-recovery fence, late-result fencing, and terminal fallback semantics. It
does not replay mechanics or change prompts, schemas, UI, copy, persistence,
or any non-Narrator recovery.

Frozen r156 action 24 remains immutable. Its Narrator attempt reached the local
90,000 ms AbortSignal boundary and Task 201 recorded an `ai.zai_fetch.settlement`
`aborted` event. Mechanics and visibility settled once; no proper scene or
automatic recovery followed. This task changes the recovery boundary without
inferring a provider cause.

## Impact and implementation

An exact-entry GitNexus shadow was built from entry
`6e651761c0f56f7f3bb82e4a62dbd65327cbaad9`. The nested `prepareRecovery` and
`driveNarration` closures were absent from the registered index, so the
source-qualified owners were used. `driveNarration` mapped LOW: 9 impacted
symbols, one direct caller, two Campaign Play processes, and Engine plus
Campaign-play modules. The enclosing
`createCampaignPlayNarrationOperationRepository` mapped HIGH: 17 impacted
symbols, three direct callers, three processes (`drive`, `admitTurn`, and
`recoverNarration`), and the Engine/Campaign-play modules. Main authorized the
exact private timeout-deadline exception and no additional production owner.

`narration-operation-repository.ts` now derives a fresh
`preparedAt + CAMPAIGN_PLAY_AUTOMATIC_NARRATION_WINDOW_MS` active deadline only
for automatic recovery of a failed operation whose error code is
`stage_timeout`; `automaticDeadlineAt` remains unchanged. Other automatic
recoveries and manual recovery keep their existing deadline arithmetic. The
`driveNarration` attempt-1 automatic recovery allowlist now includes only this
additional `stage_timeout` branch; its existing runtime/model/mode and
undefined-feedback path remain unchanged.

No prompt, player-visible copy, or substantial product prose changed;
humanizer/deslop and UI-concept review are not applicable.

## Static evidence

The focused Campaign Play application suite passed 15/15. The focused
Narrator-timeout recovery tests passed 7/7, and the direct fresh-deadline
boundary test passed 1/1. The complete turn-runtime suite passed all 77
assertions, but Vitest reported the known post-pass
`[vitest-worker]: Timeout calling "onTaskUpdate"` unhandled worker-shutdown
error; this is recorded separately from the assertion result. The bounded
reruns exited cleanly without assertion failures.

The new regressions prove: first timeout then successful attempt 2 uses
`auto`/`auto`, undefined recovery feedback, unchanged operation/result/
narration/packet/receipt identity, exactly two attempts, one proper scene, and
no mechanics replay; first timeout then failed attempt 2 remains terminal with
no attempt 3, proper scene, or mechanics replay; and a direct automatic
stage-timeout recovery gets a fresh active deadline while preserving the
immutable automatic deadline and operation identity. Existing timeout,
provider-unavailable, narration-invalid, CAS, late-provider, and fencing tests
remain covered.

Backend typecheck and production build passed. `git diff --check` passed. A
staged GitNexus `detect_changes` run was recorded with the implementation
commit and remained limited to the two Narrator recovery owners, focused tests,
and this note. The registered index was stale and reported no mapped source
symbols for the staged files; the exact-entry shadow impact above is the
authoritative scope evidence. Protected `AGENTS.md` and `CLAUDE.md` remain
unstaged and byte-preserved.

## Live r157 evidence

The fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r157` was
materialized exactly once for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`. Before any runtime, browser, or HTTP
activity, the generated state and config matched the canonical hashes
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2` and
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`; the
canonical Brina card matched
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
The required `--live-phase prepare` gate was then invoked with ports
4430/4431/4432 still unused, but it stopped before database inspection or
runtime startup with `Campaign Play live evidence path already exists for
pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r157` at
`e2e/campaign-play/live-session.ts:258`. The only pre-existing path was the
task-owned generated session root containing `build/run-config.json`; no
backend, frontend, browser/CDP, watcher, or HTTP process was started and all
three task ports remained unbound. Per the startup contract this prepare-gate
failure freezes r157: no import, Save, Begin, player action, recovery,
checkpoint, reload, or product cleanup was attempted.

## Live r158 evidence

The corrected fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r158`
was materialized exactly once for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`. The generated state, config, and
canonical Brina card were verified before runtime activity with SHA-256 values
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`,
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
The input run-config was kept at the external task-owned path
`R:\Temp\WorldForge-task208-r158\run-config.json`, outside both r158
evidence roots. `--live-phase prepare` ran immediately after materialization
and hash verification, before any runtime, watcher, browser/CDP, HTTP, or
database inspection, and succeeded by creating the r158 session root. This
corrects the r157 ordering defect; the r158 pre-runtime gate is passed.

The one-time Brina import, Save/Continue, lower-wards / Local / Already here /
Looking for work selections, and Begin completed. Opening reached a ready
proper scene. Actions 1 through 33 each settled exactly once with one unique
proper-scene binding. Read-only checkpoints were:

| actions | turns | proper scenes / narration operations | receipts | Narrator attempts | world / runtime | integrity / FK |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 10 | 10 | 10 / 10 | 37 | 11 | 22 / 166 | `ok` / `[]` |
| 20 | 20 | 20 / 20 | 61 | 22 | 34 / 348 | `ok` / `[]` |
| 30 | 31 (including Opening) | 30 / 30 | 86 | 35 | 45 / 567 | `ok` / `[]` |

Existing non-Task-208 recoveries occurred naturally, including Narrator
packet-validation recovery at action 6, generation-schema recovery at action
19, and other Narrator recoveries at actions 26, 28, 29, and 31. No Narrator
stage-timeout occurred, so direct live Task-208 recovery coverage is
unavailable; no failure was manufactured.

Action 34 is the first genuine terminal product/model-stage boundary. The
single admitted turn is
`turn-player-action:d7d36b146341d3937a1521b579f385fb8645f336`, with world
version 49 and expected runtime revision 635. Its Game Master stage
`3ff0a2960f3eda035816c80e1515b5bd41e962b3678a7dfc9b4cb9aaf43a355b` had
attempt 1 end in the existing model-contract recovery path and attempt 2 then
end at the shared deadline with `error_code=stage_timeout`,
`schema_outcome=transport_error`, duration 90,473 ms, and no actual provider
response metadata. Task 207's existing private event classified this failed
invocation as `phase=review` with `errorCode=transport_interrupted` and only
allowlisted empty coordinates; no raw provider or candidate data is retained.
There is no downstream result, command, receipt, Narrator operation, proper
scene, or binding for action 34. The authoritative turn remains
`interrupted`, `retryEligible=1`, with no completion; the rendered page shows
the stopped-turn fallback and an enabled Resume control. Resume is not used.

At the terminal boundary the read-only copied database reported 35 turns, 94
commands, 94 receipts, 33 Narrator operations, 39 Narrator attempts, and 33
proper scenes; worldVersion was 49 and runtimeRevision 648. SQLite
`integrity_check` was `ok` and `foreign_key_check` was empty. No later action,
late acceptance, duplicate settlement, or mechanics replay was observed.
The terminal database trio and backend/frontend logs were copied into the
session evidence under `probes/terminal-action-34/`; generated evidence is
uncommitted.

## Live r159 evidence

The unchanged-source lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r159`
was materialized exactly once for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66` from entry
`9a8d0df61a71f0e94ab43f21489664c4ef861799`. Before any runtime, HTTP,
browser/CDP, watcher, helper, or database activity, the generated state and
config matched the canonical SHA-256 values
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2` and
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`; the
canonical Brina card matched
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
The input run-config was kept at the external task-owned path
`R:\Temp\WorldForge-task208-r159\run-config.json`, outside both evidence
roots. The required single `--live-phase prepare` invocation then stopped
before creating the session root or starting any runtime with
`Template-backed live evidence requires an isolated GSD_CAMPAIGNS_ROOT.`
(`e2e/campaign-play/live-session.ts:77`). No backend, frontend, browser/CDP,
watcher, HTTP request, or database inspection was performed after
materialization; ports 4450/4451/4452 remained unused. Per the r159 startup
contract, this is the immutable first verification boundary: prepare was not
retried, no import/Save/Begin/action/recovery/checkpoint/reload was attempted,
and no product or SQLite state was changed. The materialized world-run root
and external run-config are preserved as evidence; the expected session root
was never created. Consequently Opening, Task-208 timeout recovery, all
player-action bindings, checkpoints, 60-action endurance, and same-page reload
are unavailable for r159.

## Acceptance handoff

Static acceptance is mapped to the repository deadline conditional, the
attempt-1 allowlist, the timeout success/terminal regressions, the existing
runtime/application recovery coverage, typecheck/build, diff, and GitNexus
evidence above. The materialization/hash pre-runtime boundary is evidenced,
but the r157 prepare-gate failure is preserved as immutable verification
evidence. The corrected r158 materialization, canonical hashes, external
run-config, pre-runtime prepare ordering, setup, Opening, actions 1-33,
checkpoints, terminal action-34 identity, read-only persistence checks, and
cleanup are evidenced above. Natural Task-208 Narrator stage-timeout recovery,
actions 34-60, the 60-action endurance target, and same-page reload are
unavailable because the first terminal Game Master stage-timeout boundary
froze r158. No Resume, retry, replay, later click, or SQLite mutation was
performed. The r159 materialization/hash boundary is also evidenced above,
but its single prepare invocation failed before session-root creation because
the isolated `GSD_CAMPAIGNS_ROOT` requirement was absent. The contract forbids
retrying prepare or creating a replacement lane, so all r159 rendered,
persistence, recovery, checkpoint, 60-action, and reload criteria are
unavailable; no r159 Task-208 live recovery claim is made.
