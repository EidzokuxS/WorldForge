# Phase 68: World Brain Hidden Adjudication and Scene Direction - Research

**Researched:** 2026-04-20
**Status:** GO
**Research source:** user product direction, Claude CLI, Gemini CLI, D&D/GM references, local runtime inspection, explorer-agent synthesis

## Verdict

GO.

The repo already contains a partial split:
- `oracle.ts` adjudicates probability
- `turn-processor.ts` orchestrates hidden pass -> scene assembly -> final narration
- `scene-assembly.ts` builds an authoritative scene packet
- final narration prompt already forbids inventing material events outside authoritative inputs

But the missing seam is exactly the one the user is pointing at:
- **there is no dedicated world-brain layer deciding why the current scene exists and who is actually central inside it**

So the right move is not a full engine rewrite.
The right move is to insert a bounded `world-brain scene-direction` pass into the existing spine.

## External Design Guidance

### D&D / Game Master loop

The tabletop baseline is:
1. the game master describes the scene
2. the player describes what they do
3. the game master narrates the results

The critical point is that **the result is adjudicated before it is narrated**.
This matches the user's requirement that storyteller prose should not decide why something happened.

Reference:
- [D&D Beyond Basic Rules — Playing the Game](https://www.dndbeyond.com/sources/dnd/br-2024/playing-the-game)

### Situation-first prep

`The Alexandrian`'s core rule is `don't prep plots`; prep situations.
That maps directly to our problem:
- the system should not fabricate a dramatic sequence first and then pretend the world caused it
- it should establish a situation and let narration grow from what the world decided

Reference:
- [The Alexandrian — Don’t Prep Plots](https://thealexandrian.net/wordpress/4147/roleplaying-games/dont-prep-plots)

### Scene building over scriptwriting

Sly Flourish's situation-building guidance reinforces the same idea:
- build actionable situations with context and pressure
- do not try to force a pre-written dramatic beat

Reference:
- [Sly Flourish — Build Single-Encounter Situations](https://slyflourish.com/building_situations.html)

## Claude / Gemini / Agent Consensus

### Shared agreement

- narration and adjudication should be separated
- a single storyteller call is too much responsibility for a living-world game
- world facts should be committed/assembled before visible narration
- the fix must stay bounded or it will become a second hidden storyteller

### Claude emphasis

- the prose problem is structural: cast dump, rotation, unmotivated escalation, broken addressee
- a dedicated scene-causality pass is required

### Gemini emphasis

- use a fact-first pipeline
- randomness must live outside storyteller whim
- NPCs should operate as automated players under the same world rules

### Explorer emphasis

- the minimal seam is inside `turn-processor.ts`
- preserve existing routing, DB writes, and final narration guard
- thread new causal metadata into `scene-assembly.ts` and final prompt, instead of replacing the entire engine

### Adversarial critique

- do not let the world-brain grow into a second hidden story engine
- keep outputs structured, bounded, and traceable
- split the larger migration into two phases

## Recommended Phase Split

### Phase 68
- add structured `world-brain scene-direction` pass
- run it on opening/player turns
- extend scene assembly with authoritative causal metadata
- make final visible narration consume it
- add bounded observability

### Phase 69
- migrate hidden tool-driving ownership out of storyteller
- make storyteller final-visible only in runtime ownership terms
- remove old duplicated causal logic and cleanup legacy seams

## Current Architecture Review

### Player path today

1. resolve target context
2. compute optional combat envelope
3. call Oracle
4. run hidden storyteller tool-driving pass
5. settle local scene
6. assemble authoritative scene
7. run final visible narration

### Opening path today

1. assemble authoritative scene from raw opening/presence context
2. run final visible narration directly

This opening path is a major source of the "why are these four people here?" failure because narration gets a presence list without scene-causality framing.

## Recommended Implementation Shape

### 1. Add a compact structured world-brain pass

Use `safeGenerateObject` + Zod with `judge` role.
The output should answer scene-direction questions, not write prose.

### 2. Keep the current hidden pass in Phase 68

Do not rip out tool-driving yet.
Instead, make it consume world-brain direction so it stops inventing co-presence logic and reaction order from scratch.

### 3. Make scene assembly the handoff surface

`scene-assembly.ts` should combine:
- opening state
- settled tool/state effects
- recent local context
- player-perceivable consequences
- world-brain causal metadata

This should become the single packet the final narrator reads.

### 3a. Resolve contradictions in one place

If `world-brain` direction and later settled tool/state effects disagree:
- settled tool/state effects win
- `scene-assembly.ts` records/threads the committed reality only
- observability emits one compact mismatch event/flag so we can audit why the early direction became stale

This prevents the final narrator from seeing two competing cause chains.

### 4. Keep Oracle untouched

Oracle already owns chance/outcome.
Phase 68 is about scene causality, not probability.

## Risks

### Risk 1: second hidden storyteller
- Mitigation: strict schema + caps + no prose in world-brain output

### Risk 2: contradictory cause chains
- Mitigation: scene assembly prefers explicit world-brain causal metadata over loose tool-summary inference where available, but committed tool/state effects outrank both and force a compact mismatch log when they disagree

### Risk 3: observability regressions
- Mitigation: add one bounded world-brain event; do not explode the seam matrix

### Risk 4: prompt bloat
- Mitigation: reuse existing section builders and keep world-brain prompt narrower than hidden storyteller prompt

## Recommended Plan Shape

### Plan 68-01
- types/schema/contract tests for `WorldBrainSceneDirection`
- world-brain contract text

### Plan 68-02
- prompt assembly helper for world-brain
- player-turn world-brain call in `turn-processor.ts`
- scene assembly consumes world-brain metadata

### Plan 68-03
- opening-scene adoption
- final narration prompt consumes world-brain direction
- no-branch regressions

### Plan 68-04
- observability/tests/validation/closeout

---

*Phase: 68-world-brain-hidden-adjudication-and-scene-direction*
*Research completed: 2026-04-20*
