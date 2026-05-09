---
phase: 69-judge-owned-hidden-pass-migration-and-narrator-only-runtime
subsystem: runtime-hidden-adjudication
tags: [judge, adjudication-plan, deterministic-execution, turn-processor, prompt-assembly, observability, verification]
requires:
  - phase: 68
    provides: world-brain scene direction and narrator-facing scene assembly bridge
provides:
  - judge-owned structured hidden adjudication for normal player turns
  - shared runtime tool schemas reused by plan parsing and execution
  - deterministic ordered hidden execution through the existing backend tool executor
  - dedicated judge adjudication prompt surface
  - storyteller final-visible prose only on the normal player-turn path
  - compact hidden-plan observability
affects: [backend engine, planning truth, verification]
key-files:
  created:
    - .planning/phases/69-judge-owned-hidden-pass-migration-and-narrator-only-runtime/69-VALIDATION.md
    - .planning/phases/69-judge-owned-hidden-pass-migration-and-narrator-only-runtime/69-SUMMARY.md
    - backend/src/engine/hidden-adjudication.ts
    - backend/src/engine/__tests__/hidden-adjudication.test.ts
  modified:
    - backend/src/engine/tool-schemas.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/engine/__tests__/turn-processor.inventory-authority.test.ts
    - backend/src/engine/__tests__/fixtures/expected-seams.ts
    - backend/src/engine/__tests__/fixtures/mock-llm.ts
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md
key-decisions:
  - Hidden adjudication migrated to judge-owned structured output instead of keeping a tool-bound hidden storyteller pass.
  - Backend, not the model, executes the hidden action list through the existing deterministic executor boundary.
  - Shared tool input schemas stay single-sourced so adjudication planning and execution do not drift.
  - Opening scenes remain on the Phase 68 path; Phase 69 is strictly a normal player-turn hidden-pass ownership migration.
patterns-established:
  - Separate decide, execute, and describe into distinct seams: judge plans, backend executes, storyteller narrates.
  - Feed visible narration only from settled authoritative scene state, never from hidden rationale or raw hidden tool chatter.
requirements-completed: [P69-R1, P69-R2, P69-R3, P69-R4, P69-R5, P69-R6, P69-R7, P69-R8, P69-R9]
requirements-pending: []
completed: 2026-04-20
---

# Phase 69 Summary

**Phase 69 finished the hidden-pass ownership split for normal player turns.**

## Outcome

- Added [hidden-adjudication.ts](/R:/Projects/WorldForge/backend/src/engine/hidden-adjudication.ts) with:
  - bounded `AdjudicationPlan` and ordered action schema
  - judge-owned `runHiddenAdjudicationPlan(...)`
  - deterministic `executeAdjudicationPlan(...)`
- Extended [tool-schemas.ts](/R:/Projects/WorldForge/backend/src/engine/tool-schemas.ts) so the runtime tool input contracts are single-sourced and reusable by both planning and execution.
- Extended [prompt-assembler.ts](/R:/Projects/WorldForge/backend/src/engine/prompt-assembler.ts) with `assembleJudgeAdjudicationPrompt(...)`, a dedicated hidden judge prompt surface grounded by Oracle result, world-brain direction, and Phase 67 outcome bounds.
- Rewired [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts) so the normal player-turn path now:
  - computes Oracle result, combat envelope, outcome bounds, and Phase 68 scene direction
  - runs judge-owned hidden adjudication planning
  - executes the ordered hidden action plan deterministically
  - assembles authoritative scene state
  - asks storyteller for final visible prose only
- Updated observability fixtures and engine tests so the live seam now reports:
  - `judge.hidden.plan`
  - `judge.hidden.execution`

## What Phase 69 Does Not Do

- does **not** redesign routes or SSE transport
- does **not** alter Oracle chance math
- does **not** change DB schema or persistence model
- does **not** widen opening scenes beyond the Phase 68 shape
- does **not** migrate NPC agent, offscreen simulation, reflection, or runtime tags
- does **not** touch frontend

Those remain later runtime design work.

## Requirement Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| P69-R1 | complete | [hidden-adjudication.ts](/R:/Projects/WorldForge/backend/src/engine/hidden-adjudication.ts), [tool-schemas.ts](/R:/Projects/WorldForge/backend/src/engine/tool-schemas.ts), [hidden-adjudication.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/hidden-adjudication.test.ts) |
| P69-R2 | complete | [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts), [turn-processor.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/turn-processor.test.ts) |
| P69-R3 | complete | [hidden-adjudication.ts](/R:/Projects/WorldForge/backend/src/engine/hidden-adjudication.ts), [turn-processor.inventory-authority.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/turn-processor.inventory-authority.test.ts) |
| P69-R4 | complete | [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts), [prompt-assembler.ts](/R:/Projects/WorldForge/backend/src/engine/prompt-assembler.ts) |
| P69-R5 | complete | [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts), [prompt-assembler.ts](/R:/Projects/WorldForge/backend/src/engine/prompt-assembler.ts) |
| P69-R6 | complete | [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts), [turn-processor.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/turn-processor.test.ts) |
| P69-R7 | complete | [fixtures/mock-llm.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/fixtures/mock-llm.ts), [turn-processor.observability.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/turn-processor.observability.test.ts) |
| P69-R8 | complete | [69-VALIDATION.md](/R:/Projects/WorldForge/.planning/phases/69-judge-owned-hidden-pass-migration-and-narrator-only-runtime/69-VALIDATION.md) |
| P69-R9 | complete | [69-VALIDATION.md](/R:/Projects/WorldForge/.planning/phases/69-judge-owned-hidden-pass-migration-and-narrator-only-runtime/69-VALIDATION.md) |

## Verification Evidence

- `npx vitest run src/engine/__tests__/hidden-adjudication.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.inventory-authority.test.ts src/engine/__tests__/turn-processor.observability.test.ts` -> exit `0`, `Test Files 5 passed (5)`, `Tests 90 passed (90)`
- `npm --prefix backend run typecheck` -> exit `0`
- `npm --prefix backend test` -> exit `0`, `Test Files 126 passed | 3 skipped (129)`, `Tests 1587 passed | 30 todo (1617)`

## Next

Phase 69 fixes ownership and causality boundaries for the normal player-turn hidden pass. The next runtime design work should be driven by live play quality on top of this split:
- check whether judge-owned hidden causality now produces coherent scene flow in real campaigns
- tighten narrator-facing scene assembly if visible prose still drifts from executed hidden state
- extend the same ownership discipline to adjacent runtime seams only where live play proves it is needed
