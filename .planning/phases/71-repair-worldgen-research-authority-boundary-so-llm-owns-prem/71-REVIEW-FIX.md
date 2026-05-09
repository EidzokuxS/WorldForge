---
phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem
fixed_at: 2026-04-26T13:08:46Z
review_path: .planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 71: Code Review Fix Report

**Fixed at:** 2026-04-26T13:08:46Z
**Source review:** `.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0
- Residual risk: route-level regressions pass; both fixes are context-lane logic changes and should remain in verifier review.

## Fixed Issues

### WR-01: Suggest-seed artifact requests can still carry legacy context

**Status:** fixed: requires human verification
**Files modified:** `backend/src/routes/worldgen.ts`, `backend/src/routes/__tests__/worldgen.test.ts`
**Commit:** `69074d5`
**Applied fix:** `/suggest-seed` now derives a local `researchArtifact` value and passes `undefined` legacy `ipContext` and `premiseDivergence` whenever an artifact exists. Added a route regression that sends artifact plus stale legacy fields and asserts `suggestSingleSeed` receives the artifact lane only.

### WR-02: On-demand generate artifact keeps preloaded legacy divergence/frame

**Status:** fixed: requires human verification
**Files modified:** `backend/src/routes/worldgen.ts`, `backend/src/routes/__tests__/worldgen.test.ts`
**Commit:** `7c48b9c`
**Applied fix:** `/generate` clears `ipContext`, `premiseDivergence`, and `researchFrame` immediately when on-demand `researchWorldgenArtifact` succeeds. Added a route regression with stale legacy loader returns and asserted `generateWorldScaffold` receives null legacy fields beside the new artifact.

## Verification

- `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts` - passed, 61 tests.
- `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/lore-extractor.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts` - passed, 102 tests.
- `npm --prefix backend run typecheck` - passed.
- GitNexus API impact for `backend/src/routes/worldgen.ts` - LOW, direct consumers 0, affected flows 0.
- GitNexus impacts for `suggestSingleSeed`, `generateWorldScaffold`, and `resolvePremiseDivergence` - LOW.
- GitNexus `detect_changes({scope: "staged"})` before `69074d5` - LOW, changed files 2.
- GitNexus `detect_changes({scope: "staged"})` before `7c48b9c` - LOW, changed files 2.

## Skipped Issues

None.

---

_Fixed: 2026-04-26T13:08:46Z_
_Fixer: Codex (gsd-code-fixer)_
_Iteration: 1_
