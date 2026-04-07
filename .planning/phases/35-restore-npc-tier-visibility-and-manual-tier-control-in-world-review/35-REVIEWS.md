---
phase: 35
reviewers: [gemini, claude]
reviewed_at: 2026-04-07T07:28:22.9404168+03:00
plans_reviewed:
  - 35-01-PLAN.md
  - 35-02-PLAN.md
---

# Cross-AI Plan Review — Phase 35

## Gemini Review

### Summary
The proposed plans for Phase 35 are solid and directly address the root cause of NPC tier loss: a mismatch between the frontend `ScaffoldNpc` type (missing the `tier` field) and the backend `saveEditsSchema` (which silently defaults missing tiers to `key`). By explicitly adding `tier` to the frontend contract and updating the adapters and UI, the plans restore manual control over NPC importance while maintaining a clear mapping between scaffold tiers (`key`/`supporting`) and database tiers (`key`/`persistent`).

### Strengths
- Comprehensive data flow coverage from initial world load through editing and saving.
- Targeted regressions explicitly lock parser and persistence boundaries on both frontend and backend.
- Pragmatic reuse of existing NPC helper APIs while allowing the UI to locally retier results.
- Backward-compatible direction that preserves the existing `supporting -> persistent` save mapping and does not alter worldgen rules.

### Concerns
- HIGH: The backend `scaffoldNpc` schema currently defaults missing `tier` to `key`; any incomplete frontend update can still silently upcast NPCs.
- MEDIUM: `ScaffoldNpc.tier` and `draft.identity.tier` must stay synchronized or the editor can produce split-brain NPC state.
- LOW: The internal `supporting` (UI) to `persistent` (DB) terminology bridge remains fragile if shared enums shift.

### Suggestions
- Ensure `toEditableScaffold` explicitly pulls tier from canonical draft data first, then from runtime/DB row fallback.
- Consider tightening backend schema defaults so new payloads do not silently fall back to `key` outside true legacy paths.
- Add visible UI affordance for `key` vs `supporting` so the distinction is obvious at a glance.

### Risk Assessment
LOW. The model and save boundary already support the intended behavior; the remaining risk is mostly silent data loss from missing `tier` fields, which the planned regressions directly target.

---

## Claude Review

## 1. Summary

The two plans form a clean data-layer-first / UI-second sequence for restoring NPC tier (`key` | `supporting`) across the world-review seam. Plan 35-01 repairs the scaffold/draft/load-save contract so tier survives round-tripping and locks it with regression tests. Plan 35-02 layers visible tier controls and per-flow tier selection on top. The scope is deliberately narrow — no worldgen rule changes, no backend API contract widening — which is correct given the stated goal. The main risks are around legacy campaign compatibility and the local-retier-after-helper-generation pattern, both of which are addressable but not fully specified.

## 2. Strengths

- Correct sequencing: data contract first, then UI.
- Surgical scope: no unnecessary worldgen or backend helper API changes.
- Explicit preservation of `supporting -> persistent` mapping at the save boundary.
- Regression-first approach across adapter directions and parser seams.
- Both load and save paths are covered.
- Concrete file lists and verification commands.

## 3. Concerns

- HIGH: Legacy campaign fallback is not specified. Existing campaigns without an explicit scaffold `tier` need an exact fallback rule or they risk silent promotion/demotion.
- HIGH: `draft.identity.tier` existence is assumed by the plan but not explicitly called out as a type/schema seam to verify or add.
- MEDIUM: Local retiering after helper creation is correct in principle but fragile if any state path inserts the NPC before retiering.
- MEDIUM: No explicit statement on whether scaffold-tier types live only in frontend or also in shared types.
- MEDIUM: Component-test plan for `npcs-section.test.tsx` likely needs fresh test scaffolding, not just a small update.
- LOW: `_uid` helper interactions are not mentioned; cloned NPCs must not lose `tier`.
- LOW: No manual smoke verification is specified for the user-facing tier editor.

## 4. Suggestions

- Add an explicit legacy fallback rule to 35-01 for NPCs loaded without `tier`.
- Explicitly verify or add `identity.tier` on canonical drafts as part of 35-01.
- Retier helper-created NPCs inside the API response handler before they enter component state or `onChange`.
- Add one manual smoke test covering load -> edit tier -> save -> reload.
- Add one assertion that `_uid` assignment/helpers preserve `tier`.

## 5. Risk Assessment

MEDIUM. The plans are well-structured and correctly scoped, but the legacy fallback gap and the local-retier sequencing need sharper specification to avoid silent mis-tiering in existing campaigns or helper-driven flows.

---

## Consensus Summary

Both reviewers agree the phase is correctly sequenced and narrowly scoped: fix the data contract first, then expose tier editing in the world-review UI without changing worldgen rules or widening helper APIs. They also agree the most important risk is silent tier drift at compatibility seams rather than any architectural flaw.

### Agreed Strengths
- The split into `35-01` data-contract work and `35-02` UI work is the right order.
- The phase is tightly scoped and avoids unnecessary worldgen or backend API churn.
- The plan correctly preserves the established `supporting -> persistent` save-boundary mapping.
- Targeted regressions around adapters, parser seams, and persistence are the right testing strategy.

### Agreed Concerns
- Missing-tier fallback behavior for legacy payloads/campaigns is not explicit enough and can still silently upcast NPCs to `key`.
- `npc.tier` and `draft.identity.tier` must remain synchronized everywhere; otherwise the review editor can emit incoherent state.
- Helper-created NPCs should be retiered before entering scaffold state, not as a loosely specified follow-up step.

### Divergent Views
- Gemini rates overall risk LOW because the underlying data model already supports the feature and the planned regressions are strong.
- Claude rates overall risk MEDIUM because the legacy fallback rule and helper-retier sequencing are not yet fully specified.
- Claude also raises a possible missing seam around `identity.tier` ownership and `_uid` preservation that Gemini does not call out.

## Recommended Plan Adjustments

- Update `35-01-PLAN.md` to explicitly define the legacy fallback rule for NPCs loaded without `tier`.
- Update `35-01-PLAN.md` to explicitly verify the canonical draft tier seam (`draft.identity.tier`) rather than assuming it already exists and is stable.
- Update `35-02-PLAN.md` to specify that helper-created NPCs are retiered before entering component state or firing `onChange`.
- Add a small manual smoke step for the user-facing tier editor: load mixed NPCs, change tier, save, reload, verify.
