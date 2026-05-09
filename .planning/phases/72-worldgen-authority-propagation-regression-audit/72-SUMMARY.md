---
phase: 72-worldgen-authority-propagation-regression-audit
subsystem: worldgen-authority
tags: [worldgen, research-artifact, verification, gitnexus]
completed: 2026-04-26
requirements-completed: [P72-R1, P72-R2, P72-R3, P72-R4, P72-R5, P72-R6, P72-R7]
---

# Phase 72 Summary

## Goal

Close the worldgen authority propagation regression audit with automated proof that `WorldgenResearchArtifactV2` remains the authority for source roles, canonical character identity, provider payload bounds, route/frontend transport, and no-artifact compatibility.

## Plans Completed

| Plan | Status | Evidence |
| --- | --- | --- |
| 72-01 | Complete | Authority inventory and shared JJK/Naruto fixtures. |
| 72-02 | Complete | Provider payload caps and `researchArtifact: null` stored-artifact semantics. |
| 72-03 | Complete | Artifact prompt lane isolation and NPC canonical power dispatch. |
| 72-04 | Complete | Frontend artifact transport, review identity regression, and generic ingestion deferral. |
| 72-05 | Complete | Verification matrix, negative scans, and scope proof. |

## Invariants Verified

P72-R1 through P72-R7 / INV-72-01 through INV-72-07 are verified in `72-VERIFICATION-MATRIX.md`.

- Focused backend artifact/route/schema suite: 4 files, 302 tests, exit 0.
- Focused backend prompt/NPC/power suite: 6 files, 85 tests, exit 0.
- Backend generic-ingestion/campaign adjacency suite: 3 files, 54 tests, exit 0.
- Focused frontend artifact/review/session suite after review fixes: 5 files, 57 tests, exit 0.
- Full backend suite: 128 files passed, 3 skipped; 1670 tests passed, 30 todo, exit 0.
- Backend and frontend typechecks both exited 0.
- Code review gate after post-review fixes: `72-REVIEW.md` status `clean`, 23 files reviewed, 0 findings.

## Mixed-Premise Proof

The matrix proves `JJK world with Naruto power system` keeps `Satoru Gojo` as a Jujutsu Kaisen known-IP canonical NPC while Naruto remains a power-system/mechanics overlay through artifact source usage rules. Evidence comes from `research-artifact`, `ip-researcher`, `seed-suggester`, `scaffold-resilience`, `npcs-step`, frontend API/wizard/session, and character draft tests. Post-review regression coverage also proves stale legacy divergence cannot demote artifact-backed Gojo or leak old hidden context into a fresh no-artifact world generation request.

## Generic Ingestion Disposition

Generic character ingestion remains explicitly deferred. Scans show `ingestCharacterDraft` and `classifyCanonicalStatus` are reached from character routes with legacy `ipContext`/`premiseDivergence`, not from artifact-backed worldgen routes. No backend ingestion production code changed in Plan 72-05.

## Production Changes

Phase 72 production/verification-support changes from earlier commits are included for honesty:

- `eccb008 fix(72): unblock frontend v2 card typecheck` - local typed narrowing for V2 card parser.
- `cc2bdc7 test(72): fix npc artifact fixture type guard` - test-only nullable canonicalNames guard.
- `4596476 fix(72): close review authority persistence gaps` - artifact-backed NPC dispatch nulls stale legacy `premiseDivergence`, and campaign-new session persistence now stores/restores `researchArtifact`.
- `6c92c8c fix(72): clear stale wizard authority context` - full seed suggestions replace all hidden authority context fields, so returned `null` clears old `ipContext`, `premiseDivergence`, and `researchArtifact`.
- `56ac1a7 docs(72): add clean code review report` - final code review artifact records 0 findings after both review-fix commits.
- `72-02` capped provider search result fields and preserved stored artifacts on null generate payloads.
- `72-03` isolated artifact-backed seed/NPC lanes from stale legacy context.
- `72-04` transported frontend research artifacts and normalized draft live dynamics safely.

## Verification Commands

See `72-VERIFICATION-MATRIX.md` for exact commands, exit codes, file lists, and evidence rows. Additional post-review checks included `npcs-step.test.ts` (21 tests), the wizard focused test (7 tests), the combined frontend artifact/review/session suite (57 tests), frontend typecheck, and clean GSD code review. No live subjective worldgen quality test was run or claimed.

## Negative Scans

- Forbidden canonicalization prompt scan: exit 1, no production matches outside tests/fixtures.
- Noisy `_researchArtifact|worldgenResearchArtifact|canonicalStatus: "original"|classifyCanonicalStatus\(` scan: exit 0 with expected matches only; dispositions are documented in the matrix.
- `researchArtifact` scan: exit 0 with expected route/worldgen/frontend/test matches and no generic ingestion production artifact consumer.

## GitNexus Scope Proof

`gitnexus_detect_changes({ scope: "all", repo: "WorldForge" })` returned HIGH because the repository has unrelated dirty tail outside Phase 72-05: backend character/engine/routes/scripts/worldbook files, mockup deletions, package-lock changes, and `.desloppify`/backlog changes. Plan 72-05 did not stage or commit those files.

Fallback evidence:

- `npx gitnexus status`: indexed commit `cc2bdc7`, current commit `54d0868`, stale after the Task 1 docs-only commit.
- `git diff --name-only` / `git diff --stat`: unrelated dirty tail only before Task 2 docs staging.
- Staged-only GitNexus proof after staging only `72-VERIFICATION-MATRIX.md` and `72-SUMMARY.md`: LOW, 2 changed files, 0 changed symbols, 0 affected processes.
- Post-review fix `4596476`: staged GitNexus MEDIUM with expected NPC scaffold and campaign-new session processes only.
- Post-review fix `6c92c8c`: staged GitNexus HIGH aggregate because `useNewCampaignWizard` sits in critical new-campaign flows; direct impacts for `handleNextToDna` and `handleResuggestAll` were LOW with expected callers.
- Clean review artifact `56ac1a7`: staged GitNexus LOW, 1 docs file, 0 changed symbols, 0 affected processes.

## Residual Risk

- Tests prove deterministic prompt construction, route/frontend artifact transport, and known-IP dispatch behavior; they do not prove live LLM output quality.
- Prompt-injection-like fixture coverage verifies bounded prompt construction and source-usage framing only, not model jailbreak immunity.
- Generic character ingestion has no artifact-backed caller in Phase 72; future artifact-aware character creation needs a separate requirement and caller-chain proof.
