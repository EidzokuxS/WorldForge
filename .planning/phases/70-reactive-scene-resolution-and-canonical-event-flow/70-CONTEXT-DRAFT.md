# Phase 70 Draft: Reactive Scene Resolution and Canonical Event Flow

## Diagnosis

The core failure is not that too many systems run; it is that the runtime still lacks a clean canonical event flow for the live local scene. A player turn can fail to create a meaningful canonical anchor, key NPC autonomy can then seize the scene as an independent mini-round, and the storyteller receives enough hidden aftermath to summarize consequences without ever presenting the readable action -> reaction chain that produced them. The result is not a living world; it is a world whose causality is legible mostly to the backend and only loosely reconstructed in prose.

## Design Goals

- Preserve the living-world premise: the world does not revolve around the player.
- Preserve Phase 69 ownership: narrator does not decide events.
- Make the local live scene readable as cause and effect.
- Let key/supporting NPCs remain real actors, not decorative mannequins.
- Separate local scene resolution from broader world progression.
- Keep the runtime narrative-first instead of building a crunchy global combat simulator.

## Non-Goals

- No full all-actor simultaneous simulation every player turn.
- No universal initiative system for every scene.
- No rewrite of DB schema or route transport as part of the initial step.
- No storyteller-side invention of hidden state to patch causal gaps.

## Proposed Runtime Contracts

### 1. Scene Roster Contract

Every live player turn operates on a bounded `scene roster`, not on a macro-location bucket.

The roster should contain:

- `activeActors`
  - actors currently entitled to take scene-changing action in the local scene
- `supportActors`
  - actors present and perceivable, but not automatically entitled to seize the turn
- `backgroundActors`
  - actors nearby or in the broad location, but not yet in live scene exchange

An actor should not become `active` just because they share `Tokyo` or another broad location id.

### 2. Event Anchor Contract

Every player turn should produce one canonical `anchor event packet`, even if the action is social, evasive, or low-intensity.

The anchor packet should answer:

- what the player attempted
- against whom or toward what
- what immediate world meaning the action had
- whether it changed tension, posture, information state, or scene focus
- whether it opened a reaction window

If the player spoke, the anchor event can still be:

- `social probe`
- `deflection`
- `challenge`
- `claim of identity`
- `non-escalatory interruption`

But it should not collapse to "nothing happened" unless the action was literally a no-op.

### 3. Reactive Response Contract

The same visible turn may include only bounded **reactive** local responses to the anchor event.

Response types:

- `primary response`
  - one scene-changing answer or interruption
- `support response`
  - zero to two supporting beats that clarify stance, attention, or pressure without independently rewriting the scene
- `deferred response`
  - anything important but not entitled to resolve inside the same visible turn

This is a stricter version of Gemini's "Rule of One," but not as blunt:

- one primary scene-changing response
- small support budget
- everything else deferred

### 4. Canonical Event Packet Contract

Before narration, the runtime should produce a committed packet like:

- `anchorEvent`
- `resolvedPrimaryResponse`
- `supportResponses[]`
- `visibilityMap`
- `tensionDelta`
- `sceneStateDelta`
- `unresolvedHooks[]`

This packet is the source of truth for narration.

### 5. Narrator Packet Contract

The storyteller should only receive:

- canonical committed events
- perceivable scene state
- addressee / speaker topology
- unresolved tension hooks

It should not receive free authority to infer additional hidden actor moves just because they would sound dramatic.

### 6. Planner-of-Record Contract

For the local visible scene, there should be one planner-of-record for scene-changing action selection.

That does **not** mean one LLM decides the entire world forever. It means:

- the player anchor
- the eligible local NPC responses
- the selected primary/support/deferred split

must pass through one canonical planning seam before deterministic execution.

This is the cleanest way to avoid:

- `player anchor says nothing happened`
- followed by a second autonomous stage where multiple key NPCs freely seize the scene

The migration can still be staged, but the target contract should be unified.

## Proposed Target Pipeline

1. **Scene Scope Resolution**
   - resolve current live scene roster:
     - active
     - support
     - background
   - broad location membership alone is insufficient

2. **Player Intent Resolution**
   - resolve target/context
   - build player-local action meaning
   - produce a canonical anchor event candidate

3. **Oracle / Judge Adjudication of Player Anchor**
   - determine outcome tier and immediate scene meaning
   - commit an anchor event packet, even for social or non-hostile turns

4. **Reactive Local Actor Collection**
   - query only `activeActors` and optionally selected `supportActors`
   - ask for reactions to the committed anchor event, not free independent turns
   - this can be implemented either as:
     - temporary per-actor collection feeding one shared filter layer, or
     - the longer-term preferred shape: one planner-of-record call over the full authorized slate

5. **Reaction Filtering and Ordering**
   - classify responses into:
     - primary
     - support
     - deferred
   - select at most one primary response for the visible turn
   - keep small support beat budget

6. **Deterministic Execution**
   - execute:
     - anchor delta
     - primary response delta
     - support response deltas that are explicitly allowed
   - defer everything else

7. **Canonical Scene Packet Assembly**
   - build the packet the narrator is allowed to see
   - include explicit visibility and addressee data

8. **Visible Narration**
   - narrate only the committed packet
   - stop at the newly created unresolved tension if escalation occurred

9. **World Tick / Off-Stage Progression**
   - process broader world and off-stage actor intents outside the immediate live scene loop
   - surface their consequences later through arrival, rumor, environment change, or follow-up scenes

## Stage Authority Rules

### Scene Scope Resolver

Allowed to decide:

- who counts as active/support/background in the local scene
- whether an actor is entitled to react right now

Forbidden to decide:

- dramatic outcomes
- combat results
- narration

### Player Anchor Adjudication

Allowed to decide:

- what the player's action means in scene terms
- whether it opens a reaction window
- whether it changes tension, footing, information, or stakes

Forbidden to decide:

- what every NPC now does in detail
- prose narration

### Reactive Actor Collection

Allowed to decide:

- what each eligible actor would like to do in response to the anchor event

Forbidden to decide:

- final ordering
- whether all collected responses become visible in the same turn
- independent scene ownership outside the planner-of-record path

### Reaction Filter / Ordering Layer

Allowed to decide:

- which response is primary
- which responses are support
- what must be deferred
- whether conflict ordering logic is needed

Forbidden to decide:

- prose
- hidden facts not present in the collected responses and anchor packet

### Backend Executor

Allowed to decide:

- deterministic application of already approved deltas

Forbidden to decide:

- new dramatic intent

### Storyteller

Allowed to decide:

- wording
- pacing inside the packet
- sensory framing
- paragraph structure

Forbidden to decide:

- who suddenly acts
- why a new escalation happened
- who was present if not in roster/visibility packet
- aftermath of actions the player was not shown as initiated
- causal glue that is not supported by the canonical event packet

## Multi-Actor Resolution

### Default Rule

Most normal turns should not be treated as open simultaneous all-actor resolution windows.

The default should be:

- one anchor event
- one primary local response
- limited support beats

### When Several Actors Matter

If multiple actors truly compete in the same moment, use a lightweight ordering layer based on:

- scene entitlement
- awareness / readiness
- distance / proximity
- explicit hostility
- speed / combat posture only if conflict is already live

This ordering layer should activate only for contested moments, not for all turns.

### Supporting NPCs

Supporting NPCs should usually contribute as:

- support response
- signal / warning / flinch / assist / observation

They should not seize primary response priority unless:

- they are directly targeted
- they hold the most immediate local leverage
- they trigger a new explicit interruption event

### Key NPCs

Key NPCs may more often win primary response priority, but they should still be constrained by:

- scene roster
- entitlement
- reaction gating
- visibility rules

They are actors, not automatic spotlight owners.

## Scene / Presence Rules

### Entry

An actor needs a concrete basis to enter the active scene:

- they were already in the active roster
- they were clearly perceivable in the last committed scene state
- a canonical event explicitly brought them in

No silent teleportation into dialogue authority.

### Presence

Broad location membership is not enough. Presence should be local and justified.

The system should preserve separate concepts for:

- location membership
- local scene presence
- player perception
- actor-to-actor awareness

### Focus

The scene should maintain a current focal knot:

- player vs actor
- player entering existing local exchange
- actor vs actor with player as observer

The runtime should prefer continuing the focal knot before widening the cast.

### Escalation

Escalation should require a trigger chain:

- anchor event
- actor entitlement
- actor motive/posture
- selected response

No free dramatic lurches because an autonomous actor happened to think of something flashy.

## Narrator Contract

The narrator may:

- describe the committed anchor event
- describe the committed primary response
- mention support responses that were executed
- emphasize tension that now exists
- end on an unresolved escalation hook

The narrator must never:

- invent an unseen initiating action
- narrate aftermath before the player has seen the initiation
- add new speaking participants that were not properly in view
- imply that an actor responded if the actor had no canonical response in the packet
- summarize a hidden mini-round that the player never witnessed

The desired result is not slower prose. It is readable causality.

## Migration Plan

### Phase A — Player Anchor Hardening

Objective:

- make sure a player turn produces a canonical anchor packet even for social / neutral / evasive actions

Deliverables:

- no more `neutral utterance -> zero hidden actions -> free NPC mini-round`
- explicit anchor semantics in hidden state

### Phase B — Reactive Local Response Filter

Objective:

- replace "tick every key NPC in scene after player turn" with bounded reactive collection and filtering

Deliverables:

- primary response selection
- support response budget
- deferred response queue
- migration path away from independent free key-NPC live scene ticks

### Phase C — Scene Roster and Entitlement Tightening

Objective:

- harden active/support/background actor membership and scene-entry rules

Deliverables:

- actors no longer gain live dialogue/action authority merely from broad co-location

### Phase D — Narrator Packet Enforcement

Objective:

- make storyteller consume canonical scene packets only

Deliverables:

- no more skipped-cutscene aftermath prose
- no more unintroduced reaction speakers

### Phase E — Off-Stage World Tick Separation

Objective:

- move broader world progression outside the immediate local scene loop

Deliverables:

- local scene readability without sacrificing living-world behavior

## Risks and Critique

- If the response filter is too strict, scenes may feel under-reactive or sanitized.
- If support beat budget is too loose, the system will drift back into pseudo-round-robin ensemble narration.
- If player anchor semantics are weak, the new pipeline still collapses because there is nothing solid for reactions to attach to.
- If we keep independent post-player key-NPC live ticks too long during migration, the architecture will continue to leak the very failure we are trying to remove.
- If off-stage progression is separated badly, the world may feel static between player turns.
- If narrator packet assembly leaks hidden rationale or deferred responses, the visible prose will start inventing again.

## Preferred Planning Direction

If this draft becomes a real phase, the first implementation target should be:

- **player anchor hardening + reactive local response filter**

That is the smallest meaningful cut that can change the lived feel of a scene without demanding a total runtime rewrite.
