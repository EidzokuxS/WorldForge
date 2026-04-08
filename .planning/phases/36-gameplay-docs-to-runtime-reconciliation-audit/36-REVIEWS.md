---
phase: 36
reviewers:
  - claude
reviewed_at: 2026-04-08T10:00:00Z
plans_reviewed:
  - 36-01-PLAN.md
  - 36-02-PLAN.md
  - 36-03-PLAN.md
notes:
  - "Gemini CLI was invoked but did not yield a usable review because the provider returned repeated 429 MODEL_CAPACITY_EXHAUSTED responses."
---

# Cross-AI Plan Review — Phase 36

## Gemini Review

Unavailable for this run.

Invocation was attempted, but Gemini CLI exhausted retries against the provider with repeated `429 RESOURCE_EXHAUSTED / MODEL_CAPACITY_EXHAUSTED` responses for `gemini-3.1-pro-preview`, so no usable review text was produced.

---

## Claude Review

# Phase 36 Plan Review: Gameplay Docs-to-Runtime Reconciliation Audit

## Overall Assessment

This is a well-scoped audit phase with clear deliverables. The three-plan structure (extract claims -> classify against code -> produce handoff) is the right shape. The plans are realistic for what is essentially a structured documentation task with code reading — no implementation risk, no LLM calls, no test suites to break. The main risk is quality of execution, not plan design.

---

## Plan 36-01: Claim Register

### Summary
Extracts all gameplay-relevant claims from `docs/` into a normalized register grouped by subsystem. Straightforward document analysis task. The subsystem buckets are well-chosen and the artifact contract is specific enough to prevent hand-waving.

### Strengths
- Suggested subsystem buckets match the actual code module boundaries (turn loop, NPC tiers, reflection, world engine, etc.)
- Explicit requirement to capture provenance down to file and section
- Requirement to note ambiguous/contradictory source language rather than silently resolving it
- The `must_haves.truths` are concrete and verifiable

### Concerns
- **LOW**: No guidance on claim granularity. "The world uses a tag-based system" is one claim; "tags cover traits, skills, flaws, status, structural, faction" is six claims. The executor could produce 30 claims or 300 claims, and the plan doesn't hint at expected scale. This matters because Plan 36-02 must classify every one.
- **LOW**: `docs/plans/` contains implementation plans written in Russian with specific task breakdowns. These are implementation specs, not gameplay design claims. The plan should clarify that these are secondary/historical sources for catching drift, not primary claim sources — otherwise the executor might extract implementation tasks as gameplay claims.
- **LOW**: No mention of the `docs/tech_stack.md` or `docs/research.md` files. These are correctly out of scope but should be explicitly excluded to prevent scope creep during execution.

### Suggestions
- Add a note on expected claim count range (roughly `50-150`) so the executor calibrates granularity.
- Explicitly state that `docs/plans/*.md` are implementation plans, not design specs — extract only gameplay-facing promises from them, not task-level implementation details.
- Consider adding a `claim type` column (`behavioral rule`, `data contract`, `UI expectation`, `architectural constraint`) to make `36-02` classification faster.

### Risk Assessment: **LOW**
This is a reading comprehension task. The worst likely outcome is a claim register that is too coarse-grained, which is still recoverable in `36-02`.

---

## Plan 36-02: Runtime Classification Matrix

### Summary
Maps each claim from `36-01` against live runtime code and classifies it into one of four buckets. This is the highest-value plan in the phase — it is where the honest truth emerges.

### Strengths
- Four-bucket classification (`implemented_and_wired` / `implemented_but_partial` / `documented_but_missing` / `outdated_or_contradicted`) is precise and mutually exclusive.
- Explicit requirement that implemented labels need code references, not just vibes.
- Integrity-critical seams get their own summary section rather than being buried in rows.
- The `key_links` identify the right gameplay-critical files.
- Existing findings from `CONTEXT.md` / `RESEARCH.md` are positioned as starting evidence, preventing redundant rediscovery.

### Concerns
- **MEDIUM**: The `@context` block is large. If a single executor tries to classify a high claim count against all referenced files in one pass, later classifications may become shallow.
- **MEDIUM**: No guidance on what constitutes enough evidence for `implemented_and_wired` versus `implemented_but_partial`. Example: reflection code exists, but if `unprocessedImportance` never accumulates during gameplay, that must not be treated as fully wired.
- **LOW**: The severity field needs a clearer meaning. It should reflect how broken the game feels to a player who expects the documented behavior.

### Suggestions
- Define `implemented_and_wired` explicitly as: the full documented loop executes in a real game turn or runtime path without manual intervention.
- Allow subsystem chunking or sequential passes if claim count is high, so the matrix stays rigorous instead of shallow.
- Add a `confidence` column (`high/medium/low`) for classifications that may still need runtime confirmation.
- Call out the `unprocessedImportance` accumulation question as a priority investigation inside the matrix pass.

### Risk Assessment: **MEDIUM**
The risk is execution depth, not plan shape. A shallow `partial`-heavy pass would weaken the value of the phase.

---

## Plan 36-03: Handoff and Verification

### Summary
Converts the matrix into an actionable next-milestone contract and closes the phase formally.

### Strengths
- Four-bucket handoff structure (`must_fix_first` / `deprecate` / `carry_forward` / `nice_to_have_later`) forces prioritization instead of a flat dump.
- Explicit requirement that deprecated claims are listed, not silently dropped.
- Verification artifact must prove claims came from the matrix rather than new invention.
- The handoff is positioned to feed the next milestone directly.

### Concerns
- **MEDIUM**: The plan lets the executor decide priority ordering autonomously. That is acceptable, but the rationale for each `must_fix_first` item should be visible so the user can evaluate it.
- **LOW**: No explicit follow-up path for marking deprecated claims back in the docs. If Phase 36 does not modify docs, the handoff should at least call out which sections need deprecation cleanup later.
- **LOW**: Verification would be stronger if every handoff item referenced claim IDs from `36-CLAIMS.md`, not just matrix prose.

### Suggestions
- Require every handoff item to reference source claim ID(s).
- Add a deprecation tracker section listing the doc sections that should be marked outdated later.
- Include one-sentence rationale for each `must_fix_first` item.

### Risk Assessment: **LOW**
If `36-02` is rigorous, `36-03` is straightforward.

---

## Cross-Plan Assessment

### Dependency Chain
`36-01 -> 36-02 -> 36-03` is strictly sequential and correct.

### Scope Fitness
The phase stays inside the audit boundary and does not drift into implementation work.

### Achievability
The main realistic constraint is classification depth in `36-02`. The rest of the phase is structurally sound.

### Minor Gaps
- The plans do not explicitly describe how to handle runtime behaviors that exist in code but are not documented. An appendix for `undocumented but implemented` behavior would help.
- Frontend gameplay expectations exist in `docs/concept.md` and should have an explicit home in the claim register if not already covered by subsystem grouping.

### Overall Risk: **LOW-MEDIUM**
The package is well-designed. The only real risk is a too-shallow classification pass in `36-02`.

---

## Consensus Summary

Only one independent reviewer completed successfully in this run. Gemini was attempted but failed repeatedly due provider-side capacity exhaustion, so the usable feedback comes from Claude alone.

### Agreed Strengths
- The phase structure is correct: claim register first, runtime classification second, handoff/verification third.
- The phase stays disciplined inside the audit boundary and does not collapse into premature implementation work.
- The deliverables are concrete enough to feed the next gameplay milestone directly.

### Agreed Concerns
- `36-01` needs tighter guidance on claim granularity so the register is neither too coarse nor too fragmented.
- `36-02` needs a sharper evidence bar for `implemented_and_wired` vs `implemented_but_partial`.
- `36-02` may need subsystem chunking or an explicit confidence field to prevent shallow classifications under context pressure.
- `36-03` should make prioritization more traceable by attaching claim IDs and rationale to handoff items.

### Divergent Views

No cross-reviewer divergence could be established because only one independent reviewer produced a usable review.
