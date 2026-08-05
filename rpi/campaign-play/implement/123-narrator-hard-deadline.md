# Task 123 — Campaign Play Narrator hard deadline

## Terminal disposition

**Done.** The bounded backend slice and the required built `/campaign/:id/play`
journey pass in a task-owned isolated shadow copy. The original settings stayed
byte-for-byte unchanged, and Main accepted the independent disappearance of
unrelated listener PID `33524` on port `3001` because this task never signaled
or restarted it. The automatic hard deadline, late-result fence, and distinct
Manual Restore window are evidenced below.

## Acceptance preflight and isolation

Before the authorized settings swap, the safety check found pre-existing
runtime listeners that this task did not create and cannot treat as task-owned:

- `[2026-08-04 23:09:49]` PID `33524`, `node.exe --import tsx/esm
  src/index.ts`, listening on `[::]:3001`.
- `[2026-08-05 05:28:45]` PID `33068`, Next start-server launched from
  `R:\Projects\L3`, listening on `[::]:3000`; its `cmd.exe` parent was PID
  `49156` (`next dev`).

The original listeners remained outside the task boundary throughout; this
task never signaled or restarted them. The rendered pass used a verified shadow
copy at a task-owned temporary path with
fresh ports `34123` (helper), `33123` (backend), and `32123` (frontend), plus a
disposable ready campaign `d1111111-1111-4111-8111-111111111111`. The shadow
settings file was the only settings file edited; its provider selection was
task-owned and loopback-only. The original settings SHA-256 was verified before
and after as
`577C39D0A04B5B086D6A4F34F2FD3FA6878A91F6A4FCC82978C17B0C791E0B3D` and
`git status -- settings.json` stayed empty. The settings backup was access
restricted, contained no retained evidence, and was removed during cleanup.

At final cleanup, port `3001` had no listener and PID `33524` was absent;
port `3000` remained owned by PID `33068`. Main reconciled this independent,
non-task-owned disappearance and accepted it without a repair by this task.

## Experience contract and scope

- Actor: Campaign Play player.
- Surface: the existing `/campaign/:id/play` route and persisted public read model.
- Trigger: a committed player action creates one Narrator operation; attempt 1
  may produce `narration_invalid`, which can start the existing one-time
  automatic default-reasoning attempt 2.
- Observable outcome: a proper scene is accepted only before the persisted
  deadline; at expiry the operation is truthfully failed, concise result and
  next actions remain available, reload preserves that state, and a late
  provider result cannot create or project a scene. Manual Restore opens one
  fresh bounded window on the same immutable operation/result/turn/narration/
  packet/receipt identity without mechanics replay.
- Forbidden surfaces: mechanics, prompts, providers/models/defaults, visible
  copy/layout, story-action count/order, Opening Narrator, Judge, Game Master,
  actor planning, frozen runs, and new product fault-injection seams.

## Deadline contract

`automatic_deadline_at` is persisted when the player-action operation is
created as `min(completedAt + 90_000, submittedAt + 115_000)`. Attempt 1 and
automatic attempt 2 carry the same `active_deadline_at`; lease renewal clamps to
that deadline and cannot extend it. `executeNarration` schedules an abort-aware
timer for the remaining time, races provider work against that timer and lease
heartbeat, and records one terminal `stage_timeout` failure. Acceptance checks
the token/owner/epoch/lease and performs an SQL deadline CAS (`acceptedAt <
active_deadline_at`) in the same transaction that writes the scene and accepted
attempt, so an ignored abort cannot commit late output.

Manual Restore uses a separate persisted `active_deadline_at = preparedAt +
90_000`, increments the attempt/epoch through the normal claim path, preserves
all immutable identity fields, and leaves the automatic deadline unchanged.
Late automatic tokens are rejected after the manual window is prepared.

## Delta

- `backend/src/campaign-play/narration-operation-repository.ts`: deadline
  fields/tokens, creation math, hard-deadline claim/renew/interrupt fencing,
  coalesced terminal failure, atomic acceptance fence, and automatic/manual
  recovery windows.
- `backend/src/campaign-play/turn-runtime.ts`: abort-aware remaining-deadline
  race and terminal timeout handling; recovery kind plumbing.
- `backend/src/campaign-play/campaign-play-application.ts`: injects the
  application clock/timer into the default player-action runtime and marks the
  existing automatic recovery as automatic; Opening construction is unchanged.
- `backend/src/db/schema.ts`: two non-null deadline columns, payload checks, and
  the active-deadline lookup index.
- `backend/drizzle/0049_campaign_play_narrator_hard_deadline.sql`: additive
  migration with pre-deadline backfill from operation creation and turn
  submission, plus the active-deadline index.
- `backend/drizzle/meta/_journal.json`: migration 0049 registration.
- Focused repository/runtime/database tests cover migration compatibility,
  normal success, invalid→automatic success (existing contract), automatic
  timeout/no attempt 3, ignored-abort late output, acceptance CAS rejection,
  reload/process recovery, Manual Restore identity/window, stale attempts,
  duplicate failure completion, and integrity/FK checks.

No prompt, model/provider configuration, visible copy, or substantial
player-facing prose changed; humanizer/deslop review is therefore not
applicable.

## GitNexus impact and source confirmation

The index was refreshed before mutation. Required upstream impacts were run
before edited symbols: the narration repository factory was **HIGH** (32
upstream callers), claim was **HIGH** (19), the default turn-runtime factory
was **HIGH** (27); `loadState` returned **CRITICAL** (844) and was not edited.
The indexed test-helper symbols were unavailable/unknown (stale index); they
were limited to deterministic test fixtures. Final `detect-changes --repo
WorldForge --scope unstaged` reported 9 files/44 symbols, 11 affected flows,
high risk; the two pre-existing instruction-file edits are included in that
readback and are not owned by this task.

## Validation evidence

- Branch/base: `feat/revamp`, `39c93a6e87ea87d7104a835cb783e11d20397004`.
- `npm --prefix backend run typecheck`: passed.
- `npm --prefix backend test -- --run --no-file-parallelism --maxWorkers=1
  src/campaign-play/turn-runtime.test.ts`: 63/63 passed.
- `npm --prefix backend test -- --run --no-file-parallelism --maxWorkers=1
  src/campaign-play/campaign-play-application.test.ts`: 12/12 passed.
- `npm --prefix backend test -- --run --no-file-parallelism --maxWorkers=1
  src/routes/campaign-play.integration.test.ts`: 1/1 passed.
- `npm --prefix backend test -- --run
  src/campaign-play/campaign-play-database.test.ts`: 18/18 passed,
  including migration 0049/backfill and SQLite integrity/FK checks.
- `npm run build`: shared build, frontend production build, and backend build
  passed. Root `npm run typecheck` remains red only on the pre-existing
  unrelated Forge lint error at `frontend/app/(non-game)/campaign/[id]/forge/page.tsx:105`
  (`react-hooks/set-state-in-effect`); backend typecheck is green.
- `git diff --check`: passed.
- `detect-changes`: completed with the high-risk readback above.

Deterministic late-return trace: operation completion `7590`, submission
`7500`, persisted automatic/active deadline `97590`; attempt 1 failed
`narration_invalid`, attempt 2's provider signal aborted at `97590`, and the
provider was then deliberately released with a valid candidate. The public
state remained failed with concise actions, proper-scene count stayed zero,
reload preserved operation/attempt 2 and immutable identity, and a direct late
acceptance using the old attempt token failed `operation_fence_lost`. Manual
Restore then created attempt 3 with `active_deadline_at = now + 90000`, kept
the automatic deadline and result/narration/packet/receipt IDs unchanged,
performed no mechanics work, and accepted exactly one proper scene. The
normal existing invalid→success journey remains two attempts/one scene.

## Rendered acceptance and handoff

The built frontend was opened at
`http://127.0.0.1:32123/campaign/d1111111-1111-4111-8111-111111111111/play`.
The task-owned helper received OpenAI-compatible `/v1/chat/completions`
requests only for the player-action storyteller role. Sanitized request trace
and browser captures are retained under
`output/playtests/campaign-play/task-123-narrator-hard-deadline/`.

Normal journey (`1785918893525` click) admitted one Wait action and accepted
one proper scene before its deadline. Operation
`narration-operation:206c402f3eb3a38725af9487750e18c3b16cecdd` used turn
`turn-player-action:325ecf9f39d2b8d0ed8a977640350d131b5a1c4e`, result
`result:f710bac881b9a84e2192f26f4fdfe8e2897b90d6`, narration
`narration:d9d9331cff8bee45fb7d2ba2d8b7fd45287b5d64`, packet
`9f8d6fadf36a15b9cb536370a3e99cda17b3723f4a93523c15ac9de7d37e331c`, and
five receipts. Reload retained the proper scene and enabled actions.

The delayed journey (`1785919101613` click) committed mechanics once and kept
the same immutable identity through recovery: operation
`narration-operation:1b90e3239706e3d6390d705fcdbf77ffa944a4aa`, turn
`turn-player-action:ebda8e8bb2d8c1d43e75c06f6a89577280b41b1d`, result
`result:b110721f087ce56b93712ff054ac6379211fd716`, narration
`narration:e0c81ddb2a5eaacc9863d828ba5eb531ebeab938`, packet
`5a09c704685350cffbcc7192e1ef8ae709e7d5476661623448a7c07d72de51ef`, and
three receipts. Attempt 1 was semantic-invalid
(`narration-attempt:dcaaaaba1e254ffc7e00b96df4930050ff41379c`); automatic
attempt 2 (`narration-attempt:c5ee43f6bfcf8cc1cc21841351e533483221937e`) held
past the persisted automatic deadline `1785919216688`, which is
`min(1785919138704 + 90000, 1785919101688 + 115000)`. At the boundary the UI
showed the concise “What happened” result, enabled next actions, and no proper
scene. The operation durably reported `failed` / `stage_timeout`, with exactly
two automatic attempts. The helper's late packet was attempted at
`1785919234124`; its sanitized trace and post-release API/UI/SQLite reads show
no operation, scene, mechanics, receipt, world, or attempt-3 mutation. Failed
reload retained the same concise state and actions.

One Restore click (`1785919311491`) created the distinct manual attempt
`narration-attempt:8ade9c3a76a936aa772124065db05ee27707ad87`, epoch 3, inside
the fresh persisted manual window ending `1785919401566`. It accepted one
proper scene at `1785919311683` while preserving operation/result/turn/narration/
packet/receipt identity and performing no mechanics replay. The recovered
scene and controls survived reload. Total shadow counts after settlement were
12 turns, 40 receipts, 40 events, 322 runtime events, 11 narration operations,
14 narration attempts, and 8 proper scenes (baseline 10/32/32/266/9/10/6;
manual Restore changed only narration state/scene).

Read-only SQLite checks after recovery: `integrity_check` = `ok` and
`foreign_key_check` = empty. Humanizer/deslop verdict: no prompt, model,
provider default, visible copy, or substantial player-facing prose changed; no
rewrite was required.

## Cleanup and repository state

Only task-owned source, migration, focused tests, and this note are candidates
for staging. The pre-existing `AGENTS.md` and `CLAUDE.md` changes remain
unstaged and untouched. The shadow helper, settings backup, shadow copy, and
its two dependency junctions were removed after the browser/backend/frontend/
helper processes stopped; fresh ports `34123`, `33123`, and `32123` were free.
The sanitized screenshots, request trace, and read-only evidence remain under
the task-owned output directory and are intentionally not staged.

Main reconciliation: Main accepted the independent disappearance of unrelated
PID `33524` / port `3001`; this task did not signal or restart that listener.
The original settings hash remained unchanged, and PID `33068` / port `3000`
remained alive.
