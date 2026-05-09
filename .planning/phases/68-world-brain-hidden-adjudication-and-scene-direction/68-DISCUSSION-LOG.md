# Phase 68: World Brain Hidden Adjudication and Scene Direction - Discussion Log

**Recorded:** 2026-04-20
**Status:** Stable input for planning

## User Direction

- The problem is not latency, cast size, or "the world should revolve around the player."
- The real failure is that scenes often read like incoherent bullshit:
  - people are present without a believable reason
  - actions appear from nowhere
  - characters react in sequence instead of inside one shared situation
  - dialogue loses its addressee
  - prose describes pose/atmosphere instead of an event that makes sense
- The user wants `WorldForge`, not a verbose storyteller. Data must exist because it matters to:
  - what the world decides
  - what NPCs do
  - what the player can perceive
  - what later narration can honestly say happened
- The user explicitly wants a split between:
  - a `GM / world-brain` layer that decides why events happen
  - a `storyteller` layer that only narrates already-decided outcomes
- Key NPCs are not decorative. They are also players inside the world and must act under the same world rules.

## Claude CLI

Claude's scene diagnosis:
- the current opening reads like a `character select screen`, not a scene
- reactions are `round-robin`, not causal
- unmotivated escalation (`Rasengan`) destroys trust
- ambiguous address (`you two`) breaks dialogue readability
- prose can be grammatically polished while remaining structurally empty

Claude's architecture view:
- separate adjudication from narration
- use a fact-first loop: intent -> adjudication -> state mutation -> narration
- narration should consume committed facts, not invent them

## Gemini CLI

Gemini's design recommendation:
- treat this as an `MVC for narrative`
- keep randomness outside narrative whim
- move to a fact-first loop:
  1. intent extraction
  2. adjudication / delta JSON
  3. state mutation
  4. scene-context assembly
  5. prose narration
- NPCs should behave like automated players using the same action/adjudication model

## Explorer Agent

The codebase-specific minimal seam:
- keep `turn-processor.ts` as orchestration spine
- add a bounded internal `world-brain` adjudication step before the current hidden tool-driving pass
- let `scene-assembly.ts` consume world-brain causal metadata as authoritative scene facts
- keep final visible narration where it is, but make it consume settled state plus world-brain direction

## Adversarial Critique

Main warning:
- do not accidentally create a second hidden storyteller
- if the world-brain is too broad, it will drift, bloat prompts, and become another source of contradictory causal fiction

Required guardrails:
- structured outputs
- bounded payloads
- traceability
- narrator cannot mutate state
- storyteller only sees committed/perceivable facts
- phase split is safer than one giant migration

## Conclusion

The consensus is:
- Phase 68 should add the `world-brain scene contract` and thread it into opening/player-turn scene assembly plus final narration inputs
- Phase 69 should migrate hidden tool-driving ownership out of the storyteller seam and finish narrator-only runtime boundaries

