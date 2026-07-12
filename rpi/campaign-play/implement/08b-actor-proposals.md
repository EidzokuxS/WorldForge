# Task 8B: sequential actor proposals and bounded replanning

Date: 2026-07-11
Status: complete; focused integration and independent verification passed.

## Outcome

The actor proposal service processes the frozen due set serially. Each queued job is claimed, receives a frame from the latest committed mechanical version, persists one pending proposal, passes Rulebook preflight, commits immediately, and settles before the next actor frame is built. Actor settlement advances mechanical versions through actual mutations and preserves the shared world clock.

Proposal rows retain their base version, read/write scopes, expiry, causal parent, and terminal result. The database insert guard requires the proposal base to equal the campaign's current world version and to cover the job's frozen version. Detached stale work rejects before Rulebook execution, mutates no proposed mechanic, terminalizes its job and proposal, adds one agency debt, and schedules one future retry.

Completed, inactive, and precondition-invalid plans cross an explicit replan boundary. The replanner makes one strict structured-output attempt with repair, text fallback, and provider switching disabled. The model receives actor-scoped facts through opaque handles. Code resolves those handles and owns canonical identifiers, plan versions, steps, preconditions, schedules, command scopes, and settlement. The accepted artifact transaction fences the exact claimed job epoch and model-stage epoch; a late result becomes an interrupted stage and creates no plan.

## Acceptance evidence

- Three due actors settle in deterministic order. Actor B moves first; actors D and A then propose against the newly committed versions rather than their frozen admission version.
- Actor settlement leaves `worldTimeMinutes` unchanged. Cadence advances only the actor schedule.
- A version advance injected after pending proposal persistence rejects actor B's detached work, leaves its placement unchanged, records one debt, and schedules exactly one retry at settled clock plus 30 minutes.
- The production opening compiler derives a non-local `local_aftermath` exposure at directed distance two. Actor settlement persists that exact protected predicate. The fixture contains zero observations and zero actor-knowledge rows, so settlement performs no global disclosure.
- An exhausted plan invokes the replanner exactly once, passes `retries: 1` to the local wrapper where that value is the total `maxAttempts`, accepts one epoch-1 artifact, installs plan version 2, repoints the schedule, and defers the consumed old-plan job.
- A concurrent external defer changes the job epoch while the model call is in flight. The late artifact records `worker_lease_lost`, creates no plan version 2, and cannot repoint the schedule.
- Prompt-schema tests cover instruction-like world content, strict unknown-field rejection, handle uniqueness and bounds, and all three typed replan reasons.

## Campaign fixture depth

The integration fixture constructs a real migrated campaign database, accepted world snapshot, player CharacterRecord handoff, production-compiled opening artifact, the artifact's exact Rulebook bootstrap commands/receipts/events/pressures, ready play state, actor plans and schedules, and admitted due jobs. It then executes the complete Task 8B backend actor cycle.

Completed player actions in this fixture: `0`. Player-facing multi-action playability belongs to Tasks 10C, 11, 16B, 17, and 18. This task proves the backend actor-cycle contract at opening turn zero.

## Verification

```text
npm --prefix backend test -- src/campaign-play/actor-proposal-service.test.ts src/campaign-play/actor-replan-prompts.test.ts src/campaign-play/actor-scheduler.test.ts src/campaign-play/rulebook.test.ts src/campaign-play/campaign-play-database.test.ts
5 files, 57 tests passed

npm --prefix backend run typecheck
passed

git diff --check
passed with existing line-ending warnings
```

Standalone smoke additions: `0`.

The independent mechanical review reproduced 43 focused tests and typecheck. It raised a retry-semantics concern; source inspection proved `safeGenerateObject` assigns `opts.retries` directly to `maxAttempts`, and the integration test now asserts the supplied value is exactly one. Its migration-0030 observation concerns the earlier recovery migration's documented accepted-row precondition and does not alter Task 8B actor-cycle behavior.

Fresh Sol semantic review initially rejected the handwritten exposure bound as self-confirming. The fixture now compiles the opening artifact from the accepted world, stores that artifact, executes its exact bootstrap commands, and supplies its compiler-derived exposure seed to actor settlement. Follow-up verdict: `PASS`, with no remaining P0/P1 Task 8B gap. Executable predicate evaluation remains owned by Task 9.

## Prompt review

Droid GLM-5.2 returned `ACCEPT WITH CHANGES`. The production prompt now explains the replan reason, failed preconditions, clock, cadence, priority, and prior-plan role; requires an active goal; deduplicates targets; uses `world_event`; describes ordered steps and nullable method/stakes; and forbids facts, state, identifiers, or handles absent from the actor frame.

Review request: `rpi/campaign-play/implement/08b-actor-replan-prompt-review-request.md`.
Durable logs: `rpi/campaign-play/implement/agent-logs/08b-replan-prompt-glm-20260711-161538.out.log` and `.err.log`.

The final production prompt and this evidence use direct technical wording under the local `humanizer` and `deslop` review criteria; no prose rewrite was required after the contract changes.

## Change-scope proof

GitNexus impact checks for the new proposal, prompt, replanner, and index-export symbols returned `Target not found` because these untracked Task 8B symbols are outside the current index. `gitnexus_detect_changes(scope: all)` ran against the whole inherited dirty worktree and reported aggregate critical impact across earlier campaign/world/UI work; the focused Task 8B files remain isolated to Campaign Play actor processing, tests, exports, migration guard, and this evidence.

## Scope boundary

Task 8B owns proposal persistence, serial Rulebook settlement, stale-work rescheduling, and bounded replanning. Task 9 turns protected exposures into earned actor knowledge and player-public projection. Tasks 10 and 11 connect the cycle to complete turn orchestration and delivery. Tasks 17 and 18 own real multi-action and 60-turn campaign playtests.
