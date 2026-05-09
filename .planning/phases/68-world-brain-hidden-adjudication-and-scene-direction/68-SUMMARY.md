---
phase: 68-world-brain-hidden-adjudication-and-scene-direction
subsystem: runtime-scene-causality
tags: [world-brain, adjudication, scene-direction, prompt-assembly, turn-processor, observability, verification]
requires:
  - phase: 67
    provides: combat-aware bounded runtime prompt discipline
provides:
  - judge-owned bounded scene-direction contract
  - player-turn world-brain pass before hidden tool-driving
  - opening-scene world-brain pass before visible narration
  - SceneAssembly carriage of raw plus player-perceivable world-brain packets
  - final-visible prompt sections for scene direction and narration guardrails
  - compact world-brain observability events
affects: [backend engine, planning truth, verification]
key-files:
  created:
    - .planning/phases/68-world-brain-hidden-adjudication-and-scene-direction/68-VALIDATION.md
    - .planning/phases/68-world-brain-hidden-adjudication-and-scene-direction/68-SUMMARY.md
    - backend/src/engine/world-brain.ts
    - backend/src/engine/__tests__/world-brain.test.ts
    - backend/src/engine/__tests__/scene-assembly.test.ts
  modified:
    - backend/src/engine/scene-assembly.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/storyteller-contract.ts
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/__tests__/prompt-assembler.test.ts
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/engine/__tests__/turn-processor.observability.test.ts
    - backend/src/engine/__tests__/turn-processor.inventory-authority.test.ts
    - backend/src/engine/__tests__/fixtures/mock-llm.ts
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
    - .planning/STATE.md
key-decisions:
  - Phase 68 adds a judge-owned scene-direction seam but deliberately does not migrate hidden tool-driving ownership away from storyteller.
  - SceneAssembly is the authoritative bridge: raw world-brain direction enters there and final-visible narration consumes only the filtered player-perceivable derivative.
  - Observability records bounded counts and lengths only; raw hidden reasoning stays out of logs.
  - Opening scenes and normal turns use the same world-brain contract so the scene-causality model stays consistent across both entry paths.
patterns-established:
  - Add bounded hidden adjudication as structured data first, then feed it through authoritative scene assembly before any visible prose consumer reads it.
  - When legacy or incomplete records appear in tests or runtime, defensive display-name fallbacks are preferable to crashing turn orchestration.
requirements-completed: [P68-R1, P68-R2, P68-R3, P68-R4, P68-R5, P68-R6, P68-R7, P68-R8, P68-R9]
requirements-pending: []
completed: 2026-04-20
---

# Phase 68 Summary

**Phase 68 introduced the missing judge-owned causal handoff between raw world state and narration.**

## Outcome

- Added [world-brain.ts](/R:/Projects/WorldForge/backend/src/engine/world-brain.ts) with a bounded `WorldBrainSceneDirection` contract, sanitization, perceivable filtering, and hidden/visible formatter helpers.
- Wired [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts) so:
  - normal player turns run the world-brain pass after Oracle and before hidden storyteller tool-driving
  - opening scenes run the same seam before visible narration
  - compact `world-brain.scene-direction` observability fires for both `player-turn` and `opening-scene`
- Extended [scene-assembly.ts](/R:/Projects/WorldForge/backend/src/engine/scene-assembly.ts) to carry both:
  - `sceneDirection`
  - `playerPerceivableSceneDirection`
- Extended [prompt-assembler.ts](/R:/Projects/WorldForge/backend/src/engine/prompt-assembler.ts) so:
  - hidden tool-driving can consume `[WORLD-BRAIN DIRECTION]`
  - final-visible narration consumes `[SCENE DIRECTION]` and `[NARRATION GUARDRAILS]`
- Tightened [storyteller-contract.ts](/R:/Projects/WorldForge/backend/src/engine/storyteller-contract.ts) to treat world-brain direction as authoritative scene-causality input

## What Phase 68 Does Not Do

- does **not** move hidden tool-driving ownership into a judge-owned pass
- does **not** redesign routes or SSE transport
- does **not** rewrite Oracle chance math
- does **not** touch frontend
- does **not** push combat or scene-direction logic into `npc-offscreen.ts`, `reflection-agent.ts`, or runtime tags

Those remain Phase 69+ work.

## Requirement Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| P68-R1 | ✅ complete | [world-brain.ts](/R:/Projects/WorldForge/backend/src/engine/world-brain.ts), [world-brain.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/world-brain.test.ts) |
| P68-R2 | ✅ complete | [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts), [turn-processor.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/turn-processor.test.ts) |
| P68-R3 | ✅ complete | [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts), [turn-processor.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/turn-processor.test.ts) |
| P68-R4 | ✅ complete | [scene-assembly.ts](/R:/Projects/WorldForge/backend/src/engine/scene-assembly.ts), [scene-assembly.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/scene-assembly.test.ts) |
| P68-R5 | ✅ complete | [prompt-assembler.ts](/R:/Projects/WorldForge/backend/src/engine/prompt-assembler.ts), [prompt-assembler.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/prompt-assembler.test.ts) |
| P68-R6 | ✅ complete | [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts), [storyteller-contract.ts](/R:/Projects/WorldForge/backend/src/engine/storyteller-contract.ts) |
| P68-R7 | ✅ complete | [68-VALIDATION.md](/R:/Projects/WorldForge/.planning/phases/68-world-brain-hidden-adjudication-and-scene-direction/68-VALIDATION.md) |
| P68-R8 | ✅ complete | [turn-processor.observability.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/turn-processor.observability.test.ts), [fixtures/mock-llm.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/fixtures/mock-llm.ts) |
| P68-R9 | ✅ complete | [68-VALIDATION.md](/R:/Projects/WorldForge/.planning/phases/68-world-brain-hidden-adjudication-and-scene-direction/68-VALIDATION.md) |

## Verification Evidence

- `npx vitest run src/engine/__tests__/world-brain.test.ts src/engine/__tests__/scene-assembly.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/turn-processor.observability.test.ts` → exit `0`, `Test Files 5 passed (5)`, `Tests 90 passed (90)`
- `npm --prefix backend run typecheck` → exit `0`
- `npm --prefix backend test` → exit `0`, `Test Files 125 passed | 3 skipped (128)`, `Tests 1582 passed | 30 todo (1612)`

## Next

Phase 69 is the natural follow-up:
- move hidden tool-driving ownership out of storyteller and into a judge-owned runtime pass
- leave storyteller as narrator-only over already-committed authoritative outcomes
- keep the Phase 68 `WorldBrainSceneDirection` contract as the seed, not a throwaway prototype
