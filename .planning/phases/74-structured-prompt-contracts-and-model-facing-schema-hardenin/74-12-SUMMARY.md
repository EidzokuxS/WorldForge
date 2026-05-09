---
phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin
plan: 12
subsystem: ai
tags: [structured-output, prompt-contracts, runtime-tools, scene-planner, hidden-adjudication]

requires:
  - phase: 74-02
    provides: ScenePlanner and hidden-adjudication runtime tool prompt contracts
  - phase: 74-10
    provides: bounded repair policy forbidding invented actions and tool semantics
provides:
  - Selected-tool-specific runtime tool examples in the shared engine prompt contract
  - Regression coverage for log_event-only, quick-action-only, and no-tools runtime contracts
  - GitNexus blast-radius and staged-scope proof for the prompt-contract helper change
affects: [phase-74-gap-closure, scene-planner, hidden-adjudication, runtime-tool-contracts]

tech-stack:
  added: []
  patterns:
    - Runtime tool examples are generated from selectedToolNames, not hardcoded to offer_quick_actions.
    - Curated per-tool examples remain human-authored; no generic Zod-to-prompt generator was introduced.
    - Empty selected tool sets explicitly state that no runtime tools are allowed and omit toolName examples.

key-files:
  created:
    - .planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/74-12-SUMMARY.md
  modified:
    - backend/src/engine/prompt-contracts.ts
    - backend/src/engine/__tests__/scene-planner.test.ts

key-decisions:
  - "Runtime tool compact and invalid examples are selected from selectedToolNames so filtered contracts do not demonstrate unsupported tools."
  - "The quick-action missing actions[].action invalid example is shown only when offer_quick_actions is selected."
  - "ScenePlanner and hidden adjudication keep their caller-level minimal outputs while the runtime helper keeps nested tool input guidance and backend authority text."

patterns-established:
  - "Regression tests cover selected-tool-specific examples directly through buildRuntimeToolInputContract."
  - "GitNexus staged detect_changes is recorded separately for RED test scope and GREEN helper scope."

requirements-completed: [P74-R2, P74-R3, P74-R4, P74-R5]

duration: 5 min
completed: 2026-04-30
---

# Phase 74 Plan 12: Runtime Tool Contract Example Filtering Summary

**Runtime tool prompt examples now follow the selected tool set, so log_event-only contracts no longer teach offer_quick_actions as a valid or invalid shape.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-30T08:56:52Z
- **Completed:** 2026-04-30T09:01:25Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments

- Added TDD regression coverage for `log_event`-only, `offer_quick_actions`-only, and empty runtime tool contract selections.
- Replaced hardcoded quick-action examples with selected-tool-specific valid examples built from curated per-tool input snippets.
- Scoped the missing `actions[].action` invalid example to `offer_quick_actions` contracts only.
- Preserved ScenePlanner and hidden adjudication nested `toolName/input` guidance, payload anti-pattern text, and backend authority boundaries.

## Task Commits

1. **Task 1 RED: Make runtime tool examples selected-tool-specific** - `e18c343` (test)
2. **Task 1 GREEN: Make runtime tool examples selected-tool-specific** - `14c1ae1` (feat)

_Note: This was a TDD task, so RED and GREEN commits are separate._

## Files Created/Modified

- `backend/src/engine/__tests__/scene-planner.test.ts` - Adds direct contract regressions for selected runtime tool examples.
- `backend/src/engine/prompt-contracts.ts` - Generates valid/invalid runtime tool examples from `selectedToolNames`.
- `.planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/74-12-SUMMARY.md` - Records gap-closure evidence and state handoff.

## Verification

- `npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts` - RED failed before implementation with 2 intended failures, then passed after GREEN.
- `npm --prefix backend run test -- src/engine/__tests__/scene-planner.test.ts src/engine/__tests__/hidden-adjudication.test.ts` - PASS, 2 files / 39 tests.
- `npm --prefix backend run typecheck` - PASS.
- `gitnexus_impact({ target: "buildRuntimeToolInputContract", direction: "upstream", maxDepth: 2, includeTests: true })` - LOW risk; direct callers are `buildScenePlannerPromptContract` and `buildHiddenAdjudicationPromptContract`; affected process is `runScenePlanner`.
- `gitnexus_detect_changes({ scope: "staged" })` before RED commit - low risk, one staged test file, no indexed symbol changes.
- `gitnexus_detect_changes({ scope: "staged" })` before GREEN commit - medium risk, one staged helper file, affected process `RunScenePlanner -> SelectRuntimeToolNames`; scope matched the expected engine prompt-contract path.
- `npx gitnexus analyze && npx gitnexus status` - PASS; index updated to `14c1ae1`.

## Decisions Made

- The runtime tool helper now emits one compact valid example per selected tool, using handcrafted inputs that match existing shape snippets.
- Empty selected tool sets keep the helper useful by saying no runtime tools are allowed, without showing any `toolName` JSON examples.
- Unsupported-tool and payload anti-pattern examples remain available when at least one runtime tool is selected; they are omitted for empty selections.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `npx gitnexus analyze` emitted repeated Node `MaxListenersExceededWarning` warnings, but indexing completed successfully and `npx gitnexus status` reported current commit `14c1ae1` as up to date.

## Known Stubs

None. Stub scan found only implementation accumulators/default parameters in the edited files (`invalidExamples = []`, default option objects), not UI stubs or placeholder data paths.

## Threat Flags

None. The change edits prompt text and tests only; it adds no endpoints, auth paths, file access patterns, persistence, or schema trust boundary.

## TDD Gate Compliance

- RED gate commit present: `e18c343` for failing selected-example tests.
- GREEN gate commit present: `14c1ae1` for selected-tool-specific runtime examples.
- Refactor gate: not needed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 74-13 gap closure. The runtime-tool example gap from `74-VERIFICATION.md` is closed, while the remaining verifier gaps are still owned by later gap-closure plans.

## Self-Check: PASSED

- Modified files exist: `backend/src/engine/prompt-contracts.ts` and `backend/src/engine/__tests__/scene-planner.test.ts`.
- Summary exists at `.planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/74-12-SUMMARY.md`.
- Task commits `e18c343` and `14c1ae1` are present in git history.
- No tracked file deletions were introduced by task commits.

---
*Phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin*
*Completed: 2026-04-30*
