---
phase: 78-gm-first-turn-orchestration-and-oracle-on-demand
plan: 78-04
subsystem: backend
tags: [turn-processor, gm-first, oracle-on-demand, rollback, sse]
requires:
  - phase: 78-gm-first-turn-orchestration-and-oracle-on-demand
    provides: "78-02 neutral SceneFrame and 78-03 GM turn decision contract"
provides:
  - "GM-first default turn orchestration"
  - "Oracle calls gated to roll_oracle decisions only"
  - "No-mutation ScenePlan artifacts for direct, continue, and clarification paths"
  - "Route compatibility normalization for deprecated intent/method fields"
affects: [turn-processor, chat-route, scene-plan-tests, route-rollback-tests]
tech-stack:
  added: []
  patterns: [validated zero-action ScenePlan artifact, optional OracleResult, compatibility-field normalization]
key-files:
  created:
    - .planning/phases/78-gm-first-turn-orchestration-and-oracle-on-demand/78-04-SUMMARY.md
  modified:
    - backend/src/engine/turn-processor.ts
    - backend/src/engine/__tests__/turn-processor.scene-plan.test.ts
    - backend/src/routes/chat.ts
    - backend/src/routes/__tests__/chat.scene-plan.test.ts
key-decisions:
  - "processTurnScenePlan now runs runGmTurnDecision after neutral buildSceneFrame and before any Oracle request."
  - "roll_oracle is the only path that calls callOracle or emits oracle_result."
  - "Direct, continue, and clarification paths use validated zero-action ScenePlan artifacts; clarification emits narrative + finalizing_turn/done without ticking world state or running post-turn world simulation."
  - "The /action route accepts legacy intent/method but passes playerAction as the compatibility intent and an empty method."
requirements-completed: [P78-R1, P78-R3, P78-R4, P78-R5, P78-R7]
duration: 7min
completed: 2026-05-03T03:25:56Z
---

# Phase 78 Plan 78-04: Turn Processor GM-First Orchestration Summary

**GM-first turn processor wiring with Oracle-on-demand and rollback-safe no-mutation paths.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-03T03:19:28Z
- **Completed:** 2026-05-03T03:25:56Z
- **Tasks:** 2
- **Files modified:** 4 committed files

## Accomplishments

- Replaced the default ScenePlan path's unconditional Oracle call with `buildSceneFrame -> runGmTurnDecision -> optional callOracle`.
- Added zero-action ScenePlan construction in `turn-processor.ts` for direct, continue, and clarification decisions so validation/execution still gate the no-mutation artifact.
- Clarification now emits only existing SSE families: optional `scene-settling`, one `narrative`, optional `finalizing_turn`, and `done`; it emits no `oracle_result`, `state_update`, or `quick_actions`, executes no tools, and does not advance the campaign tick.
- Normalized `/action` route compatibility: `playerAction` remains authoritative, `intent` mirrors it, and `method` is passed as empty compatibility data.
- Expanded route tests for direct speech, observation, clarification, Continue, invalid execution rollback, and Oracle failure rollback.

## Task Commits

1. **Tasks 1-2: GM-first orchestration and rollback boundaries** - `c9ec25d` (`feat`)

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/turn-processor.scene-plan.test.ts src/routes/__tests__/chat.scene-plan.test.ts` - PASS, 21 tests.
- `npm --prefix backend run test -- src/routes/__tests__/chat.scene-plan.test.ts` - PASS, 10 tests.
- `npm --prefix backend run typecheck` - PASS.
- `mcp__gitnexus__.detect_changes({ repo: "WorldForge", scope: "staged" })` - PASS before commit; low risk, 4 changed files, 0 affected processes.
- `npx gitnexus analyze` - PASS after commit; repository indexed successfully with 2,813 nodes, 7,872 edges, 226 flows. The analyzer emitted non-blocking Node `MaxListenersExceededWarning` warnings.

## GitNexus Impact

- `processTurn` - target not found in GitNexus index.
- `processTurnScenePlan` - target not found in GitNexus index.
- `TurnEvent` - LOW, 0 direct callers/processes.
- `buildSceneFrame` - LOW, 0 direct callers/processes.
- `runGmTurnDecision` - LOW, 0 direct callers/processes.
- `callOracle` - LOW, 1 direct dependent (`createNpcAgentTools`), 2 affected NPC-agent processes; this plan did not edit `callOracle`.
- `runScenePlanner` - LOW, 0 direct callers/processes.
- `executeScenePlan` - LOW, 0 direct callers/processes.
- Route context for `backend/src/routes/chat.ts`: `writeTurnEventSSE` LOW, 1 direct file-level caller; `buildOnPostTurn` LOW, 1 direct file-level caller. GitNexus query did not expose a dedicated `/action` symbol.

No HIGH or CRITICAL production symbol impact was returned for edited symbols.

## Deviations from Plan

### Auto-fixed Issues

None.

### Tooling Deviations

**1. GSD SDK query unavailable**
- **Found during:** Startup and closeout.
- **Issue:** `gsd-sdk query init.execute-phase 78` and related state handlers are unavailable in this workspace; the installed CLI exposes only `run`, `auto`, and `init`.
- **Fix:** Executed from the user-provided plan path and explicit project state files.
- **Files modified:** None.
- **Commit:** N/A.

**2. Metadata state updates skipped**
- **Found during:** Closeout.
- **Issue:** `.planning/STATE.md`, `.planning/ROADMAP.md`, and `.planning/REQUIREMENTS.md` were already dirty before execution. Updating them would have mixed unrelated pre-existing work into this plan.
- **Fix:** Created this summary and committed it separately; did not stage unrelated planning files.
- **Files modified:** None.
- **Commit:** N/A.

## Known Stubs

None. Stub-pattern scan found intentional nullable/empty compatibility values only, including `compatibilityMethod = ""`, optional `oracleResult`, and `combatEnvelope = null` in the GM-first path. These represent the no-roll/no-pre-GM-combat boundary rather than unwired UI or mock data.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: ai-boundary-orchestration | `backend/src/engine/turn-processor.ts` | Wires the GM/Judge decision boundary into live turn orchestration. Mitigated by strict GM decision validation from 78-03, ScenePlan validation, deterministic execution, rollback, and Oracle restricted to `roll_oracle`. |

## Issues Encountered

- The worktree had substantial unrelated dirty state before execution. `backend/src/engine/turn-processor.ts` already contained unstaged scene-scope changes; the commit used selective staging so those hunks remain unstaged and were not included in `c9ec25d`.
- `gsd-sdk query` state and roadmap handlers were unavailable, so formal GSD state advancement could not run.

## User Setup Required

None.

## Next Phase Readiness

78-05 can build on the live GM-first flow. The critical runtime boundary is now in place: tool/combat paths do not request backend randomness directly, and only `roll_oracle` can call Oracle or emit an Oracle receipt.

## Self-Check: PASSED

- Found modified files in commit `c9ec25d`:
  - `backend/src/engine/turn-processor.ts`
  - `backend/src/engine/__tests__/turn-processor.scene-plan.test.ts`
  - `backend/src/routes/chat.ts`
  - `backend/src/routes/__tests__/chat.scene-plan.test.ts`
- Found summary file:
  - `.planning/phases/78-gm-first-turn-orchestration-and-oracle-on-demand/78-04-SUMMARY.md`
- Confirmed commit `c9ec25d` exists.
- Confirmed no file deletions in `c9ec25d`.

---
*Phase: 78-gm-first-turn-orchestration-and-oracle-on-demand*
*Completed: 2026-05-03*
