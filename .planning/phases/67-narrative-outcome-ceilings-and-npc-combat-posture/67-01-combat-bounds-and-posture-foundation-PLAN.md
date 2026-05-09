---
phase: 67-narrative-outcome-ceilings-and-npc-combat-posture
plan: 01
slug: combat-bounds-and-posture-foundation
type: execute
wave: 1
status: draft
depends_on: []
files_modified:
  - backend/src/engine/combat-envelope.ts
  - backend/src/engine/__tests__/combat-bounds.test.ts
  - backend/src/engine/__tests__/combat-posture.test.ts
autonomous: true
requirements: [P67-R1, P67-R3]
must_haves:
  truths:
    - "Pure backend-local helpers `buildNarrativeOutcomeBounds(...)` and `deriveCombatPosture(...)` exist in `backend/src/engine/combat-envelope.ts` beside the Phase 66 envelope builder."
    - "Bounds remain qualitative only: ceilings, floors, prohibitions, and compact summary. No HP formulas, chance rewrites, or prose post-processing."
    - "Posture remains ephemeral and does not touch runtime-tags, persistence, schemas, or character records."
    - "The Phase 67 posture enum is locked to the six v1 values from `67-CONTEXT.md`: `aggress`, `press`, `trade`, `probe`, `withdraw`, `disengage`."
    - "Bounds derivation is exhaustive for Phase 66 Oracle outcomes and provides a deterministic fallback/default path for unknown outcomes rather than returning undefined."
    - "Backend-authored guidance strings are bounded and phrased as constraint facts rather than imperative 'Do not ...' instructions."
    - "Focused unit tests lock bounds derivation and posture mapping against matchup/bypass inputs."
  artifacts:
    - path: backend/src/engine/combat-envelope.ts
      provides: "Pure Phase 67 helper types and deterministic derivation logic."
      contains: "buildNarrativeOutcomeBounds|deriveCombatPosture"
    - path: backend/src/engine/__tests__/combat-bounds.test.ts
      provides: "Matrix coverage for narrative outcome bounds."
      contains: "buildNarrativeOutcomeBounds"
    - path: backend/src/engine/__tests__/combat-posture.test.ts
      provides: "Matrix coverage for NPC combat posture."
      contains: "deriveCombatPosture"
---

<objective>
Add the pure, engine-owned foundation for Phase 67 so later plans can consume deterministic narrative bounds and NPC combat posture without inventing new combat math or widening persistence/schema scope.
</objective>

<context>
@.planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-CONTEXT.md
@.planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-RESEARCH.md
@backend/src/engine/combat-envelope.ts
@backend/src/engine/oracle.ts
@backend/src/engine/__tests__/combat-envelope.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add pure bounds/posture regression coverage first</name>
  <files>
    - backend/src/engine/__tests__/combat-bounds.test.ts
    - backend/src/engine/__tests__/combat-posture.test.ts
  </files>
  <read_first>
    - backend/src/engine/combat-envelope.ts
    - backend/src/engine/__tests__/combat-envelope.test.ts
    - backend/src/engine/oracle.ts
  </read_first>
  <action>
    Add new pure unit tests that lock:
    - narrative bounds for at least `dominant`, `contested`, and `outmatched` matchups across `strong_hit`, `weak_hit`, and `miss`
    - posture mapping for matchup + bypass combinations
    - the exact six-value posture enum contract from `67-CONTEXT.md`
    - unknown/unsupported outcome fallback behavior so bounds derivation stays total rather than partial
    - bounded list sizes and constraint-style guidance strings
    - omission safety: helpers accept Phase 66 envelope shapes without requiring schema/persistence changes
  </action>
  <acceptance_criteria>
    - `backend/src/engine/__tests__/combat-bounds.test.ts` exists and contains `buildNarrativeOutcomeBounds`
    - `backend/src/engine/__tests__/combat-posture.test.ts` exists and contains `deriveCombatPosture`
    - `backend/src/engine/__tests__/combat-posture.test.ts` contains all six posture labels: `aggress`, `press`, `trade`, `probe`, `withdraw`, `disengage`
    - `backend/src/engine/__tests__/combat-bounds.test.ts` contains an explicit unknown-outcome fallback assertion
    - `npm --prefix backend test -- run combat-bounds combat-posture` exits `0`
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Implement pure Phase 67 helpers in combat-envelope.ts</name>
  <files>backend/src/engine/combat-envelope.ts</files>
  <read_first>
    - backend/src/engine/combat-envelope.ts
    - backend/src/engine/oracle.ts
    - .planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-CONTEXT.md
  </read_first>
  <action>
    Extend `combat-envelope.ts` with:
    - `NarrativeOutcomeBounds` type
    - `CombatPosture` enum/union
    - `NpcCombatPosture` type
    - `buildNarrativeOutcomeBounds(envelope, outcome)`
    - `deriveCombatPosture(envelope, opts)`

    Keep the implementation pure, backend-local, and qualitative. Do not change `buildCombatEnvelope(...)` behavior, do not add persistence hooks, and do not import runtime-tags or DB code.
  </action>
  <acceptance_criteria>
    - `backend/src/engine/combat-envelope.ts` exports `buildNarrativeOutcomeBounds`
    - `backend/src/engine/combat-envelope.ts` exports `deriveCombatPosture`
    - `backend/src/engine/combat-envelope.ts` contains all six posture labels from `67-CONTEXT.md`
    - `backend/src/engine/combat-envelope.ts` contains a deterministic fallback/default path for unknown outcomes
    - No new imports from persistence/schema modules appear in `backend/src/engine/combat-envelope.ts`
    - `grep -n "runtime-tags\\|db\\|sqlite\\|lancedb" backend/src/engine/combat-envelope.ts` returns no new Phase 67 coupling lines
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Run focused backend foundation gate</name>
  <files>(verification only)</files>
  <read_first>
    - backend/src/engine/__tests__/combat-bounds.test.ts
    - backend/src/engine/__tests__/combat-posture.test.ts
  </read_first>
  <action>
    Run the focused backend foundation gate for the new helper and tests.
  </action>
  <acceptance_criteria>
    - `npm --prefix backend test -- run combat-bounds combat-posture` exits `0`
  </acceptance_criteria>
</task>

</tasks>
