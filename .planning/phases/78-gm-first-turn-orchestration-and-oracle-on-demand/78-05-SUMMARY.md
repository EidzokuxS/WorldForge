---
phase: 78-gm-first-turn-orchestration-and-oracle-on-demand
plan: 78-05
subsystem: backend
tags: [gm-first, scene-plan-validation, combat-envelope, rollback, world-truth]
requires:
  - phase: 78-gm-first-turn-orchestration-and-oracle-on-demand
    provides: "78-03 GM decision contract and 78-04 GM-first turn processor wiring"
provides:
  - "Concrete GM ref/tool validation coverage"
  - "Combat envelope derivation only after GM-selected combat_transition"
  - "Strict runtime tool input validation against extra LLM-authored state deltas"
  - "Execution failure proof for route rollback"
affects: [scene-plan-validator, semantic-scene-plan-schema, scene-plan-executor, turn-processor, combat-envelope]
tech-stack:
  added: []
  patterns: [frame-candidate validation, exact runtime tool input validation, GM-selected combat envelope]
key-files:
  created:
    - backend/src/engine/__tests__/scene-plan-executor.test.ts
    - .planning/phases/78-gm-first-turn-orchestration-and-oracle-on-demand/78-05-SUMMARY.md
  modified:
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/scene-plan-validator.ts
    - backend/src/engine/combat-envelope.ts
    - backend/src/engine/__tests__/semantic-scene-plan-schema.test.ts
    - backend/src/engine/__tests__/scene-plan-validator.test.ts
    - backend/src/engine/__tests__/turn-processor.scene-plan.test.ts
key-decisions:
  - "validateScenePlan now rejects tool inputs that contain fields outside the runtime tool schema, preventing LLM-authored direct state deltas from reaching execution."
  - "processTurnScenePlan derives combatEnvelope and outcome bounds only for GM-selected combat_transition decisions with a concrete target actor candidate."
  - "isHostileCombatAction remains only as an NPC/internal or explicitly GM-selected helper and is documented as forbidden for player-turn pre-GM orchestration."
requirements-completed: [P78-R1, P78-R5, P78-R7]
duration: 52min
completed: 2026-05-03
---

# Phase 78 Plan 78-05: Concrete Tool, Combat, And World-Truth Validation Summary

**Backend validation now fails closed on invented refs/tools, extra direct state deltas, and raw-text combat inference.**

## Accomplishments

- Expanded semantic ScenePlan tests to reject invented actor labels/IDs, forbidden/background actors, unsupported tools, and missing tool names without backend fallback selection.
- Tightened `validateScenePlan` so runtime tool inputs must exactly match their schemas; extra fields such as LLM-authored `stateDelta`, HP, inventory, or location overwrites now fail before `executeToolCall`.
- Wired `processTurnScenePlan` combat math through GM `combat_transition` only: it resolves a concrete target candidate, builds a combat envelope from backend player/NPC records, attaches it to the frame, and derives narrative bounds.
- Added executor rollback-boundary evidence proving failed legal execution throws through `ScenePlanExecutionError` with partial evidence, allowing the `/action` restore path to own rollback.
- Added the required `isHostileCombatAction` code comment limiting it to NPC/internal or explicitly GM-selected helper paths.

## Task Commits

1. **Tasks 1-3: Concrete validation, GM-selected combat, rollback proof** - `242c27c` (`feat`)

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/semantic-scene-plan-schema.test.ts src/engine/__tests__/scene-plan-validator.test.ts` - PASS, 24 tests.
- `npm --prefix backend run test -- src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/scene-plan-validator.test.ts` - PASS, 32 tests.
- `npm --prefix backend run test -- src/engine/__tests__/scene-plan-executor.test.ts src/routes/__tests__/chat.scene-plan.test.ts` - PASS, 11 tests.
- `npm --prefix backend run typecheck` - PASS.
- `npm --prefix backend run test -- src/engine/__tests__/npc-agent.test.ts` - PASS, 21 tests.
- `mcp__gitnexus__.detect_changes({ repo: "WorldForge", scope: "staged" })` - PASS before commit; low risk, 7 changed files, 0 affected processes.
- `npx gitnexus analyze` - PASS after commit; repository indexed successfully with non-blocking Node `MaxListenersExceededWarning` warnings.

## GitNexus Impact

- `semanticScenePlanToStrictPlan` - LOW; 1 direct dependent (`parseSemanticScenePlan`), affected flow `runScenePlanner`.
- `validateScenePlan` - LOW; direct dependent `semanticScenePlanToStrictPlan`, affected flow `runScenePlanner`.
- `executeScenePlan` - LOW; 0 direct dependents/processes reported.
- `buildCombatEnvelope` - LOW; direct dependents `buildSceneFrameCombatEnvelopeForConcreteTarget`, `createNpcAgentTools`, and `tickNpcAgentInternal`; affected NPC-agent flows remain covered by tests.
- `isHostileCombatAction` - LOW; direct dependent `createNpcAgentTools`; affected NPC/internal flows remain covered by tests.
- `runtimeToolInputSchemas` - target not found in GitNexus index; source inspection and staged `detect_changes` were used for scope proof.

No HIGH or CRITICAL impact warnings were returned for edited production symbols.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing executor test file**
- **Found during:** Task 3.
- **Issue:** The plan verification command referenced `src/engine/__tests__/scene-plan-executor.test.ts`, but no such file existed.
- **Fix:** Added a focused executor rollback-boundary test.
- **Files modified:** `backend/src/engine/__tests__/scene-plan-executor.test.ts`
- **Commit:** `242c27c`

### Tooling Deviations

**1. GSD SDK query unavailable**
- **Found during:** Startup and closeout.
- **Issue:** `gsd-sdk query init.execute-phase 78` and state handlers are unavailable; this CLI exposes only `run`, `auto`, and `init`.
- **Fix:** Executed from the explicit user-provided plan path and local state files.

**2. Metadata state updates skipped**
- **Found during:** Closeout.
- **Issue:** `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/REQUIREMENTS.md` were dirty before execution.
- **Fix:** Did not update or stage them to avoid mixing unrelated planning work.

## Known Stubs

None.

## Threat Flags

None. The edited surface tightens existing validation/execution boundaries and does not introduce new network, auth, file, or schema trust boundaries.

## Issues Encountered

- `backend/src/engine/turn-processor.ts` already had unrelated unstaged scene-scope hunks. The code commit used interactive hunk staging so only 78-05 combat-transition changes were committed; the pre-existing hunks remain unstaged.
- Initial validation tightening exposed that a successful Zod parse with stripped unknown fields has no `parsed.error`; the error message path was corrected before verification.

## Self-Check: PASSED

- Found created summary: `.planning/phases/78-gm-first-turn-orchestration-and-oracle-on-demand/78-05-SUMMARY.md`
- Found created test: `backend/src/engine/__tests__/scene-plan-executor.test.ts`
- Found code commit: `242c27c`
- Confirmed no tracked file deletions in `242c27c`.
- Confirmed staged code scope with GitNexus before commit.

---
*Phase: 78-gm-first-turn-orchestration-and-oracle-on-demand*
*Completed: 2026-05-03*
