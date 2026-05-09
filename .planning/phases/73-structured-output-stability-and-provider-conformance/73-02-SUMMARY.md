---
phase: 73-structured-output-stability-and-provider-conformance
plan: 02
subsystem: ai
tags: [structured-output, ai-sdk, zod, safe-generate-object, vitest]

requires:
  - phase: 73-01
    provides: "Structured-output capability metadata and strategy resolver"
provides:
  - "Native-first safeGenerateObject path using AI SDK Output.object for native_schema-capable models"
  - "Explicit text_fallback, repair, and full_retry strategy trace labels"
  - "Regression coverage for native success, native rejection fallback, Kimi/Mimo repair, and retry exhaustion"
affects: [safeGenerateObject, provider-conformance, scene-plan, worldgen]

tech-stack:
  added: []
  patterns:
    - "Use provider/model capability metadata to choose native_schema before text_fallback."
    - "Always validate native and fallback candidates through Zod before returning."
    - "Log strategy/capability metadata without prompt bodies or secrets."

key-files:
  created:
    - .planning/phases/73-structured-output-stability-and-provider-conformance/73-02-SUMMARY.md
  modified:
    - backend/src/ai/generate-object-safe.ts
    - backend/src/ai/__tests__/generate-object-safe.test.ts

key-decisions:
  - "Unregistered models keep the existing text fallback behavior so legacy callers using plain model objects do not break."
  - "native_schema failures fall back inside the same attempt; outer retry is reserved for full native/text/repair exhaustion."
  - "Trace capability data is limited to non-secret provider id/name, model, protocol, base URL family, transport, capability key, and strategy decision."

patterns-established:
  - "safeGenerateObject strategy trace: requestedMode, strategy, primaryStrategy, fallbackStrategy, fallbackReason, capability."
  - "Repair results set top-level strategy to repair and preserve nested repair.strategy."
  - "llm.attempt payloads include strategy/capability/usage/error metadata and omit prompts."

requirements-completed: [P73-R2, P73-R3, P73-R6, P73-R7]

duration: 9min
completed: 2026-04-27
---

# Phase 73 Plan 02: Native-First Safe Object Generation Summary

**AI SDK native schema object generation with explicit text fallback, repair, retry labels, and Zod final authority**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-27T21:27:35Z
- **Completed:** 2026-04-27T21:36:21Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `Output.object({ schema })` native structured generation for models with registered `native_schema` capability metadata.
- Preserved existing caller signature: `safeGenerateObject<T>(opts: SafeGenerateOpts<T>): Promise<SafeGenerateResult<T>>`.
- Kept explicit text JSON fallback, schema-aware repair, bare-array wrapping, coercion, and bounded retry behavior.
- Extended traces and `llm.attempt` logs with `native_schema`, `text_fallback`, `repair`, and `full_retry` strategy labels.
- Added regressions for native success, native Zod rejection fallback, `NoObjectGeneratedError` fallback, Kimi/Mimo `citations` and `canonicalNames` repair, and retry exhaustion.

## Task Commits

1. **Task 1 RED:** `ef8b563` (test) - add native schema strategy regressions.
2. **Task 1 GREEN:** `3ab09fe` (feat) - add native-first object generation path.
3. **Task 2 RED:** `144bda7` (test) - add fallback repair retry regressions.
4. **Task 2 GREEN:** `2954a13` (fix) - recognize structured-output fallback errors.

**Plan metadata:** pending final docs commit.

## Files Created/Modified

- `backend/src/ai/generate-object-safe.ts` - Native schema branch, strategy context, trace/capability fields, fallback reason handling, repair labels, full retry labels, and structured-output error classification.
- `backend/src/ai/__tests__/generate-object-safe.test.ts` - Native, fallback, repair, retry, logging, and Kimi/Mimo regression coverage.
- `.planning/phases/73-structured-output-stability-and-provider-conformance/73-02-SUMMARY.md` - Execution summary and verification evidence.

## Verification

- RED Task 1: `npm --prefix backend run test -- src/ai/__tests__/generate-object-safe.test.ts` failed as expected with 2 native strategy regressions.
- GREEN Task 1: `npm --prefix backend run test -- src/ai/__tests__/generate-object-safe.test.ts` passed, 8 tests.
- GREEN Task 1: `npm --prefix backend run typecheck` passed.
- RED Task 2: `npm --prefix backend run test -- src/ai/__tests__/generate-object-safe.test.ts` failed as expected with 1 classifier regression.
- GREEN Task 2: `npm --prefix backend run test -- src/ai/__tests__/generate-object-safe.test.ts` passed, 10 tests.
- GREEN Task 2: `npm --prefix backend run typecheck` passed.
- Final plan verification: `npm --prefix backend run test -- src/ai/__tests__/generate-object-safe.test.ts` passed, 10 tests.
- Final plan verification: `npm --prefix backend run typecheck` passed.
- Acceptance greps found `Output.object`, `native_schema`, `text_fallback`, `strategy`, `resolveStructuredOutputCapability`, `NoObjectGeneratedError`, `repair`, `full_retry`, `canonicalNames`, and `citations`.

## GitNexus And Scope Evidence

- `npx gitnexus status` was current before initial impact checks.
- `gitnexus impact safeGenerateObject --repo WorldForge`: CRITICAL, 23 impacted symbols, 13 direct callers, 5 affected processes, 5 modules.
- Direct caller blast radius included `runScenePlanner`, `runWorldBrainSceneDirection`, `executeOracleCall`, `runHiddenAdjudicationPlan`, `validateAndFixStage`, `validateCrossStage`, `regenerateLocationEntity`, `regenerateFactionEntity`, `regenerateNpcEntity`, `detectCandidateByClassifier`, worldbook composition callers, and backfill processing.
- `gitnexus impact attemptGenerate --repo WorldForge`: CRITICAL, 19 impacted symbols, direct wrapper caller, 4 affected processes.
- `gitnexus impact toTraceFromGenerateTextResult --repo WorldForge`: HIGH, 16 impacted symbols, direct callers `attemptRepair` and `attemptGenerate`.
- `gitnexus impact isSafeGenerateObjectError --repo WorldForge`: LOW, 2 impacted symbols, direct caller `generateRefinedPremiseStep`.
- `gitnexus_detect_changes(scope=staged)` before Task 1 RED: low risk, test-only.
- `gitnexus_detect_changes(scope=staged)` before Task 1 GREEN: high risk, expected shared `safeGenerateObject` boundary.
- `gitnexus_detect_changes(scope=staged)` before Task 2 RED: low risk, test-only.
- `gitnexus_detect_changes(scope=staged)` before Task 2 GREEN: low risk, classifier-only.
- Final `npx gitnexus status`: up to date at current branch head after concurrent Plan 73-03 commit.

## Threat Coverage

| Threat | Coverage |
| --- | --- |
| AI provider -> backend schema tampering | Native `output` is still passed through `coerceToSchema` and Zod `safeParse` before return. |
| Retry/fallback denial of service | Native rejection falls to text fallback once per attempt, then repair, then bounded full retry. |
| Log information disclosure | `llm.attempt` logs strategy, capability, response model, usage, bounded error text, and no prompt body/API key. |

## Decisions Made

- Keep text fallback as default for unregistered model objects, preserving existing tests and callers that pass plain mocks or legacy model handles.
- Use `Output.object` only for `native_schema`; `native_json` and `tool_mode` resolve as primary labels but currently route through explicit text fallback rather than inventing unsupported behavior.
- Preserve repair prompt rules for `citations` and `canonicalNames`; strategy labels are additive observability, not a replacement for repair.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope expansion.

## Issues Encountered

- GitNexus MCP did not expose an `impact` tool in this Codex session, so the GitNexus CLI `npx gitnexus impact ... --repo WorldForge` was used for the required impact gates.
- `npx gitnexus analyze` emitted repeated Node `MaxListenersExceededWarning` warnings but completed successfully when the index was stale after task commits.
- Plan 73-03 committed `scene-planner.ts` while this plan was running. Plan 73-02 did not edit or revert engine files; final status confirmed no owned code diff remained after task commits.

## Known Stubs

None. Stub scan matched only the existing comment "placeholder values" in the schema-example helper, not a runtime/UI stub.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 73-04/73-05 safe object boundary consumers. `safeGenerateObject` now records whether a call returned via native schema, text fallback, repair, or full retry, while preserving backward-compatible object return shape.

## Self-Check: PASSED

- Summary file exists at `.planning/phases/73-structured-output-stability-and-provider-conformance/73-02-SUMMARY.md`.
- Owned code files exist: `backend/src/ai/generate-object-safe.ts`, `backend/src/ai/__tests__/generate-object-safe.test.ts`.
- Task commits found: `ef8b563`, `3ab09fe`, `144bda7`, `2954a13`.
- Path-limited owned code diff is empty after task commits.
- Final targeted tests and backend typecheck passed.

---
*Phase: 73-structured-output-stability-and-provider-conformance*
*Completed: 2026-04-27*
