# Phase 45 Discussion Log

Date: 2026-04-12
Mode: interactive discuss

## Prompted Gray Areas

1. Turn sequencing relative to local NPC/world changes
2. Source of the opening scene text
3. Boundary for what off-screen changes may enter narrated output

## Decisions

### 1. Sequencing

Decision:

- settle the player action and all locally perceivable scene changes first
- then run one final storyteller pass

Rejected:

- narration that begins before local scene state is settled
- scene text that is later amended by local NPC/world follow-up tails

### 2. Opening scene source

Decision:

- the first playable message must come from opening runtime state, not from the premise blob

Required opening inputs:

- start location
- immediate situation
- entry pressure
- visible local actors
- visible local events

Premise role:

- background truth for engine/prompting only
- not the text that gets printed to begin play

### 3. Off-screen world changes and narrated visibility

Clarification from user:

- same-location is not the right boundary
- direct witnessing is not the only valid perception path
- a neighboring catastrophe can still be narrated if the player could realistically perceive its effects

Decision:

- the correct boundary is player-perceivable consequence
- off-screen events affect world state regardless
- they enter narrated scene text only if they are perceivable from the current scene

### 4. Unified world contract

Clarification from user:

- the game must feel like one living world whose debits and credits line up, not a loose bundle of independent actions

Decision:

- present-scene and off-screen NPC/world processing must remain one causal world
- simulation depth may differ, but causality and later reconciliation may not
- the storyteller must narrate from assembled world consequences rather than inventing a separate literary branch
