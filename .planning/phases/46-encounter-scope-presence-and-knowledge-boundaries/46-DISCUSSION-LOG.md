# Phase 46: Encounter Scope, Presence & Knowledge Boundaries - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-12
**Phase:** 46-encounter-scope-presence-and-knowledge-boundaries
**Areas discussed:** scene participation, perception, NPC knowledge, hidden participants

---

## Scene Participation

| Option | Description | Selected |
|--------|-------------|----------|
| Whole large location | Everyone in the same major location is treated as part of one scene | |
| Local scene only | Only the specific local place of action counts as the current scene | ✓ |
| Full sublocation-only model | Every scene must be tied to a fully explicit sublocation model | |

**User's choice:** A large location should not behave like one shared room. The scene should be local and concrete.
**Notes:** The user explicitly clarified that presence in the scene is not determined by the player's awareness. The world does not revolve around the player.

---

## Perception

| Option | Description | Selected |
|--------|-------------|----------|
| Direct sight only | Text only includes what the player directly sees | |
| Broad but lightweight perception | Use hidden checks and heuristics for sound, energy, aftermath, pressure, etc. | ✓ |
| Heavy simulation | Model perception in highly granular detail across many factors | |

**User's choice:** Use a lightweight hidden-check layer with support for world-specific senses and abilities.
**Notes:** The user explicitly wants an 80/20 solution: believable perception without turning the system into a giant simulation or math monster.

---

## NPC Knowledge

| Option | Description | Selected |
|--------|-------------|----------|
| Same location means knowledge | NPCs know about anyone else in the same broad location | |
| Grounded knowledge only | NPC knowledge must come from meeting, sensing, reputation, or credible reports | ✓ |
| Free model inference | Let the model infer who NPCs know from broad context | |

**User's choice:** NPCs only know about other actors when there is a real basis for that knowledge.
**Notes:** The user accepted prior contact, perception, reputation, reports, and world-appropriate recognition methods as valid grounds.

---

## Hidden Participants

| Option | Description | Selected |
|--------|-------------|----------|
| Hidden means absent | If the player has not noticed them yet, they are not really in the scene | |
| Present but not yet known | Hidden actors are real participants, but information about them is limited by perception | ✓ |
| Fully revealed internally and externally | Hidden actors are active and described openly even before the player notices them | |

**User's choice:** Hidden or unnoticed actors must still participate fully in the world, but the player only receives the layer of information they could perceive.
**Notes:** The user emphasized that the world must remain independent from the player's awareness.

---

## the agent's Discretion

- Exact representation of hidden checks and heuristics
- Exact balance between ordinary senses and supernatural or energy-based senses
- Exact runtime model for “present but unnoticed”
- Exact prompt and API surfaces for partial awareness

## Deferred Ideas

None.
