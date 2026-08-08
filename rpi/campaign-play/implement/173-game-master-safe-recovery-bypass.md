# Task 173: Game Master safe-recovery model routing

## Contract and fixed decision

Campaign Play Game Master attempt 2 keeps the existing bounded recovery, prompt,
compiler, authority, deadline, identity, persistence, and two-attempt fences. When
the existing safe `gameMasterRecoveryFeedback` is present for attempt 2, the
configured route `languageModel` is used again. Opaque `model_contract_invalid`
recovery without safe feedback keeps the existing `reasoningModel`; transport and
stage-timeout recovery keeps the existing language-model route and `auto`/`tool`
mode selection. Certified and full-authority Game Master paths are covered. Judge,
Narrator, Actor Replanner, mechanics, provider configuration, schemas, UI, and
player-visible copy are unchanged.

The experience contract is a player using the rendered Campaign Play surface. A
repeated-actor-dialogue rejection carries the existing safe coordinates into one
automatic attempt 2, which may settle the same turn exactly once without Judge or
mechanics replay, a third attempt, duplicate binding, or late acceptance.

## Impact and scope

Entry source was `31614ecbe8a60b255fc1b8b708c945e80f592435` on `feat/revamp`, equal
to `origin/feat/revamp`. The GitNexus index was stale (indexed `3eac444`, then
reported ten commits behind current HEAD). Current CLI impact for the indexed
owner `File:backend/src/campaign-play/turn-runtime.ts` was LOW: six impacted
files, three direct imports, no indexed processes or modules. The nested
`modelForExternalAttempt` and `createCampaignPlayTurnRuntime` targets were absent
from the stale index, so the file-level owner is the narrowest authoritative route.
Source review confirms the two edited Game Master call sites are the certified
`admitted` and full-authority `judged` execution paths; no generic selector or
other role is changed. The new local helper has no pre-edit callers.

## Semantic review

No prompt, recovery prose, visible copy, or model instruction changed. Humanizer
and deslop review is therefore not applicable to product prose. The repair is an
internal model-selection distinction only: safe semantic Game Master recovery
reuses the existing configured language model, while all other routes delegate to
the established selector unchanged.

## Exact implementation

`backend/src/campaign-play/turn-runtime.ts` adds the narrowly scoped
`modelForGameMasterAttempt` helper. It returns `model.languageModel` only when
`attempt === 2` and safe Game Master recovery feedback is present; otherwise it
delegates to `modelForExternalAttempt`. Both certified and full-authority Game
Master plans call this helper and still forward feedback only on attempt 2.

`backend/src/campaign-play/turn-runtime.test.ts` asserts that certified and
full-authority repeated-dialogue recovery use `[languageModel, languageModel]`,
while the existing opaque semantic recovery remains `[languageModel,
reasoningModel]` and transport recovery remains `[languageModel, languageModel]`
with `auto` then `tool` modes. Existing identity, deadline, one-resume,
no-replay, no-third-attempt, and settlement assertions remain in force.

## Initial validation

- `npm --prefix backend test -- --run src/campaign-play/turn-runtime.test.ts`:
  72/72 tests passed.
- `npm --prefix backend test -- --run src/campaign-play/campaign-play-application.test.ts src/campaign-play/game-master.test.ts`:
  66/66 tests passed (14 application, 52 Game Master).
- `npm --prefix backend run typecheck`: passed.
- `npm --prefix backend run build`: passed.
- `git diff --check`: passed; only expected line-ending warnings.
- No rendered r123 journey has started yet. No provider call is part of static
  validation.

## Fresh-lane evidence

To be appended after the fresh `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r123`
lane reaches 60 actions plus reload or freezes at its first genuine defect. The
appendix will separate rendered, runtime/log, and read-only SQLite evidence and
will record exact cleanup and note-only commit checks.

## Unknowns

Natural occurrence of repeated-dialogue recovery in r123 is not guaranteed. If it
does not occur, live affected-recovery evidence remains unavailable; focused tests
are the direct branch proof. No provider cause is inferred from prior frozen lanes.

## Fresh r123 evidence

The implementation commit was `434e56c88eac2208dd41f4834b797d913cfa6a66`, with
local `feat/revamp` equal to `origin/feat/revamp` before the lane. The lane was
materialized once as
`pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r123` for campaign
`6b85a49e-fef5-4359-95e2-051383f6fb66`. The materialization record proves the
template `lowwater-ledger-pristine-93a09e46-20260719`, state SHA-256
`6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, and
config SHA-256
`d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`. The
canonical Brina card SHA-256 was
`4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Rendered setup used one import, one save, one lower-wards / Local / Already here
/ Looking for work configuration, and one Begin. The opening reached the active
surface. Actions 1 through 15 each produced one proper scene and one unique
turn/choice binding. Checkpoint 10 recorded 10 completed and 10 bound actions,
worldVersion 21, runtimeRevision 203, and unique turn and choice counts of 10.
Actions 1, 6, 9, and 11 settled through the existing bounded Narrator recovery
and still produced one settlement; other completed actions used one Narrator
attempt.

The first genuine defect was action 16, choice
`choice_6f4026aafb07ca2ba29b99d6`, turn
`turn-player-action:b02c0f0ac736ac4bc88522f035edb9b9af46a175`. Its certified
Game Master attempt 1 persisted `model_contract_invalid` for the configured
`zai-coding-plan` / `glm-5-turbo` route after 6,089 ms. The automatic attempt 2
then persisted `stage_timeout` after 45,148 ms with the same requested provider
and model but no actual model or strategy, and the turn became `interrupted` at
the admitted stage. There was no Judge stage, Actor job, receipt, result,
Narrator operation, proper scene, binding, attempt 3, mechanics replay, or late
write. Final read-only counts were 16 player turns, 15 unique completed/bound
actions, 47 receipts, 16 results, 16 Narrator rows, 15 operations, 19 Narrator
attempts, and 11 Actor jobs; SQLite `integrity_check` was `ok` and
`foreign_key_check` was empty. The lane therefore stopped before action 17; no
20/30/40/50/60 checkpoints or same-page reload were authorized.

The frozen lane does not persist the in-memory safe Game Master recovery payload
or the selected model object. The retained stage rows prove the requested model
for attempt 2, but because the request timed out before a candidate they do not
prove whether the safe repeated-dialogue feedback branch was present or whether
the implementation selected `languageModel` versus `reasoningModel` in the live
request. No causal claim is made from the live lane; the focused tests remain the
direct proof of that branch. The bounded timeout is nevertheless a genuine
product/runtime terminal boundary under the endurance contract.

Generated evidence is preserved under
`output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r123.session`
and
`output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r123`.
The session records the setup, action evidence, checkpoint, terminal authority,
read-only database summary, ownership registry, and cleanup verification. The
AGENTS.md and CLAUDE.md hashes captured before cleanup were
`0d75edc72cc195e385ed5b9c98c616e82fdb3c13e210d0feb94333e19a76d541` and
`c6874175503f6890af8ca2db34eff5630b8a513ede95cea3f76c43435925fca6`.

Cleanup closed the page, stopped roots 76616 (backend), 44656 (frontend), and
69604 (browser) plus descendants 16924, 30740, 39580, 50324, 51248, 55916,
57804, 65824, 74724, and 76316, removed the validated task-owned browser
profile, and independently verified all recorded PIDs absent, ports 4090/4091/4092
unbound, CDP unavailable, the page closed, and the profile absent. No generated
lane evidence was staged.

## Acceptance handoff

The bounded source change and static contracts are complete and pushed. The
positive rendered portion proves canonical setup, opening, 15 one-to-one
settlements, native JSON Narrator operation, and checkpoint progression. The
directly affected safe-recovery model-selection proof is automated but not live
because r123 ended at a Game Master timeout before a retained candidate. The
terminal and no-duplicate/persistence fences are evidenced by action 16's
authoritative rows and clean SQLite checks. The 60-action and same-page reload
criteria remain unfulfilled because the lane froze at the first genuine defect.
