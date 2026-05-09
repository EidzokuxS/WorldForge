---
phase: 67-narrative-outcome-ceilings-and-npc-combat-posture
subsystem: combat-narration-and-npc-posture
tags: [combat-envelope, narration-bounds, npc-posture, oracle, prompt-assembly, observability, verification]
requires:
  - phase: 66
    provides: qualitative combat envelope and Oracle combat context
provides:
  - backend-owned narrative outcome bounds derived from combat truth
  - final visible narration prompt awareness of combat bounds
  - tick-local NPC combat posture derived from the same combat envelope
  - bounded combat narration and posture observability events
affects: [backend engine, roadmap, requirements, phase-closeout]
key-files:
  created:
    - .planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-VALIDATION.md
    - .planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-SUMMARY.md
    - backend/src/engine/__tests__/combat-bounds.test.ts
    - backend/src/engine/__tests__/combat-posture.test.ts
  modified:
    - backend/src/engine/combat-envelope.ts
    - backend/src/engine/prompt-assembler.ts
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/npc-agent.ts
    - backend/src/engine/__tests__/turn-processor.test.ts
    - backend/src/engine/__tests__/turn-processor.observability.test.ts
    - backend/src/engine/__tests__/npc-agent.test.ts
    - backend/src/engine/__tests__/fixtures/mock-llm.ts
    - .planning/ROADMAP.md
    - .planning/REQUIREMENTS.md
key-decisions:
  - Narrative bounds are prompt-time constraints, not post-generation rewriting.
  - Bounds are injected into both hidden and final visible narration passes so storyteller framing stays aligned end-to-end.
  - NPC combat posture stays tick-local in `npc-agent.ts`; target selection remains local there while derivation logic lives in `combat-envelope.ts`.
  - Phase 67 preserves qualitative combat semantics and avoids runtime-tag, persistence, offscreen, reflection, and frontend expansion.
patterns-established:
  - Add new combat guidance as backend-authored bounded prompt blocks instead of hidden prose rewrites.
  - Share combat-truth derivation across player and NPC runtime paths, then consume it in path-local orchestration layers.
requirements-completed: [P67-R1, P67-R2, P67-R3, P67-R4, P67-R5, P67-R6, P67-R7, P67-R8, P67-R9]
requirements-pending: []
completed: 2026-04-20
---

# Phase 67 Summary

**Phase 67 made Phase 66 combat truth matter for runtime direction, not just Oracle odds.**

## Outcome

- Added deterministic `NarrativeOutcomeBounds` and `NpcCombatPosture` helpers in [combat-envelope.ts](/R:/Projects/WorldForge/backend/src/engine/combat-envelope.ts).
- Wired [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts) to derive outcome bounds after Oracle resolution and before storyteller prompt emission.
- Extended [prompt-assembler.ts](/R:/Projects/WorldForge/backend/src/engine/prompt-assembler.ts) so the final visible narration prompt also receives the same bounds block.
- Wired [npc-agent.ts](/R:/Projects/WorldForge/backend/src/engine/npc-agent.ts) to select a single primary clear-awareness combat target, derive posture from the shared combat envelope, and inject a bounded `[COMBAT POSTURE]` block before NPC decision generation.
- Added bounded `combat.bounds.derived` and `combat.posture.derived` observability events.

## What It Does Not Do

- Does not modify runtime tags
- Does not persist posture or bounds
- Does not change Oracle chance math
- Does not add hard combat formulas or HP math
- Does not change `npc-offscreen.ts`
- Does not change `reflection-agent.ts`
- Does not touch frontend

Those boundaries remain intentional.

## Requirement Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| P67-R1 | ✅ complete | [combat-envelope.ts](/R:/Projects/WorldForge/backend/src/engine/combat-envelope.ts), [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts), [combat-bounds.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/combat-bounds.test.ts) |
| P67-R2 | ✅ complete | [turn-processor.ts](/R:/Projects/WorldForge/backend/src/engine/turn-processor.ts), [prompt-assembler.ts](/R:/Projects/WorldForge/backend/src/engine/prompt-assembler.ts), [turn-processor.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/turn-processor.test.ts) |
| P67-R3 | ✅ complete | [combat-envelope.ts](/R:/Projects/WorldForge/backend/src/engine/combat-envelope.ts), [combat-bounds.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/combat-bounds.test.ts) |
| P67-R4 | ✅ complete | [npc-agent.ts](/R:/Projects/WorldForge/backend/src/engine/npc-agent.ts), [combat-posture.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/combat-posture.test.ts) |
| P67-R5 | ✅ complete | [npc-agent.ts](/R:/Projects/WorldForge/backend/src/engine/npc-agent.ts), [npc-agent.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/npc-agent.test.ts) |
| P67-R6 | ✅ complete | [turn-processor.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/turn-processor.test.ts), [npc-agent.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/npc-agent.test.ts) |
| P67-R7 | ✅ complete | [67-VALIDATION.md](/R:/Projects/WorldForge/.planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-VALIDATION.md) |
| P67-R8 | ✅ complete | [turn-processor.observability.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/turn-processor.observability.test.ts), [npc-agent.test.ts](/R:/Projects/WorldForge/backend/src/engine/__tests__/npc-agent.test.ts) |
| P67-R9 | ✅ complete | [67-VALIDATION.md](/R:/Projects/WorldForge/.planning/phases/67-narrative-outcome-ceilings-and-npc-combat-posture/67-VALIDATION.md) |

## Verification Evidence

- `npm --prefix backend test -- run combat-bounds combat-posture turn-processor.observability turn-processor npc-agent` → exit `0`, `Test Files 9 passed (9)`, `Tests 91 passed (91)`
- `npm --prefix backend test` → exit `0`, `Test Files 123 passed | 3 skipped (126)`, `Tests 1570 passed | 30 todo (1600)`
- `npm --prefix backend run typecheck` → exit `0`
- `git diff --name-only -- backend/src/character/runtime-tags.ts backend/src/engine/npc-offscreen.ts backend/src/engine/reflection-agent.ts frontend` → empty
- `rg -n "combat\.posture|deriveCombatPosture|OUTCOME BOUNDS|buildNarrativeOutcomeBounds" backend/src/engine/npc-offscreen.ts backend/src/engine/reflection-agent.ts backend/src/character/runtime-tags.ts frontend` → no matches

## Next

Phase 68 should move from prompt-aware combat truth to broader gameplay verification or downstream consumers. The most obvious next seams are:
- deliberate gameplay UAT on live turns to prove the new combat guidance actually affects scene quality
- optional offscreen/reflection adoption only if runtime evidence shows those systems need the same combat truth
