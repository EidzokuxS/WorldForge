# Campaign play research

## Decision

Build a twenty-turn playable proof before attempting broad longplay acceptance.
The proof starts from an accepted Campaign World and hands its persisted
locations, routes, actors, goals, placements, relations, and pressures directly
to play. It proves that the world can act without the player, that the player
learns about distant changes through evidence, and that each committed result
survives reload.

The later goal continues through a thirty-turn diagnostic lane, two separate
pristine sixty-turn campaigns, and a three-hundred-turn soak. Those lanes prove
durability, range, and repeatability. The first slice proves the causal spine on
which those lanes depend.

## Product contract

The player enters a world already in motion. They can help, interfere, leave,
or arrive too late. The game records each result as world state rather than
treating it as temporary narration.

The player does not receive a main quest or a world dashboard. The opening
gives them a local problem, someone visible, and a route. Other actors continue
their work whether the player accepts that problem or walks away.

The play surface follows these rules:

- Key people, support people, and collective actors all have active goals and
  take validated actions from the same world state.
- Player knowledge comes from visible aftermath, a witness, a route, or a
  location. The surface does not disclose distant actor names, goals, or world
  events before a player can perceive them.
- Each completed turn returns a durable receipt with a world version and world
  time. Reload restores the resulting state.
- A player may remain peripheral. Their absence changes which outcomes become
  possible for everyone else.

## First proof gate

### World envelope

Use a small accepted world that already meets the Campaign World build envelope:

- three reachable macro locations with directed routes and travel costs;
- one key person, two support people, and one collective actor;
- an active goal for every non-background actor;
- two pressures with different actor or location anchors.

The opening location contains one support person and one immediate pressure. A
key person and the collective begin elsewhere. Their details stay out of the
scene until a consequence reaches the player.

The opener selects its facts from persisted actor placements, goals, relations,
and pressures. It does not create a parallel scenario record. A support person
can be dealing with a local consequence of a dispute elsewhere while a key
person pursues an objective and a collective changes access to a route. The
player can engage, refuse, investigate, travel, or type a different action.

### Turn contract

```text
project current scene and known facts
-> accept a suggested or freeform player intent
-> validate and commit the player result plus elapsed time
-> resolve due actor intents from that committed version
-> commit actor results
-> project newly perceivable facts
-> narrate the committed result and return the next safe input boundary
```

The player may submit freeform text or one of four suggested actions. Suggested
choices are examples, and freeform attempts remain first-class. A bounded intent
reader maps supported text into a shared action contract. Unsupported text
returns a clear world requirement, such as a missing visible target or an
unavailable route, and leaves state unchanged.

The first shared action set is deliberately narrow:

| Intent | Rule |
|---|---|
| `observe` | Inspect direct scene facts. It advances time only when the scene requires it. |
| `move` | Traverse a known route after checking origin, route status, and travel cost. |
| `contact` | Speak, warn, bargain, or confront a present actor after checking co-location. |
| `attempt` | Carry intent, method, visible target references, and stakes to the Judge and GM. |
| `wait` | Advance time deliberately. |

The Judge and GM evaluate an `attempt` against current world facts. The
Rulebook implements a successful result through narrow typed commands only:
pressure advance, relation change, condition or status change, route or location
change, and world event. An attempt that lacks evidence or exceeds the supported
command set returns a grounded failed result without mutation.

People can choose `move`, `contact`, and `attempt` for their goals. A collective
can use `attempt` at a base or influence placement to pursue a pressure goal.
Every actor action uses the same location, route, anchor, clock, version, and
receipt checks as player actions. The action vocabulary stays small while the
player can still propose actions beyond a fixed menu.

### Actor cadence

Each non-background actor has `nextActAt`, goal priority, and one pending
intent. A time-advancing player result advances `worldTime`; travel uses the
route cost. The runtime then resolves every actor due at the committed clock,
with one action per actor in that cadence.

An actor whose action changes the current scene resolves before narration. An
off-screen actor produces a versioned proposal that commits through the same
world-version and write-scope checks. The narrator receives committed facts.
It does not settle actor action or state changes through prose.

This gives four active actors enough room to act during twenty player turns
without turning the slice into a large scheduler project. A later actor decision
packet can replace the initial deterministic goal step without changing the
authority boundary.

### Perception and visible feedback

Each committed event records its cause, affected world entity, before and after
state, and an exposure rule. The first slice needs four exposure rules:

| State change | Player sees it when |
|---|---|
| Local actor or pressure action | They are at the affected location. |
| Route state change | They inspect or try to use that route. |
| Witness report | They talk to a present actor who has the report. |
| Location aftermath | They enter the affected location. |

The system stores an observation when the player first sees a fact. The journal
then retains that observation. The scene continues to hide global event logs,
hidden actors, and unperceived pressures.

Use the play stage, scene card, presence chips, suggested choice cards, freeform
input dock, and journal drawer from `docs/UI Concept.html`. The scene card shows
the current location, direct pressure, visible routes, and present actors. The
turn result shows elapsed time and exposed consequences. Debug data, provider
trace, and hidden state stay out of the player surface.

### Opening

The player chooses a generated starting location and supplies a short
arrival or role prompt. They can accept a default peripheral role when they do
not want to author one. The opening planner selects one visible support person,
one immediate pressure, one visible route, and one off-screen consequence from
the accepted world.

The first screen answers four practical questions: where the player is, what is
happening now, who is visibly involved, and what they can try. It does not give
a roster or a lore briefing. Suggested choices may include asking the support
person, inspecting the local consequence, taking a route, or waiting while the
world proceeds.

### Failure and recovery

A failed action commits a consequence such as elapsed time, altered route
access, changed trust, or a pressure that has progressed. The player can observe,
wait, choose another route, speak to another actor, or accept the changed
situation. The slice avoids a mandatory success path.

An overwhelmed player returns to a valid nearby scene with the consequence
preserved. A transport or persistence fault returns no narration or turn receipt
until a transaction succeeds. Reload after a completed receipt restores the
scene, clock, actor state, pressure state, and known observations.

## Twenty-turn evidence

| Checkpoint | Required player-observable proof |
|---|---|
| Turn 1 | The opening has a playable scene, a visible support actor, a local pressure, a route, four suggested actions, and freeform input. Distant actors and global pressure data remain hidden. |
| Turn 5 | An actor action has changed a persisted route, pressure, location state, or relation. Ignoring the opening and intervening in it lead to different local consequences. Reload preserves the chosen result. |
| Turn 10 | A distant actor or collective action has changed canonical state. The player learns about it only through travel, route inspection, or an eligible witness. The journal records the first exposure. |
| Turn 20 | Every key, support, and collective actor has advanced or revised a goal through the shared resolver. The player can identify two causal chains, including one affected by their action and one that resolved without them. Reload preserves clock, positions, goals, pressures, and observations. |

The proof passes when a player can explain why the world changed, what they did
that mattered, and what happened without them. The evidence bundle contains the
transcript, per-turn receipts, state deltas, world clock and version, reload
proof, and human notes.

## Evidence after the first gate

The next lanes expand the same contracts. They do not replace them.

### Thirty-turn diagnostic lane

Use diagnostic runs to find broken pacing, hidden-state leaks, invalid receipts,
unsupported freeform input, and actor scheduling defects. Cover movement across
multiple locations, a visible actor interaction, support actor materialization
or a clear no-match result, an ordinary scene affordance, and a background world
signal. Diagnostic findings become focused regressions before a pristine run.

### Two pristine sixty-turn campaigns

Run two fresh generated campaigns through sixty manually chosen turns. Each lane
must remain readable and continuous, with no player-facing failed turn, invalid
world mutation, hidden/private leak, repeated restore path, or runtime crash.
The lane records the world version, clock, campaign identifier, commit, dirty
state, transcript, receipts, state deltas, and human review notes.

### Three-hundred-turn soak

Use a separate long-horizon lane to test persistence, actor cadence, event
retention, route and location consequences, and campaign recovery under length.
The soak measures whether the same receipt and observation contracts remain
coherent after sustained world motion. It also provides the evidence needed for
claims about longplay instead of extrapolating from the twenty-turn proof.

## First-slice exclusions

The first proof gate excludes these systems because they do not establish the
initial causal spine:

- combat, injury, and tactical resolution;
- economy, crafting, and equipment progression;
- universal actor knowledge, rumor propagation networks, and full belief
  simulation;
- semantic memory, actor reflection, and model-authored long-horizon planning;
- world dashboards that disclose hidden events or goals;
- broad balance claims beyond the tested twenty-turn world.

These exclusions apply to the first proof gate. Final playability evidence must
cover the longer diagnostic, pristine, and soak lanes described above. Later
planning can add combat, economy, or richer knowledge systems when each one has
a clear owner, shared action contract, persistence path, and evidence lane.

## Research basis

This proposal follows the WorldForge product contract and accepted Campaign
World boundaries:

- `docs/concept.md` defines the single-player sandbox and durable world truth.
- `docs/mechanics.md` defines Oracle resolution, route cost, actor scheduling,
  proposal commits, and bounded world information flow.
- `docs/memory.md` defines the turn finalization and restore boundaries.
- `docs/playtest/launch-to-longplay-gameplay-contract.md` defines the launch,
  ten-turn, thirty-turn, sixty-turn, and long-horizon acceptance expectations.
- `docs/goals/campaign-world-build/PLAN.md` defines the accepted world owner,
  unified actor contract, initial goals, placements, relations, and pressures.
- `docs/UI Concept.html` supplies the player-surface visual language.

Related design references support the same restraint: Wildermyth uses bounded
procedural character stories, while Dwarf Fortress demonstrates the value of
events that arise from world state rather than detached flavor text. The slice
adopts the useful part of that lesson: record causes first, then present only
the consequences a player can encounter.
