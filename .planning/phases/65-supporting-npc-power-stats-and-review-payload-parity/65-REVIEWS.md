---
phase: 65
reviewers: [gemini, codex]
reviewed_at: 2026-04-19T16:44:52Z
plans_reviewed:
  - 65-01-enrich-npcs-batch-helper-PLAN.md
  - 65-02-worldgen-npcs-step-integration-PLAN.md
  - 65-03-regenerate-saver-envelope-PLAN.md
  - 65-04-verification-gate-PLAN.md
skipped_reviewers: [claude]
skip_reason: claude is current runtime; skipped for independence
---

# Cross-AI Plan Review — Phase 65

## Gemini Review

# Phase 65: Supporting NPC power stats and review payload parity — Plan Review

## 1. Summary
The implementation plans for Phase 65 are exceptionally well-structured, following the proven "consolidation helper -> integration -> verification" pattern established in Phase 64. By extracting the enrichment logic into a shared `enrichNpcsBatch` module (Plan 01), the phase ensures that both initial worldgen (Plan 02) and sectional regeneration (Plan 03) share a single, fail-closed source of truth for NPC power assessment. The plans rigorously adhere to the "no human-default" policy and preserve the complex dependency where personality mapping must precede power assessment. The frontend fix (Option A) is surgical, resolving the payload parity issue without intrusive changes to shared backend adapters.

## 2. Strengths
- **Single Source of Truth:** Moving the enrichment logic to a shared helper prevents drift between initial generation and the `/regenerate-section` route.
- **Fail-Closed Integrity:** Explicit adherence to the `withPipelineRetry` pattern ensuring that a single failure in a batch of 15 NPCs correctly aborts the operation rather than emitting partial, lower-quality state.
- **Dependency Awareness:** The plans correctly identify that power assessment requires populated persona fields, ensuring the `enrichNpcsBatch` call occurs after the personality mapping loop in `npcs-step.ts`.
- **Bounded Concurrency:** Decision **D-05** (concurrency cap of 4) is a pragmatic balance between generation latency and rate-limit safety for web-search/LLM calls.
- **Surgical Frontend Fix:** Choosing Option A (merging the authoritative `result.draft` at the handler level) is the least invasive path, avoiding regressions in other parts of the system that rely on `toLegacyNpcDraft`.

## 3. Concerns
- **Regenerate Integration Test Dependency (LOW):** Plan 65-03's real-step integration tests will fail if Plan 65-02 (the `npcs-step.ts` modification) is not landed first. While noted in the risks, the orchestrator must ensure sequential execution or be prepared for transient failures in Plan 03 during parallel runs.
- **LLM Cost/Latency Uplift (MEDIUM):** Enriching all supporting NPCs in known-IP worlds adds significant web-search and LLM overhead (3-5 extra searches per worldgen). While the plan allows for research cache reuse, the integration tests should be monitored for total scaffold generation time.
- **Ingestion Envelope Typing (LOW):** Plan 03 Task 3 assumes `result.draft` is available in the API return type. If the frontend TypeScript definitions for the ingestion helpers are missing this field, a small type-only update to `frontend/lib/api.ts` will be required.

## 4. Suggestions
- **Timing Logs:** In `enrich-npc-batch.ts`, consider adding sub-operation timing logs for the overall batch to help debug latency regressions as the number of "supporting" characters in a franchise grows.
- **Test Fixture Reuse:** In `worldgen.test.ts` (Plan 03), ensure the `stubPowerStats` helper precisely matches the `PowerStats` Zod schema to avoid intermittent validation errors during the HTTP response parsing.
- **Type Safety Check:** Verify that the `ScaffoldNpc` type in `shared/src/types.ts` explicitly permits `draft: CharacterDraft | null` to ensure the frontend spread-merge in `npcs-section.tsx` doesn't require a cast.

## 5. Risk Assessment: LOW
The overall risk is **LOW**. The phase primarily restores intended functionality that was previously gated by a narrow "key-only" check. The use of real-step integration tests with mocked LLM seams provides high confidence that the fix works at the HTTP boundary without incurring high LLM costs during CI. The "zero-code-change" gates for the saver and UI render logic significantly reduce the regression surface.

**Verdict:** Plans are **APPROVED** for execution. Land Plan 01 first, then 02 and 03 (ideally sequentially), followed by the 04 verification gate.

---

## Codex Review

**Top Findings**
- `HIGH` `65-01` currently specifies an outer `withPipelineRetry("power_assess", ...)` around every branch, but original-world assessment already retries internally in `backend/src/character/ingestion/assess-original.ts:32`. As written, original NPC failures likely become nested retries with inflated latency and misleading failure semantics, and the proposed tests will not catch that because they mock `assessOriginalCharacterPowerStats`.
- `HIGH` `65-03` does not directly lock the actual four-handler payload bug. The repo already has a parameterized creation-handler test in `frontend/components/world-review/__tests__/npcs-section.test.tsx:389` that should be extended to assert `createdNpc.draft.powerStats`; the proposed new render tests can all pass even if one handler still drops `result.draft`.
- `MEDIUM` `65-03`'s saver test strategy is mismatched to the real harness. `backend/src/worldgen/__tests__/scaffold-saver.test.ts:361` is a mocked transaction-log test, not a real DB round-trip suite, so the plan should assert against inserted `characterRecord` JSON like the existing tests do.
- `MEDIUM` `65-01` ignores existing dispatch logic in `backend/src/character/ingestion/power-assessor.ts:38` and embeds stale draft fixture shapes compared with `shared/src/types.ts:436`. That increases drift risk before implementation even starts.

## 65-01 — enrich-npcs-batch-helper

**Summary**
The intent is good: isolate routing, concurrency, and fail-closed behavior in one shared helper before touching call sites. The main flaw is retry ownership; without fixing that, this plan creates the highest-risk behavioral bug in the phase.

**Strengths**
- Clear single-responsibility split: helper first, migrations later.
- Good emphasis on fail-closed behavior and bounded concurrency.
- Unit coverage is broad enough to validate routing and basic batching behavior.
- Defers call-site edits, which reduces blast radius in wave 1.

**Concerns**
- `HIGH` Outer retry in the helper plus inner retry in `assessOriginalCharacterPowerStats` likely causes nested retries for original-world NPCs.
- `MEDIUM` The repo already has `assessPowerStats` as the canon/original dispatcher; adding a second dispatcher risks rule drift.
- `MEDIUM` The example test fixture uses stale `CharacterDraft` fields and will not match current shared types cleanly.
- `LOW` The "mixed batch" test name is misleading because `ipContext` is batch-wide; it is really "mixed tiers," not a true four-quadrant batch.

**Suggestions**
- Make retry ownership explicit: either the helper retries only the canon branch, or extract a no-retry dispatcher and keep retry at one layer.
- Reuse or refactor `assessPowerStats` instead of duplicating its routing rules.
- Update the plan's sample fixtures to the current `CharacterDraft` shape before execution.
- Add one test that proves original-world failures do not exceed the intended attempt count.

**Risk Assessment**
`MEDIUM-HIGH` because the design is sound, but the retry bug would materially change runtime behavior and cost.

## 65-02 — worldgen-npcs-step-integration

**Summary**
This is the right place to replace the bad gate in `npcs-step.ts`, and the proposed post-loop enrichment preserves the important personality-before-power ordering. Its biggest weakness is that it inherits Plan 01's retry risk and slightly overstates how closely it matches current `npcs-step` behavior.

**Strengths**
- Correctly targets the real bug site in `npcs-step.ts`.
- Preserves Phase 64 personality mapping and provenance flow.
- Tests both world modes and both tiers.
- Keeps the fix local to the enrichment block instead of refactoring the whole step.

**Concerns**
- `MEDIUM` The rationale says batching mirrors the existing detail-pass pattern, but the current detail pass in `npcs-step.ts` is sequential, not chunked.
- `MEDIUM` If Plan 01 keeps nested retries, Test B still won't detect it because leaf assessors are mocked.
- `LOW` The fail-closed test will be slow because real retry backoff is involved; acceptable, but not ideal.

**Suggestions**
- Reword the plan to say batching is new behavior introduced for enrichment, not reused behavior from the detail pass.
- Add one assertion that enrichment happens exactly once after the loop, not per NPC.
- If possible, expose helper concurrency/backoff settings for tests so the fail-closed case runs faster.

**Risk Assessment**
`MEDIUM` because the migration itself is straightforward, but it depends on Plan 01 being corrected first.

## 65-03 — regenerate-saver-envelope

**Summary**
This plan covers the right surfaces: HTTP parity, saver persistence, frontend envelope repair, and render regression. The weak point is evidence quality for P65-R7: the proposed frontend tests are adjacent to the bug, not directly on it.

**Strengths**
- Good scope control around D-07, D-09, and Option A.
- Option A is the least invasive way to fix the review payload gap.
- Real-route integration for `/regenerate-section` is the right level of confidence.
- Recognizes that `scaffold-saver.ts` should stay untouched unless the assumption is proven false.

**Concerns**
- `HIGH` The plan does not directly test that all four creation handlers preserve `result.draft`; it should extend the existing handler-flow test rather than rely on fixture-only render checks.
- `MEDIUM` The saver task assumes a real read-back harness, but the current test file is transaction-log based.
- `MEDIUM` Known-IP route tests should explicitly enable research in test settings; otherwise mocks can hide a config mismatch.
- `LOW` The new PowerStats render tests partially duplicate existing `npcs-section` coverage instead of strengthening the most relevant handler path.

**Suggestions**
- Extend the existing parameterized helper-flow test in `npcs-section.test.tsx` to assert `createdNpc.draft.powerStats` for parse/generate/research/import.
- For the saver regression, inspect serialized `characterRecord` from `dbCalls` instead of inventing a DB round-trip pattern.
- In route tests, set `fakeSettings.research.enabled = true` for known-IP cases so the test environment matches real preconditions.
- Keep the new render-null test, but treat it as secondary coverage behind the handler-flow test.

**Risk Assessment**
`MEDIUM` because the planned production change is small and correct, but the current test strategy undershoots the actual frontend bug.

## 65-04 — verification-gate

**Summary**
This is a solid closeout plan with the right binary gate philosophy and good regression awareness. It is slightly over-specified and a bit brittle around lint and change-detection mechanics, but it does achieve the phase-closeout goal.

**Strengths**
- Full backend suite plus targeted frontend check is appropriate for this phase.
- Explicit regression checks for Phases 60/63/64 are valuable.
- Scope-gate verification for untouched files is well thought out.
- Documentation updates are concrete and traceable.

**Concerns**
- `MEDIUM` The lint requirement may fail for unrelated frontend debt and block closeout unless the fallback path is made first-class, not just a side note.
- `LOW-MEDIUM` `git log --since=...` is a weak way to prove files were untouched; uncommitted changes would be missed.
- `LOW` Some doc-update instructions assume placeholders that are already filled, which suggests the plan text needs one refresh pass.

**Suggestions**
- Promote the scoped-eslint fallback into the main decision path if full frontend lint is known to be noisy.
- Use `git diff --name-only` or `git status --short` against the phase base instead of `git log --since`.
- Simplify the doc steps to match the current contents of `ROADMAP.md` and `REQUIREMENTS.md`.

**Risk Assessment**
`LOW-MEDIUM` because it is mostly operational closeout work, with the only real danger being false negatives from brittle verification gates.

## Overall Risk

`MEDIUM`. The phase design is fundamentally good and targets the right bug surfaces, but I would not approve it unchanged because `65-01`'s retry semantics are wrong and `65-03` does not yet prove the four-handler envelope fix directly. Fix those two points first; the rest is mostly execution detail.

---

## Consensus Summary

### Agreed Strengths
- Phase 64 "shared-helper → consumers → verification" structure correctly adopted (both reviewers).
- `enrichNpcsBatch` as single source of truth is sound (both).
- Option A (frontend `result.draft` attach) is the least-invasive envelope fix (both).
- Fail-closed posture via `withPipelineRetry` and `IngestionPipelineError` is correctly emphasized (both).
- D-07 (zero scaffold-saver code change) and D-09 (zero PowerStatsSection code change) are good scope gates (both).
- Plan 04 regression checks against Phases 60/63/64 are valuable (Codex strong, Gemini implicit).

### Agreed Concerns (highest priority — must address before execute)

1. **[HIGH] Plan 03 envelope fix lacks direct handler-flow proof (Codex HIGH, Gemini implicit via typing LOW)**
   - Codex: new render-regression tests do not exercise `handleParse/handleGenerate/handleResearch/handleImport`; an undropped `result.draft` in any one handler can still ship green.
   - Recommended fix: extend the existing parameterized test at `frontend/components/world-review/__tests__/npcs-section.test.tsx:389` to assert `createdNpc.draft.powerStats` for all four creation modes. Keep the render-null test as secondary coverage.
   - Maps to P65-R7.

2. **[MEDIUM] LLM cost / latency uplift for known-IP supporting NPCs (Gemini MEDIUM, Codex LOW via slow fail-closed test)**
   - 3-5 additional web-search passes per worldgen run.
   - Recommended action: keep `req.research` cache reuse as implementation latitude (already in CONTEXT Claude's Discretion); add batch-level timing log in `enrich-npc-batch.ts` for observability.

3. **[MEDIUM] `result.draft` typing on frontend API helpers (Gemini LOW, Codex implicit via fixture drift)**
   - Plan 03 Task 3 already has a grep-level acceptance criterion for `draft` in `frontend/lib/api.ts`. Codex's and Gemini's concerns overlap with this existing guard — no new plan change required; verify during execution.

### Divergent Views (worth investigating)

1. **Retry ownership for original-world branch — Codex HIGH, Gemini did not raise**
   - Codex: `assessOriginalCharacterPowerStats` (`backend/src/character/ingestion/assess-original.ts:32`) already retries internally; wrapping it in `withPipelineRetry` produces nested retries with inflated latency and misleading failure attempt counts.
   - Gemini: did not flag — accepted the current retry design.
   - Investigation needed: verify the claim by reading `assess-original.ts:32`. If true, the plan must decide retry ownership: either (a) outer-only (remove inner retries from `assess-original`), (b) inner-only (helper dispatches without `withPipelineRetry` for original branch), or (c) extract a no-retry dispatcher and wrap at one layer.
   - This is a **BLOCKER** if verified — maps to P65-R3 fail-closed semantics. Replan Plan 01 Task 1 retry placement + add explicit "original NPC failure exhausts exactly N attempts (not N × M)" test.

2. **Existing `assessPowerStats` dispatcher in `backend/src/character/ingestion/power-assessor.ts:38` — Codex MEDIUM, Gemini did not raise**
   - Codex claims the repo already has a canon/original dispatcher. Plan 01 duplicates routing rules instead of reusing / refactoring.
   - Gemini did not flag.
   - Investigation: read `power-assessor.ts:38`. If an `assessPowerStats` dispatcher exists, Plan 01 should either reuse it (helper calls `assessPowerStats` with batching + retry wrapper) or extend it to accept the four-quadrant signature. Prevents future drift.

3. **Plan 03 saver test harness mismatch — Codex MEDIUM, Gemini did not raise**
   - Codex: `scaffold-saver.test.ts:361` is a mocked transaction-log test (asserts on `dbCalls`), not a real DB round-trip. Plan 03 Task 2 mis-assumes real read-back capability.
   - Fix: adjust Plan 03 Task 2 acceptance to assert against serialized `characterRecord` JSON in the mocked `dbCalls`, not a round-trip read.
   - Maps to P65-R6.

4. **Plan 04 `git log --since=` for untouched-file verification — Codex LOW-MEDIUM, Gemini did not raise**
   - Codex: misses uncommitted changes. Use `git diff --name-only` or `git status --short` against phase base.
   - Low-impact fix.

5. **Plan 04 frontend lint fallback as first-class path — Codex MEDIUM, Gemini did not raise**
   - Codex flags that the fallback-to-scoped-eslint is relegated to a side note even though prior phase experience suggests full-repo lint is noisy.
   - Already codified in acceptance_criteria via M1 fix from prior plan-checker iteration — partial mitigation. Consider promoting to the primary path with documented justification rather than keeping as conditional fallback.

6. **Overall verdict — Gemini LOW (APPROVED), Codex MEDIUM (NOT approved unchanged)**
   - Gemini: approve as-is, land in order.
   - Codex: fix 65-01 retry + 65-03 handler-flow proof first, then execute.
   - Recommended: side with Codex for the two HIGH items (retry + handler proof), adopt lighter-weight fixes for the MEDIUM items, then execute.

### Recommended Replan Scope (for `/gsd:plan-phase 65 --reviews`)

Surgical replan targeting:
- **Plan 01**: resolve retry ownership (remove double-wrap on original branch or dispatch via existing `assessPowerStats`); refresh fixtures to current `CharacterDraft` shape; add anti-nested-retry test; reconcile with `power-assessor.ts:38` dispatcher.
- **Plan 03 Task 3**: replace (or augment) new render-regression tests by extending existing parameterized handler-flow test at `npcs-section.test.tsx:389` to assert `createdNpc.draft.powerStats` for parse/generate/research/import.
- **Plan 03 Task 2**: reshape saver assertion to inspect mocked `dbCalls` `characterRecord` JSON rather than implying a real DB round-trip.
- **Plan 03 integration test**: set `fakeSettings.research.enabled = true` for known-IP cases.
- **Plan 04 Task 3**: replace `git log --since=` with `git diff --name-only <base>..HEAD` + `git status --short` for untouched-file gate.
- **Plan 04 Task 2**: promote scoped-eslint fallback to first-class path if full-repo lint is known noisy (keep full-repo as optional).
- **Plan 02**: reword batching rationale (new behavior, not reuse of detail-pass); add "enrichment happens once after loop, not per NPC" assertion; surface concurrency/backoff as test-tunable to speed fail-closed test.

No scope additions. No plan count change. No requirement ID changes.
