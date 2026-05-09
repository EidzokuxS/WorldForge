---
phase: 60
plan: 03
subsystem: character-ingestion-backend-pipeline
tags: [ingestion, power-stats, vs-battles, canon-vs-original, llm-only, dispatcher, tdd]
one_liner: "Stage 4 PowerStats assessment with canonicalStatus dispatcher — canon branch reuses enrichKnownIpWorldgenNpcDraft (web search + VS Battles + overrideText); original branch runs LLM-only inference from draft + card + override with Human/Street defaults and literal 'Do not inflate tiers' grounding."
dependency_graph:
  requires:
    - "backend/src/character/known-ip-worldgen-research.ts (enrichKnownIpWorldgenNpcDraft — now extended with overrideText + 8 utilities promoted to exports in this plan)"
    - "backend/src/character/ingestion/types.ts (IngestionSources, IngestionClassification, IngestionContext from 60-01)"
    - "backend/src/character/ingestion/retry.ts (withPipelineRetry from 60-01)"
    - "backend/src/character/ingestion/errors.ts (IngestionPipelineError from 60-01)"
    - "@worldforge/shared (CharacterDraft, PowerStats, AP_DURABILITY_TIERS, SPEED_TIERS, INTELLIGENCE_TIERS)"
  provides:
    - "assessPowerStats({draft, sources, classification, researchDigest, ctx}) → Promise<CharacterDraft> — Stage 4 dispatcher"
    - "assessOriginalCharacterPowerStats({draft, cardText?, overrideText?, role, premise}) → LLM-only original-character PowerStats"
    - "enrichKnownIpWorldgenNpcDraft extended: optional overrideText parameter threaded into both the initial assessment prompt and the repair loop"
    - "known-ip-worldgen-research.ts 9 public exports (was 1): loosePowerStatsSchema, recordFromUnknown, describeZodIssues, AP_DUR_TIER_LIST, SPEED_TIER_LIST, INTELLIGENCE_TIER_LIST, normalizeLlmPowerStats, repairPowerStats, enrichKnownIpWorldgenNpcDraft"
    - "Fixtures: draft-rogue.json (original), draft-gojo.json (canon) — shared across power-assessor + future plan tests"
  affects:
    - "Plan 60-04 (route refactor) — will call assessPowerStats as the Stage 4 step after Stage 3 synthesis; route layer never reimplements power inference"
    - "worldgen/scaffold-steps/npcs-step.ts — still calls enrichKnownIpWorldgenNpcDraft without overrideText (backward compatible; optional parameter)"
tech-stack:
  added: []
  patterns:
    - "canonicalStatus dispatcher — status values partition Stage 4 into two branches (canon, original) without a shared prompt body"
    - "Reused coercion path — both branches share loosePowerStatsSchema → normalizeLlmPowerStats → repairPowerStats; no divergent schema or repair logic"
    - "LLM-only original assessment — no webSearch / MCP imports in assess-original.ts; test asserts the import surface is clean by grepping the source"
    - "overrideText threads through both initial prompt and repair-loop prompt in known-ip path so user directives survive Zod repair retries"
    - "Fail-loud canon branch — missing franchise OR disabled research throws IngestionPipelineError(stage='power_assess') instead of silently dropping to original branch"
    - "Mocked-LLM unit tests capture prompt arguments for byte-level string assertions (override ordering, literal grounding rules, civilian hax=[] guidance)"
key-files:
  created:
    - "backend/src/character/ingestion/assess-original.ts (119 lines, LLM-only PowerStats inference)"
    - "backend/src/character/ingestion/__tests__/assess-original.test.ts (8 tests)"
    - "backend/src/character/ingestion/__tests__/power-assessor.test.ts (7 tests)"
    - "backend/src/character/ingestion/__tests__/fixtures/draft-rogue.json"
    - "backend/src/character/ingestion/__tests__/fixtures/draft-gojo.json"
    - ".planning/phases/60-character-ingestion-backend-pipeline/60-03-SUMMARY.md"
  modified:
    - "backend/src/character/known-ip-worldgen-research.ts (8 `export` keyword additions + overrideText plumbing on 2 prompts and 2 signatures)"
    - "backend/src/character/ingestion/power-assessor.ts (replaced stub-throw with dispatcher, 91 lines)"
decisions:
  - "Vitest fs-read assertion path resolved via fileURLToPath(import.meta.url) instead of hardcoded relative path — Vitest runs with cwd=backend/ which broke the plan's literal 'backend/src/...' path string (ENOENT on 'backend/backend/src/...' double-prefix)"
  - "Logger mock includes debug + event in addition to info/warn/error — matches Phase 58 logger surface to prevent silent failures if future code calls event/debug"
  - "overrideText threaded through repairPowerStats signature + prompt (not just the initial prompt) — ensures override survives Zod repair retries; critical for 'weaker than canon' directives that could be dropped during schema-fix iterations"
  - "Both error branches (missing franchise, research disabled) throw with attempts=0 — zero LLM attempts were made; using 0 communicates 'configuration error, not LLM exhaustion' to upstream observers"
metrics:
  duration: "~30 minutes"
  completed_date: "2026-04-17"
  task_count: 3
  test_count: 15
  typecheck_errors: 38
  typecheck_baseline: 38
  files_created: 5
  files_modified: 2
---

# Phase 60 Plan 03: PowerStats Assessment (Stage 4) Summary

Implemented Stage 4 of the character ingestion pipeline: PowerStats assessment with a canonicalStatus dispatcher. The pipeline now always produces a draft with non-undefined `powerStats` or throws `IngestionPipelineError` — no silent fallback to undefined stats, no fabricated defaults.

**Two branches, one dispatcher:**

1. **Canon branch** (`known_ip_canonical`, `known_ip_diverged`) reuses the existing `enrichKnownIpWorldgenNpcDraft`, which does web search against the franchise + VS Battles canon assessment. Extended in this plan with an optional `overrideText` parameter so user directives like "she's weaker than canon" reach the assessment prompt and survive repair retries.

2. **Original branch** (`original`, `imported`) calls a new `assessOriginalCharacterPowerStats` that runs LLM-only inference from the draft (persona, traits, skills, drives), the V2 card text (if imported), and the override text. The prompt explicitly states Human/Street are the default tiers and contains the literal "Do not inflate tiers" grounding rule that the test suite asserts on.

Both branches share the same `loosePowerStatsSchema → normalizeLlmPowerStats → repairPowerStats` coercion path — no divergent schema logic. Wrapped in `withPipelineRetry({stage: "power_assess"})`.

## Tasks Completed

### Task 1 — Promote 8 private utilities + extend enrichKnownIpWorldgenNpcDraft (commit `17d3934`)

Eight module-private declarations in `backend/src/character/known-ip-worldgen-research.ts` were promoted to named exports by prepending `export` — bodies untouched:

- `loosePowerStatsSchema` (L76)
- `recordFromUnknown` (L107)
- `describeZodIssues` (L114)
- `AP_DUR_TIER_LIST` (L153)
- `SPEED_TIER_LIST` (L154)
- `INTELLIGENCE_TIER_LIST` (L155)
- `normalizeLlmPowerStats` (L161)
- `repairPowerStats` (L192)

File now has **9 top-level exports** (was 1). Verified via `grep -cE "^export "` — returns 9.

`enrichKnownIpWorldgenNpcDraft` gained an optional `overrideText?: string` parameter. When supplied, a "USER OVERRIDE (HIGHEST PRIORITY — must win conflicts with canon)" block is injected into the `generateObject` prompt before the `Franchise:` line, with explicit instructions for tier adjustment, vulnerability addition, and hax constraint. The override is also threaded into `repairPowerStats` (new `overrideText` field on its opts + matching prompt injection) so user directives survive Zod repair retries.

Existing caller `backend/src/worldgen/scaffold-steps/npcs-step.ts` is backward-compatible (optional parameter, not passed for worldgen NPCs) — `grep -c "overrideText" backend/src/worldgen/scaffold-steps/npcs-step.ts` returns 0.

### Task 2 — assess-original.ts + 8 LLM-only tests + 2 fixtures (commit `2bfbb07`)

Created `backend/src/character/ingestion/assess-original.ts` (119 lines). Key design choices:

- Imports `loosePowerStatsSchema`, `normalizeLlmPowerStats`, `repairPowerStats`, `describeZodIssues`, `recordFromUnknown`, `AP_DUR_TIER_LIST`, `SPEED_TIER_LIST`, `INTELLIGENCE_TIER_LIST` from `../known-ip-worldgen-research.js` — no duplicated schemas
- Single `generateObject` call wrapped in `withPipelineRetry("power_assess", ...)`; throws `IngestionPipelineError` on 3-attempt exhaustion
- Prompt labels the character as **ORIGINAL** (non-canonical), then layers sources in priority order: override (highest) → draft persona/tags/skills → card text (optional)
- Grounding rules section contains the literal `"Do not inflate tiers"` string that test 5 asserts on, plus Human/Street defaults for civilians and `hax must be []` for non-supernatural characters
- Zero `webSearch` / `withMcpClient` / `withSearchMcp` imports — test 7 asserts this at the source level

Created fixtures:
- `draft-rogue.json` — original Serin Varn (port-city burglar, Street-tier)
- `draft-gojo.json` — canon Gojo Satoru (Jujutsu Kaisen)

**8 mocked-LLM unit tests** covering:
1. Produces `powerStats` on draft (presence + tier + hax array)
2. Prompt contains "ORIGINAL" + character name
3. Prompt includes override text when supplied (two assertions: "USER OVERRIDE" header + literal override content)
4. Prompt includes card text when supplied
5. Prompt contains "Human" + "Street" + literal "Do not inflate tiers"
6. Prompt contains `"hax must be []"` for civilian guidance
7. Source file has no `webSearch` / `withMcpClient` / `withSearchMcp` imports (fs-read assertion)
8. Throws `IngestionPipelineError` after 3 failed `generateObject` attempts

Result: 8/8 pass in 1.83s.

### Task 3 — power-assessor.ts dispatcher + 7 dispatcher tests (commit `d29d190`)

Replaced the Plan 60-01 stub with a 91-line dispatcher. Routes based on `classification.canonicalStatus`:

- `"known_ip_canonical"` or `"known_ip_diverged"` → `enrichKnownIpWorldgenNpcDraft` with franchise, research config, premise divergence, and `overrideText` from `sources.overrideText ?? undefined`
- `"original"` or `"imported"` → `assessOriginalCharacterPowerStats` with `cardText` built from `sources.card.description + personality + scenario` (joined with double newlines, empty parts filtered), and `overrideText`

Canon-branch guardrails throw `IngestionPipelineError(stage="power_assess", attempts=0)`:
- When `classification.franchise` is null despite a known-IP status
- When `ctx.settings.research?.enabled` is false

`attempts=0` signals a configuration error (not LLM exhaustion) to upstream observers.

**7 dispatcher tests** covering:
1. Canon routing with franchise + overrideText propagation
2. Diverged routing (with premiseDivergence object)
3. Original routing
4. Imported routing with `cardText` built from V2 card (asserts "The strongest sorcerer" from `v2-gojo.json` reaches the callee)
5. Canon without franchise → throws `IngestionPipelineError`
6. Canon with `research.enabled=false` → throws `IngestionPipelineError`
7. Returned draft invariant: `powerStats` defined, `hax` defined, `vulnerabilities` defined

Result: 7/7 pass in 318ms.

## Verification

| Check | Result |
|-------|--------|
| `grep -cE "^export " backend/src/character/known-ip-worldgen-research.ts` | **9** (was 1) |
| All 8 promoted symbols have `export` prefix | **confirmed** |
| `grep -c "overrideText" backend/src/character/known-ip-worldgen-research.ts` | **7** (≥ 4 required: 2 signatures + 2 prompt uses + thread into repairPowerStats call) |
| `grep -c "USER OVERRIDE (HIGHEST PRIORITY"` known-ip file | **2** (initial prompt + repair prompt) |
| `grep -c "nerfed to City tier"` known-ip file | **2** (same two prompts) |
| `grep -c "overrideText" backend/src/worldgen/scaffold-steps/npcs-step.ts` | **0** (existing caller unaffected) |
| `wc -l backend/src/character/ingestion/assess-original.ts` | **119** (≥ 100 required) |
| `grep -q "withPipelineRetry(\"power_assess\""` assess-original | **confirmed** |
| `grep -q "Do not inflate tiers"` assess-original | **confirmed** (literal string matches test) |
| `grep -cE "webSearch\|withMcpClient\|withSearchMcp"` assess-original | **0** (no web search) |
| `grep -c "it("` assess-original.test.ts | **8** |
| `grep -c "it("` power-assessor.test.ts | **7** |
| Full ingestion test suite | **39/39 passed** (7 extractor + 8 classifier + 9 synthesizer + 8 assess-original + 7 power-assessor) |
| `npm --prefix backend run typecheck` error count | **38** (Phase 60 baseline — no regression) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] fs-read assertion resolved via `fileURLToPath(import.meta.url)` instead of hardcoded relative path**
- **Found during:** Task 2 (first test run)
- **Issue:** The plan's test 7 used `fs.readFileSync("backend/src/character/ingestion/assess-original.ts", "utf-8")`. Vitest runs with `cwd=backend/`, so the literal path became `backend/backend/src/...` and threw ENOENT.
- **Fix:** Added `import("node:url").fileURLToPath(import.meta.url)` + `path.dirname(...)` + `path.resolve(here, "..", "assess-original.ts")` to resolve relative to the test file's actual location.
- **Files modified:** `backend/src/character/ingestion/__tests__/assess-original.test.ts`
- **Commit:** 2bfbb07

**2. [Rule 2 - Critical functionality] Logger mocks include `debug` and `event` methods**
- **Found during:** Task 2 and Task 3
- **Issue:** Plan's mock returned only `{info, warn, error}`. Phase 58 logger contract (`lib/logger.ts`) returns `{info, warn, error, debug, event}`. The synthesizer test file (60-02 summary rule 3) already applied this fix; applying it to the new test files maintains consistency and prevents silent failures if future code calls `event`/`debug`.
- **Fix:** Added `debug: vi.fn()` and `event: vi.fn()` to both logger mocks.
- **Files modified:** `backend/src/character/ingestion/__tests__/assess-original.test.ts`, `backend/src/character/ingestion/__tests__/power-assessor.test.ts`
- **Commits:** 2bfbb07, d29d190

No architectural changes (Rule 4). No authentication gates.

## Deferred Issues

**Pre-existing:** `backend/src/worldgen/__tests__/npcs-step.test.ts` has 1 failing test unrelated to this plan (fails on `main` without any 60-03 changes — verified via `git stash` test). Not caused by this plan's edits. Logged here for future triage; not blocking Phase 60 since it does not touch the ingestion pipeline or the known-IP utilities we exported.

## Downstream Contracts Established

Plan 60-04 (route refactor) MUST consume these without redefinition:

- **`assessPowerStats({draft, sources, classification, researchDigest, ctx})`** — the only Stage 4 entry point; takes Stage 3 draft plus classification, returns a `CharacterDraft` with populated `powerStats` OR throws `IngestionPipelineError(stage="power_assess")`
- **Canon branch preconditions:** Route layer does NOT check `classification.franchise` or `ctx.settings.research.enabled` — the dispatcher fails loudly itself. The route's job is surfacing `IngestionPipelineError.stage` to the client response.
- **Card text construction:** The dispatcher builds `cardText` from `sources.card.description + personality + scenario`. Routes that want a different assembly MUST stuff their assembled text into one of those three fields — there is no separate `cardText` pass-through on `IngestionSources`.
- **Override text:** Already threaded end-to-end: `IngestionSources.overrideText` → dispatcher → both branches → both prompts (canon initial + canon repair + original).

## Self-Check: PASSED

Verified:
- All created files exist on disk:
  - `backend/src/character/ingestion/assess-original.ts` (119 lines) — **FOUND**
  - `backend/src/character/ingestion/__tests__/assess-original.test.ts` (8 tests) — **FOUND**
  - `backend/src/character/ingestion/__tests__/power-assessor.test.ts` (7 tests) — **FOUND**
  - `backend/src/character/ingestion/__tests__/fixtures/draft-rogue.json` — **FOUND**
  - `backend/src/character/ingestion/__tests__/fixtures/draft-gojo.json` — **FOUND**
- Modified files:
  - `backend/src/character/known-ip-worldgen-research.ts` (9 exports now) — **FOUND**
  - `backend/src/character/ingestion/power-assessor.ts` (dispatcher, 91 lines, no stub throw) — **FOUND**
- All three task commits present in `git log`:
  - `17d3934` — refactor(60-03): promote 8 private utilities to exports + overrideText — **FOUND**
  - `2bfbb07` — feat(60-03): LLM-only PowerStats assessment for original characters — **FOUND**
  - `d29d190` — feat(60-03): assessPowerStats dispatcher for canon vs original — **FOUND**
- 39/39 ingestion tests pass
- Typecheck = 38 (baseline preserved, no regression)
- `grep -q "Do not inflate tiers" backend/src/character/ingestion/assess-original.ts` → **OK**
- `grep -c "overrideText" across all three power-assess files` → each file contains the identifier
