---
phase: 66-combat-envelope-and-oracle-context
plan: 03
slug: oracle-combat-envelope-contract
type: execute
wave: 2
status: draft
depends_on: [66-01]
files_modified:
  - backend/src/engine/oracle.ts
  - backend/src/engine/__tests__/oracle.test.ts
autonomous: true
requirements: [P66-R6]
must_haves:
  truths:
    - "`OraclePayload` gains an optional `combatEnvelope` field. No-envelope callers preserve current behavior."
    - "Oracle prompt receives compact backend-authored envelope summaries, not raw `powerStats` objects."
    - "Prompt changes are bounded to adjudication only and include one explicit no-bypass clamp for `actorBypassesTarget === false && durabilityTierGap >= 2`."
    - "Oracle still returns `chance` in `1..99` and preserves existing `strong_hit / weak_hit / miss` resolution semantics."
    - "All existing `callOracle(...)` callers remain compatible because the new contract is optional."
    - "This plan does NOT touch storyteller prompt assembly or NPC behavior consumers."
    - "`npm --prefix backend test -- run oracle` exits 0."
  artifacts:
    - path: backend/src/engine/oracle.ts
      provides: "Optional combat-envelope-aware Oracle contract and prompt."
      contains: "combatEnvelope"
    - path: backend/src/engine/__tests__/oracle.test.ts
      provides: "Coverage for no-envelope compatibility and envelope-aware prompt behavior."
      contains: "combatEnvelope"
---

<objective>
Teach Oracle to consume backend-owned combat context without widening into narrator or combat-engine behavior. This plan changes only the Oracle contract/prompt layer.
</objective>

<context>
@.planning/phases/66-combat-envelope-and-oracle-context/66-CONTEXT.md
@.planning/phases/66-combat-envelope-and-oracle-context/66-RESEARCH.md
@backend/src/engine/oracle.ts
@backend/src/engine/__tests__/oracle.test.ts
@backend/src/engine/combat-envelope.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Expand oracle tests for optional combatEnvelope behavior</name>
  <files>backend/src/engine/__tests__/oracle.test.ts</files>
  <behavior>
    Add tests that prove:
    - payload may omit `combatEnvelope` with current behavior preserved
    - prompt rendering includes envelope block when present
    - explicit no-bypass / durability-gap instruction is present when `durabilityTierGap >= 2`
    - the exact clamp phrase stays locked so Phase 66 cannot silently devolve into no-op prompt wording
  </behavior>
</task>

<task type="auto">
  <name>Task 2: Add optional combatEnvelope contract to Oracle</name>
  <files>backend/src/engine/oracle.ts</files>
  <behavior>
    Extend `OraclePayload`, prompt rendering, and structured logging to handle an optional prebuilt envelope while preserving current semantics for callers that do not pass one.
  </behavior>
</task>

<task type="auto">
  <name>Task 3: Run focused backend tests</name>
  <files>(verification only)</files>
  <verify>
    <automated>npm --prefix backend test -- run oracle</automated>
  </verify>
</task>

</tasks>
