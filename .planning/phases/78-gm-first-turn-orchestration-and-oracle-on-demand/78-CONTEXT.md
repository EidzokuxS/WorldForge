# Phase 78 Context: GM-First Turn Orchestration And Oracle-On-Demand

## Goal

Replace backend semantic pre-interpretation of `/action` turns with a GM-first orchestration loop.

The backend should supply neutral state, evidence, rulebook constraints, candidate IDs/names, and legal tool affordances. The GM/Judge interprets the raw player text and chooses one of the honest turn paths: direct resolution, roll/Oracle, tool call, combat transition, clarification, or `Continue`. The backend remains the deterministic rulebook and final world-truth validator for all persisted state and legal transitions.

## Why This Phase Exists

The current live turn pipeline still carries too much backend-owned semantic work:

- frontend sends `playerAction`, `intent`, and `method`;
- backend creates rollback, gathers scene state, and builds a `SceneFrame`;
- backend tries to resolve target candidates and hostile/combat context before the GM has interpreted the action;
- Oracle/Judge often runs as an early pass even when the turn may not need a roll;
- ScenePlanner maps structured output into executable tool actions;
- backend validates/executes and storyteller renders the result.

Rollback, state gathering, validation, receipts, and execution are good. The failure is authority. Meaning belongs to the GM; lawful persistence belongs to the backend.

## User Correction To Preserve

Backend must not "understand" freeform player text as product truth. It must not authoritatively decide intent, target, hostility, combat mode, canon meaning, or whether a scene beat is an action. Those are fictional and contextual choices.

Backend should own deterministic and auditable work:

- snapshots and rollback;
- persistence;
- IDs and references;
- neutral scene/state retrieval;
- candidate lists and visibility facts;
- allowed tool surfaces;
- schema validation;
- deterministic math;
- random rolls when requested;
- tool execution;
- invariant enforcement;
- logs and receipts.

Randomness is allowed because the operation itself is bounded and auditable: given a request to roll a die/range, backend returns and records a result.

## Backend Rulebook Principle

GM-first does not mean LLM-trusted.

The GM/LLM owns fictional interpretation and scene direction, but it moves inside a backend rulebook. The backend remains final truth for anything that must stay consistent across turns:

- current time and elapsed time;
- location and scene scope;
- actors, presence, visibility, and practical interaction eligibility;
- stats, HP, conditions, inventory, equipment, currencies, and resources;
- faction state, relationships, clocks, threads, and remembered facts;
- deterministic movement/combat/social/tool rules;
- dice/random receipts;
- persistence, rollback, and audit history.

The LLM may propose what happens, but backend validates whether the proposed change is legal, applies deterministic consequences, and rejects or repairs outputs that violate the rulebook. If the GM says two hours passed but the validated turn advanced five minutes, backend time wins.

## Target Turn Flow

1. Player submits raw text or `Continue`.
2. Backend creates a rollback boundary.
3. Backend gathers a neutral scene packet: current player, location/scope, known actors, sensed/offscreen hints, recent events, relevant memories, rulebook constraints, and allowed tools. This packet is evidence and law, not interpretation.
4. GM/Judge receives raw text, neutral packet, candidate IDs/names, and allowed tools.
5. GM chooses the beat path:
   - direct narration/dialogue/observation with no roll;
   - ask backend for a roll or Oracle adjudication;
   - call a movement/social/combat/inventory/state tool;
   - transition into combat or another mode;
   - ask clarification when the input cannot be resolved honestly;
   - let the scene breathe on `Continue`.
6. If uncertainty matters, GM asks backend to roll or adjudicate with an evidence bundle.
7. GM emits a ScenePlan/tool-call set using concrete IDs from candidates.
8. Backend validates legal tools/IDs, executes deterministic mutations, persists or rolls back.
9. Storyteller presents settled backend truth as staged beats.
10. UI renders scene cadence, drawers, effects, and inspect receipts.

## Ownership Boundary

| Layer | Owns |
|---|---|
| Backend | IDs, storage, candidate retrieval, visibility facts, allowed tools, schema validation, deterministic calculations, random rolls, tool execution, rollback, audit logs |
| GM/Judge LLM | Interpreting raw player text, choosing targets from candidates, deciding hostility/combat/social/exploration framing, deciding if a roll matters, selecting legal tools/requests, proposing fictional consequence, pacing |
| Storyteller LLM | Player-facing prose from settled backend facts and GM/stage constraints |
| UI | Scene presentation cadence, drawers, effects, inspect disclosure, input draft |

## Requirements

- P78-R1: Turn orchestration treats player input as raw scene text; backend does not authoritatively infer intent, target, hostility, combat mode, or action category before the GM/Judge interprets it.
- P78-R2: Backend provides a neutral scene packet with current state, candidate IDs/names, visibility bands, recent events, memory hints, and allowed tools; these are evidence and affordances, not semantic conclusions.
- P78-R3: GM/Judge chooses whether the turn resolves directly, needs a roll/Oracle, calls a tool, transitions into combat, asks clarification, or simply continues the scene.
- P78-R4: Oracle/rolls run only when requested for meaningful uncertainty or resistance; pure conversation, obvious observation, guaranteed actions, and dead-air outcomes use no-roll resolution.
- P78-R5: Backend validates and executes only GM-supplied concrete tools/IDs, performs deterministic math/random rolls, persists receipts, and rolls back on failure.
- P78-R6: Legacy `intent` and `method` fields are deprecated as product semantics; during migration they may mirror raw player text/empty method for route compatibility only.
- P78-R7: Backend remains the rulebook and final world truth for time, locations, stats, inventory, conditions, resources, relationships, clocks, persisted facts, and legal state transitions; LLM-authored outputs cannot overwrite those without deterministic validation.

## Anti-Goals

- Do not copy Marinara Engine as product architecture or UI.
- Do not add backend regex/classifier authority for hostile actions.
- Do not run Oracle automatically for every turn.
- Do not trust LLM-authored time, stats, inventory, location, or persisted state without backend validation.
- Do not introduce required `Act` / `Speak` / `Observe` command modes.
- Do not select targets in backend from prose except to validate GM-supplied concrete IDs/names against candidates.
- Do not let broad location membership imply direct interaction eligibility.
- Do not regress Phase 77 `Continue`, raw input, staged beats, or Inspect-hidden mechanics.

## Acceptance Scenarios

- Talking to an NPC does not roll unless there is resistance, deception, pressure, or another meaningful uncertain consequence.
- `I sniff around looking for the parfait shop` can become observation, movement, sensory clue, failure with consequence, or a roll depending on fiction; backend must not decide this by string matching.
- `I hit Iru` is interpreted by GM using scene context and candidates; backend validates and executes only after GM chooses target/tool.
- `Continue` lets the world breathe without pretending the player performed a specific action.
- Actors in the same broad location are not direct targets unless GM/current scene presence makes them practically available.

## Canonical References

- `.planning/research/worldforge-gm-first-turn-orchestration.md`
- `.planning/research/marinara-gm-flow-reference.md`
- `.planning/research/worldforge-runtime-dramaturgy-research.md`
- `.planning/phases/77-scene-first-vn-rpg-play-surface-and-weekend-playable-ux-slic/77-VERIFICATION.md`
- `.planning/phases/73-structured-output-stability-and-provider-conformance/73-SUMMARY.md`
- `.planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/74-REVIEWS.md`

## Likely Code Areas To Inspect Before Planning

- `backend/src/routes/chat.ts`
- `backend/src/engine/turn-processor.ts`
- `backend/src/engine/scene-frame.ts`
- `backend/src/engine/scene-planner.ts`
- `backend/src/engine/oracle.ts`
- `backend/src/engine/combat-envelope.ts`
- `frontend/src` `/game` route and action submit wiring

Any source edit must run GitNexus impact first for the symbols being changed, per `AGENTS.md`.
