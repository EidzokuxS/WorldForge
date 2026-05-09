# WorldForge GM-First Turn Orchestration Correction

## Status

Captured 2026-05-02 after live orchestration discussion and Marinara Engine source audit.

## User Correction

Backend must not "understand" freeform player text. It should not decide intent, target, hostility, combat mode, canon meaning, or whether a scene action is really an action. Those are fictional and contextual choices, so they belong to the GM/LLM.

Backend should own deterministic and auditable work:

- snapshots and rollback
- persistence
- IDs and references
- neutral scene/state retrieval
- candidate lists
- allowed tool surfaces
- schema validation
- deterministic math
- random rolls when requested
- tool execution
- invariant enforcement
- logs and receipts

Randomness is allowed because the operation itself is deterministic: given "roll this die/range now", backend returns a bounded random result and records it.

## Current WorldForge Problem

The current live-turn shape still contains too much backend-side semantic prework:

1. Frontend sends `playerAction`, `intent`, and `method`.
2. Backend creates a rollback boundary.
3. Backend builds a `SceneFrame`.
4. Backend tries to resolve target candidates and hostility/combat context before the GM has interpreted the action.
5. Oracle/Judge often runs as a pre-pass.
6. Scene planner maps outputs into tool actions.
7. Backend validates/executes and storyteller presents.

The rollback, state gathering, validation, and execution parts are good. The problem is authority: target choice, hostility, combat framing, whether a roll is needed, and what the player meant are GM decisions.

## Marinara Lesson

Source: [Pasta-Devs/Marinara-Engine](https://github.com/Pasta-Devs/Marinara-Engine), inspected locally in `R:\Projects\_external\Marinara-Engine`.

Marinara is not a template to copy. It is a useful reference for how a GM-led text RPG can feel alive when scene flow, narration cadence, choices, logs, and presentation are centered. WorldForge should borrow the GM-flow lesson, not Marinara's product shape, state depth, UI skin, or authority model.

Marinara's RPG mode is mostly GM/LLM-led:

- The GM receives game state, map, NPCs, party, inventory, weather/time, player notes, and raw player input.
- The GM decides how to continue the scene, when to offer choices, when a skill check matters, when combat starts, and which commands should update state.
- Backend services provide deterministic tools: dice rolls, skill-check mechanics, map movement, state transitions, time/weather updates, inventory, journal, reputation, combat rounds.
- Dice/skill checks are not automatic. They appear when uncertainty and consequences matter.
- Player input is freeform scene text, with special side channels only for party/GM notes.

WorldForge should be a stronger and more constrained version of this: richer state, stricter validation, better memory, better presence, better tool execution, and stronger backend rule enforcement.

## Backend Rulebook Principle

GM-first does not mean LLM-trusted.

The GM/LLM owns fictional interpretation and scene direction, but it must move inside a backend rulebook. The backend remains the foundation and world truth for anything that must stay consistent across turns:

- current time and elapsed time
- location and scene scope
- known actors and where they can practically be perceived
- stats, HP, conditions, inventory, equipment, currencies, and resources
- faction state, relationships, clocks, threads, and remembered facts
- deterministic movement/combat/social/tool rules
- dice/random receipts
- persistence, rollback, and audit history

The LLM may propose what happens, but backend validates whether the proposed change is legal, applies deterministic consequences, and rejects or repairs outputs that violate the rulebook. If the GM says two hours passed but the validated turn advanced five minutes, backend time wins. If the GM forgets a condition, inventory item, actor presence boundary, or cooldown, backend state wins.

The intended split is therefore:

- GM decides meaning, drama, pacing, target intent, whether uncertainty matters, and which legal tool/request to use.
- Backend decides whether the requested tool/state transition is legal, what deterministic/random result it produces, and what world state is actually persisted.
- Storyteller renders the settled truth, not an unconstrained alternate reality.

## Target Turn Flow

1. Player submits raw text or `Continue`.
2. Backend creates a rollback boundary.
3. Backend gathers a neutral scene packet: current player, location/scope, known actors, sensed/offscreen hints, recent events, relevant memories, rulebook constraints, and allowed tools. This packet is evidence and law, not interpretation.
4. GM/Judge receives the raw text, neutral packet, candidate IDs/names, and allowed tools.
5. GM chooses the beat path:
   - direct narration/dialogue/observation with no roll
   - ask backend for a roll or Oracle adjudication
   - call a movement/social/combat/inventory/state tool
   - transition into combat or another mode
   - ask clarification when the input cannot be resolved honestly
   - simply let the scene breathe on `Continue`
6. If uncertainty matters, GM asks backend to roll or adjudicate with an evidence bundle. Backend rolls/calculates/validates and records the receipt.
7. GM emits a ScenePlan/tool-call set using concrete IDs from candidates.
8. Backend validates that requested tools and IDs are legal, executes deterministic mutations, corrects/rejects rulebook violations, persists or rolls back.
9. Storyteller presents the settled backend truth as staged beats.
10. UI renders the scene cadence, drawers, effects, and inspect receipts.

## Ownership Boundary

| Layer | Owns |
|---|---|
| Backend | IDs, storage, candidate retrieval, visibility facts, allowed tools, schema validation, deterministic calculations, random rolls, tool execution, rollback, audit logs |
| GM/Judge LLM | Interpreting raw player text, choosing targets from candidates, deciding hostility/combat/social/exploration framing, deciding if a roll matters, selecting legal tools/requests, proposing fictional consequence, pacing |
| Storyteller LLM | Player-facing prose from settled backend facts and GM/stage constraints |
| UI | Scene presentation cadence, drawers, effects, inspect disclosure, input draft |

## Anti-Goals

- No backend regex/classifier as authority for hostile action.
- No automatic Oracle for every turn.
- No trusting LLM-authored time, stats, inventory, location, or persistent state without backend validation.
- No `Act` / `Speak` / `Observe` command taxonomy as required player input.
- No backend target selection from prose except validating a GM-supplied concrete ID/name against candidates.
- No backend semantic repair that invents lore, motives, canon, actions, targets, or power facts.
- No treating broad location membership as direct interaction eligibility.

## Phase Mapping

### Phase 77

Keep Phase 77 as UI/presentation only:

- one freeform input
- first-class `Continue`
- optional future separate GM/OOC side channel, but no action taxonomy
- existing `intent`/`method` route fields may mirror raw text and empty method only as legacy transport compatibility
- no new backend meaning authority

### Phase 78

Reframe as GM-first turn orchestration:

- neutral SceneFrame packet contract
- explicit backend rulebook/invariant packet contract
- raw input contract
- GM chooses no-roll, roll, tool call, combat transition, or direct narration
- Oracle becomes requested adjudication, not mandatory pre-pass
- backend validates and executes only concrete requested tools/IDs
- backend remains final authority for time, location, stats, inventory, relationships, resources, and persisted world facts
- deprecate product reliance on `intent` and `method`

### Phase 79+

Director pacing, scene memory, and quality gates should build on GM-first orchestration. They should not add more backend semantic pre-classifiers.

## Acceptance Scenarios

- Talking to an NPC should not roll unless there is resistance, deception, pressure, or a meaningful uncertain consequence.
- "I sniff around looking for the parfait shop" can become observation, movement, sensory clue, failure with consequence, or a roll depending on current fiction; backend must not decide this by string matching.
- "I hit Iru" should be interpreted by GM using scene context and candidates; backend validates and executes only after GM chooses the target/tool.
- `Continue` should let the world breathe without pretending the player performed a specific action.
- Actors in the same broad location are not direct targets unless GM/current scene presence makes them practically available.
