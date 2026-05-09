---
phase: 71
reviewed_at: 2026-04-26T08:37:08+03:00
review_request: "--all"
plans_reviewed:
  - 71-01-PLAN.md
  - 71-02-PLAN.md
  - 71-03-PLAN.md
  - 71-04-PLAN.md
  - 71-05-PLAN.md
  - 71-06-PLAN.md
  - 71-07-PLAN.md
  - 71-08-PLAN.md
reviewers_completed:
  - gemini
  - claude
reviewers_failed:
  - opencode
reviewers_unavailable:
  - coderabbit
  - qwen
  - cursor-agent
---

# Cross-AI Plan Review - Phase 71

Phase 71 was reviewed against the intended authority boundary:

- LLM owns semantic premise interpretation, source selection intent, source roles, ambiguity, and research/source planning.
- Backend owns deterministic validation, storage, search execution, approval state, provenance, formatting, and mechanical safety caps.
- Backend must not canonicalize franchises, canon subjects, primary/overlay meaning, or semantic premise intent.

## Consensus Verdict

**Approve with amendments before execution.**

Gemini found no blockers and considered the versioned artifact approach architecturally sound. Claude approved the direction but raised concrete execution blockers that should be folded into the plan before source edits. The shared conclusion is that the v2 path preserves the intended authority boundary, but the plan must explicitly close two regression routes: unspecified LLM brief prompting and legacy worldgen research functions that may keep deterministic franchise/search-prefix behavior alive.

## Required Amendments Before Execution

1. **Add a phase-start anchor.**
   - Add Task 0 to `71-01-PLAN.md`: record `git rev-parse HEAD` into `71-PHASE-START.txt`.
   - Update `71-08-PLAN.md` to use that file for final compare-mode verification.

2. **Specify the LLM research-brief prompt skeleton.**
   - `71-03-PLAN.md` must state the prompt rules that create `researchWorldgenArtifact`.
   - The prompt must require mixed-premise source enumeration, roles, ambiguity preservation, and no forced single-source collapse unless the premise is genuinely unambiguous.
   - Add a test/assertion that the prompt forbids backend-like "identify canonical franchise" collapse.

3. **Decide and test the fate of legacy authority functions.**
   - Explicitly mark `detectFranchise`, `franchiseDetectionSchema`, `researchKnownIP`, `evaluateResearchSufficiency`, and `buildWorldgenResearchPlan` as deleted, legacy-only, or v2-gated.
   - Add tests proving v2 artifact flow cannot call the legacy franchise/search-prefix path.
   - If worldbook/manual single-source paths keep legacy behavior, document why that is acceptable and gate it to explicit user-selected single-source input.

4. **Make schema caps concrete.**
   - `71-01-PLAN.md` should list actual caps for summary length, source counts, search job counts, query length, result counts, citation counts, and evidence/fact lengths.
   - Add oversized-payload rejection tests.

5. **Handle `WorldgenResearchUse` as a boundary decision.**
   - Either justify the closed enum as a mechanical prompt-routing taxonomy with fallback behavior, or widen it to capped strings so backend does not reject unknown LLM-authored categories as semantic errors.

6. **Protect legacy no-artifact prompt behavior.**
   - Add snapshot/golden tests in `71-05-PLAN.md` and `71-06-PLAN.md` for `{ ipContext, researchArtifact: null }`.
   - These should prove manual/worldbook flows keep current prompt text unless intentionally changed.

7. **Add null `ipContext` and ambiguity regressions.**
   - Add a regression where routes pass `{ ipContext: null, researchArtifact: v2 }` and divergence logic does not crash or re-canonicalize.
   - Add an ambiguous/contradictory premise fixture proving `ambiguityNotes` and `ambiguous` roles survive without backend resolution.

8. **Improve shared fixture and roundtrip coverage.**
   - Export the JJK-with-Naruto fixture from a shared test fixture file instead of duplicating it across plans.
   - Add enrich -> save -> reload -> enrich-again coverage for enriched research artifacts.

9. **Clarify frontend wizard pass-through.**
   - `71-04-PLAN.md` should state whether the wizard threads `_researchArtifact` from suggest-seeds to generate.
   - If in scope, add frontend pass-through work and tests.
   - If out of scope, document that re-research is accepted and test that behavior is stable.

10. **Tighten lore extraction alignment.**
    - `71-07-PLAN.md` should assert lore extraction uses source/category routing correctly, e.g. JJK as tone overlay must not create JJK ability cards when Naruto owns the power-system use.

## Reviewer Availability Notes

- `gemini` completed successfully. Stderr contained non-fatal local agent validation warnings about old Gemini agent frontmatter and ignored git-ignored `AGENTS.md` files.
- `claude` completed successfully with no stderr.
- `opencode` is installed but failed before model invocation because global skill frontmatter parsing failed in `C:\Users\robra\.claude\skills\poker-software-architect\SKILL.md`. No Phase 71 review was produced by OpenCode.
- `cursor` is installed, but `cursor agent --help` returned only the general editor help and no usable terminal-agent options; no standalone `cursor-agent` executable was found.
- `coderabbit` and `qwen` were not available on PATH during CLI detection.

## Gemini Review

# Phase 71 Plan Review: Repair Worldgen Research Authority Boundary

**Verdict: PASS**

The Phase 71 implementation plan is architecturally rigorous and directly addresses the root cause of the "JJK with Naruto powers" bug. By shifting semantic authority to an LLM-authored research artifact and reducing the backend to a mechanical validator/executor, it successfully decouples world DNA interpretation from deterministic code.

---

### Blocking Issues
*None.*

### Major Risks
*   **Token Budget Inflation**: Aggregating raw premise, search jobs, search results, and generated context into a single artifact significantly increases the context size for every downstream scaffold step (locations, factions, NPCs).
    *   *Mitigation*: Plan 01 and 03 correctly prioritize mechanical caps, Zod string/array limits, and `clampTokens` to prevent context-window overflow.
*   **Search Job Hallucination**: Shifting search job authoring to the LLM means the backend loses deterministic control over search quality.
    *   *Mitigation*: The plan maintains backend ownership of search *execution* (concurrency, provider selection, result caps, deduplication), ensuring the LLM can only drive the "what," while the backend enforces the "how."

### Missing Tests / Evidence
*   **Ambiguity Preservation Test**: The `WorldgenSourceRole` includes an `ambiguous` role, but no specific task explicitly verifies how the pipeline behaves when the LLM refuses to commit to a primary/overlay distinction.
    *   *Amendment*: Add an "Ambiguity Preservation" case to **71-03-01** (Task 1) using a intentionally vague premise.
*   **Lore Extraction Usage Test**: Lore extraction is a high-volume generation step. Verification needs to prove the LLM actually respects the rules (e.g., not generating JJK ability cards if JJK was marked only as a `tone_overlay`).
    *   *Amendment*: Add a specific assertion to **71-07-01** (Task 1) verifying category-to-source alignment in lore extraction.

### Overengineering Risks
*None.* The versioned artifact approach is appropriate for a fundamental shift in the research authority boundary and avoids the pitfalls of "renaming `franchise` to `subject`" while keeping the same flawed logic.

### Concrete Plan Amendments

1.  **71-03-PLAN.md (Task 1)**: Add a test case for a "Contradictory/Ambiguous Premise" to verify that the pipeline preserves ambiguity in `ambiguityNotes` and `ambiguous` roles without crashing or forcing a backend-side resolution.
2.  **71-04-PLAN.md (Task 2)**: Implement "Shadow Mirroring" in the `suggest-seeds` route. Even when returning a v2 artifact, the route should continue to populate the legacy `_ipContext` field (derived from the artifact facts) for a transition window to avoid breaking un-updated frontend inspection components.
3.  **71-07-PLAN.md (Task 2)**: Update the `extractLoreCards` prompt to explicitly map `WorldgenResearchUse` categories to extraction passes (e.g., pass "power_system" rules to the "ability" extraction sub-step).

---
*Reviewer: Gemini CLI*
*Date: 2026-04-26*

## Claude Review

# Phase 71 Plan Review

## Verdict

**APPROVE WITH AMENDMENTS** - Authority boundary on v2 path is preserved correctly. Wave structure, tests-first discipline, and forbidden-string regressions are solid. Block on amendments B, D/E, G below before execution; rest can land during execution.

---

## Blocking Issues

### B1. LLM brief generation prompt unspecified
Plan 03 removes `certain -> return object.franchise` but does not define what prompt drives `researchWorldgenArtifact`. Implementation could trivially preserve franchise-name authority by asking LLM `"identify the canonical franchise"` and stuffing one source into the brief. Without prompt design locked, boundary repair is one prompt edit away from regression.

**Fix:** Plan 03 must specify the brief prompt skeleton - explicitly instruct LLM to enumerate multiple sources with roles for mixed premises, preserve ambiguity in `ambiguityNotes`, and never collapse to single source unless premise is unambiguous. Add prompt-text assertion in 71-03 test.

### B2. Legacy authority surfaces stay alive
`detectFranchise`, `franchiseDetectionSchema`, `researchKnownIP`, `evaluateResearchSufficiency`, and `buildWorldgenResearchPlan` (retrieval-intent.ts) remain after Plan 07. RESEARCH listed `buildWorldgenResearchPlan` as deprecated. If worldbook flow still calls `researchKnownIP`/`evaluateResearchSufficiency`, the franchise-string-prefix-search-job path stays callable. Worldbook ipContext.franchise comes from user selection, but the prompt-prefix mechanic is the original failure surface.

**Fix:** Plan 03 or 07 must explicitly state who calls each legacy function post-phase. If nothing - delete (dead code). If worldbook -> add test that legacy path cannot run when v2 artifact is present, and document why prefix-search is acceptable for user-selected single-source worldbooks.

### B3. PHASE_START_REF anchor missing
Plan 08 verify offers two GitNexus modes: staged-only or compare-from-baseline. Compare mode references `PHASE_START_REF` but no plan records it. If implementation lands as multiple commits before Plan 08, staged mode is empty and compare mode has no anchor.

**Fix:** Add a pre-Plan-01 metadata step (or Task 0 in 71-01): record `git rev-parse HEAD` to `.planning/phases/71-.../71-PHASE-START.txt`. Plan 08 reads it.

---

## Major Risks

### R1. No snapshot/golden tests for legacy ipContext flow
Plans 05-07 assert v2 artifact produces correct prompts. None assert that the **no-artifact, ipContext-only** flow produces byte-identical prompt text vs current main. Worldbook/manual flows are HIGH-impact via `buildIpContextBlock`. Silent prompt drift will break worldbook campaigns.

**Fix:** Add baseline snapshot test in 71-05 and 71-06 - render prompts with `{ipContext, researchArtifact: null}`, compare to golden file captured before phase work begins.

### R2. `WorldgenResearchUse` closed enum is backend-defined taxonomy
Backend defines 7 categories. LLM may author a brief needing a category outside the set (e.g., `cuisine`, `magic_school`). Schema rejection forces backend to be the categorizer - soft authority leak.

**Fix:** Plan 01 either (a) justify closed enum as mechanical/structural classifier for prompt rendering only, with explicit fallback when LLM picks unknown category, or (b) widen to capped string union. Document the choice in artifact contract.

### R3. Cap values abstract
Plans repeatedly reference "mechanical caps" without numbers. Reviewer cannot verify DoS mitigation. Schema must specify: `interpretationSummary` <= N chars, `searchJobs.length` <= N, per-job `query` <= N, `searchResults.length` <= N, etc.

**Fix:** Plan 01 schema lists exact numbers. Test asserts schema rejects oversized payload.

### R4. `interpretPremiseDivergence` interaction with null ipContext
Routes after Plan 04 may pass `researchArtifact` with `ipContext: null` (automatic v2 path). `resolvePremiseDivergence` calls `interpretPremiseDivergence(ipContext, premise, role)`. If divergence prompt depends on `ipContext.franchise`, behavior with null ipContext is unspecified.

**Fix:** Add Plan 05 regression: divergence works with `{ipContext: null, researchArtifact: <v2>}` and does not crash or silently re-canonicalize.

### R5. Frontend not addressed
`_ipContext` flows from suggest-seeds wizard to generate. Routes return `_researchArtifact` (Plan 04). Frontend wizard must thread artifact, or every generate call re-researches (wasted tokens, divergent results). Plan scope says no UI redesign - fine - but the wizard data flow needs at minimum a pass-through.

**Fix:** Plan 04 explicitly notes whether wizard pass-through is in scope. If yes, add frontend file. If no, document that re-research is acceptable and add test.

---

## Missing Tests / Evidence

### M1. Prompt injection through premise
T-71-01-01 says "treat as data". No test verifies a malicious premise (`"Ignore previous instructions..."`) survives schema -> formatter as quoted data, not instruction. Add fixture in Plan 01.

### M2. Ambiguity preservation
CONTEXT mandates `ambiguityNotes` for ambiguous premises. No plan asserts ambiguous premise -> non-empty `ambiguityNotes`. Add to Plan 03.

### M3. Enriched artifact roundtrip
Plan 07 saves enriched artifact. Plan 02 tests basic save/load. No test proves `enrich -> save -> reload -> enrich again` stays valid and idempotent. Add to Plan 07.

### M4. Reusable fixture
Plans 01-07 each say "use Plan 01 fixture" but Plan 01 only puts fixture in test file. Plans 02/03/04 will duplicate it. Export from `backend/src/worldgen/__tests__/fixtures/jjk-naruto-artifact.ts`.

---

## Overengineering Risks

### O1. `enrichedResearchArtifact` separate return
Plan 07 returns `{scaffold, enrichedResearchArtifact}` alongside parameter `researchArtifact`. If unchanged, why two? Simplify: sufficiency mutates and returns artifact (or returns same instance). Single field, single conditional save.

### O2. Wave 6 closeout-only plan (71-08) is heavyweight
Two tasks for closeout is reasonable, but the verify task in 71-08 has 4 layered shell pipes and a PowerShell forbidden-string scan inline. Move scan to a `scripts/` file invoked by name. Reduces plan-text noise and makes scan reusable in CI.

### O3. `WorldgenResearchArtifactV2` in shared/ vs backend/
Plan 01 puts type in `@worldforge/shared` because "crosses backend/storage/API boundaries". But CONTEXT defers UI. No frontend consumer planned. Type only crosses backend<->storage. Putting it in `shared/` is forward-compatible but ships dead frontend type. Acceptable, but document why now vs later.

---

## Concrete Plan Amendments

| ID | Plan | Amendment |
|----|------|-----------|
| A1 | 71-01 | Add concrete caps (chars/array sizes) to schema. Export reusable fixture file. Add prompt-injection test. Add ambiguity-preservation test. Document `WorldgenResearchUse` enum decision. |
| A2 | 71-01 (Task 0) | Record `git rev-parse HEAD` to `71-PHASE-START.txt` for Plan 08 anchor. |
| A3 | 71-03 | Specify LLM brief generation prompt skeleton with mixed-premise rules. Add prompt-text assertion. Decide fate of `detectFranchise`/`franchiseDetectionSchema` - retire from v2 path or explicit legacy-only gate. |
| A4 | 71-04 | Explicitly extend Plan 01 Zod schema (no duplicate validation). Document frontend wizard impact (pass-through or re-research). |
| A5 | 71-05 | Add legacy-flow snapshot test (no artifact, ipContext only -> unchanged prompt). Add `interpretPremiseDivergence` null-ipContext regression. |
| A6 | 71-06 | Same legacy-flow snapshot for scaffold steps. |
| A7 | 71-07 | Document fate of `evaluateResearchSufficiency` and `buildWorldgenResearchPlan`. Add gate test that legacy sufficiency cannot run when artifact present. Add enrich->save->reload->enrich roundtrip test. Simplify return shape. |
| A8 | 71-08 | Reference `PHASE_START_REF` from A2. Move forbidden-string scan to `scripts/check-forbidden-prompts.sh`. |

---

## Boundary Verdict

**Authority boundary preserved on v2 path.** Backend code in proposed plans does not classify franchises, decide primary/overlay roles, or convert LLM strings to canon. LLM owns interpretation via `researchBrief.sourceUsageRules`. Backend is mechanical: schema/caps/dedupe/search exec/persistence/formatting.

**Risk to boundary:** entirely in legacy path retention (B2) and unspecified brief prompt (B1). Address those, and the architectural intent is sound.
