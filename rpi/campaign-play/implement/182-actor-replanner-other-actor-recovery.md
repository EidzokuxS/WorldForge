# Task 182: Actor Replanner other-actor recovery

## Contract

When the existing Grounding Reviewer rejects an Actor Replanner proposal with the safe coordinate `other_actor_action_not_established`, the existing automatic attempt 2 receives one recovery-only instruction. The instruction rebuilds each flagged step around the planning actor's own action or its directly caused physical trace; another actor may remain only as a contact or observation target. Reviewer authority, proposal schema, runtime routing, provider/model/mode/reasoning selection, shared deadline, retry count, mechanics, persistence, and visible product behavior remain unchanged.

The exact recovery paragraph is:

> When reviewViolations lists other_actor_action_not_established, rebuild each flagged step around one action performed only by the actor identified by ACTOR_FRAME.actorHandle. Another actor may remain only as the target of contact or observation. Remove any method, stakes, or observableTrace that states or requires that other actor to respond, consent, assist, work, move, accept, pay, or complete anything. The rewritten observableTrace must show only the planning actor's own attempt or a physical trace directly caused by that method; do not replace the removed participation with another unestablished outcome. Prefer one grounded step.

## Impact and review

A fresh task-owned GitNexus shadow at entry `8b1364386365b3c09b30b7726e93688545b62d46` found exact LOW upstream impact for `buildCampaignPlayActorReplanRecoveryPrompt`: two direct callers (the prompt test and `createCampaignPlayActorReplanner.replan`), one Campaign-play module, and no indexed processes. The shadow index and registry entry were removed after the query. Source review confirmed the edit is confined to the existing recovery prompt seam.

Semantic review verdicts are fixed: prompt-craft judged this a surgical recovery-only rule keyed to the existing safe coordinate; humanizer judged the direct technical wording appropriate and retained the literal unchanged; deslop found no filler or redundant restatement beyond the required distinction.

## Initial validation

Implementation and focused validation completed before the built lane. No base prompt, Reviewer prompt/schema, SAFE_REJECTION_FEEDBACK, runtime branch, persistence, or player-visible copy is changed.

- `npm test -- --run src/campaign-play/actor-replan-prompts.test.ts src/campaign-play/actor-replanner.test.ts` passed: 2 files, 28 tests.
- `npm test -- --run src/campaign-play/turn-runtime.test.ts` passed: 1 file, 72 tests.
- `npm test -- --run src/campaign-play/campaign-play-application.test.ts` passed: 1 file, 15 tests.
- `npm run typecheck` passed in `backend`.
- `npm run build` passed in `backend`.
- `git diff --check` passed for the owned source/test/note delta; AGENTS.md and CLAUDE.md remained pre-existing unstaged changes.
- Staged GitNexus `detect_changes` and the exact staged-path review are recorded at the implementation commit. The expected flow is limited to the Campaign Play Actor Replanner recovery prompt and its focused tests.

## r131 journey

The one fresh lane was `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r131` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, built from implementation commit `04dae6c5f547dbe576abfb17a9f21c0837f4811a` on ports 4170/4171/4172.

Canonical setup evidence was verified before launch: template state SHA-256 `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config SHA-256 `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and Brina card SHA-256 `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. The card was imported once (`parse` response 200), saved once, configured as lower-wards / Local / Already here / Looking for work, and Begun once. Opening reached a ready proper scene. The first harness invocation stopped before any player action because it looked for an obsolete setup probe; the task-owned harness was corrected without repeating import, Save, Begin, or any player click. Its reconciliation probe records zero duplicate product actions and clean SQLite integrity/FK state.

Actions 1-20 each settled one unique proper-scene binding. Action 1 was reconciled after the harness-only classifier incorrectly counted a recovered Actor attempt as a terminal stage failure; the authoritative turn was completed, Actor attempt 2 was accepted on the same stage, Narrator and receipts settled once, and no action was replayed. Actions 5 and 14 also used bounded second Actor attempts and settled once. Checkpoints were clean:

- action 10: completed/bound 10/10, worldVersion 23, runtimeRevision 187, SQLite `integrity_check=ok`, `foreign_key_check=[]`;
- action 20: completed/bound 20/20, worldVersion 37, runtimeRevision 368, SQLite `integrity_check=ok`, `foreign_key_check=[]`.

The first genuine product boundary was action 21, chosen as `Talk to Pira Senn: ask who the collector is` (`choice_af755b436030eff498a7c8de`), turn `turn-player-action:8002ea93b878683737f3277eb7991f23b3cdefbc`. No later action was submitted. The turn settled mechanics but its Actor Replanner stage did not produce an accepted plan:

- stage `actor-replan-stage:4f4c97cd45b7d2cf4789a04dcc882bc8`, job `actor-job:0000:71f43d9dd50b85a5dea988db`, attempt 1 / epoch 1 was proposer-only: the safe generation path ended `model_contract_invalid`/schema-invalid with no usable proposal object and therefore no rejection artifact or safe coordinates. The retained attempt log identifies the request boundary but does not retain raw provider/proposal bytes;
- attempt 2 / epoch 2 reused the same turn and stage and received the original base `proposalPrompt`, because `rejectionArtifact` was undefined. It returned a proposal and ran the Grounding Reviewer, which rejected with the safe coordinates below, then ended `model_contract_invalid` at the unchanged 45-second recovery boundary. The Task 182 coordinate-specific paragraph was not present in attempt 2. No accepted plan, attempt 3, or late write exists.
- The Grounding Reviewer rejection was retained as safe coordinates only: `reviewViolations=0:other_actor_action_not_established|0:outcome_not_established` at `actor_replan.rejected` (attempt 2, `grounding_review_rejected`). Those coordinates were produced only after the no-artifact recovery; they do not prove that the Task 182 paragraph was supplied or exercised. Raw proposals, reviewer reason/prose, prompt bytes, and provider response/body bytes were not retained and remain unknown.

The final projection remained ready and still displayed the preceding proper scene; it did not create a new action-21 proper-scene/binding. Final authoritative counts were completed turns 21 (including Opening), unique player-action bindings 20, commands/receipts 65/65, proper scenes 21 (Opening plus actions 1-20), Narrator operations/attempts 21/23, model stages 44, actor jobs 15, worldVersion 38, runtimeRevision 390, `integrity_check=ok`, and `foreign_key_check=[]`. No same-page reload was performed because the lane hard-stopped at this first genuine model-stage defect.

Live Task 182 recovery coverage is unavailable: r131 attempt 1 had no rejection artifact, and attempt 2 used the unchanged base prompt rather than the Task 182 coordinate-specific paragraph. The retained Reviewer coordinates are preserved above, but no live claim is made about Task 182's paragraph.

## Cleanup and acceptance handoff

The owned backend root PID 4068, frontend launcher 72824 and Next child 70968, Chrome/CDP root 8016 and recorded descendants 50220, 76700, 52548, 29472, 76760, 49224, 53948, 62028, and 63856 were stopped after the page was closed. Ports 4170/4171/4172 had no listeners, CDP `http://127.0.0.1:4172` was absent, the r131 browser profile was removed, and the task-owned journey helper was removed; `probes/ownership-final.json` records the independent absence checks. Generated session/run evidence remains uncommitted. The protected AGENTS.md and CLAUDE.md changes remained untouched and unstaged.

This satisfies the static contract and proves a positive built setup plus 20 settled actions, bounded recovery entry, one-settlement fencing, and clean persistence. It does not satisfy the overall 60-action/reload objective because the first genuine Actor Replanner defect froze r131. The remaining decision is Main's next bounded repair for the frozen action-21 second-attempt `model_contract_invalid` after the safe grounding coordinates; Task 182 selects no further repair.
