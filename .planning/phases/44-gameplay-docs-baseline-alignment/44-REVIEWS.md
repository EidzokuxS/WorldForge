---
phase: 44
reviewers: [claude]
review_failures:
  - reviewer: gemini
    reason: "429 MODEL_CAPACITY_EXHAUSTED / no usable review returned"
skipped_reviewers:
  - reviewer: codex
    reason: "current runtime; skipped for independence"
reviewed_at: 2026-04-11T18:56:00+03:00
plans_reviewed:
  - 44-01-PLAN.md
  - 44-02-PLAN.md
  - 44-03-PLAN.md
---

# Cross-AI Plan Review — Phase 44

## Gemini Review

No usable review returned.

Observed failure:
- `429 MODEL_CAPACITY_EXHAUSTED` for `gemini-3-flash-preview`
- Gemini CLI also emitted local agent/skill validation noise before the capacity failure

This is not a plan-quality verdict. It is an external reviewer availability failure.

---

## Claude Review

# Phase 44 Plan Review

## Plan 44-01: High-Level Docs Authority & Top-Level Deprecations

### Summary

A well-scoped plan that correctly targets the three highest-level documentation surfaces (`concept.md`, `tech_stack.md`, and the historical player-creation plan) for authority reframing and stale-claim cleanup. The two-task split is clean: Task 1 handles the product contract, Task 2 handles technical reference and historical handoff. The plan stays within its boundary and doesn't attempt to rewrite gameplay mechanics detail that belongs in 44-02.

### Strengths

- Clear authority-pyramid establishment — the explicit "Docs authority" note in `concept.md` pointing to `mechanics.md` and `memory.md` is the single most important structural change in Phase 44
- Deprecation policy is well-operationalized: acceptance criteria use concrete `rg` patterns to verify that stale claims get visible deprecation notes rather than silent removal
- The historical-note approach for the player-creation plan is the right call — marking it superseded preserves audit trail without creating confusion
- Scaffold count ranges (5-8 locations, 6-10 key + 3-5 supporting NPCs, 3-6 factions) are specified as concrete replacement values, not left vague
- Wave 1 with no dependencies means this can run in parallel with 44-02

### Concerns

- **MEDIUM**: The scaffold count ranges stated in Task 1 action text (5-8 locations, 6-10 key + 3-5 supporting NPCs, 3-6 factions) should be verified against the actual generator code before committing. The research says "current generator ranges differ" but doesn't pin them. If the agent writes wrong numbers, the docs drift again immediately.
- **LOW**: The `Solid Slate` replacement guidance says "replace with an explicit superseded/historical note or a truthful description of the current `/game` shell" — the agent should prefer the truthful description since the historical note alone doesn't tell planners what actually exists now.
- **LOW**: Task 2's acceptance criteria check for absence of "Flat structure" and "duplicated" in `tech_stack.md` — but the current `tech_stack.md` has a `Project Structure (Proposed)` section that says "Flat structure — no monorepo, no shared packages. Shared types are duplicated (5-10 interfaces)." This is materially false (the project has `@worldforge/shared`). The plan correctly targets this, but the verify command doesn't run a full-suite regression — only `frontend/lib/__tests__/api.test.ts` and character tests. That's fine for a docs-only plan though.

### Suggestions

- Add a `read_first` entry for `backend/src/worldgen/scaffold-steps/npcs-step.ts` or similar to verify the exact scaffold count ranges before writing them into `concept.md`
- For the Solid Slate replacement, bias the action text toward "write what exists now" rather than "mark as historical" — the current `/game` layout is a useful thing to describe briefly

### Risk Assessment

**LOW**. This is a well-bounded docs rewrite. The main risk is writing incorrect scaffold ranges, which is easily caught in review. No code changes, no runtime impact.

---

## Plan 44-02: Mechanics Baseline Rewrite

### Summary

The most substantively important plan in the phase — it rewrites `docs/mechanics.md` from a stale tag-centric design document into the normative gameplay baseline. The two-task split is sensible: Task 1 covers the character/Oracle/opening-state contract (the newer, more complex additions), Task 2 covers reflection/tools/travel/location/world-information-flow (the broader surface). The plan correctly identifies the Group C item C2 (WORLD-12/WORLD-13) as needing explicit bounded wording rather than a hand-wave.

### Strengths

- Canonical-record-first framing is correctly prioritized as the lead structural change — this is the single biggest semantic shift from the old docs
- Target-aware Oracle boundaries are specified precisely: supported `character`, `item`, `location/object` with honest fallback
- Opening-state mechanics coverage is thorough: all five start-condition fields plus expiry rules are named explicitly
- The C2 world-information-flow rewrite is a strong addition — rather than leaving vague "the LLM infers what NPCs know" language, it bounds the contract to prompt-visible context (proximity, faction, recent happenings, elapsed time)
- Reflection threshold correction from 15 to 10 with structured-state-first outcome priority is pinned in acceptance criteria
- Phase 38 bounded pending note is required by acceptance criteria, preventing premature closure

### Concerns

- **MEDIUM**: Task 2's acceptance criteria check for `WORLD-12|WORLD-13` literally appearing in the docs. This is a claim-ID reference that arguably belongs in the claim-resolution artifact (44-03), not in the user-facing docs. The agent might awkwardly embed claim IDs in prose to pass verification. Consider whether the acceptance criteria should instead check for the *semantic content* (bounded world-information-flow wording) rather than the literal claim IDs.
- **MEDIUM**: The plan rewrites `docs/mechanics.md` as one file across two tasks without a clear section-ownership boundary. Both tasks modify the same file. If the agent commits Task 1 and then Task 2 rewrites overlapping sections, there could be unnecessary churn or lost Task 1 edits. The action text is clear enough that a competent agent should handle this, but it's a coordination risk.
- **LOW**: The tool-contract tables in current `mechanics.md` (Storyteller tools, NPC tools, Reflection tools, World Engine tools) are detailed and mostly correct. The plan doesn't explicitly say whether to preserve, update, or rewrite these tables. An agent might over-aggressively rewrite tables that are already accurate, or under-update tables that have drifted (e.g., `move_to` now has travel cost semantics).
- **LOW**: The plan doesn't mention the `move_to` self-travel no-op handling from Phase 43-06. This is a live travel contract detail that `mechanics.md` should reflect.

### Suggestions

- Change the C2 acceptance criteria from checking literal `WORLD-12|WORLD-13` in the docs to checking for bounded information-flow language like `proximity|faction context|recent happenings|elapsed time|does not guarantee`. Leave claim-ID traceability to the 44-03 resolution artifact.
- Add a brief note in Task 2's action text about reviewing the existing tool-contract tables (Storyteller, NPC, Reflection, World Engine) for accuracy rather than leaving them untouched or blindly rewriting them. Specific updates needed: `move_to` now has travel cost, `log_event` importance is caller-supplied, reflection tools haven't changed but the trigger contract has.
- Consider adding `backend/src/engine/location-graph.ts` to Task 2's `read_first` so the travel-cost and graph-traversal contract is grounded in code, not just summaries.

### Risk Assessment

**LOW-MEDIUM**. The plan is thorough and well-grounded. The main risk is coordination between two tasks editing the same file, and the possibility of an agent either under-updating tool tables or awkwardly inserting claim IDs into user-facing prose. Both are catchable in review.

---

## Plan 44-03: Memory Baseline & Claim Resolution

### Summary

The final plan completes the normative doc surface (`memory.md`) and produces the claim-resolution audit artifact that proves DOCA-01 compliance. The wave-2 dependency on 44-01 and 44-02 is correct — the resolution map needs to reference final doc locations from those plans. The two-task split (rewrite `memory.md`, then produce the resolution checklist) is the right ordering.

### Strengths

- The `memory.md` rewrite is grounded in specific code values: top-3 lore, top-5 episodic, vector-only search, caller-supplied importance, threshold 10, `[EPISODIC MEMORY]` block name — all verified against `prompt-assembler.ts` and `reflection-agent.ts`
- Checkpoint/restore wording is correctly pinned to the config-inclusive bundle contract from Phase 41
- The claim-resolution artifact is a concrete checklist, not a narrative summary — exactly what a future verifier needs
- Acceptance criteria for Task 1 check both presence of correct terms AND absence of stale terms (`RETRIEVED MEMORIES`, `keyword + vector`, `Wiki scraper`, `sum >= 15`)
- The Phase 38 bounded pending note is required in `memory.md` as well as `mechanics.md` (from 44-02), matching the research recommendation

### Concerns

- **HIGH**: Task 1 action text says "Replace the old hard claim that the backend rejects every nonexistent narrated item unless you can prove that exact global contract; document the narrower live rule instead." This is important but vague — what IS the narrower live rule? The current `memory.md` says "If the Storyteller references an item not in the inventory, the backend rejects it." The research doesn't clarify whether this claim is still true, partially true, or false. The agent needs to verify this against `tool-executor.ts` to know what to write. If this is wrong, it's a material docs error in the opposite direction (from overstatement to understatement or vice versa).
- **MEDIUM**: Task 2 depends on reading the final versions of `concept.md`, `mechanics.md`, `memory.md`, and `tech_stack.md` to build the resolution map. But 44-01 and 44-02 run in wave 1 (potentially in parallel), and 44-03 runs in wave 2. The `read_first` for Task 2 correctly lists all four doc files, but the agent needs to read the *post-rewrite* versions, not cached pre-rewrite versions. This should work naturally with the wave ordering, but it's worth noting.
- **MEDIUM**: The claim-resolution artifact covers Group B (B1-B6) and Group C (C1-C5) but the plan doesn't mention Group D items. The Phase 36 handoff explicitly says Group D is "nice to have later" and Phase 44 requirements only cover B/C, so this is correct scope — but the artifact should probably include a one-line note explaining why Group D is excluded, to prevent a future auditor from flagging it as incomplete.
- **LOW**: The same-turn committed-evidence contract (events readable before embeddings exist) from Phase 40-03 is mentioned in the action text. This is a subtle runtime detail that matters for planning-grade accuracy but might be over-detailed for `memory.md`. The agent should judge the right depth.

### Suggestions

- For the inventory rejection claim: add `backend/src/engine/tool-executor.ts` to Task 1's `read_first` so the agent can verify the actual live item-validation behavior before documenting it. This is a material truth question, not a wording preference.
- Add a note in Task 2's action text to include a brief Group D exclusion rationale in the claim-resolution artifact (e.g., "Group D items are deferred per Phase 36 handoff and are not part of DOCA-01 scope").
- The verify command for Task 2 runs a very broad test suite (10 test files). This is appropriate for the final plan in the phase but will be slow. Consider whether the agent should run the full suite only once at the end rather than after each task.

### Risk Assessment

**LOW-MEDIUM**. The inventory-rejection claim is the one material risk — if the agent documents it wrong, the docs will be materially false in a new direction. Everything else is well-grounded and traceable.

---

## Cross-Plan Assessment

### Dependency Ordering

Correct. 44-01 and 44-02 are wave 1 (no interdependencies), 44-03 is wave 2 (reads final doc versions from both). The claim-resolution artifact in 44-03 correctly depends on all doc rewrites being complete.

### Scope Creep Risk

**LOW**. All three plans stay within the docs-rewrite boundary. No code changes. No new mechanics. The Phase 38 bounded-pending-note approach is the right way to handle unfinished work without either lying or blocking.

### Coverage Gaps

1. **`docs/concept.md` Character Import section** — the current docs mention "SillyTavern V2 Character Cards" for import. The live system supports V2/V3 cards plus archetype research plus structured draft pipelines. None of the three plans explicitly targets this section. It's a minor gap since the character-creation plan is marked historical, but the `concept.md` section could silently persist as stale.

2. **Storyteller tool contract table** — `mechanics.md` has detailed tool tables that are mostly accurate. 44-02 doesn't explicitly say to audit/update these. The `reveal_location` tool now creates ephemeral scene nodes plus bidirectional edges (Phase 43), which the current table doesn't reflect.

3. **`docs/memory.md` prompt assembly template** — the current `memory.md` has a literal prompt template showing `[RETRIEVED MEMORIES]` and `[NPC STATE]`. 44-03 correctly targets `[RETRIEVED MEMORIES]` → `[EPISODIC MEMORY]`, but the template also shows `[NPC STATE]` while the code uses `[NPC STATES]` (plural). Minor but worth catching.

### Overall Phase Risk

**LOW**. This is a well-planned documentation reconciliation phase with clear success criteria, traceable requirements, and realistic scope. The plans are thorough without being over-engineered. The main risks are all addressable in review: scaffold count verification, inventory-rejection truth, and tool-table accuracy.

---

## Codex Review

Skipped for independence because the current runtime is Codex.

---

## Consensus Summary

Available review coverage is limited to one usable external review. Gemini did not return a substantive review, so the synthesis below reflects the available reviewer only.

### Agreed Strengths

- The phase split remains sound: authority/deprecation framing first, mechanics rewrite second, memory plus claim-resolution last.
- The docs-authority model is strong and consistent with the Phase 44 context decisions.
- The plans stay inside the intended boundary: documentation alignment, not new mechanics work.
- The claim-resolution artifact in 44-03 is the right closeout mechanism for DOCA-01.

### Agreed Concerns

- `44-01` should verify scaffold-count ranges against live generator code before writing exact numbers into `concept.md`.
- `44-02` should avoid forcing literal `WORLD-12|WORLD-13` claim IDs into user-facing docs and should audit the existing gameplay tool tables explicitly.
- `44-02` should also account for Phase `43-06` travel semantics, especially `move_to` self-travel no-op behavior.
- `44-03` needs a sharper instruction for the inventory-validation claim so the agent documents the narrow live rule, not another overstatement.
- `44-03` should include a brief rationale for why Group D claims are out of scope for the claim-resolution artifact.

### Highest-Priority Follow-Up For `--reviews`

If this review pass is incorporated into replanning, the most valuable changes are:
- add explicit `read_first` coverage for scaffold counts and inventory-validation truth
- tighten `44-02` acceptance criteria around semantic world-information-flow wording rather than literal claim IDs
- require an audit/update pass over gameplay tool tables in `docs/mechanics.md`
- add a short Group D exclusion note to the `44-03` claim-resolution artifact contract
