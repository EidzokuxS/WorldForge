# Task 193: pristine r141 Narrator-timeout recheck

## Contract and fixed decision

Task 193 makes no product, test, prompt, configuration, deadline, provider/model, routing, or recovery change. It runs one unchanged-source Campaign Play lane to distinguish the frozen r140 Narrator timeout from a repeatable boundary. The player surface is the rendered Play page; the required outcome is canonical setup, one unique proper-scene binding per admitted action, 60 actions, and one same-page reload. The lane hard-stops at the first genuine defect. Resume, Restore, retry, replay, direct API admission, SQLite writes, synthetic failures, and later actions after a defect are forbidden.

r140 action 37 had a fresh local 90,000 ms Narrator window and persisted AbortController timeout. No provider response, status/body, request id, SDK code, candidate, or causal upstream metadata was retained; neighboring packets completed normally. Main therefore selected no repair and one fresh unchanged-source falsifier. A successful r141 would show only that r140 did not reproduce; it would not establish a cause or a timeout repair.

## Entry, hashes, and scope

The lane ran on `feat/revamp` at `88a0a53297d535ac4ef2d88e4be9a17ea86f6f58`, equal to origin before setup and after the note commit. Pre-existing `AGENTS.md` and `CLAUDE.md` remained byte-for-byte unchanged and unstaged (entry hashes `0d75edc72cc195e385ed5b9c98c616e82fdb3c13e210d0feb94333e19a76d541` and `c6874175503f6890af8ca2db34eff5630b8a513ede95cea3f76c43435925fca6`). No product or test file changed. Generated r141 evidence remains outside Git.

Required canonical hashes were verified: pristine state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. Materialization was fresh and occurred once.

## Setup and rendered journey

Run `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r141`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, used only task-owned ports 4270/4271/4272 and an isolated browser profile. The canonical card was assigned once (`importClicks=1`, `setInputFilesCalls=1`); its parse request returned HTTP 200 once. Save/Continue was clicked once and returned 2xx once. The exact setup selections were lower-wards / Local / Already here / Looking for work, followed by one Begin request (202). Opening reached a ready proper scene for Brina Hael at `alderman-hallway`.

Actions 1-4 each settled once with one proper scene and one unique binding:

1. `Talk to Dren Vask: accept the notice-carrying job` (`turn-player-action:afeeb14b6b83d5cf83abc227a972bcbf52665915`)
2. `Talk to Dren Vask: take the cloth bundle` (`turn-player-action:28923c2859d85c344cd218927842aa759cfc7ea5`)
3. `Talk to Dren Vask: ask where the east row begins` (`turn-player-action:d141784b3cce73186bb9ddfdaabff79bf49e8c4c`)
4. `Talk to Dren Vask: ask about the red marks` (`turn-player-action:e911d7b229d723d0b3724c2b9f05b237dc84a850`)

Action 5 was admitted once but is the first genuine defect, so no later action was submitted. The rendered choice was `Talk to Dren Vask: ask what the alderman wants with them`, choice `choice_7734bc63bc88c12faae5b652`, turn `turn-player-action:cd48089a43547e0536bcb2858e53aff4f17be26c`, stage `actor-replan-stage:a47b51b62347074ff285efc264c8df04`, and actor job `actor-job:0000:e2bf4973592c3300c5bcf215`. Game Master and Narrator completed, but Actor Replanner attempt 1 and attempt 2 both ended `model_contract_invalid` with schema outcome `invalid`; no attempt 3, plan, action-5 binding, late write, or duplicate mechanics occurred. The raw proposal/provider response and exact invalid field are not retained and remain unknown. This is not a Narrator `stage_timeout`, so the r140 Narrator timeout did not recur in this lane; r141 froze earlier at the Actor Replanner boundary.

## Authoritative evidence

The frozen terminal record reports `result=first_genuine_defect`, `completed=5` admitted player actions and `bound=4` unique bindings. Final counts were: characters 1, turns 6 (Opening plus five player turns), commands 23, receipts 23, proper scenes 5, Narrator operations 5, Narrator attempts 5, model stages 13, actor jobs 2, and runtime events 107. Final state remained phase `ready`, Brina Hael, worldVersion 17, runtimeRevision 107, location `alderman-hallway`. The action-5 Narrator operation/result/attempt completed once; its proper scene was the prior packet-derived scene and no action-5 binding was admitted.

Action-5 retained model-stage rows were:

- attempt 1 `model-stage-row:b8529bd9c413ce5c69bde42bf1a1f106`, worker epoch 1, `zai-coding-plan` / `glm-5-turbo` / `strict_object`, 5292 input and 426 output tokens, 9111 ms, finish `stop`, schema `invalid`, `model_contract_invalid`;
- attempt 2 `model-stage-row:e123ed812918206f826533b27f65266d`, worker epoch 2, same provider/model/strategy, 8011 input and 3662 output tokens, 33385 ms, finish `tool-calls`, schema `invalid`, `model_contract_invalid`.

Read-only SQLite checks at the boundary were `PRAGMA integrity_check=ok` and an empty `foreign_key_check`. No Task 192 `record_world_event_scope_overflow` recovery occurred naturally. No 10/20/30/40/50/60 checkpoint or same-page reload was attempted after the hard stop.

Evidence hashes after cleanup:

- `runtime.json`: `3BAB7ACFACD6853BF3CFCD8EA5BBE8B8FC3BA9193582B22FB965F9241B2F7ADD`
- `probes/materialization.json`: `68CD9F80638F38E2B6FA7FFD2E33C10C18F6C9A1B1200E518A5C56C22BCCB9F2`
- `probes/setup-summary.json`: `8F1424327D72BB91F9DFE9DBC1B96326677391947329DD057A92047614F2A255`
- `r141-terminal.json`: `C30E53136C8E7E15E83E3FCD5EC7C8F1EC480249D278CDA9BDE4DF6FF4FFEF68`
- `browser-actions.jsonl`: `0826C05DF45AB284DBF00972C36EEA85E23340BC6F28F55FD6E38FEF418C3D87`
- `actions/action-005-evidence.json`: `C00C0817A755FE4FD23019ADB4CE6556E31EE5FD96BB95F1683931BF0082174D`
- `backend.stdout.log`: `BF921BAE3B99D50ACDE5477F1812DE49B0051CCBADF6CC52D29712B4DDE99EAA`
- `state.db`: `B4A08FD262AB44C601FB000104AB3B551D65A94A62FE3F9B49D41006BE978720`

## Cleanup and acceptance handoff

Owned backend PID 83680, frontend PID 69864, browser PID 44700, their recorded descendants/helpers, ports 4270/4271/4272, CDP page, browser profile, and copied temporary helpers were stopped/closed or removed and independently verified absent. The r141 session and campaign-world-run evidence roots were preserved. Protected files retained their recorded hashes and remain unstaged.

Static Task 192 implementation evidence was accepted before this unchanged-source lane and was not rerun. The built lane proves canonical materialization, one-time setup, ready Opening, four positive unique bindings, exactly-once action-5 upstream settlement, clean SQLite integrity/FK, and the first genuine Actor Replanner terminal boundary. It does not prove recurrence or non-recurrence of the r140 Narrator timeout at a comparable later action, Task 192 overflow recovery, 60 completed bindings, checkpoints 10-60, same-page reload, or any natural safe recovery. Provider response/body, raw proposal, invalid schema coordinate, and upstream cause remain unknown. Main's next decision is the exact frozen action-5 Actor Replanner `model_contract_invalid` boundary before another endurance lane; this task does not select a repair.
