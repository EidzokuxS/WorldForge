---
phase: 48-character-identity-fidelity-and-canonical-modeling
plan: 03
subsystem: runtime
tags: [character-identity, prompts, npc-ai, reflection, vitest]
requires:
  - phase: 48-01
    provides: richer character identity schema, continuity metadata, and compatibility-safe hydration
  - phase: 48-02
    provides: generation/import/materialization seams that populate the richer identity model
provides:
  - prompt assembly and NPC runtime prompts that read base facts, behavioral core, live dynamics, and continuity before shorthand tags
  - bounded off-screen identity slices that preserve distinct behavior without serializing full records per NPC
  - reflection tools that default writes to live dynamics and gate deeper identity mutation behind explicit earned promotion
affects: [48-04, 49-search-grounding, runtime-prompts]
tech-stack:
  added: []
  patterns: [identity-first prompt sections, bounded off-screen identity slices, live-dynamics-first reflection writes, evidence-gated deeper identity promotion]
key-files:
  created: [backend/src/engine/__tests__/prompt-assembler.character-identity.test.ts, backend/src/engine/__tests__/reflection-agent.identity-boundaries.test.ts]
  modified: [backend/src/engine/prompt-assembler.ts, backend/src/engine/npc-agent.ts, backend/src/engine/npc-offscreen.ts, backend/src/engine/reflection-agent.ts, backend/src/engine/reflection-tools.ts, backend/src/engine/__tests__/npc-agent.test.ts, backend/src/engine/__tests__/npc-offscreen.test.ts, backend/src/engine/__tests__/reflection-agent.test.ts]
key-decisions:
  - Kept persona, tags, and flattened goals as compatibility shorthand while moving runtime truth to base facts, behavioral core, live dynamics, and continuity.
  - Bounded off-screen prompts to a compact identity slice per NPC instead of serializing the whole richer record into every batch prompt.
  - Made deeper identity changes explicit through promote_identity_change with continuity-based evidence thresholds rather than ordinary reflection writes.
patterns-established:
  - Prompt text should surface base facts, behavioral core, live dynamics, and continuity before shorthand summaries.
  - Ordinary reflection mutates liveDynamics first; behavioralCore and baseFacts only change through explicit earned promotion.
requirements-completed: [CHARF-01]
duration: 10 min
completed: 2026-04-12
---

# Phase 48 Plan 03: Character Identity Fidelity & Canonical Modeling Summary

**Identity-first runtime prompts, bounded off-screen character slices, and evidence-gated deeper reflection changes for canonical continuity**

## Performance

- **Duration:** 10 min
- **Started:** 2026-04-12T17:14:08Z
- **Completed:** 2026-04-12T17:24:06Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Rewired scene prompt assembly and NPC planning to consume richer character identity truth instead of flattening behavior to persona-plus-tags shorthand.
- Added bounded off-screen identity summaries so simulation keeps distinctive motives, pressure, and continuity cues without token-budget blowups.
- Enforced live-dynamics-first reflection writes and introduced an explicit earned-promotion seam for deeper identity changes.

## Task Commits

Each task was committed atomically:

1. **Task 48-03-01 RED: failing runtime identity tests** - `ab6e523` (`test`)
2. **Task 48-03-01 GREEN: rewire runtime identity prompts** - `9ece0cc` (`feat`)
3. **Task 48-03-02 RED: failing reflection boundary tests** - `1a7272d` (`test`)
4. **Task 48-03-02 GREEN: enforce reflection identity boundaries** - `8157bf4` (`feat`)

**Plan metadata:** pending final docs commit

## Files Created/Modified
- `backend/src/engine/prompt-assembler.ts` - adds richer identity sections for player/NPC prompt assembly.
- `backend/src/engine/npc-agent.ts` - feeds NPC planning prompts with base facts, behavioral core, live dynamics, and continuity cues.
- `backend/src/engine/npc-offscreen.ts` - builds bounded off-screen identity slices for token-safe batch simulation.
- `backend/src/engine/reflection-agent.ts` - frames reflection as live-dynamics-first with explicit deeper-change guidance.
- `backend/src/engine/reflection-tools.ts` - syncs ordinary reflection writes into live dynamics and adds guarded `promote_identity_change`.
- `backend/src/engine/__tests__/prompt-assembler.character-identity.test.ts` - locks richer identity prompt sections into runtime assembly.
- `backend/src/engine/__tests__/npc-agent.test.ts` - covers richer NPC planning inputs and canonical continuity cues.
- `backend/src/engine/__tests__/npc-offscreen.test.ts` - proves off-screen simulation uses bounded richer identity slices.
- `backend/src/engine/__tests__/reflection-agent.test.ts` - tightens prompt and tool contract coverage for reflection boundaries.
- `backend/src/engine/__tests__/reflection-agent.identity-boundaries.test.ts` - validates mutable-live-dynamics behavior and earned deeper promotion thresholds.

## Decisions Made
- Moved runtime prompt truth onto `identity.baseFacts`, `identity.behavioralCore`, `identity.liveDynamics`, and `continuity`, leaving tags as compatibility shorthand only.
- Kept off-screen simulation bounded by selecting a small durable identity slice instead of emitting full richer records for every NPC in a batch.
- Introduced a single explicit promotion tool for deeper identity edits so continuity inertia can block one-turn personality rewrites while still allowing earned change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Corrected a stale NPC reflection fixture to match the canonical record contract**
- **Found during:** Task 48-03-01 (Rewire prompt assembly and NPC runtime planning around richer identity truth)
- **Issue:** An existing `npc-agent` fixture still encoded `relationshipRefs` in a stale shape, which blocked the new identity-first prompt assertions from exercising hydrated runtime data correctly.
- **Fix:** Updated the fixture in `backend/src/engine/__tests__/npc-agent.test.ts` to use schema-compatible relationship reference data while adding the new runtime identity expectations.
- **Files modified:** `backend/src/engine/__tests__/npc-agent.test.ts`
- **Verification:** `npx vitest run backend/src/engine/__tests__/npc-agent.test.ts backend/src/engine/__tests__/npc-offscreen.test.ts backend/src/engine/__tests__/prompt-assembler.character-identity.test.ts`
- **Committed in:** `ab6e523`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The fix was required to keep the TDD harness aligned with the canonical record shape. No scope creep beyond the planned runtime identity seam.

## Issues Encountered
- `gitnexus_detect_changes(scope: "staged")` flagged the reflection GREEN commit as `HIGH` risk because `runReflection` and `createReflectionTools` sit on several reflection/rollback flows. The staged diff was reviewed and kept bounded to the planned identity-boundary seam before commit.
- `backend/src/engine/reflection-agent.ts` already had an adjacent dirty `getDb()` reset hunk in the same seam. It was carried through because it stayed inside the task-owned reflection path and did not widen the plan scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase `48-04` can safely surface the richer identity model in bounded editor/draft seams because runtime consumers now read the canonical layers directly.
- Phase `49` can build retrieval and research prompts on top of the same identity-first runtime contract without reintroducing shallow persona truth.

## Known Stubs
None - stub scan only hit an existing explanatory comment (`"not available"`) in prompt-assembler type docs, not runtime placeholder data.

## Self-Check: PASSED
- Found `.planning/phases/48-character-identity-fidelity-and-canonical-modeling/48-03-SUMMARY.md`.
- Verified task commits `ab6e523`, `9ece0cc`, `1a7272d`, and `8157bf4` exist in git history.
- Stub scan found no runtime placeholders in the files modified by this plan.

---
*Phase: 48-character-identity-fidelity-and-canonical-modeling*
*Completed: 2026-04-12*
