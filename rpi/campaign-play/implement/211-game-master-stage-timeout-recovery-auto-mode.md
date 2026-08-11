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

## Acceptance handoff

- Selector behavior and neighboring Judge/Game Master branches: focused
  turn-runtime assertions above plus the unchanged existing suites.
- Identity, deadline, lease/CAS, one-recovery, no-replay, and terminal attempt
  behavior: focused runtime tests and authoritative r163 evidence when the
  corresponding path occurs naturally.
- Built setup, Opening, checkpoints, persistence integrity/FK, 60 unique
  bindings, same-page reload, and natural Task 211 live recovery: unavailable
  until r163 reaches its terminal boundary; no live claim is inferred from
  static tests.
