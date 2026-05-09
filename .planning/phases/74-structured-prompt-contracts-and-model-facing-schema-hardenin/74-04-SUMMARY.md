---
phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin
plan: 04
subsystem: ai
tags: [structured-output, prompt-contracts, worldgen, research-artifact, generated-context]

requires:
  - phase: 74-01
    provides: locked prompt-contract audit and semantic adequacy checklist
  - phase: 72-worldgen-authority-propagation-regression-audit
    provides: WorldgenResearchArtifactV2 authority boundary and stale-context clearing rules
  - phase: 73-structured-output-stability-and-provider-conformance
    provides: generatedContext shape hardening lessons for citations and canonicalNames
provides:
  - Worldgen research prompt-contract helpers for generatedContext, research artifacts, source-rule authority, sufficiency, and fact extraction
  - Named pure buildGeneratedContextPrompt export for direct contract tests
  - Regression tests for citations array-object shape, canonicalNames object shape, source-rule authority text, valid/minimal/invalid examples, and artifact caps
affects:
  - phase-74-contract-implementation
  - worldgen-research
  - backend-ai-tests
  - generated-context-contracts

tech-stack:
  added: []
  patterns:
    - Worldgen research prompt contracts use curated exact-shape text while Zod schemas and parsers remain final backend authority
    - Source-role/canon meaning remains LLM-authored artifact data; backend stores, trims, caps, validates, and fails closed
    - TDD prompt-contract assertions cover semantic shape, anti-pattern examples, and direct builder access

key-files:
  created:
    - backend/src/worldgen/prompt-contracts.ts
  modified:
    - backend/src/worldgen/research-artifact.ts
    - backend/src/worldgen/ip-researcher.ts
    - backend/src/worldgen/__tests__/research-artifact.test.ts
    - backend/src/worldgen/__tests__/ip-researcher.test.ts

key-decisions:
  - "Worldgen research contract text lives in pure backend/src/worldgen/prompt-contracts.ts helpers, with marker/shape constants exposed from research-artifact.ts where useful for tests."
  - "buildGeneratedContextPrompt is a normal named pure export for direct contract reuse and tests, not an _test namespace or mocked call-position access."
  - "Prompt contracts document target shape, caps, optional/null rules, valid/minimal/invalid examples, and source-rule authority; schemas/parsers remain authoritative and backend code does not infer canon/source roles."

patterns-established:
  - "Use STRUCTURED_OUTPUT_CONTRACT markers plus semantic assertions for worldgen research prompts, not marker-only tests."
  - "Place model-facing contract blocks before raw premise/source/search payloads so the model sees output shape before data."

requirements-completed: [P74-R2, P74-R3, P74-R4, P74-R5]

duration: 12 min
completed: 2026-04-28
---

# Phase 74 Plan 04: Worldgen Research Prompt Contracts Summary

**Worldgen research prompts now expose exact generatedContext and research-artifact contracts while preserving LLM-owned source meaning and backend-owned validation.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-04-28T17:53:58Z
- **Completed:** 2026-04-28T18:05:27Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `backend/src/worldgen/prompt-contracts.ts` with pure prompt-contract builders for generatedContext, research artifacts, source-rule authority, artifact sufficiency, and follow-up fact extraction.
- Exposed generatedContext marker/shape constants from `research-artifact.ts` without changing parsing semantics.
- Inserted worldgen contract blocks into `ip-researcher.ts` before raw payloads for brief generation, generatedContext compilation, sufficiency evaluation, and fact extraction.
- Exported `buildGeneratedContextPrompt` as a normal pure builder and added direct tests against the real prompt.
- Added TDD coverage for citations array-object shape, canonicalNames object shape, caps, valid/minimal/invalid examples, and source-rule authority boundaries.

## Task Commits

Each task was committed atomically:

1. **Task 1: Create worldgen research prompt-contract helpers** - `2998538` (test), `ebaa7b7` (feat)
2. **Task 2: Harden research artifact prompts and export generatedContext builder** - `2c3e0f6` (test), `d01f2a1` (feat)

**Plan metadata:** captured by the final docs commit for this plan.

_Note: TDD tasks intentionally have RED test commits followed by GREEN feature commits._

## Files Created/Modified

- `backend/src/worldgen/prompt-contracts.ts` - New pure contract helpers for generatedContext, research artifact briefs, source-rule authority, sufficiency, and fact extraction prompts.
- `backend/src/worldgen/research-artifact.ts` - Exposes generatedContext model shape and worldgen research artifact marker constants for contract helpers/tests.
- `backend/src/worldgen/ip-researcher.ts` - Inserts contract helpers before model payloads and exports the generatedContext prompt builder.
- `backend/src/worldgen/__tests__/research-artifact.test.ts` - Adds prompt-contract helper tests for nested shape, caps, examples, and anti-patterns.
- `backend/src/worldgen/__tests__/ip-researcher.test.ts` - Adds regression tests proving real prompt builders include exact contracts and source-rule authority text.

## Verification

- `npm --prefix backend run test -- src/worldgen/__tests__/ip-researcher.test.ts src/worldgen/__tests__/research-artifact.test.ts` - PASS, 2 files / 40 tests.
- `npm --prefix backend run typecheck` - PASS.
- `rg -n "STRUCTURED_OUTPUT_CONTRACT: generated-context\\.v1|STRUCTURED_OUTPUT_CONTRACT: research-artifact\\.v1|STRUCTURED_OUTPUT_CONTRACT: worldgen-research-artifact\\.v1|STRUCTURED_OUTPUT_CONTRACT: artifact-sufficiency\\.v1|STRUCTURED_OUTPUT_CONTRACT: artifact-fact-extraction\\.v1|buildGeneratedContextPrompt\\(" ...` - PASS.
- Stub scan over all created/modified plan files found no TODO/FIXME/placeholder/unwired UI data stubs. Matches were local accumulator initializers and test default objects only.
- Threat surface scan found no new endpoints, auth paths, file access, persistence, or new trust-boundary schemas.
- `gitnexus_detect_changes({scope:"staged"})` before each task commit - PASS, low risk.
- `npx gitnexus analyze` after code commits - PASS.

## Decisions Made

- Contract examples are curated strings rather than a broad generic Zod-to-contract generator, matching the plan's scope and keeping prompts readable.
- `buildGeneratedContextPrompt` is exported directly because the test target is the real model-facing prompt, not a private implementation reached through mocked call order.
- Prompt contracts describe what the model should emit; backend repair continues to normalize shape/caps only and does not infer canonical truth, source roles, or premise meaning from strings.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Used package-relative Vitest filters for final verification**
- **Found during:** Plan-level verification
- **Issue:** The plan-listed command `npm --prefix backend run test -- backend/src/worldgen/__tests__/ip-researcher.test.ts backend/src/worldgen/__tests__/research-artifact.test.ts` runs Vitest inside `backend`, so the `backend/src/...` filters found no tests.
- **Fix:** Ran the equivalent package-relative command with `src/worldgen/...` filters.
- **Files modified:** None
- **Verification:** Package-relative command passed, 2 files / 40 tests.
- **Committed in:** Not applicable - verification command fallback only.

---

**Total deviations:** 1 auto-fixed (1 blocking verification command issue)
**Impact on plan:** No code scope change. The intended targeted worldgen research tests ran and passed.

## Issues Encountered

- GitNexus reported HIGH risk for `formatWorldgenResearchArtifactBlock` during Task 1 impact discovery because it participates in scaffold and seed flows. The plan did not require modifying that formatter behavior; changes were kept to constants/helpers and tests around the artifact contract.
- The literal plan verification command had a package-prefix path mismatch, documented under deviations above.

## Known Stubs

None - stub scan found no placeholder text, TODO/FIXME markers, or unwired empty UI data in created/modified files.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Later phase-74 plans can reuse the worldgen research helper pattern for exact model-facing contracts while keeping Phase 72 artifact authority intact.

## Self-Check: PASSED

- Summary and all created/modified plan files exist.
- Task commits `2998538`, `ebaa7b7`, `2c3e0f6`, and `d01f2a1` are present in git history.
- No tracked file deletions were introduced by task commits.

---
*Phase: 74-structured-prompt-contracts-and-model-facing-schema-hardenin*
*Completed: 2026-04-28*
