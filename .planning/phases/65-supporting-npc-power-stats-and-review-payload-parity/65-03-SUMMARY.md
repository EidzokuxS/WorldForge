---
phase: 65-supporting-npc-power-stats-and-review-payload-parity
plan: 03
subsystem: testing
tags: [worldgen, power-stats, review-ui, vitest, react]
requires:
  - phase: 65-01
    provides: enrichNpcsBatch dispatcher for NPC PowerStats batching
  - phase: 65-02
    provides: generateNpcsStep writes enriched drafts back into regenerate/worldgen output
provides:
  - HTTP-level regenerate-section parity coverage for known-IP and original-world NPC PowerStats
  - Mocked persistence regression proving supporting-tier draft.powerStats survives scaffold saver serialization
  - Frontend handler merge fix preserving result.draft in NPC review creation flows
  - Four-mode review payload parity tests plus null-render regression coverage
affects: [65-04-verification-gate, worldgen, review-ui]
tech-stack:
  added: []
  patterns: [real-route seam mocking, dbCalls persistence assertions, draft-envelope merge preservation]
key-files:
  created:
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-03-SUMMARY.md
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/SUMMARY.md
  modified:
    - backend/src/routes/__tests__/worldgen.test.ts
    - backend/src/worldgen/__tests__/scaffold-saver.test.ts
    - frontend/components/world-review/npcs-section.tsx
    - frontend/components/world-review/__tests__/npcs-section.test.tsx
key-decisions:
  - Known-IP route parity test seeds a cached canonical PremiseDivergence so interpretPremiseDivergence does not consume the four-call LLM seam.
  - Review payload parity stays frontend-only by merging result.draft back onto the scaffold NPC in all four creation handlers.
  - Scaffold-saver coverage inspects serialized characterRecord from mocked dbCalls instead of changing scaffold-saver runtime.
patterns-established:
  - Route-level worldgen parity tests can unmock worldgen/index and mock only innermost seams while keeping generateNpcsStep and enrichNpcsBatch real.
  - World-review creation flows must treat response.draft as authoritative whenever legacy npc payloads omit draft-backed fields.
  - Persistence regressions for scaffold saver should assert against JSON-parsed characterRecord in mocked insert logs.
requirements-completed: [P65-R3, P65-R5, P65-R6, P65-R7, P65-R8]
duration: 7m
completed: 2026-04-19
---

# Phase 65 Plan 03: Regenerate Saver Envelope Summary

**Route-level NPC PowerStats parity now holds across regenerate, saver serialization, and review creation flows without changing the saver runtime or the PowerStats UI gate.**

## Performance

- **Duration:** 7m
- **Started:** 2026-04-19T18:06:36Z
- **Completed:** 2026-04-19T18:13:36Z
- **Tasks:** 4
- **Files modified:** 4

## Accomplishments

- Added real-step `/api/worldgen/regenerate-section` coverage proving known-IP and original-world NPCs both return `draft.powerStats`, plus a fail-closed HTTP assertion when original-world assessment exhausts.
- Added a saver regression proving supporting-tier draft-backed NPCs keep `powerStats` inside the serialized `characterRecord` written through the mocked `dbCalls` transaction log.
- Preserved `result.draft` in all four NPC review creation handlers and extended the existing parameterized review test to cover Describe, Import V2 Card, Research Archetype, and AI Generate, plus the null-render guard for missing power stats.

## Task Commits

1. **Task 1: Add real-step integration tests for `/regenerate-section` quadrants + fail-closed** - `48c1945` (`test`)
2. **Task 2: Add scaffold-saver supporting-tier `powerStats` regression coverage** - `0e3e899` (`test`)
3. **Task 3: Preserve `result.draft` in NPC review creation handlers** - `735794a` (`feat`)
4. **Task 4: Extend NPC review parity tests across all four creation modes** - `6802ad5` (`test`)

**Verification follow-up:** `3fe5a2f` (`test`) fixed test-only typing issues found by final `backend` typecheck.

## Files Created/Modified

- `backend/src/routes/__tests__/worldgen.test.ts` - Real-route regenerate parity coverage, known-IP research gate harnessing, and fail-closed HTTP assertion.
- `backend/src/worldgen/__tests__/scaffold-saver.test.ts` - Supporting-tier persistence regression on JSON-serialized `characterRecord.powerStats`.
- `frontend/components/world-review/npcs-section.tsx` - Option A envelope fix attaching `result.draft` in parse/generate/research/import merges.
- `frontend/components/world-review/__tests__/npcs-section.test.tsx` - Four-mode handler parity assertions and null-render regression for missing `draft.powerStats`.

## Decisions Made

- Kept D-07 intact by proving saver behavior through the mocked transaction log instead of modifying `scaffold-saver.ts`.
- Kept D-09 intact by preserving the existing `npc.draft?.powerStats` render gate and fixing payload preservation upstream in the handlers.
- Seeded a cached canonical divergence in the known-IP route harness so the test isolates PowerStats parity instead of premise-divergence prompt churn.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Cached canonical divergence for the known-IP route harness**
- **Found during:** Task 1
- **Issue:** The real route called `interpretPremiseDivergence` before NPC planning, consuming the first mocked `safeGenerateObject` response and shifting the intended four-call seam.
- **Fix:** Seeded `loadPremiseDivergence` with a minimal canonical artifact in the Task 1 helper so the test stays focused on regenerate PowerStats parity.
- **Files modified:** `backend/src/routes/__tests__/worldgen.test.ts`
- **Verification:** `npm --prefix backend test -- run worldgen`
- **Committed in:** `48c1945`

**2. [Rule 3 - Blocking] Tightened test fixture typing after final backend typecheck**
- **Found during:** Final verification
- **Issue:** The cached divergence stub used an invalid interpretation literal, the `getErrorMessage` mock ignored the optional fallback type, and the saver `PowerStats` fixture used an invalid speed tier literal.
- **Fix:** Aligned the route harness with shared `PremiseDivergence` types and typed the saver fixture with valid `PowerStats` literals.
- **Files modified:** `backend/src/routes/__tests__/worldgen.test.ts`, `backend/src/worldgen/__tests__/scaffold-saver.test.ts`
- **Verification:** `npm --prefix backend run typecheck`, `npm --prefix backend test -- run worldgen`, `npm --prefix backend test -- run scaffold-saver`
- **Committed in:** `3fe5a2f`

---

**Total deviations:** 2 auto-fixed (`Rule 3`: 2)
**Impact on plan:** Both fixes were required to keep the planned verification surface stable. No production scope expansion.

## Issues Encountered

- The root-scoped ESLint command from the plan text does not resolve the frontend-local `eslint` binary in this Windows workspace. Running the same check from `frontend/` with relative paths succeeds and matches the intended lint gate.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None.

## Next Phase Readiness

- Phase `65-04` can consume committed parity coverage across route, saver, and frontend review flows.
- No new blockers remain for Phase 65. Verification gates are green on backend tests, backend typecheck, frontend tests, and scoped frontend lint.

## Self-Check: PASSED

- Summary files found: `65-03-SUMMARY.md`, `SUMMARY.md`
- Task commits found: `48c1945`, `0e3e899`, `735794a`, `6802ad5`, `3fe5a2f`
