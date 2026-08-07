# Task 154 - Actor Replanner recovery reviewer bypass

## Outcome

Keep the one semantic recovery proposal on the existing default-reasoning model, but run its narrow grounding review with the existing bypass model. Both models retain the same provider, model id, strict schema, frame, job, attempt identity, and shared absolute 90-second deadline.

## Evidence

Fresh r94 action 35 completed Game Master mechanics, then Actor Replanner attempt 1 returned in 9,565 ms and was rejected during compilation with `route_not_traversable_from_step_location`. Attempt 2 used the safe recovery feedback and returned a tool-mode proposal in 62,379 ms, but its grounding review inherited the default-reasoning model and was aborted after the remaining 18,037 ms. The job interrupted with `stage_timeout`; no narration or proper scene was accepted.

The implementation now passes models independently to the existing attempt runner: attempt 1 uses bypass for proposal and review; attempt 2 uses default reasoning only for the repaired proposal and bypass for review. The compiler, grounding schema and verdict, retry eligibility, persisted identities, one-retry limit, AbortSignal, acceptance CAS, mechanics, prompts, and player-visible copy are unchanged.

## Acceptance contract

- A valid first proposal still produces one bypass proposal call, one bypass review call, and one settlement.
- An eligible contract failure still creates exactly one recovery attempt.
- Recovery uses the default-reasoning model for the proposal and the bypass model for the grounding review.
- The same absolute deadline and abort signal cover every call; timeout and late-result fencing remain unchanged.
- A rejected recovery remains a truthful terminal failure with no third attempt or duplicate plan/world write.

## Validation

- `npm test -- --run --no-file-parallelism --maxWorkers=1 src/campaign-play/actor-replanner.test.ts`: 14/14 passed.
- `campaign-play-application.test.ts`: 13/13 passed.
- Targeted Actor Replanner runtime cases: 6/6 passed (60 unrelated cases skipped).
- The combined runtime/application invocation reported 79/79 passing assertions but twice exited red on Vitest worker RPC `onTaskUpdate` timeout; isolated directly affected suites passed, classifying this as a runner verification defect.
- Backend typecheck and build passed.
- GitNexus upstream impact for `createCampaignPlayActorReplanner`: HIGH, 9 impacted symbols, 1 direct caller, 3 affected processes. The index was 10 commits stale; the current source path was checked directly.
- Prompt/model instructions and visible copy were not changed, so humanizer/deslop review is not applicable.

## Product acceptance

Pending a fresh pristine lane. r94 remains frozen at action 35 and must not be resumed, retried, or mutated.
