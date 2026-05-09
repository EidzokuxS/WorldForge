---
phase: 66-combat-envelope-and-oracle-context
plan: 04
slug: hostile-action-integration-and-verification
type: execute
wave: 3
status: draft
depends_on: [66-02, 66-03]
files_modified:
  - backend/src/engine/turn-processor.ts
  - backend/src/engine/npc-tools.ts
  - backend/src/engine/__tests__/turn-processor.test.ts
  - backend/src/engine/__tests__/npc-agent.test.ts
  - backend/src/engine/__tests__/turn-processor.observability.test.ts
  - .planning/phases/66-combat-envelope-and-oracle-context/66-VALIDATION.md
autonomous: true
requirements: [P66-R4, P66-R5, P66-R7, P66-R8]
must_haves:
  truths:
    - "Player hostile-action path computes and passes `combatEnvelope` after target resolution and before `callOracle(...)`."
    - "NPC hostile `act.execute(...)` reuses the same combat-envelope and target-resolution seams instead of inventing a parallel NPC-only comparison path."
    - "Envelope is built only for eligible hostile/combat-relevant character-target actions with power data on both sides; otherwise it is omitted."
    - "One bounded observability event named `combat.envelope` is added for envelope build/pass-through, following Phase 58 conventions."
    - "Out-of-scope surfaces remain untouched in this phase: `backend/src/character/runtime-tags.ts`, `backend/src/engine/prompt-assembler.ts`, `backend/src/engine/npc-offscreen.ts`, `backend/src/engine/reflection-agent.ts`, persistence/schema files."
    - "No frontend files change in Phase 66."
    - "Backend verification gate passes: full backend Vitest suite plus backend typecheck."
  artifacts:
    - path: .planning/phases/66-combat-envelope-and-oracle-context/66-VALIDATION.md
      provides: "Phase 66 verification evidence and status."
      contains: "P66-R"
---

<objective>
Wire the new envelope into both hostile-action call sites, prove the player and NPC paths share one combat-aware adjudication seam, and close the phase with backend verification evidence.
</objective>

<context>
@.planning/phases/66-combat-envelope-and-oracle-context/66-CONTEXT.md
@.planning/phases/66-combat-envelope-and-oracle-context/66-RESEARCH.md
@backend/src/engine/turn-processor.ts
@backend/src/engine/npc-tools.ts
@backend/src/engine/__tests__/turn-processor.test.ts
@backend/src/engine/__tests__/npc-agent.test.ts
@backend/src/engine/__tests__/turn-processor.observability.test.ts
@backend/src/engine/combat-envelope.ts
@backend/src/engine/target-context.ts
@backend/src/engine/oracle.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend player and NPC hostile-path regressions first</name>
  <files>
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/engine/__tests__/npc-agent.test.ts
    - backend/src/engine/__tests__/turn-processor.observability.test.ts
  </files>
  <behavior>
    Add tests that prove:
    - player hostile path passes envelope into Oracle when eligible
    - player non-eligible path omits envelope
    - player character-target path omits envelope cleanly when target lacks powerStats
    - NPC hostile `act` path passes the same envelope contract
    - NPC non-character or no-power target behavior stays compatible with pre-phase baseline
    - observability emits one bounded envelope event
  </behavior>
</task>

<task type="auto">
  <name>Task 2: Wire player and NPC hostile-action envelope integration</name>
  <files>
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/npc-tools.ts
  </files>
  <behavior>
    Wire envelope building/pass-through at the two adjudication seams and add bounded logging. Do not touch storyteller or runtime-tags.
  </behavior>
</task>

<task type="auto">
  <name>Task 3: Run backend verification gate and write 66-VALIDATION.md</name>
  <files>.planning/phases/66-combat-envelope-and-oracle-context/66-VALIDATION.md</files>
  <verify>
    <automated>cd backend && npm test && cd .. && npm --prefix backend run typecheck</automated>
  </verify>
  <behavior>
    Record which requirements are verified, what commands passed, and confirm the out-of-scope files remained untouched, including zero frontend changes.
  </behavior>
</task>

</tasks>
