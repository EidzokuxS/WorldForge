# Task 191: Game Master contact target response

## Contract and entry

An actor-targeted Campaign Play contact must produce a dialogue or interaction
`record_world_event` by every targeted nonplayer actor before the first
actorless discovery or scene event. A targetless contact remains unchanged.
The existing compiler rejection and bounded automatic recovery are preserved;
the new safe feedback contains only the ordered target handles and the first
actorless effect index. No rejected proposal, reviewer reason, names, prose, or
provider data is exposed or persisted.

Entry repository: `R:\Projects\WorldForge`, branch `feat/revamp`,
`HEAD`/`origin` `c9d8ade2f4b2f0a56f0177b5ffe73d9eacf01828`. The pre-existing
unstaged `AGENTS.md` and `CLAUDE.md` changes were preserved byte-for-byte.
Frozen r138 remains immutable.

## Impact and approved exception

The registered GitNexus index was stale and did not resolve the nested Game
Master symbols. Main's exact-entry shadow analysis found `compile` MEDIUM,
`CampaignPlayGameMasterRecoveryFeedback` LOW, and
`createCampaignPlayGameMaster` HIGH: 18 impacted symbols, three direct
callers, and the Campaign Play `drive`, `recoverNarration`, and `admitTurn`
processes with Campaign Play direct and Engine transitive modules. Main
explicitly authorized this disclosed HIGH target and only this Task 191
Campaign Play flow. No other HIGH/CRITICAL target, exported factory signature,
process/module, downstream visibility/Narrator workaround, or unrelated
surface was edited.

## Implementation

`CampaignPlayGameMasterRecoveryCheck` now has the bounded
`targeted_actor_response_missing` contact variant. The compiler applies the
existing response-before-actorless invariant to normalized `contact` in
addition to `attempt`; on a contact violation it throws the unchanged
`model_contract_failed` error and attaches exactly:

```json
{"diagnostic":"game_master_semantic_validation_mismatch","failedChecks":[{"check":"targeted_actor_response_missing","intentKind":"contact","requiredActorHandles":["guard"],"firstActorlessEffectIndex":0}]}
```

The code-owned `REQUIRED_ACTOR_RESPONSES` prompt list includes targeted contact
actors in stable ruling order. The exact recovery sentence approved by Main is
present only for this safe check; normal prompts and unrelated recovery blocks
remain unchanged:

```text
For targeted_actor_response_missing, include one dialogue or interaction record_world_event for every handle in requiredActorHandles, copy that same handle into performingActorHandle, and put all required responses before the first actorless discovery or scene event.
```

No prompt, provider/model/mode, deadline, retry count, Judge, Actor, Narrator,
mechanics, persistence, schema, UI, or player-visible copy behavior changed.

## Static evidence

- Game Master suite: 56/56 assertions passed.
- Turn-runtime suite: 72/72 assertions passed. Vitest reported one known
  post-run `onTaskUpdate` worker shutdown error after all assertions passed.
  The two actor-settlement fixtures were changed to targetless contact so the
  new contact invariant does not alter tests whose subject is actor receipt
  recovery.
- Campaign Play application suite: 15/15 passed.
- Backend typecheck (`tsc --noEmit`): passed.
- Backend build (`tsc -p tsconfig.json`): passed.
- `git diff --check`: passed.
- Current staged GitNexus `detect_changes` completed with exit 0 but reported
  the stale-index broad `critical` classification (`4 files`, `2 symbols`,
  `878` affected processes), mapping the owned changes to
  `CampaignPlayGameMasterRecoveryFeedback` and `plan` and listing unrelated
  transitive flow names. The nested factory is not resolved by the registered
  index. Main's explicit exception controls this known misresolution: source
  review shows only the authorized Game Master contact flow changed; no new
  production owner, exported signature, or process/module was added.

## r139 rendered evidence

The fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r139` is run
after the implementation commit on task-owned ports 4250/4251/4252 using one
canonical materialization. Required hashes are state
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and
Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Setup completed through the rendered Character page with exactly one canonical
card import/file assignment and one successful parse response (HTTP 200), one
Continue/save, the exact `lower-wards` / `Local` / `Already here` /
`Looking for work` selections, and one Begin. The setup probe retained card
SHA-256 `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`,
state SHA-256 `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`,
and config SHA-256
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`.
Opening reached a ready proper scene. Actions 1 through 15 each settled one
completed turn with one unique proper-scene binding and enabled controls. The
only retained checkpoint, action 10, recorded completed/bound `10/10`,
`worldVersion=22`, `runtimeRevision=193`, `currentLocation=alderman-hallway`,
`attemptCount=2`, `operationCount=1`, `integrity_check=ok`, and an empty
`foreign_key_check`.

Action 16 selected the rendered `Go to Dim Ward Market` choice once. Its
authoritative turn was
`turn-player-action:ac5cf9fb71b3704d5998ea054db88f3cd53981de`, and the Game
Master stage was
`e302da83b6bb2b735fa0848e6cd9ae556a517482f467c6b733bc1d4f41e1cc3f` with one
attempt. The turn became `interrupted` at `admitted` with
`errorCode=rulebook_denied`, `resumeEligible=1`, expected/base
`worldVersion=27`, expected/base `runtimeRevision=280`, and no final world
version. The retained model-stage row reports provider/model
`zai-coding-plan` / `glm-5-turbo`, strategy `strict_object`, input/output
tokens `10323/533`, duration `9928ms`, finish reason `stop`,
`schemaOutcome=invalid`, and no artifact JSON. No Judge/Actor/Narrator
settlement, receipt, proper scene, or binding exists for action 16; no later
player action was submitted. The rendered page exposed the existing terminal
message `The turn stopped before it finished.` with Resume, which was not
pressed. This is the first genuine product/model-stage boundary for r139;
the retained evidence does not include the provider response, candidate,
reviewer reason, or other raw failure prose, so their cause remains unknown.

r139 did not naturally exercise actor-targeted contact or the new
`targeted_actor_response_missing` recovery. The lane therefore provides no
live acceptance claim for that path. It also did not reach the 60-action
checkpoint series or same-page reload because the hard-stop boundary was
action 16. The generated session/run evidence remains uncommitted. Primary
evidence hashes after cleanup are:

- `r139-terminal.json`: SHA-256
  `861c56807066e082d98abd7a664a2859a0dbdb7054acfbebd302367cea0ee788`
- `actions/action-016-evidence.json`: SHA-256
  `8454a2225b02525ac10f8e865ff61376a97d3a920994b17f9f54afb543fa722b`
- `probes/setup-summary.json`: SHA-256
  `4c2803f5bcc2a0bc907ff99d3ec35e2e13ce9dd1ff592ce4d1aa22f329bf833b`
- `backend.stdout.log`: SHA-256
  `23a613bea2c9d435a9bb032abfa583c5c2e89e8ce9546671ac0dd67c849b0011`
- r139 `state.db`: SHA-256
  `c3ff3c944bc724ac75eb731512c48cc67d22020b5ab8b9629c469909305d46b6`

The final read-only SQLite check returned `integrity_check=ok` and an empty
`foreign_key_check`; authoritative counts were 17 turns, 48 commands, 48
receipts, 15 proper scenes, 31 model stages, 15 Narrator operations, 18
Narrator attempts, 9 actor jobs, 8 Actor Replanner attempts, and 16 turn
results. These counts include the frozen interrupted action and show no late
settlement for it.

## Cleanup

Owned roots were backend PID `70968`, frontend root PID `56540` with Next child
`7372` and conhost `25348`, and browser root PID `71564` with Chrome
descendants `45996`, `60128`, `67036`, `70264`, `76964`, `77192`; backend
helpers were conhost `76040` and esbuild `77328`. The task-owned CDP page
`E165BF60F01610FF7D853F036774BC1F` was closed before process shutdown. Every
recorded PID was independently absent afterward; listeners on 4250/4251/4252
were absent; the CDP endpoint and page were absent. Only the validated r139
browser profile under the r139 session root and the task-owned GitNexus shadow
`C:\Users\robra\AppData\Local\Temp\wf-task191-shadow-20260809-1933` were
removed. The r139 session/run evidence and protected files were preserved.

## Acceptance handoff

- Contact target authority: source compiler and focused compile tests prove
  missing or delayed target responses reject with the exact safe coordinate;
  response-before-actorless ordering and affected actor read scope are tested.
- Prompt/recovery privacy: the code-owned target list and exact approved
  recovery sentence are covered; feedback contains handles/index only and no
  rejected prose.
- Existing behavior: attempt invariant, targetless contact, introduced support,
  unrelated mechanics, one automatic recovery, identity, fencing, and no
  duplicate settlement remain covered by the affected suites.
- Built product: r139 setup and Opening passed, and actions 1-15 each have one
  unique binding. Action 16 is the first genuine `rulebook_denied` boundary,
  with no later action, no duplicate settlement, and no live contact-recovery
  evidence. The exact retained stage/turn evidence is above.
- Persistence/reload: checkpoint 10 and the final read-only SQLite checks are
  clean with `integrity_check=ok` and empty foreign keys; the 60/60 boundary
  and same-page reload were not reached because of the action-16 hard stop.

## Unknowns

The provider response/candidate and Reviewer reason behind action-16
`rulebook_denied` are not retained, so their cause is unknown. The natural
`targeted_actor_response_missing` contact recovery remains unobserved, as do
the 60-action and reload criteria; no causal claim is made from their absence.
