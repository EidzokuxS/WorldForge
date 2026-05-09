---
phase: 66-combat-envelope-and-oracle-context
plan: 02
slug: target-context-combat-snapshot
type: execute
wave: 2
status: draft
depends_on: [66-01]
files_modified:
  - backend/src/engine/target-context.ts
  - backend/src/engine/__tests__/target-context.test.ts
autonomous: true
requirements: [P66-R3]
must_haves:
  truths:
    - "`resolveActionTargetContext(...)` is extended additively so character targets can surface optional combat snapshot data needed for envelope building."
    - "New target-context fields are optional. Existing non-character targets and lightweight mocks do not break."
    - "Character targets surface enough combat data to build an envelope later in player/NPC hostile paths."
    - "Character targets that exist but lack `powerStats` still resolve honestly and omit combat snapshot data rather than throwing or fabricating."
    - "Item/location/faction/unknown targets keep honest tag-only behavior and do not fabricate combat data."
    - "This plan does NOT build or pass envelopes yet; it only exposes target-side combat input."
    - "`npm --prefix backend test -- run target-context` exits 0."
  artifacts:
    - path: backend/src/engine/target-context.ts
      provides: "Additive combat snapshot on resolved character targets."
      contains: "resolveActionTargetContext"
    - path: backend/src/engine/__tests__/target-context.test.ts
      provides: "Coverage for character-target combat snapshot and non-character no-fake-data behavior."
      contains: "resolveActionTargetContext"
---

<objective>
Expose target-side combat data at the existing target-resolution seam so both player and NPC hostile-action paths can reuse one target source of truth when Phase 66 later builds `CombatEnvelope`.
</objective>

<context>
@.planning/phases/66-combat-envelope-and-oracle-context/66-CONTEXT.md
@.planning/phases/66-combat-envelope-and-oracle-context/66-RESEARCH.md
@backend/src/engine/target-context.ts
@backend/src/engine/turn-processor.ts
@backend/src/engine/npc-tools.ts
@backend/src/character/record-adapters.ts
@shared/src/types.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add target-context regression coverage first</name>
  <files>backend/src/engine/__tests__/target-context.test.ts</files>
  <behavior>
    Add tests that prove:
    - resolved character targets include optional combat snapshot data
    - resolved character targets without `powerStats` omit combat snapshot data cleanly
    - resolved non-character targets do not include fake combat snapshot data
    - missing/unknown targets preserve current fallback semantics
  </behavior>
</task>

<task type="auto">
  <name>Task 2: Extend target-context additively</name>
  <files>backend/src/engine/target-context.ts</files>
  <behavior>
    Extend the target-context contract additively with optional character-target combat data, preserving current behavior for all other target classes.
  </behavior>
</task>

<task type="auto">
  <name>Task 3: Run focused backend tests</name>
  <files>(verification only)</files>
  <verify>
    <automated>npm --prefix backend test -- run target-context</automated>
  </verify>
</task>

</tasks>
