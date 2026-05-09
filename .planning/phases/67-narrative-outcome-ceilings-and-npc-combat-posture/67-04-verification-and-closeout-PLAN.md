---
phase: 67-narrative-outcome-ceilings-and-npc-combat-posture
plan: 04
slug: verification-and-closeout
type: execute
wave: 3
status: draft
depends_on: [67-02, 67-03]
files_modified:
  - .planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-VALIDATION.md
  - .planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-SUMMARY.md
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
autonomous: true
requirements: [P67-R7, P67-R8, P67-R9]
must_haves:
  truths:
    - "Backend verification proves bounds derivation, posture derivation, player hidden+final prompt flow, and NPC prompt posture flow are green."
    - "Full backend Vitest suite and backend typecheck are green."
    - "Out-of-scope files remain untouched: runtime-tags, npc-offscreen, reflection-agent, frontend."
    - "Phase closeout writes `67-VALIDATION.md` and `67-SUMMARY.md` and synchronizes roadmap/requirements to final status."
  artifacts:
    - path: .planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-VALIDATION.md
      provides: "Phase 67 verification evidence and scope gate."
      contains: "P67-R"
    - path: .planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-SUMMARY.md
      provides: "Phase 67 closeout summary."
      contains: "Phase 67 Summary"
---

<objective>
Close Phase 67 with an explicit verification bundle and final roadmap/requirements state, proving the combat narration/posture layer landed without bleeding into out-of-scope systems.
</objective>

<context>
@.planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-CONTEXT.md
@backend/src/engine/combat-envelope.ts
@backend/src/engine/turn-processor.ts
@backend/src/engine/prompt-assembler.ts
@backend/src/engine/npc-agent.ts
@backend/src/engine/__tests__/combat-bounds.test.ts
@backend/src/engine/__tests__/combat-posture.test.ts
@backend/src/engine/__tests__/turn-processor.test.ts
@backend/src/engine/__tests__/turn-processor.observability.test.ts
@backend/src/engine/__tests__/npc-agent.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run full backend verification gate</name>
  <files>(verification only)</files>
  <read_first>
    - backend/src/engine/__tests__/combat-bounds.test.ts
    - backend/src/engine/__tests__/combat-posture.test.ts
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/engine/__tests__/turn-processor.observability.test.ts
    - backend/src/engine/__tests__/npc-agent.test.ts
  </read_first>
  <action>
    Run focused regressions, then the full backend Vitest suite and backend typecheck.
  </action>
  <acceptance_criteria>
    - `npm --prefix backend test -- run combat-bounds combat-posture turn-processor.observability turn-processor npc-agent` exits `0`
    - `npm --prefix backend test` exits `0`
    - `npm --prefix backend run typecheck` exits `0`
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 2: Prove scope gates stayed intact</name>
  <files>(verification only)</files>
  <read_first>
    - .planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-CONTEXT.md
  </read_first>
  <action>
    Prove out-of-scope files remained untouched:
    - `backend/src/character/runtime-tags.ts`
    - `backend/src/engine/npc-offscreen.ts`
    - `backend/src/engine/reflection-agent.ts`
    - all `frontend/` paths
  </action>
  <acceptance_criteria>
    - `git diff --name-only HEAD -- backend/src/character/runtime-tags.ts backend/src/engine/npc-offscreen.ts backend/src/engine/reflection-agent.ts frontend` returns empty
  </acceptance_criteria>
</task>

<task type="auto">
  <name>Task 3: Write validation and summary artifacts, then sync roadmap/requirements</name>
  <files>
    - .planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-VALIDATION.md
    - .planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-SUMMARY.md
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
  </files>
  <read_first>
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/phases/66-combat-envelope-and-oracle-context/66-VALIDATION.md
    - .planning/phases/66-combat-envelope-and-oracle-context/66-SUMMARY.md
  </read_first>
  <action>
    Write the Phase 67 validation bundle, summary, and final roadmap/requirements completion markers. Record focused and full-suite command outputs, requirement coverage, and the explicit out-of-scope gate.
  </action>
  <acceptance_criteria>
    - `.planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-VALIDATION.md` exists
    - `.planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-SUMMARY.md` exists
    - `.planning/ROADMAP.md` marks Phase 67 plans complete
    - `.planning/REQUIREMENTS.md` marks P67-R1..P67-R9 complete
  </acceptance_criteria>
</task>

</tasks>
