---
phase: 60
plan: 01
subsystem: character-ingestion-backend-pipeline
tags: [ingestion, scaffolding, schema, types, tdd]
one_liner: "Scaffold backend/src/character/ingestion/ with types, IngestionPipelineError, withPipelineRetry, extractor, classifier, and overrideText schema plumbing — foundation for plans 60-02/03/04."
dependency_graph:
  requires:
    - "@worldforge/shared types (CharacterDraft, IpResearchContext, PremiseDivergence, CharacterImportMode, Settings)"
    - "backend/src/ai/resolve-role-model.ts (ResolvedRole type)"
    - "backend/src/lib/index.ts (createLogger)"
  provides:
    - "IngestionInput discriminated union (parse/generate/research/import)"
    - "IngestionSources, IngestionClassification, IngestionContext types"
    - "IngestionPipelineError typed error class"
    - "withPipelineRetry exponential backoff wrapper"
    - "extractIngestionSources pure function"
    - "classifyCanonicalStatus pure function"
    - "overrideText field on all 4 character creation Zod schemas"
  affects:
    - "backend/src/routes/schemas.ts (characterRoleFields — additive only)"
tech-stack:
  added: []
  patterns:
    - "Discriminated union by `mode` literal — exhaustive switch in extractor"
    - "Fail-loud retry: throw IngestionPipelineError after maxAttempts, no silent defaults"
    - "Pure stage functions (no LLM/DB/IO in extractor/classifier) for trivial unit testing"
    - "Shared characterRoleFields spread for single-source schema plumbing"
key-files:
  created:
    - "backend/src/character/ingestion/types.ts"
    - "backend/src/character/ingestion/errors.ts"
    - "backend/src/character/ingestion/retry.ts"
    - "backend/src/character/ingestion/extractor.ts"
    - "backend/src/character/ingestion/classifier.ts"
    - "backend/src/character/ingestion/synthesizer.ts (stub for 60-02)"
    - "backend/src/character/ingestion/power-assessor.ts (stub for 60-03)"
    - "backend/src/character/ingestion/index.ts (barrel)"
    - "backend/src/character/ingestion/__tests__/extractor.test.ts (7 tests)"
    - "backend/src/character/ingestion/__tests__/classifier.test.ts (8 tests)"
    - "backend/src/character/ingestion/__tests__/fixtures/v2-gojo.json"
    - "backend/src/character/ingestion/__tests__/fixtures/v2-original-rogue.json"
    - ".planning/phases/60-character-ingestion-backend-pipeline/60-VALIDATION.md (populated)"
  modified:
    - "backend/src/routes/schemas.ts (characterRoleFields + overrideText)"
    - ".planning/REQUIREMENTS.md (P60-R1..P60-R9 block + traceability rows)"
    - ".planning/ROADMAP.md (Phase 60 requirements line + 4 plans)"
decisions:
  - "Single characterRoleFields spread for overrideText (vs per-schema add) — all 4 creation schemas inherit automatically; single source of truth"
  - "Pre-seed extractor.ts and classifier.ts as throwing stubs in Task 1 so index.ts barrel compiles — Tasks 2/3 replace with real logic (avoids circular commit ordering)"
  - "Fixtures include both canon (v2-gojo.json, JJK) and original (v2-original-rogue.json, no franchise) cards — covers both classifier branches in Task 3 and unblocks synthesizer/power-assessor tests in 60-02/03"
  - "PowerStats stub throws explicit plan-60-03 error instead of returning undefined — compliant with feedback_no_fallbacks_v2.md (no silent degradation)"
  - "Retry uses log.warn per attempt + throw on exhaustion — observable failure without hiding mid-pipeline flakiness"
metrics:
  duration: "~25 minutes"
  completed_date: "2026-04-17"
  task_count: 4
  test_count: 15
  typecheck_errors: 38
  typecheck_baseline: 38
  files_created: 13
  files_modified: 3
---

# Phase 60 Plan 01: Character Ingestion Foundation Summary

Scaffolded the `backend/src/character/ingestion/` directory — the foundation every subsequent Phase 60 plan (02 synthesizer, 03 power assessor, 04 route refactor) will build on. Defined the `IngestionInput` discriminated union, `IngestionPipelineError` typed error class, `withPipelineRetry` exponential-backoff wrapper (500ms × 2^(n-1), 3 attempts, no silent fallback), and two pure stages: `extractor.ts` (V2 card + free text → `IngestionSources`) and `classifier.ts` (IP context → `canonicalStatus`). Threaded `overrideText` through the shared `characterRoleFields` Zod spread so all four character-creation routes accept it without per-schema plumbing. Populated `60-VALIDATION.md` with the 13-row Nyquist-compliant verification matrix and appended `P60-R1..P60-R9` to `REQUIREMENTS.md` + `ROADMAP.md`.

## Tasks Completed

### Task 0 — Docs housekeeping
Appended `P60-R1..P60-R9` block to `REQUIREMENTS.md` under v1.1 (after Live Gameplay Quality, before v1.2+ candidates). Added 9 traceability table rows all marked `Planned`. Updated `ROADMAP.md` Phase 60 block: requirements line now enumerates IDs, plan count is `4 plans`, and plan stubs list 60-01 through 60-04 with one-line summaries. Overwrote `60-VALIDATION.md` with fully populated Nyquist-compliant validation strategy: Vitest framework config, 13-row per-task verification map (all 11 code tasks + 2 doc/infra tasks across plans 01–04), Wave 0 checklist, sign-off checkmarks, `nyquist_compliant: true`, `wave_0_complete: true`, `status: approved`.

- **Commit:** 78fbccf

### Task 1 — Types, errors, retry, stubs
Created 8 files in `backend/src/character/ingestion/`: `types.ts` (IngestionInput/Sources/Classification/Context/Stage + V2CardPayload + IngestionRole), `errors.ts` (IngestionPipelineError with readonly stage/attempts/cause), `retry.ts` (withPipelineRetry using `createLogger("ingestion-retry")` + exponential backoff), `synthesizer.ts` and `power-assessor.ts` (throwing stubs for plans 02/03), `extractor.ts` and `classifier.ts` (throwing stubs replaced in Tasks 2/3), `index.ts` (barrel). Typecheck held at 38 baseline — no new TS errors.

- **Commit:** e9e5411

### Task 2 — Extractor with fixtures and tests
Replaced `extractor.ts` stub with real `extractIngestionSources(input)` — pure function, no LLM/DB/IO, exhaustive switch over 4-branch discriminated union. `nullIfBlank` coerces undefined/whitespace `overrideText` to `null` (never empty string). Created two V2 card fixtures: `v2-gojo.json` (canon JJK character) and `v2-original-rogue.json` (no franchise). Wrote 7 Vitest tests covering each mode + whitespace trimming + empty-string coercion + original-card preservation. All 7 pass in 3ms.

- **Commit:** 9347c10

### Task 3 — Classifier + overrideText schema plumbing
Replaced `classifier.ts` stub with real `classifyCanonicalStatus(opts)` — maps `IngestionSources` + `ipContext` → `canonicalStatus` ∈ {original, imported, known_ip_canonical, known_ip_diverged}. Case-insensitive name matching via `nameMatches()`; `findNameInArchetype()` detects canonical names embedded inside research-mode archetype strings (e.g. "Gojo Satoru the strongest"). Excluded characters (from `ipContext.excludedCharacters`) downgrade known_ip_canonical → known_ip_diverged. Added `overrideText: z.string().trim().max(2000).optional()` to `characterRoleFields` in `backend/src/routes/schemas.ts` — all 4 creation schemas (parse/generate/research/importV2Card) inherit it automatically via their existing `...characterRoleFields` spread. Wrote 8 Vitest tests covering every branch. All 8 pass in 3ms. Typecheck still at 38 baseline.

- **Commit:** 4cec1df

## Verification

| Check | Result |
|-------|--------|
| `npm --prefix backend test -- src/character/ingestion/ --run` | **15/15 passed** (7 extractor + 8 classifier) |
| `npm --prefix backend run typecheck` error count | **38** (exactly at Phase 59 baseline — no regression) |
| `grep -q "overrideText:.*z\.string" backend/src/routes/schemas.ts` | **found** |
| `ls backend/src/character/ingestion/*.ts \| wc -l` | **8** (types, errors, retry, extractor, classifier, synthesizer, power-assessor, index) |
| `grep -q "P60-R1" .planning/REQUIREMENTS.md` | **found** |
| `grep -q "P60-R9" .planning/REQUIREMENTS.md` | **found** |
| `grep -q "nyquist_compliant: true" 60-VALIDATION.md` | **found** |
| Fixtures committed | **v2-gojo.json + v2-original-rogue.json** |

## Deviations from Plan

None — plan executed exactly as written. No architectural changes, no auto-fixes required. Task 1 included pre-seeded throwing stubs for `extractor.ts`/`classifier.ts` per the plan's explicit note about commit ordering; this is planned behavior, not a deviation.

## Downstream Contracts Established

Plans 60-02/03/04 MUST consume these without redefinition:

- `IngestionInput` discriminated union — the only accepted input shape for the pipeline
- `IngestionSources`, `IngestionClassification`, `IngestionContext` — stage contracts
- `IngestionPipelineError` — the ONLY error type throwable from the pipeline after retry exhaustion
- `withPipelineRetry(stage, fn, { maxAttempts? })` — every LLM/IO call inside the pipeline must wrap through this helper
- `extractIngestionSources(input)` — Stage 1 entry
- `classifyCanonicalStatus(opts)` — Stage 2 entry
- `overrideText` field — wire-accepted by routes; synthesizer (60-02) and assessor (60-03) must honor PRIORITY 1

## Self-Check: PASSED

Verified:
- All 13 created files exist on disk
- All 4 commits (78fbccf, e9e5411, 9347c10, 4cec1df) present in `git log`
- 15/15 ingestion unit tests pass
- Typecheck at 38 baseline (no regression)
- REQUIREMENTS.md contains P60-R1..P60-R9
- ROADMAP.md Phase 60 block updated
- 60-VALIDATION.md `nyquist_compliant: true`
