---
phase: 60
plan: 02
subsystem: character-ingestion-backend-pipeline
tags: [ingestion, synthesis, priority-merge, llm-prompt, tdd, generateObject]
one_liner: "Priority-merge draft synthesis via single generateObject call — P1 overrideText > P2 card > P3 research > P4 freeText/archetype hierarchy enforced at LLM prompt layer with explicit per-field merge rules; no code-level field merge."
dependency_graph:
  requires:
    - "backend/src/character/generator.ts (richCharacterSchema, buildFlatOutputStrategy, toCharacterDraftFromRich — promoted to exports in this plan)"
    - "backend/src/character/prompt-contract.ts (buildCharacterPromptContract — already exported)"
    - "backend/src/character/v2-sections.ts (buildV2CardSections — already exported)"
    - "backend/src/character/import-utils.ts (buildImportModeGuidance — already exported)"
    - "backend/src/character/ingestion/types.ts (IngestionSources, IngestionClassification, IngestionContext from 60-01)"
    - "backend/src/character/ingestion/retry.ts (withPipelineRetry from 60-01)"
    - "backend/src/character/ingestion/errors.ts (IngestionPipelineError from 60-01)"
    - "@worldforge/shared (CharacterDraft, CharacterSourceKind)"
  provides:
    - "synthesizeDraftFromSources({sources, classification, researchDigest, ctx}) → Promise<CharacterDraft>"
    - "richCharacterSchema, buildFlatOutputStrategy, toCharacterDraftFromRich now public exports of generator.ts"
    - "Priority-framed prompt template (PRIORITY 1 → 4) with 9 explicit merge rules"
    - "provenance.overrideText additive field — threaded onto draft when override supplied"
    - "canon-digest.txt fixture for downstream synthesizer/route tests"
  affects:
    - "Plan 60-03 (power-assessor) — consumes the synthesized draft, expects provenance.overrideText to flow through"
    - "Plan 60-04 (route refactor) — will route all 4 character creation endpoints through this synthesizer"
tech-stack:
  added: []
  patterns:
    - "Prompt-layer priority merge — LLM is the merge engine because natural-language overrides cannot be code-merged"
    - "Single generateObject call per ingestion (not per-source loops) — atomic synthesis with full context window"
    - "withPipelineRetry wrapping the LLM call — fail-loud after 3 attempts, throws IngestionPipelineError, no silent fallback"
    - "Mocked-LLM unit tests capture the prompt argument and assert priority section ordering at the byte-offset level"
    - "Shared characterRoleFields helpers reused (no duplicated prompt scaffolding) — buildCharacterPromptContract + buildFlatOutputStrategy + buildV2CardSections + buildImportModeGuidance"
key-files:
  created:
    - "backend/src/character/ingestion/synthesizer.ts (182 lines, replaces stub from 60-01)"
    - "backend/src/character/ingestion/__tests__/synthesizer.test.ts (9 tests)"
    - "backend/src/character/ingestion/__tests__/fixtures/canon-digest.txt"
    - ".planning/phases/60-character-ingestion-backend-pipeline/60-02-SUMMARY.md"
  modified:
    - "backend/src/character/generator.ts (3 single-word `export` additions on L43/L80/L130 — bodies untouched)"
decisions:
  - "Used valid CharacterSourceKind enum values (player-input/import/archetype/generator) instead of plan's draft strings (v2-card/generated) — strict typing requirement"
  - "Logger gets `event` and `debug` methods in test mock — matches Phase 58 logger contract (createLogger returns full surface, not just info/warn/error)"
  - "Test failure-path uses try/catch + instanceof assertion instead of expect().rejects.toThrow() — explicit attempts/stage assertions on the caught error"
  - "Mocked toCharacterDraftFromRich passes sourceKind as a string (no enum constraint at mock level) — real call site uses the typed enum sourceKindForMode() helper"
  - "Synthesizer keeps `importMode: sources.card?.importMode ?? null` instead of undefined — matches CharacterProvenance contract (`importMode: CharacterImportMode | null`)"
  - "Did not use safeGenerateObject wrapper — plan explicitly specified `generateObject` from 'ai' SDK to keep test mocking simple"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-04-17"
  task_count: 2
  test_count: 9
  typecheck_errors: 38
  typecheck_baseline: 38
  files_created: 3
  files_modified: 1
---

# Phase 60 Plan 02: Priority-Merge Draft Synthesizer Summary

Implemented Stage 3 of the character ingestion pipeline: priority-merge draft synthesis. A single `generateObject` LLM call receives all sources hierarchically framed in the prompt — `overrideText` (P1, highest), V2 card (P2), research digest (P3), free text or archetype (P4, lowest) — with explicit per-field merge rules. The LLM interprets natural-language overrides ("her eyes are red not blue") and produces a draft `CharacterRecord` minus `PowerStats`. Wrapped in `withPipelineRetry({stage: "synthesize"})` so failure retries with exponential backoff and finally throws `IngestionPipelineError` — never returns a stub draft.

The key architectural decision: **the LLM is the merge engine, not code**. Natural-language overrides cannot be deterministically merged into structured fields ("her eyes are red not blue" must override the card's "blue eyes"). Code-level merge would require parsing every conceivable override sentence. Instead, the prompt frames the four sources in strict priority order with literal merge rules, and the LLM does the reconciliation per field.

## Tasks Completed

### Task 1 — Promote generator.ts exports + build synthesizer (commit `fd51c30`)

**Sub-step A:** Added `export` keyword to three module-private declarations in `backend/src/character/generator.ts`:
- L43: `export const richCharacterSchema = z.object({...})`
- L80: `export function buildFlatOutputStrategy(options?)`
- L130: `export function toCharacterDraftFromRich(character, opts?)`

Bodies untouched. Additive change — no existing callers to break.

**Sub-step B:** Replaced the stub at `backend/src/character/ingestion/synthesizer.ts` (16 → 182 lines) with the full priority-merge synthesizer:
- 4 helper functions format each priority section with explicit "absent" stubs when a source is null (so the LLM sees a complete priority structure regardless of which sources are supplied)
- Single `generateObject` call wrapped in `withPipelineRetry("synthesize", ...)` — exponential backoff (500ms × 2^(n-1)), 3 attempts, throws `IngestionPipelineError` on exhaustion
- Reuses every existing prompt scaffolding helper (`buildCharacterPromptContract`, `buildFlatOutputStrategy`, `buildV2CardSections`, `buildImportModeGuidance`, `clampTokens`) — no duplicated prompt copy
- `sourceKindForMode()` helper exhaustively maps `IngestionSources["mode"]` to valid `CharacterSourceKind` enum values
- `provenance.overrideText` written onto the returned draft as an additive field beyond the typed `CharacterProvenance` contract (cast documents the intentional widening for downstream Phase 61 UI consumption)

**Sub-step C:** Created `backend/src/character/ingestion/__tests__/fixtures/canon-digest.txt` — 5-line Gojo Satoru research digest used as PRIORITY 3 fixture.

### Task 2 — 9 mocked-LLM unit tests (commit `9cb08ca`)

Created `backend/src/character/ingestion/__tests__/synthesizer.test.ts`. Mocks every dependency (`ai` SDK, `createModel`, the three promoted `generator.ts` exports, prompt scaffolding helpers, `clampTokens`, `createLogger`) so no real LLM traffic and no real Drizzle/file IO. The mocked `generateObject` captures the prompt argument so tests assert prompt structure at the byte-offset level.

**9 tests covering:**

1. **All four priority headers present** when override + card + research + freeText all supplied
2. **Override appears before PRIORITY 2** in the prompt (byte-offset assertion: `overrideIndex < p2Index`) — proves the priority ordering
3. **`provenance.overrideText` is set** when override supplied
4. **`provenance.overrideText` is undefined** when override is null
5. **Card section marked "no card imported"** in parse mode
6. **Research section marked "not a canonical character"** for original characters
7. **PRIORITY 4 uses ARCHETYPE label** in research mode
8. **`sourceKind` mapping** for all four modes: parse → `player-input`, import → `import`, research → `archetype`, generate → `generator`
9. **`IngestionPipelineError` thrown** after 3 failed `generateObject` attempts with `stage='synthesize'` and `attempts=3`

Result: 9/9 pass in 1.52s. Combined ingestion suite: 24/24 pass (7 extractor + 8 classifier + 9 synthesizer).

## Verification

| Check | Result |
|-------|--------|
| `grep -cE "^export (const richCharacterSchema\|function buildFlatOutputStrategy\|function toCharacterDraftFromRich)" backend/src/character/generator.ts` | **3** |
| `grep -c "PRIORITY" backend/src/character/ingestion/synthesizer.ts` | **15** (≥ 4 required) |
| `grep -c "overrideText" backend/src/character/ingestion/synthesizer.ts` | **9** (≥ 3 required) |
| `wc -l backend/src/character/ingestion/synthesizer.ts` | **182** (≥ 120 required) |
| `grep -c "withPipelineRetry" backend/src/character/ingestion/synthesizer.ts` | **2** (import + call site) |
| `grep -c "import .* from \"../../routes" backend/src/character/ingestion/synthesizer.ts` | **0** (decoupled from route layer) |
| `npm --prefix backend test -- src/character/ingestion/ --run` | **24/24 passed** (7 extractor + 8 classifier + 9 synthesizer) |
| `npm --prefix backend run typecheck` error count | **38** (exactly at Phase 60 baseline — no regression) |
| Synthesizer imports `richCharacterSchema` etc from `../generator.js` | **confirmed** (not from non-existent schemas.js / record-adapters.js) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used valid CharacterSourceKind enum values**
- **Found during:** Task 1 (synthesizer implementation)
- **Issue:** Plan specified `sourceKind: "v2-card"` for import mode and `"generated"` for generate mode, but `CharacterSourceKind` enum only allows `player-input | generator | archetype | import | worldgen | runtime | migration` (shared/src/types.ts:263). Real `toCharacterDraftFromRich` would reject those strings at the type boundary.
- **Fix:** Replaced with valid enum values via `sourceKindForMode()` helper: parse → `"player-input"`, import → `"import"`, research → `"archetype"`, generate → `"generator"`. Updated Task 2's `sourceKind` assertion to match.
- **Files modified:** `backend/src/character/ingestion/synthesizer.ts` (sourceKindForMode helper), `backend/src/character/ingestion/__tests__/synthesizer.test.ts` (assertion `"v2-card"` → `"import"`)
- **Commit:** fd51c30 (synthesizer), 9cb08ca (test)

**2. [Rule 1 - Bug] Removed `importMode` from buildV2CardSections call**
- **Found during:** Task 1
- **Issue:** Plan called `buildV2CardSections({...importMode: sources.card.importMode})` but actual signature only accepts `{name, description, personality, scenario, v2Tags}` (v2-sections.ts:2-8). The `importMode` parameter does not exist.
- **Fix:** Removed `importMode` from the call. Import mode guidance is appended separately via `buildImportModeGuidance(sources.card.importMode)` per the plan's own pattern.
- **Files modified:** `backend/src/character/ingestion/synthesizer.ts` (formatCardSection)
- **Commit:** fd51c30

**3. [Rule 2 - Critical functionality] Test logger mock includes `event` and `debug` methods**
- **Found during:** Task 2
- **Issue:** Plan's mock returned only `{info, warn, error}`. Phase 58 logger contract (lib/logger.ts:14-72) returns `{info, warn, error, debug, event}`. Synthesizer does not call `event`/`debug` directly today, but a future addition would silently fail in tests if the mock is incomplete.
- **Fix:** Added `debug: vi.fn()` and `event: vi.fn()` to the mock surface.
- **Files modified:** `backend/src/character/ingestion/__tests__/synthesizer.test.ts`
- **Commit:** 9cb08ca

**4. [Rule 1 - Bug] Failure-path test uses try/catch instead of expect().rejects.toThrow()**
- **Found during:** Task 2 (writing failure assertion)
- **Issue:** `expect().rejects.toThrow(IngestionPipelineError)` only checks the constructor name, but the plan's `acceptance_criteria` regex `stage.*synthesize\\|rejects.toThrow(IngestionPipelineError)` implies we should also surface stage and attempts on the caught error. `.rejects.toThrow()` does not expose the thrown instance for further assertions.
- **Fix:** Wrapped the call in try/catch, captured the error, asserted `instanceof IngestionPipelineError`, then asserted `.stage === "synthesize"` and `.attempts === 3` directly. Stronger guarantee than the plan's text.
- **Files modified:** `backend/src/character/ingestion/__tests__/synthesizer.test.ts`
- **Commit:** 9cb08ca

**5. [Rule 1 - Bug] `__dirname` shim added for ESM test file**
- **Found during:** Task 2
- **Issue:** Plan's test used `__dirname` directly with `path.join(__dirname, ...)`, but the backend tsconfig is ESM (`"type": "module"` style) and Vitest under Node ESM does not provide `__dirname`.
- **Fix:** Added `import { fileURLToPath } from "node:url"` + `const __dirname = path.dirname(fileURLToPath(import.meta.url))` shim before the `fs.readFileSync` call.
- **Files modified:** `backend/src/character/ingestion/__tests__/synthesizer.test.ts`
- **Commit:** 9cb08ca

No architectural changes (Rule 4) — every deviation was a tactical correctness fix scoped to the current task.

## Downstream Contracts Established

Plans 60-03 and 60-04 MUST consume these without redefinition:

- `synthesizeDraftFromSources({sources, classification, researchDigest, ctx})` — the only synthesis entry point; takes Stage-2 outputs and returns a `CharacterDraft` with `powerStats: undefined`
- `provenance.overrideText: string | undefined` — additive field beyond typed `CharacterProvenance`; downstream consumers (power assessor, route response, Phase 61 UI) MUST surface this when present
- `richCharacterSchema`, `buildFlatOutputStrategy`, `toCharacterDraftFromRich` — public exports of `generator.ts`; reuse, do not duplicate
- Source-kind mapping is fixed: `parse → player-input`, `import → import`, `research → archetype`, `generate → generator`
- Synthesizer is decoupled from `routes/` — the route layer (Plan 60-04) imports synthesizer, never the reverse

## Self-Check: PASSED

Verified:
- All 3 created/modified files exist on disk:
  - `backend/src/character/ingestion/synthesizer.ts` (182 lines, replaced stub)
  - `backend/src/character/ingestion/__tests__/synthesizer.test.ts` (9 tests)
  - `backend/src/character/ingestion/__tests__/fixtures/canon-digest.txt` (5 lines)
  - `backend/src/character/generator.ts` (modified — 3 export additions)
- Both task commits present in `git log`:
  - `fd51c30` — feat(60-02): synthesizer priority-merge draft synthesis
  - `9cb08ca` — test(60-02): synthesizer priority merge — 9 mocked-LLM tests
- 24/24 ingestion unit tests pass
- Typecheck at 38 baseline (no regression)
- All 9 priority-merge tests pass including the 3-attempt failure path that exercises real `withPipelineRetry` exponential backoff (1.5s total wait time)
