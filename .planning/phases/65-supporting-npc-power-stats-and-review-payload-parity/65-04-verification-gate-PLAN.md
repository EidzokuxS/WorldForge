---
phase: 65-supporting-npc-power-stats-and-review-payload-parity
plan: 04
slug: verification-gate
type: execute
wave: 3
status: draft
depends_on: [65-01, 65-02, 65-03]
files_modified:
  - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-VALIDATION.md
  - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-SUMMARY.md
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
autonomous: true
requirements: [P65-R9, P65-R10]
must_haves:
  truths:
    - "Full backend Vitest suite exits 0 with all Phase 65 additions integrated (enrich-npc-batch helper, npcs-step integration, regenerate-section integration, saver regression)."
    - "Backend typecheck exits 0."
    - "Frontend component regression test exits 0 — npm --prefix frontend test -- run npcs-section green. Scoped-eslint (PRIMARY gate) exits 0 on the 2 edited files (npcs-section.tsx + npcs-section.test.tsx). Full-repo frontend lint is a secondary aspirational check only."
    - "Phase 60, 63, and 64 existing personality + PowerStats regression tests still pass UNCHANGED: personality-schema.test.ts, npcs-step.test.ts (Phase 64 cases), scaffold-saver.test.ts (pre-existing cases), prompt-assembler.personality.test.ts, npc-agent.personality.test.ts, npc-offscreen.personality.test.ts, reflection-agent.personality.test.ts all exit 0."
    - "Scope gate via git diff against the phase base SHA (merge-base HEAD main) — NOT `git log --since=...`. Untouched-file gate: `git diff --name-only $(git merge-base HEAD main)..HEAD` does NOT list backend/src/worldgen/scaffold-saver.ts, backend/src/character/record-adapters.ts, frontend/components/character-creation/power-stats-section.tsx, backend/src/character/ingestion/power-assessor.ts, or engine files (prompt-assembler.ts / npc-agent.ts / npc-offscreen.ts / reflection-agent.ts). `git status --short` is empty on those files (no uncommitted drift)."
    - "Phase 65 VALIDATION.md exists with status flags wave_0_complete: true and nyquist_compliant: true. Test Framework row narrowed to backend + single frontend component test per CONTEXT specifics block."
    - "65-SUMMARY.md exists with evidence links to each plan's SUMMARY, test outputs, requirement coverage table (P65-R1..P65-R10), and gitnexus change digest."
    - "ROADMAP.md Phase 65 entry updated: Goal populated from CONTEXT, Requirements listed with P65-R1..P65-R10, Plans count reflects 4, plan filenames listed, progress table entry marked Complete."
    - "REQUIREMENTS.md gains a '### Phase 65' section with bullet points P65-R1..P65-R10 (all [x] after gate closes) AND 10 traceability rows mapping each ID to Phase 65."
    - "No code change to scaffold-saver.ts, record-adapters.ts toLegacyNpcDraft function, power-stats-section.tsx, power-assessor.ts (dispatcher reused as-is), or the npcs-section.tsx line-544 render condition (D-07 + D-09 + Option A gates + dispatcher-reuse gate preserved end-to-end)."
  artifacts:
    - path: .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-VALIDATION.md
      provides: "Updated status: wave_0_complete + nyquist_compliant flipped to true; Test Framework narrowed to backend + one frontend component test + scoped-eslint primary; per-task status column reflects actual green state."
      contains: "nyquist_compliant"
    - path: .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-SUMMARY.md
      provides: "Phase-level closeout with evidence links, test outputs, scope summary (via git merge-base diff), and P65-R1..P65-R10 coverage table."
      contains: "P65-R1"
    - path: .planning/ROADMAP.md
      provides: "Phase 65 entry with finalized Goal, Requirements, Plans count, plan filenames, and Complete status."
      contains: "P65-R1"
    - path: .planning/REQUIREMENTS.md
      provides: "Phase 65 requirements section (P65-R1..P65-R10) and traceability rows."
      contains: "P65-R1"
  key_links:
    - from: .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-VALIDATION.md
      to: .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-01-SUMMARY.md
      via: "per-task verification map cites each plan's green test evidence"
      pattern: "65-0"
    - from: .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-SUMMARY.md
      to: .planning/REQUIREMENTS.md
      via: "coverage table references P65-R1..P65-R10"
      pattern: "P65-R"
---

<objective>
Close Phase 65 with a verification gate mirroring the Phase 64 `64-05` pattern. Run the full backend Vitest suite (catches integration drift from Plans 01-03), confirm the targeted frontend regression suite is green, confirm Phase 60/63/64 regressions remain unchanged, use **phase-base git diff** (not `git log --since=...`) to prove untouched-file gates, write `65-VALIDATION.md` + `65-SUMMARY.md`, and update `ROADMAP.md` + `REQUIREMENTS.md` with the new `P65-R1..P65-R10` identifiers.

Per CONTEXT `<specifics>`, this phase is backend-only verification PLUS the single frontend component test added by Plan 03, PLUS scoped-eslint on the 2 edited frontend files as the PRIMARY lint gate (full-repo `npm --prefix frontend run lint` is a secondary aspirational check — Codex MEDIUM fix to avoid false negatives from pre-existing repo-wide lint noise).

Output:
- Backend full suite green.
- Frontend component regression green.
- Scoped-eslint (primary) green on the 2 edited frontend files.
- Existing Phase 60/63/64 personality + PowerStats regressions green (unchanged).
- Untouched-file scope gate proven via `git diff --name-only <merge-base>..HEAD` + `git status --short`.
- `65-VALIDATION.md` written with binary gate flipped to green.
- `65-SUMMARY.md` written with requirement coverage + evidence bundle.
- `ROADMAP.md` + `REQUIREMENTS.md` updated.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-CONTEXT.md
@.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-REVIEWS.md
@.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-01-enrich-npcs-batch-helper-PLAN.md
@.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-02-worldgen-npcs-step-integration-PLAN.md
@.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-03-regenerate-saver-envelope-PLAN.md
@.planning/phases/64-npc-personality-regeneration-parity/64-05-verification-gate-PLAN.md
@CLAUDE.md
@backend/src/engine/__tests__/prompt-assembler.personality.test.ts
@backend/src/engine/__tests__/npc-agent.personality.test.ts
@backend/src/engine/__tests__/npc-offscreen.personality.test.ts
@backend/src/engine/__tests__/reflection-agent.personality.test.ts

<interfaces>
Files modified across Phase 65 Plans 01-03 (expected scope):
- Plan 01: `backend/src/character/enrich-npc-batch.ts` (new), `backend/src/character/__tests__/enrich-npc-batch.test.ts` (new)
- Plan 02: `backend/src/worldgen/scaffold-steps/npcs-step.ts` (edit — gate replaced by post-loop batch call with per-NPC classification synthesis), `backend/src/worldgen/__tests__/npcs-step.test.ts` (edit — 3 new integration tests including once-per-batch assertion)
- Plan 03: `backend/src/routes/__tests__/worldgen.test.ts` (edit — 3 new real-step integration tests), `backend/src/worldgen/__tests__/scaffold-saver.test.ts` (edit — 1 new dbCalls-based regression), `frontend/components/world-review/npcs-section.tsx` (edit — 4 one-line additions in creation handlers), `frontend/components/world-review/__tests__/npcs-section.test.tsx` (edit — extended it.each + null-render test)
- Plan 04: `65-VALIDATION.md` (new), `65-SUMMARY.md` (new), `.planning/ROADMAP.md` (edit), `.planning/REQUIREMENTS.md` (edit)

Untouched files (scope gate — verified via `git diff --name-only <merge-base>..HEAD`):
- backend/src/worldgen/scaffold-saver.ts (D-07)
- backend/src/character/record-adapters.ts (Option A; toLegacyNpcDraft untouched)
- backend/src/character/ingestion/power-assessor.ts (dispatcher reused as-is — no duplicated routing)
- frontend/components/character-creation/power-stats-section.tsx (D-09)
- backend/src/engine/prompt-assembler.ts, npc-agent.ts, npc-offscreen.ts, reflection-agent.ts (Phase 63 regression surface)

Phase 60/63/64 regression targets (must pass unchanged):
- `backend/src/character/__tests__/personality-schema.test.ts` (Phase 64 foundation)
- `backend/src/engine/__tests__/prompt-assembler.personality.test.ts` (Phase 63)
- `backend/src/engine/__tests__/npc-agent.personality.test.ts` (Phase 63)
- `backend/src/engine/__tests__/npc-offscreen.personality.test.ts` (Phase 63)
- `backend/src/engine/__tests__/reflection-agent.personality.test.ts` (Phase 63)
- Phase 60 power-assessor tests in `backend/src/character/ingestion/__tests__/`

P65-R requirement IDs to introduce:
- P65-R1 — All 4 NPC quadrants enrich PowerStats at initial worldgen (Plans 01+02)
- P65-R2 — Shared enrichNpcsBatch helper is single source of truth, DELEGATES to existing assessPowerStats dispatcher (Plan 01)
- P65-R3 — Fail-closed: IngestionPipelineError stage=power_assess propagates on retry exhaustion; no nested retry double-wrap (Plans 01+02+03)
- P65-R4 — Bounded parallel concurrency (<=4 inflight) with test-tunable override (Plan 01)
- P65-R5 — /api/worldgen/regenerate-section section=npcs enriches all 4 quadrants at HTTP boundary; known-IP tests honor research.enabled gate (Plan 03)
- P65-R6 — scaffold-saver preserves draft.powerStats on supporting-tier draft-backed round-trip via mocked dbCalls characterRecord pattern; zero code change (Plan 03)
- P65-R7 — Review UI payload envelope parity: 4 creation handlers attach result.draft; proven by extended it.each assertion across all 4 modes at the handler boundary (Plan 03)
- P65-R8 — PowerStatsSection conditional render contract locked for null case; zero UI production change (Plan 03)
- P65-R9 — Backend-only full-suite verification gate green plus targeted frontend component + scoped-eslint primary (this plan)
- P65-R10 — Phase 60/63/64 personality + PowerStats regressions remain intact; scope gate via phase-base git diff (this plan)
</interfaces>

<project_conventions>
- No watch mode in verification commands — always `test -- run` for pattern-filtered runs
- Full backend suite (canonical per STATE line 302): `cd backend && npm test` (NOT `npm --prefix backend test -- run` — that form only executes a filtered Vitest subset)
- Pattern-filtered backend tests: `npm --prefix backend test -- run <pattern>` (only when a specific file/pattern is the target)
- Typecheck: `npm --prefix backend run typecheck`
- Frontend component test: `npm --prefix frontend test -- run npcs-section`
- **Scoped-eslint (PRIMARY lint gate per Codex MEDIUM):** `npx eslint frontend/components/world-review/npcs-section.tsx frontend/components/world-review/__tests__/npcs-section.test.tsx`
- Full-repo frontend lint is SECONDARY aspirational: `npm --prefix frontend run lint` (may surface pre-existing unrelated noise; not blocking)
- Phase SUMMARY.md follows the template at `$HOME/.claude/get-shit-done/templates/summary.md`
- ROADMAP.md updates populate the Phase 65 Goal + Requirements + Plans list
- REQUIREMENTS.md: add 10 new P65-R* bullets under `### Phase 65 — ...` + 10 new traceability rows
- **Scope gate via git diff (Codex LOW-MEDIUM fix):** use `git diff --name-only $(git merge-base HEAD main)..HEAD` + `git status --short` instead of `git log --since=...` (which misses uncommitted changes and is date-fragile).
</project_conventions>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run backend full suite + typecheck + frontend targeted test + scoped-eslint (P65-R9 binary gate)</name>
  <files>(no edits — verification only)</files>
  <read_first>
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-CONTEXT.md (backend-only scope per STATE D-20)
    - .planning/STATE.md line ~302 — canonical full-suite command is `cd backend && npm test`; `npm --prefix backend test -- run` runs only a filtered subset
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-REVIEWS.md (Codex MEDIUM — scoped-eslint as primary)
    - All 3 prior Phase 65 plan SUMMARYs (65-01-SUMMARY.md, 65-02-SUMMARY.md, 65-03-SUMMARY.md if present)
  </read_first>
  <action>
Per CONTEXT `<specifics>`, Phase 65 test scope is BACKEND full suite + ONE frontend component test + scoped-eslint primary. No browser smoke.

1. Backend full suite (canonical per STATE line 302):
   ```
   cd backend && npm test
   ```
   Expect: exit 0. Capture the test-count line (e.g. "Test Files NN passed (NN) | Tests NNN passed (NNN)").

   NOTE: Do NOT use `npm --prefix backend test -- run` for the full-suite gate — STATE line 302 documents that form only executes a filtered Vitest subset and does NOT satisfy the full-suite requirement.

2. Backend typecheck:
   ```
   npm --prefix backend run typecheck
   ```
   Expect: exit 0.

3. Frontend targeted component test (pattern-filtered — `npm --prefix ... test -- run <pattern>` form is correct here):
   ```
   npm --prefix frontend test -- run npcs-section
   ```
   Expect: exit 0 (Plan 03 Task 4 extended the it.each + added null-render test).

4. **Scoped-eslint (PRIMARY lint gate per Codex MEDIUM):**
   ```
   npx eslint frontend/components/world-review/npcs-section.tsx frontend/components/world-review/__tests__/npcs-section.test.tsx
   ```
   Expect: exit 0 on the 2 edited files. This is the primary gate; full-repo lint is a secondary aspirational check and may be run additionally but is not blocking.

5. (Optional / aspirational) Full-repo frontend lint:
   ```
   npm --prefix frontend run lint
   ```
   Expect: ideally exit 0, but not blocking. If it surfaces pre-existing noise unrelated to Phase 65, document that in the SUMMARY.

6. Capture command outputs for evidence. Save into 65-SUMMARY.md (Task 3).

7. If ANY of the 4 primary commands (backend suite, backend typecheck, frontend npcs-section test, scoped-eslint) fails, STOP. Hand back a failure report. P65-R9 is binary: all 4 primary commands must be green.
  </action>
  <verify>
    <automated>cd backend && npm test && cd .. && npm --prefix backend run typecheck && npm --prefix frontend test -- run npcs-section && npx eslint frontend/components/world-review/npcs-section.tsx frontend/components/world-review/__tests__/npcs-section.test.tsx</automated>
  </verify>
  <acceptance_criteria>
    - `cd backend && npm test` exits 0 (canonical full-suite command per STATE line 302)
    - `npm --prefix backend run typecheck` exits 0
    - `npm --prefix frontend test -- run npcs-section` exits 0
    - `npx eslint frontend/components/world-review/npcs-section.tsx frontend/components/world-review/__tests__/npcs-section.test.tsx` exits 0 (PRIMARY lint gate per Codex MEDIUM)
    - Captured test-count lines recorded for the SUMMARY
  </acceptance_criteria>
  <done>All 4 primary verification commands green; P65-R9 binary gate satisfied.</done>
</task>

<task type="auto">
  <name>Task 2: Confirm Phase 60/63/64 personality + PowerStats regressions still pass unchanged (P65-R10)</name>
  <files>(no edits — verification only)</files>
  <read_first>
    - backend/src/character/__tests__/personality-schema.test.ts (Phase 64 foundation)
    - backend/src/engine/__tests__/prompt-assembler.personality.test.ts (Phase 63)
    - backend/src/engine/__tests__/npc-agent.personality.test.ts (Phase 63)
    - backend/src/engine/__tests__/npc-offscreen.personality.test.ts (Phase 63)
    - backend/src/engine/__tests__/reflection-agent.personality.test.ts (Phase 63)
    - backend/src/worldgen/__tests__/npcs-step.test.ts (Phase 64 personality cases coexisting with new Phase 65 cases)
  </read_first>
  <action>
Run targeted regression commands to isolate each prior-phase coverage area (pattern-filtered form is correct here because each command targets a specific file/pattern):

1. Phase 64 foundation:
   ```
   npm --prefix backend test -- run personality-schema
   ```

2. Phase 63 engine personality regressions (all 4 files):
   ```
   npm --prefix backend test -- run "personality"
   ```
   (Or individually if the pattern over-matches.)

3. Phase 60 character ingestion power-assessor:
   ```
   npm --prefix backend test -- run "assess-original"
   ```

4. Phase 64 worldgen npcs-step personality coverage (must coexist with new Phase 65 cases):
   ```
   npm --prefix backend test -- run npcs-step
   ```

Each command exits 0. Confirm test counts did NOT decrease from pre-Phase-65 baseline.

Engine files UNCHANGED check — use phase-base git diff (Codex LOW-MEDIUM fix; replaces `git log --since=...`):

```
BASE=$(git merge-base HEAD main)
git diff --name-only "$BASE"..HEAD -- backend/src/engine/prompt-assembler.ts backend/src/engine/npc-agent.ts backend/src/engine/npc-offscreen.ts backend/src/engine/reflection-agent.ts
git status --short backend/src/engine/prompt-assembler.ts backend/src/engine/npc-agent.ts backend/src/engine/npc-offscreen.ts backend/src/engine/reflection-agent.ts
```
Both outputs empty.

D-07 + D-09 + Option A + dispatcher-reuse scope gates — same phase-base diff:

```
BASE=$(git merge-base HEAD main)
git diff --name-only "$BASE"..HEAD -- backend/src/worldgen/scaffold-saver.ts backend/src/character/record-adapters.ts backend/src/character/ingestion/power-assessor.ts frontend/components/character-creation/power-stats-section.tsx
git status --short backend/src/worldgen/scaffold-saver.ts backend/src/character/record-adapters.ts backend/src/character/ingestion/power-assessor.ts frontend/components/character-creation/power-stats-section.tsx
```
Both outputs empty for each file.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run personality-schema && npm --prefix backend test -- run "personality" && npm --prefix backend test -- run "assess-original" && npm --prefix backend test -- run npcs-step</automated>
  </verify>
  <acceptance_criteria>
    - All 4 targeted regression commands exit 0
    - **Scope gate via phase-base diff (Codex LOW-MEDIUM — replaces git log --since):** `git diff --name-only $(git merge-base HEAD main)..HEAD -- backend/src/worldgen/scaffold-saver.ts backend/src/character/record-adapters.ts backend/src/character/ingestion/power-assessor.ts frontend/components/character-creation/power-stats-section.tsx` returns empty
    - `git status --short` on the same file set returns empty (no uncommitted drift)
    - `git diff --name-only $(git merge-base HEAD main)..HEAD -- backend/src/engine/prompt-assembler.ts backend/src/engine/npc-agent.ts backend/src/engine/npc-offscreen.ts backend/src/engine/reflection-agent.ts` returns empty
    - Phase 64 personality cases in npcs-step.test.ts still present: `grep -c "personality" backend/src/worldgen/__tests__/npcs-step.test.ts` >= prior baseline
  </acceptance_criteria>
  <done>All Phase 60/63/64 regressions green; Phase 65 scope strictly contained to the intended files via phase-base git diff; D-07 + D-09 + Option A + dispatcher-reuse gates proven preserved.</done>
</task>

<task type="auto">
  <name>Task 3: Write 65-VALIDATION.md + 65-SUMMARY.md with evidence bundle</name>
  <files>.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-VALIDATION.md,.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-SUMMARY.md</files>
  <read_first>
    - .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md (structural template)
    - .planning/phases/64-npc-personality-regeneration-parity/64-SUMMARY.md (structural template)
    - $HOME/.claude/get-shit-done/templates/summary.md (template if exists)
    - All 3 Phase 65 plan SUMMARYs (65-01, 65-02, 65-03)
    - Captured test outputs from Task 1 + Task 2
  </read_first>
  <action>
**Step A — write 65-VALIDATION.md:**

Mirror the Phase 64 `64-VALIDATION.md` shape. Frontmatter:

```yaml
###
phase: 65-supporting-npc-power-stats-and-review-payload-parity
status: complete
wave_0_complete: true
nyquist_compliant: true
verified_on: 2026-04-19   # replace with actual date
test_framework: "backend Vitest + single frontend component Vitest + scoped-eslint (primary lint gate); no browser/PinchTab per CONTEXT specifics block + STATE D-20"
full_suite_command: "cd backend && npm test && npm --prefix frontend test -- run npcs-section && npx eslint frontend/components/world-review/npcs-section.tsx frontend/components/world-review/__tests__/npcs-section.test.tsx"
###
```

Per-task verification map:

```
| Task | Description | Wave | Reqs | Kind | Command | Green |
|------|-------------|------|------|------|---------|-------|
| 65-01-01/02 | enrich-npc-batch helper (delegates to assessPowerStats) + unit tests including anti-nested-retry | 1 | P65-R1, P65-R2, P65-R3, P65-R4 | unit | npm --prefix backend test -- run enrich-npc-batch | ✅ |
| 65-02-01/02 | npcs-step integration (gate replaced, once-per-batch architecture) | 2 | P65-R1 | integration | npm --prefix backend test -- run npcs-step | ✅ |
| 65-03-01 | regenerate-section real-step integration (research.enabled gate honored) | 2 | P65-R5 | integration | npm --prefix backend test -- run worldgen | ✅ |
| 65-03-02 | scaffold-saver supporting-tier via dbCalls characterRecord | 2 | P65-R6 | integration | npm --prefix backend test -- run scaffold-saver | ✅ |
| 65-03-03 | frontend handler envelope fix (4 one-liners) | 2 | P65-R7 | component | npx eslint <2 files> | ✅ |
| 65-03-04 | frontend it.each extended (all modes, draft?.powerStats) + null-render test | 2 | P65-R7, P65-R8 | component | npm --prefix frontend test -- run npcs-section | ✅ |
| 65-04-01 | backend full-suite + typecheck + frontend component + scoped-eslint | 3 | P65-R9 | full | cd backend && npm test && npm --prefix backend run typecheck && npm --prefix frontend test -- run npcs-section && npx eslint <2 files> | ✅ |
| 65-04-02 | Phase 60/63/64 regressions intact + phase-base git diff scope gate | 3 | P65-R10 | regression | npm --prefix backend test -- run "personality" && npm --prefix backend test -- run "assess-original" && git diff --name-only $(git merge-base HEAD main)..HEAD -- <untouched files> | ✅ |
```

Scope gate table:

```
| Gate | Rule | Evidence |
|------|------|----------|
| D-01 | Known-IP supporting → enrichKnownIpWorldgenNpcDraft via assessPowerStats dispatcher | Plan 01 Test 2 + Plan 02 Test A |
| D-02 | Original world both tiers → assessOriginalCharacterPowerStats via assessPowerStats dispatcher | Plan 01 Tests 3+4 + Plan 02 Test B |
| D-03 | No Human-default shortcut | grep count = 0 in enrich-npc-batch.ts + npcs-step.ts |
| D-04 | Fail-closed IngestionPipelineError on retry exhaustion; anti-nested-retry (original branch ≤ 3 attempts, not 9) | Plan 01 Test 6 leafCalls === 3 + Plan 02 Test C + Plan 03 Test 3 |
| D-05 | Bounded parallel concurrency <=4 with test-tunable override | Plan 01 Test 8 + Test 9 |
| D-06 | Shared helper co-located per Phase 64 pattern; dispatcher reused (no routing duplication) | enrich-npc-batch.ts imports assessPowerStats; grep "canonicalStatus" in enrich-npc-batch.ts = 0 |
| D-07 | scaffold-saver.ts zero code change | phase-base git diff empty |
| D-08 | Real-step integration tests with LLM seam mock | Plan 03 Task 1 (3 real-step HTTP tests) |
| D-09 | PowerStatsSection + line-544 zero UI production change | phase-base git diff empty on power-stats-section.tsx; line-544 render condition unchanged |
| Dispatcher-reuse | power-assessor.ts zero code change | phase-base git diff empty |
```

**Step B — write 65-SUMMARY.md:**

```markdown
###
phase: 65-supporting-npc-power-stats-and-review-payload-parity
status: complete
completed: 2026-04-19   # replace with actual date
###

# Phase 65 — Supporting NPC Power Stats and Review Payload Parity — SUMMARY

## Outcome
Closed the supporting-NPC PowerStats gap end-to-end. Every scaffold NPC produced by initial worldgen OR `/api/worldgen/regenerate-section section=npcs` now carries `draft.powerStats` regardless of quadrant (known-IP key, known-IP supporting, original key, original supporting). The shared `enrichNpcsBatch` helper DELEGATES to the existing `assessPowerStats` dispatcher at `backend/src/character/ingestion/power-assessor.ts:38` — routing rules are NOT duplicated. Retry ownership stays at the single existing layer (internal to `assessOriginalCharacterPowerStats`); no nested retry double-wrap — proven by `leafCalls === 3` in Plan 01 Test 6. Review UI payload envelope preserves `draft.powerStats` through the 4 creation handlers, verified at the handler boundary by the extended `it.each` test (all 4 modes). Fail-closed contract proven at module, route, and HTTP boundaries. Zero code change to `scaffold-saver.ts`, `record-adapters.ts toLegacyNpcDraft`, `power-assessor.ts` (dispatcher reused as-is), or `PowerStatsSection` (D-07, D-09, Option A, dispatcher-reuse gates preserved).

## Plans Executed

| Plan | Slug | Wave | Status |
|------|------|------|--------|
| 65-01 | enrich-npcs-batch-helper | 1 | Complete |
| 65-02 | worldgen-npcs-step-integration | 2 | Complete |
| 65-03 | regenerate-saver-envelope | 2 | Complete |
| 65-04 | verification-gate | 3 | Complete |

## Requirement Coverage

| Requirement | Plan(s) | Evidence |
|-------------|---------|----------|
| P65-R1 (all 4 quadrants enrich at initial worldgen + regenerate) | 65-01, 65-02, 65-03 | enrich-npc-batch routing tests (via assessPowerStats) + npcs-step integration tests + regenerate-section HTTP tests |
| P65-R2 (shared enrichNpcsBatch helper delegates to existing assessPowerStats dispatcher; no routing duplication) | 65-01 | enrich-npc-batch.ts imports assessPowerStats; grep "canonicalStatus" in helper = 0 |
| P65-R3 (fail-closed IngestionPipelineError on retry exhaustion + anti-nested-retry) | 65-01, 65-02, 65-03 | Test 6 in Plan 01 proves leafCalls === 3 (not 9); Test C in Plan 02; Test 3 in Plan 03 |
| P65-R4 (bounded parallel concurrency <=4 with test-tunable override) | 65-01 | Tests 8 + 9 in Plan 01 |
| P65-R5 (/regenerate-section enriches all 4 quadrants at HTTP boundary; research.enabled gate honored) | 65-03 | 3 real-step integration tests in worldgen.test.ts with research.enabled=true on known-IP cases |
| P65-R6 (scaffold-saver preserves draft.powerStats on supporting-tier round-trip via mocked dbCalls, zero code change) | 65-03 | scaffold-saver.test.ts supporting-tier dbCalls+characterRecord assertion + phase-base git diff empty |
| P65-R7 (review UI envelope parity via 4-handler fix, proven at handler boundary) | 65-03 | 4 one-line additions in npcs-section.tsx; extended it.each (all modes) asserts createdNpc.draft?.powerStats |
| P65-R8 (PowerStatsSection null-render conditional lock; zero UI production change) | 65-03 | 1 null-render test in npcs-section.test.tsx + phase-base git diff empty on power-stats-section.tsx |
| P65-R9 (backend full suite + typecheck + frontend component + scoped-eslint all green) | 65-04 | Task 1 evidence |
| P65-R10 (Phase 60/63/64 personality + PowerStats regressions intact; untouched-file scope gate via merge-base diff) | 65-04 | Task 2 evidence; phase-base `git diff --name-only <merge-base>..HEAD` empty on engine + saver + adapter + dispatcher + power-stats-section files |

## Verification Evidence

### Backend Full Suite
```
<paste output of `cd backend && npm test`>
```

### Backend Typecheck
```
<paste exit code and any condensed output>
```

### Frontend Component Regression
```
<paste output of npm --prefix frontend test -- run npcs-section>
```

### Scoped-eslint (PRIMARY lint gate)
```
<paste output of npx eslint frontend/components/world-review/npcs-section.tsx frontend/components/world-review/__tests__/npcs-section.test.tsx>
```

### Phase 60/63/64 Regression Coverage
```
<paste output of targeted regression commands>
```

### Scope Gate — Phase-base git diff (Codex LOW-MEDIUM)
```
<paste output of:
  BASE=$(git merge-base HEAD main)
  git diff --name-only "$BASE"..HEAD -- backend/src/worldgen/scaffold-saver.ts backend/src/character/record-adapters.ts backend/src/character/ingestion/power-assessor.ts frontend/components/character-creation/power-stats-section.tsx backend/src/engine/prompt-assembler.ts backend/src/engine/npc-agent.ts backend/src/engine/npc-offscreen.ts backend/src/engine/reflection-agent.ts
  git status --short  on the same file set>

Expected: empty.
```

### gitnexus_detect_changes — Phase 65 Scope
```
<paste output — expect the file set listed below>
```

## Files Changed

| File | Plan | Kind |
|------|------|------|
| backend/src/character/enrich-npc-batch.ts | 65-01 | new |
| backend/src/character/__tests__/enrich-npc-batch.test.ts | 65-01 | new |
| backend/src/worldgen/scaffold-steps/npcs-step.ts | 65-02 | edit |
| backend/src/worldgen/__tests__/npcs-step.test.ts | 65-02 | edit |
| backend/src/routes/__tests__/worldgen.test.ts | 65-03 | edit |
| backend/src/worldgen/__tests__/scaffold-saver.test.ts | 65-03 | edit |
| frontend/components/world-review/npcs-section.tsx | 65-03 | edit |
| frontend/components/world-review/__tests__/npcs-section.test.tsx | 65-03 | edit |
| .planning/phases/65-.../65-VALIDATION.md | 65-04 | new |
| .planning/phases/65-.../65-SUMMARY.md | 65-04 | new |
| .planning/ROADMAP.md | 65-04 | edit |
| .planning/REQUIREMENTS.md | 65-04 | edit |

## Scope Gates Preserved

- D-07 — scaffold-saver.ts zero code change: phase-base diff on `backend/src/worldgen/scaffold-saver.ts` empty.
- D-09 — PowerStatsSection + line-544 zero UI production change: phase-base diff on `frontend/components/character-creation/power-stats-section.tsx` empty; the `{npc.draft?.powerStats ? ... : null}` render condition at npcs-section.tsx:544 unchanged.
- Claude's Discretion Option A — least-invasive envelope fix: phase-base diff on `backend/src/character/record-adapters.ts` empty; only frontend handlers changed (4 one-liners).
- **Dispatcher-reuse gate (Phase 65 review):** phase-base diff on `backend/src/character/ingestion/power-assessor.ts` empty — the existing `assessPowerStats` dispatcher is reused as-is; routing rules are NOT duplicated in `enrich-npc-batch.ts`.
- Engine files untouched: phase-base diff on `backend/src/engine/prompt-assembler.ts`, `npc-agent.ts`, `npc-offscreen.ts`, `reflection-agent.ts` empty.

## Next

- None. Phase 65 closes the supporting-NPC PowerStats + review payload envelope gap.
- Deferred follow-ups per CONTEXT `<deferred>`: legacy backfill script, on-load retroactive enrichment, UI "Enrich now" button, missing-stats empty-state redesign, creation-tier flip timing rework, supporting-tier aware prompt variant, canon-branch retry policy.
```

Fill in actual command outputs from Task 1 and Task 2 into the Verification Evidence section.

**Step C — verify by re-reading both files:**

- `nyquist_compliant: true` present in VALIDATION.md
- `wave_0_complete: true` present in VALIDATION.md
- 10 rows in the Requirement Coverage table of SUMMARY.md (P65-R1..P65-R10)
- Scope Gates Preserved section includes D-07, D-09, Option A, dispatcher-reuse evidence lines
  </action>
  <verify>
    <automated>test -f .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-SUMMARY.md && test -f .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-VALIDATION.md && grep -c "P65-R" .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-SUMMARY.md</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-VALIDATION.md` exists with `nyquist_compliant: true` and `wave_0_complete: true` in the frontmatter
    - `.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-SUMMARY.md` exists
    - `grep -c "P65-R" .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-SUMMARY.md` returns >= 10
    - 65-VALIDATION.md per-task table has all rows marked with the green check marker
    - Scope Gates Preserved section in 65-SUMMARY.md references D-07, D-09, Option A, AND the dispatcher-reuse gate explicitly
    - 65-SUMMARY.md Verification Evidence section cites the phase-base git diff command (not `git log --since`)
    - 65-SUMMARY.md contains "Files Changed" table with >= 8 source-file rows + 4 doc-file rows
  </acceptance_criteria>
  <done>65-VALIDATION.md status flipped to green; 65-SUMMARY.md written with evidence + requirement coverage + phase-base scope gate + scoped-eslint primary lint note.</done>
</task>

<task type="auto">
  <name>Task 4: Update ROADMAP.md + REQUIREMENTS.md with Phase 65 closure (P65-R1..P65-R10 IDs introduced)</name>
  <files>.planning/ROADMAP.md,.planning/REQUIREMENTS.md</files>
  <read_first>
    - .planning/ROADMAP.md (Phase 65 section — currently has `Goal: [To be planned]` and `Requirements: TBD`)
    - .planning/REQUIREMENTS.md (Phase 64 requirement block for format reference)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-SUMMARY.md (just-written)
    - .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-CONTEXT.md (for goal wording)
  </read_first>
  <action>
**Step A — update ROADMAP.md Phase 65 section:**

Find the block for Phase 65. Replace placeholders:

```markdown
### Phase 65: Supporting NPC Power Stats and Review Payload Parity

**Goal:** Close the remaining review/runtime gap where supporting NPCs lose visible power stats — worldgen's `npcs-step` and the regenerate-section route handler both enrich every NPC (key + supporting) in both worlds (known-IP + original) via a shared `enrichNpcsBatch` helper that DELEGATES to the existing `assessPowerStats` dispatcher (no routing duplication), fail-closed on retry exhaustion (single-layer retry ownership, no nested double-wrap), and the review UI payload envelope preserves `draft.powerStats` through creation so the PowerStatsSection renders for freshly-created supporting NPCs.
**Requirements:** P65-R1, P65-R2, P65-R3, P65-R4, P65-R5, P65-R6, P65-R7, P65-R8, P65-R9, P65-R10
**Gap Closure:** Closes the post-Phase-60/64 scaffold gap where `npcs-step.ts:679` enrichment gate left 3 of 4 NPC quadrants (known-IP supporting, original key, original supporting) without `draft.powerStats`, plus the `toLegacyNpcDraft` strips `draft` envelope issue that hid PowerStats from newly-created NPCs in World Review.
**Depends on:** Phase 64
**Plans:** 4 plans

Plans:
- [x] 65-01-enrich-npcs-batch-helper-PLAN.md — Shared enrichNpcsBatch module delegating to the existing assessPowerStats dispatcher with bounded parallel batching; no outer withPipelineRetry wrap (avoids nested retry on original branch); unit-tested in isolation including anti-nested-retry invariant.
- [x] 65-02-worldgen-npcs-step-integration-PLAN.md — Replace the line-679 gate with a single post-loop enrichNpcsBatch call covering every NPC; integration tests assert both tiers in both worlds + enrichment runs once per step (architecture lock).
- [x] 65-03-regenerate-saver-envelope-PLAN.md — Real-step HTTP integration tests on /regenerate-section (research.enabled=true on known-IP), scaffold-saver supporting-tier round-trip regression via mocked dbCalls characterRecord (D-07 zero code change), 4-handler frontend envelope fix (Option A), extended it.each handler-flow proof across all creation modes, and null-render secondary test (D-09 zero UI code change).
- [x] 65-04-verification-gate-PLAN.md — Backend full suite + typecheck + frontend component + scoped-eslint green; Phase 60/63/64 regressions intact; phase-base git diff scope gate; ROADMAP + REQUIREMENTS updated with P65-R1..P65-R10.
```

In the Phase progress table, add:

```markdown
| 65. Supporting NPC Power Stats and Review Payload Parity | 4/4 | Complete | 2026-04-19 |
```

**Step B — update REQUIREMENTS.md:**

Add a new section for Phase 65 right after the Phase 64 block:

```markdown
### Phase 65 — Supporting NPC Power Stats and Review Payload Parity

- [x] **P65-R1**: Every worldgen-produced scaffold NPC (known-IP key, known-IP supporting, original key, original supporting) carries `draft.powerStats` after both initial scaffold generation and `/api/worldgen/regenerate-section section=npcs`.
- [x] **P65-R2**: Shared helper module `backend/src/character/enrich-npc-batch.ts` exports `enrichNpcsBatch` as the single source of truth for per-NPC power-stats delegation; the helper DELEGATES to the existing `assessPowerStats` dispatcher at `backend/src/character/ingestion/power-assessor.ts:38` (no duplicated routing rules); both `backend/src/worldgen/scaffold-steps/npcs-step.ts` and the regenerate-section handler consume the helper.
- [x] **P65-R3**: Per-NPC enrichment propagates `IngestionPipelineError` unchanged on retry exhaustion; the batch aborts and no partial results are returned. **Retry ownership stays at the single existing layer** (internal to `assessOriginalCharacterPowerStats`) — `enrichNpcsBatch` does NOT wrap in outer `withPipelineRetry`, avoiding nested retries that would inflate original-branch attempt counts to 9 (3 × 3). No Human-default shortcut exists.
- [x] **P65-R4**: `enrichNpcsBatch` bounds parallel concurrency to <=4 inflight per-NPC assessPowerStats calls by default; concurrency is test-tunable via an optional parameter.
- [x] **P65-R5**: `/api/worldgen/regenerate-section section=npcs` returns NPC drafts with fully-populated `powerStats` for both tiers in both world modes; proven by real-step integration tests that mock only innermost seams and exercise the real HTTP route + real `generateNpcsStep` + real `enrichNpcsBatch` + real `assessPowerStats` dispatcher. Known-IP quadrant tests explicitly set `fakeSettings.research.enabled=true` to satisfy the dispatcher's precondition at `power-assessor.ts:64`.
- [x] **P65-R6**: `reconcileDraftBackedScaffoldNpc` preserves `draft.powerStats` on draft-backed supporting-tier round-trip through `saveScaffoldToDb`. Proven by a new regression test that inspects the MOCKED `dbCalls` transaction log and JSON.parses the serialized `characterRecord` field (matching the pre-existing pattern at `scaffold-saver.test.ts:361` and `line 387`); `backend/src/worldgen/scaffold-saver.ts` code unchanged (D-07 gate).
- [x] **P65-R7**: Review UI payload envelope preserves the authoritative `draft` returned by every ingestion route — the 4 creation handlers in `frontend/components/world-review/npcs-section.tsx` (handleParse, handleGenerate, handleResearch, handleImport) attach `result.draft` onto the merged scaffold NPC so `draft.powerStats` survives the spread-merge pattern. Proof is at the HANDLER BOUNDARY via the extended `it.each` creation-flow test at `npcs-section.test.tsx:387` asserting `createdNpc.draft?.powerStats` across all creation modes. `backend/src/character/record-adapters.ts toLegacyNpcDraft` is unchanged (Option A gate).
- [x] **P65-R8**: `PowerStatsSection` conditional render contract at `npcs-section.tsx:544` is locked by a null-render regression test: when `draft.powerStats` is null, no PowerStatsSection markup renders. `frontend/components/character-creation/power-stats-section.tsx` and the line-544 render condition are unchanged (D-09 gate).
- [x] **P65-R9**: Full backend Vitest suite (via `cd backend && npm test` — the canonical command per STATE line 302) exits 0; backend typecheck exits 0; `npm --prefix frontend test -- run npcs-section` exits 0; scoped-eslint on the 2 edited frontend files (PRIMARY lint gate) exits 0. Binary backend-first gate per CONTEXT `<specifics>` + STATE D-20. Full-repo frontend lint is a secondary aspirational check only.
- [x] **P65-R10**: Phase 60 power-assessor + Phase 63 engine personality regressions + Phase 64 personality-schema and npcs-step Phase 64 coverage remain green without modification. `backend/src/engine/prompt-assembler.ts`, `npc-agent.ts`, `npc-offscreen.ts`, `reflection-agent.ts` UNCHANGED in Phase 65. Scope gate proven via `git diff --name-only $(git merge-base HEAD main)..HEAD` + `git status --short` (replaces unreliable `git log --since`).
```

Update the Traceability table at the bottom of REQUIREMENTS.md with 10 new rows:

```markdown
| P65-R1 | Phase 65 | Complete |
| P65-R2 | Phase 65 | Complete |
| P65-R3 | Phase 65 | Complete |
| P65-R4 | Phase 65 | Complete |
| P65-R5 | Phase 65 | Complete |
| P65-R6 | Phase 65 | Complete |
| P65-R7 | Phase 65 | Complete |
| P65-R8 | Phase 65 | Complete |
| P65-R9 | Phase 65 | Complete |
| P65-R10 | Phase 65 | Complete |
```

Update the coverage counter at the bottom of REQUIREMENTS.md by adding 10 to the v1.1 total.

**Step C — commit all Phase 65 docs changes:**

```
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs(65): close phase 65 supporting NPC PowerStats + review payload parity" --files .planning/ROADMAP.md .planning/REQUIREMENTS.md .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-VALIDATION.md .planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-SUMMARY.md
```

(Only if CLAUDE.md / user policy permits the commit at this stage. The phase orchestrator may handle the final commit — in that case, skip and let it happen downstream.)
  </action>
  <verify>
    <automated>grep -c "P65-R" .planning/REQUIREMENTS.md && grep -c "65-01-enrich-npcs-batch-helper-PLAN.md" .planning/ROADMAP.md</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/ROADMAP.md` Phase 65 block lists all 10 P65-R requirements in its Requirements line: `grep "P65-R1.*P65-R2.*P65-R3.*P65-R4.*P65-R5.*P65-R6.*P65-R7.*P65-R8.*P65-R9.*P65-R10" .planning/ROADMAP.md` matches >= 1
    - `.planning/ROADMAP.md` Phase 65 Plans count says "4 plans"
    - `.planning/ROADMAP.md` contains all 4 plan filenames: `grep -c "65-0[1-4]-.*-PLAN.md" .planning/ROADMAP.md` returns >= 4
    - `.planning/ROADMAP.md` Goal field no longer contains "[To be planned]" for Phase 65
    - `.planning/REQUIREMENTS.md` contains a "### Phase 65" section with 10 bullet points (P65-R1 through P65-R10)
    - `.planning/REQUIREMENTS.md` Traceability table contains 10 P65-R* rows mapped to Phase 65
    - REQUIREMENTS.md coverage counter updated to reflect 10 new requirements
  </acceptance_criteria>
  <done>ROADMAP.md + REQUIREMENTS.md reflect Phase 65 closure; all 10 requirement IDs introduced and traceable; text accurately describes the dispatcher-reuse + single-layer-retry + handler-flow-proof architecture.</done>
</task>

</tasks>

<verification>
- `cd backend && npm test` exits 0 (P65-R9 backend full suite — canonical command per STATE line 302).
- `npm --prefix backend run typecheck` exits 0.
- `npm --prefix frontend test -- run npcs-section` exits 0.
- `npx eslint frontend/components/world-review/npcs-section.tsx frontend/components/world-review/__tests__/npcs-section.test.tsx` exits 0 (primary lint gate).
- All Phase 60/63/64 targeted regression tests exit 0 individually (P65-R10).
- Phase-base git diff (`git diff --name-only $(git merge-base HEAD main)..HEAD`) and `git status --short` return empty on untouched files: scaffold-saver.ts, record-adapters.ts, power-assessor.ts, power-stats-section.tsx, engine files.
- `.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-VALIDATION.md` has `nyquist_compliant: true`, `wave_0_complete: true`.
- `.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-SUMMARY.md` exists with P65-R1..P65-R10 coverage table AND dispatcher-reuse gate evidence.
- `.planning/ROADMAP.md` Phase 65 block finalized (Goal populated, Requirements listed, 4 plans, status Complete).
- `.planning/REQUIREMENTS.md` has Phase 65 section + 10 traceability rows.
- gitnexus_detect_changes across Phase 65 branch shows exactly the expected file set (8 source + 4 docs).
</verification>

<success_criteria>
- Phase 65 closes with all 4 primary verification commands green (backend suite, typecheck, frontend component, scoped-eslint).
- Evidence bundle (65-SUMMARY.md) links each of the 10 requirements to concrete test evidence.
- Scope gates (D-07, D-09, Option A, dispatcher-reuse) proven preserved by empty phase-base git diffs on the respective files.
- ROADMAP.md + REQUIREMENTS.md accurately describe Phase 65 outcomes (4 plans, 10 requirements, Phase 65 Complete, dispatcher-reuse + single-layer retry + handler-flow-proof architecture).
- No regressions on Phase 60/63/64 coverage.
</success_criteria>

<requirement_coverage>
- **P65-R9** — Task 1 runs all 4 primary verification commands; acceptance criteria gate on exit 0 for each. Scoped-eslint is the PRIMARY lint gate per Codex MEDIUM.
- **P65-R10** — Task 2 runs Phase 60/63/64 targeted regression tests + verifies engine/saver/adapter/dispatcher/power-stats-section files unchanged via phase-base git diff (replaces `git log --since=...` per Codex LOW-MEDIUM).
</requirement_coverage>

<estimates>
- Effort: ~35-45 min Claude execution (backend suite is I/O-bound; doc writes are straightforward).
- Full backend suite runtime: ~2-3 min.
- Backend typecheck: ~30s.
- Frontend component test: < 30s.
- Scoped-eslint: < 10s.
</estimates>

<risks>
- **R1 — Pre-existing backend test failures.** If a backend test was red before Phase 65 (unlikely given STATE), that is outside Phase 65 scope but blocks the binary gate. Mitigation: the gate is binary; diagnose; either a Phase 65 change broke it (fix) or it was always red (escalate as a quick task).
- **R2 — Scoped-eslint false negatives.** If the 2 edited frontend files somehow pass eslint but contain new violations (unlikely given the 4-line additive change), rerun with `--max-warnings=0`. Mitigation: scoped-eslint default behavior treats warnings as non-blocking; if the project requires warnings=errors, wire `--max-warnings=0` into the command.
- **R3 — ROADMAP/REQUIREMENTS schema drift.** Both docs have specific formatting conventions. Mitigation: Task 4 Step B explicitly follows the Phase 64 section pattern; read REQUIREMENTS.md first and match format exactly.
- **R4 — gitnexus report staleness.** Index may be stale at phase close. Mitigation: run `npx gitnexus analyze` before detect_changes if needed.
- **R5 — `git merge-base HEAD main` when branch naming differs.** If the phase branch's base is not `main` (e.g. `develop`), use that instead. Mitigation: STATE.md confirms project uses `develop` branch; the Task 2 command should use `git merge-base HEAD develop` OR whichever branch the phase forked from. Verify by reading STATE line or by running `git log --first-parent --oneline | head -5` to identify the merge base's parent. Default: if STATE says develop, use develop.
</risks>

<output>
Final phase artifact: `.planning/phases/65-supporting-npc-power-stats-and-review-payload-parity/65-SUMMARY.md` is the main evidence bundle. Per-plan SUMMARYs from 65-01..65-03 remain in place as granular evidence. No separate 65-04-SUMMARY.md needed — this plan's outcome lives in 65-SUMMARY.md directly.
</output>
