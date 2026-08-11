# Task 211: Game Master stage-timeout recovery auto mode

## Contract and boundary

When the first automatic Campaign Play Game Master attempt persists
`stage_timeout`, the existing single recovery attempt requests structured
output mode `auto`. The same turn, stage, model authority, deadline, recovery
eligibility, worker epoch, lease/CAS fencing, mechanics, persistence, and
attempt cap remain in force. The existing `model_contract_invalid` Game Master
recovery remains `auto`; provider-unavailable and other no-feedback branches
remain `tool`. Judge mode selection and every other Game Master behavior are
unchanged. No prompt, schema, provider, model, deadline, retry, UI, copy, or
player-visible behavior changes.

Frozen r162 is immutable. Its Game Master attempt 1 reached the local
45-second boundary and persisted `stage_timeout`; attempt 2 used `tool` and
ended `model_contract_invalid` before artifact acceptance, with no downstream
artifact, command, receipt, Narrator operation, proper scene, mechanics
settlement, or late write. This task changes only the private mode selector
needed to make that timeout recovery request `auto`.

## Impact and implementation

The exact-current GitNexus index was refreshed with the `--index-only` path at
the required entry. Upstream impact for the edited private
`structuredOutputModeForExternalAttempt` selector is LOW: 2 direct callers,
2 Campaign Play processes, and 1 module. The callers are the nested Judge and
Game Master external-attempt execution paths in `turn-runtime.ts`.

The enclosing `createCampaignPlayTurnRuntime` has the established HIGH
transitive mapping: 2 direct callers, 3 Campaign Play/Engine processes, and 2
modules. Main authorized that enclosing mapping only for this private
conditional. No additional production owner, exported interface, model
selector, prompt, schema, deadline, or execution flow was edited.

The selector now returns `auto` for a Game Master attempt 2 when the previous
persisted error code is either `model_contract_invalid` or `stage_timeout`;
all other existing Game Master branches still return `tool`. Attempt 1 and the
Judge branch are unchanged.

No prompt or player-facing prose changed, so humanizer/deslop review is not
applicable.

## Static evidence

Focused turn-runtime coverage includes:

- certified Game Master `stage_timeout` recovery requests `auto` on both
  attempts, keeps the bypass model, and settles once without replay;
- player-action Game Master `stage_timeout` recovery requests `auto` on both
  attempts and preserves the single Judge/command ledger;
- Game Master `model_contract_invalid` recovery remains `auto` while retaining
  its reasoning-model selection;
- Game Master provider-unavailable recovery remains `tool`, uses the normal
  language model on both attempts, and a second failure stays interrupted with
  no command or third attempt;
- existing Judge no-feedback branches, Judge safe-feedback recovery,
  Game Master feedback forwarding, fencing, late-result, and no-replay tests
  remain covered.

The full turn-runtime suite completed 78/78 assertions; Vitest then returned
the known post-pass `onTaskUpdate` worker-shutdown error, with no assertion
failure. A clean single-fork rerun of the affected mode branches passed 6/6.
The Campaign Play application suite passed 15/15 and the Game Master suite
passed 69/69. Backend typecheck, production build, and `git diff --check`
passed. Staged GitNexus `detect_changes` is run before the implementation
commit and reports 3 staged files, 4 mapped symbols
(`structuredOutputModeForExternalAttempt`, its enclosing
`createCampaignPlayTurnRuntime`, `releaseActorBoundary`, and the focused test
helper `onGameMasterRecoveryFeedback`), 0 affected processes, and LOW risk.
The only production behavior hunk is the private selector conditional; the
other mappings are line-context/test mappings and no additional production
owner is changed.

## Live r163 evidence

The fresh lane
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r163` is run only after the
implementation and initial note are pushed. It uses campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`, the isolated materializer campaigns
root, the sole pre-runtime `--live-phase prepare`, and ports 4490/4491/4492.
Canonical state/config/Brina hashes are verified before runtime. Setup is one
import, one Save/Continue, the fixed four selections, and one Begin. Each
rendered action is read-authority reconciled and submitted once, with one
proper-scene binding per settled action and read-only checkpoint evidence at
10/20/30/40/50/60. Natural Game Master timeout recovery, if present, is
reported with requested/actual mode, identity, model, deadline, feedback,
settlement, and no-attempt-3/no-late-write evidence. Generated lane evidence
remains uncommitted.

## Live r163 boundary

The fresh lane was materialized exactly once after the pushed implementation.
The materializer-returned isolated campaigns root was exported as
`GSD_CAMPAIGNS_ROOT`; the one `--live-phase prepare` ran before runtime,
HTTP, browser, or database inspection and succeeded. The pre-runtime hashes
matched the canonical contract: state
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
Brina card
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
Runtime used only task-owned ports 4490/4491/4492. Setup completed once
(one Brina import, one Save/Continue, lower-wards, Local, Already here,
Looking for work, and one Begin), and Opening reached ready with a proper
scene. The prepared manifest hash is
`67EFB2409BE28AC70C701ED602923C0F5F5F8667BF472C001184C62C0F4F1237`; the
prepared run-config hash is
`42678451A74FC6709E34A4F1A74E5338499D9FAF96D317942964F4C2968EC3C9`.

Actions 1 through 21 each settled once with one unique proper-scene binding.
The action-10 checkpoint recorded completed/bound 10/10, worldVersion 21,
runtimeRevision 219, commands/receipts 37/37, narration operations/attempts
10/13, integrity `ok`, and an empty foreign-key check. The action-20
checkpoint recorded 20/20, worldVersion 31, runtimeRevision 428,
commands/receipts 63/63, narration operations/attempts 20/23, integrity
`ok`, and an empty foreign-key check. Action 21 also naturally exercised the
existing Game Master `model_contract_invalid` recovery: one stage identity,
attempt 1 interrupted and attempt 2 accepted, both with the existing strict
object strategy; this is not the new timeout branch.

Action 22 is the first genuine terminal product defect, so no later action
was submitted. Its player-action turn
`turn-player-action:4c00d9cc125ea3db21d946a16af7c091f32e2bf0` completed at
worldVersion 33/runtimeRevision 471 with worker epoch 5 and terminal reason
`action_resolved`; its two commands and two receipts were committed once.
The Game Master stage
`226f79a1f94dd776bed5785fdb0149f7bd454e6f46a80e768a229a1456e679d7` was
accepted on attempt 1, so no Game Master stage-timeout recovery occurred.
The downstream Narrator operation
`narration-operation:bccc4f17e3af84808ff814c61f88725d132640f4` ended
`failed` with `narration_invalid` at current attempt 2; attempts
`narration-attempt:8e3ba8cdeb25923ea2e4e42d23a771ec2b70d8a2` and
`narration-attempt:a2cea2ead623a2de9a93805cac10b431be0cc1cb` both failed
with the same bounded schema outcome and no accepted proper scene. The
authoritative terminal counts were 23 turns/results, 22 narration
operations, 26 narration attempts, 21 proper scenes, and 68 commands/receipts;
read-only SQLite reported integrity `ok` and an empty foreign-key check.
There was no attempt 3, late write, duplicate mechanics settlement, or later
click. The direct Task 211 timeout-recovery path is unavailable live because
no Game Master attempt 1 persisted `stage_timeout`; the 60-action and
same-page reload criteria are unavailable after this first defect.

The terminal database hash is
`468458E5B833D21AF5CFFF8B39AC1E9A5D9E9BD80934634726EE4C43907E27D8`, and
the final campaign config hash remains
`D8362B1AF976C00CB8F14C564C8196A2D1AB137743FF368EA83D762A4AD2E065`.
The bounded live log hash is
`ACDD9DA3EDA0120F862CFDF90C8688CA036F6AB934C1B08E19F868FC1B4759F0`.
Only task-owned r163 processes, listeners, browser profile, and temporary
helpers/run-config were removed; the r163 session/world evidence roots and
protected unrelated files remain preserved.

## Acceptance handoff

- Selector behavior and neighboring Judge/Game Master branches: focused
  turn-runtime assertions above plus the unchanged existing suites.
- Identity, deadline, lease/CAS, one-recovery, no-replay, and terminal attempt
  behavior: focused runtime tests and authoritative r163 evidence when the
  corresponding path occurs naturally.
- Built setup, Opening, action-10/action-20 checkpoint persistence, and
  terminal integrity/FK are directly evidenced above. The natural Task 211
  live recovery, action 30/40/50/60 checkpoints, 60 unique bindings, and
  same-page reload are unavailable because action 22 was the first genuine
  terminal defect; no static evidence is substituted for those criteria.
