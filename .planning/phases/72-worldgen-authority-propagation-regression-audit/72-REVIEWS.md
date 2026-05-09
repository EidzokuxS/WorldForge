---
phase: 72
reviewers: [gemini, cursor]
attempted_reviewers: [claude, opencode]
skipped_reviewers:
  - codex: current runtime, skipped for independence
  - coderabbit: CLI missing
  - qwen: CLI missing
reviewed_at: 2026-04-26T21:00:39+03:00
plans_reviewed:
  - 72-01-PLAN.md
  - 72-02-PLAN.md
  - 72-03-PLAN.md
  - 72-04-PLAN.md
  - 72-05-PLAN.md
---

# Cross-AI Plan Review - Phase 72

## Review Run Status

| Reviewer | Status | Notes |
|----------|--------|-------|
| Gemini | Success | `gemini -p` accepted the assembled review prompt and returned structured feedback. |
| Cursor | Success | Invoked through the local `cursor-agent` CLI in read-only ask mode. |
| Claude | Failed | CLI returned `You've hit your limit - resets 9:50pm (Europe/Moscow)`. |
| OpenCode | Failed | CLI failed before review due local global skill frontmatter parse error in `C:\Users\robra\.claude\skills\poker-software-architect\SKILL.md`. |
| Codex | Skipped | Current runtime; skipped to keep reviewer independence. |
| CodeRabbit | Missing | CLI not installed/found. |
| Qwen | Missing | CLI not installed/found. |

---

## Gemini Review

# Plan Review: Phase 72 - Worldgen Authority Propagation Regression Audit

## Summary

Phase 72 is a targeted regression audit designed to lock down the authority boundary established in Phase 71. The plans prioritize empirical proof through focused tests before applying production fixes for known gaps, including Zod schema crashes on provider-length strings and canonical NPCs regressing to original power scaling. The strategy is highly methodical, starting with a shared fixture inventory and ending with negative scans to ensure legacy canonicalization fragments have not leaked back into the production prompt path.

## Strengths

- **Fixture Centralization:** Consolidating the JJK/Naruto mixed-premise fixtures in `72-01` ensures all downstream tests use the same ground truth for source-role interpretation, making regressions easier to debug.
- **Mechanical vs. Semantic Hardening:** `72-02` correctly places payload sanitization at the parser ingress rather than relaxing strict Zod schemas, preserving data integrity while preventing DoS-style crashes.
- **Frontend Transport Closure:** `72-04` addresses a critical leftover gap from Phase 71: the browser's failure to preserve and resend `_researchArtifact`. This removes the backend's dependency on on-demand fallback research during generation.
- **Negative Scans:** The inclusion of specific `rg` scans in `72-05` to find forbidden authority strings like `Canonical subject` or `Naruto universe` in production files is a useful safety net for a narrator-only architecture.
- **Adjacency Auditing:** The decision in `72-04` to audit generic character ingestion before modifying it prevents scope creep while ensuring no hidden authority dropouts remain.

## Concerns

- **LOW - Artifact Schema Growth:** The plans state they will not grow the v2 schema unless necessary, but the current aggregate `canonicalNames.characters` list lacks per-source mapping. In a mixed-premise world, if two sources provide a character with the same name, current logic may map the character to the first NPC-allowed source rule.
- **MEDIUM - Frontend Test Harness:** `72-04` notes that a new frontend API test target might be needed. If the frontend environment is not fully set up for these transport assertions, it could lead to manual-only verification, which is discouraged for this audit phase.
- **LOW - Stale `ipContext` Erasure:** `72-02` treats `researchArtifact: null` as omitted. This is safe for accidental client nulls, but assumes there is no valid current reason for a client to explicitly clear an artifact while leaving legacy fields intact.

## Suggestions

- In `72-03`, ensure the `Satoru Gojo` test specifically checks that the `franchise` field in his classification is sourced from the artifact's `sourceLabel`, not hardcoded to `Jujutsu Kaisen` in the test code.
- In `72-02`, consider asserting that truncated search results produce observable warning/log evidence if existing logging patterns support it, so developers can see that provider data was capped.
- Add a character identity collision test case to the fixtures if feasible, for example a canonical name that is present but excluded by a source usage rule, to document the intended original fallback behavior safely.

## Risk Assessment

**LOW.** The plans are regression-heavy and strictly limited in production scope. By identifying adjacency as a separate audit task, the phase avoids breaking generic character creation while still verifying the core worldgen pipeline. The JJK/Naruto mixed-premise fixture provides a high-fidelity environment to prove the Naruto power-system overlay does not accidentally import Naruto setting material.

---

## Cursor Review

# Review of Phase 72: Worldgen Authority Propagation Regression Audit

## Summary

Phase 72 formalizes a regression audit after Phase 71: tracing `WorldgenResearchArtifactV2` from parsing/search through routes, scaffold prompts, NPC classification and PowerStats, frontend transport, and review payloads. The five plans cover authority inventory and shared fixtures, provider/schema caps and `researchArtifact: null` semantics, scaffold/NPC authority invariants, browser artifact transport and review identity, and final verification/scans/scope proof. The phase goal is covered by the plan structure if execution follows the test-first rule and only changes production code for proven gaps.

## Strengths

- Clear product rule in `72-CONTEXT.md`: semantics belong to the artifact; backend owns mechanics. Plans 72-02 through 72-04 reflect this consistently.
- `INV-72-01` through `INV-72-07` in `72-VALIDATION.md` and `72-RESEARCH.md` provide checkable invariants and file/test mapping.
- Audit-first shape is strong: test first, then production fix only on proven failure; `scope_note` blocks in 72-03 and 72-04 resist scope expansion.
- Concrete regression anchors are well chosen: JJK world plus Naruto mechanics, Gojo known-IP path, original supporting NPC, overlong search snippets, and prompt-injection-like snippets.
- Threat boundaries are explicit, including nullable request body, stale `ipContext`, and client artifact spoofing.
- GitNexus requirements are reflected: impact before symbol edits and detect/scope proof before commit.
- 72-05 closes with a matrix, full backend suite, and explicit residual-risk handling instead of subjective worldgen-quality claims.

## Concerns

### HIGH

| Problem | Why It Matters |
|---------|----------------|
| Phase 72 requirements are still `TBD` in the roadmap and absent as formal `P72-R*` entries in `REQUIREMENTS.md`. | Phases 60-71 have numbered requirements and traceability. Phase 72 has a strong roadmap goal and invariants, but no formal requirement mapping, creating closeout ambiguity around what counts as done. |
| Prompt-injection tests can only prove prompt assembly, not LLM behavior. | 72-03 plans tests for snippets like `IGNORE SOURCE USAGE RULES`. These tests can prove snippets remain data in the constructed prompt, but cannot guarantee the model will not follow them at runtime. This should be explicitly classified as partial coverage. |

### MEDIUM

| Problem | Why It Matters |
|---------|----------------|
| Wave ordering leaves 72-02, 72-03, and 72-04 parallel. | Parallel execution is structurally valid, but integrated behavior around browser artifact transport, stored artifact, and nullable artifact semantics only emerges after 72-02 and 72-04 both land. |
| `WorldgenResearchUse` synonym drift is not directly tested. | Research notes that code recognizes `npcs`, `characters`, and `cast`. If the artifact generator returns an unexpected token, backend should not infer semantics, but behavior may degrade. |
| Negative scan for `canonicalStatus: "original"` is noisy. | There are many legitimate original-character uses. Without expected-match thresholds, closeout interpretation can become ambiguous. |
| 72-01 claims all `INV-72-*` in `requirements_addressed`. | The plan provides inventory and fixtures, not full invariant satisfaction. It could confuse an executor or verifier. |
| Aggregate `canonicalNames.characters` plus first matching source usage rule can be ambiguous. | Multiple source rules with NPC access and same/overlapping names may choose a franchise label by ordering. This edge case is not named in must-haves. |

### LOW

| Problem | Why It Matters |
|---------|----------------|
| Some verification snippets are PowerShell-specific. | This is fine locally, but CI/Linux equivalents or local-only documentation would prevent portability confusion. |
| 72-05 reruns backend focused and full tests. | Acceptable as a gate, but execution time should be expected. |
| `manager.test.ts` appears late in the final matrix. | If campaign config parsing regresses, it may surface late unless 72-02 covers it enough. |

## Suggestions

1. Add `P72-R1...` requirements to `REQUIREMENTS.md` or a short roadmap requirement block mirroring `INV-72-01...07`.
2. Record explicitly in 72-03 or 72-05 that prompt-injection tests prove prompt construction only, not model jailbreak immunity.
3. Add a recommended integration order or gate: 72-01 -> 72-02 -> 72-04, then integrated mixed-premise verification, while 72-03 can remain parallel if no shared files conflict.
4. Tighten the noisy `canonicalStatus: "original"` scan by limiting paths or documenting expected legitimate matches.
5. Add an optional edge test for multiple NPC-allowed source rules and one canonical name to document first-match behavior without expanding the schema.

## Overall Risk Assessment

**MEDIUM.** The phase is achievable and well researched, but the missing formal P72 requirements and the limits of prompt-injection testing are real planning risks. The core failures from Phase 71 are clearly addressed: Zod/caps, nullable artifact, frontend artifact loss, and Gojo falling into original power scaling. Security and data integrity controls are mostly well described; at closeout, ensure route bodies are still parsed/capped and client artifacts do not bypass campaign artifact authority.

---

## Claude Review

Claude CLI was available but did not produce a review.

```text
You've hit your limit · resets 9:50pm (Europe/Moscow)
```

---

## OpenCode Review

OpenCode CLI was available but did not produce a review because it failed during local startup/config parsing before reaching the review prompt.

```text
ConfigFrontmatterError: Failed to parse YAML frontmatter in C:\Users\robra\.claude\skills\poker-software-architect\SKILL.md
JSON Parse error: Unexpected EOF
```

---

## Consensus Summary

### Agreed Strengths

- Both successful reviewers agree the phase shape is correctly audit-first and regression-heavy rather than a broad rewrite.
- Both reviewers agree shared JJK/Naruto fixtures are a strong foundation for proving the product-critical mixed-premise behavior.
- Both reviewers agree frontend `_researchArtifact` transport is a real gap worth planning, not something to leave to backend fallback.
- Both reviewers agree the negative scans and final verification matrix are valuable closeout gates.

### Agreed Concerns

- Formal traceability is weaker than earlier phases because Phase 72 has invariant IDs but no `P72-R*` requirement entries in `REQUIREMENTS.md`.
- Prompt-injection coverage needs careful wording: tests can prove malicious search snippets remain bounded prompt data, but cannot prove the model will always ignore them.
- Aggregate canonical-name/source-rule matching has an edge-case risk around ambiguous names or multiple eligible source rules.
- Frontend test coverage may require harness work; avoid degrading this to manual-only verification.

### Divergent Views

- Gemini rated the overall plan risk **LOW**, emphasizing the limited production scope and regression-heavy design.
- Cursor rated the overall plan risk **MEDIUM**, mainly because of missing formal requirements and the risk of overclaiming prompt-injection protection.

### Recommended Planning Follow-up

Before executing Phase 72, run:

```bash
$gsd-plan-phase 72 --reviews
```

The likely replan changes are small and concrete:

- add formal P72 requirements or requirement traceability,
- clarify prompt-injection tests as prompt-construction coverage,
- tighten or document noisy negative scans,
- optionally add a source-rule/name-collision edge case,
- ensure frontend artifact transport has real automated tests.
