---
phase: 73-structured-output-stability-and-provider-conformance
plan: 01
subsystem: ai
tags: [structured-output, provider-registry, vitest, gitnexus]

requires:
  - phase: 72-worldgen-authority-propagation-regression-audit
    provides: "Artifact authority regressions and known-IP dispatch invariants"
provides:
  - "Production object-generation inventory with enforced strategy classifications"
  - "Non-secret provider/model/protocol/base-family/transport capability identity"
  - "WeakMap-backed model metadata lookup for later safeGenerateObject strategy traces"
affects: [safeGenerateObject, provider-conformance, scene-plan, worldgen]

tech-stack:
  added: []
  patterns:
    - "Provider capability identity is keyed by provider id/name, model, protocol, base URL family, and transport"
    - "Production LLM seams are statically checked against a Phase 73 inventory artifact"

key-files:
  created:
    - backend/src/ai/structured-output-capabilities.ts
    - backend/src/ai/__tests__/structured-output-capabilities.test.ts
    - .planning/phases/73-structured-output-stability-and-provider-conformance/73-STRUCTURED-OUTPUT-INVENTORY.md
  modified:
    - backend/src/ai/provider-registry.ts
    - backend/src/ai/__tests__/structured-output-boundary.test.ts

key-decisions:
  - "Capability metadata stores only provider id/name, model, protocol, base URL host, transport, and capability key; no API keys, headers, prompts, or raw settings."
  - "Reasoning-wrapped models receive the same metadata as their base chat model without changing createModel(config, options)."
  - "Final narration, storyteller streaming, provider smoke tests, and direct prose calls are inventoried as unstructured_prose or text_fallback, not structured output."

patterns-established:
  - "Use rememberStructuredOutputModelMetadata(model, metadata) at model creation time and getStructuredOutputModelMetadata(model) at strategy selection time."
  - "Use resolveStructuredOutputCapability({ metadata, requestedMode }) to map requested modes to native_schema, native_json, tool_mode, or text_fallback."

requirements-completed: [P73-R1, P73-R3, P73-R5]

duration: 8min
completed: 2026-04-27
---

# Phase 73 Plan 01: Inventory and Provider Capability Foundation Summary

**Structured-output inventory enforcement plus non-secret provider/model/transport capability identity for later native-first generation**

## Performance

- **Duration:** 8 min
- **Started:** 2026-04-27T21:13:45Z
- **Completed:** 2026-04-27T21:21:56Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- Added `73-STRUCTURED-OUTPUT-INVENTORY.md` covering current production `safeGenerateObject`, direct `generateText`, and `streamText` seams.
- Expanded `structured-output-boundary.test.ts` so production LLM seams must stay listed in the inventory and use only known classifications.
- Added `structured-output-capabilities.ts` with exported strategy unions, WeakMap metadata storage, metadata lookup, and capability decision resolution.
- Registered provider metadata inside `createModel` for OpenAI-compatible chat-completions, Anthropic messages, and reasoning-wrapped models without changing caller signatures.
- Added tests proving metadata includes provider/model/protocol/base-family/transport and excludes API-key/bearer secrets.

## Task Commits

1. **Task 1 RED:** `0f42cbe` (test) - add failing structured-output inventory guard.
2. **Task 1 GREEN:** `001d7be` (feat) - add structured-output boundary inventory.
3. **Task 2 RED:** `e0b0a7d` (test) - add failing capability metadata coverage.
4. **Task 2 GREEN:** `08d3ab5` (feat) - register structured-output capability metadata.

**Plan metadata:** pending final docs commit.

## Files Created/Modified

- `backend/src/ai/structured-output-capabilities.ts` - typed strategy labels, non-secret model metadata, WeakMap lookup, and capability decision helper.
- `backend/src/ai/provider-registry.ts` - registers structured-output metadata on created models and reasoning wrappers.
- `backend/src/ai/__tests__/structured-output-capabilities.test.ts` - provider/model/transport metadata and no-secret regression coverage.
- `backend/src/ai/__tests__/structured-output-boundary.test.ts` - static direct import guard, inventory coverage guard, and classification validation.
- `.planning/phases/73-structured-output-stability-and-provider-conformance/73-STRUCTURED-OUTPUT-INVENTORY.md` - production object/prose generation seam inventory.

## Verification

- `npm --prefix backend run test -- src/ai/__tests__/structured-output-boundary.test.ts` - passed, 4 tests.
- `npm --prefix backend run test -- src/ai/__tests__/provider-registry.test.ts src/ai/__tests__/structured-output-capabilities.test.ts` - passed, 25 tests.
- `npm --prefix backend run test -- src/ai/__tests__/structured-output-boundary.test.ts src/ai/__tests__/provider-registry.test.ts src/ai/__tests__/structured-output-capabilities.test.ts` - passed, 29 tests.
- `npm --prefix backend run typecheck` - passed.
- `gitnexus_detect_changes({ scope: "staged" })` before source commit - critical expected provider-model surface through `createModel`.
- `gitnexus_detect_changes({ scope: "all" })` after task commits - no uncommitted code changes detected.

## Decisions Made

- Capability keys include provider id/name, model, protocol, normalized base URL family, and transport so later strategy traces can distinguish provider/model/gateway behavior.
- Metadata intentionally omits `apiKey`, bearer tokens, headers, prompt text, and raw provider settings; tests assert those strings are absent.
- Unknown/unregistered models resolve to explicit `text_fallback` instead of throwing, satisfying the Phase 73 denial-of-service mitigation.

## GitNexus Impact Notes

- `collectSourceFiles` was not indexed; this was anticipated by the plan, recorded here, and execution continued with static test coverage plus detect-changes scope checks.
- `createModel` impact was CRITICAL: 52 direct dependents, 16 affected processes, 8 modules. This was the expected provider-model creation surface, and the edit stayed signature-preserving.
- `resolveProviderProtocol` impact was CRITICAL through `createModel`: 1 direct dependent, 14 affected processes. Its behavior was not changed.

## Deviations from Plan

None - plan executed exactly as written.

**Total deviations:** 0 auto-fixed.
**Impact on plan:** No scope expansion.

## Issues Encountered

- GitNexus index was stale after each task commit; re-ran `npx gitnexus analyze` before impact/scope checks.
- `npx gitnexus analyze` emitted repeated Node `MaxListenersExceededWarning` warnings but completed successfully and reported an up-to-date index.
- Stub scan matched `const files: string[] = []` in a test helper and `options: ModelCreationOptions = {}` in `createModel`; both are intentional initialization/default parameter patterns, not UI stubs.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for Plan 73-02: `safeGenerateObject` can now read non-secret provider/model capability metadata and use the inventory to keep native/text fallback work scoped.

## Self-Check: PASSED

- Created files exist: `structured-output-capabilities.ts`, `structured-output-capabilities.test.ts`, `73-STRUCTURED-OUTPUT-INVENTORY.md`, `73-01-SUMMARY.md`.
- Task commits found: `0f42cbe`, `001d7be`, `e0b0a7d`, `08d3ab5`.
- Plan grep found all four `73-01` task commits.

---
*Phase: 73-structured-output-stability-and-provider-conformance*
*Completed: 2026-04-27*
