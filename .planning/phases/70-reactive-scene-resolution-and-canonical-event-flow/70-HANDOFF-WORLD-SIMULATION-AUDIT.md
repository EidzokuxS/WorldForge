# Phase 70 Handoff: World Simulation Audit Before Implementation

**Status:** handoff / archive context  
**Date:** 2026-04-25  
**Purpose:** preserve the corrected design problem before starting a fresh context window

## Why This Exists

The current Phase 70 draft is useful, but it is still too eager to prescribe a pipeline. Before implementation, the next cycle must step back and audit the entire world-simulation chain.

The actual task is not "implement reactive scene resolution" yet.

The actual task is:

> Walk every link in the generation and simulation chain, justify why it exists, decide whether it belongs in the deterministic engine or in an LLM call, and remove or merge anything that adds complexity without improving the player's lived experience.

WorldForge needs a world that behaves coherently, not a stack of 124 micro-systems where every stage can lose context, fail validation, duplicate reasoning, or produce a slightly incompatible interpretation of the same moment.

## Corrected Mental Model

### The player turn is not the center of the universe

The player's input is not "the main event of the world." It is a point where time resumes from the current world state.

Correct framing:

1. The world is in state `T`.
2. The player adds an action, utterance, or intent at that moment.
3. Time resumes from `T + player input`.
4. Relevant actors act, perceive, react, ignore, misunderstand, or continue their own business.
5. The system advances to the next natural point where returning control to the player makes sense.

The same conceptual model should apply to NPCs. They are also actors in the world, not decorative response generators. Their turns may not be visible to the player, but they should still flow from state, perception, motives, opportunity, and capability.

### The player sees a slice, not the whole truth

The final message should not expose everything that happened. It should expose the slice that is:

- perceivable by the player character
- relevant enough to understand the next moment
- written clearly enough that the player does not feel like a hidden cutscene was skipped

Other facts can exist in world state without being narrated immediately.

### NPCs need their own perception, not player-derived truth

Nearby characters should not act from a blank or omniscient state. Each actor should reason from:

- what they can see
- what they can hear
- what they can sense through powers, tools, networks, magic, chakra, cursed energy, cameras, phone calls, etc.
- what they knew before
- what they infer from their personality, intelligence, goals, and biases

This means visibility/perception is not only a player-facing filter. It is part of actor simulation.

### Remote involvement is valid if there is a channel

An actor does not need to be physically standing in the local scene to matter.

They can affect or perceive the scene through:

- phone / comms / network
- long-range power
- surveillance
- teleportation
- magic or supernatural sense
- messenger / report / rumor
- environmental consequence from elsewhere

The important rule is not "off-stage actors cannot act." The important rule is:

> Any involvement needs a concrete channel that exists in the world and is legible to the simulation.

### Avoid combat/action bias

The system must support combat, but it cannot be built as if every scene is a combat escalation.

Universal questions are:

- what changed?
- who perceived it?
- who learned something?
- who changed intent?
- what opportunities opened or closed?
- what consequences now exist?
- where is the next natural point for player agency?

Scene-specific questions like "did danger increase?" or "who escalated?" are only relevant when the genre, scene, or action actually makes them relevant.

## Core Design Problem

We need a world model that is:

- coherent enough to produce believable cause and effect
- simple enough to maintain and debug
- predictable enough that live play does not become random LLM theatre
- flexible enough that the game can handle conversation, travel, investigation, politics, romance, comedy, horror, combat, and off-screen world activity
- not so rigid that every player action must be forced into narrow enums like `greeting`, `threat`, `attack`, or `deflection`

The next cycle must decide what the engine owns and what LLMs own.

## Engine vs LLM Boundary

### Keep in the engine when it must be stable

The engine should own things that need consistency, auditability, restore safety, or deterministic application:

- authoritative state storage
- current location / scene / actor records
- known channels of perception or communication
- inventory, HP, conditions, explicit flags
- tick boundaries and save/restore
- deterministic application of committed changes
- validation of whether an output references real actors, locations, items, or powers
- event persistence and query
- rollback / retry / checkpoint behavior

### Use LLMs when interpretation is the hard part

LLMs should own or assist with things that are semantic, fuzzy, or literary:

- interpreting what a freeform player action means in context
- determining likely intent when not explicit
- estimating what an actor would try given goals/personality/perception
- compressing world context into a usable decision frame
- choosing narratively natural stopping points
- writing final prose from committed facts

### Be careful with LLMs as simulators

LLMs are useful for judgment, but weak as unbounded simulators:

- they are not reliably initiative-driven
- they tend toward deterministic repetition under similar inputs
- they can invent connective tissue
- they can overfit to dramatic tropes
- they can make every actor sound like the same narrative voice
- they can lose hard state unless the engine pins it down

So the question is not "LLM or engine?" but:

> Can the LLM make a bounded judgment from a well-shaped packet, and can the engine validate and commit the result?

## Open Audit Questions

The next cycle should answer these before building.

### 1. What is the minimal world state?

For every proposed state field, ask:

- What gameplay or narrative decision uses it?
- Who reads it?
- When does it change?
- What breaks if it is absent?
- Can it be derived instead of stored?
- Is it player-visible, actor-visible, or engine-only?

Candidate state categories to audit:

- actor location
- local scene membership
- perception channels
- actor goals
- active intent
- relationships
- recent events
- unresolved scene tensions
- faction/world events
- known facts / memories
- environmental state
- temporary conditions

Do not add fields because they sound like a complete simulation. Add them only when they carry real runtime value.

### 2. What is a "turn"?

The current player-facing turn should be reframed as a short time advance.

Questions:

- How much time can pass during one turn?
- Who gets considered during that time?
- When is the turn naturally over?
- What makes control return to the player?
- Does the game need a fixed time unit, or an elastic narrative time slice?
- How do NPC-only changes occur between player-visible turns?

Likely answer to explore:

- use elastic narrative time slices
- keep deterministic tick boundaries for persistence
- let LLM help choose the natural stopping point
- keep engine responsible for committing what happened

### 3. How should player action interpretation work?

Avoid a hard enum as the primary model.

Useful output should be more like:

- plain-language interpretation
- affected subjects, if any
- affected situation, if any
- physical / social / informational / supernatural scale
- expected duration
- perceivable signals produced by the action
- possible ambiguity

The action target may be:

- a specific actor
- a group
- the player themself
- an object
- a location
- a situation
- an abstract pressure
- no direct target

The system must not force every action into a concrete target slot.

### 4. How should actor participation work?

Avoid the simplistic rule "only local actors may react."

Better question:

- Who can perceive this?
- Who has a channel to act on it?
- Who has motive to act now?
- Who has opportunity to act within this time slice?
- What would make their involvement legible to the player or to other actors?

Actors can be:

- physically present
- present but not engaged
- observing remotely
- capable of remote influence
- affected indirectly
- unrelated for this time slice

### 5. How much should be shown in the final narration?

The answer is not "show only one primary reaction."

The answer is:

- show enough for the scene to be readable
- show all player-perceivable events needed to understand the next moment
- do not show hidden state as if the player perceived it
- do not summarize skipped unseen action as aftermath
- keep prose length proportional to actual complexity

If five characters must respond and the scene genuinely supports it, five can respond. The problem is not count. The problem is incoherent sequencing and unclear causality.

### 6. How should big-world activity reach local scenes?

The world can live separately, but it is not sealed off.

Big-world events can reach local scenes through channels:

- sound
- visible environmental change
- messages
- rumors
- NPC arrivals
- panic / crowd movement
- magical or technological sensing
- faction response

The engine should not dump broad world events into local narration without a channel.

## Candidate Shape to Evaluate

Do not treat this as final architecture. Treat it as a candidate to critique.

1. Read current authoritative world state.
2. Interpret player input as a flexible semantic event.
3. Determine the relevant time slice.
4. Determine relevant actors by perception, motive, opportunity, and channels.
5. Ask bounded LLM judgment for what likely happens in that slice.
6. Validate actors, channels, and proposed changes against engine state.
7. Commit canonical events and state changes.
8. Build player-perceivable narration packet.
9. Ask storyteller to render only that packet.
10. Save enough event/state data for the next turn and for other actor reasoning.

The crucial question:

> Can steps 3-5 be merged into one strong bounded "world step" LLM call without losing debuggability?

That may be the right simplification if the packet is well-shaped and the engine validates the output.

## What Must Not Happen

- Do not create 10 new LLM calls for one turn unless there is a clear reason.
- Do not split the system into so many "smart" stages that each one invents a different interpretation.
- Do not force every action into narrow enums.
- Do not make combat assumptions universal.
- Do not make the player the only actor with perception.
- Do not make off-stage actors irrelevant by definition.
- Do not let the narrator invent state or causality.
- Do not store world fields that no later decision uses.
- Do not add abstractions that cannot be explained in one paragraph.

## Proposed Next Task

Create a real GSD discussion/planning cycle for:

**World Simulation Data Flow and Minimal Runtime Authority**

The output of that cycle should be a decision document, not implementation first.

Required sections:

1. **World State Inventory**
   - what state exists now
   - what state is missing
   - what state is useless or duplicated
   - what must be stored vs derived

2. **Turn Time Model**
   - what a player-visible turn represents
   - how time advances
   - how NPC actions fit without creating hidden cutscenes

3. **Actor Perception Model**
   - how player/NPC/faction perception differs
   - how local and remote channels work
   - how hidden facts stay hidden

4. **LLM Responsibility Map**
   - which judgments are safe to give to LLMs
   - which judgments must be engine-validated
   - which decisions must remain deterministic

5. **Canonical Event Model**
   - what counts as an event
   - what gets committed
   - what gets narrated
   - what gets remembered

6. **Complexity Budget**
   - target number of LLM calls for a normal turn
   - max number before the design is rejected
   - failure modes and fallback behavior

7. **Migration Path**
   - smallest code change that improves live play
   - what old pieces can be retired
   - what must remain until replacement is proven

## Success Criteria for the Next Cycle

The next cycle is successful only if it answers:

- What is the simplest world model that can still feel alive?
- Which pieces of current runtime are real value and which are accidental machinery?
- Where exactly should LLM judgment happen?
- What exactly should the engine validate and commit?
- How does a player turn advance time without turning into a hidden cutscene?
- How does final narration stay readable without becoming the simulation engine?

If those are not answered, implementation should not start.

## Current Related Drafts

- [70-DISCUSSION-LOG.md](/R:/Projects/WorldForge/.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-DISCUSSION-LOG.md)
- [70-CONTEXT-DRAFT.md](/R:/Projects/WorldForge/.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-CONTEXT-DRAFT.md)
