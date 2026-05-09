# Phase 88 Execution Waves

## Rule

Phase 88 should be executed sectionally. Do not build the entire living-world stack and then test it at the end. Each wave must leave the system in a coherent, tested state before the next layer is attached.

This file is about execution order, not scope reduction. All P88 requirements remain required.

If a wave gate fails, do not continue into later implementation waves. Fix the failing wave, rerun its deterministic proof, and only then attach the next layer.

The work may be administratively split into follow-up phase numbers if execution time or review load demands it, but the acceptance target remains the full P88 architecture rather than a narrowed MVP.

## Wave 1: Authority Foundation

Plans:

- `88-01-PLAN.md`

Goal:

- Add world version, world time, ToolResult authority, job/proposal/process persistence, and rollback invalidation.

Must be green before moving on:

- stale base-version writes reject;
- rollback cancels/supersedes future jobs/proposals;
- no new autonomous mutation can exist without authority metadata.
- evidence exists under `.planning/phases/88-living-world-authority-spine-and-key-npc-co-player-process-simulation/evidence/wave-1/` with world-version sequence, rollback proof, job/proposal ledger, and state diff summary.

## Wave 2: Visibility and Knowledge Boundaries

Plans:

- `88-02-PLAN.md`
- early hidden-truth tests from `88-VALIDATION.md`

Goal:

- Lock ActorFrame, CommandNodeFrame, PlayerFacingPacket, NarratorPacket, and ContextBudgetTrace before actors start making decisions.

Must be green before moving on:

- seeded hidden truth does not enter narrator prompts;
- ActorFrame facts have source routes;
- player-facing packets contain committed visible truth only.
- evidence exists under `.planning/phases/88-living-world-authority-spine-and-key-npc-co-player-process-simulation/evidence/wave-2/` with packet dumps, actor-frame audits, hidden-truth exclusion counts, and context-budget traces.

## Wave 3: Turn Boundary and Required Settlement

Plans:

- `88-03-PLAN.md`

Goal:

- Remove direct detached post-`done` state mutation and establish required-before-done vs proposal-after-done flow.

Must be green before moving on:

- `done` is truthful;
- detached workers cannot mutate current state directly;
- retry/route failure cannot leave committed hidden leftovers.
- minimal serialized-LLM-group, context-budget, proposal, and SSE stage traces exist for later waves to extend.
- old detached offscreen/reflection/faction writers are proposal-only adapters, not direct authoritative writers.
- evidence exists under `.planning/phases/88-living-world-authority-spine-and-key-npc-co-player-process-simulation/evidence/wave-3/` with SSE boundary traces, detached-worker audit, proposal rejection cases, and route failure rollback proof.

## Wave 4: Key NPC Co-Player Core

Plans:

- `88-04-PLAN.md`
- `88-05-PLAN.md`

Goal:

- Add durable KeyActorProcess, wakeups, actor decisions, and backend-validated actor tools.

Must be green before moving on:

- actors do not poll every player turn;
- present required reactions settle before `done`;
- invalid actor tool calls fail without fake success;
- actor decisions cite only ActorFrame facts.
- parallel actor work is allowed only after write-scope reservation proves non-conflict.
- combat/contested actions produce authoritative ToolResults through the combat envelope/resolver contract.
- evidence exists under `.planning/phases/88-living-world-authority-spine-and-key-npc-co-player-process-simulation/evidence/wave-4/` with scheduler traces, actor decision packets, actor tool ledgers, and present-reaction proof.

## Wave 5: Offscreen Continuity and Memory

Plans:

- `88-06-PLAN.md`
- `88-07-PLAN.md`

Goal:

- Make offscreen action durable through world-time plan execution, memory, beliefs, reports, rumors, and just-in-time catch-up.

Must be green before moving on:

- offscreen consequences are inspectable state;
- false claims remain claims/beliefs, not truth;
- actor memory has provenance and rollback version;
- no full-history prompt dump.
- offscreen plan failures create failure events and replan/notification work.
- retrieval is hybrid: structured, lexical/BM25, and optional vector recall, all source-backed.
- evidence exists under `.planning/phases/88-living-world-authority-spine-and-key-npc-co-player-process-simulation/evidence/wave-5/` with offscreen catch-up state diffs, memory provenance dumps, belief/report/rumor ledgers, and context-budget proof.

## Wave 6: Factions and World Threads

Plans:

- `88-08-PLAN.md`
- `88-09-PLAN.md`

Goal:

- Replace faction ghost minds with command/report/resource networks and add durable world threads with diegetic surfacing.

Must be green before moving on:

- faction action requires a report/command/resource route;
- tourist play advances world pressure without forcing protagonist drama;
- visible surfacing does not leak hidden causes.
- forecasts remain advisory unless actor/faction/thread tools commit source events.
- evidence exists under `.planning/phases/88-living-world-authority-spine-and-key-npc-co-player-process-simulation/evidence/wave-6/` with command-node report chains, resource ledgers, world-thread clocks, and player-facing surfacing audits.

## Wave 7: Latency, Parallelism, and Final Proof

Plans:

- `88-10-PLAN.md`
- `88-11-PLAN.md`

Goal:

- Prove the whole stack under trace, rollback, deterministic tests, focused live routes, deep live routes, and gameplay/prose review.

Must be green before Phase 88 completion:

- serialized LLM groups are measured and bounded by turn class;
- no output truncation/fake success/runtime skip is used to pass;
- all required live routes produce artifacts;
- soft prose/playfeel judgments use calibrated rubric examples; lexical checks only catch obvious templates.
- final verification matrix links every P88 requirement to evidence.
- evidence exists under `.planning/phases/88-living-world-authority-spine-and-key-npc-co-player-process-simulation/evidence/wave-7/` and `output/playwright/phase-88-living-world/` with focused/deep route artifacts, final trace summaries, and the closeout matrix.
