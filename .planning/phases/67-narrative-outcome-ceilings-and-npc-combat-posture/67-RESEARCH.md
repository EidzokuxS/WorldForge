# Phase 67: Narrative Outcome Ceilings and NPC Combat Posture - Research

**Researched:** 2026-04-19
**Status:** GO
**Research source:** Phase 66 implementation review, external Claude/Gemini consultation, local explorer-agent synthesis

## Verdict

GO. Phase 66 created the right substrate: `CombatEnvelope` already exists, is deterministic, and is threaded into Oracle on hostile player and NPC actions. Phase 67 can now consume that substrate in two additive prompt seams without widening into persistence or new combat math.

## Current Architecture

### Player hostile-action path

1. `processTurn(...)` resolves target context
2. builds optional `combatEnvelope`
3. calls `callOracle(...)`
4. builds hidden storyteller prompt
5. assembles authoritative scene
6. builds final visible narration prompt

### NPC hostile-action path

1. `tickNpcAgentInternal(...)` assembles an NPC-local system prompt
2. `generateText(...)` chooses tools/actions
3. `act.execute(...)` in `npc-tools.ts` performs hostile adjudication
4. `npc-tools.ts` already reuses target context + `combatEnvelope` for Oracle

## Recommended Implementation Shape

### 1. Add pure envelope-derived helpers

Extend `backend/src/engine/combat-envelope.ts` with two new pure helpers:

- `buildNarrativeOutcomeBounds(envelope, outcome)`
- `deriveCombatPosture(envelope, opts)`

This keeps all envelope-derived semantics in one backend-owned module.

### 2. Make narrative bounds hybrid

Recommended choice: **hybrid**

- backend deterministically derives bounds from `combatEnvelope + oracleResult.outcome`
- storyteller consumes those bounds as prompt context
- no post-generation prose rewriting

Why:
- prompt-only loses deterministic meaning
- prose rewriting is a much bigger blast radius
- bounded prompt injection is additive and testable

### 3. Inject bounds into both storyteller passes

Critical finding from code review:
- the final visible pass does **not** automatically inherit hidden-pass directives

So bounds must be injected into:
- hidden/system prompt in `turn-processor.ts`
- final visible prompt via `assembleFinalNarrationPrompt(...)`

### 4. Derive posture before NPC decision

Recommended choice: **derive in `npc-agent.ts` before tool selection**

Why:
- posture is about whether the NPC attacks, probes, presses, withdraws, or disengages
- `npc-tools.ts` runs only after the model already chose `act`
- `npc-tools.ts` should stay focused on adjudication, not choice bias

### 5. Keep v1 scope tight

Recommended v1 constraints:
- single primary target only
- no persistence
- no runtime-tags changes
- no offscreen/reflection consumers
- no Oracle schema changes beyond what Phase 66 already added
- no global storyteller-contract rewrite

## Risks

### Risk 1: bounds disappear on visible pass

Mitigation:
- explicitly thread `outcomeBounds` into `assembleFinalNarrationPrompt(...)`

### Risk 2: instruction-echo regressions

Mitigation:
- write bounds and posture as short constraint facts, not imperative "Do not ..." lines

### Risk 3: prompt bloat

Mitigation:
- cap bounds/posture lines and keep them backend-authored, compact, and qualitative

### Risk 4: posture target ambiguity

Mitigation:
- v1 posture derives against one primary clear-awareness target only

## Recommended Plan Split

### Plan 67-01
- pure helpers in `combat-envelope.ts`
- unit tests for `NarrativeOutcomeBounds` and `NpcCombatPosture`

### Plan 67-02
- player path wiring in `turn-processor.ts`
- final visible prompt wiring in `prompt-assembler.ts`
- hidden + visible bounds coverage

### Plan 67-03
- NPC posture derivation in `npc-agent.ts`
- prompt injection and observability
- no `npc-tools.ts` posture ownership

### Plan 67-04
- verification gate
- roadmap/requirements closeout artifacts

---

*Phase: 67-narrative-outcome-ceilings-and-npc-combat-posture*
*Research completed: 2026-04-19*
