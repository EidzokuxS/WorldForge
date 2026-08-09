# Task 188: Actor Replanner grounding-review field coordinates

## Contract and boundary

Task 188 adds one safe coordinate to the existing Actor Replanner Grounding Reviewer rejection path. Every rejected Reviewer violation now carries the bounded `fieldPath` enum (`intent.kind`, `intent.targetHandles`, `intent.method`, `intent.stakes`, `observableTrace`, `possessionOutcome`, `obligationOutcome`, or `elapsedBounds`). Existing `reviewViolations` remains the ordered `stepIndex:kind` coordinate. The new ordered `reviewViolationFields` coordinate is carried only in the in-memory rejection artifact, the existing recovery feedback, and the private `actor_replan.rejected` diagnostic. No raw proposal, method, stakes, trace, handles, provider response, or other prose is included or persisted. Plan acceptance, Reviewer authority, retry count, identity, deadline, mechanics, persistence, and UI are unchanged.

The actor and surface are the Campaign Play runtime and its autonomous Actor Replanner. The trigger is a generated plan rejected by the existing Grounding Reviewer; the observable recovery is a second attempt with the same job, frame, world, and deadline and with only the safe coordinates. A second invalid result remains terminal. No schema migration, new retry, provider/model change, or compiler relaxation is in scope.

## Impact review and authorization

At the exact entry commit `d83b325b6546906ae42e504be4a8b79a733cf1f2`, a task-owned fresh GitNexus shadow index was built at `R:\Temp\WorldForge-task188-shadow-d83` (14,851 nodes, 42,565 edges, 882 flows). Current upstream impact was:

- `campaignPlayActorPlanGroundingReviewSchema`: HIGH, 14 impacted, 4 direct callers, 4 processes/modules.
- `createCampaignPlayActorReplanner`: HIGH, 22 impacted, 6 direct callers, 3 Campaign Play processes/modules.
- `buildCampaignPlayActorReplanRecoveryPrompt`: LOW, 2 impacted.
- `buildCampaignPlayActorPlanGroundingReviewPrompt`: LOW, 3 impacted.

Main explicitly authorized the disclosed HIGH transitive fan-out for the schema and the smallest internal replanner edits only. The direct production consumer is `actor-replanner.ts`; route/body/tick/reflection references are transitive Campaign Play consumers. No CRITICAL edited target, exported factory signature, turn-runtime, route, shared engine, persistence, or other production owner was changed.

## Exact implementation

`backend/src/campaign-play/actor-replan-prompts.ts` makes `fieldPath` required in the existing strict Reviewer schema, adds the exact Reviewer sentence:

> Each rejected violation must include fieldPath, naming the single proposal field that most directly contains the violation: intent.kind, intent.targetHandles, intent.method, intent.stakes, observableTrace, possessionOutcome, obligationOutcome, or elapsedBounds. Do not quote or copy field contents.

The existing recovery feedback object now includes `reviewViolationFields`, and the exact recovery sentence is:

> reviewViolationFields pairs each flagged step index with the single proposal field reported by the Reviewer. Rewrite that field, plus only the directly dependent fields needed to keep the step internally consistent; do not copy rejected prose.

`backend/src/campaign-play/actor-replanner.ts` carries the same closed enum into the in-memory artifact and derives the ordered `stepIndex:fieldPath` string alongside the unchanged `stepIndex:kind` string. No persistence shape or acceptance path changed.

Semantic review verdict: prompt-craft found both literals outcome-specific and limited to the missing coordinate; humanizer and deslop found no filler or clearer rewrite that preserves the enum and privacy boundary. The literals are retained exactly.

## Static validation

Entry protected files remained byte-for-byte unchanged from the pre-existing dirty state and unstaged. Focused prompt and Actor Replanner suites passed (32 tests: 16 prompt, 16 replanner). The full Campaign Play turn-runtime suite passed 72/72, Campaign Play application passed 15/15, and the Campaign Play route integration suite passed 1/1. Backend typecheck and build passed. `git diff --check` passed. The final staged detect-changes review is recorded with the implementation commit below.

Focused tests cover all enum values, missing/unknown field rejection, accepted/rejected Reviewer shapes, ordered `reviewViolations` and `reviewViolationFields`, exact prompt literals, safe-coordinate privacy, same-identity recovery, one settlement, and no third attempt/duplicate mechanics. Existing no-artifact, coordinate, timeout, CAS, lease, and fencing tests remain green.

## Implementation and rendered evidence

Implementation commit: `a57e9079cb0b47e21b192eac78fb7f7ed831a2fd`, pushed to `origin/feat/revamp`; local HEAD equals origin. The staged detect-changes review reported 5 files, 17 symbols, one affected Campaign Play flow, and medium aggregate risk. The authorized HIGH schema/replanner transitive impact remained confined to the Actor Replanner/Grounding Reviewer path; no CRITICAL edited target, exported factory signature, route, turn-runtime, persistence, or non-Campaign-Play owner was changed.

Fresh lane: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r136`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, ports 4220/4221/4222. The materialized template state, config, and canonical card were verified against state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, and card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`. The card file readback hash was `4B48DE7A32DF6A6BE5A91AB12F09BB87926B40D5940348C7581E298EAA12B60A`.

The rendered Character page reached the canonical import surface. Import was activated once and the canonical card was assigned once through the file chooser. Backend ingestion completed successfully for Brina Hael: the bounded log records `ingestCharacterDraft: starting` at `14:17:01.071`, two successful `llm.attempt` events (native_json; latencies 14,575 ms and 2,834 ms), and `ingestCharacterDraft: complete` at `14:17:18.486`. No Save, Begin, Opening, or player action occurred.

After ingestion the browser remained busy without rendering the draft. A read-only reconciliation reload was performed; this reset the frontend's in-memory draft state because the Character page's `handleCard` stores the draft locally and `handleSave` consumes it for the save request. Repeating import or synthesizing a draft would violate the one-import/no-mutation lane contract, so r136 was frozen at setup as an environment/UI-state blocker, not classified as a product semantic defect. The authoritative API state remained `phase=character_required`, `character=null`, `activeTurn=null`, and empty opening options.

The read-only SQLite snapshot at `...r136...\state.db` had `integrity_check=ok`, an empty `foreign_key_check`, one campaign state row, and zero campaign-play character, command, model-stage, actor-job, replan-attempt, turn, result, receipt, narration, operation, attempt, proper-scene, or binding rows. The backend log hash after capture was `3EDAE28CEE21BB22206205D493D0094EE2ABA4CB272CCD336A8600A21FFB42C2`; the database hash was `9D33937EA5DC2AF52BC1BBBB79E4B0C7CB40B7B6D88EC6F5364BD719E9DA0DBE`. No action checkpoints, natural field-coordinate recovery, or 60-action/reload evidence exist because setup did not reach Save.

Cleanup completed after evidence capture: the task-owned browser tab was closed; backend/frontend task-owned process trees were stopped; ports 4220, 4221, and 4222 had no listeners; recorded task-owned PIDs were absent; the task browser profile, launch helpers, and exact-entry GitNexus shadow were removed. Session/run evidence remains under the r136 roots. AGENTS.md and CLAUDE.md remain untouched and unstaged.

## Acceptance handoff

- Source: the Reviewer schema, prompt sentence, in-memory artifact, and recovery/diagnostic coordinate mapping above.
- Static: prompt/replanner 32/32, turn-runtime 72/72, application 15/15, route integration 1/1, typecheck/build/diff-check; detect-changes result and commit to be appended.
- Built product: r136 froze before Save/Begin at the setup blocker above, so no player-action or natural `fieldPath` recovery claim is made. The static suites remain the available recovery proof.
- Persistence: read-only `integrity_check=ok`, empty `foreign_key_check`, and zero player-action settlement rows were observed at the boundary; no duplicate settlement was possible.
- Cleanup: task-owned processes, listeners, page/profile, helpers, and GitNexus shadow were independently verified absent as recorded above.

Unknowns after the lane: provider response bodies/candidate bytes and the cause of the frontend draft-loss/busy state are not retained; no Grounding Reviewer field-coordinate request occurred, and the 60-action endurance/reload criteria remain unavailable.
