# Task 8A: actor scheduler

Date: 2026-07-11  
Status: complete; mechanical and semantic verification passed.

## Outcome

The scheduler freezes one ordered decision set after primary settlement. Ordering uses due time, priority, then actor ID. The sealed decision records wake, defer, and skip policy, while admitted jobs keep the durable reason that made each actor due. Admission checks the campaign, turn stage, world version, runtime revision, and settled clock inside the caller's runtime transaction.

Frames load on demand from the current mechanical version. Each frame contains the selected actor, current placement and conditions, actor-owned goals and relations, operative local routes, anchored pressures, durable actor knowledge, and the exact authorized reference set. Person actors use present placement; collectives use base and influence placement. Plan selection returns the next bounded step or a typed replan boundary for inactive plans, failed preconditions, and exhausted plans.

Deferred actors receive a terminal job, one agency-debt increment, and one future due time calculated from the settled clock. This avoids catch-up scheduling. SQLite uniqueness remains the final guard for one job per actor per turn and one pending job per actor.

## Acceptance evidence

- Seeded action-30 and action-60 database fixtures produce the same due order: actor B, actor A, then collective actor D. Future actor C stays outside the due set.
- Repeated 30-step and 60-step cadence fixtures cover settle, defer, debt reset, bounded next-due calculation, and serialization at the midpoint.
- Job admission produces deterministic IDs and order. Reopening the campaign database returns byte-equivalent parsed job state.
- A current-turn repeat freezes explicit `already_considered_this_turn` decisions and admits zero duplicates.
- A cloned due set and a version-stale due set fail before job insertion.
- An incapacitated actor receives a durable deferred job; its schedule advances once and agency debt increases once.
- Frame construction observes a later mechanical placement commit and excludes unrelated actor state.
- Failed preconditions and exhausted bounded plans return typed replan boundaries.

## Verification

```text
npm --prefix backend test -- src/campaign-play/actor-scheduler.test.ts
1 file, 11 tests passed

npm --prefix backend run typecheck
passed

git diff --check
passed with existing line-ending warnings

git diff --no-index --check -- /dev/null backend/src/campaign-play/actor-scheduler.ts
git diff --no-index --check -- /dev/null backend/src/campaign-play/actor-scheduler.test.ts
passed with line-ending warnings
```

Standalone smoke additions: `0`.

Independent Terra verification reproduced the focused tests and typecheck. Fresh Sol review found one real defect: exhausted plans cycled to step zero. The scheduler now returns `replan_required` with reason `plan_exhausted`, and the regression covers the final-step boundary. The same verifier then accepted Task 8A as complete.

GitNexus impact was attempted for the new scheduler symbols and returned `Target not found` because the untracked Task 8A files remain outside the current index. Focused integration tests and independent review provide the bounded proof.

## Scope boundary

Task 8A owns due decisions, admission, frames, plan-step selection, and cadence. Task 8B owns proposal persistence, Rulebook settlement, stale proposal handling, and model-backed replanning. Tasks 10, 17, and 18 own complete turn execution and real multi-turn campaign playtests.

The evidence prose passed a local `humanizer` and `deslop` check for direct technical wording. Task 8A keeps the existing storage schema and production prompt, copy, and UI surfaces unchanged.
