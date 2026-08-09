# Task 192: Game Master record-event scope budget

## Contract

An otherwise schema-valid `record_world_event` proposal must not reach Rulebook preflight when the compiler-owned player or performer references would make its final `affectedRefs`/`readScope` exceed the unchanged limit of 16. The compiler rejects the proposal with `model_contract_failed` and carries only ordered, safe `record_world_event_scope_overflow` coordinates into the existing bounded Game Master recovery path. Valid final scopes remain unchanged.

Experience contract: a Campaign Play player submits a rendered action; the Game Master compiler is the semantic layer and the Play page is the surface. The trigger is a schema-valid record-world-event whose compiler-owned references overflow the final command scope. The observable outcome is a safe attempt-1 rejection and, when recovered, one normal settlement without truncation, Rulebook-limit changes, replay, or duplicate writes. No provider, model, mode, deadline, retry, persistence, mechanics, UI, or player-visible copy behavior is changed.

## Impact and scope review

Entry was `feat/revamp` at `516b25b2b3ae1c0e22dbba80c78b0aa13b772902`, equal to origin. The exact-entry GitNexus shadow was refreshed because the registered index was stale. Upstream impact for the edited lower-level `compile` owner was MEDIUM (16 impacted, 7 direct callers, Campaign Play `plan` process); `compileEffect` was LOW (11 impacted); `prompt` was LOW (1 impacted). The exported `createCampaignPlayGameMaster` factory was HIGH (18 impacted, 3 direct callers, `drive`/`recoverNarration`/`admitTurn` processes) and was deliberately not edited. No Rulebook, shared-limit, provider, runtime selector, persistence, frontend, or route production file is in scope.

The approved prompt literal was reviewed by Main: prompt-craft/humanizer/deslop found it precise, natural, and non-ornamental; it is retained exactly.

## Exact implementation

- `CampaignPlayGameMasterRecoveryCheck` has one additional discriminated variant carrying only `effectIndex`, the stable `effects[<index>].affectedHandles` path, authored count, compiler-owned append count, and the unchanged maximum.
- The existing compiler appends player and non-null performer references exactly as before, counts the resulting final scope, and records ordered safe checks before Rulebook preflight. It never truncates or silently drops handles.
- The exact recovery sentence is emitted only when this check is present; normal and unrelated recovery prompts retain their existing shape.

## Static evidence

- Game Master focused suite: 62/62 passed.
- Campaign Play application suite: 15/15 passed.
- Turn-runtime suite: 72/72 assertions passed. Vitest exited non-zero only after those assertions because of the known worker-shutdown `Timeout calling "onTaskUpdate"`; a narrow rerun reproduced the same harness defect without an assertion failure.
- Backend typecheck and backend build passed. Root `npm run typecheck` remains non-green only for the pre-existing unrelated frontend lint at `frontend/app/(non-game)/campaign/[id]/forge/page.tsx:105:5` (`react-hooks/set-state-in-effect`); no Task 192 file is implicated.
- `git diff --check` passed. Staged GitNexus `detect_changes` reported only the owned Game Master source/test/note scope. The exact-entry impact review was MEDIUM for `compile` (16 impacted, 7 direct callers, Campaign Play plan flow), LOW for `compileEffect` (11) and the prompt owner (1); the HIGH exported factory (18 impacted, 3 direct callers) was deliberately not edited.
- Implementation commit: `36ee272833c66e90a214df8be1b47d54051514d5`, pushed with local `HEAD=origin/feat/revamp` before the live lane.

## Live r140 evidence

- Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r140`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, used one materialization, one canonical card import/file assignment (HTTP 200), one Save/Continue, the exact lower-wards / Local / Already here / Looking for work selections, and one Begin (Opening response 202). The required state/config/card hashes were verified as `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.
- Actions 1-36 each settled with one unique proper-scene binding. Checkpoints: action 10 was 10/10, worldVersion 22, runtimeRevision 224; action 20 was 20/20, worldVersion 32, runtimeRevision 433; action 30 was 30/30, worldVersion 44, runtimeRevision 643. Each checkpoint had `integrity_check=ok` and an empty `foreign_key_check`.
- The first genuine defect was action 37, choice `choice_0d9b595fbb42d0e4be378c70` (`Talk to Dren Vask: accept the answer and leave`), turn `turn-player-action:cdc47172c88e4e7ab25d1f843a0952518be65817`. Judge attempt 1 accepted. Game Master attempt 1 timed out at 45,183 ms; its existing automatic attempt 2 then accepted with the configured safe route. Mechanics settled exactly once with two applied commands and two receipts, advancing worldVersion 51 to 52. Narrator operation `narration-operation:bb0d9fbe6519f830cce15d9ac8ee18ae36d69509`, result `result:f1f6b07b7f21f1892aac3d84b0585b0ae4c1f67d`, and attempt `narration-attempt:843b5fa0f250d69ca982950775520be16f2f208a` had one attempt, failed `stage_timeout` after 89,798 ms against the existing 90,000 ms deadline, and produced no proper scene or binding. The lane froze without another click, retry, or replay.
- At freeze, authoritative SQLite counts were 37 player turns, 36 proper scenes, 107 commands, 107 receipts, and 37 narration operations; `integrity_check` was `ok` and `foreign_key_check` was empty. The final persisted narration operation remained failed/pending with no completed scene. No `record_world_event_scope_overflow` recovery occurred naturally, so live coverage of this Task 192 branch is unavailable; raw provider/proposal bytes and the upstream timeout cause remain unknown. Actions 40/50/60 and same-page reload were correctly omitted after the hard stop.
- Relied-on evidence hashes after cleanup: `backend.stdout.log` `867AB02C2960EA733F13BE8FF5BA65DA67DA8C445422547CA2B1039BD94BC6AF`, `state.db` `B07567C492B5092DEAFB95AD7C60230AE5B4FE87E4FCA4CDCB874B017E5D52F9`, and `r140-terminal.json` `EAFD50CB9D73421A0E1A9F72762663E1A6EEA67230B974381E840188C33401B5`.

## Cleanup

Task-owned backend PID 84844, frontend PID 81588 and child 13764, Chrome/CDP PID 84064, ports 4260/4261/4262, the r140 browser profile, and the temporary shadow index were independently verified absent. The session/run evidence roots were preserved; only the validated task-owned browser profile was removed. No protected or unrelated file was staged.

## Acceptance handoff and unknowns

The static contract is covered by the Game Master tests, application/runtime checks, typecheck/build, diff check, and impact/detect review above: final-scope counting is pre-Rulebook, ordered safe feedback is private, 16 remains authoritative, and the existing bounded recovery/fencing path is unchanged. The built journey proves canonical setup/opening and 36 unique settled bindings, plus exactly-once Game Master/mechanics state for action 37, but it does not prove natural scope-overflow recovery, 60/60, or reload because the first genuine Narrator stage-timeout defect froze r140. Raw Narrator provider/proposal bytes and the upstream cause are unavailable. Main's next decision is the exact frozen action-37 Narrator `stage_timeout` diagnosis before another endurance lane; do not infer a Task 192 scope-recovery result from this run.
