# Task 162: Judge final ruling contract diagnostic

## Contract

Campaign Play Judge emits one structured `judge.contract_rejected` event only when the final `campaignPlayJudgeRulingSchema.safeParse` rejects a compiled ruling. The event is emitted before the existing `model_contract_failed` mapping and is deduplicated by `campaignId`, `turnId`, Judge `attempt`, and worker `epoch`.

The payload is limited to `campaignId`, `turnId`, static `stage: "judge"`, `attempt`, `epoch`, and an ordered `issues` array. Each issue contains only its `issueIndex`, Zod `code`, an allowlisted schema field path when safe, and a message only when it exactly matches a schema-owned contract message. Proposal bytes/objects, player prose, prompts, actor or location names, provider bodies, and arbitrary input values are not retained or logged. The diagnostic uses the existing structured logger only; it does not persist the failed proposal or event and does not change Judge schemas, compiler rules, recovery count, deadline, provider/model/reasoning, turn persistence, mechanics, UI, or copy.

## Repair and semantic review

`backend/src/campaign-play/judge.ts` carries the safe issue sanitizer and final-boundary emitter. `backend/src/campaign-play/turn-runtime.ts` supplies the existing external-stage attempt and worker epoch identity. Focused Judge tests cover valid no-event behavior, one ordered safe event for multiple final-schema issues with unsafe proposal content absent, and attempt-1 transport interruption followed by attempt-2 final-schema rejection with no third call or late event.

Humanizer verdict: the diagnostic field names and schema-owned messages are literal contract identifiers or existing contract text, not player-facing prose; no rewrite was made.

Deslop verdict: the diagnostic copy is concrete, bounded, and diagnostics-only; no filler or status-label prose was introduced.

GitNexus upstream impact before edit: `compile`, CRITICAL from a stale/generic symbol collision (source-confirmed Judge call path); `createCampaignPlayJudge`, HIGH; `createCampaignPlayTurnRuntime`, HIGH. The index was two commits stale. The warnings were recorded and the affected source path was verified before editing; no architecture or authority decision was taken.

## Automated evidence

- `npm --prefix backend test -- --run src/campaign-play/judge.test.ts`: passed (39 tests).
- `npm --prefix backend run typecheck`: passed.
- `git diff --check`: passed; only existing line-ending warnings.
- Final GitNexus `detect_changes` and affected build/typecheck remain required before commit.

## Fresh rendered journey

Run: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r110` (fresh lane)

Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`

Template and setup: materialized from `lowwater-ledger-pristine-93a09e46-20260719`; state hash `6cb291d11...97897d2`, config hash `d8362b1a...4ad2e065`, source commit `f03596...`, and canonical Brina card SHA256 `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. Import occurred once, Save once (the harness first expected the wrong method, then reconciled the actual PUT route read-only), and Begin once with the exact four setup choices. Setup integrity and foreign-key checks passed.

Live result: stopped at the first genuine defect on player action 5 of 60. Actions 1-4 completed with proper scenes and operations; action 5 submitted the rendered `Wait 10 minutes` choice once and returned 202, but no completed scene or operation arrived before the 120-second action bound. The page rendered the prior scene with “The turn stopped before it finished.”, disabled choices, and a Resume control. No Resume, retry, replay, or mutation was issued. The action-5 turn has no ledger binding, and SQLite reports four completed player turns, zero unbound admitted actions, no duplicate turn/choice/receipt binding, integrity OK, and no foreign-key violations.

The action-5 Actor Replanner first attempt was a known grounding-review rejection (`0:outcome_not_established`) and emitted the existing safe `actor_replan.rejected` event. Attempt 2 then ended as `stage_timeout` after a local deadline abort (`safeGenerateObject tool_mode: text fallback is disabled; tool_mode failed: This operation was aborted`) with no provider response metadata or raw proposal retained. There was no Judge final-ruling safeParse failure, so the new Judge diagnostic did not recur. The retry count stayed at one and no late write occurred.

Follow-up recovery seam: `buildCampaignPlayActorReplanRecoveryPrompt` now gives explicit safe guidance when `reviewViolations` lists `outcome_not_established`: rebuild flagged steps around only the actor's own attempt or an ACTOR_FRAME/accepted-trace physical result, remove claims about another actor or an unestablished outcome, and prefer one grounded step. This prompt-only repair preserves schemas, compiler rules, recovery count, deadlines, provider/model/reasoning, persistence, mechanics, UI, and copy. Prompt and replanner tests cover the new instruction and existing one-retry/no-late-write behavior.

The frozen r109 action-4 lane remains preserved and was not resumed, replayed, retried, or mutated.

## Acceptance handoff

| Criterion | Evidence | Result |
| --- | --- | --- |
| Valid ruling emits no diagnostic | Focused Judge test | Pass |
| Final ruling safeParse emits exactly one event with stable issue ordering | Focused Judge test with duplicate citations and unreachable required possession effect | Pass |
| Payload contains only safe identity/issue fields and excludes unsafe proposal content | Focused key and serialized-content assertions | Pass |
| Timeout then invalid attempt remains truthful with no third attempt or late write | Focused Judge test | Pass |
| Existing runtime supplies attempt and worker epoch identity | Affected source/typecheck; r110 action-5 stage rows and actor attempts | Pass |
| 60/60 unique bound actions plus same-page reload | Fresh pristine r110 journey stopped at action 5 defect | Not met; continue on a new pristine lane |

Product entry and reload evidence are pending the fresh lane. The smallest positive diagnostic journey remains one valid Judge ruling followed by one final-schema rejection carrying one safe event, with a separate interrupted attempt proving no third call or late write. The positive r110 journey covered exact setup admission and four completed player actions before the Actor Replanner recovery timeout; no reload acceptance was attempted after the defect.

## Fresh rendered journey: r111

Run: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r111` (fresh lane)

Campaign: `6b85a49e-fef5-4359-95e2-051383f6fb66`

Entry and setup: the lane used commit `8c292b713c025425671a1282c709dd63fe2f14db`, materialized only from `lowwater-ledger-pristine-93a09e46-20260719`, with state SHA256 `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config SHA256 `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and canonical Brina card `R:\Projects\WorldForge\output\playtests\character-cards\brina-porter-v2.json` SHA256 `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. A preflight marker mismatch was reconciled read-only; setup then performed exactly one card import and one Save, and the actual PUT route was read back without a second import or Save. Begin was performed once with lower-wards / Local / Already here / Looking for work. Setup integrity was `ok` with no foreign-key violations.

Live result: the rendered loop admitted 29 player actions and stopped at the first genuine defect on action 29. Actions 1-28 each returned an enabled control and a proper scene. Action 29 selected `8ac7f80424f562c17c6d96909b8e6a10985139f4:choice_e7b6a774a2b36cb8bf866264` once; its turn `turn-player-action:066998837c84a3f2063847a3dd467a51bb91b8f3` completed at the turn layer, but its narration operation failed and no new proper scene was rendered. All 29 admitted actions have unique turn/idempotency/choice bindings; no duplicate or unbound admission was observed. The loop issued no action after 29 and created no checkpoint-30/60 or action-60 reload evidence.

Action 29 authoritative records: narration operation `narration-operation:80f9e0c919092c5d7fa4f7860d51d40233da7aff` ended `failed` on attempt 2. Attempt 1 `narration-attempt:ee3db67b3dd9766dface509dd34eb6c7d3c6b57a` ended `provider_unavailable` after 1,566 ms; the structured backend log records `safeGenerateObject tool_mode` failing with `Invalid API parameter, please check the documentation.` Attempt 2 `narration-attempt:3906843316026ba7529f5b908deba416781ac4ca` ended `stage_timeout` after 25,371 ms; its `safeGenerateObject native_json` call ended with `This operation was aborted`. Game Master and Actor Replanner stages were accepted before narration. No `judge.contract_rejected` event or Judge final-ruling failure occurred. Raw provider response bytes/body and the exact rejected parameter were not retained.

Rendered evidence showed the preceding proper winch-platform scene and controls, then the action-29 page retained that prior scene and showed “What happened” / “Restore the telling” with Wait rather than a new proper scene. SQLite readback: `campaign_play_turns` total 30 including opening, `campaign_play_turn_results` 30, player turns 29, narration operations 29, attempts 41, proper scenes 28, receipts 88; integrity `ok`; foreign keys `[]`; all 29 player turns had unique idempotency keys, `stage=completed`, `error_code=null`, and `resume_eligible=0`.

## r111 diagnosis and acceptance update

The narrowest proven boundary is an external structured-output request rejection on the Narrator tool-mode attempt followed by the existing provider-unavailable recovery path's native-JSON attempt being locally aborted. This is not evidence of a provider outage, and it is not a proven prompt, Judge schema, compiler, or persistence defect. The existing recovery seam already selects `auto`/native JSON for a Narrator `provider_unavailable` recovery. Because the raw provider response is absent, the exact invalid parameter is unknown; changing the first-attempt request strategy or provider/configuration surface would be a material Main decision under the packet. No source repair was made after r111.

| Criterion | Evidence | Result |
| --- | --- | --- |
| First genuine defect freezes the lane without another player action | r111 action-loop terminal record at action 29; no action 30 request | Pass |
| Task-owned runtime cleanup is independently verified | r111 roots/descendants, ports, and browser profile absent after bottom-up stop | Pass |
| 60/60 unique bound actions plus same-page reload | r111 stopped at action 29 with 28 proper scenes | Not met; Needs attention |
| Continue without an unapproved architecture/provider decision | Exact Narrator request parameter is unknown and no narrow prompt/runtime repair is proven | Main decision required |

Required Main decision: authorize or decline a bounded Narrator structured-output request-strategy/provider-parameter investigation or change despite the missing raw provider bytes; the current worker cannot choose that provider/configuration boundary.

## Cleanup

The frozen r109 evidence and runtime remain preserved. r110 owned backend PID 12948 (child esbuild 53032), frontend PID 59144 (child Next 70984), Chrome PID 47308 and its exact descendants, ports 3970/3971/3972, and browser profile `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r110.session/browser-profile`; all were stopped bottom-up and independently verified absent, with no listeners remaining. The session/run evidence was retained. The next lane must record every task-owned root PID, descendant, listener, browser page/profile, and helper, stop and verify all owned resources at the first genuine defect or terminal completion, and leave unrelated `AGENTS.md` and `CLAUDE.md` changes untouched and unstaged.

r111 owned backend PID 35808 (children esbuild 56436 and conhost 41784), frontend PID 64884 (children Next 60252 and conhost 65096), Chrome PID 60092 and exact descendants 62412, 44244, 66328, 56156, 63700, and 36548, ports 3980/3981/3982, and browser profile `R:\Projects\WorldForge\output\playtests\campaign-play\pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r111.session\browser-profile`; all were stopped bottom-up and independently verified absent, with no listeners remaining. The r111 session/run evidence was retained. Frozen r109 remains untouched.
