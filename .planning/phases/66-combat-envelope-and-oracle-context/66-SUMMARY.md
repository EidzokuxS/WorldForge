---
phase: 66-combat-envelope-and-oracle-context
subsystem: oracle-combat-context
tags: [combat-envelope, oracle, target-context, npc-agent, observability, verification]
requires:
  - phase: 65
    provides: powerStats parity for key and supporting NPCs, including worldgen and review paths
provides:
  - backend-owned qualitative combat envelope for hostile adjudication
  - additive target-side combat snapshot contract
  - optional Oracle payload contract for power-aware rulings
  - bounded combat observability events on player and NPC hostile paths
affects: [backend engine, roadmap, requirements, phase-closeout]
key-files:
  created:
    - .planning/phases/66-combat-envelope-and-oracle-context/66-VALIDATION.md
    - .planning/phases/66-combat-envelope-and-oracle-context/66-SUMMARY.md
    - backend/src/engine/combat-envelope.ts
    - backend/src/engine/__tests__/combat-envelope.test.ts
    - backend/src/engine/__tests__/target-context.test.ts
  modified:
    - backend/src/engine/target-context.ts
    - backend/src/engine/oracle.ts
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/npc-tools.ts
    - backend/src/engine/__tests__/oracle.test.ts
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/engine/__tests__/turn-processor.observability.test.ts
    - backend/src/engine/__tests__/npc-agent.test.ts
    - backend/src/engine/__tests__/fixtures/mock-llm.ts
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
key-decisions:
  - Phase 66 stayed Oracle-only; storyteller, posture, offscreen, reflection, runtime-tags, and persistence were deferred.
  - Combat semantics remain qualitative and backend-authored rather than becoming hard combat math.
  - Character targets without power data produce no envelope instead of fake comparison data.
patterns-established:
  - Use additive target-context enrichment plus optional Oracle payload growth for new adjudication context.
  - Log new mechanical seams with bounded Phase 58-style events instead of dumping raw power payloads.
requirements-completed: [P66-R1, P66-R2, P66-R3, P66-R4, P66-R5, P66-R6, P66-R7, P66-R8]
requirements-pending: []
completed: 2026-04-19
---

# Phase 66 Summary

**Phase 66 made combat stats mechanically meaningful for adjudication without turning the engine into hard numeric combat simulation.**

## Outcome

- Added a pure backend-owned [combat-envelope.ts](/R:/Projects/WorldForge/backend/src/engine/combat-envelope.ts) module that compares actor and target power context deterministically.
- Extended [target-context.ts](/R:/Projects/WorldForge/backend/src/engine/target-context.ts) with an additive `combatSnapshot` for character targets only.
- Extended [oracle.ts](/R:/Projects/WorldForge/backend/src/engine/oracle.ts) with an optional `combatEnvelope` contract and explicit no-bypass durability-gap clamp wording.
- Wired both [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts) and [npc-tools.ts](/R:/Projects/WorldForge/backend/src/engine/npc-tools.ts) to build and pass the same envelope for eligible hostile actions.
- Added bounded `combat.envelope` observability events for player and NPC hostile adjudication paths.

## What It Does Not Do

- Does not modify runtime tags
- Does not change storyteller prompt assembly
- Does not add narrative ceilings/floors yet
- Does not add NPC combat posture yet
- Does not persist envelope state
- Does not touch frontend

Those are intentionally deferred to Phase 67.

## Requirement Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| P66-R1 | ✅ complete | [combat-envelope.ts](/R:/Projects/WorldForge/backend/src/engine/combat-envelope.ts), [combat-envelope.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/combat-envelope.test.ts) |
| P66-R2 | ✅ complete | [combat-envelope.ts](/R:/Projects/WorldForge/backend/src/engine/combat-envelope.ts), [oracle.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/oracle.test.ts) |
| P66-R3 | ✅ complete | [target-context.ts](/R:/Projects/WorldForge/backend/src/engine/target-context.ts), [target-context.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/target-context.test.ts) |
| P66-R4 | ✅ complete | [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts), [turn-processor.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/turn-processor.test.ts) |
| P66-R5 | ✅ complete | [npc-tools.ts](/R:/Projects/WorldForge/backend/src/engine/npc-tools.ts), [npc-agent.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/npc-agent.test.ts) |
| P66-R6 | ✅ complete | [oracle.ts](/R:/Projects/WorldForge/backend/src/engine/oracle.ts), [oracle.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/oracle.test.ts) |
| P66-R7 | ✅ complete | [66-VALIDATION.md](/R:/Projects/WorldForge/.planning/phases/66-combat-envelope-and-oracle-context/66-VALIDATION.md) |
| P66-R8 | ✅ complete | [66-VALIDATION.md](/R:/Projects/WorldForge/.planning/phases/66-combat-envelope-and-oracle-context/66-VALIDATION.md) |

## Verification Evidence

- `npm --prefix backend test -- run combat-envelope` → exit `0`
- `npm --prefix backend test -- run target-context` → exit `0`
- `npm --prefix backend test -- run oracle` → exit `0`
- `npm --prefix backend test -- run turn-processor.observability turn-processor npc-agent` → exit `0`
- `npm --prefix backend test` → exit `0`, `Test Files 121 passed | 3 skipped (124)`, `Tests 1554 passed | 30 todo (1584)`
- `npm --prefix backend run typecheck` → exit `0`
- `git diff --name-only -- backend/src/character/runtime-tags.ts backend/src/engine/prompt-assembler.ts backend/src/engine/npc-offscreen.ts backend/src/engine/reflection-agent.ts frontend` → empty

## Next

Phase 67 should consume this envelope in two places:
- narrative outcome ceilings/floors after Oracle so narration respects matchup plausibility
- NPC combat posture so hostile behavior uses the same matchup truth instead of inventing a second tactical model
