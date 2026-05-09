---
phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem
subsystem: worldgen
tags: [worldgen, research-artifact-v2, known-ip, authority-boundary, campaign-persistence]
requires:
  - phase: 70-reactive-scene-resolution-and-canonical-event-flow
    provides: prior world simulation/runtime dependency context
provides:
  - WorldgenResearchArtifactV2 shared contract, parser, normalizer, and formatter
  - compatibility-safe campaign persistence for v2 research artifacts
  - LLM-authored automatic known-IP research artifact generation
  - suggest/generate/regenerate route handoff and save-back for v2 artifacts
  - artifact-aware seed, premise, scaffold, regeneration, lore, and sufficiency prompts
  - full Phase 71 closeout verification and evidence-campaign preservation proof
affects: [worldgen, campaign-config, known-ip-research, scaffold-generation, lore-extraction]
tech-stack:
  added: []
  patterns:
    - LLM-authored semantic artifact with backend mechanical validation
    - legacy no-artifact compatibility branch
    - fail-closed prompt authority scans
key-files:
  created:
    - backend/src/worldgen/research-artifact.ts
    - backend/src/worldgen/__tests__/fixtures/jjk-naruto-artifact.ts
    - .planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-PHASE-START.txt
    - .planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-SUMMARY.md
  modified:
    - shared/src/types.ts
    - backend/src/campaign/manager.ts
    - backend/src/worldgen/ip-researcher.ts
    - backend/src/worldgen/research-frame.ts
    - backend/src/worldgen/scaffold-generator.ts
    - backend/src/worldgen/scaffold-resilience.ts
    - backend/src/worldgen/lore-extractor.ts
    - backend/src/worldgen/scaffold-steps/prompt-utils.ts
    - backend/src/worldgen/scaffold-steps/premise-step.ts
    - backend/src/routes/worldgen.ts
    - backend/src/routes/schemas.ts
    - .planning/phases/71-repair-worldgen-research-authority-boundary-so-llm-owns-prem/71-VALIDATION.md
key-decisions:
  - "WorldgenResearchUse remains a capped string so backend validates mechanics without owning source semantics."
  - "worldgenResearchArtifact is additive campaign config data, not a migration or silent repair of legacy ipContext/worldgenResearchFrame."
  - "researchWorldgenArtifact is the v2 automatic research entry point; legacy planning remains no-artifact compatibility only."
  - "Prompt consumers prefer WorldgenResearchArtifactV2 when present and gate legacy canonical-IP helpers to no-artifact compatibility flow."
  - "Closeout scope proof uses 71-PHASE-START.txt plus path-limited diffs because unrelated dirty files exist and GitNexus detect_changes is unavailable in the CLI."
patterns-established:
  - "Backend stores raw premise, validates artifact shape, executes searches, and forwards bounded artifact context; it does not classify canon/primary/overlay meaning."
  - "Route flows persist and reuse one v2 artifact instead of re-researching from raw premise when artifact context already exists."
  - "Legacy compatibility is explicit and test-covered, not hidden as automatic repair."
requirements-completed: [P71-R1, P71-R2, P71-R3, P71-R4, P71-R5]
duration: 1 day
completed: 2026-04-26
---

# Phase 71: Repair Worldgen Research Authority Boundary Summary

**LLM-authored v2 worldgen research artifacts now own premise/source interpretation while backend validates, stores, executes search, and forwards bounded context without canonicalizing mixed sources.**

## Performance

- **Duration:** 2026-04-26
- **Tasks:** 8 plans, 17 task commits plus per-plan metadata commits
- **Files modified:** worldgen contract, campaign config, research pipeline, route handlers, scaffold prompt surfaces, lore extraction, validation, roadmap, and state

## Accomplishments

- Added `WorldgenResearchArtifactV2` as the structured boundary for raw premise, source usage rules, search jobs, search results, context blocks, provenance, and generated research artifacts.
- Kept legacy `ipContext` and `worldgenResearchFrame` readable while preventing read-time mutation or silent repair of existing campaigns.
- Replaced automatic backend-owned franchise interpretation with an LLM-authored artifact brief/source plan; backend now executes capped source-specific searches mechanically.
- Wired suggest, generate, and regenerate routes to persist and pass v2 artifacts through automatic known-IP flows.
- Rewired seed, premise, scaffold, regeneration, validation, sufficiency enrichment, and lore extraction to consume artifact source usage rules when present.
- Closed the phase with focused/full backend regression evidence, backend typecheck, GitNexus impact/status/analyze proof, compare-anchor scope proof, and evidence-campaign no-diff proof.

## Requirement Evidence

- **P71-R1:** Direct/certain model responses cannot become backend canonical world subjects. Evidence: `research-artifact.test.ts`, `ip-researcher.test.ts`, v2 parser/formatter contract, and final no canonical-subject production scan.
- **P71-R2:** Likely/search-verified research preserves mixed source roles. Evidence: JJK world-basis plus Naruto power-system overlay fixtures, source-specific search job tests, and route/prompt propagation tests.
- **P71-R3:** Prompt-facing artifact formatting omits canonical-subject language. Evidence: artifact formatter tests, seed/premise/scaffold prompt tests, lore tests, and final forbidden-string scan.
- **P71-R4:** Worldgen suggest/generate/regenerate persist and pass v2 artifacts. Evidence: route tests for handoff, cached artifact reuse, enriched save-back, and no legacy semantic rebuild when artifact exists.
- **P71-R5:** Campaign config reads legacy research fields and writes optional v2 artifact without silent repair. Evidence: campaign manager tests and no-diff proof for `campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/config.json` plus `state.db`.

## Verification Matrix

- **Focused Phase 71 bundle:** `npm --prefix backend run test -- src/worldgen/__tests__/research-artifact.test.ts src/worldgen/__tests__/ip-researcher.test.ts src/routes/__tests__/worldgen.test.ts src/campaign/__tests__/manager.test.ts src/worldgen/__tests__/scaffold-resilience.test.ts src/worldgen/__tests__/seed-suggester.test.ts src/worldgen/__tests__/premise-divergence.test.ts src/worldgen/__tests__/npcs-step.test.ts src/worldgen/__tests__/lore-extractor.test.ts` -> 9 files passed, 190 tests passed.
- **Full backend suite:** `npm --prefix backend run test` -> 127 files passed, 3 skipped; 1641 tests passed, 30 todo.
- **Backend typecheck:** `npm --prefix backend run typecheck` -> `tsc --noEmit` exited 0.
- **Phase anchor:** `71-PHASE-START.txt` -> `2d4081336fc97d379334a638f3f6bf868002be92`; commit exists.
- **Forbidden prompt scan:** non-test scan across `backend/src/worldgen` and `backend/src/routes` found no forbidden authority/canonical strings.
- **Evidence campaign preservation:** `git diff -- campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/config.json campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/state.db` -> no output.
- **GitNexus:** impact analysis was run before edited symbols; `npx gitnexus analyze` completed after final code commit; `npx gitnexus status` reports the index up to date at `eb5b8e4`.

## GitNexus Scope Proof

- `gitnexus_detect_changes` was required by the plan but unavailable in the local CLI: `npx gitnexus detect_changes --repo WorldForge` returned `unknown command 'detect_changes'`.
- The closeout did not use all-worktree detection because unrelated dirty files existed before this plan.
- Scope proof used `71-PHASE-START.txt` as the compare anchor, plus path-limited `git diff` output from `2d4081336fc97d379334a638f3f6bf868002be92..HEAD`.
- The compare scope was limited to Phase 71 implementation and planning surfaces: worldgen, campaign config, route schemas/handlers/tests, shared types, and Phase 71 planning docs.
- Final Task 1 cleanup before commit was limited to 9 worldgen files, 38 insertions and 38 deletions, replacing legacy production prompt labels with neutral wording.

## Campaign Preservation Proof

The evidence campaign remained untouched by default:

- `campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/config.json` -> no diff.
- `campaigns/cc851187-f6fd-4e9e-9071-933cb056374b/state.db` -> no diff.
- No repair tool or migration command was run.

## Task Commits

- `f088093` - `docs(71-01): record phase start anchor`
- `196dd98` - `test(71-01): add failing research artifact regressions`
- `9cd64b3` - `feat(71-01): implement research artifact contract`
- `92f7f99` - `docs(71-01): complete research artifact contract plan`
- `5eb5eea` - `test(71-02): add campaign research artifact persistence regressions`
- `225363b` - `feat(71-02): persist worldgen research artifacts in campaign config`
- `ce5c620` - `docs(71-02): complete campaign research artifact persistence plan`
- `dc27cc6` - `test(71-03): add failing research artifact regressions`
- `ca4adae` - `feat(71-03): add LLM-authored research artifact pipeline`
- `4f0b693` - `docs(71-03): complete LLM-authored research pipeline plan`
- `5c35131` - `test(71-04): add route research artifact regressions`
- `dfcbf32` - `feat(71-04): wire worldgen routes to research artifacts`
- `11e0a98` - `docs(71-04): complete route research artifact wiring plan`
- `c0a9d4f` - `test(71-05): add seed and premise artifact prompt regressions`
- `0a602f2` - `feat(71-05): route seed and premise prompts through research artifacts`
- `f26862e` - `docs(71-05): complete seed premise artifact prompt plan`
- `85d42e7` - `test(71-06): add scaffold artifact prompt regressions`
- `0bcad4d` - `feat(71-06): route scaffold prompts through research artifacts`
- `fe3e94b` - `docs(71-06): complete scaffold artifact prompt plan`
- `9a01a9d` - `test(71-07): add artifact consumption regressions`
- `2a3a564` - `feat(71-07): wire artifact consumption through orchestration`
- `ffefc67` - `docs(71-07): complete artifact consumption plan`
- `eb5b8e4` - `fix(71-08): close prompt scan validation gate`

## Decisions Made

- `WorldgenResearchUse` is a capped string instead of a backend enum so backend validation stays mechanical and does not own source meaning.
- `worldgenResearchArtifact` is additive campaign config data and does not migrate, repair, or replace legacy fields on read.
- Automatic v2 known-IP research starts from an LLM-authored artifact brief and source plan; backend only executes searches/tool calls and validates caps.
- Prompt consumers use v2 artifact source usage rules whenever present; legacy canonical-IP helper branches are no-artifact compatibility only.
- Final production prompt scans include legacy no-artifact paths so authority-boundary vocabulary cannot re-enter through compatibility code.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Closed the production forbidden-string scan gap**
- **Found during:** Plan 71-08 Task 1.
- **Issue:** The required non-test scan found legacy production prompt labels and examples that still used canonical/franchise authority wording.
- **Fix:** Reworded legacy no-artifact production prompts to neutral `LEGACY IP REFERENCE` / selected-source wording and updated tests.
- **Verification:** Focused Phase 71 bundle, full backend suite, backend typecheck, and forbidden-string scan passed after the cleanup.
- **Commit:** `eb5b8e4`

## Issues Encountered

- GitNexus MCP tools were unavailable, and the local CLI lacks `detect_changes`; fallback evidence is explicitly recorded above.
- GitNexus `analyze` emitted Node listener warnings but exited successfully and refreshed the index.
- Existing unrelated dirty files remained in the worktree throughout closeout and were not staged or committed.
- `gsd-tools roadmap update-plan-progress 71` counted this phase-level summary as an extra plan summary, so the roadmap was corrected manually back to the real `8/8` plan count before verification.

## Known Stubs

None. Stub-pattern scan hits in modified worldgen files were normal accumulator arrays and a test name, not UI-rendered empty/mock data.

## Threat Flags

None. Phase 71 did not add auth paths, new network endpoints, new database schema boundaries, or file access outside the planned campaign config persistence and existing search/research flow.

## Residual Risk

- Live worldgen quality still depends on the model producing a useful source plan; tests prove the backend authority boundary and persistence behavior, not subjective prose quality.
- GitNexus detect-change proof is weaker than planned because the installed CLI lacks that command. The fallback is explicit and path-limited, but future closeouts should restore MCP/CLI parity.
- Legacy no-artifact compatibility remains by design. It is now neutralized in production prompt wording, but future edits should avoid reviving backend-owned canon labels.

## Next Phase Readiness

Phase 71 is complete. Later work can build on a single v2 artifact lane for premise/source interpretation, route handoff, scaffold prompting, regeneration, lore extraction, and sufficiency enrichment.

## Self-Check: PASSED

- `71-SUMMARY.md` exists.
- `71-08-SUMMARY.md` exists.
- Plan 71-08 task commit `eb5b8e4` exists in git history.
- Closeout verification command passed against `71-VALIDATION.md`, `71-SUMMARY.md`, `ROADMAP.md`, and `STATE.md`.
- Evidence campaign `cc851187-f6fd-4e9e-9071-933cb056374b` still has no config/state diff.
- `npx gitnexus status` reports the index up to date at `eb5b8e4` before the final metadata commit.

---
*Phase: 71-repair-worldgen-research-authority-boundary-so-llm-owns-prem*
*Completed: 2026-04-26*
