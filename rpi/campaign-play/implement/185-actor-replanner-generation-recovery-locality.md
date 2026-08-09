# Task 185: Actor Replanner generation-recovery locality

## Contract

When Actor Replanner attempt 1 is contract-invalid before a usable proposal or safe rejection artifact exists, the existing bounded attempt 2 uses a generation-only proposal schema that is stricter for the exact recovery branch. It produces exactly one grounded step. A non-move step may target only the planning actor's current occupied location (while retaining non-location frame handles); a move step must target exactly one non-current frame location and cannot target a route handle. If no non-current location exists, the move branch is omitted. The normal first attempt and coordinate-specific recovery retain the existing frame schema.

The no-artifact recovery paragraph is the following Main-approved literal:

> The first attempt did not produce a usable proposal, so no rejected proposal or reviewer feedback is available. Generate one fresh proposal from ACTOR_FRAME with exactly one grounded step performed only by ACTOR_FRAME.actorHandle. For a non-move step, every location target must be the actor's current occupied location; never target another location. For a move step, target exactly one directly reachable destination location and no route handle. Another actor may remain only as the target of contact or observation. Do not include any method, stakes, or observableTrace that states or requires another actor to respond, consent, assist, work, move, accept, pay, or complete anything. observableTrace must show only the planning actor's own attempt or a physical trace directly caused by that method; do not assert a requested, visible, or possible outcome. Satisfy every unchanged schema, compiler, and grounding-review rule.

No compiler relaxation, post-generation rewrite, third attempt, provider/model/mode/reasoning/deadline/identity/CAS/fencing/reviewer/mechanics/persistence/UI/copy change is authorized.

## Entry and fixed boundary

The entry checkout is `d0fcb7b2d31d8be041854615815e937878605438` on `feat/revamp`, equal to origin. The pre-existing unstaged `AGENTS.md` and `CLAUDE.md` changes are preserved byte-for-byte. Frozen r132 remains immutable.

The authoritative r132 boundary is action 10. Attempt 1 returned from native JSON but failed generation contract validation at `steps[0].intent.targetHandles[0]` with an invalid frame-handle enum value. No rejection artifact or Grounding Reviewer call existed. Attempt 2 therefore used the Task 184 no-artifact recovery prompt and its ordinary proposal schema; the proposer returned in tool mode, then compilation rejected `target_outside_step_location` with `stepCount=2` and `moveTargets=1:location:13a669cec0b6c7c436de`. Raw handles, proposals, prompts, and provider bodies were not retained. No attempt 3 or later action occurred.

## Impact and review

A task-owned exact-entry GitNexus shadow was analyzed without writing the live instruction files. The nested `createCampaignPlayActorReplanner.replan` owner is LOW upstream risk (zero direct callers/processes in the index). `campaignPlayActorReplanProposalSchemaForFrame` and `buildCampaignPlayActorReplanGenerationRecoveryPrompt` are LOW with one direct nested caller each. The new generation schema helper has no indexed callers. The exported `createCampaignPlayActorReplanner` factory is HIGH, but it was not edited; the change is confined to its nested `replan` implementation. No actual edited target returned HIGH or CRITICAL and no additional production file was required.

Prompt review is fixed by Main: prompt-craft found the literal operational and recovery-scoped; humanizer and deslop found no clearer rewrite that would preserve the constraints. The exact literal above is retained unchanged. No player-visible prose changed.

## Implementation and validation

The production delta is limited to `actor-replan-prompts.ts` and `actor-replanner.ts`. Shared frame-handle and intent construction is reused for the existing schema. The new helper creates one-step recovery proposals with a discriminated intent union: non-move kinds use occupied-location/non-location targets, and move exists only when a non-current location destination exists, with exactly one destination target. The existing proposal schema remains used for attempt 1 and any coordinate-specific rejection-artifact recovery. `runAttempt` receives the selected schema without changing generation settings or persistence behavior.

Focused validation passed: `actor-replan-prompts.test.ts` 15/15 and `actor-replanner.test.ts` 15/15. The prompt tests exercise safeParse and provider JSON-Schema restrictions for one step, current/non-current locations, route and foreign handles, move cardinality, and omitted move when no destination exists. The Actor Replanner tests prove the first attempt uses the existing schema, the no-artifact attempt 2 receives the new schema and exact recovery text, coordinate recovery retains the existing schema, and the same bounded identity/fencing/reviewer path remains intact. The full `turn-runtime.test.ts` suite passed 72/72 and `campaign-play-application.test.ts` passed 15/15. Backend `typecheck` and `build` both passed, and `git diff --check` passed. GitNexus `detect_changes`, exact staged paths, implementation commit/push, and r133 rendered evidence will be appended after those checks and the lane boundary. Generated r133 evidence will remain uncommitted.

## r133 journey

Pending the one fresh built lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r133` for campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, using ports 4190/4191/4192 and the canonical template/config/card hashes. The lane will stop at its first authoritative product/model/persistence defect; no Task 185 recovery will be manufactured. A 60-action run must be followed by one same-page reload before the endurance objective can be marked complete.

## Pre-journey acceptance handoff

Static acceptance must prove generation-schema locality, provider JSON-Schema restrictions, exact recovery prompt, preserved normal/coordinate paths, shared identity/deadline, no attempt 3, and unchanged reviewer/mechanics/persistence fences. Live acceptance is unavailable until r133; if the no-artifact recovery does not occur naturally, no live acceptance claim will be made for that branch.
