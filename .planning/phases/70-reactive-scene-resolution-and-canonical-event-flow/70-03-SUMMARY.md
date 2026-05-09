---
phase: 70-reactive-scene-resolution-and-canonical-event-flow
plan: 03
subsystem: backend-engine
tags: [scene-plan, judge, safeGenerateObject, zod, repair, vitest, tdd]
requires:
  - phase: 70-reactive-scene-resolution-and-canonical-event-flow
    provides: "70-01 ScenePlan contracts and 70-02 deterministic SceneFrame builder"
provides:
  - "Strict ScenePlan loose-to-strict model-output repair boundary"
  - "Judge-lane runScenePlanner call with SceneFrame, Oracle result, allowed actor IDs, and allowed tools in prompt"
  - "Reference-only narratorFacts schema and sanitizer safeguards"
affects: [phase-70, backend-engine, scene-planner, scene-plan-schema, narrator-packet]
tech-stack:
  added: []
  patterns:
    - "safeGenerateObject loose schema output is sanitized, strict-parsed, repaired once, then failed loudly"
    - "ScenePlan prompts expose actor labels only as labels while requiring actor IDs for references"
    - "narratorFacts remain backend reference IDs only, with no prose fact channel"
key-files:
  created: []
  modified:
    - backend/src/engine/scene-plan-schema.ts
    - backend/src/engine/scene-planner.ts
    - backend/src/engine/__tests__/scene-planner.test.ts
key-decisions:
  - "Used the isolated GitNexus repo WorldForge-phase70-execute for impact and change checks instead of the stale plan literal WorldForge."
  - "Kept repair schema loose on both initial and repair calls, but strict ScenePlan parse remains mandatory before return."
  - "Rejected display-name actor repair by design; sanitizer trims and filters references but does not map labels to actor IDs."
patterns-established:
  - "runScenePlanner returns a strict ScenePlan or throws after one repair pass."
  - "ScenePlan repair prompts carry formatted validation issues without logging full frame or hidden rationale."
requirements-completed: [P70-R2, P70-R5, P70-R7]
duration: 23 min
completed: 2026-04-25
---

# Phase 70 Plan 03: Strict ScenePlan Schema and Judge Repair Summary

**Judge-lane ScenePlan generation with loose candidate parsing, strict backend validation, one repair pass, and reference-only narrator facts.**

## Performance

- **Duration:** 23 min
- **Started:** 2026-04-25T15:29:42Z
- **Completed:** 2026-04-25T15:52:37Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `scenePlanLooseSchema`, `sanitizeScenePlanCandidate`, `formatScenePlanValidationIssues`, and `buildScenePlanContract`.
- Implemented `runScenePlanner(...)` with `withRole("judge")`, `createModel(..., { role: "judge" })`, `safeGenerateObject`, temperature `0`, strict parse, one repair pass, and loud failure after repair exhaustion.
- Locked prompt requirements for `SCENE FRAME`, `ORACLE RESULT`, `ALLOWED ACTORS`, `ALLOWED TOOLS`, `USE ACTOR IDS`, and `NARRATOR FACT REFERENCES ONLY`.
- Expanded focused tests to cover schema bounds, display-name actor rejection, malformed tool input rejection, repair success/failure, and prose-bearing `narratorFacts`.

## Task Commits

1. **Task 1 RED:** `ec8e6b0` test(70-03): add failing ScenePlan schema repair tests
2. **Task 1 GREEN:** `a54b7df` feat(70-03): implement ScenePlan schema repair support
3. **Task 2 RED:** `209c54c` test(70-03): add failing ScenePlan generation tests
4. **Task 2 GREEN:** `8c9aa1a` feat(70-03): implement judge ScenePlan generation

## Files Created/Modified

- `backend/src/engine/scene-plan-schema.ts` - Adds loose candidate schema, sanitizer, validation issue formatter, and contract text while preserving strict ScenePlan schema as the return boundary.
- `backend/src/engine/scene-planner.ts` - Replaces the shell planner with judge-lane generation, required prompt sections, strict parse, repair prompt, and fail-loud behavior.
- `backend/src/engine/__tests__/scene-planner.test.ts` - Adds TDD schema and planner tests for repair paths, actor ID rules, Oracle input, and reference-only narrator facts.

## Decisions Made

- `narratorFacts` remains reference-only: `anchorEventId`, `eventIds`, `responseIds`, `actionIds`, and `toolResultRefs`.
- Sanitization trims and filters candidate references but does not invent actor IDs or convert display names into actor IDs.
- Oracle remains separate: planner receives `oracleResult` as binding prompt input and does not compute or replace outcome authority.
- Worktree mode: STATE/ROADMAP updates are left to the phase orchestrator to avoid cross-worktree metadata conflicts.

## Impact Analysis

- `runScenePlanner` upstream impact before edit: LOW, 0 direct callers, 0 affected processes.
- `buildDefaultScenePlannerPrompt` upstream impact before edit: LOW, 1 direct caller (`runScenePlanner`), 1 affected process.
- `buildDefaultScenePlannerSystem` upstream impact before edit: LOW, 1 direct caller (`runScenePlanner`), 1 affected process.
- `runWorldBrainSceneDirection` upstream impact before copying repair pattern: LOW, 0 direct callers, 0 affected processes.
- `scenePlanSchema`, `scenePlanActionSchema`, and `createValidPlan` were not indexed as GitNexus symbols, so impact lookup returned target-not-found for those names.
- Task 2 GREEN staged change detection: MEDIUM, changed `runScenePlanner`, `buildDefaultScenePlannerPrompt`, and `buildDefaultScenePlannerSystem`; affected five existing `RunScenePlanner -> safeGenerateObject/createModel` process traces.
- Final all-scope GitNexus check: LOW and only the pre-existing dirty `CLAUDE.md` GitNexus/context drift remained uncommitted.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Resolved missing read-first role context path**
- **Found during:** Task 2 read-first gate
- **Issue:** Plan listed `backend/src/ai/role-context.ts`, but that file does not exist in this worktree.
- **Fix:** Located the actual role helper through `backend/src/lib/index.ts` and read `backend/src/lib/logger-context.ts`, which exports `withRole`.
- **Files modified:** None
- **Verification:** `rg "function withRole|export .*withRole|const withRole" backend/src` found `backend/src/lib/logger-context.ts`; typecheck and targeted Vitest passed.
- **Committed in:** N/A, context-path repair only.

---

**Total deviations:** 1 auto-fixed (Rule 3 blocking)
**Impact on plan:** Context drift only. No scope expansion and no extra production files touched.

## Known Stubs

None. Stub scan found no `TODO`, `FIXME`, placeholder text, hardcoded empty UI data, or unwired mock flow in the modified files.

## Threat Flags

None. The plan implemented the planned model-output trust boundary and did not introduce new network endpoints, auth paths, file access patterns, or schema/persistence changes.

## Issues Encountered

- The plan text hard-coded `repo: "WorldForge"` for one GitNexus impact call. Execution used `WorldForge-phase70-execute` to honor the isolated worktree requirement.
- `CLAUDE.md` was dirty before execution and remained unstaged/uncommitted as requested.

## Verification

- `cd backend && npx vitest run src/engine/__tests__/scene-planner.test.ts` - RED failed for Task 1, then GREEN passed 13 tests.
- `npm --prefix backend run typecheck` - passed after Task 1.
- `cd backend && npx vitest run src/engine/__tests__/scene-planner.test.ts` - RED failed for Task 2, then GREEN passed 18 tests.
- `npm --prefix backend run typecheck` - passed final verification.
- `cd backend && npx vitest run src/engine/__tests__/scene-planner.test.ts` - passed final verification, 18 tests.
- Acceptance `rg` checks for schema helpers, caps, judge role, safeGenerateObject, prompt markers, repair, strict parse, and validation issues passed.

## TDD Gate Compliance

- RED commits exist: `ec8e6b0`, `209c54c`.
- GREEN commits exist after RED: `a54b7df`, `8c9aa1a`.
- No refactor commit was needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for `70-04`: validator and executor work can consume strict `ScenePlan` output from `runScenePlanner`, with actor IDs and narrator fact references already guarded at the model-output boundary.

## Self-Check: PASSED

- Verified `70-03-SUMMARY.md`, `scene-plan-schema.ts`, `scene-planner.ts`, and `scene-planner.test.ts` exist.
- Verified task commits exist: `ec8e6b0`, `a54b7df`, `209c54c`, `8c9aa1a`.
- Verified final working tree only has pre-existing unstaged `CLAUDE.md` plus this new summary before metadata commit.

---
*Phase: 70-reactive-scene-resolution-and-canonical-event-flow*
*Completed: 2026-04-25*
