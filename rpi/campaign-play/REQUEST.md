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

The plan must distinguish build events from gameplay turns. World-build acceptance proves that a world exists. Gameplay evidence begins at opening turn zero.

Promotion requires:

- deterministic contract and transaction tests for every owner boundary;
- one complete opening and first custom action through the normal UI;
- a twenty-turn causal proof with restart and hidden-information probes;
- a thirty-turn live diagnostic whose accepted defects become regressions;
- two fresh uninterrupted sixty-turn campaigns played through the normal UI;
- one sixty-turn clone/provenance campaign with explicit lineage and independent live state;
- one three-hundred-turn soak with scheduled restart and projection checks;
- an explicit six-hundred-turn gate before claiming sustained longplay.

Live promotion lanes use one declared provider and model configuration. They contain no manual database edits, provider swaps, silent retries, hidden model fallback, action resubmission, checkpoint restore, or player-facing failed turn.

## Hard stop conditions

Promotion stops when any lane contains lost or duplicate input, a hidden-fact leak, a mechanical mutation without a Rulebook/bootstrap receipt, a runtime mutation without a fenced revision and campaign runtime event, a turn-owned runtime mutation without its sanitized turn event, narration that contradicts receipts, player-action seizure, stale-version execution, partial untracked state, a missing terminal turn, reload divergence, or an active call into the displaced gameplay path.

## Planning output

Produce an execution-ready Krypton package with explicit truth owners, contracts, migration and cutover, exact file ownership, small tasks, verification commands, target-perspective evidence, independent PRE review, and no standalone smoke suite.
