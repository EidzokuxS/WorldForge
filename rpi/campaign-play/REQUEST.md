# Campaign play request

## Mission

Connect an accepted Campaign World to a real single-player RPG loop. A player creates or imports a character, enters a grounded opening scene, submits freeform or suggested actions, receives backend-owned resolution and player-facing narration, and continues while other world actors pursue their own goals.

The result must prove both halves of the original request: the game creates a coherent world, and that world continues to act after play begins.

## Player promise

The player enters a world that already has actors, goals, placements, relations, routes, and pressures. They may intervene, observe, travel, wait, or remain peripheral. The world reacts to their choices and also changes for reasons that began elsewhere.

The player learns distant developments through a credible path such as direct perception, visible aftermath, route state, or an informed witness. The play surface does not expose the global cast, hidden goals, distant events, internal IDs, model traces, or debug state.

## Required flow

1. World Review accepts a versioned Campaign World.
2. Character setup creates or imports one human-controlled actor inside that world.
3. The player chooses starting conditions or delegates them to the opening planner.
4. Opening setup commits a valid player placement, world clock, actor schedules, and one local playable situation.
5. The opening narrator renders only player-visible facts and offers up to four grounded choices plus freeform input.
6. Each player action enters one durable turn with a base world version and idempotency key.
7. Judge and GM stages interpret the action, resolve uncertainty, and produce a typed command plan.
8. The Rulebook validates and executes commands. Every mechanical mutation receives a receipt, causal parent, prior version, and result version. Runtime mutations receive a fenced runtime revision and campaign runtime event; turn-owned runtime changes also emit a sanitized turn event.
9. Due actors use the same world intent and Rulebook command boundary. Current-scene consequences settle before narration. Detached actor work uses versioned proposals and explicit visibility rules.
10. The narrator receives a player-visible settled packet and renders the next beat without adding durable facts.
11. The next input unlocks only after the turn reaches its durable terminal boundary.

## Ownership requirements

- Campaign `state.db` owns play state, mechanical world version/hash, runtime revision/hash, time, player placement, actor schedules, commands, receipts, world events, campaign runtime events, sanitized turn events, observations, turns, worker epochs, and narration status.
- The existing Campaign World locations, routes, actors, goals, placements, relations, and pressures remain the canonical world entities.
- A human player is an actor with `controller: "human"`. Agent-controlled people and collectives use the same intent, placement, relation, goal, event, and receipt contracts.
- Backend Rulebook code owns mechanical truth. Models may interpret, judge, plan, decide actor intent, and narrate through strict contracts.
- Narration owns presentation only. It cannot move actors, advance pressures, reveal hidden facts, change relationships, or create durable state.

## Cutover requirement

Create one mechanics-owned Campaign Play path. The active product route becomes `/campaign/[id]/play`, backed by `/api/campaigns/:id/play/*` and `backend/src/campaign-play/`.

The current `/game`, `/api/chat/*`, `players`, `npcs`, `world_clocks`, `turn_sagas`, `clean_gameplay_*`, and large `engine/gameplay-cycle-runtime` path are donor material. They must leave the active player path after caller proof. The new runtime does not read Campaign Kernel, `generationComplete`, scaffold NPCs, faction rows, compatibility tags, or chat history as world truth.

## Gameplay boundary

The first causal slice supports observation, movement, contact, waiting, and open-ended attempts. Freeform input remains the primary sandbox surface. Suggested choices are grounded examples that use the same intent contract.

Typed Rulebook commands cover only effects needed by the slice: time, placement, route state, actor condition or status, actor relation, actor goal, pressure state, and world event. Visibility derives actor knowledge and player observations from committed events and executable exposure predicates. A plan that requires an unavailable effect fails before mutation and returns a grounded result.

Internal bootstrap commands create the unique human actor/profile and initialize player placement, world time, and pressure state. Models cannot emit bootstrap commands; phase and absence guards protect them.

Collectives remain actors. The product adds no separate faction subsystem.

## Evidence requirement

Evidence must distinguish build events from gameplay turns. World-build acceptance proves that a world exists. Gameplay evidence begins at opening turn zero.

Campaign Play development follows this ordered validation ladder. A later level cannot be used to discover defects that a cheaper earlier level can expose:

1. deterministic owner, schema, transaction, and idempotency checks;
2. provider/model qualification for every configuration presented as supported, including its exact structured-output transport and repair behavior;
3. isolated Judge, Game Master, Actor Replanner, and Narrator success, rejection, timeout, and retry/state-preservation checks;
4. adjacent-stage integration checks with one exact admitted input and durable artifact handoff;
5. short rendered journeys covering opening, freeform and suggested actions, movement, contact, waiting, autonomous consequences, recovery, save, and reload;
6. a twenty-to-thirty-action diagnostic journey whose accepted defects receive focused regressions and atomic commits;
7. two fresh sixty-action campaigns through the normal UI as the final 1.0 playtest.

Long acceptance campaigns begin only when levels 1-6 pass and no known blocker remains. When a long campaign exposes a defect, preserve its evidence, reproduce the smallest responsible boundary, repair and commit that owner, rerun the affected lower levels, and only then begin a fresh final campaign. Do not repeatedly use a new sixty-action campaign as the first check of each repair.

Promotion requires:

- deterministic contract and transaction tests for every owner boundary;
- one complete opening and first custom action through the normal UI;
- provider/model qualification for every configuration presented as supported;
- focused proof that retryable transport, timeout, and repairable contract failures preserve the exact turn, context, accepted prior-stage artifacts, world/runtime versions, and idempotency identity;
- a twenty-to-thirty-action causal diagnostic with restart and hidden-information probes;
- two fresh sixty-turn campaigns played through the normal UI. One begins from a newly accepted world and one from an explicit provenance clone, so the two campaigns jointly cover both creation paths.

Each live campaign uses its declared provider/model configuration for the whole admitted turn. Different campaigns and users may use different qualified configurations. Provider adapters own transport differences; the internal Campaign Play domain contract remains stable.

A retry policy may make up to three total attempts for failures classified as transient or safely repairable. Every attempt is recorded. Automatic retry keeps the same admitted action, frozen context, selected provider/model, base versions, idempotency key, and accepted earlier-stage artifacts. It commits no duplicate mutation and publishes exactly one accepted scene. After exhaustion, the game preserves the pending action and durable state, explains the recoverable failure, and lets the player continue that exact turn without database repair or action resubmission.

Live promotion lanes contain no manual database edits, hidden provider/model substitution, synthetic narration or continuity scene, duplicate action submission, checkpoint rollback, invented mechanical result, or unreported recovery. A successful bounded retry is allowed and does not invalidate the campaign when its identity and state-preservation contract passes.

The two sixty-action campaigns gate WorldForge 1.0. A three-hundred-action soak is post-release reliability work and does not block the 1.0 release. There is no six-hundred-action release gate.

## Hard stop conditions

Promotion stops when any lane contains lost or duplicate input, a hidden-fact leak, a mechanical mutation without a Rulebook/bootstrap receipt, a runtime mutation without a fenced revision and campaign runtime event, a turn-owned runtime mutation without its sanitized turn event, narration that contradicts receipts, unrecoverable player-action seizure, stale-version execution, partial untracked state, a missing terminal turn after recovery is exhausted, reload divergence, or an active call into the displaced gameplay path.

## Development output

Ship WorldForge 1.0. Work proceeds in small owner-bounded repairs with explicit truth ownership, proportional checks, a representative rendered journey, and one atomic commit per accepted repair. Commit readiness depends on the repair's own evidence, not on a future endurance campaign. Progress is measured by remaining release criteria and player-visible behavior, not task-note count, run count, test count, or accumulated evidence.

The release gate and player promise in this document cannot be weakened, renamed, supplemented, or replaced by a task-local contract without explicit user approval.
