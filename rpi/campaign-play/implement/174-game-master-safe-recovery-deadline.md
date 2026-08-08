# Task 174: Game Master safe-recovery deadline

## Contract

Only a newly recreated automatic Campaign Play Game Master runtime that carries the existing non-null `gameMasterRecoveryFeedback` receives a 90,000 ms operation window. Ordinary Game Master attempt 1, opaque semantic recovery without feedback, and provider/stage-timeout recovery without feedback remain at 45,000 ms. Certified and full-authority Game Master routes use the same existing `gameMasterOperationDeadlineMs` input. Judge, Actor Replanner, Narrator, Opening, mechanics, persistence, provider/model selection, mode/reasoning, prompts, schema, attempt count, and UI behavior are unchanged.

## Impact and semantic review

The current GitNexus index is 12 commits behind the entry source. The exact file-owner impact for `backend/src/campaign-play/campaign-play-application.ts` was LOW (6 impacted files, 3 direct imports, no indexed processes/modules). `CampaignPlayRuntimeFactory` was LOW with the same direct callers. `CreateCampaignPlayTurnRuntimeInput` was LOW (7 impacted files, 3 direct imports, no indexed processes/modules). The nested `createDefaultTurnRuntime` target was absent from the index; source inspection identified its single existing `createCampaignPlayTurnRuntime` construction seam. Main's accepted source-qualified risk assessment is MEDIUM for the application/runtime path; no HIGH or CRITICAL result was found.

No prompt, visible copy, or player-facing prose changed. Humanizer/deslop review is not applicable to this internal deadline selector.

## Exact delta

`campaignPlayGameMasterOperationDeadlineMs` selects 45,000 ms for an ordinary or feedback-free runtime and 90,000 ms only when safe Game Master recovery feedback is present. `createDefaultTurnRuntime` passes that value through the existing `gameMasterOperationDeadlineMs` seam; no runtime input, schema, persisted deadline, state-machine branch, or recovery policy was added.

## Automated validation

- `npm test -- --run src/campaign-play/campaign-play-application.test.ts`: 15/15 passed.
- `npm test -- --run src/campaign-play/game-master.test.ts --reporter=dot`: 52/52 passed.
- `npm test -- --run src/campaign-play/turn-runtime.test.ts --reporter=dot`: 72/72 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `git diff --check`: passed. The only pre-existing dirty files remained `AGENTS.md` and `CLAUDE.md`; neither was staged.
- GitNexus `detect_changes --scope staged` and `detect_changes --branch feat/revamp` returned `No changes detected` because the repository index is stale and predates the implementation. The exact staged paths were `backend/src/campaign-play/campaign-play-application.test.ts`, `backend/src/campaign-play/campaign-play-application.ts`, and this note.
- Implementation commit `3f0623bd68d8243ceaa09ae460b0585efa81da5e` was pushed to `origin/feat/revamp`; local and origin matched before r124. The source and test delta was limited to the existing application deadline seam and its selector assertion.

## Rendered r124 journey

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r124`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, used the exact pristine template and canonical card. The materialized template state hash was `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`; config hash was `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`; card hash was `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. Import, Save, lower-wards/Local/Already here/Looking for work, and Begin each occurred exactly once. The first marker mismatch was a harness setup fault before import; the same live browser then set the marker and completed the required setup without repeating a product action. Opening reached a ready proper scene.

The first journey helper submitted the first rendered choice and was stopped before its evidence flush. Read-only reconciliation proved action 1 completed exactly once: turn `turn-player-action:583983009d11dd3adf4869def7f2ae5af2f632ff`, operation `narration-operation:791bcd8eb3c5b71adbf5f0039aab1e89879d28a1`, one accepted Narrator attempt, two receipts, one proper-scene binding, and enabled controls. Its persisted automatic and active deadline was `1786228725286`, exactly `completedAt 1786228635286 + 90,000 ms`, while the submitted timestamp was earlier. The helper was not retried and no second click was issued. The killed helper did not retain its request-mode trace, so the live mode cannot be claimed from action 1 alone.

Action 2 completed normally with one Judge, one Game Master, one Actor job, one Narrator attempt, four receipts, one proper scene, and one unique binding. Its Narrator operation `narration-operation:54584815a559d28c6755d99933aee0f252010ba5` persisted automatic and active deadlines `1786229725505 = createdAt 1786229635505 + 90,000 ms`.

Action 3 was the first genuine product/model-stage defect. Turn `turn-player-action:f5c8e945753eac7b4561fcf92965325fc8bf06ff` ended `interrupted` with `model_contract_invalid` after the existing bounded Judge recovery: attempt 1 was `stage_timeout` after 45,034 ms with no retained model response; attempt 2 was `model_contract_invalid` after 5,581 ms, `tool-calls`, and invalid strict-object output. No Game Master, Actor, or Narrator stage started; there was no accepted artifact, narration operation, receipt, proper scene, binding, attempt 3, mechanics replay, or late write. The authoritative turn remained `resume_eligible=1`, `interrupted_stage=admitted`, `completed_at=null`; the lane was frozen immediately and no later player action was submitted. SQLite `integrity_check` was `ok` and `foreign_key_check` was empty.

The lane therefore stopped at completed `3` / uniquely bound `2`, before checkpoint 10 and before reload. Task 174 safe Game Master recovery did not occur naturally; it was not manufactured. Generated evidence is preserved only under the r124 session/run roots, including `r124-terminal.json`, action evidence 001-003, logs, and `r124-cleanup.json`.

## Cleanup

Owned API/UI/CDP ports were 4100/4101/4102 with root/listener PIDs 31108, 50476 (frontend listener), and 55388; frontend root was 31880 and the journey helper was 71652. The one task-owned page was closed through the task-owned CDP endpoint. The exact task-owned processes were stopped, the exact browser profile was removed only after shutdown, and independent verification found no recorded process, listener, profile, or CDP endpoint. Cleanup details are preserved in `r124-cleanup.json`.

## Acceptance handoff

- Entry state: accepted implementation commit `3f0623bd68d8243ceaa09ae460b0585efa81da5e`, clean product tree apart from preserved AGENTS/CLAUDE changes, exact pristine hashes, and task-owned r124 runtime.
- Criterion 1: static selector test proves ordinary runtime is 45,000 ms and safe feedback runtime is 90,000 ms.
- Criterion 2: existing application forwarding/clearing tests plus action 1/2 persisted Narrator deadlines prove the shared 90,000 ms operation window on normal actions; the live safe Game Master recovery branch was not naturally exercised.
- Criteria 3-6: full application, Game Master, and turn-runtime suites remain green for opaque/transport routing, identity, and terminal fences; action 3 confirms the existing Judge terminal boundary without downstream replay or duplicate settlement.
- Criterion 7: r124 provides the required built rendered surface through two positive actions, then the first genuine defect; 60/reload was not reached because continuing would violate the frozen-lane contract.
- Persistence and reload: action 1/2 authoritative operation, receipt, scene, binding, and SQLite evidence is present; final 60-action reload is omitted by the action-3 freeze.
- Safe-recovery live evidence: unavailable because no natural Task 174 recovery occurred.

## Unknowns

The first helper did not flush its before-click/request-mode trace, and the provider response/body for the two Judge attempts was not retained. The r124 lane did not exercise the safe Game Master recovery route, so no live 90-second recovery acceptance or expiry evidence exists. GitNexus was 12 commits stale; the recorded `detect_changes` result is therefore limited to the stale index's `No changes detected` output. The first genuine defect's upstream cause remains unknown beyond the retained local timeout and invalid strict-object boundary.
