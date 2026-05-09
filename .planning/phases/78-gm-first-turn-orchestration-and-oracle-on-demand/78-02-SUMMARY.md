---
phase: 78-gm-first-turn-orchestration-and-oracle-on-demand
plan: 78-02
subsystem: backend
tags: [scene-frame, gm-first, oracle-on-demand, combat-envelope, semantic-scene-plan]
requires:
  - phase: 78-gm-first-turn-orchestration-and-oracle-on-demand
    provides: "78-01 RED contracts for neutral SceneFrame and GM-first ordering"
provides:
  - "Neutral player-turn SceneFrame packets without raw prose oracle/combat derivation"
  - "Explicit post-GM oracle/combat framing helpers and serialization behavior"
  - "Regression coverage for roster bands, forbidden refs, movement candidates, allowed tools, recent events, deferred hooks, semantic mapping, and NPC internal combat/oracle consumers"
affects: [phase-78, scene-frame, gm-turn-decision, scene-planner, semantic-scene-plan]
tech-stack:
  added: []
  patterns:
    - "SceneFrame semantic fields are post-GM optional fields and are omitted from neutral JSON serialization"
    - "Rulebook facts remain deterministic candidates/affordances, not interpreted action meaning"
key-files:
  created:
    - backend/src/engine/__tests__/semantic-scene-plan-schema.test.ts
  modified:
    - backend/src/engine/scene-frame.ts
    - backend/src/engine/__tests__/scene-frame.test.ts
    - backend/src/engine/scene-planner.ts
key-decisions:
  - "Player-turn SceneFrame construction no longer calls raw-text oracle context or combat envelope derivation."
  - "Explicit oracle/combat context remains supported only when supplied by a later GM/Judge-owned concrete decision path."
  - "The ScenePlan ordering tuple was narrowly updated to the GM-first names required by 78-01 RED tests so backend typecheck can pass; runtime orchestration remains owned by later plans."
patterns-established:
  - "Neutral frames omit oracleContext/combatEnvelope keys entirely when absent, avoiding prompt-shape bias."
  - "Background and hint-band actor refs remain forbidden validation facts while clear candidates stay available."
requirements-completed: [P78-R1, P78-R2, P78-R7]
duration: 19min
completed: 2026-05-03
---

# Phase 78 Plan 78-02: Neutral Scene Packet Boundary Summary

**SceneFrame now carries neutral rulebook evidence and affordances for player turns without deriving target, hostility, Oracle context, or combat framing from raw prose.**

## Performance

- **Duration:** 19 min
- **Started:** 2026-05-03T02:46:26Z
- **Completed:** 2026-05-03T03:05:10Z
- **Tasks:** 2
- **Files modified:** 4 committed files

## Accomplishments

- Removed pre-GM raw `playerAction`/`intent`/`method` authority from `buildSceneFrame`: neutral frames now preserve candidates and facts but omit `oracleContext` and `combatEnvelope` unless explicit context is supplied.
- Added explicit post-GM helper surfaces for candidate-backed Oracle context and concrete-target combat envelopes.
- Added/updated regressions for target candidates, forbidden background refs, movement candidates, allowed tools, recent events, deferred hooks, semantic ScenePlan mapping without neutral-frame defaults, and NPC internal combat/oracle compatibility.

## Task Commits

1. **Tasks 1-2: Neutral SceneFrame and preserved affordances** - `035b330` (`feat`)

## Files Created/Modified

- `backend/src/engine/scene-frame.ts` - Neutralizes player-turn frame construction and documents post-GM semantic fields.
- `backend/src/engine/__tests__/scene-frame.test.ts` - Locks neutral serialization, preserved facts, forbidden refs, explicit post-GM context, and no raw hostile prose derivation.
- `backend/src/engine/__tests__/semantic-scene-plan-schema.test.ts` - Proves semantic mapping requires explicit GM refs and rejects forbidden background actors without fabricating meaning.
- `backend/src/engine/scene-planner.ts` - Updates the exported ScenePlan order tuple to GM-first labels required for typecheck against 78-01 contracts.

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/scene-frame.test.ts` - PASS, 9 tests.
- `npm --prefix backend run typecheck` - PASS.
- `npm --prefix backend run test -- src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/semantic-scene-plan-schema.test.ts` - PASS, 11 tests.
- `npm --prefix backend run test -- src/engine/__tests__/npc-agent.test.ts` - PASS, 21 tests.
- `mcp__gitnexus__.detect_changes({ scope: "staged" })` - PASS scope check; staged scope reported medium risk across 4 changed files, with affected processes limited to two `buildSceneFrame` flows.

## GitNexus Impact

- `buildSceneFrame` - LOW, 0 direct callers/processes reported.
- `resolveOracleContext` - LOW, 1 direct dependent: `buildSceneFrame`.
- `deriveCombatEnvelope` - LOW, 1 direct dependent: `buildSceneFrame`.
- `SCENE_PLAN_TURN_ORDER` - target not found in GitNexus index.
- `runScenePlanner` - LOW, 0 direct callers/processes reported; used as nearest indexed symbol before the narrow `scene-planner.ts` tuple edit.

No HIGH or CRITICAL impact warnings were returned.

## Decisions Made

- Omitted absent `oracleContext` and `combatEnvelope` keys from neutral frame JSON instead of serializing them as `null`, because the plan explicitly required stripping null/undefined semantic keys from pre-GM prompt serialization.
- Kept recent events and deferred hooks as the existing memory/context surfaces; no new memory-hint field was invented.
- Preserved NPC/internal combat/oracle behavior through existing `npc-agent`/`npc-tools` paths rather than routing NPCs through neutral player-turn `SceneFrame`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added focused semantic schema test file**
- **Found during:** Task 2 verification.
- **Issue:** The plan verification command referenced `src/engine/__tests__/semantic-scene-plan-schema.test.ts`, but the file did not exist.
- **Fix:** Added a focused test proving neutral frames do not cause `semanticScenePlanToStrictPlan` to fabricate target/combat meaning and still reject forbidden background refs.
- **Files modified:** `backend/src/engine/__tests__/semantic-scene-plan-schema.test.ts`
- **Verification:** Focused semantic test command passed.
- **Committed in:** `035b330`

**2. [Rule 3 - Blocking] Updated ScenePlan order tuple for typecheck**
- **Found during:** Task 2 verification.
- **Issue:** Backend typecheck failed because 78-01 RED tests referenced GM-first tuple labels not present in `SCENE_PLAN_TURN_ORDER`.
- **Fix:** Updated only the exported ordering tuple labels; runtime `processTurnScenePlan` orchestration remains unchanged for later plans.
- **Files modified:** `backend/src/engine/scene-planner.ts`
- **Verification:** `npm --prefix backend run typecheck` passed.
- **Committed in:** `035b330`

**Total deviations:** 2 auto-fixed blocking issues.

## Known Stubs

None.

## Threat Flags

None.

## Issues Encountered

- The workspace had substantial dirty state before execution, including owned files. The implementation commit staged only the 78-02 files.
- `gsd-sdk query init.execute-phase 78` is unavailable in this workspace; execution continued from the explicit user-provided plan path.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/REQUIREMENTS.md` were already dirty before this plan. They were not updated or staged to avoid committing unrelated work.

## User Setup Required

None.

## Next Phase Readiness

78-03 can now build the GM/Judge first-turn decision against a neutral `SceneFrame`: candidates, visibility/forbidden refs, movement affordances, recent events, deferred hooks, and allowed tools are present, while target/combat/oracle meaning must come from explicit GM-selected refs.

## Self-Check: PASSED

- Found created files:
  - `backend/src/engine/__tests__/semantic-scene-plan-schema.test.ts`
  - `.planning/phases/78-gm-first-turn-orchestration-and-oracle-on-demand/78-02-SUMMARY.md`
- Found modified files:
  - `backend/src/engine/scene-frame.ts`
  - `backend/src/engine/__tests__/scene-frame.test.ts`
  - `backend/src/engine/scene-planner.ts`
- Found commit: `035b330`
- Confirmed no file deletions in `035b330`.
- Confirmed staged code scope with GitNexus before commit.

---
*Phase: 78-gm-first-turn-orchestration-and-oracle-on-demand*
*Completed: 2026-05-03*
