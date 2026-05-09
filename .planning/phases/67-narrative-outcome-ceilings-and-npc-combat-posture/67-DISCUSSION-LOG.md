# Phase 67: Narrative Outcome Ceilings and NPC Combat Posture - Discussion Log

> **Audit trail only.** Do not use as planning input. Decisions are captured in `67-CONTEXT.md`.

**Date:** 2026-04-19
**Phase:** 67-narrative-outcome-ceilings-and-npc-combat-posture
**Discussion mode:** autonomous; user delegated technical choices
**Inputs:** local code inspection, 2 explorer agents, external Gemini, external Claude

---

## Gray Areas Considered

| Area | Options considered | Outcome |
|------|--------------------|---------|
| Narrative outcome ceilings/floors | backend post-processing / storyteller prompt-only / hybrid | Hybrid |
| NPC combat posture seam | `npc-agent` pre-decision / `npc-tools` execution-time / split | `npc-agent` pre-decision |
| Helper ownership | new posture module / extend `combat-envelope.ts` | Extend `combat-envelope.ts` |
| Prompt wording style | imperative rules / constraint-style fact lines | Constraint-style fact lines |
| Target scope for posture | multi-target fusion / single primary target v1 | Single primary target v1 |

## External Reviewer Notes

### Gemini
- Recommended hybrid storytelling bounds: backend-authored bound directives plus prompt consumption.
- Favored deriving posture in `npc-agent` so it can bias action/tool choice instead of only hostile adjudication.
- Suggested a simple enum posture model and warned about NPC cowardice if the mapping is too sensitive.

### Claude
- Rejected prompt-only bounds as too nondeterministic and rejected post-generation prose rewriting as too invasive.
- Explicitly flagged that final visible narration does not automatically inherit hidden-pass directives; bounds must be re-rendered in `assembleFinalNarrationPrompt(...)`.
- Strongly argued posture belongs in `npc-agent` pre-decision and should not be duplicated in `npc-tools.ts`.
- Warned that "Do not ..." style instructions are likely to trip visible narration instruction-echo failure detection.

### Local explorers
- Explorer 1 mapped the smallest-blast-radius visible narration seam to `assembleFinalNarrationPrompt(...)`, with `scene-assembly.ts` as a secondary option if authoritative consequence shaping becomes necessary.
- Explorer 2 mapped posture ownership to `tickNpcAgentInternal(...)` in `npc-agent.ts`, with `combat-envelope.ts` as the right home for pure posture derivation helpers.

## Consensus

- `NarrativeOutcomeBounds` should be derived backend-side from `combatEnvelope + oracleResult.outcome`.
- Bounds must flow into both hidden and final visible storyteller prompts.
- `NpcCombatPosture` should be derived before NPC tool selection in `npc-agent.ts`.
- Shared derivation helpers should live in `combat-envelope.ts`.
- No persistence, runtime-tags, offscreen/reflection, or UI work belongs in Phase 67.

---

*Phase: 67-narrative-outcome-ceilings-and-npc-combat-posture*
*Logged: 2026-04-19*
