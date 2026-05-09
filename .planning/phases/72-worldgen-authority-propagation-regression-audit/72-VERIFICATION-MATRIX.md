---
phase: 72-worldgen-authority-propagation-regression-audit
plan: 72-05
created: 2026-04-26
scope: final-verification-matrix
---

# Phase 72 Verification Matrix

Phase 72 closeout evidence for worldgen research artifact authority propagation. This is automated regression evidence only; it does not claim live subjective worldgen quality was tested.

## Command Results

| ID | Command | Exit | Result |
| --- | --- | ---: | --- |
| V72-C1 | `npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/ip-researcher.test.ts src/routes/__tests__/schemas.test.ts src/routes/__tests__/worldgen.test.ts` | 0 | PASS: 4 files, 302 tests passed. |
| V72-C2 | `npm --prefix backend run test -- src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/lore-extractor.test.ts src/worldgen/__tests__/npcs-step.test.ts src/character/__tests__/enrich-npc-batch.test.ts src/character/ingestion/__tests__/power-assessor.test.ts` | 0 | PASS: 6 files, 85 tests passed. |
| V72-C3 | `npm --prefix backend run test -- src/character/ingestion/__tests__/classifier.test.ts src/character/ingestion/__tests__/pipeline.test.ts src/campaign/__tests__/manager.test.ts` | 0 | PASS: 3 files, 54 tests passed. |
| V72-C4 | `npm --prefix frontend run test -- --run lib/__tests__/api.test.ts components/title/__tests__/use-new-campaign-wizard.test.tsx lib/__tests__/character-drafts.test.ts components/world-review/__tests__/npcs-section.test.tsx` | 0 | PASS: 4 files, 54 tests passed; npm emitted a `--run` parsing warning but Vitest executed the requested files and exited 0. |
| V72-C5 | `npm --prefix backend run test` | 0 | PASS: 128 test files passed, 3 skipped; 1670 tests passed, 30 todo. |
| V72-C6 | `npm --prefix backend run typecheck` | 0 | PASS: backend `tsc --noEmit` completed. |
| V72-C7 | `npm --prefix frontend run typecheck` | 0 | PASS: shared build and frontend `tsc --noEmit -p tsconfig.typecheck.json` completed. |
| V72-C8 | `npm --prefix backend run test -- src/worldgen/__tests__/npcs-step.test.ts` | 0 | PASS: 1 file, 21 tests passed after the review fix that strips stale legacy `premiseDivergence` from artifact-backed NPC dispatch. |
| V72-C9 | `npm --prefix frontend run test -- --run components/title/__tests__/use-new-campaign-wizard.test.tsx` | 0 | PASS: 1 file, 7 tests passed after the stale hidden-authority-context regression was added. |
| V72-C10 | `npm --prefix frontend run test -- --run lib/__tests__/api.test.ts components/title/__tests__/use-new-campaign-wizard.test.tsx lib/__tests__/character-drafts.test.ts components/world-review/__tests__/npcs-section.test.tsx components/campaign-new/__tests__/flow-provider.test.tsx` | 0 | PASS: 5 files, 57 tests passed; npm emitted the known `--run` parsing warning but Vitest executed the requested files and exited 0. |
| V72-C11 | `gsd-code-reviewer` standard review after `6c92c8c` | 0 | PASS: `72-REVIEW.md` status `clean`, 23 files reviewed, 0 findings; reviewer also ran backend scope 370 tests and frontend scope 48 tests. |

## Invariant Evidence

| Requirement | Alias | Commands | Exact Test Files | Evidence |
| --- | --- | --- | --- | --- |
| P72-R1 | INV-72-01 | V72-C2, V72-C5 | `src/worldgen/__tests__/seed-suggester.test.ts`; `src/worldgen/__tests__/scaffold-resilience.test.ts`; `src/worldgen/__tests__/lore-extractor.test.ts`; `src/worldgen/__tests__/npcs-step.test.ts` | Artifact-present seed, scaffold, lore, and NPC tests pass while asserting artifact source rules own prompt context and stale legacy `ipContext`/canonical-list text does not own semantic decisions. |
| P72-R2 | INV-72-02 | V72-C1, V72-C5 | `src/worldgen/__tests__/research-artifact.test.ts`; `src/worldgen/__tests__/ip-researcher.test.ts`; `src/routes/__tests__/schemas.test.ts` | Provider `jobId`, `title`, `description`, and `url` overflow coverage stays green, proving external search payloads are capped before strict artifact parsing or prompt use. |
| P72-R3 | INV-72-03 | V72-C2, V72-C5 | `src/worldgen/__tests__/seed-suggester.test.ts`; `src/worldgen/__tests__/scaffold-resilience.test.ts`; `src/worldgen/__tests__/lore-extractor.test.ts`; `src/worldgen/__tests__/npcs-step.test.ts` | Mixed-premise prompt tests keep Jujutsu Kaisen as `world_basis` and exclude Naruto setting/cast fragments such as `Five Great Nations` and `Hidden Mist Village` from artifact-backed world prompts. |
| P72-R4 | INV-72-04 | V72-C2, V72-C5, V72-C8 | `src/worldgen/__tests__/npcs-step.test.ts`; `src/character/__tests__/enrich-npc-batch.test.ts`; `src/character/ingestion/__tests__/power-assessor.test.ts` | NPC dispatch tests pass with `Satoru Gojo` routed as `known_ip_canonical` with franchise `Jujutsu Kaisen`, while supporting/original NPCs remain `original`; artifact-backed NPC dispatch also strips stale legacy `ipContext` and `premiseDivergence` before prompt and power-assessment classification. |
| P72-R5 | INV-72-05 | V72-C1, V72-C3, V72-C5 | `src/routes/__tests__/worldgen.test.ts`; `src/campaign/__tests__/manager.test.ts`; `src/routes/__tests__/schemas.test.ts` | Route and campaign tests pass for nullable request artifacts, stored artifact precedence, regenerate/save-edits artifact handoff, and strict request schema handling. |
| P72-R6 | INV-72-06 | V72-C4, V72-C7, V72-C9, V72-C10 | `lib/__tests__/api.test.ts`; `components/title/__tests__/use-new-campaign-wizard.test.tsx`; `components/campaign-new/__tests__/flow-provider.test.tsx` | Frontend API and wizard tests pass while preserving `_researchArtifact` from seed suggestion into single-seed reroll, session remount, and world generation request bodies; full seed suggestions now replace all hidden authority context fields so `null` clears stale legacy state. |
| P72-R7 | INV-72-07 | V72-C4, V72-C7 | `lib/__tests__/character-drafts.test.ts`; `components/world-review/__tests__/npcs-section.test.tsx` | Review/draft conversion tests pass while preserving backend known-IP canonical NPC identity and keeping default-original behavior only for truly empty/new NPC drafts. |

## Mixed-Premise Direct Proof

| Case | Commands | Exact Test Files | Evidence |
| --- | --- | --- | --- |
| JJK world with Naruto power system | V72-C1, V72-C2, V72-C4, V72-C5 | `src/worldgen/__tests__/research-artifact.test.ts`; `src/worldgen/__tests__/ip-researcher.test.ts`; `src/worldgen/__tests__/seed-suggester.test.ts`; `src/worldgen/__tests__/scaffold-resilience.test.ts`; `src/worldgen/__tests__/npcs-step.test.ts`; `lib/__tests__/api.test.ts`; `components/title/__tests__/use-new-campaign-wizard.test.tsx`; `lib/__tests__/character-drafts.test.ts` | The shared mixed-premise fixture keeps `Satoru Gojo` in the Jujutsu Kaisen known-IP canon path, and Naruto remains a `Naruto power-system` / mechanics overlay via source usage rules rather than backend-owned canonical world construction. |

## Security Caveat

| Caveat | Commands | Exact Test Files | Evidence |
| --- | --- | --- | --- |
| Prompt-injection-like fixture scope | V72-C2, V72-C5 | `src/worldgen/__tests__/seed-suggester.test.ts`; `src/worldgen/__tests__/research-artifact.test.ts` | Prompt-injection-like fixture tests verify bounded prompt construction and source-usage framing only; they do not prove model jailbreak immunity. |

## Post-Review Regression Evidence

| Case | Commands | Evidence |
| --- | --- | --- |
| Artifact-backed NPC stale legacy context | V72-C8, V72-C6 | `npcs-step.test.ts` covers a stale legacy `premiseDivergence` that tries to remove Gojo from the present cast; artifact-backed NPC dispatch still classifies Gojo as `known_ip_canonical`, passes `premiseDivergence: null` into power assessment, and keeps stale directives out of prompts. |
| Campaign-new session artifact persistence | V72-C9, V72-C10, V72-C7 | Wizard/provider tests cover restored sessions carrying `researchArtifact` into `generateWorld` and provider remounts preserving `researchArtifact` in the saved campaign-new session. |
| Full seed-suggest authority replacement | V72-C9, V72-C10, V72-C7 | Wizard tests cover a legacy `_ipContext` / `_premiseDivergence` response followed by a fresh null-context response; `generateWorld` receives `null, null, null`, proving old hidden authority does not leak forward. |
| Code review gate | V72-C11 | Final `72-REVIEW.md` is clean with `critical: 0`, `warning: 0`, `info: 0`, `total: 0`. |

## Negative Scans

| Scan | Command | Exit | Result | Disposition |
| --- | --- | ---: | --- | --- |
| NS-1 | `rg -n "Canonical subject|FRANCHISE REFERENCE|Build the canonical world|This world is the Naruto universe|Five Great Nations|Hidden Mist Village|Hidden Cloud Village|Mizukage|Raikage|Hashirama|Tobirama" backend/src/worldgen backend/src/routes --glob '!**/__tests__/**' --glob '!**/test-fixtures/**'` | 1 | PASS: no production matches outside tests/fixtures. | allowed: empty result proves forbidden canonicalization prompt strings are absent from production `backend/src/worldgen` and `backend/src/routes`. |
| NS-2 | `rg -n '_researchArtifact|worldgenResearchArtifact|canonicalStatus: "original"|classifyCanonicalStatus\(' backend/src frontend shared/src` | 0 | PASS with expected matches. The first double-quoted PowerShell attempt returned rg parse exit 2, then the single-quoted equivalent passed with the intended regex. | allowed: see expected-match semantics below; no follow-up required. |
| NS-3 | `rg -n "researchArtifact" frontend backend/src/routes backend/src/worldgen backend/src/character -g "*.ts" -g "*.tsx"` | 0 | PASS with expected route/worldgen/frontend/test matches. | allowed: `researchArtifact` appears in artifact transport, route schemas/handoff, worldgen consumers, and tests; no generic character ingestion production consumer appeared. |

### NS-2 Expected-Match Semantics

| Pattern | Expected Semantics | Observed Disposition |
| --- | --- | --- |
| `_researchArtifact` | Allowed in backend worldgen route/tests and Phase 72 frontend API/wizard transport implementation/tests. | allowed: matches in `backend/src/routes/worldgen.ts`, `backend/src/routes/__tests__/worldgen.test.ts`, `frontend/lib/api.ts`, and `frontend/components/title/*`. |
| `worldgenResearchArtifact` | Allowed in campaign config/persistence, route handoff/schema, worldgen artifact consumers, tests, and planning docs. | allowed: matches in `backend/src/campaign/manager.ts`, `backend/src/campaign/__tests__/manager.test.ts`, `backend/src/routes/schemas.ts`, and `backend/src/worldgen/*` schema/export files. |
| `canonicalStatus: "original"` | Allowed in original/no-artifact fixtures, blank NPC defaults, and explicit original-behavior regressions; not allowed for the artifact-backed Gojo known-IP path. | allowed: production matches are original/default branches such as `npcs-step.ts` and `character-drafts.ts`; tests prove Gojo remains `known_ip_canonical`. |
| `classifyCanonicalStatus(` | Allowed in generic ingestion implementation/tests and the Phase 72 adjacency note; if it appears in artifact-backed worldgen flow, it needs tests or a fix. | allowed: matches in `backend/src/character/ingestion/classifier.ts`, `pipeline.ts`, and classifier tests only; generic ingestion remains explicitly deferred. |

## GitNexus Scope Proof

| Proof | Command | Result | Disposition |
| --- | --- | --- | --- |
| MCP all-scope | `gitnexus_detect_changes({ scope: "all", repo: "WorldForge" })` | HIGH/noisy: 36 changed indexed symbols, 27 changed files, 15 affected processes. | unrelated dirty tail: changed symbols were in pre-existing backend character/engine/routes/scripts/worldbook files outside 72-05 owned docs. No plan-owned production/test symbol changes. |
| GitNexus status fallback | `npx gitnexus status` | Indexed commit `cc2bdc7`; current commit `54d0868`; stale after Task 1 docs commit. | recorded: stale status is caused by docs-only closeout commit after pre-flight up-to-date proof; source scope uses staged-only proof before docs commits. |
| Diff fallback | `git diff --name-only`; `git diff --stat` | 41 dirty files, 1870 insertions, 2969 deletions, including unrelated backend/source/mockup/package-lock tail. | unrelated dirty tail: none of these files are 72-05 owned docs; they were not staged or committed. |
| Cached fallback | `git diff --cached --name-only` | empty before Task 2 docs staging. | clean index confirmed before writing/staging Task 2 closeout docs. |
| MCP staged-only | `gitnexus_detect_changes({ scope: "staged", repo: "WorldForge" })` after staging only `72-VERIFICATION-MATRIX.md` and `72-SUMMARY.md` | LOW: 2 changed files, 0 changed symbols, 0 affected processes. | expected scope: docs-only Task 2 closeout commit. |
| Post-review fix scope 1 | `gitnexus_detect_changes({ scope: "staged", repo: "WorldForge" })` before `4596476` | MEDIUM: expected NPC scaffold and campaign-new wizard/session processes only. | accepted: fixed current review warnings by nulling stale legacy context in artifact-backed NPC dispatch and persisting session `researchArtifact`. |
| Post-review fix scope 2 | `gitnexus_detect_changes({ scope: "staged", repo: "WorldForge" })` before `6c92c8c`; plus `gitnexus_impact` for `handleNextToDna` and `handleResuggestAll` | HIGH aggregate because the wizard participates in critical new-campaign flows; direct handler impacts were LOW with expected callers `NewCampaignDialog`, `CampaignConceptPage`, and `DnaWorkspace`. | accepted: the change is scoped to replacing hidden authority context after full seed suggestions and is covered by the new stale-context regression plus frontend typecheck. |
| Clean review artifact scope | `gitnexus_detect_changes({ scope: "staged", repo: "WorldForge" })` before `56ac1a7` | LOW: 1 docs file, 0 changed symbols, 0 affected processes. | expected scope: clean `72-REVIEW.md` report only. |
