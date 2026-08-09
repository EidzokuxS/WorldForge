# Task 186: Actor Replanner target-outside recovery schema

## Contract

When Actor Replanner attempt 1 produces a safe compilation rejection with `phase="compilation"` and `reason="target_outside_step_location"`, the existing bounded attempt 2 keeps the coordinate-specific `SAFE_REJECTION_FEEDBACK` prompt but uses the existing Task 185 generation-recovery locality schema. That schema permits exactly one grounded step, allows non-move location targets only at the actor's current occupied location, and permits a move only to exactly one non-current frame location without a route handle. Every other non-null rejection artifact continues to use the ordinary proposal schema. The no-artifact branch remains unchanged: it uses the same locality schema and its generation-recovery prompt.

The exact added recovery rule is:

> When reason is target_outside_step_location, regenerate with exactly one grounded step. For a non-move step, every location target must be the actor's current occupied location; never target another location. For a move step, target exactly one directly reachable destination location and no route handle.

No compiler or Reviewer relaxation, deterministic rewrite, third attempt, provider/model/mode/reasoning/deadline/identity/CAS/fencing/mechanics/persistence/UI/copy change is authorized.

## Entry and corrected r133 boundary

Entry was `6b0791d3dc31fae387deca0469f1388db6bf997d` on `feat/revamp`, equal to origin. Pre-existing unstaged `AGENTS.md` and `CLAUDE.md` were preserved byte-for-byte. Task 185 implementation `86c71c58bb36989e465b2500cfdfd6990c729d89` remains the accepted base. Frozen r133 is immutable.

The authoritative r133 boundary was action 10: turn `turn-player-action:8a1ed661cc8b8dc60b91cb28eb0b0c07e0512163`, job `actor-job:0000:88c2c506a2a78a8718df2ec1`, stage `actor-replan-stage:c4928a876180d356bd7a27e3d3513a55`, attempts `actor-replan-attempt:e48639bffe6cfaa1339efdd660fc45d2` and `actor-replan-attempt:493db2014c74375fbc5013711dce3ffe`. Attempt 1's proposer returned successfully and compilePlan rejected `target_outside_step_location` (stepCount 1, no moveTargets/reviewViolations). The Actor Replanner created an in-memory compilation rejection artifact although the persisted model-stage `artifact_json` was null. Attempt 2 consequently used the existing coordinate-specific recovery prompt with safe feedback and the ordinary proposal schema; it repeated the same compilation rejection before Grounding Reviewer. Task 185's no-artifact prompt/schema was not used in r133. Raw proposals and the rejected handle remain unavailable. This corrects the inaccurate r133 statements in Task 185's note without changing its other evidence.

## Impact and review

A task-owned fresh shadow at the exact entry was analyzed outside the live checkout. `buildCampaignPlayActorReplanRecoveryPrompt` had LOW upstream impact (two direct callers, no indexed processes). The edited nested `createCampaignPlayActorReplanner.replan` owner had LOW impact (zero indexed upstream callers/processes). The exported `createCampaignPlayActorReplanner` factory returned HIGH impact (22 impacted symbols, six direct callers and three flows), but it was not edited. The new schema helper was absent from the index; source review established it is the existing Task 185 helper and no new caller surface. No actual edited target was HIGH or CRITICAL and no additional production file was required.

Main's fixed semantic review is recorded: prompt-craft found the rule outcome-specific and minimal; humanizer and deslop found no filler or clearer rewrite that preserves all constraints. The exact literal above is retained unchanged. No player-visible prose changed.

## Implementation and validation

`actor-replan-prompts.ts` adds only the approved recovery sentence. `actor-replanner.ts` computes a local `useGenerationRecoverySchema` flag for an undefined artifact or the exact compilation/target-outside pair. Prompt selection remains distinct: undefined artifacts use `buildCampaignPlayActorReplanGenerationRecoveryPrompt`; all non-null artifacts use the existing coordinate recovery prompt. The existing locality schema is reused unchanged. No generation settings, reviewer path, persistence, identity, deadline, retry count, or fencing code changed.

Focused tests cover the exact prompt/feedback ordering and privacy, ordinary first-attempt schema, locality schema selection for target-outside recovery, provider-facing JSON-schema exclusion of remote location handles in non-move branches, rejection of a remote one-step proposal, acceptance of a current-location one-step proposal, same model/mode routing, same frame/base-world/deadline, one accepted plan, and two-attempt fencing. Existing no-artifact, route, grounding-review, other compilation, timeout, second-invalid, CAS, and no-late-write tests remain in the Actor Replanner suite.

Static validation passed before the implementation commit. `npm --prefix backend run test -- --run src/campaign-play/actor-replan-prompts.test.ts src/campaign-play/actor-replanner.test.ts` passed 2 files and 32 tests (16/16 in each file). `npm --prefix backend run test -- --run src/campaign-play/campaign-play-application.test.ts` passed 1 file and 15 tests. `npm --prefix backend run test -- --run src/campaign-play/turn-runtime.test.ts` passed all 72 tests but the Vitest worker exited non-zero with the known post-test `[vitest-worker]: Timeout calling "onTaskUpdate"` unhandled error; the deterministic rerun `npm --prefix backend run test -- --run src/campaign-play/turn-runtime.test.ts --pool=threads --poolOptions.threads.singleThread=true` passed 1 file and 72 tests with exit 0. `npm --prefix backend run typecheck`, `npm --prefix backend run build`, and `git diff --check` passed. Staged paths are exactly the four Actor Replanner source/test files and the Task 185/186 notes. Staged GitNexus `detect_changes --scope staged --repo WorldForge` reports 6 files, one changed symbol (`replan`), zero affected processes, and low risk.

## r134 journey

The fresh lane `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r134` will use campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, the canonical pristine template/config/card hashes, and ports 4200/4201/4202. It will materialize once, import/save/configure/begin once, reconcile authoritative state before each rendered click, hard-stop at the first genuine defect, and preserve generated evidence uncommitted. If target-outside recovery occurs naturally, only retained safe schema/prompt/identity/deadline evidence will be claimed; no failure will be manufactured. Checkpoint and reload evidence will be appended after the lane boundary.

## Acceptance handoff

Static evidence maps the target-outside compilation artifact to the existing strict locality schema while preserving the coordinate prompt, all other recovery branches, two-attempt identity, reviewer/mechanics/persistence fences, and no third attempt. The corrected Task 185 r133 record distinguishes in-memory rejection artifacts from persisted artifact JSON. Live r134 evidence, cleanup, integrity/FK checks, and any omitted 60/reload criteria will be appended truthfully after execution.
