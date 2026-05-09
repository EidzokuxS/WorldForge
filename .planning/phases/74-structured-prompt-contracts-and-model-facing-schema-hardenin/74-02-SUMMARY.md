---
phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin
plan: 02
subsystem: ai
tags: [structured-output, prompt-contracts, scene-planner, hidden-adjudication, runtime-tools]

requires:
  - phase: 74-01
    provides: locked prompt-contract audit and semantic adequacy checklist
  - phase: 73-structured-output-stability-and-provider-conformance
    provides: semantic ScenePlan schema and structured-output provider boundary
provides:
  - Reusable engine prompt-contract helper for runtime tool input shapes
  - Versioned ScenePlanner model-facing contract with nested tool input examples
  - Versioned hidden adjudication model-facing contract with nested tool input examples
  - Regression tests for backend-owned IDs, schema authority, and anti-pattern guidance
affects:
  - phase-74-contract-implementation
  - backend-ai-tests
  - gameplay-prompt-boundaries

tech-stack:
  added: []
  patterns:
    - Runtime tool prompt contracts derive allowed tool names from runtimeToolInputSchemas
    - Prompt examples are explicit model guidance while Zod schemas remain the execution authority
    - TDD prompt-contract assertions cover markers, nested shapes, invalid examples, and backend authority text

key-files:
  created:
    - backend/src/engine/prompt-contracts.ts
  modified:
    - backend/src/engine/scene-planner.ts
    - backend/src/engine/hidden-adjudication.ts
    - backend/src/engine/__tests__/scene-planner.test.ts
    - backend/src/engine/__tests__/hidden-adjudication.test.ts

key-decisions:
  - "Runtime tool names are sourced from runtimeToolInputSchemas, while human-authored snippets describe exact nested input shapes and caps."
  - "ScenePlanner and hidden adjudication prompts ask for input as the primary nested tool-call field; payload is documented only as an anti-pattern/compatibility concern."
  - "Backend validation, ID generation, reference resolution, trimming, execution, and final authority remain in existing backend schemas and executors."

patterns-established:
  - "Use STRUCTURED_OUTPUT_CONTRACT markers plus semantic assertions, not marker-only tests, for model-facing prompt contracts."
  - "Keep model-facing examples close to schema-owned runtime tool names without building a broad generic Zod-to-contract generator."

requirements-completed: [P74-R2, P74-R3, P74-R4, P74-R5]

duration: 12 min
completed: 2026-04-28
---

# Phase 74 Plan 02: ScenePlanner and Hidden Adjudication Prompt Contracts Summary

**Versioned gameplay prompt contracts now spell out ScenePlanner and hidden adjudication nested runtime tool inputs while preserving backend-owned validation and execution authority.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-28T17:36:56Z
- **Completed:** 2026-04-28T17:48:06Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Added `prompt-contracts.ts` with reusable runtime tool, ScenePlanner, and hidden adjudication prompt-contract builders.
- Updated ScenePlanner prompts to include `STRUCTURED_OUTPUT_CONTRACT: scene-planner.v1`, exact semantic output shape, nested `toolName/input` tool-call guidance, quick-action caps, invalid examples, and backend-generated ID boundaries.
- Updated hidden adjudication prompts to include `STRUCTURED_OUTPUT_CONTRACT: hidden-adjudication.v1`, exact `actions[]` shape, nested runtime tool examples, quick-action requirements, invalid examples, and no-invention authority language.
- Added TDD regression coverage proving the prompt content is semantically specific, not marker-only.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create engine prompt-contract helper from runtime tool schemas** - `f307bbc` (test), `38efcea` (feat)
2. **Task 2: Wire ScenePlanner prompt contract before model calls** - `908f6fc` (test), `2e74391` (feat)
3. **Task 3: Wire hidden adjudication prompt contract before judge model calls** - `d1e192d` (test), `8580017` (feat)

**Plan metadata:** captured by the final docs commit for this plan.

_Note: TDD tasks intentionally have RED test commits followed by GREEN feature commits._

## Files Created/Modified

- `backend/src/engine/prompt-contracts.ts` - New reusable prompt-contract helper for runtime tool input shapes, ScenePlanner, and hidden adjudication.
- `backend/src/engine/scene-planner.ts` - Inserts the ScenePlanner contract into the prompt before model generation while keeping semantic schema validation unchanged.
- `backend/src/engine/hidden-adjudication.ts` - Inserts the hidden adjudication contract into the judge prompt while keeping schema and executor behavior unchanged.
- `backend/src/engine/__tests__/scene-planner.test.ts` - Adds prompt-content assertions for ScenePlanner contract shape, nested quick-action inputs, anti-patterns, and backend-owned ID boundaries.
- `backend/src/engine/__tests__/hidden-adjudication.test.ts` - Adds prompt-contract helper coverage and hidden adjudication prompt-content assertions.

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/turn-processor.scene-plan.test.ts src/engine/__tests__/hidden-adjudication.test.ts` - PASS, 3 files / 45 tests.
- `npm --prefix backend run typecheck` - PASS.
- `rg -n 'STRUCTURED_OUTPUT_CONTRACT: scene-planner\\.v1|STRUCTURED_OUTPUT_CONTRACT: hidden-adjudication\\.v1|RuntimeToolName, "input": object|payload instead of input|semanticScenePlanSchema|buildScenePlannerPromptContract|buildHiddenAdjudicationPromptContract' ...` - PASS.
- Stub scan over all created/modified plan files found no TODO/FIXME/placeholder/empty UI data stubs.
- Threat surface scan found no new endpoints, auth paths, file access, persistence, or trust-boundary schema changes.
- `gitnexus_detect_changes({scope:"staged"})` before each task commit - PASS, low risk.
- `npx gitnexus analyze` after task commits - PASS.

## Decisions Made

- Runtime tool contract text derives the allowed tool-name list from `runtimeToolInputSchemas`, but uses curated shape snippets for clarity and to avoid a broad Zod-to-text generator in this plan.
- Prompt contracts guide model shape only. Existing `semanticScenePlanSchema`, `adjudicationPlanSchema`, tool executors, backend ID generation, and reference resolution remain authoritative.
- `payload` is not added to hidden adjudication validation; prompts explicitly request `input` and document `payload` as a primary-output anti-pattern.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- GitNexus did not index `runtimeToolInputSchemas` and `adjudicationPlanSchema` as standalone impact targets during pre-edit checks. Function-level impact checks for edited prompt/execution symbols were LOW, and the plan did not change the schema constant behavior.

## Known Stubs

None - stub scan found no placeholder text, TODO/FIXME markers, or unwired empty UI data in created/modified files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Plan 74-03 can consume explicit P0 gameplay prompt contracts and tests as the baseline for the next structured prompt hardening seam.

## Self-Check: PASSED

- Summary and all created/modified plan files exist.
- Task commits `f307bbc`, `38efcea`, `908f6fc`, `2e74391`, `d1e192d`, and `8580017` are present in git history.
- No tracked file deletions were introduced by task commits.

---
*Phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin*
*Completed: 2026-04-28*
