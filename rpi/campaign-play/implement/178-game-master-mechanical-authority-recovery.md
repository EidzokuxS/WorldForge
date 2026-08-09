# Task 178 - Game Master mechanical-authority recovery

## Contract

When the existing Mechanical Authority Reviewer rejects a schema-valid Game Master proposal, the first attempt remains rejected with `model_contract_failed` and `modelEvidence.errorCode=mechanical_authority_rejected`. The same immutable turn/frame/ruling/resolution may use the existing single automatic recovery attempt, but only the bounded safe feedback channel is added:

```json
{"diagnostic":"game_master_semantic_validation_mismatch","failedChecks":[{"check":"mechanical_authority_rejected"}]}
```

The feedback contains no reviewer reason, proposal, event summary, actor/location name, player text, source moment, provider prose, or hidden state. Existing repeated-dialogue feedback, model selection, auto/native_json route, 90,000 ms safe-recovery deadline, authority, fencing, persistence, mechanics, and two-attempt limit remain unchanged.

## Graph and scope review

The accepted source was `a0e938cb79517df4c23593d2e7695e8f2b3ac648` on `feat/revamp`; the live index was stale by 19 commits, so a task-owned shadow index was analyzed at the exact source outside the checkout. Current shadow impact was LOW for `CampaignPlayGameMasterRecoveryCheck` (8 impacted), LOW for `mechanicalAuthorityReviewPrompt` (1), LOW for `mechanicalAuthorityReviewInput` (1), LOW for `rememberCampaignPlayGameMasterRecoveryFeedback` (11), and MEDIUM for `compile` (16). The indexed `createCampaignPlayGameMaster` target was HIGH and was not edited; the exported `CampaignPlayGameMasterError` class was not edited. No additional production file was required.

## Implementation and semantic review

`CampaignPlayGameMasterRecoveryCheck` is now the smallest discriminated union preserving the ordered `repeated_actor_dialogue` coordinates and adding only `{"check":"mechanical_authority_rejected"}`. The existing reviewer rejection branch remembers that exact safe check before throwing, and the existing outer wrapper preserves it. The recovery block uses this exact reviewed text:

> The previous proposal failed the safe checks below. Generate a new proposal from the unchanged frame, ruling, and resolution. Fix every listed check. For repeated_actor_dialogue, do not reuse the matching ACTOR_CONTINUITY.recentOwnActions summary. Answer the current PLAYER_INTENT in new words and include the current question-specific detail. For mechanical_authority_rejected, make every mechanically durable claim in each event summary agree with the typed resource effects and route access claims. If no typed authority changes a possession, obligation, or route, keep the event summary non-mechanical. All schema, authority, continuity, and Rulebook rules above still apply.

Main's semantic verdict: the added sentence restates the existing reviewer boundary without changing authority or mechanics. Humanizer verdict: retain the concrete imperative wording; conversational voice is not appropriate for this machine contract. Deslop verdict: no filler, canned framing, vague abstraction, or repeated conclusion remains. No player-visible copy or unrelated prompt changed.

## Automated evidence

The bounded focused suites passed: `npm --prefix backend test -- --run src/campaign-play/game-master.test.ts` (54/54), `npm --prefix backend test -- --run src/campaign-play/turn-runtime.test.ts` (72/72), and `npm --prefix backend test -- --run src/campaign-play/campaign-play-application.test.ts` (15/15). `npm --prefix backend run typecheck`, `npm --prefix backend run build`, and `git diff --check` passed. The task-owned shadow graph reported LOW/MEDIUM risk for the edited feedback/prompt/compile symbols; HIGH indexed targets (`createCampaignPlayGameMaster` and `getCampaignPlayGameMasterRecoveryFeedback`) were not edited. Implementation-scope shadow `detect_changes` reported `3 files, 8 symbols`, five Game Master plan-related processes, and medium risk; no unrelated production flow was selected. The note-only live `node .gitnexus/run.cjs detect_changes --scope staged --repo WorldForge --limit 50` check reported `No changes detected.` The focused tests cover the exact safe reviewer check, preserved error code and wrapper feedback, absence of reviewer/proposal prose from feedback, unchanged normal prompt, unchanged repeated-dialogue coordinates, and exact recovery prompt text.

## Rendered r128 evidence

To be appended after exactly one fresh `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r128` lane from the canonical lowwater-ledger template and Brina card. Generated session/run evidence remains uncommitted. The lane will stop at its first genuine setup, model, semantic, runtime, persistence, mechanics, binding, or reload defect; otherwise it must reach 60 unique bindings and one same-page reload.

## Unknowns and acceptance handoff

Provider response bodies and rejected proposal bytes are not retained by the frozen r127 evidence; no causal provider claim is made. Live affected mechanical-authority recovery remains unknown until it occurs naturally in r128. The acceptance handoff will map the static safe-feedback contract, unchanged recovery identity/deadline/fencing, rendered action boundary, SQLite integrity/foreign keys, and cleanup to exact evidence anchors.

## r128 rendered evidence and terminal boundary

The implementation and initial note were committed and pushed as `61fedb1051dcd9a8cb2e612c0201f643d485a7d2` on `feat/revamp`; local and `origin/feat/revamp` matched before the lane. The only pre-existing checkout changes remained the untouched, unstaged `AGENTS.md` and `CLAUDE.md` files. The fresh lane used the task-owned roots:

- `output/playtests/campaign-play/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r128.session`
- `output/playtests/campaign-world-runs/pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r128`

The materialized state and config matched the required SHA-256 values `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2` and `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`; the canonical Brina card matched `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. Product setup actions were each performed once through the rendered Character surface: one card import and parse request (`200`), one Save (`200`), one lower-wards / Local / Already here / Looking for work selection, and one Begin request (`202`). A task-owned setup preflight first stopped before any product action because its page marker was absent; setting that marker and rerunning the helper was a harness correction, not a repeated import, Save, Begin, or player action.

The opening reached the ready Play surface. The requested first-three labels were not present in the rendered choices, so the harness used the first enabled rendered choice in DOM order and recorded the divergence: action 1 selected `Talk to Dren Vask: ask when the token seizures end`, action 2 selected `Talk to Dren Vask: ask what the delinquency board tracks`, and action 3 selected `Talk to Dren Vask: ask what happens to non-payers`. Actions 1 through 7 each settled one turn with one proper scene and one unique choice binding. Action 1 naturally used the existing Narrator recovery (two attempts, second accepted); this was not a Game Master mechanical-authority rejection.

The first genuine r128 defect was action 8, selected as `Talk to Vedris Kast: insist he explain the seizures` (`choice_082adbe4d7bd66342943dcc9`, turn `turn-player-action:0e9ee301ed19270f98e3d085b5889a3d07ae9bfd`). The turn completed its existing Judge and Game Master stages and settled mechanics exactly once, but Narrator operation `narration-operation:0095cb292966debe98f53c2ef13d5b8af301750a` failed after its two bounded attempts. Both attempts were `narration_invalid`; retained structured warning coordinates were beat `0`, `beats[0].text`, `observationIndexes [0]`, matched actor Dren Vask (alias `Dren`), and allowed/source performer Vedris Kast. The requests remained `auto` resolving to `native_json` with `glm-5-turbo`; attempt 2 completed in `3433 ms` with `finish_reason=stop`. No attempt 3, proper scene, player-action binding, late write, or mechanics replay occurred. The rendered page showed the existing concise failure state with `Restore the telling`, enabled suggestions, and a disabled Act control; no later click was submitted.

Authoritative action-8 evidence is retained in `r128-terminal.json`, `actions/action-008-evidence.json`, `r128-journey.stdout.log`, and `backend.stdout.log` (the stable mismatch warnings occur around the `04:31:50` and `04:31:54` entries). The operation kept the Task 167/174 stage-local deadline (`automaticDeadlineAt=activeDeadlineAt=1786239195333`, created at `1786239105333`). Its two applied receipts were `receipt:146fec54fade82170a0a2db198d9b0f4` (world `19 -> 20`) and `receipt:eb45135c8f9e7e062850f04bb598b4e1` (no additional mutation, world `20 -> 20`). SQLite read-only checks returned `integrity_check=ok` and an empty `foreign_key_check`; the lane ended with 8 completed player actions, 7 proper-scene/binding pairs, no checkpoints at 10/30/60, and no reload because the hard-stop condition was reached. The r128 lane did not naturally exercise `mechanical_authority_rejected`, so live Task 178 recovery acceptance remains unavailable; no causal provider claim is made and raw rejected Narrator/provider bytes remain unknown.

## r128 cleanup and acceptance handoff

Task-owned backend/frontend/browser roots were `56960`, `50688`, and `67200`; recorded descendants were `36376`, `43828`, `44636`, `56460`, `62128`, `68848`, `70368`, `71436`, `73388`, and `75452`. The page target was closed through CDP target `71E6A60DB537CE6DC066B47A1C8735EA`; ports `4140`, `4141`, and `4142` had no listeners after the exact owned processes were stopped. The task-owned browser profile, four temporary r128 helpers, and the temporary shadow GitNexus clone were removed only after ownership checks; the CDP endpoint, page, profile, shadow path, and all recorded PIDs were independently absent. Generated r128 session/run evidence remains preserved and uncommitted.

Acceptance mapping: the bounded source/test contract and exact safe reviewer check are covered by `game-master.test.ts` and the focused 54/54 Game Master, 72/72 turn-runtime, and 15/15 application suites; typecheck, build, and `git diff --check` passed. The rendered positive path is setup/opening plus seven unique proper scenes/bindings, with native JSON mode evidence and one existing Narrator recovery. The first-defect boundary proves two-attempt Narrator fencing, one mechanics settlement, two unique receipts, no late write, and clean SQLite/FK state. The 60-action checkpoint sequence, same-page reload, and live mechanical-authority recovery are omitted because the required hard-stop occurred at action 8.
