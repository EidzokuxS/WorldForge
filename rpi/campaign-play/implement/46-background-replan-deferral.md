# Background replan deferral

## Outcome

An invalid background actor replan no longer interrupts a player turn after the player's primary action has committed. The failed actor opportunity becomes a typed `deferred/replan_invalid` job. Its model-stage record remains `interrupted` with `model_contract_invalid`, so the failure is inspectable without becoming mechanical or narrative authority.

## Boundary

- The actor replanner persists no proposal or replacement plan for an invalid result.
- The Rulebook applies no command, receipt, event, or world-version change for that actor opportunity.
- Code advances the actor's next due time from the settled world time and persisted cadence, leaves `lastActAt` unchanged, and increments agency debt.
- The remaining due actors settle in their frozen order. The player turn proceeds to `actors_settled` and narration.
- Provider transport, stage-budget, lease, and persistence failures remain explicit turn interruptions. This change adds no retry, repair, model switch, fallback prose, or compatibility path.

The SQLite transition uses an explicit `replan_invalid` defer reason. Both the table CHECK and update trigger require a non-null defer reason; this closes the previous three-valued-logic hole where `claimed -> deferred` could pass with `NULL`.

## Evidence

- `backend/src/campaign-play/actor-replanner.test.ts`: four focused replanner cases pass, including invalid model output with no replacement plan.
- `backend/src/campaign-play/turn-runtime.test.ts`: the committed player action continues after an invalid background replan and reaches `actors_settled` after the rest of the frozen due set.
- `backend/src/campaign-play/campaign-play-database.test.ts`: pending migration and actor-job guard regressions pass, including rejection of a null defer reason.
- `pnpm exec tsc -p backend/tsconfig.json --noEmit`: pass.
- Upgrade proof copied the interrupted action-24 database to `output/playtests/campaign-play/migration-proof-action24-replan-deferral`. Migration count advanced from 39 to 40 while preserving 21 actor jobs, 18 proposals, 79 model stages, and 81 world events. The interrupted job kept its identity, stage, and worker epoch. `integrity_check` returned `ok`, `foreign_key_check` returned no rows, and the rebuilt guard contains `replan_invalid` plus the explicit null check.

The live action-24 campaign remains paused at the pre-repair interrupted actor job until the updated backend starts and explicit Resume exercises the real public recovery route.

## Research alignment

The implementation follows `pgg:knowledge:found-004`: proposal, review, authoritative transition, persistence, and presentation remain separately inspectable. The explicit Resume evidence in `pgg:response:rq-20260717t230603672z-e8faf855` supports resuming only the interrupted actor boundary; it does not authorize replaying Judge, Game Master, or the committed primary batch. The refusal-history result in `pgg:response:rq-20260718t070521338z-232f862f` remains a presentation rule and does not become mechanical authority here.

## Semantic review

No player-facing prompt, route copy, or narration prose changed. The plan and task-note prose received a humanizer and deslop pass; the typed authority, failure boundary, evidence, and non-goals were preserved.
