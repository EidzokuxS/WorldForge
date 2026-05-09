---
phase: 78-gm-first-turn-orchestration-and-oracle-on-demand
plan: 78-01
subsystem: testing
tags: [backend, frontend, vitest, gm-first, oracle-on-demand, route-compatibility]
requires:
  - phase: 77-scene-first-vn-rpg-play-surface-and-weekend-playable-ux-slic
    provides: /game raw Send and Continue transport compatibility
provides:
  - RED regression contracts for GM-first turn decision paths
  - RED regression contracts for neutral SceneFrame authority boundaries
  - RED route compatibility tests for deprecated intent/method semantics
  - frontend compatibility coverage for no-roll direct turns and hidden mechanics
affects: [phase-78, gm-turn-decision, scene-frame, turn-processor, chat-route, game-page]
tech-stack:
  added: []
  patterns: [Vitest RED contract tests, Zod discriminated union stub]
key-files:
  created:
    - backend/src/engine/gm-turn-decision.ts
    - backend/src/engine/__tests__/gm-turn-decision.test.ts
  modified:
    - backend/src/engine/__tests__/scene-frame.test.ts
    - backend/src/engine/__tests__/turn-processor.scene-plan.test.ts
    - backend/src/routes/__tests__/chat.scene-plan.test.ts
    - frontend/app/game/__tests__/page.test.tsx
key-decisions:
  - "78-01 intentionally adds RED contracts only; runtime GM-first behavior remains owned by later plans."
  - "Minimal gm-turn-decision production surface is schema/types plus a throwing runGmTurnDecision stub for compilable RED tests."
patterns-established:
  - "GM first-turn decisions use explicit paths: direct, roll_oracle, tool_plan, combat_transition, clarification, continue."
  - "Route compatibility tests treat intent/method as transport mirrors only, not product semantics."
requirements-completed: []
duration: 9min
completed: 2026-05-03
---

# Phase 78 Plan 78-01: Contract Regression Harness And Route Compatibility Summary

**GM-first RED regression harness for backend authority boundaries, route compatibility, and /game no-roll mechanics.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-03T02:46:26Z
- **Completed:** 2026-05-03T02:55:49Z
- **Tasks:** 3
- **Files modified:** 6 committed files

## Accomplishments

- Added `gmTurnDecisionSchema`, `GmTurnDecision`, and a throwing `runGmTurnDecision` stub so RED tests compile without implementing Phase 78 behavior.
- Added backend RED tests for no pre-GM `oracleContext`, no raw hostile-prose combat authority, GM decision ordering, on-demand Oracle, rollback, and intent/method compatibility.
- Added frontend compatibility tests proving `/game` keeps raw Send/Continue transport, clears stale Oracle mechanics when no `oracle_result` streams, and exposes no required Act/Speak/Observe modes.

## Task Commits

1. **Tasks 1-3: RED contract setup** - `957b92e` (`test`)

## Files Created/Modified

- `backend/src/engine/gm-turn-decision.ts` - Minimal importable GM decision schema/type/stub surface.
- `backend/src/engine/__tests__/gm-turn-decision.test.ts` - RED tests for six GM-owned paths and missing runner behavior.
- `backend/src/engine/__tests__/scene-frame.test.ts` - RED assertions that raw prose does not create pre-GM target/combat authority.
- `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts` - RED ordering/static assertions for `buildSceneFrame -> runGmTurnDecision -> optional Oracle`.
- `backend/src/routes/__tests__/chat.scene-plan.test.ts` - Route rollback, no-roll SSE, and contradictory intent/method compatibility assertions.
- `frontend/app/game/__tests__/page.test.tsx` - No-roll stale Oracle and no required mode-control compatibility tests.

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/scene-frame.test.ts src/engine/__tests__/gm-turn-decision.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts` - RED failed as expected:
  - `runGmTurnDecision` throws not implemented.
  - `buildSceneFrame` still derives `oracleContext` from raw text.
  - `SCENE_PLAN_TURN_ORDER` still uses `callOracle` before `runScenePlanner`.
  - `processTurnScenePlan` still lacks `runGmTurnDecision` and still uses raw hostile action logic.
- `npm --prefix backend run test -- src/routes/__tests__/chat.scene-plan.test.ts` - RED failed as expected:
  - `/chat/action` still passes contradictory `intent` and `method` through to `processTurn`.
- `npm --prefix frontend run test -- app/game/__tests__/page.test.tsx components/game/play-surface/__tests__/action-dock.test.tsx` - PASS, 56 tests.
- `mcp__gitnexus__.detect_changes({ scope: "staged" })` - PASS scope check; staged changes reported low risk, 6 changed files, no indexed symbol/process impact.

## GitNexus Impact

Production stub creation was preceded by the plan's impact gate:

- `processTurnScenePlan` - target not found in GitNexus index by that name.
- `buildSceneFrame` - LOW, 0 direct callers/processes reported.
- `runScenePlanner` - LOW, 0 direct callers/processes reported.
- `chatAction` - HIGH; direct caller `submitAction`, indirect `/game` flows `GamePage`, `handleContinueAction`, and `handleMove`. No `chatAction` production code was edited.

## Decisions Made

- Kept production behavior untouched except for the minimal `gm-turn-decision.ts` stub required to make RED tests importable.
- Did not stage a pre-existing dirty hunk in `backend/src/engine/__tests__/scene-frame.test.ts`; only the 78-01 RED hunk was committed.
- Did not update `.planning/STATE.md`, `.planning/ROADMAP.md`, or `.planning/REQUIREMENTS.md` because they were dirty before execution and `gsd-sdk query` is unavailable in this workspace.

## Deviations from Plan

### Tooling Deviations

**1. GSD SDK query unavailable**
- **Found during:** Startup
- **Issue:** `gsd-sdk query init.execute-phase 78` failed; this installed CLI supports only `run`, `auto`, and `init`.
- **Fix:** Continued from explicit user-provided plan path and project state files.
- **Files modified:** None
- **Commit:** N/A

## Known Stubs

- `backend/src/engine/gm-turn-decision.ts:46` - `runGmTurnDecision` intentionally throws `not implemented` until Phase 78-03. This is required for compilable RED tests and does not claim production behavior.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: ai-boundary-stub | `backend/src/engine/gm-turn-decision.ts` | Introduces the future GM/Judge decision contract surface; current plan adds schema/stub only, with no model call or persistence. |

## Issues Encountered

- The working tree had substantial dirty state before execution. One owned file, `backend/src/engine/__tests__/scene-frame.test.ts`, already had unrelated unstaged changes; the commit used selective staging to avoid including that hunk.
- Frontend no-roll test initially asserted visible narration text in a mocked component path that does not always render the newest beat. The assertion was narrowed to the intended mechanics contract: second stream parsed and Inspect shows no stale Oracle.

## User Setup Required

None.

## Next Phase Readiness

Plans 78-02 through 78-06 can now implement against explicit RED failures without weakening the authority boundary. Backend behavior is intentionally still red.

## Self-Check: PASSED

- Found created files:
  - `backend/src/engine/gm-turn-decision.ts`
  - `backend/src/engine/__tests__/gm-turn-decision.test.ts`
  - `.planning/phases/78-gm-first-turn-orchestration-and-oracle-on-demand/78-01-SUMMARY.md`
- Found commit: `957b92e`
- Confirmed no file deletions in `957b92e`.
- Confirmed staged code scope with GitNexus before commit.

---
*Phase: 78-gm-first-turn-orchestration-and-oracle-on-demand*
*Completed: 2026-05-03*
