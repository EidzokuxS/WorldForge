# Phase 70: Reactive Scene Resolution and Canonical Event Flow - Discussion Log

> **Draft discussion artifact.** This phase is not yet added to the roadmap. The proposed design lives in [70-CONTEXT-DRAFT.md](/R:/Projects/WorldForge/.planning/phases/70-reactive-scene-resolution-and-canonical-event-flow/70-CONTEXT-DRAFT.md).

**Date:** 2026-04-22  
**Candidate phase:** 70-reactive-scene-resolution-and-canonical-event-flow  
**Discussion mode:** autonomous draft; user explicitly requested Claude + Gemini consultation and a concrete system draft

---

## User Direction

- The problem is not that the world acts without the player. That is a feature.
- The problem is that the live scene flow reads like disconnected bullshit:
  - the player does not understand why particular NPCs are present
  - neutral player actions can be followed by abrupt combat escalation
  - multiple key NPCs seem to act in sequence without reacting to one another coherently
  - final narration can read like the player skipped a cutscene and only saw the aftermath
- The user wants a system where data has narrative value:
  - what happened
  - why it happened
  - who was present
  - who perceived it
  - what became canonical
  - only then how it is narrated
- Key NPCs are also actors under the same world rules; the player is not the sole driver of the world.
- The user explicitly deprioritized reasoning inspection for this cycle. The urgent question is generation/runtime flow.

## Runtime Evidence

The current runtime after Phases 68-69 still shows these failure patterns in live logs and play:

- Neutral player utterance can produce `judge.hidden.plan` with zero actions.
- The same turn can then immediately trigger multiple key-NPC ticks.
- Those key-NPC ticks can independently invent major escalations.
- Final narration can report aftermath instead of a readable action -> reaction sequence.
- Broad locations can still feel over-collapsed at the lived scene level, even if scope seams exist structurally.

This produces a scene that is mechanically busy but causally unreadable.

## External Reviewer Notes

### Claude CLI

- Initial invocation failed because it was run with `--bare`.
- In this CLI, `--bare` disables OAuth/keychain auth and requires explicit API-key auth.
- After rerunning with normal headless `claude -p`, Claude responded successfully.

Claude's strongest conclusions:

- the runtime is still temporally flat
- there is no single planner-of-record for the visible scene
- narrator still has too much connective freedom because it is reconstructing causal flow from final state

Claude's most useful design suggestions:

- treat the live turn as one ordered pipeline, not player-turn plus separate free NPC stage
- introduce a single canonical event log built incrementally during the turn
- move key-NPC scene action inside the same judge-owned planning pass instead of independent post-player ticks
- give the narrator only event-log-backed inputs, not raw downstream state

Claude's main weakness:

- its "single planner-of-record" design is strong, but its proposed `Director -> Judge -> EventLog` split risks becoming too abstract if implemented too literally in one shot
- the `world-brain` demotion needs care so we do not thrash recent Phase 68 work unnecessarily

### Gemini CLI

Gemini's strongest conclusions:

- The current failure behaves like a simultaneous batch of unrelated intents being summarized after the fact.
- A better shape is reactive, not independent-parallel by default.
- The live turn should resolve around a primary event and a bounded response, not an open mini-round from every important actor.
- Off-stage world activity should be decoupled from the live local scene loop.

Gemini's most useful design suggestions:

- move to an event-driven reactive loop
- keep only on-stage actors in the immediate live reaction seam
- cap major NPC escalation per player turn
- make the narrator stop at the first meaningful new escalation instead of summarizing its aftermath

Gemini's main weakness:

- its raw "Rule of One" recommendation is directionally correct but too blunt if taken literally
- a total single-response cap risks making multi-actor scenes feel inert or fake
- the design needs a richer distinction between:
  - canonical event-changing reactions
  - support beats / flavor beats
  - off-stage/world-tick consequences

## Internet References

- [D&D Basic Rules: Playing the Game](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game)
  - useful because the core loop is still: players act, the DM determines results, then narrates results
- [The Alexandrian: Don’t Prep Plots](https://thealexandrian.net/wordpress/4147/roleplaying-games/dont-prep-plots)
  - useful because it reinforces situation-first causality instead of pre-authored dramatic sequencing
- [The Angry GM: Declare, Determine, Describe](https://theangrygm.com/declare-determine-describe/)
  - useful because it frames narration as the final descriptive step after action and determination

These all support the same architecture principle:

- decide what happened first
- commit canonical consequences
- narrate second

## Consensus

The design draft for the next runtime step should be:

1. keep the Phase 69 ownership split
   - judge/world decides
   - backend executes
   - storyteller narrates
2. stop treating post-player key-NPC activity as an automatic free mini-round
3. make the player turn produce a canonical event anchor
4. allow only bounded reactive local responses to that anchor during the same visible turn
5. split live local scene resolution from broader world progression
6. give narration only canonical, visibility-filtered event packets
7. converge toward a single planner-of-record for local visible-scene action selection, even if migration is staged

## Explicitly Rejected

### Option A — Keep the current structure and only tune storyteller prompts

Rejected because:

- the failure is structural, not merely stylistic
- better prose does not fix missing causal ordering or missing canonical event packets

### Option B — Full simultaneous all-actor simulation every turn

Rejected because:

- too expensive and too risky for the existing codebase
- likely to create more unreadable aftermath rather than less
- overkill for ordinary conversational or lightly tense scenes

### Option C — Hard initiative/combat-order for every turn in the whole game

Rejected because:

- too crunchy
- wrong fit for the product
- normal scenes should stay narrative-first, with stronger ordering only when conflict actually demands it

---

*Candidate phase: 70-reactive-scene-resolution-and-canonical-event-flow*  
*Logged: 2026-04-22*
