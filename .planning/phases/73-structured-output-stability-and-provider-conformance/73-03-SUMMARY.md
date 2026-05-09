---
phase: 73-structured-output-stability-and-provider-conformance
plan: 03
subsystem: backend-engine
tags: [scene-plan, structured-output, zod, semantic-mapping, vitest, gitnexus]

requires:
  - phase: 73-01
    provides: "Structured-output inventory and provider/model capability identity foundation"
  - phase: 70-03
    provides: "Strict ScenePlan schema and legacy loose repair boundary"
  - phase: 70-04
    provides: "ScenePlan validator and deterministic executor"
provides:
  - "Model-facing semantic ScenePlan schema with actor refs and tool intent"
  - "Deterministic semantic-to-strict ScenePlan mapper with backend-generated IDs"
  - "runScenePlanner semantic first-pass and semantic repair path"
  - "Regression coverage for payload alias, omitted action actorRef, missing toolName, and rollback ordering"
affects: [scene-plan, runScenePlanner, structured-output, turn-processor]

tech-stack:
  added: []
  patterns:
    - "Model returns semantic actorRef/toolName/input intent; backend derives strict ScenePlan IDs and narrator references"
    - "semanticScenePlanToStrictPlan validates via scenePlanSchema.safeParse and validateScenePlan before execution"
    - "Legacy scenePlanLooseSchema sanitizer remains compatibility-only and is no longer the runScenePlanner first-pass schema"

key-files:
  created:
    - backend/src/engine/semantic-scene-plan-schema.ts
  modified:
    - backend/src/engine/scene-planner.ts
    - backend/src/engine/__tests__/scene-planner.test.ts
    - backend/src/engine/__tests__/scene-plan-validator.test.ts

key-decisions:
  - "Kept strict scenePlanSchema unchanged as backend final authority instead of weakening it for model output."
  - "Semantic actor refs resolve only through active actors plus clear support actors by id, actorId, or label; background/forbidden refs fail with mapping issues."
  - "Missing plannedActions[].toolName fails as a SemanticScenePlanMappingError before validateScenePlan or executeToolCall can run."

patterns-established:
  - "Use semanticScenePlanSchema for model-facing ScenePlan generation and semanticScenePlanToStrictPlan for backend-owned graph construction."
  - "Use an injectable idFactory in mapper tests while production uses crypto.randomUUID()."

requirements-completed: [P73-R4, P73-R6, P73-R7]

duration: 9min
completed: 2026-04-27
---

# Phase 73 Plan 03: Semantic ScenePlan Contract Summary

**Semantic ScenePlan model output mapped into strict backend-owned ScenePlan IDs, references, tool actions, and validator authority**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-27T21:27:38Z
- **Completed:** 2026-04-27T21:36:40Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added `semantic-scene-plan-schema.ts` with `semanticScenePlanSchema`, `SemanticScenePlanMappingError`, and `semanticScenePlanToStrictPlan(...)`.
- Mapped semantic actor refs, responses, planned actions, deferred hooks, and hidden rationale into strict `ScenePlan` objects with backend-generated anchor/response/action/hook/narrator reference IDs.
- Rewired `runScenePlanner(...)` to request `semanticScenePlanSchema` on the normal first pass, then map to strict `ScenePlan` before returning.
- Updated repair prompts to repair semantic object shape once rather than backend UUID/reference graphs.
- Added regressions for backend-generated IDs, omitted action `actorRef`, `payload` alias, missing `toolName`, semantic prompt language, semantic repair, and existing turn-processor ordering.

## Task Commits

1. **Task 1 RED:** `15e4418` test(73-03) - add failing semantic ScenePlan mapper tests.
2. **Task 1 GREEN:** `0c120b2` feat(73-03) - add semantic ScenePlan mapper.
3. **Task 2 RED:** `16ed36c` test(73-03) - add failing semantic runScenePlanner tests.
4. **Task 2 GREEN:** `a144739` feat(73-03) - use semantic ScenePlan generation.

**Plan metadata:** pending final docs commit.

## Files Created/Modified

- `backend/src/engine/semantic-scene-plan-schema.ts` - model-facing semantic schema, actor-ref resolver, mapping errors, strict parse, and final validator call.
- `backend/src/engine/scene-planner.ts` - semantic first-pass schema, semantic prompt contract, semantic repair prompt, and mapper call.
- `backend/src/engine/__tests__/scene-planner.test.ts` - semantic mapper and planner regressions.
- `backend/src/engine/__tests__/scene-plan-validator.test.ts` - missing `toolName` fails before `executeToolCall` can run.

## Decisions Made

- Kept `scenePlanSchema` strict and unchanged; the new semantic mapper adapts model output before strict parse and validation.
- Allowed labels only as semantic `actorRef` inputs, not as strict `ScenePlan` IDs; the mapper resolves labels deterministically to backend IDs.
- Left `scenePlanLooseSchema` and `sanitizeScenePlanCandidate` available for legacy compatibility tests, but removed them from the normal `runScenePlanner` first pass.

## GitNexus Impact Notes

- `scenePlanSchema` impact lookup returned target-not-found; this was expected for schema constants and execution continued with source/test evidence.
- `sanitizeScenePlanCandidate` upstream impact before Task 1: LOW, 1 direct caller (`strictParseScenePlan`), 1 affected process (`runScenePlanner`).
- `validateScenePlan` upstream impact before Task 1: LOW, 0 direct callers/processes.
- `runScenePlanner` upstream impact before Task 2: LOW, 0 direct callers/processes.
- `buildDefaultScenePlannerPrompt` and `buildDefaultScenePlannerSystem` upstream impact before Task 2: LOW, each with 1 direct caller (`runScenePlanner`) and 1 affected process.
- Staged detect-changes before Task 2 GREEN: MEDIUM, expected `scene-planner.ts` symbols only, affecting five `RunScenePlanner -> provider metadata/capability` traces.
- Final `gitnexus_detect_changes(scope: all)`: no uncommitted changes detected.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope expansion.

## Issues Encountered

- Backend typecheck initially failed while concurrent Plan 73-02 AI files were mid-edit. Those files were outside Plan 73-03 ownership and were not touched; rerun after concurrent work settled passed.
- `npx gitnexus analyze` emitted repeated Node `MaxListenersExceededWarning` warnings but completed successfully each time.

## Known Stubs

None. Stub scan matched only intentional default `{}` test/helper parameters and mapper options; no placeholder UI/data flow, TODO/FIXME, or unwired mock path was introduced.

## Threat Flags

None. This plan implemented the planned model-output trust boundary and did not introduce new network endpoints, auth paths, filesystem access patterns, or persistence schema changes.

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/scene-plan-validator.test.ts` - RED failed before mapper implementation, then passed: 45 tests.
- `npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts` - RED failed before planner rewiring, turn-processor tests passed.
- `npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/scene-plan-validator.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts` - final passed: 3 files, 54 tests.
- `npm --prefix backend run typecheck` - final passed.
- Acceptance `Select-String` checks passed for semantic mapper exports, payload alias, `crypto.randomUUID`, strict `scenePlanSchema.safeParse`, semantic prompt language, and absence of normal first-pass `schema: scenePlanLooseSchema`.

## TDD Gate Compliance

- RED commits exist: `15e4418`, `16ed36c`.
- GREEN commits exist after RED: `0c120b2`, `a144739`.
- No refactor commit was needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 73-04/73-05: normal ScenePlan generation now uses semantic output and backend-owned strict mapping, while strict validators and turn-processor rollback ordering remain covered.

## Self-Check: PASSED

- Verified created/modified files exist: `semantic-scene-plan-schema.ts`, `scene-planner.ts`, `scene-planner.test.ts`, `scene-plan-validator.test.ts`, and `73-03-SUMMARY.md`.
- Verified task commits exist: `15e4418`, `0c120b2`, `16ed36c`, `a144739`.
- Verified required tests, typecheck, and final GitNexus all-scope detect-changes passed.

---
*Phase: 73-structured-output-stability-and-provider-conformance*
*Completed: 2026-04-27*
