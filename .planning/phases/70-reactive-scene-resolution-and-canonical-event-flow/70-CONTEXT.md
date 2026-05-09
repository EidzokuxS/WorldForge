# Phase 70 Context: Reactive Scene Resolution and Canonical Event Flow

**Status:** ready for GSD research and planning  
**Date:** 2026-04-25  
**Source:** Phase 70 handoff, draft discussion, code audit, Claude CLI review, Gemini CLI review, and consensus synthesis

## Phase Boundary

Phase 70 plans the first maintainable migration from the current post-Phase-69 player-turn pipeline to a coherent local visible turn pipeline.

The phase should not build a full global simulation rewrite. It should introduce one local **Scene Planner of Record** for the normal player-visible turn, while preserving the deterministic backend responsibilities that already make Phase 69 rollback, validation, and narration ownership workable.

The target player experience:

> Player writes one message. Backend builds the factual situation. Judge decides one coherent local scene step. Backend validates and commits it. Storyteller renders only the player-perceivable committed packet.

## Canonical Inputs

Read these before planning implementation:

- `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-WORLD-SIMULATION-DATA-FLOW-CONSENSUS.md`
- `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-HANDOFF-WORLD-SIMULATION-AUDIT.md`
- `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-CONTEXT-DRAFT.md`
- `.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-DISCUSSION-LOG.md`
- `.planning/phases/69-judge-owned-hidden-pass-migration-and-narrator-only-runtime/69-SUMMARY.md`
- `.planning/phases/69-judge-owned-hidden-pass-migration-and-narrator-only-runtime/69-VALIDATION.md`
- `.planning/phases/68-world-brain-hidden-adjudication-and-scene-direction/68-SUMMARY.md`

Primary runtime files to inspect:

- `backend/src/routes/chat.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/world-brain.ts`
- `backend/src/engine/hidden-adjudication.ts`
- `backend/src/engine/scene-assembly.ts`
- `backend/src/engine/npc-agent.ts`
- `backend/src/engine/scene-presence.ts`
- `backend/src/engine/prompt-assembler.ts`
- `backend/src/engine/tool-schemas.ts`
- `backend/src/engine/tool-executor.ts`

## Accepted Design Decisions

1. Keep the current Oracle as a separate bounded outcome call for the first migration.
2. Replace `WorldBrainSceneDirection + HiddenAdjudicationPlan + tickPresentNpcs` on the visible-turn critical path with one strict structured `ScenePlan`.
3. Backend owns state, roster construction, actor/location validity, awareness bands, visibility, tool execution, persistence, rollback, retry, and tick boundaries.
4. LLM calls own semantic interpretation, likely actor response selection, support beats, deferred semantic hooks, stopping point judgment, and final prose.
5. Present NPC autonomy must not run as an independent visible-turn mini-round after the judge plan has already executed.
6. Offscreen activity, faction drift, actor reflection, and long-running world simulation must not block the visible player response unless the `ScenePlan` explicitly selects a bounded local consequence.
7. The Storyteller must receive a player-perceivable committed packet, not raw hidden adjudication plans or unconstrained world state.
8. The implementation should migrate the existing Phase 68/69 pipeline instead of rewriting the engine.

## Engine vs LLM Boundary

Engine-owned concerns:

- authoritative campaign state
- current location and scene scope
- actor records and present/broad-location rosters
- perception and communication channels that exist in world state
- inventory, HP, conditions, relationship rows, tags, and explicit flags
- valid tool schemas and deterministic tool execution
- hidden fact filtering
- rollback snapshots, retry safety, and post-turn persistence
- validation that all model-proposed actors, locations, tools, and effects are legal

LLM-owned concerns:

- interpreting freeform player action in context
- judging likely intent when the input is ambiguous
- selecting the primary local response actor or force
- choosing support reactions that belong in the same visible scene step
- deciding when enough has happened before returning control to the player
- proposing deferred hooks for later background work
- writing final prose from already committed, visible facts

## Required Planning Outputs

The final plan should produce executable work that covers:

- `SceneFrame` builder or equivalent deterministic situation packet
- strict `ScenePlan` schema and validator
- migration away from visible-turn `tickPresentNpcs()` as an independent mini-round
- deterministic execution of `ScenePlan` effects through existing tool validation paths
- player-visible narrator packet contract
- tests that prove no hidden facts leak into final narration
- tests that prove present NPCs cannot create uncoordinated second-turn consequences during a normal player response
- rollout strategy that keeps Oracle separate for Phase 70A and leaves Oracle fusion for a later phase

Suggested design artifacts if the planner wants explicit docs:

- `70A-SCENE-FRAME-SPEC.md`
- `70A-SCENE-PLAN-SCHEMA.md`
- `70A-NARRATOR-PACKET-SPEC.md`
- `70A-VALIDATION-MATRIX.md`
- `70A-MIGRATION-PLAN.md`

## Requirements

Phase 70 roadmap requirements:

- `P70-R1`: build a deterministic per-turn `SceneFrame`.
- `P70-R2`: introduce strict structured `ScenePlan` output.
- `P70-R3`: execute validated `ScenePlan` effects through deterministic backend services.
- `P70-R4`: remove autonomous present-NPC mini-rounds from the visible-turn critical path.
- `P70-R5`: keep Oracle separate in this migration while preserving existing outcome validation.
- `P70-R6`: create a player-perceivable narrator packet and keep hidden facts out of final prose.
- `P70-R7`: add regression tests for neutral-input escalation, hidden fact leakage, actor legality, and canonical event ordering.
- `P70-R8`: document the engine-vs-LLM boundary and deferred future phases.

## Deferred Work

Do not pull these into Phase 70 unless the plan proves they are required:

- full all-actor global simulation
- Oracle and Scene Planner fusion
- background faction/offscreen scheduler rewrite
- actor reflection architecture rewrite
- new UI work
- new persistence schema for deferred hooks unless a minimal table is clearly needed
- generalized social/combat/romance/economy subsystem redesign

## Non-Negotiables

- The visible turn must have one local planner of record.
- The backend must validate before anything becomes canonical.
- The final storyteller prompt must be downstream of committed visible facts.
- Planning must preserve rollback, retry, and current Phase 69 hidden-channel protections.
- The smallest maintainable migration is preferred over a grand simulation rewrite.
