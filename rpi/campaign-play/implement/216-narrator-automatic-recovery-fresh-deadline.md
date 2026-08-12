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

Pending the single fixed fresh lane required by Task 216. No r171 artifact is
modified.

## Acceptance handoff

Static and live criteria will be mapped here after the implementation checks
and the bounded r172 journey. Protected `AGENTS.md` and `CLAUDE.md` remain
unstaged and byte-preserved.
