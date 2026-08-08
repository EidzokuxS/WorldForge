# Task 168: Narrator actor-observation mismatch recovery

## Contract

When a Campaign Play Narrator proposal names a visible actor whose name is not
owned by the beat's `observationIndexes`, the proposal remains rejected as
`narration_invalid`. The existing automatic attempt-2 recovery receives only
the safe mismatch coordinates already emitted by the guard. The same immutable
packet, operation, result, narration, receipt, and shared automatic deadline
are reused; mechanics do not replay and no attempt 3 is introduced.

The safe check is exactly `visible_actor_observation_mismatch` and contains
`beatIndex`, `fieldPath`, `observationIndexes`, `matchedActor` (`canonicalId`,
`canonicalName`, `matchedAlias`), `allowedActors` (`canonicalId`,
`canonicalName`), and `sourceObservationPerformers` (`observationIndex`,
`canonicalId`, `canonicalName`). Rejected beat text, raw proposals/provider
responses, source-observation prose, secrets, and hidden state are excluded.
No schema, migration, persistence field, provider/model setting, prompt prose,
retry policy, deadline, mechanics, UI, or player-visible copy changes.

## Impact and semantic review

The refreshed GitNexus index is current at entry commit
`3eac444a655bd0685eaf790e065554b522463f69`; the index was refreshed with the
project runner's instruction-file-safe `--index-only --skip-agents-md
--skip-skills` mode. The nested `CampaignPlayNarratorPacketValidationFailure`
type and `assertProposalForPacket` function are not indexed as standalone
symbols. The exact file-level route for
`File:backend/src/campaign-play/narrator.ts` is MEDIUM (`impactedCount=18`,
`directCount=8`, depth 1 = 8, depth 2 = 8, depth 3 = 2, no affected
processes/modules). `CampaignPlayNarratorError` itself reports CRITICAL when
targeted, but that class was not edited; its high shared blast radius is
therefore not a target result for this bounded change. No other production
file was required.

No prose rewrite is needed. The current prompt already states the ownership
rule explicitly.

The change adds code-owned structured safe-check data only. No player-visible
copy or prompt instruction prose changes.

Humanizer/deslop verdict: retain the exact diagnostic literals and field
names; there is no natural-language text to rewrite.

## Implementation

`CampaignPlayNarratorPacketValidationFailure` now includes the one structured
`visible_actor_observation_mismatch` variant. The existing guard builds the
coordinates once, keeps the `narrator_visible_actor_observation_mismatch`
warning name and payload stable, and carries the same coordinates in
`CampaignPlayNarratorError("narration_invalid", null, { recoveryFeedback })`.
The existing NARRATOR_RECOVERY block, runtime forwarding, immutable operation,
stage-local deadline, and automatic attempt-2 path are unchanged.

Focused tests cover the stable warning and exact recovery feedback for the
r45-shaped split and false-attribution guards, sentinel/prose exclusion, the
canonical recovery prompt, and one receipt-keyed runtime recovery with the
same identities, one mechanics settlement, one proper scene, and no attempt 3.

## Automated evidence before the rendered lane

- `npx vitest run src/campaign-play/narrator.test.ts --pool=forks
  --maxWorkers=1 --minWorkers=1`: 29/29 passed.
- Focused turn-runtime recovery/terminal tests with the same command shape:
  3/3 passed (67 skipped in the 70-test file); the selected tests cover
  automatic actor-mismatch recovery, second-invalid terminal behavior, and
  attempt-2 timeout/no further recovery.
- `npx vitest run src/campaign-play/campaign-play-application.test.ts
  --pool=forks --maxWorkers=1 --minWorkers=1`: 13/13 passed.
- `npx vitest run src/campaign-play/campaign-play-database.test.ts
  --pool=forks --maxWorkers=1 --minWorkers=1`: 18/18 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `git diff --check`: passed; only the pre-existing AGENTS.md and CLAUDE.md
  changes remain outside the Task 168 scope.

## Rendered lane

The bounded code commit was `a45499a1daa67ff22a31a2786f6beaddec0071a4`
(`fix(campaign-play): forward actor mismatch recovery`), pushed to
`origin/feat/revamp` before the lane. The fresh lane was
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r117` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`. It materialized the exact
`lowwater-ledger-pristine-93a09e46-20260719` template with state SHA-256
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config
SHA-256 `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`,
and canonical Brina card SHA-256
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

The task-owned runtime used API/UI/CDP ports `4040/4041/4042`, roots
`21408/65228/66744` (backend/frontend/browser), one page at the canonical
Character URL, and one task-owned browser profile. The marker preflight was a
harness-only repair after the copied setup helper detected its unset page
marker; it performed no product action. The actual setup then clicked Import
card once and set the canonical card file once. It did not reach Save or
Begin. The rendered card parse ended with the visible
`Campaign Play request failed with service_unavailable.` alert after the
ingestion provider call locally aborted at its 90,023 ms timeout. Backend logs
recorded only the bounded `ai.zai_fetch.failure` request metadata (no provider
response bytes or coordinate) and the truthful `llm.attempt` timeout; no raw
card/prose/provider body was retained.

Read-only reconciliation in `probes/setup-failure-reconciled.json` proves the
first genuine lane boundary: `setup_phase=character_required`, zero player
characters, zero commands, zero turns, and only the initial
`play_state_created` runtime event. SQLite `PRAGMA integrity_check` was `ok`
and `PRAGMA foreign_key_check` was `[]`. No player action, Narrator operation,
attempt, scene, binding, checkpoint, actor-mismatch recovery, or reload was
admitted; the lane froze without a replacement import or later action.

Cleanup is recorded in `ownership-registry.json`, `cleanup-stop.json`,
`cleanup-profile.json`, and `cleanup-verified.json`: all listed roots and
descendants were stopped, the task-owned page was closed, the task-owned
profile was removed, and ports `4040`, `4041`, and `4042` had no listeners.
No 60/60 or reload claim is made. The setup provider timeout coordinate is a
material unknown because the retained safe diagnostic intentionally omits raw
provider response content.

## Acceptance handoff

Entry state was the current Task 167 source at
`3eac444a655bd0685eaf790e065554b522463f69`, with frozen r116 preserved and
only the pre-existing AGENTS.md/CLAUDE.md worktree edits unstaged. The source
and focused tests positively map the mismatch rejection, safe feedback,
prompt forwarding, identity/deadline reuse, single settlement, no mechanics
replay, no attempt 3, and privacy criteria. The r117 rendered handoff maps
the fresh-template/card/setup contract, the exact one-import admission, the
first setup-stage timeout boundary, SQLite integrity/FK evidence, and exact
cleanup. The positive scene/binding, natural actor-mismatch recovery,
checkpoint, 60/60, and same-page reload criteria are omitted because the
first genuine defect occurred before Save/Begin.

## r118 transient-setup falsification and journey boundary

The accepted Task 168 source at entry was `66421e4c77f204c79fc6c21ac87c0d618beb9857`
on `feat/revamp`, equal to `origin/feat/revamp`. The pre-existing unstaged
`AGENTS.md` and `CLAUDE.md` changes were preserved byte-for-byte. Frozen r117
was not resumed, retried, or mutated.

The fresh run was
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r118` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`. It materialized once from
`lowwater-ledger-pristine-93a09e46-20260719` with template state SHA-256
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config
SHA-256 `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`,
and canonical Brina card SHA-256
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
The materialized config retained the expected hash; the materialized state
ended at `fe8cbf28251398d440e7bb25dc906cf38d3cc8e3bfcdbcded0fe75ef20153aa9`
after the recorded play mutations. The r117 setup-ingestion timeout did not
recur: Import card was clicked once, the file was selected once, and the
draft rendered with Brina Hael. Continue/Save/Begin were each clicked once;
Save and opening POST each completed successfully. The canonical setup was
lower-wards / Local / Already here / Looking for work, and the opening reached
a proper scene before action 1. No second import or replacement setup action
was issued.

The task-owned runtime used API/UI/CDP ports `4050/4051/4052` and roots
backend PID `55868`, frontend PID `31332`, and browser PID `72928` (with the
recorded descendants in `ownership-registry.json`). Actions 1 through 10
each completed with one unique durable binding and one proper scene; Narrator
attempt 2 occurred naturally on actions 1 and 8 and settled those same
operations. The Task 168 visible-actor mismatch did not occur naturally, so
no recovery-coordinate or `NARRATOR_RECOVERY` live claim is made.

Action 11 was the first genuine product/model boundary and no later player
action was submitted. Its authoritative turn was
`turn-player-action:5a7a102c64a2944e5c908a5c518fff8889c2c598`, ending
`interrupted` with `error_code=stage_timeout` and worker epoch 2. Game Master
attempt 1 ended `model_contract_invalid` after a stopped response; its
automatic attempt 2 ended `stage_timeout` after the shared deadline. No
Narrator operation or attempt, proper scene, receipt, actor job, or action-11
binding was created. The rejected Game Master contract coordinate and provider
response body were not retained, so their cause remains unknown. This is a
new frozen boundary, not evidence to alter provider/model/settings or to
repair the product in this lane.

The terminal read-only reconciliation at
`output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r118.session/probes/r118-terminal-reconciled.json`
and `r118-terminal.json` records 11 player turns, 10 completed bindings,
10 proper scenes, 10 Narrator operations, 12 Narrator attempts, one
checkpoint (10), one character, and 37 commands. SQLite `integrity_check`
was `ok` and `foreign_key_check` was empty. The reconciled rendered Play
surface had body SHA-256
`0b8aebc74a23e05f6a23950d36b006711c8d82b1d7538c084df06fda25adb943` and
9 buttons. Backend logs preserve the Game Master contract-invalid then
stage-timeout sequence without raw provider bytes.

Cleanup evidence in the run session (`ownership-registry.json`,
`cleanup-stop.json`, `cleanup-profile.json`, and `cleanup-verified.json`)
shows the task-owned page closed, profile removed, all recorded roots and
descendants absent, and ports `4050`, `4051`, and `4052` listener-free. The
template/config/card and protected instruction-file hashes were rechecked;
the expected template/config/card hashes and original AGENTS/CLAUDE hashes
remain intact.

### r118 acceptance mapping

- Setup ingestion: positive; the r117 timeout hypothesis was falsified for one
  fresh lane, with the exact one-import/save/begin and hash evidence above.
- Normal Campaign Play journey: positive through action 10, including two
  naturally settled Narrator attempt-2 recoveries and 10 unique proper-scene
  bindings.
- Task 168 actor-mismatch recovery: not exercised naturally; no synthetic
  provider/model failure was introduced.
- No duplicate mechanics and persistence: positive for the first 10 settled
  actions and the action-11 terminal state; counts and SQLite checks are in
  the reconciliation probe.
- Timeout/late-write fencing: action 11 remained one interrupted Game Master
  turn with no Narrator operation or late binding; no retry or replacement
  action was attempted.
- Checkpoints: checkpoint 10 recorded; later checkpoints were not reached.
- 60/60 and same-page reload: omitted because action 11 froze at the first
  genuine defect; no reload was performed.
- Cleanup: all task-owned runtime, page, profile, roots, descendants, and
  listeners were independently verified absent.

The r118 evidence is rendered/runtime/SQLite evidence only; no Task 168
product source or test file changed. Material unknowns are the rejected Game
Master contract coordinate and any provider response body for action 11, plus
the unexercised actor-mismatch recovery branch. A new fresh lane or a focused
Main decision is required before continuing the endurance objective; r118
itself remains immutable.
