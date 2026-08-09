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

Rendered outcome, authoritative stage/operation/receipt/binding evidence,
checkpoint counts, SQLite integrity/FK, natural contact recovery coverage,
cleanup, and the final hard-stop or 60-action/reload boundary are appended
after the lane. Generated session/run evidence remains uncommitted.

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
- Built product: pending r139 evidence will distinguish a settled contact
  recovery from the first genuine defect; static evidence is not a substitute.
- Persistence/reload: pending r139; require read-only integrity/FK and no
  duplicate writes, and require same-page reload only after 60/60.

## Unknowns

The natural r139 provider path, contact recovery occurrence, endurance count,
and reload result are unknown until the one authorized lane runs. The provider
cause of any future failure remains unknown unless retained coordinates prove
otherwise.
