---
phase: 67-narrative-outcome-ceilings-and-npc-combat-posture
plan: 02
slug: player-storyteller-outcome-bounds
type: execute
wave: 2
status: draft
depends_on: [67-01]
files_modified:
  - backend/src/engine/turn-processor.ts
  - backend/src/engine/prompt-assembler.ts
  - backend/src/engine/__tests__/turn-processor.test.ts
  - backend/src/engine/__tests__/turn-processor.observability.test.ts
autonomous: true
requirements: [P67-R1, P67-R2, P67-R6, P67-R8]
must_haves:
  truths:
    - "When `combatEnvelope` exists on the player hostile path, `NarrativeOutcomeBounds` are derived backend-side from `combatEnvelope + oracleResult.outcome` before storyteller prompt emission."
    - "Bounds are injected into both the hidden storyteller system prompt and the final visible narration prompt."
    - "Missing envelope preserves pre-phase prompt behavior and renders no bounds block."
    - "Observability emits one bounded `combat.bounds.derived` event."
    - "Bounds prompt phrasing does not trip `detectVisibleNarrationFailures(...)` under the new regression path."
    - "This plan does NOT change Oracle schema, chance calculation, runtime-tags, schema/persistence, or frontend."
  artifacts:
    - path: backend/src/engine/turn-processor.ts
      provides: "Player-path bounds derivation and hidden-pass injection."
      contains: "combat.bounds.derived"
    - path: backend/src/engine/prompt-assembler.ts
      provides: "Final visible narration prompt support for outcome bounds."
      contains: "OUTCOME BOUNDS"
---

<objective>
Thread deterministic outcome bounds through the player hostile-action path so both storyteller passes can respect matchup plausibility without rewriting Oracle or post-processing generated prose.
</objective>

<context>
@.planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-CONTEXT.md
@backend/src/engine/turn-processor.ts
@backend/src/engine/prompt-assembler.ts
@backend/src/engine/oracle.ts
@backend/src/engine/combat-envelope.ts
@backend/src/engine/__tests__/turn-processor.test.ts
@backend/src/engine/__tests__/turn-processor.observability.test.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend player-path and visible-pass regressions first</name>
  <files>
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/engine/__tests__/turn-processor.observability.test.ts
  </files>
  <read_first>
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/engine/__tests__/turn-processor.observability.test.ts
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/prompt-assembler.ts
  </read_first>
  <action>
    Add regressions that prove:
    - bounds are derived and injected on eligible player hostile actions
    - both hidden and final visible prompt flows receive bounds when envelope exists
    - non-hostile or missing-envelope paths omit bounds cleanly and preserve prior prompt text/ordering
    - a visible narration prompt containing bounds does not trigger `detectVisibleNarrationFailures(...)`
    - `combat.bounds.derived` observability fires with bounded payload only (cap payload JSON to a small fixed threshold such as 512 bytes)
  </action>
  <acceptance_criteria>
    - `backend/src/engine/__tests__/turn-processor.test.ts` contains `OUTCOME BOUNDS`
    - `backend/src/engine/__tests__/turn-processor.test.ts` contains an explicit no-envelope prompt parity assertion
    - `backend/src/engine/__tests__/turn-processor.test.ts` contains `detectVisibleNarrationFailures`
    - `backend/src/engine/__tests__/turn-processor.observability.test.ts` contains `combat.bounds.derived`
    - `backend/src/engine/__tests__/turn-processor.observability.test.ts` contains an explicit payload-size bound assertion
    - `npm --prefix backend test -- run turn-processor.observability turn-processor` exits `0`
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Wire player/storyteller outcome bounds</name>
  <files>
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/prompt-assembler.ts
  </files>
  <read_first>
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/combat-envelope.ts
    - backend/src/engine/oracle.ts
  </read_first>
  <action>
    In `turn-processor.ts`, derive bounds after Oracle result exists and only when `combatEnvelope` exists. Inject a bounded `[OUTCOME BOUNDS]` block into the hidden storyteller/system prompt path and pass `outcomeBounds` into `assembleFinalNarrationPrompt(...)`.

    In `prompt-assembler.ts`, add optional support for rendering `[OUTCOME BOUNDS]` in the final visible narration prompt. Keep prompt additions compact and constraint-styled so they do not echo as visible instructions.
  </action>
  <acceptance_criteria>
    - `backend/src/engine/turn-processor.ts` contains `buildNarrativeOutcomeBounds`
    - `backend/src/engine/turn-processor.ts` contains `combat.bounds.derived`
    - `backend/src/engine/prompt-assembler.ts` contains `OUTCOME BOUNDS`
    - `backend/src/engine/prompt-assembler.ts` accepts an optional `outcomeBounds`
    - No new Phase 67 code modifies `backend/src/engine/oracle.ts`
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Run focused player-path verification</name>
  <files>(verification only)</files>
  <read_first>
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/engine/__tests__/turn-processor.observability.test.ts
  </read_first>
  <action>
    Run the focused player/storyteller verification gate.
  </action>
  <acceptance_criteria>
    - `npm --prefix backend test -- run turn-processor.observability turn-processor` exits `0`
  </acceptance_criteria>
</task>

</tasks>
