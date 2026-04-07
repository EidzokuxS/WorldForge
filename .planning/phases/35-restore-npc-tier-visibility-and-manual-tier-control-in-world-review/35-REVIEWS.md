---
phase: 35
reviewers: [gemini, claude]
reviewed_at: 2026-04-07T07:45:19.1732196+03:00
plans_reviewed:
  - 35-01-PLAN.md
  - 35-02-PLAN.md
---

# Cross-AI Plan Review — Phase 35

## Gemini Review

#### 1. Summary
The updated plans for Phase 35 provide a robust and surgically precise path to restoring NPC tier differentiation. By prioritizing data-contract integrity and parser-seam repairs before UI implementation, the plan ensures that the "key vs. supporting" distinction is preserved across the entire lifecycle—from scaffold loading to DB persistence. The inclusion of a clear fallback hierarchy and explicit "at-the-edge" retiering for helper-generated NPCs successfully addresses previous concerns about silent upcasting and inconsistent state. The strategy maintains the "worldgen as a scaffold" philosophy while empowering the user with manual override capabilities during the review phase.

#### 2. Strengths
- Contract-first approach fixes types and adapters before UI, reducing state bugs.
- Coherent fallback logic: `draft.identity.tier -> DB row tier -> key`.
- Helper-created NPCs are retiered at the right edge before component state or `onChange`.
- Test coverage spans frontend normalization and backend persistence seams.
- Scope remains narrow and preserves current worldgen rules.

#### 3. Concerns
- MEDIUM: UI-side synchronization of `npc.tier` and `npc.draft.identity.tier` can still drift if implemented separately across multiple handlers.
- LOW: Backend schema strictness could still reject `"supporting"` if save-edits parser input enums are narrower than expected.
- LOW: `supporting` (UI) vs `persistent` (DB) naming can remain a source of developer confusion.

#### 4. Suggestions
- Centralize retiering logic in a single helper so scaffold tier and draft tier never diverge.
- Make tier labels in UI self-explanatory for users.
- Do an early schema audit of the save-edits path before the rest of 35-01 lands.
- Optionally extend the manual smoke to exercise a larger batch of supporting NPC saves.

#### 5. Risk Assessment
LOW. The phase is isolated to the review/editor seam, the fallback rule is explicit, and the test plan covers the highest-risk boundaries.

---

## Claude Review

## 1. Summary

The two-plan split is well-structured: 35-01 fixes the data contract and parser seams (types, adapters, normalization, fallback rule) with backend + frontend regressions, then 35-02 layers the UI tier control on top. The updated plans now explicitly address the three gaps from the previous review — legacy fallback order, canonical `draft.identity.tier` seam, and helper-created NPC retiering. The scope is appropriately conservative: no worldgen changes, no backend helper API changes, and backend schema modifications are gated behind "only if tests reveal a real contract bug." This is a clean editorial/seam fix, not a feature addition.

## 2. Strengths

- Correct sequencing: contract fix before UI.
- Explicit fallback rule is now deterministic and backward-compatible.
- Helper retiering is specified at the right boundary before UI state sees stale tier.
- No worldgen rule changes and no backend helper API widening.
- Backend changes remain test-driven and gated.
- Manual smoke closes the previous integration-confidence gap.

## 3. Concerns

- MEDIUM: The fallback rule should be explicitly covered by three test branches, not just the happy path.
- MEDIUM: The mapping from DB/runtime row tiers should be named more concretely, especially if `temporary` can ever leak into the seam.
- LOW: Retiering may still drift if each helper flow reimplements it inline instead of using one shared helper.
- LOW: Confirm whether `ScaffoldNpc` exists only in frontend or also in shared types to avoid type divergence.
- LOW: The manual smoke step could be more explicit about expected DB state after save.

## 4. Suggestions

- Require explicit fallback-branch coverage in tests for all three cascade cases.
- State the row-tier mapping table concretely.
- Prefer a shared retier helper over duplicated response-handler logic.
- Make the manual smoke assert the persisted DB meaning: supporting -> persistent, key -> key.

## 5. Risk Assessment

LOW, with minor implementation-detail caveats. The remaining concerns are clarifications, not structural blockers.

---

## Consensus Summary

The updated Phase 35 plans are now in good shape. Both reviewers agree the previous blockers were addressed: the legacy fallback rule is explicit, the canonical draft seam is no longer implicit, helper-created NPC retiering is placed at the correct boundary, and the added manual smoke step does not bloat scope. Remaining feedback is refinement-level rather than blocker-level.

### Agreed Strengths
- The 2-plan sequence remains correct: seam/data contract first, UI second.
- Scope stays narrow and avoids worldgen or backend helper API churn.
- The explicit fallback rule significantly reduces silent upcasting risk.
- Retiering helper-created NPCs before state/`onChange` is the right architectural boundary.
- The current regression strategy targets the correct frontend/backend seams.

### Agreed Concerns
- Retiering logic should ideally be centralized rather than duplicated across multiple helper handlers.
- The fallback rule should be fully covered by explicit test branches, not only implied by acceptance criteria.
- The `supporting` (UI) to `persistent` (DB) mapping should stay explicit to avoid confusion or accidental drift.

### Divergent Views
- Gemini is satisfied with the current fallback statement as-is and rates risk plainly LOW.
- Claude still wants a bit more specificity around mapping-table wording and fallback-branch test enumeration, but also rates overall risk LOW.

## Recommended Plan Adjustments

- Optionally tighten `35-01-PLAN.md` by spelling out the row-tier mapping more concretely if `temporary` can ever surface at the seam.
- Optionally tighten `35-01-PLAN.md` acceptance/verification wording to explicitly enumerate all fallback test branches.
- Optionally note in `35-02-PLAN.md` that a shared local retier helper is preferred over duplicated per-handler retier code.

These are polish-level improvements. No replan blocker remains.
