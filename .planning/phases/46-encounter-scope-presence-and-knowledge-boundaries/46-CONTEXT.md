# Phase 46: Encounter Scope, Presence & Knowledge Boundaries - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Repair scene participation and knowledge rules so a large place no longer behaves like one tiny room.

This phase covers:
- how the game decides who is really part of the current scene
- how much of that scene the player can actually perceive
- when NPCs are allowed to know about other actors
- how hidden-yet-present actors still participate in the world without being prematurely revealed to the player

This phase does **not** cover:
- a full rewrite of the location system
- writing-quality tuning or anti-slop prompting
- typography, rich text, or presentation polish
- rebuilding canonical character modeling

</domain>

<decisions>
## Implementation Decisions

### Scene Participation
- **D-01:** A large location does **not** mean everyone there is in one shared scene.
- **D-02:** A scene should be local and concrete: the specific tunnel, platform, room, street corner, rooftop, or other immediate place where events are happening now.
- **D-03:** Characters are part of a scene because they are really there and can act in it, not because the player has already noticed them.
- **D-04:** The world must not be built around the player’s awareness. A character can be present in the scene before the player realizes it.

### Perception Model
- **D-05:** Player-facing text may include only what the player character could realistically notice in the moment.
- **D-06:** Perception is broader than direct sight. It can come through sound, vibration, pressure, smell, visible aftermath, shouted warnings, magical energy, cursed energy, aura, chakra, or other world-specific sensory channels.
- **D-07:** Perception must use a lightweight hidden-check / heuristic layer rather than a heavyweight simulation system.
- **D-08:** The target is an 80/20 result: believable perception rules without turning the game into a giant math monster.
- **D-09:** A character’s abilities, perks, instincts, and energy-sensing traits may let them notice things an ordinary person would miss, but this must not become omniscience.

### Knowledge Boundaries
- **D-10:** NPCs are not allowed to know about another actor just because both are somewhere inside the same large location.
- **D-11:** NPC knowledge must have a basis: direct contact, current perception, reputation, prior meeting, second-hand report, or a world-specific recognition method that makes sense.
- **D-12:** “Key NPC” status is not itself a valid reason for extra knowledge.
- **D-13:** Knowledge and presence are separate layers. Someone can be present in the scene without yet being known or recognized.

### Hidden Participants
- **D-14:** Hidden or unnoticed characters must still count as real participants in the current scene.
- **D-15:** They can listen, move, choose positions, prepare actions, and react before the player notices them.
- **D-16:** The player should only receive the amount of information their character could actually perceive: footsteps, a shadow, a pressure shift, a strange presence, a sudden interruption, and so on.
- **D-17:** The system should never “turn off” real scene participants just because they are not yet visible in the narration.

### the agent's Discretion
- Exact hidden-check representation and how much is explicit vs heuristic
- Exact thresholds or bands for ordinary senses versus supernatural/energy senses
- Exact data model for “present but unnoticed” actors
- Exact prompt/API/UI surfaces used to expose partial awareness without leaking hidden state

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone and phase scope
- `.planning/ROADMAP.md` — Phase 46 goal, success criteria, and dependency on Phases 43 and 45
- `.planning/REQUIREMENTS.md` — `SCEN-02`
- `.planning/STATE.md` — current repaired baseline through Phase 45

### Prior phase decisions this phase builds on
- `.planning/phases/43-travel-and-location-state-contract-resolution/43-CONTEXT.md` — large locations, persistent sublocations, and ephemeral scene locations
- `.planning/phases/45-authoritative-scene-assembly-and-start-of-play-runtime/45-CONTEXT.md` — single-pass scene assembly, player-perceivable consequences, and one causal world
- `.planning/phases/45-authoritative-scene-assembly-and-start-of-play-runtime/45-VERIFICATION.md` — confirmed Phase 45 runtime contract now in place

### Normative gameplay docs
- `docs/mechanics.md` — current gameplay baseline for world/location model, world-information-flow, and present-scene narration expectations
- `docs/memory.md` — prompt assembly and restore baseline, especially the current `[NPC STATES]` and `[SCENE]` contract

### Runtime seams that this phase must repair
- `backend/src/engine/scene-assembly.ts` — current scene assembly and “present NPC” reads
- `backend/src/engine/prompt-assembler.ts` — current prompt contract that still treats current-location NPCs as present in-scene
- `backend/src/engine/npc-agent.ts` — current in-scene NPC context loading via same-location membership
- `backend/src/engine/npc-offscreen.ts` — current off-screen split defined only by not sharing the player's location

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `scene-assembly.ts` already separates real scene assembly from final narration, so Phase 46 can refine scene membership without reopening the whole turn contract.
- `npc-agent.ts` and `npc-offscreen.ts` already split “currently in-scene” versus “not currently in-scene,” which gives a place to introduce better encounter boundaries.
- The location model from Phase 43 already distinguishes large places from more local spaces, so Phase 46 does not need to invent that foundation from scratch.

### Established Patterns
- The current runtime still decides “present in scene” mostly by sharing the same broad location.
- Prompt assembly still treats the NPC list at the player's current location as the scene cast.
- The world already has a notion of player-perceivable consequences from Phase 45; this phase should refine that, not replace it.

### Integration Points
- `scene-assembly.ts` is the likely seam for turning “everyone in the same location” into “the actors actually in this local scene”
- `npc-agent.ts` is the likely seam for nearby participants, partial awareness, and hidden participants who can still act
- `prompt-assembler.ts` is the likely seam for ensuring narration and NPC reasoning only receive the knowledge they are allowed to have
- `npc-offscreen.ts` is the likely seam for deciding when someone stops being off-screen and starts being part of a local encounter

</code_context>

<specifics>
## Specific Ideas

- The user wants a world where being in “Shibuya” does **not** mean immediately sharing one room-like scene with every important character in Shibuya.
- A character being present and a character being noticed are different things and must stay separate.
- Perception should support ordinary senses and world-specific senses such as magical or energy awareness, but without becoming a giant simulation engine.
- The system should do the minimum amount of hidden checking needed to produce believable scenes and reactions.

</specifics>

<deferred>
## Deferred Ideas

None. The discussion stayed inside Phase 46.

</deferred>

---

*Phase: 46-encounter-scope-presence-and-knowledge-boundaries*
*Context gathered: 2026-04-12*
