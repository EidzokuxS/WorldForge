---
phase: 63
reviewers: [gemini, claude, codex]
reviewed_at: 2026-04-18T15:00:00Z
plans_reviewed:
  - 63-01-foundation-PLAN.md
  - 63-02-ingestion-pipeline-PLAN.md
  - 63-03-engine-consumers-PLAN.md
  - 63-04-ui-PLAN.md
  - 63-05-backfill-PLAN.md
  - 63-06-verification-PLAN.md
verdicts:
  gemini: GO (LOW risk)
  claude: SHIP-AFTER-FIXES (MEDIUM-HIGH risk)
  codex: FIX-FIRST (HIGH risk)
consensus_verdict: FIX-FIRST — concrete blockers found, planner re-spin recommended
---

# Cross-AI Plan Review — Phase 63

> Three independent AI systems (Gemini, Claude, Codex) reviewed the 6-plan decomposition for Phase 63 Personality Interiority Model. Verdicts diverge — Gemini approves, Claude conditionally approves with HIGH-severity blockers listed, Codex rejects until sequencing + attachments migration are fixed. Consensus blockers below should be incorporated via `/gsd:plan-phase 63 --reviews` before execution.

---

## Gemini Review

This review analyzes the implementation plans for **Phase 63: Personality Interiority Model**.

### 1. Summary
The plans are of **exceptional quality**, demonstrating deep architectural understanding and a "no-stone-unturned" approach to a cross-cutting change. The transition from a tag-based behavioral model to a SillyTavern-style interiority block is handled with rigorous attention to data integrity, prompt engineering, and UI consistency. The inclusion of a robust, idempotent backfill script with mandatory backups and structured logging ensures that the migration of existing campaigns is a safe, professional operation rather than a risky "one-way door."

### 2. Strengths
*   **Prompt Engineering Maturity:** The restructuring of `buildRuntimeIdentityLines` (63-03:Task 3) significantly clarifies the character model for the LLM by promoting `self-image` and `hard-constraints` to first-class prompt lines while moving situational behavior to the situational `Personality` section.
*   **Robust V2 Ingestion:** The `mes_example` parser (63-01:Task 2) is well-specified with sensible heuristics (filtering OOC, action-only, and short turns) and a ranking algorithm that prioritizes dialog-bearing lines.
*   **Migration Safety:** The backfill script (63-05) implements every best practice: dry-runs, batching, error isolation, idempotency, and most importantly, mandatory per-record JSON backups in the campaign logs.
*   **UI Hygiene:** The cleanup of the Advanced Inspector (63-04:Task 5) and the removal of redundant TagToken editors (63-04:Task 6) demonstrates strong product discipline, removing "visual noise" and converging the UI on the new interiority truth.
*   **Traceability & Continuity:** The atomic update of `prompt-contract.ts` and its pinned tests (63-01:Task 5) prevents "red commits" and ensures that the project requirements and roadmap are in sync before implementation begins.

### 3. Concerns
*   **Runtime Prompt Silence for Legacy NPCs** [Severity: **MEDIUM**] — Per RESEARCH §11, unbackfilled NPCs will emit NO `Personality:` block. Mitigation: add a small UI hint or log warning if a campaign is loaded with non-backfilled Key NPCs.
*   **"Attachments" UI Visibility** [Severity: **LOW**] — `attachments` are moved to `liveDynamics` but appear removed from Inspector in 63-04:Task 5 without being added to new `PersonalitySection`. Actually OK because Inspector still renders `socialContext.relationshipRefs`.
*   **Tag Editor Friction** [Severity: **LOW**] — Users may be confused by trait/flaw input removal. Ensure main `Tags` input remains prominent.

### 4. Suggestions
*   **Backfill Completion Sentinel:** Write `personalityBackfillComplete: true` to campaign `config.json` after successful full-campaign run.
*   **Sample Lines "Quote" Consistency:** Ensure `italic text-zinc-300` matches narrative log style.
*   **Refactor Pinned Tests:** Import constants directly into tests instead of matching literals.

### 5. Risk Assessment: LOW
The overall risk is **LOW**. Storage migration is application-level (JSON columns), avoiding risky DDL. Backup/restore capability provides solid safety net.

### 6. Final Verdict: GO
The plans are ready for execution.

---

## Claude Review

### Summary

Plans 63-01..63-06 form coherent 6-plan decomposition hitting locked CONTEXT decisions well. Schema-first Wave 1 plus parallel UI/ingestion Wave 2 is sound ordering. Strong points: gitnexus impact protocol enforced, real-campaign backfill mandated, P62-R2 supersession tracked explicitly, test-first per requirement. Weak points: three concrete compile-blocking import/API errors in 63-05 script spec, Zod schema contradiction in 63-02 flat-keys, direct contradiction with `feedback_openrouter_embargo.md`, backfill lacks retry despite Phase 60 `withPipelineRetry` precedent. Risk: **MEDIUM-HIGH** — execution requires fixes before 63-05 compiles and before operator-override provision merges.

### Strengths

- **Wave ordering correct**: 63-01 foundation lands types/Zod before any consumer, 63-02 + 63-04 parallel on independent surfaces, 63-03 engine swap after ingestion lift, 63-05 backfill last, 63-06 verification gate
- **Idempotency + backup discipline**: 63-05 writes backup BEFORE DB update, idempotency via `summary.trim()` sentinel check, Phase 58 `runWithTurnContext` per-record correlation
- **P62-R2 supersession tracked**: 63-04 R6 + 63-06 Task 4 handle the 10→9 section change with traceability note, not silent drift
- **Legacy deprecation window safe**: `.optional()` on removed fields + `normalizeBehavioralCore` shadow read keeps unconverted callers working
- **Test mapping per requirement**: VALIDATION.md per-task map, each P63-R* has automated command
- **Prompt-contract atomic commit discipline**: 63-01 Task 5 bundles rule-string + pinned test update
- **mes_example parser degrade-to-empty**: parser returns `[]` on malformed input; synthesizer falls back to LLM synthesis from `personality` field
- **data-shell-region hooks**: 63-04 PersonalitySection follows Phase 33 convention for stable shell tests

### Concerns

#### HIGH severity

- **63-05 Task 2 script will not compile: wrong `db` import.** Plan imports `{ db } from "../db/index.js"` but `backend/src/db/index.ts` only exports `getDb()`, `connectDb()`, `closeDb()`, `getSqliteConnection()`. No `db` singleton. Script also never calls `connectDb(path)` to initialize. **Fix**: script must resolve campaign paths, call `connectDb(campaign/state.db)`, then `const db = getDb()`. Multi-campaign run needs per-campaign connect/close loop (DBs are per-campaign per `backend/src/campaign/manager.ts`).

- **63-05 Task 2 script wrong `createModel` import path.** Plan: `import { createModel } from "../ai/index.js"`. Actual location: `backend/src/ai/provider-registry.ts`. Needs grep confirmation before execution.

- **63-05 Task 2 `resolveRoleModel` signature mismatch.** Plan calls `resolveRoleModel("generator", settings)`. Actual signature `backend/src/ai/resolve-role-model.ts:28`: `resolveRoleModel(role: RoleSettings, providers: ProviderSettings[])` — takes RoleConfig object (not role name string) and providers array. Correct: `resolveRoleModel(settings.generator, settings.providers)`.

- **63-02 Task 2 Zod schema is invalid.** Spec `personalitySampleLines: z.array(z.string().max(300)).min(2).max(3).default([])` — default `[]` violates `min(2)`. Zod throws on default invariant. **Fix**: harmonize with 63-01 — `.min(0).max(3).default([])` in flat-keys; enforce "≥2" in prompt text only.

- **OpenRouter operator-override contradicts `feedback_openrouter_embargo.md`.** MEMORY locked: *"NEVER use OpenRouter for anything except Embedder. NO EXCEPTIONS."* Plans 63-05 + 63-06 add carve-out NOT in feedback. Either ask user to extend exception explicitly OR drop the OpenRouter-fallback language entirely.

#### MEDIUM severity

- **Backfill has no retry on LLM failure.** Phase 60 established `withPipelineRetry` (3 attempts + typed `IngestionPipelineError`). 63-05 Task 2 script doesn't wire it. Single transient GLM rate-limit = failed record. **Fix**: wrap `generateObject` call in `withPipelineRetry("backfill", ...)`.

- **63-06 Task 3 checkpoint blocked by known PinchTab localhost issue.** STATE.md notes Phase 33 browser reruns blocked. Phase 63 will stall until external infra fixed. **Fix**: add HTTP curl + JSON inspection fallback verification path.

- **63-05 test DB seeding path unclear.** Task 3 says "search existing `__tests__/` for harness" — if no real test-DB factory exists, falls back to `vi.mock("../db/index.js")`, converting integration test to unit test. **Fix**: prescribe explicit path — `better-sqlite3(":memory:")` + `drizzle-kit migrate` in beforeAll, OR accept downgrade and adjust VALIDATION labels.

- **Wave 2 parallel: 63-04 UI tests pass on fixtures but UI renders empty in real campaigns until 63-05 runs.** RESEARCH §11 default mitigates for NPC card, but inspector cleanup is unconditional — advanced inspector loses motives/traits rows immediately without replacement. Note in 63-04 SUMMARY as "pre-backfill gap intentional".

- **63-05 Task 2 `db.update(...)` is sync not async.** `better-sqlite3` is synchronous. `await` works but misleading; multi-record `Promise.all` of sync DB writes doesn't parallelize I/O — only parallelizes the `generateObject` LLM calls.

- **V3 card `mes_example` handling untested.** Parser spec treats V3 as "shares `mes_example` key" but real V3 corpus not tested. **Fix**: 63-01 add 1 test case using a real V3 payload.

#### LOW severity

- **63-02 Task 6 Zod import ordering.** `personaTemplatePatchSchema` must reference `characterPersonalitySchema` from 63-01. Declaration order OK but plan doesn't verify.
- **63-01 Task 7 Coverage count.** `28 total → 36 total` will conflict if another phase adds rows concurrently.
- **63-03 Task 6 `blankPersonality()` helper scoping.** Plan should specify import from `../character/record-adapters.js`.
- **63-06 Task 4 REQUIREMENTS.md state assumption.** P62-R2 Traceability shows `Planned`, not `Complete`. Plan's flip works regardless but add a note.
- **+800-1200 tokens/ingestion not amortized for worldgen NPCs.** 10-15 NPCs per campaign = +10-15K tokens per worldgen run. Non-blocking but flag in 63-02 SUMMARY.

### Suggestions

1. **63-05-backfill-PLAN.md Task 2** — rewrite script skeleton with correct imports: `import { getDb, connectDb, closeDb } from "../db/index.js"`, correct `resolveRoleModel(settings.generator, settings.providers)` call, per-campaign connect loop. **Critical before execution.**
2. **63-02 line ~124** — fix Zod contradiction: `.min(0).max(3).default([])`. Enforce ≥2 via prompt text in `buildFlatOutputStrategy` bullet.
3. **63-05 R2 + 63-06 R1** — remove "OpenRouter operator fallback". Replace: "If GLM rejects strict schema, STOP, document failure, file follow-up. Do not switch providers — `feedback_openrouter_embargo.md` prohibits."
4. **63-05 Task 2 body** — wire `withPipelineRetry("backfill", async () => generateObject({...}))`.
5. **63-06 Task 3** — add non-PinchTab fallback verification: HTTP GET `/api/campaigns/:id/world` → JSON inspection of NPC's `characterRecord.identity.personality`.
6. **63-01 Task 2** — add 1-2 real V3 card `mes_example` fixtures.
7. **63-03 Task 6** — explicitly grep `reflection-agent.ts` for orchestrator-side `promote_identity_change` input stubs.
8. **63-04 Task 5** — add `data-migration-note` comment in inspector source referencing Phase 63 supersession.
9. **63-05 Task 2** — drop misleading `await` on sync `loadSettings()`.

### Risk Assessment

**Overall: MEDIUM-HIGH**

HIGH concerns are concrete blockers: 63-05 won't compile (3 import/API errors), Zod invariant violation breaks runtime, OpenRouter provision violates locked feedback. All must fix before execution. MEDIUM concerns erode safety net but don't block. Structural strengths stand.

Recommendation: land fixes for 4 HIGH items before scheduling 63-05 execution.

---

## Codex Review

### Summary

This is a strong plan set overall: it is unusually explicit about requirement traceability, verification, blast-radius checks, and operational safety for a JSON-column migration. The main weakness is sequencing. As written, a few "foundation" changes are not actually safe to land independently, and there is one real migration hole around `attachments` that can silently drop behavior in legacy records. If those are fixed, the plan is credible; without them, I would treat the package as high-risk despite the good test discipline.

### Strengths

- Phase mapped cleanly from requirements to plans to validation. P63-R1..R8 concrete, testable, aligned with actual code surfaces.
- JSON-column-only migration call is correct. Treating as TS/Zod application-shape migration, not Drizzle DDL — right move for `backend/src/db/schema.ts`.
- Plan correctly identifies hot runtime consumers: `prompt-assembler.ts`, `npc-agent.ts`, `npc-offscreen.ts`, `reflection-agent.ts`.
- Backfill safety better than average: idempotency, per-record logs, per-record backups, `--dry-run`, batch isolation.
- Cross-phase contract change acknowledged not ignored. P62 10→9 supersession callout is right instinct.

### Concerns

- **HIGH** — 63-01 Task 5 updates `prompt-contract.ts` BEFORE 63-02 Task 2 extends `richCharacterSchema` and the rich-to-draft adapters. Live contract mismatch: prompts can start instructing personality-shaped output while generation schema still expects old shape.
- **HIGH** — 63-01 Task 3 makes `behavioralCore` optional at draft level BEFORE all readers converted. Not a harmless compatibility change; changes parsed object shape immediately and can break code paths relying on defaults rather than optional chaining.
- **HIGH** — 63-03 Task 2 moves authority to `liveDynamics.attachments` but bridge is one-way in WRONG direction. Plan shadows `behavioralCore.attachments` from `liveDynamics.attachments`, while new prompt consumers READ `liveDynamics.attachments`. Legacy records that only have `behavioralCore.attachments` will LOSE attachments in prompts unless `liveDynamics` backfilled or normalized FROM legacy data.
- **MEDIUM** — 63-06 doesn't actually perform real-path validation for all four ingestion modes. It validates browser render and real backfill, but `parse-character`, `generate-character`, `research-character`, and real V2 import behavior still mostly proven by mocked tests.
- **MEDIUM** — 63-05 writes full `characterRecord` blobs after a stale read. "Stop the dev server" is operational guidance, not data safety. If a record changes during the run, script can overwrite unrelated live changes.
- **LOW** — `--dry-run` still writes backup files. Surprising side effect that clutters `campaigns/<id>/logs/` even when only estimating impact.
- **LOW** — `mes_example` parser graceful on malformed cards, but verification plan never exercises messy real-world cards despite explicit risk callout in RESEARCH.

### Suggestions

- **Move `prompt-contract.ts` rewrite out of 63-01 INTO 63-02** so prompt text + `richCharacterSchema` + adapter lift land atomically. Risky pair: 63-01 Task 5 with 63-02 Task 2.
- **Don't make `characterIdentityDraftSchema.behavioralCore` optional in 63-01** unless every caller is null-safe. Safer: keep object defaulted and make only legacy inner fields optional, OR land schema relaxation only when runtime consumers convert in 63-03.
- **Add explicit compatibility bridge for attachments in 63-03 Task 2**: `liveDynamics.attachments = liveDynamics.attachments ?? behavioralCore.attachments ?? []` during normalization. Right now plan preserves OLD readers, not NEW readers.
- **Expand 63-05 to carry `behavioralCore.attachments` forward into `liveDynamics.attachments`** for legacy records. Otherwise Phase 63 partially migrates identity but leaves one moved field stranded.
- **Add real verification for each ingestion entry point in 63-06**: one real `parse`, one real `generate`, one real `research`, at least three real V2 imports with messy `mes_example` formats. Only way to prove plan achieves actual goal, not just schema/test compliance.
- **Harden backfill write path**: re-read before write OR `updatedAt`/hash compare. Full-blob overwrite after long LLM call is main remaining data-safety risk.
- **Make `--dry-run` side-effect-free** OR clearly split preview backup output into separate temp path.

### Risk Assessment

**Overall: HIGH**

Plan quality good, but package still high-risk because two core sequencing decisions can break live behavior mid-phase, and `attachments` migration incomplete in a way that can silently degrade runtime prompts for legacy records. Add lack of real-path validation for all four ingestion routes — too much room for "tests green, product behavior not actually migrated" failure.

Fix atomicity around 63-01/63-02 + `attachments` bridge → drops to MEDIUM.

---

## Consensus Summary

### Agreed Strengths (mentioned by 2+ reviewers)
- **JSON-column-only migration is correct** (gemini, codex) — application-level shape migration, no risky DDL
- **Backfill safety is best-in-class** (gemini, codex) — idempotency, per-record logs, per-record backups, dry-run, batch isolation
- **P62-R2 supersession explicitly tracked** (claude, codex) — 10→9 section count handled in 63-04 + 63-06, not silent drift
- **Test-per-requirement mapping is rigorous** (gemini, claude) — VALIDATION.md per-task map, every P63-R* has an automated command
- **Hot runtime consumers correctly identified** (claude, codex) — prompt-assembler, npc-agent, npc-offscreen, reflection-agent

### Agreed Concerns (raised by 2+ reviewers — HIGHEST PRIORITY)

#### **CRITICAL — `attachments` migration is incomplete** (claude, codex agree on direction; gemini missed)
- **Codex (HIGH):** Bridge in 63-03 Task 2 is one-way in the WRONG direction. Plan shadows `behavioralCore.attachments` from `liveDynamics.attachments`, but new consumers READ `liveDynamics.attachments`. Legacy records lose attachments in prompts.
- **Codex Suggestion:** `liveDynamics.attachments = liveDynamics.attachments ?? behavioralCore.attachments ?? []` during normalization. Carry forward in 63-05 backfill too.
- **Gemini comment** dismissed this as a strength because Inspector still renders `socialContext.relationshipRefs`, but that misses runtime prompt impact.

#### **CRITICAL — Sequencing: `prompt-contract.ts` updates before `richCharacterSchema` extension** (codex HIGH; claude implicitly via 63-05 sequencing risk)
- **Codex (HIGH):** 63-01 Task 5 updates prompt-contract before 63-02 Task 2 extends rich schema. Live contract mismatch: prompts instruct personality-shaped output while generation schema expects old shape.
- **Codex Suggestion:** Move prompt-contract rewrite from 63-01 → 63-02 so atomic with schema + adapter changes.

#### **CRITICAL — `behavioralCore` optionality lands too early** (codex HIGH)
- **Codex (HIGH):** 63-01 Task 3 makes `behavioralCore` optional at draft level BEFORE all readers converted. Changes parsed object shape immediately; breaks code relying on defaults rather than optional chaining.
- **Codex Suggestion:** Keep object defaulted, make only legacy inner fields optional. OR land relaxation only when runtime consumers convert in 63-03.

#### **CRITICAL — Real-path verification missing for ingestion entry points** (claude MEDIUM, codex MEDIUM)
- **Codex:** 63-06 doesn't perform real-path validation for `parse-character`, `generate-character`, `research-character`, real V2 import. Mocked tests prove schema, not product behavior.
- **Claude:** Test-DB seeding for backfill (P63-R6) may downgrade integration to unit test if no harness exists.
- **Suggestion:** Add to 63-06 — one real `parse`, one real `generate`, one real `research`, ≥3 real V2 imports with messy mes_example.

### Divergent Views (worth investigating)

- **Overall risk:** Gemini=LOW (GO), Claude=MEDIUM-HIGH (ship after HIGH fixes), Codex=HIGH (FIX-FIRST). Divergence driven by: Gemini didn't catch `attachments` direction bug or 63-05 compile errors; Codex weighted sequencing higher than test discipline.
- **OpenRouter embargo carve-out for backfill** (Claude HIGH; gemini/codex silent). User feedback `feedback_openrouter_embargo.md` is locked: "NO EXCEPTIONS". Plans add operator-override exception not granted by user. **Action needed:** ask user if backfill operator-override is permissible OR drop language entirely. (Note: codex didn't catch this because it doesn't have access to user feedback memory.)
- **Backfill stale-read overwrite risk** (codex MEDIUM; claude MEDIUM via dev-server stop). Codex pushes for `updatedAt`/hash compare; claude accepts "stop dev server" operational guidance.

### Concerns flagged by single reviewer (review for inclusion)

- **Claude HIGH — 63-05 script won't compile (3 import/API errors).** Concrete: wrong `db` import (no `{ db }` export), wrong `createModel` path, wrong `resolveRoleModel` signature. Pre-execution typecheck will fail. **Critical fix.**
- **Claude HIGH — Zod schema invariant violation in 63-02.** `.min(2).max(3).default([])` — default `[]` violates `min(2)`. Zod throws. **Critical fix.**
- **Claude MEDIUM — backfill missing `withPipelineRetry`** despite Phase 60 precedent.
- **Claude MEDIUM — PinchTab localhost blocker known from STATE.md.** 63-06 checkpoint will stall.
- **Codex LOW — `--dry-run` writes backup files.** Surprising side effect; should be side-effect-free.
- **Gemini suggestion — `personalityBackfillComplete: true` flag in `config.json`** for UI to detect needs-attention state.

---

## Recommended Action

**Verdict: FIX-FIRST.** Re-run `/gsd:plan-phase 63 --reviews` to incorporate the 4 critical-consensus + Claude HIGH concrete blockers before execution. Specifically:

### Critical fixes (block execution)
1. **Move `prompt-contract.ts` rewrite from 63-01 Task 5 → 63-02 Task 2 atomic commit** (codex HIGH)
2. **Reverse `attachments` bridge direction in 63-03 Task 2 + add carry-forward in 63-05** (codex HIGH)
3. **Don't make `behavioralCore` optional in 63-01 until 63-03 converts readers** (codex HIGH)
4. **Fix 63-05 script imports + API signatures** — `getDb/connectDb/closeDb`, `resolveRoleModel(settings.generator, settings.providers)`, `createModel` correct path (claude HIGH)
5. **Fix Zod schema invariant in 63-02** — `.min(0).max(3).default([])`, enforce ≥2 in prompt text only (claude HIGH)
6. **Resolve OpenRouter embargo conflict** — ask user OR drop carve-out language (claude HIGH)

### Should-fix (improve safety)
7. Add `withPipelineRetry` to backfill `generateObject` call
8. Add real-path verification for 4 ingestion modes in 63-06
9. Add HTTP fallback verification path for PinchTab-blocked checkpoint
10. Re-read before write in backfill (or `updatedAt`/hash compare)
11. Make `--dry-run` side-effect-free
12. Add real V3 card test fixtures to 63-01 mes_example parser

### Nice-to-have (quality polish)
13. `personalityBackfillComplete: true` config flag (gemini)
14. Import constants into pinned tests instead of literals (gemini)
15. Inspector `data-migration-note` for Phase 62 supersession trace (claude)

To incorporate feedback: `/gsd:plan-phase 63 --reviews`
