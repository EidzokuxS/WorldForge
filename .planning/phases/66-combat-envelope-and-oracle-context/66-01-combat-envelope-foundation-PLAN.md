---
phase: 66-combat-envelope-and-oracle-context
plan: 01
slug: combat-envelope-foundation
type: execute
wave: 1
status: draft
depends_on: []
files_modified:
  - backend/src/engine/combat-envelope.ts
  - backend/src/engine/__tests__/combat-envelope.test.ts
autonomous: true
requirements: [P66-R1, P66-R2]
must_haves:
  truths:
    - "A new backend-local pure module `backend/src/engine/combat-envelope.ts` exists and exports a deterministic `buildCombatEnvelope(...)` helper plus the narrow envelope types it uses."
    - "`CombatEnvelope` stays qualitative and adjudication-oriented: matchup band, AP-vs-durability delta, speed delta, optional intelligence delta, bypass flags, relevant vulnerabilities, and summary lines. No HP math, no damage formulas, no persistence."
    - "The helper uses existing power semantics from the repo (PowerStats shape plus shared tier/bypass helpers) instead of inventing a second incompatible comparison system."
    - "Envelope creation returns `null` or equivalent absence when combat data is insufficient or the interaction is not hostile/combat-relevant."
    - "This plan pins a deterministic hostile-action gate helper. It is backend-owned, regex/keyword or explicit-predicate based, and never uses an LLM classifier. The gate is the single source of truth reused by later integration plans."
    - "This plan does NOT modify `runtime-tags`, Oracle, target-context, storyteller, npc-agent, offscreen, reflection, DB schemas, or shared persistence types."
    - "Unit tests lock pure envelope derivation, bypass/vulnerability handling, and no-data/no-hostility omission behavior."
    - "`npm --prefix backend test -- run combat-envelope` exits 0."
  artifacts:
    - path: backend/src/engine/combat-envelope.ts
      provides: "Pure backend-only combat envelope builder and envelope types."
      contains: "export function buildCombatEnvelope"
    - path: backend/src/engine/__tests__/combat-envelope.test.ts
      provides: "Pure unit coverage for envelope derivation and omission rules."
      contains: "buildCombatEnvelope"
---

<objective>
Land the pure mechanical core for Phase 66: a deterministic `CombatEnvelope` builder that compares actor/target combat data in backend code and produces a compact adjudication-oriented summary. This is the engine-owned truth Phase 66 will later thread into Oracle.

This plan is intentionally narrow. It builds the shared primitive but does not yet wire it into Oracle or target resolution.
</objective>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/phases/66-combat-envelope-and-oracle-context/66-CONTEXT.md
@.planning/phases/66-combat-envelope-and-oracle-context/66-RESEARCH.md
@backend/src/engine/grounded-lookup.ts
@shared/src/power-tiers.ts
@shared/src/types.ts
@backend/src/engine/__tests__/grounded-lookup.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add combat-envelope unit coverage first</name>
  <files>backend/src/engine/__tests__/combat-envelope.test.ts</files>
  <behavior>
    Add a new pure unit test file covering:
    - stronger actor vs weaker target produces a non-null envelope with meaningful matchup/delta lines
    - large durability gap with no bypass is surfaced explicitly
    - actor hax bypass against target is surfaced explicitly
    - relevant target vulnerability is surfaced when matched
    - missing actor/target powerStats returns null/no envelope
    - clearly non-hostile usage path returns null/no envelope
    - hostile-action gate stays backend-deterministic and does not classify ordinary social/utility actions as combat
  </behavior>
</task>

<task type="auto">
  <name>Task 2: Implement backend-local CombatEnvelope builder</name>
  <files>backend/src/engine/combat-envelope.ts</files>
  <behavior>
    Implement a pure module that:
    - imports existing repo helpers for tier/bypass reasoning
    - accepts actor + target combat input and an explicit hostile/combat flag
    - exports a deterministic hostile-action predicate/helper for later reuse
    - returns a compact envelope struct with summary lines
    - does not depend on LLMs, DB, prompt assembly, or persistence
  </behavior>
</task>

<task type="auto">
  <name>Task 3: Run focused backend tests</name>
  <files>(verification only)</files>
  <verify>
    <automated>npm --prefix backend test -- run combat-envelope</automated>
  </verify>
</task>

</tasks>
