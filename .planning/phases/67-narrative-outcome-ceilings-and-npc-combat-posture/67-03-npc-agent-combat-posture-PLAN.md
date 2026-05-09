---
phase: 67-narrative-outcome-ceilings-and-npc-combat-posture
plan: 03
slug: npc-agent-combat-posture
type: execute
wave: 2
status: draft
depends_on: [67-01]
files_modified:
  - backend/src/engine/npc-agent.ts
  - backend/src/engine/__tests__/npc-agent.test.ts
autonomous: true
requirements: [P67-R4, P67-R5, P67-R6, P67-R8]
must_haves:
  truths:
    - "NPC combat posture is derived in `tickNpcAgentInternal(...)` before `generateText(...)` tool selection, not in `npc-tools.ts`."
    - "Posture uses a single primary clear-awareness target in v1 and is omitted cleanly when combat data is unavailable."
    - "NPC prompt receives a bounded `[COMBAT POSTURE]` block that can bias action/tool choice."
    - "Observability emits one bounded `combat.posture.derived` event."
    - "Primary target selection remains a local `npc-agent.ts` concern in v1; only posture derivation itself is shared in `combat-envelope.ts`."
    - "This plan does NOT persist posture, modify runtime-tags, or change `npc-offscreen.ts`, `reflection-agent.ts`, or frontend."
  artifacts:
    - path: backend/src/engine/npc-agent.ts
      provides: "Pre-decision NPC combat posture derivation and prompt injection."
      contains: "combat.posture.derived"
    - path: backend/src/engine/__tests__/npc-agent.test.ts
      provides: "NPC prompt-flow coverage for combat posture."
      contains: "COMBAT POSTURE"
---

<objective>
Let NPCs use Phase 66 matchup truth when choosing whether to press, trade, probe, withdraw, or disengage, while keeping posture purely tick-local and out of persistence/schema surfaces.
</objective>

<context>
@.planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-CONTEXT.md
@backend/src/engine/npc-agent.ts
@backend/src/engine/npc-tools.ts
@backend/src/engine/combat-envelope.ts
@backend/src/engine/target-context.ts
@backend/src/engine/__tests__/npc-agent.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend npc-agent regressions first</name>
  <files>backend/src/engine/__tests__/npc-agent.test.ts</files>
  <read_first>
    - backend/src/engine/__tests__/npc-agent.test.ts
    - backend/src/engine/npc-agent.ts
    - backend/src/engine/combat-envelope.ts
  </read_first>
  <action>
    Add regressions that prove:
    - posture block appears when the NPC has a clear-awareness target with combat data
    - posture block is omitted when target/power data is missing and the prompt remains on the pre-phase path
    - posture guidance stays bounded
    - `combat.posture.derived` observability fires with compact payload only
  </action>
  <acceptance_criteria>
    - `backend/src/engine/__tests__/npc-agent.test.ts` contains `COMBAT POSTURE`
    - `backend/src/engine/__tests__/npc-agent.test.ts` contains `combat.posture.derived`
    - `backend/src/engine/__tests__/npc-agent.test.ts` contains an explicit missing-posture prompt parity assertion
    - `npm --prefix backend test -- run npc-agent` exits `0`
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Wire npc-agent posture derivation and prompt injection</name>
  <files>backend/src/engine/npc-agent.ts</files>
  <read_first>
    - backend/src/engine/npc-agent.ts
    - backend/src/engine/combat-envelope.ts
    - backend/src/engine/target-context.ts
    - backend/src/engine/npc-tools.ts
  </read_first>
  <action>
    In `tickNpcAgentInternal(...)`, identify the primary clear-awareness combat target in v1 via a local `npc-agent.ts` helper, derive `CombatEnvelope` and `NpcCombatPosture` when combat data exists, and inject a compact `[COMBAT POSTURE]` block into the NPC system prompt before `generateText(...)`.

    Keep posture derivation ephemeral. Do not move ownership into `npc-tools.ts`, and do not persist posture or append it to runtime tags or character records.
  </action>
  <acceptance_criteria>
    - `backend/src/engine/npc-agent.ts` contains `deriveCombatPosture`
    - `backend/src/engine/npc-agent.ts` contains `COMBAT POSTURE`
    - `backend/src/engine/npc-agent.ts` contains `combat.posture.derived`
    - `backend/src/engine/npc-agent.ts` contains a local primary-target selection helper or clearly named equivalent
    - `backend/src/engine/npc-tools.ts` shows no new Phase 67 posture derivation code
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Run focused NPC posture verification</name>
  <files>(verification only)</files>
  <read_first>
    - backend/src/engine/__tests__/npc-agent.test.ts
  </read_first>
  <action>
    Run the focused NPC posture verification gate.
  </action>
  <acceptance_criteria>
    - `npm --prefix backend test -- run npc-agent` exits `0`
  </acceptance_criteria>
</task>

</tasks>
