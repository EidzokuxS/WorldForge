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

Implementation commit: to be recorded after the bounded source/test/note commit.

Fresh lane: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r136`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, ports 4220/4221/4222. Canonical hashes: template state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Rendered and authoritative SQLite/log evidence, checkpoint counts, any natural Grounding Reviewer recovery, terminal boundary (or 60/60 plus reload), and independently verified cleanup are to be appended after the one fresh lane. Generated session/run evidence remains uncommitted.

## Acceptance handoff

- Source: the Reviewer schema, prompt sentence, in-memory artifact, and recovery/diagnostic coordinate mapping above.
- Static: prompt/replanner 32/32, turn-runtime 72/72, application 15/15, route integration 1/1, typecheck/build/diff-check; detect-changes result and commit to be appended.
- Built product: r136 must either reach 60 unique proper-scene bindings plus one same-page reload or freeze at its first genuine defect. A natural `fieldPath` recovery is live evidence only if it occurs; otherwise focused tests are the available recovery proof.
- Persistence: read-only `integrity_check=ok`, empty `foreign_key_check`, and no duplicate settlement are required at the lane boundary.
- Cleanup: task-owned processes, listeners, page/profile, helpers, and GitNexus shadow must be independently absent; exact evidence is appended after the lane.

Unknowns before the lane: whether r136 naturally exercises a Grounding Reviewer rejection with a field coordinate, and whether the endurance journey reaches 60 actions without an unrelated first defect.
