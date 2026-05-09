# Phase 69: Judge-Owned Hidden Pass Migration and Narrator-Only Runtime - Discussion Log

> **Audit trail only.** Decisions are captured in `69-CONTEXT.md`.

**Date:** 2026-04-20  
**Phase:** 69-judge-owned-hidden-pass-migration-and-narrator-only-runtime  
**Discussion mode:** autonomous; user delegated technical choices and explicitly requested Claude Code, Gemini, and internet consultation

---

## User Direction

- The problem is not that the world acts without the player. That is a feature.
- The problem is that scenes often read like incoherent bullshit because narration is inventing causality instead of reporting adjudicated world outcomes.
- The user explicitly wants:
  - a world / judge / GM layer that decides what actually happened
  - a storyteller layer that only tells the player what happened
- Key NPCs are also actors under the same world rules; the player is not the only engine consumer.
- Work must go through GSD pipeline, not ad-hoc implementation.

## External Reviewer Notes

### Claude Code

- Phase 68 was the right bridge, but not the final architecture.
- For Phase 69, Claude preferred moving hidden adjudication to a judge-owned structured output instead of simply swapping the hidden pass to a different model role.
- Claude's strongest argument: if the hidden pass still streams tools agentically, the runtime still lets the model decide world mutations directly inside the same loop, which weakens determinism and auditability.
- Claude recommended:
  - judge emits structured adjudication plan
  - backend executes actions deterministically
  - storyteller becomes prose-only with no tools bound

### Gemini CLI

- Gemini independently chose the same option.
- It emphasized a clean `Plan -> Execute -> Describe` loop:
  - judge creates adjudication plan
  - backend enforces it
  - storyteller narrates the settled scene
- Gemini agreed that opening scenes already have the right shape after Phase 68 and do not need a hidden adjudication pass.

## Internet References

- Official D&D basic loop: DM describes scene, players declare actions, DM determines results, DM narrates results.
- The Alexandrian's situation-first prep reinforces the same shape: define situation and goals, then react to player choices instead of pre-writing scenes.
- These references support a runtime where adjudication precedes prose instead of prose inventing cause.

## Consensus

- Phase 69 should **not** be “same hidden pass, different model role.”
- Phase 69 should migrate hidden player-turn adjudication to:
  1. bounded structured judge plan
  2. deterministic backend execution of ordered actions
  3. prose-only final storyteller narration from settled state
- Opening scenes remain Phase 68-style:
  - world-brain direction
  - authoritative scene assembly
  - visible narration

## Explicitly Rejected

### Option A — Judge model with the same `streamText + tools` hidden loop

Rejected because:
- it changes model role ownership but keeps the same agentic hidden execution pattern
- it is weaker on determinism and auditability
- it does not clearly separate “decide” from “execute”

### Option C — two-stage judge packet plus second judge tool-driving pass

Rejected because:
- it doubles judge complexity and latency
- it adds a second hidden reasoning seam before proving the single-plan path is insufficient
- it is not the minimum viable migration

---

*Phase: 69-judge-owned-hidden-pass-migration-and-narrator-only-runtime*  
*Logged: 2026-04-20*
