# Task 194 - Actor Replanner route traversability recovery

## Contract

The frozen r141 action-5 boundary showed a first Actor Replanner proposal rejected at compilation with `route_not_traversable_from_step_location`, followed by an ordinary-schema recovery proposal rejected at the same coordinate before Grounding Reviewer. This bounded change selects the existing Task 185 one-step locality generation schema only for a non-null compilation rejection artifact with that exact reason. The existing no-artifact, target-outside, other compilation, Grounding Reviewer, timeout, fencing, and terminal branches remain unchanged. The recovery prompt adds one route-specific instruction only for this reason:

> For a move step, omit route targets and choose exactly one non-current destination location that has exactly one open route from the actor's current location in ACTOR_REPLAN_FRAME.

No compiler, route authority, Reviewer, provider/model/mode, deadline, retry, identity, mechanics, persistence, UI, or player-copy behavior changes.

## Impact and implementation

Entry branch and origin were `cd0cc12962a4f4e5a74713ec3762a8e3309eff47`. Current-source GitNexus nested-symbol queries did not resolve the private helpers; source-qualified file impacts were used. `actor-replanner.ts` reported 16 impacted files, 5 direct callers, MEDIUM risk, and no indexed processes/modules. `actor-replan-prompts.ts` reported 11 impacted files, 3 direct callers, LOW risk, and no indexed processes/modules. The index was 18 commits stale. No HIGH or CRITICAL exact edited target was identified.

`actor-replanner.ts` now includes `route_not_traversable_from_step_location` in the existing locality-schema selector alongside `target_outside_step_location`. `actor-replan-prompts.ts` conditionally appends the approved sentence for that recovery reason while preserving the existing generic recovery text and all other branches. Tests inspect the provider-facing schema objects and safe recovery frame, and prove the recovery reaches the unchanged Reviewer path.

Prompt review: humanizer and deslop found the approved sentence direct, natural, non-duplicative, and free of player-facing prose; the literal is retained unchanged.

## Static validation before r142

- Actor Replanner prompt/replanner suites: 2 files, 33 tests passed.
- Backend typecheck: passed.
- Backend build: passed.
- Combined turn-runtime/application run: 72/72 turn-runtime assertions and 15/15 application assertions passed; Vitest then exited non-zero on the known worker shutdown error `[vitest-worker]: Timeout calling "onTaskUpdate"` after the selected assertions completed.
- Narrow turn-runtime rerun: 72/72 assertions passed with the same post-run worker shutdown error. This is recorded as a verification-tool defect, not a failed assertion.
- `git diff --check`: passed before the implementation commit.
- Staged GitNexus `detect_changes`: recorded with the implementation commit; expected scope is the Actor Replanner prompt/schema selection path and owned tests/note only.

Protected `AGENTS.md` and `CLAUDE.md` remained untouched and unstaged.

## r142 journey

Run: `pristine-60-glm5-turbo-lowwater-ledger-93a09e46-r142`, campaign `6b85a49e-fef5-4359-95e2-051383f6fb66`, ports 4280/4281/4282. Canonical hashes: template state `6cb291d11ce6578e3395a10d2c5d590070e3ccdd8b2b67451410869ce97897d2`, config `d8362b1af976c00cb8f14c564c8196a2d1ab137743ff368ea83d762a4ad2e065`, Brina card `4b48de7a32df6a6be5a91ab12f09bb87926b40d5940348c7581e298eaa12b60a`.

Live evidence is appended below after the single fresh lane. It must state the exact setup/action boundary, retained stage and persistence evidence, natural recovery coverage (if any), checkpoints, integrity/FK, cleanup, and unavailable criteria without inferring provider output.

## Acceptance handoff

- Entry: accepted `cd0cc12962a4f4e5a74713ec3762a8e3309eff47` with only protected instruction-file dirt.
- Schema/prompt isolation: focused tests prove route-only locality schema selection, exact route sentence, safe feedback preservation, and unchanged neighboring branches.
- Recovery behavior: Actor Replanner tests prove shared identity, accepted Reviewer path, and existing one-recovery fencing; live r142 evidence is required for product coverage.
- Persistence/mechanics: existing runtime/application tests preserve exactly-once and no-attempt-3 behavior; live r142 evidence must report authoritative SQLite state.
- Endurance/reload: unavailable until r142 completes 60 actions and the one same-page reload.
