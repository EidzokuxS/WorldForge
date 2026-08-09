# Task 184: Actor Replanner generation recovery

## Contract

When Actor Replanner attempt 1 is contract-invalid before a usable proposal or safe rejection artifact exists, the existing bounded attempt 2 receives one explicit recovery-only instruction. The instruction states that no rejected proposal or Reviewer feedback is available, generates from the unchanged `ACTOR_FRAME`, prefers one grounded action performed only by the planning actor, and forbids unestablished participation or outcomes by other actors. The existing coordinate-specific recovery path remains unchanged when a rejection artifact exists.

The exact generation-recovery paragraph is:

> The first attempt did not produce a usable proposal, so no rejected proposal or reviewer feedback is available. Generate one fresh proposal from ACTOR_FRAME. Prefer one grounded step performed only by ACTOR_FRAME.actorHandle. Another actor may remain only as the target of contact or observation. Do not include any method, stakes, or observableTrace that states or requires another actor to respond, consent, assist, work, move, accept, pay, or complete anything. observableTrace must show only the planning actor's own attempt or a physical trace directly caused by that method; do not assert a requested, visible, or possible outcome. Satisfy every unchanged schema, compiler, and grounding-review rule.

No model, mode, deadline, escalation, Reviewer, mechanics, persistence, retry-count, or player-visible behavior changes.

## Impact and semantic review

Entry was `1a06944bfa53537587a2edc4ce5e8f93b65d453c` on `feat/revamp`, equal to origin. A task-owned fresh shadow was materialized at that commit. The GitNexus CLI's index-only runner refreshed the live current-source index instead of indexing the shadow; the shadow and its temporary registry entry were removed and verified absent. The current live index is up to date at the entry commit.

The nested `createCampaignPlayActorReplanner.replan` target was resolved by UID with exact LOW upstream impact (zero direct callers/processes/modules in the index). The prompt owner `actor-replan-prompts.ts` had LOW file impact (3 direct, 11 total indexed dependants); `actor-replanner.ts` had MEDIUM file impact (5 direct, 16 total). The new helper has no pre-edit callers. The indexed target-name lookups for nested helpers were absent, so the source-qualified owner and exact nested UID were used. No HIGH or CRITICAL edited target was found; the exported error/class APIs remain untouched.

Semantic review verdicts fixed by Main: prompt-craft is a branch-specific recovery text that states the absence of coordinates and does not fabricate feedback; humanizer finds direct technical wording appropriate and retains the literal unchanged; deslop finds no filler or repeated process narration beyond the actor-ownership boundary. No product-visible prose changed.

## Implementation and validation

The production delta is limited to `buildCampaignPlayActorReplanGenerationRecoveryPrompt` and the existing undefined-`rejectionArtifact` attempt-2 selector. The coordinate-specific `buildCampaignPlayActorReplanRecoveryPrompt` branch is unchanged. Focused tests prove the base prompt has no recovery block, the no-artifact prompt contains the exact paragraph once and no `SAFE_REJECTION_FEEDBACK`/raw error text, and the existing schema-invalid recovery keeps the same models, modes, job/frame/base-world/deadline identity, one accepted plan, and no duplicate settlement. A thrown `SafeGenerateError` instance is not constructible through the existing Actor Replanner test injection because the class is intentionally private; the production classifier remains covered by the existing safe-generation suite, while the no-artifact schema-invalid branch is directly exercised here.

## r132 journey

Pending the one fresh built lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r132` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`. Required template/config/card hashes, setup, checkpoints, first genuine defect or 60/reload boundary, authoritative logs/SQLite, and exact cleanup will be appended after the lane boundary. Generated evidence remains uncommitted.

## Pre-journey acceptance handoff

The source/test contract covers the no-artifact branch and preserves coordinate-specific recovery, bounded attempts, identity, and fencing. Live evidence is intentionally unavailable until r132; if no natural no-artifact Actor Replanner failure occurs, no live acceptance claim will be made for that branch.

## r132 journey and acceptance evidence

The implementation commit `f05dce2bb55a4eabe65dc0e91cfd36ea8dd605f9` was pushed before the lane. The fresh lane was `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r132` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, using ports 4180/4181/4182 and the task-owned browser profile under the r132 session root. The template state SHA-256 was `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config SHA-256 was `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and canonical Brina card SHA-256 was `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Rendered setup completed exactly once: one card import and parse request (HTTP 200), one Save/Continue, lower-wards / Local / Already here / Looking for work, and one Begin. Opening reached a ready proper scene. Actions 1-9 each settled with one unique proper-scene binding. Narrator automatic recovery occurred on actions 6 and 8 and settled each action; no duplicate mechanics was observed.

Action 10 was the first genuine defect and was hard-stopped without action 11. The rendered choice was `Talk to Dren Vask: ask about the fish-stall window`; turn `turn-player-action:634580efd027ec1bfbe68a09e8f2ac333e633c89`; Actor job `actor-job:0000:e2fd792b666489babae3990f`; stage `actor-replan-stage:0a9a5e4dea49593b0da5d3dabe42b73f`; attempts `actor-replan-attempt:8335d6a1a37a2bdc0796a128fce53056` and `actor-replan-attempt:54a3459ad137f414c3db49ef41f98768`. Both persisted model-stage rows were `model_contract_invalid`, `schema_outcome=invalid`, and `artifact_json=null`: attempt 1 had `finish_reason=stop`, 9,835 ms, 4,405 input / 338 output tokens; attempt 2 had `finish_reason=tool-calls`, 35,277 ms, 6,556 input / 4,427 output tokens. Both used requested/actual `zai-coding-plan` / `glm-5-turbo` / `strict_object` and retained the same frame hash, frozen base world version 21, and deadline. The actor job ended `deferred` with `defer_reason=replan_invalid`, no plan/proposal, and no attempt 3. The player turn and Narrator operation completed once with a proper scene and two receipts, but the actor job did not produce a plan, so the lane ended at 10 completed player turns and 9 unique actor-bound actions. Raw prompt, proposal, provider response, and exact invalid invariant were not retained; no cause is inferred from `finish_reason` alone. The absence of a rejection artifact selects the new source branch by runtime state, but the recovery prompt bytes are not directly retained, so live prompt-content coverage remains unavailable.

The r132 checkpoint at action 10 recorded `completed=10`, `bound=9`, `worldVersion=21`, `runtimeRevision=211`, with `integrity_check=ok` and an empty `foreign_key_check`. No 20/30/40/50/60 checkpoint or same-page reload was possible after the first genuine Actor Replanner defect. No natural Task 182 coordinate-specific recovery occurred in this lane.

Static validation was completed before the lane: Actor Replanner/prompt tests 29/29, turn-runtime 72/72, Campaign Play application 15/15, safe-generation 36/36, backend typecheck, backend build, and `git diff --check` passed. Implementation staged GitNexus `detect_changes` reported six owned files, three symbols, zero processes, and low risk. The implementation note was then updated only with this evidence; the note-only diff was checked and pushed separately. Generated r132 session/run evidence remains uncommitted.

Cleanup was independently verified after evidence capture: the task-owned Play target was closed through CDP, all recorded backend/frontend/Chrome roots and descendants were absent, ports 4180/4181/4182 had no listeners, the CDP endpoint was absent, and the r132 browser profile was removed. The r132 session/run evidence roots and frozen prior lanes were preserved. AGENTS.md and CLAUDE.md remained byte-identical and unstaged.

## Post-journey acceptance handoff

The source and focused tests prove the exact no-artifact recovery paragraph, its absence from attempt 1, its exclusion of `SAFE_REJECTION_FEEDBACK` and raw failure text, preserved coordinate-specific recovery, unchanged model/mode/deadline/identity, one automatic resume, and no attempt 3. The built lane proves canonical setup, Opening, nine positive actor-bound actions, bounded Narrator recoveries, read-only SQLite integrity/FK, and the first genuine Actor Replanner terminal boundary. It does not prove an accepted no-artifact recovery, 60/60, or reload because action 10 froze on `model_contract_invalid` after both Actor Replanner attempts. The exact invalid schema/reviewer coordinate and provider/proposal bytes remain unknown.
