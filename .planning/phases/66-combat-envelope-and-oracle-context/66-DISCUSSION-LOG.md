# Phase 66: Combat Envelope and Oracle Context - Discussion Log

> **Audit trail only.** Do not use as planning input. Decisions are captured in `66-CONTEXT.md`.

**Date:** 2026-04-19
**Phase:** 66-combat-envelope-and-oracle-context
**Discussion mode:** autonomous; user delegated technical choices
**Inputs:** local code inspection, 2 explorer agents, external Gemini, external Claude

---

## Gray Areas Considered

| Area | Options considered | Outcome |
|------|--------------------|---------|
| Where envelope is computed | inside Oracle / before Oracle in backend code | Compute outside Oracle in backend code |
| What Oracle sees | raw powerStats / pre-digested envelope | Pre-digested envelope |
| Runtime tags | add power-derived tags / leave unchanged | Leave unchanged |
| Phase split | envelope + Oracle only / envelope + storyteller in same phase | Oracle-only in Phase 66 |
| Persistence | ephemeral per action / persisted posture-like state | Ephemeral per action |

---

## Key Discussion Outcomes

### 1. Oracle owns adjudication, not envelope derivation

- Rejected: letting Oracle infer relative power from raw `powerStats`.
- Chosen: deterministic backend-owned `CombatEnvelope` built before `callOracle(...)`.
- Reason: project invariant is explicit: backend owns mechanics, LLM narrates/interprets bounded truth.

### 2. Envelope must be qualitative, not combat math

- Rejected: raw AP/speed/durability objects and numeric damage formulas in Oracle prompt.
- Chosen: matchup/delta/bypass/vulnerability summary that calibrates plausibility.
- Reason: goal is meaningful story-direction, not rigid battle simulation.

### 3. Runtime tags stay untouched

- Rejected: adding axis tags such as speed/AP tier into `deriveRuntimeCharacterTags(...)`.
- Chosen: leave runtime-tags unchanged and keep envelope as a separate seam.
- Reason: tags are broad compatibility shorthand and already have many consumers; power semantics would be flattened and noisy there.

### 4. Storyteller and NPC posture are deferred

- Rejected for Phase 66: injecting envelope into storyteller/final narration and combat posture consumers immediately.
- Chosen: Phase 66 ends at Oracle integration only.
- Reason: otherwise the phase mixes mechanics with narrative ceilings and behavior policy, which are easier to verify as a separate follow-up phase.

---

## External Reviewer Notes

### Gemini
- Initially favored feeding both Oracle and storyteller from the same envelope.
- On arbitration round, converged to `Oracle-only` for Phase 66.
- Proposed keeping runtime-tags unchanged and exposing a reusable typed envelope artifact for later phases.

### Claude
- Consistently argued for `Oracle-only` in Phase 66.
- Strongly rejected runtime-tag expansion with power-derived axes.
- Recommended Phase 67 consume the same envelope for storyteller ceilings and NPC posture.

### Local explorers
- Combat-flow explorer identified the lowest-friction injection seams as:
  - `turn-processor.ts` for player actions
  - `npc-tools.ts` for NPC hostile actions
  - `target-context.ts` for target-side combat data
  - `oracle.ts` for payload/prompt contract
- Personality/runtime explorer argued posture should not be persisted or encoded into tags/goals in Phase 66 and is safer as a later prompt-consumer concern.

---

## Final Split

- **Phase 66:** build `CombatEnvelope`, enrich Oracle context, and make adjudication power-aware without changing storyteller or NPC behavior consumers.
- **Phase 67:** consume the same envelope for narrative ceilings/floors and NPC combat posture.

---

*Phase: 66-combat-envelope-and-oracle-context*
*Logged: 2026-04-19*
