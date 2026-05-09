---
phase: 62
reviewers: [gemini, codex]
reviewed_at: 2026-04-18
plans_reviewed: [62-01-PLAN.md, 62-02-PLAN.md, 62-03-PLAN.md]
note: Claude CLI skipped (runtime match — review independence)
---

# Cross-AI Plan Review — Phase 62

## Gemini Review

The implementation plans for **Phase 62** are exceptionally well-structured, particularly in their adherence to the "strictly complementary" mandate and the rigorous enforcement of the "no-IP" fixture rule. The strategy for rewriting both the component and its tests in parallel waves, followed by a multi-layered verification (including a live browser smoke test), ensures a high-quality delivery.

### Strengths
- **Locked Section Integrity:** Plan 62-01 precisely follows the 10-section order and duplicate removal map defined in the context, ensuring the "strictly complementary" requirement (P62-R1, P62-R2) is met.
- **Fixture Discipline:** Plan 62-02 proactively addresses the "No IP franchise names" requirement (P62-R5) by defining a forbidden list for grepping and providing safe original-world alternatives like "Commander Kael."
- **Verification Depth:** Plan 62-03 is comprehensive, combining static analysis (typecheck/lint) with targeted unit tests and a PinchTab browser smoke test that programmatically verifies the absence of duplicate labels in the live DOM.
- **Empty-State Logic:** The plan correctly identifies that a true "zero-section" state is difficult to achieve due to required enums (like `sourceKind`) and tunes the test expectations to verify that optional sections are suppressed when empty (P62-R3).

### Concerns
- **Data Loss (Beliefs, Drives, Frictions) — LOW:** In Plan 62-01 Task 2, the instruction to "delete any fallback to motivations.shortTermGoals / motivations.longTermGoals" and the explicit mapping for *Live Dynamics* rows removes the existing fallbacks for `motivations.beliefs` and `motivations.frictions`. Since these fields are not displayed on the basic NPC card, they will effectively become hidden in the UI.
- **Unmapped Fields (Social Status, Relationships) — LOW:** `socialContext.socialStatus` and `socialContext.relationshipRefs` are present in `CharacterDraft` but are not mapped to any of the 10 sections in the plan. While they were also absent in the v1 inspector, the phase goal is to surface "everything else... the LLM uses."

### Suggestions
- **Retain Non-Goal Fallbacks:** In `frontend/components/world-review/character-record-inspector.tsx` (Task 2), ensure that `motivations.beliefs`, `motivations.drives`, and `motivations.frictions` are either kept as fallbacks or added as dedicated rows in *Live Dynamics* or *Identity Core*, as they are not duplicates of the basic card.
- **Map Missing Social Fields:** Add `socialContext.socialStatus` (list) and `socialContext.relationshipRefs` (custom block) to the *Identity Core* or *Profile* section mapping in Task 2 to truly fulfill the "everything else" mandate.
- **Verify HP Visibility:** Double-check if `state.hp` is indeed missing from the basic NPC card in `npcs-section.tsx`. If it's already there, it should be removed from the Advanced panel's *Runtime & State* section to maintain strict complementarity.

### Risk Assessment: LOW
The risk is low because the changes are confined to a single leaf-node component (`CharacterRecordInspector`) and its corresponding test file. The caller (`npcs-section.tsx`) is not modified, and the verification plan (Plan 62-03) is robust enough to catch regressions or accidental duplicates before closeout.

---

## Codex Review

### Summary

The Phase 62 plan set is directionally strong: it decomposes implementation, tests, and verification cleanly, and it stays focused on the actual phase goal of making `CharacterRecordInspector` complementary to the basic NPC card. The two blocking issues are structural, not cosmetic: `P62-R3` is internally inconsistent with the current type surface and the proposed section gating, and `62-03` is written in bash-style command language even though this repo runs in PowerShell. Until those are fixed, the plans are not fully execution-ready.

### Plan 62-01

**Strengths**
- Good scope control: limits production edits to `character-record-inspector.tsx` and explicitly forbids touching `npcs-section.tsx`.
- The section mapping is mostly faithful to `62-CONTEXT.md`.
- Task 1 correctly adds an impact/caller check before editing.
- Acceptance criteria lock removal of duplicate labels and `PowerStatsSection`.

**Concerns**
- **HIGH**: Task 2 mis-maps the locked Overview badges. The plan uses `socialContext.originMode` but `62-CONTEXT.md` locks that set to `canonical status, source kind, import mode, worldgen origin`. `socialContext.originMode` is not `provenance.importMode`.
- **HIGH**: `No additional data` is effectively unreachable under this plan. Task 2 makes `Overview` render from required badge fields, `Runtime & State` render from always-present `state.hp`, and `Provenance` render from required `provenance.sourceKind`. That conflicts directly with `P62-R3`.
- **MEDIUM**: Task 2 says to keep `hasItems` unchanged, but the locked empty-state rules define string-list emptiness as "all entries empty after trim." Current helper only checks `items.length > 0`, so arrays like `[" "]` would incorrectly render sections.
- **LOW**: The verification grep set does not catch the `originMode` vs `importMode` drift.

**Suggestions**
- Replace `socialContext.originMode` with `provenance.importMode` in the Overview badge row.
- Resolve `P62-R3`: either change the emptiness model so invariant metadata (canonicalStatus, sourceKind, hp) does not count toward `hasAnyComplementSection`, or amend `P62-R3`/`62-CONTEXT.md` to reflect that a true empty state is impossible for a valid `CharacterDraft`.
- Change `hasItems` to trim string arrays, or add a dedicated normalized-list helper.
- Add acceptance checks for `provenance.importMode` presence and `socialContext.originMode` absence.

**Risk:** MEDIUM-HIGH.

### Plan 62-02

**Strengths**
- Strong fixture discipline: bans IP names, uses stable original-world literals.
- Test cases cover duplicate removal, biography in Overview, trimmed Live Dynamics, Loadout, Starting Conditions, Provenance.
- Keeping `powerStats` populated specifically to prove it does not render in Advanced is the right test shape.

**Concerns**
- **HIGH**: `makeEmptyDraft()` note acknowledges the empty-state contract from `62-01` cannot be satisfied as written. Same `P62-R3` conflict in test planning.
- **MEDIUM**: Front matter only traces `P62-R5`, even though the suite locks `P62-R1` through `P62-R4` behavior.
- **MEDIUM**: Test 1 says "renders all 10 sections in order," but only asserts 9 `h4` sections + checks `Raw JSON` separately.
- **LOW**: If `62-01` is corrected to use `provenance.importMode`, this test plan should update accordingly.

**Suggestions**
- Do not finalize test plan until `P62-R3` is resolved in `62-01`.
- Update `requirements:` in `62-02-PLAN.md` to include `P62-R1..P62-R4`, not just `P62-R5`.
- Tighten Test 1 to assert the exact heading array in order.
- Update assertions for `importMode` badge content.

**Risk:** MEDIUM.

### Plan 62-03

**Strengths**
- Verification breadth: typecheck, lint, targeted Vitest, full frontend Vitest, diff checks, grep audits, browser smoke.
- Evidence discipline: `62-VALIDATION.md` is useful and reviewable.
- Explicit protection for `npcs-section.tsx` staying unchanged.

**Concerns**
- **HIGH**: Command syntax is not PowerShell-safe (project runs on Windows). `echo "exit: $?"`, `test -f`, `for term in ...; do`, `tail -30` are bash syntax.
  - **NOTE by orchestrator:** Environment says `Shell: bash` (Git Bash on Windows). bash syntax works here. This concern is partially mitigated.
- **HIGH**: `git diff --name-only main...HEAD` validates committed branch history, not actual local phase edits. Can miss uncommitted work or include unrelated branch changes.
- **HIGH**: Task 2's PinchTab flow is not deterministic. "Select (or create) an ORIGINAL-WORLD campaign that has at least one Key NPC with populated draft fields" is a large, failure-prone precondition.
- **MEDIUM**: Verdict model blocks GO on any unexpected full-suite result, including unrelated pre-existing failures.
- **MEDIUM**: `run_in_background=true` is not a concrete command in this environment.

**Suggestions**
- Replace `main...HEAD` checks with `git diff --name-only -- frontend/components/world-review/` or `git status --short`.
- Make browser smoke deterministic by naming a seeded campaign/fixture source, or downgrade to supplemental evidence.
- Split blocking verification from non-blocking verification.

**Risk:** HIGH.

### Overall Risk Assessment

**MEDIUM-HIGH**. The phase design is solid, but the plans need two concrete fixes before execution:
1. Resolve the `P62-R3` empty-state contradiction.
2. Fix the `socialContext.originMode` vs `provenance.importMode` field mapping error.

Secondary fixes: PinchTab determinism, worktree-aware git diff, test plan requirement traces.

---

## Consensus Summary

### Agreed Strengths
- Scope discipline — single component + test file + verification artifact.
- No-IP fixture enforcement via forbidden grep list.
- GitNexus impact gate before modifying the inspector.
- Multi-layer verification (static + unit + full-suite + browser smoke).

### Agreed Concerns (Highest Priority)

1. **[BLOCKER] P62-R3 empty-state is unreachable** (Codex HIGH, Gemini acknowledged in Strengths as "correctly identified"). Required CharacterDraft fields (canonicalStatus, sourceKind, state.hp) guarantee Overview + Runtime & State + Provenance always render. `No additional data` fallback can never trigger for a valid draft. MUST resolve before execution: either (a) exclude invariant metadata from `hasAnyComplementSection`, or (b) amend P62-R3 / CONTEXT.md to acknowledge true-empty is impossible for valid draft and redefine fallback trigger (e.g. "draft is null" only).

2. **[BLOCKER] Overview badge field mismatch** (Codex HIGH). Plan 62-01 Task 2 uses `socialContext.originMode` for the Overview badge row, but CONTEXT.md locks `provenance.importMode`. Must replace in 62-01 action text AND add grep acceptance (`grep -q "originMode" ...` → exit 1, `grep -q "importMode" ...` → exit 0) to lock correct field.

3. **[P1] Missing fields not in 10-section map** (Gemini LOW). These live in CharacterDraft but no plan surfaces them:
   - `motivations.beliefs`, `motivations.drives`, `motivations.frictions` (not duplicates of basic Objectives which only show shortTermGoals/longTermGoals).
   - `socialContext.socialStatus`, `socialContext.relationshipRefs`.
   - Phase goal: "everything else the LLM uses" → these ARE used by the LLM.
   - Fix: add rows to Live Dynamics (beliefs/drives/frictions) and Identity Core (socialStatus/relationshipRefs).

4. **[P1] 62-02 requirement trace incomplete** (Codex MEDIUM). Front matter traces P62-R5 only; suite actually locks P62-R1..R4 too. Update frontmatter `requirements:` field.

5. **[P2] hasItems doesn't trim entries** (Codex MEDIUM). CONTEXT locks "empty when every entry is empty after trim". Update helper or add normalized-list helper.

6. **[P2] PinchTab smoke determinism** (Codex HIGH on execution, not spec). "Select or create campaign with populated Key NPC" is brittle. Downgrade to supplemental evidence OR seed a fixture campaign.

7. **[P2] HP visibility in basic card** (Gemini LOW). Need to confirm `state.hp` is NOT in `npcs-section.tsx` basic card before placing it in Advanced Runtime & State.

8. **[P2] Test 1 section-order assertion** (Codex MEDIUM). "10 sections in order" + `Raw JSON` separate check — align wording and assertion.

### Divergent Views
- **Overall risk level:** Gemini LOW, Codex MEDIUM-HIGH. Codex's structural concerns (empty-state impossibility, field mismatch) are real blockers that Gemini glossed over. Codex is correct to flag as blocking.
- **Verification shell syntax:** Codex flags as HIGH (PowerShell mismatch), but environment is Git Bash on Windows — bash works. Partial concern.

---

## Recommended Action

**Replan required** via `/gsd:plan-phase 62 --reviews` with these concrete fixes:

1. **62-01**: fix Overview badges (`provenance.importMode` not `socialContext.originMode`). Add `motivations.beliefs/drives/frictions` to Live Dynamics. Add `socialContext.socialStatus/relationshipRefs` to Identity Core. Verify `state.hp` not in basic card (grep `npcs-section.tsx`) before keeping in Runtime & State — if it IS in basic, remove from Runtime & State. Add trim-semantics to list emptiness check.
2. **62-01 + CONTEXT**: resolve P62-R3. Option A: redefine `hasAnyComplementSection` to ignore sections that render only invariant badges/metadata. Option B: amend P62-R3 to "fallback shows when draft is null OR when only invariants render, replacing the whole panel body".
3. **62-02**: expand `requirements:` frontmatter to `[P62-R1, P62-R2, P62-R3, P62-R4, P62-R5]`. Add assertion for `importMode` badge content. Tighten section-order assertion. Add test cases for beliefs/drives/frictions and socialStatus/relationshipRefs.
4. **62-03**: replace `main...HEAD` with `git diff --name-only -- frontend/components/world-review/`. Make PinchTab precondition concrete (seed campaign) OR mark smoke as supplemental. Add grep audit for `socialContext.originMode` absence.
