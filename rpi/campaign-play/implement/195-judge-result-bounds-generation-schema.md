# Task 195 - Judge result-bounds generation schema

## Contract and fixed boundary

The frozen r142 action 17 Judge boundary was a generation/validation mismatch: attempt 1 completed transport and `auto`/`native_json`, then final validation rejected `resultBounds` because the deterministic judgment did not contain a mechanical result range. Automatic attempt 2 separately failed in `tool`/`tool_mode` structured-output extraction; its raw arguments and provider bytes are not retained. Task 195 repairs only the provider-facing generation schema for disposition/result-bounds compatibility. It does not change the attempt-2 extraction path, compiler/final-validation authority, recovery feedback, prompt text, provider/model/mode/reasoning, deadline, retry, persistence, mechanics, UI, or copy.

The generation contract is explicit in the JSON Schema passed to `safeGenerateObject`:

- `deterministic` accepts exactly equal pairs from `setback`, `limited`, `success`, or `strong_success`.
- `uncertain` accepts exactly ordered unequal pairs from those four non-`no_effect` tiers.
- `impossible` and `clarification_required` accept exactly `no_effect`/`no_effect`.
- Task 175's `clarificationQuestion` discriminator and all frame/frozen-choice constraints remain in the same generation schema.

The broad proposal schema, `campaignPlayJudgeRulingSchema`, `compile()`, final guards, feedback, and bounded recovery remain unchanged. Suggested waits continue to use their frozen deterministic branch and the same result-bound restriction.

## Impact and implementation

Entry was branch `feat/revamp`, local/origin `50e4ae8e4807b2aa7f9aa3857ebdb3d990d523eb`. `judgeProposalSchemaForFrame` and the nested schema helper were absent from the registered GitNexus index. The nearest indexed Judge execution owner (`judge` in `backend/src/campaign-play/judge.ts`) reported LOW risk with zero indexed direct callers, processes, or modules; the index was 20 commits stale. Source review confirmed the edited helper is private and generation-only. No HIGH or CRITICAL exact edited target was identified.

The implementation adds private literal-pair unions for deterministic and uncertain bounds and a private `no_effect` pair schema for impossible/clarification branches. No exported interface or runtime selector changed. No prompt/copy review was applicable because prompt literals remain byte-stable; humanizer/deslop review is explicitly not applicable to this generation-only schema.

## Static validation before r143

- `backend/src/campaign-play/judge.test.ts`: 45/45 passed. Tests cover every valid disposition pair, every invalid pair class, the provider-facing JSON Schema branches, clarification-question discrimination, and the broad compile/final-validation path.
- `backend/src/campaign-play/campaign-play-application.test.ts`: 15/15 passed.
- `backend/src/campaign-play/turn-runtime.test.ts`: 72/72 assertions passed in both the initial run and the narrow rerun. Both Vitest processes exited non-zero only because of the known post-run worker error `[vitest-worker]: Timeout calling "onTaskUpdate"` after all selected assertions passed; this is recorded as a verification-tool defect, not an assertion failure.
- Backend typecheck: passed.
- Backend build: passed.
- `git diff --check`: passed before the implementation commit.
- A task-owned exact-entry shadow index was rebuilt successfully (14,931 nodes / 42,701 edges / 882 flows). Its nested `judgeProposalSchemaForFrame` target remained absent; the source-qualified indexed `judge` owner remained LOW with zero direct/process/module impact. The shadow `detect_changes --scope staged` still mapped the three-file patch to unrelated stale `CampaignPlayJudgeInput`/`CampaignPlayModelBudget`/`CampaignPlayModelEvidence` symbols and reported a critical transitive flow set; source review confirms none of those symbols is edited, and the reported critical mapping is stale-index detector noise rather than an exact-target impact. The staged paths are only this note, `judge.ts`, and `judge.test.ts`.

Protected `AGENTS.md` and `CLAUDE.md` remain byte-for-byte unchanged and unstaged. Generated playtest evidence is not part of the commit.

## r143 journey

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r143`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, ports 4290/4291/4292. Required hashes are template state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and canonical Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

The single fresh lane and its authoritative rendered/SQLite evidence are appended below after the implementation is committed. Natural changed-schema coverage, checkpoints, reload, cleanup, and any first genuine defect will be reported exactly without reconstructing unavailable provider or proposal bytes.

## Acceptance handoff before r143

- Entry: accepted source commit with only protected instruction-file dirt.
- Generation contract: focused Judge tests and the provider JSON Schema assertions cover all disposition/result-bounds combinations and preserve Task 175 clarification discrimination.
- Protected behavior: compile/final guards, feedback, extraction, recovery fencing, identity, and deadlines remain covered by existing Judge/turn-runtime/application suites.
- Built product and persistence: unavailable until the one fresh r143 lane reaches a hard-stop boundary or 60 actions plus same-page reload.

## r143 rendered and authoritative result

The fresh lane was materialized exactly once from `lowwater-ledger-pristine-93a09e46-20260719`. The canonical template state, config, and Brina card hashes were verified as `6CB291D11CE6578E3395A10D2C5D590070E3CCDD8B2B67451410869CE97897D2`, `D8362B1AF976C00CB8F14C564C8196A2D1AB137743FF368EA83D762A4AD2E065`, and `4B48DE7A32DF6A6BE5A91AB12F09BB87926B40D5940348C7581E298EAA12B60A`. The generated campaign config retained the required config hash. The materialized run used the owned backend/frontend/CDP ports `4290/4291/4292`; `runtime-start.json` hash after shutdown was `33789AE6590CA96617B8C0DEF87103DEA549E9C4A57FFAAB364F1E248244C956`. The generated `template.json` hash was `EA9E37D6D4AFB9259EA364178623D427EE2394EAF71CB082C447CAD71F6E2580`.

Setup used one canonical card import/file assignment, one Save/Continue, the required `lower-wards` / `Local` / `Already here` / `Looking for work` selections, and one Begin. The imported Brina draft rendered on the same page before Save. Opening turn `turn-opening:30097a69f67696b0847453ecdc24863ce3d72d77` reached `ready` with a proper scene for Brina Hael in `alderman-hallway`.

Action 1 selected the first enabled rendered suggestion, `Talk to Dren Vask: ask about the notice deliveries`, once. Turn `turn-player-action:f066940bd66642bd34d410662afc7d4dc55a65a9` settled with one proper scene and unique binding. Its Narrator operation `narration-operation:bc7ba316e58dd8674c73a4dda27af57ad47402d8` completed on automatic attempt 2 (`narration-attempt:f01b549212859f960402a26d0fee85d5ae460f6e`), producing narration `narration:b043793adc8ccf2e24eb3fba7a53185abe1c906a` and result `result:6f98649451c98b880e7b195cfbb6edf7a2fda01c`. The rendered scene exposed enabled next choices.

Action 2 then selected the first enabled rendered suggestion, `Talk to Dren Vask: accept the notice deliveries`, once. The authoritative turn `turn-player-action:733c4604f99dce19e4507523aba0c51e2bd77901` entered an interrupted boundary at `interrupted_stage=judged`, `error_code=model_contract_invalid`, `retryEligible=true`, with no completion, result, commands, receipts, narration operation, or actor job for that action. Judge attempt 1 was accepted. Game Master attempts 1 and 2 reused stage `1b092dd852ca8d7d565f3c0c424c4633aa3dcec977bf8b3b5c4bf1c861703967`, provider/model `zai-coding-plan` / `glm-5-turbo`, strategy `strict_object`, and both ended `schema_outcome=invalid` / `model_contract_invalid` after finish reason `stop`; there was no attempt 3. The persisted rows were:

- attempt 1 row `73b3688312a39076a1b364598e4a61a16f9fec4ea76cc1e2b9af14226b66b579`, input 9530, output 339, duration 13,965 ms;
- attempt 2 row `1dec37b9ba06d920973a9cd9c1cfe4f389228eabca9f62bf28c1b1067a0a2b3e`, input 9658, output 272, duration 9,077 ms.

Backend log anchors are `backend.stdout.log:490-716`: both attempts logged the existing Game Master semantic-compilation warning and no third attempt or downstream Narrator operation followed. The retained log contains bounded warning summaries, but raw provider response bodies, request ids, SDK extraction detail, and raw candidate bytes needed to identify the exact rejected invariant are not retained. The changed Judge schema was not isolated by a naturally captured r143 Judge boundary; Judge action 2 was accepted before the Game Master defect.

At the terminal boundary SQLite reported `player_turns=2`, `completed_player_turns=1`, `clean_completed=1`, `turn_results=2`, `proper_scenes=1`, `narration_operations=1`, `narration_attempts=2`, `model_stages=8`, `receipts=15`, and `commands=15`. `PRAGMA integrity_check` returned `ok`; `PRAGMA foreign_key_check` returned an empty set. No action-2 settlement, duplicate mechanics, late write, or player action 3 exists. The rendered page showed the prior proper scene plus `The turn stopped before it finished.`; Resume was visible, while the action controls were disabled. No Resume or retry was issued.

## r143 hard-stop, cleanup, and final handoff

The first genuine defect is the action-2 Game Master `model_contract_invalid` boundary after two invalid compiler attempts. The lane therefore stops at 1 completed action and 1 unique player-action binding; checkpoints 10/20/30/40/50/60 and the 60-action reload are unavailable and were not claimed. Task 195 static acceptance remains covered by the pre-lane tests/build; live changed-schema coverage is unavailable.

After evidence capture, the exact owned wrapper/descendant PIDs `6092`, `66780`, `40012`, `70636`, `78604`, and `17864` were independently absent. No listeners remained on ports `4290`, `4291`, or `4292`; a read-only request to `http://127.0.0.1:4292/json/list` was refused, proving the CDP endpoint/page was absent. The task-owned browser profile did not exist, and the task-owned shadow index `R:\Temp\WorldForge-task195-shadow` was removed after verifying its exact path. The frozen r143 session/run evidence remains preserved. Final evidence hashes include backend log `F59ECB03B09611241F3738BCEB2AF1F189B6D78E945BE3F715A15F5C092BE44C`, `state.db` `D3ECE8107DD3E7FA4AEC26CAE3803D36909C07D65753A0EF5999A24C10D45C89`, `state.db-wal` `D9658D9131B6DBE97AE70304C9D62A4211096EAFA37CB532A44505DBA6646D1C`, and `state.db-shm` `680419F95C4A01FB803254B0499B6AEDA1CA66995EB5952516A230968445F015`.

The implementation commit is `d8241f6315769451a4226c23ea3cf170306fe64d`; the note-only evidence update is the final commit after this section is committed and pushed. Local `feat/revamp` and `origin/feat/revamp` must be equal at handoff. Protected instruction files remain unstaged and byte-for-byte unchanged; generated r143 evidence remains uncommitted.

### Acceptance handoff

- Generation-only result-bounds contract: passed by Judge 45/45 focused assertions and provider JSON Schema inspection; no prompt, compiler, recovery, or extraction change.
- Static dependent behavior: campaign-play application 15/15, turn-runtime 72/72 assertions in both runs with the known post-run Vitest worker shutdown defect, backend typecheck/build, and diff checks passed.
- Canonical setup/Open: passed with the required hashes, one import, one Save, one Begin, and a proper Opening scene.
- Positive built journey: action 1 settled one unique binding and proper scene; action 2 did not settle.
- Direct failure boundary: action 2 Game Master attempts 1 and 2 are the first genuine defect; same action authority was fenced with no attempt 3, downstream replay, or duplicate write.
- Persistence/reload: integrity/FK are clean at the hard stop; 60-action checkpoints and same-page reload are unavailable because the lane froze at action 2.
- Natural changed-schema Judge coverage: unavailable in the live lane; no inference is made from the accepted action-2 Judge stage.
- Cleanup/protected files: passed by independent PID/listener/CDP/profile checks and protected-file status/hash verification.

Purpose is `Needs attention`: Main must choose the next bounded repair for the frozen action-2 Game Master `model_contract_invalid` boundary; no r143 continuation or alternative lane was started.
