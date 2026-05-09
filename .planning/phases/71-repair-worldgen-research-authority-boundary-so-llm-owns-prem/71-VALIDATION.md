---
phase: 71
slug: repair-worldgen-research-authority-boundary-so-llm-owns-prem
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-26
---

# Phase 71 - Validation Strategy

Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest via backend package |
| **Config file** | `backend/vitest.config.ts` |
| **Quick run command** | `npm --prefix backend run test -- src/worldgen/__tests__/ip-researcher.test.ts` |
| **Full suite command** | `npm --prefix backend run test` |
| **Typecheck command** | `npm --prefix backend run typecheck` |
| **Estimated runtime** | Focused tests under 20s; full backend suite several minutes |

---

## Sampling Rate

- **After every task commit:** run the task's focused Vitest target plus `npm --prefix backend run typecheck`.
- **After every plan wave:** run `npm --prefix backend run test` plus `npm --prefix backend run typecheck`.
- **Before `$gsd-verify-work`:** backend tests and typecheck must be green.
- **Max feedback latency:** no more than one task commit between automated checks.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 71-01-00 | 01 | 0 | P71-R1/P71-R3/P71-R5 | T-71-08-01 | Record `git rev-parse HEAD` in `71-PHASE-START.txt` so final compare-mode GitNexus verification has a stable baseline. | metadata | `powershell -NoProfile -Command "$p='.planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-PHASE-START.txt'; git rev-parse HEAD \| Set-Content -NoNewline $p; if ((Get-Content -Raw $p) -notmatch '^[0-9a-f]{40}$') { exit 1 }"` | no - Wave 0 creates | green |
| 71-01-01 | 01 | 0 | P71-R1/P71-R3 | T-71-01-01/T-71-01-02/T-71-01-03 | Artifact schema and formatter tests fail first, proving v2 artifact shape, exact caps, prompt-injection-as-data handling, shared JJK/Naruto fixture export, source usage rendering, and no backend-owned canonical-subject wording. | unit | `npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts` | no - Wave 0 creates | green |
| 71-01-02 | 01 | 0 | P71-R1/P71-R3 | T-71-01-01/T-71-01-03/T-71-01-04 | Shared type, parser, normalizer, and formatter validate mechanics only and preserve LLM-authored source roles exactly. | unit/typecheck | `npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts`; `npm --prefix backend run typecheck` | mixed - create/extend | green |
| 71-02-01 | 02 | 1 | P71-R5 | T-71-02-01/T-71-02-04 | Campaign tests fail first for v2 artifact persistence, legacy compatibility, and no read-time mutation. | unit | `npm --prefix backend run test -- src/campaign/__tests__/manager.test.ts` | yes - extend | green |
| 71-02-02 | 02 | 1 | P71-R5 | T-71-02-01/T-71-02-02/T-71-02-04 | Config helpers save/load v2 artifact beside legacy fields without migration, backfill, or silent repair. | unit/typecheck | `npm --prefix backend run test -- src/campaign/__tests__/manager.test.ts`; `npm --prefix backend run typecheck` | yes - extend | green |
| 71-03-01 | 03 | 1 | P71-R1/P71-R2 | T-71-03-01/T-71-03-04 | Direct/certain and likely/search mixed JJK/Naruto tests prove artifact roles/search jobs replace backend canonical franchise authority. | unit | `npm --prefix backend run test -- src/worldgen/__tests__/ip-researcher.test.ts` | yes - extend | green |
| 71-03-02 | 03 | 1 | P71-R1/P71-R2 | T-71-03-01/T-71-03-02/T-71-03-03/T-71-03-04 | Research pipeline asks LLM for brief/search jobs, executes jobs mechanically, records provenance, and never infers primary/overlay meaning. | unit/typecheck | `npm --prefix backend run test -- src/worldgen/__tests__/ip-researcher.test.ts`; `npm --prefix backend run typecheck` | yes - modify | green |
| 71-04-01 | 04 | 2 | P71-R4/P71-R5 | T-71-04-01/T-71-04-02/T-71-04-03 | Route tests fail first for artifact handoff/persistence across suggest, generate, and regenerate while preserving legacy flows. | route unit | `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts` | yes - extend | green |
| 71-04-02 | 04 | 2 | P71-R4/P71-R5 | T-71-04-01/T-71-04-02/T-71-04-03/T-71-04-04 | Route schemas and handlers accept/load/save v2 artifacts and stop rebuilding semantic frames from legacy `ipContext.franchise` when artifact exists. | route unit/typecheck | `npm --prefix backend run test -- src/routes/__tests__/worldgen.test.ts`; `npm --prefix backend run typecheck` | yes - modify | green |
| 71-05-01 | 05 | 3 | P71-R3/P71-R4 | T-71-05-01/T-71-05-02/T-71-05-03 | Seed and premise prompt tests fail first when v2 artifact blocks omit source rules, reintroduce canonical franchise wording, change legacy no-artifact prompt goldens, or crash with null `ipContext`. | unit | `npm --prefix backend run test -- src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/premise-divergence.test.ts src/worldgen/__tests__/research-artifact.test.ts` | yes/mixed - extend | green |
| 71-05-02 | 05 | 3 | P71-R3/P71-R4 | T-71-05-01/T-71-05-02/T-71-05-03/T-71-05-04 | Prompt helper and seed/premise consumers render bounded artifact source usage rules while keeping legacy formatter byte-stable for old/manual context. | unit/typecheck | `npm --prefix backend run test -- src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/premise-divergence.test.ts src/worldgen/__tests__/research-artifact.test.ts`; `npm --prefix backend run typecheck` | yes - modify | green |
| 71-06-01 | 06 | 4 | P71-R3/P71-R4 | T-71-06-01/T-71-06-02 | Scaffold prompt leakage tests fail first if locations/factions/NPC steps pull Naruto world-structure terms from a power-system overlay artifact or change legacy no-artifact prompt goldens. | unit/integration | `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/npcs-step.test.ts` | yes - extend | green |
| 71-06-02 | 06 | 4 | P71-R3/P71-R4 | T-71-06-01/T-71-06-02/T-71-06-03/T-71-06-04 | Locations, factions, and NPC prompts use artifact source rules for v2 flow and gate legacy branches on artifact absence. | unit/integration/typecheck | `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/npcs-step.test.ts`; `npm --prefix backend run typecheck` | yes - modify | green |
| 71-07-01 | 07 | 5 | P71-R3/P71-R4 | T-71-07-01/T-71-07-02/T-71-07-04 | Regenerate, validation, lore, and route tests fail first when artifact rules are not consumed, source/category lore alignment is wrong, legacy sufficiency is called for v2 artifacts, or enriched artifacts are not saved back. | unit/route unit | `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/lore-extractor.test.ts src/routes/__tests__/worldgen.test.ts` | yes - extend | green |
| 71-07-02 | 07 | 5 | P71-R3/P71-R4 | T-71-07-01/T-71-07-02/T-71-07-03/T-71-07-04 | Scaffold orchestration, regen helpers, lore extraction, and sufficiency enrichment prefer artifact rules, gate legacy search-prefix helpers, and persist one enriched v2 artifact field. | unit/route unit/typecheck | `npm --prefix backend run test -- src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/lore-extractor.test.ts src/routes/__tests__/worldgen.test.ts`; `npm --prefix backend run typecheck` | yes - modify | green |
| 71-08-01 | 08 | 6 | P71-R1/P71-R2/P71-R3/P71-R4/P71-R5 | T-71-08-01/T-71-08-02/T-71-08-03 | Final closeout records focused/full test evidence, fail-closed non-test forbidden-string scan, `71-PHASE-START.txt` compare anchor, staged-or-compare GitNexus scope proof, and evidence-campaign no-diff check. | suite/typecheck/scope | `npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/ip-researcher.test.ts src/routes/__tests__/worldgen.test.ts src/campaign/__tests__/manager.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/premise-divergence.test.ts src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/lore-extractor.test.ts`; `npm --prefix backend run test`; `npm --prefix backend run typecheck` | yes | green |
| 71-08-02 | 08 | 6 | P71-R1/P71-R2/P71-R3/P71-R4/P71-R5 | T-71-08-01/T-71-08-02 | Validation, summary, roadmap, and state close only after all automated verification is green and requirement evidence covers P71-R1 through P71-R5. | docs/scope | `powershell -NoProfile -Command '$phase=".planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem"; $summaryPath=Join-Path $phase "71-SUMMARY.md"; $validationPath=Join-Path $phase "71-VALIDATION.md"; if (!(Test-Path -LiteralPath $summaryPath)) { throw "Missing 71-SUMMARY.md" }; if (!(Test-Path -LiteralPath $validationPath)) { throw "Missing 71-VALIDATION.md" }; $summary=Get-Content -Raw -LiteralPath $summaryPath; $validation=Get-Content -Raw -LiteralPath $validationPath; $rows=$validation -split "\r?\n" | Where-Object { $_ -match "^\|\s*71-" }; $openRows=$rows | Where-Object { $_ -match "\|\s*(pending|incomplete|red|flaky|todo|missing|blocked|open)\s*\|\s*$" }; if ($openRows) { $openRows | ForEach-Object { Write-Error $_ }; throw "71-VALIDATION.md still has pending/incomplete task status rows" }; foreach ($req in @("P71-R1","P71-R2","P71-R3","P71-R4","P71-R5")) { $validationEvidence=$validation -split "\r?\n" | Where-Object { $_ -match $req -and $_ -match "(green|pass|passed|verified|evidence|GitNexus|typecheck|test|no-diff)" -and $_ -notmatch "(pending|incomplete|todo|missing|TBD)" }; if (!$validationEvidence) { throw "Missing green validation evidence for $req" }; $summaryEvidence=$summary -split "\r?\n" | Where-Object { $_ -match $req -and $_ -notmatch "(pending|incomplete|todo|missing|TBD)" }; if (!$summaryEvidence) { throw "Missing 71-SUMMARY.md evidence for $req" } }; $roadmap=Get-Content -Raw -LiteralPath ".planning/ROADMAP.md"; $state=Get-Content -Raw -LiteralPath ".planning/STATE.md"; if ($roadmap -notmatch "\[x\]\s+71-08-PLAN\.md" -or $roadmap -notmatch "(?s)Phase 71:.*(completed|complete|COMPLETE|executed)") { throw "ROADMAP.md does not mark Phase 71 complete after green tests/docs" }; if ($state -notmatch "Phase:\s*71" -or $state -notmatch "(completed|complete|COMPLETE|executed)" -or $state -match "Plan:\s*[0-7]\s+of\s+8") { throw "STATE.md does not mark Phase 71 complete after green tests/docs" }'` | yes - update/create | green |

*Status: pending / green / red / flaky*

---

## Closeout Evidence

**Task 71-08-01 final automated evidence:** green on 2026-04-26.

- Focused Phase 71 regression bundle passed: `npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/ip-researcher.test.ts src/routes/__tests__/worldgen.test.ts src/campaign/__tests__/manager.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/premise-divergence.test.ts src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/lore-extractor.test.ts` -> 9 files passed, 190 tests passed, duration 1.33s.
- Full backend suite passed: `npm --prefix backend run test` -> 127 files passed, 3 skipped; 1641 tests passed, 30 todo; duration 5.83s.
- Backend typecheck passed: `npm --prefix backend run typecheck` -> `tsc --noEmit` exited 0.
- Phase-start anchor verified: `71-PHASE-START.txt` contains `2d4081336fc97d379334a638f3f6bf868002be92`; `git cat-file -e "2d4081336fc97d379334a638f3f6bf868002be92^{commit}"` exited 0.
- Fail-closed non-test forbidden prompt scan passed after Rule 2 closeout cleanup: `rg -n --glob '!**/__tests__/**' --glob '!**/*.test.ts' --glob '!**/test-fixtures/**' 'Canonical subject|FRANCHISE REFERENCE|Build the canonical world|This world is the Naruto universe|Five Great Nations|Hidden Mist Village|Hidden Cloud Village|Mizukage|Raikage|Hashirama|Tobirama' backend/src/worldgen backend/src/routes` -> no matches.
- Evidence campaign preservation passed: `git diff -- campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/config.json campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/state.db` -> no output.
- Dirty baseline recorded with unrelated pre-existing worktree changes present. Phase 71 closeout touched only the listed worldgen prompt/test files and planning docs; unrelated dirty files remain unstaged.
- GitNexus status before closeout commit: `npx gitnexus status` -> repository up to date at `ffefc67`.
- GitNexus `detect_changes` command unavailable in this CLI: `npx gitnexus detect_changes --repo WorldForge` -> `unknown command 'detect_changes'`. Scope proof used compare-mode anchor plus GitNexus `impact/context/status` CLI commands and explicit path-limited git diffs.
- Compare-mode scope from `2d4081336fc97d379334a638f3f6bf868002be92..HEAD` was limited to Phase 71 worldgen/campaign/route/shared implementation files from plans 71-01 through 71-07.
- Closeout cleanup scope before commit: 9 files, 38 insertions and 38 deletions in `backend/src/worldgen` only, replacing legacy production prompt labels with neutral `LEGACY IP REFERENCE` wording and updating tests.
- GitNexus impact for closeout cleanup: `buildIpContextBlock` HIGH risk (17 impacted, 4 processes), `buildKnownIpGenerationContract` HIGH risk (12 impacted, 4 processes), `buildWorldgenResearchContextBlock` HIGH risk (16 impacted, 4 processes), `buildWorldgenResearchFrameBlock` LOW risk, `buildResearchArtifactBriefPrompt` LOW risk, `generateRefinedPremiseStep` LOW risk. Full focused/full backend verification passed after the cleanup.

**Requirement evidence:** P71-R1 green/pass via direct/certain v2 research tests and artifact parser/formatter tests; P71-R2 green/pass via mixed JJK world-basis plus Naruto power-overlay search/job tests; P71-R3 green/pass via artifact prompt tests and final forbidden-string scan; P71-R4 green/pass via suggest/generate/regenerate route handoff and save-back tests; P71-R5 green/pass via campaign persistence tests and evidence-campaign no-diff proof.

---

## Threat Model

| Ref | Threat | Risk | Required Mitigation |
|-----|--------|------|---------------------|
| T71-01 | Prompt/search artifact injection through user premise, known-IP text, or search snippets | high | Treat premise/results as data in structured prompts; validate v2 artifact with Zod; cap strings/arrays; never let backend infer hidden semantics from free text. |
| T71-02 | Semantic authority drift where one LLM string becomes backend-owned canon again | high | Tests must assert source usage roles/search jobs/prompt text, not only `franchise` string equality. |
| T71-03 | Stored-data compatibility break or silent rewrite of existing campaigns | medium | Add read-compatible legacy adapter and tests; do not mutate existing campaign configs except through explicit new writes. |

---

## Wave 0 Requirements

- [x] Plan 71-01 Task 0 creates `71-PHASE-START.txt` before production implementation.
- [x] Plan 71-01 Task 1 creates `backend/src/worldgen/__tests__/research-artifact.test.ts` before production implementation.
- [x] Plan 71-01 Task 1 exports `backend/src/worldgen/__tests__/fixtures/jjk-naruto-artifact.ts` so downstream route/campaign tests can reuse it without duplication.
- [x] Plan 71-01 Task 1 locks the JJK world-basis / Naruto power-overlay artifact boundary before Plan 71-03 expands `ip-researcher.test.ts`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Existing bad campaign remains untouched by default | P71-R5 | Silent repair is forbidden; automated tests can cover config helpers, but this specific campaign should remain evidence unless explicitly repaired. | Confirm `campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/config.json` is not modified by Phase 71 execution unless an opt-in repair plan is explicitly added and run. |

---

## Validation Sign-Off

- [x] All tasks have automated verify or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing references.
- [x] No watch-mode flags.
- [x] Feedback latency <= one task commit.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** green - automated closeout passed 2026-04-26
