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

The implementation was pushed at `78834ce6aa313f8c8300c3aa4e175291ade4efb9`
before the single fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r166`
(`6b85a49e-fef5-4359-95e2-051383f6fb66`). Materialization ran once and returned
the isolated campaigns root
`output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r166/campaigns`.
The input run-config was outside both evidence roots and `GSD_CAMPAIGNS_ROOT`
was exported to that exact path. The sole `--live-phase prepare` ran before
runtime, HTTP, browser, or database inspection and created the session root.
The pre-runtime hashes matched: state
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and Brina
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Setup was performed once: one Brina import, one Save/Continue, the exact
`lower-wards / Local / Already here / Looking for work` choices, and one Begin.
The Opening reached ready with a proper scene. Actions 1 through 53 each used
one reconciled rendered enabled choice and produced one durable turn, one
proper-scene binding, and exactly-once commands/receipts; no Task 213 timeout
recovery occurred naturally.

Read-only checkpoint evidence:

| completed/bound | world/runtime | turns/results/narrations | proper scenes/operations | commands/receipts | integrity/FK |
|---|---|---|---|---|---|
| 10/10 | 22/179 | 11/11/11 | 10/10 | 35/35 | `ok` / `[]` |
| 20/20 | 32/334 | 21/21/21 | 20/20 | 57/57 | `ok` / `[]` |
| 30/30 | 42/495 | 31/31/31 | 30/30 | 79/79 | `ok` / `[]` |
| 40/40 | 53/663 | 41/41/41 | 40/40 | 102/102 | `ok` / `[]` |
| 50/50 | 65/876 | 51/51/51 | 50/50 | 128/128 | `ok` / `[]` |

The final durable action was 53
(`turn-player-action:21e6434bd1b784847f1d4944532d14b7135c1c99`, with its
corresponding completed Narrator operation/proper-scene binding); authoritative
state was `ready`, `worldVersion=68`, `runtimeRevision=930`, with no active
turn. Before action 54 the runner held a pending-decision record for the
currently rendered enabled choice `choice_acdd73733c7242799ccba7cc` and its
reconciled visible-state hash. The documented DOM, Playwright, keyboard, and
CDP input routes all timed out or disconnected before dispatch; repeated
read-only state reconciliation remained `ready`, `worldVersion=68`,
`runtimeRevision=930`, with no new turn, command, receipt, operation, scene, or
write. No later product click was attempted. This is a verification boundary,
not a proven product defect, and the submitted action remains unproven.

Task 213's natural stage-timeout recovery evidence is unavailable: no first
attempt with persisted `stage_timeout` occurred during actions 1-53. Actions
54-60 and the same-page reload are unavailable because the first safe
verification boundary prevented an unproven repeat. Generated session/world
evidence remains untracked.

Cleanup completed: the task-owned backend/frontend trees, ports 4520-4522,
browser tab/profile session, external run-config, and read-only database copies
are absent; the r166 session/world evidence roots remain preserved. The only
working-tree changes are the pre-existing unstaged `AGENTS.md` and `CLAUDE.md`
plus this note.

## Acceptance handoff

Static acceptance is complete: the Actor Replanner has a fresh, fenced
stage-timeout attempt-2 operation; the repository validator and migration
guards enforce the reason-aware chain; model-contract-invalid, route, provider,
budget, lease, CAS, and no-attempt-3 behavior remain covered by the focused
suites. The build, typecheck, diff check, staged detect_changes, commit, and
push all passed.

Live setup, hashes, Opening, actions 1-53, checkpoints 10/20/30/40/50, clean
integrity/FK, and no duplicate or late write through the boundary are directly
evidenced above. Natural Task 213 recovery, checkpoint 60, 60/60 unique
bindings, and same-page reload are unavailable; no inference is made from
static tests or the verification-only action-54 boundary.

## r167 unchanged-source live lane (2026-08-12)

The required entry was `8bbe0bddd4ba63d2695f512319038b3899b5d83f` on
`feat/revamp`, equal to `origin/feat/revamp`; only the pre-existing protected
`AGENTS.md` and `CLAUDE.md` dirt remained. The immutable lane was
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r167` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`. Materialization ran exactly once and
returned the isolated campaigns root
`output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r167/campaigns`.
The run-config was kept outside both evidence roots, and the sole
`--live-phase prepare` ran with that exact `GSD_CAMPAIGNS_ROOT` before any
runtime, HTTP, browser, or database inspection.

The pre-runtime hashes matched the canonical values: state
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
The task-owned backend started on 4530. The first frontend launch used its
default API target and rendered the service-unavailable surface; it was
stopped without any product setup or write. A second task-owned frontend was
then launched on 4531 with the backend API target corrected to 4530.

Before the required one-time import/setup journey could begin, the supported
browser control layer lost access to the same task-owned tab. Its supported
reload/read operation was rejected by URL policy after the tab held a browser
error-page URL. Reconciliation established no Brina import, Save/Continue,
setup selection, Begin, player click, POST, admission, turn, command, receipt,
Narrator operation, proper scene, or database write. No ambiguous product
dispatch occurred, and no direct API or alternate browser route was used.
Under the r167 pre-dispatch recovery rule this is a verification/environment
boundary, not a product defect; the lane is frozen before setup.

Rendered Opening, actions 1-60, checkpoints, Task 213 natural timeout
recovery, 60 unique bindings, and same-page reload are unavailable. The
generated r167 session/world roots are preserved. Cleanup stopped the
task-owned backend/frontend trees and verified ports 4530-4532 were free; the
browser session was finalized, and the external helper/run-config were
removed. Task-owned logs remain as bounded evidence. No production source or
test changed.

The remaining acceptance gap is therefore live verification only: restore a
supported browser input/read route before attempting a future fresh lane. No
product repair is selected by this boundary.

## r168 unchanged-source live lane (2026-08-12)

The required entry was `705bc32b06fc96c3ce04ea8b238e2444e7229885` on
`feat/revamp`, equal to `origin/feat/revamp`; only the pre-existing protected
`AGENTS.md` and `CLAUDE.md` dirt remained. The immutable lane was
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r168` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`.

### Disposable browser preflight

Before materializing r168, a task-owned scratch campaigns root outside the
repository and evidence roots was used. A task-owned backend on 4540 and
frontend on 4541 were started with the frontend API target explicitly set to
`http://127.0.0.1:4540`. The backend health endpoint and frontend HTTP page
both returned successfully. The supported browser control opened the direct
HTTP page, read its rendered no-campaign DOM, reloaded the same page, and read
the DOM again without an internal error URL or product write. The preflight
tab, processes, ports, helpers, and scratch root were then removed before
Phase B.

### Materialization, prepare, and setup

Materialization ran exactly once and returned the isolated campaigns root
`output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r168/campaigns`.
The sole `--live-phase prepare` ran with that exact `GSD_CAMPAIGNS_ROOT`
before runtime, HTTP, browser, or database inspection. The canonical hashes
matched: state
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
Brina card
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
The canonical journey performed one Brina import, one Save/Continue, the
`lower-wards / Local / Already here / Looking for work` selections, and one
Begin. The Opening reached ready with a proper scene.

### Rendered and authoritative journey

Actions 1 through 19 each used one reconciled rendered enabled choice and
settled exactly once with one completed player-action turn, one Narrator
operation, one proper-scene binding, and matching commands/receipts. No
duplicate scene binding or late write was observed. Checkpoint 10 was
completed/bound `10/10`, with `worldVersion=22`, `runtimeRevision=190`,
11 turns/results, 10 proper scenes/operations, 39 commands/receipts,
`integrity_check=ok`, and `foreign_key_check=[]`.

Action 20 reached the first terminal built-in recovery boundary. The active
turn was
`turn-player-action:e9b5b6e81f5e6f5ee6d738897f51b1473c65401d`, job
`actor-job:0000:2f781b22f10ddf83876003f0`, stage
`actor-replan-stage:a7a2ce5e3284aee011c5e2bd5a7380ca`, with attempt 1
`actor-replan-attempt:610c389e6809aacc510707c008bbe848` and attempt 2
`actor-replan-attempt:40ae808c6daf2b6a5e48232343e2e89d`.

Attempt 1 was a retained `model_contract_invalid` interruption and opened its
existing shared-deadline recovery. Attempt 2 preserved the same job/stage/
turn/frame/frozen-world/provider/model identity and the shared deadline
`1786527155617`, then ended as `stage_timeout`/`transport_error` at the local
deadline. The turn persisted `interrupted` with `retryEligible=true`; it has
no result, Narrator operation, proper scene, attempt 3, or late write. The
read-only database boundary had `worldVersion=33`, `runtimeRevision=456`,
19 completed player-action results, 19 proper scenes, 19 Narrator operations,
27 Narrator attempts, 68 commands, 68 receipts, 25 Actor jobs, and 16 Actor
plans. Duplicate scene groups were empty; integrity was `ok` and the foreign
key check was empty. The rendered same-page state showed the stopped-turn
surface with Resume visible and all action controls disabled; no Resume or
later click was made.

This is a genuine terminal model-stage boundary after the existing recovery
was exhausted, so the lane is frozen as `Needs attention`. It is not evidence
of a provider cause and does not authorize a repair. Task 213's direct live
coverage remains unavailable: no first Actor Replanner attempt with persisted
`stage_timeout` occurred, and the observed timeout was attempt 2 after a
different first-attempt error. Checkpoints 20/30/40/50/60, 60/60 bindings,
and same-page reload are unavailable; no inference is made.

Cleanup closed the r168 page, stopped the task-owned backend/frontend trees,
verified ports 4540-4542 were free, and preserved the generated session/world
evidence roots. The task-owned temporary helpers, run-config, database copies,
and scratch artifacts were removed. No production source, test, or frozen
lane changed.

### Acceptance handoff

The disposable browser preflight, isolated materialization/prepare ordering,
canonical hashes, one-time setup, ready Opening, actions 1-19, checkpoint 10,
clean persistence, and no-duplicate/no-late-write evidence are direct live
observations. The first terminal action-20 Actor Replanner boundary is direct
authoritative evidence with exact bounded identities, two attempts, shared
deadline, and no downstream write. Natural Task 213 first-attempt timeout
recovery, checkpoints 20/30/40/50/60, 60 unique bindings, and same-page reload
remain unavailable because the lane froze at that boundary.

The note-only `git diff --check` passed, and staged GitNexus
`detect_changes --scope staged --repo WorldForge` reported no source changes.
