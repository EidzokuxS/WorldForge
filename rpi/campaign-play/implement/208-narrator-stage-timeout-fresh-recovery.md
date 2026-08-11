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

## Acceptance handoff

Static acceptance is mapped to the repository deadline conditional, the
attempt-1 allowlist, the timeout success/terminal regressions, the existing
runtime/application recovery coverage, typecheck/build, diff, and GitNexus
evidence above. The materialization/hash pre-runtime boundary is evidenced,
but the prepare-gate failure makes live setup, opening, action checkpoints,
natural timeout recovery, 60-action endurance, same-page reload, and product
persistence unavailable. No runtime cleanup was needed; the task-owned failed
session root is preserved as generated evidence and no task listener or page
exists.
