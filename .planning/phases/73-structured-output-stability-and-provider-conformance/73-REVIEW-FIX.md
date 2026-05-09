---
phase: 73-structured-output-stability-and-provider-conformance
fixed_at: 2026-04-28T01:28:50.1627745+03:00
review_path: .planning/phases/73-structured-output-stability-and-provider-conformance/73-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 73: Code Review Fix Report

**Fixed at:** 2026-04-28T01:28:50.1627745+03:00
**Source review:** .planning/phases/73-structured-output-stability-and-provider-conformance/73-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: Semantic ScenePlan conformance accepts empty planned actions

**Files modified:** `backend/src/ai/structured-output-conformance.ts`, `backend/src/ai/__tests__/structured-output-conformance.test.ts`
**Commit:** d63a09b
**Applied fix:** Added `.min(1)` to the semantic ScenePlan conformance `plannedActions` schema and made the semantic check require at least one planned action before validating tool names and input/payload shape.

### WR-02: Conformance requested modes can be reported without being exercised

**Files modified:** `backend/src/ai/structured-output-conformance.ts`, `backend/src/ai/generate-object-safe.ts`, `backend/src/ai/__tests__/structured-output-conformance.test.ts`, `backend/src/ai/__tests__/generate-object-safe.test.ts`
**Commit:** 8cbb2d8
**Applied fix:** Expanded `safeGenerateObject` mode typing to the full structured-output requested-mode union and forwarded explicit conformance modes through to the generator, leaving only `auto` as undefined. Added regression coverage for mode forwarding plus explicit `native_schema` and `text_fallback` traces.

---

_Fixed: 2026-04-28T01:28:50.1627745+03:00_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
