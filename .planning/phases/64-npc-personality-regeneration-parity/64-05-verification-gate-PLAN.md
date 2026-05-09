---
phase: 64-npc-personality-regeneration-parity
plan: 05
slug: verification-gate
type: execute
wave: 4
status: draft
depends_on: [64-02, 64-03, 64-04]
files_modified:
  - .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md
  - .planning/phases/64-npc-personality-regeneration-parity/64-SUMMARY.md
  - .planning/ROADMAP.md
  - .planning/REQUIREMENTS.md
autonomous: true
requirements: [P64-R7, P64-R8]
must_haves:
  truths:
    - "P64-R7 is BACKEND-ONLY per CONTEXT.md GA-6 (D-13..D-15 specify only backend unit + backend integration + backend script tests). Frontend tests are explicitly outside Phase 64 scope per D-16 (PinchTab E2E optional). The gate MUST be binary: backend suite green = pass; no 'pre-existing frontend failure' escape hatch."
    - "Full backend Vitest suite exits 0 with all Phase 64 additions integrated (personality-schema, npcs-step, worldgen route integration, backfill incomplete-pack)"
    - "Existing Phase 63 regression tests still pass UNCHANGED — Phase 64 did not touch engine prompt assembly or NPC consumer code. The four personality regression targets that exist in the repo are: prompt-assembler.personality.test.ts, npc-agent.personality.test.ts, npc-offscreen.personality.test.ts, reflection-agent.personality.test.ts. All four MUST pass unchanged."
    - "gitnexus_detect_changes across all Phase 64 plans shows a clean set: personality-schema.ts + its test, npcs-step.ts + its test, npc-generator.ts, worldgen.test.ts (integration), backfill-personality.ts + its test. No unexpected files"
    - "Phase 64 VALIDATION.md frontmatter status flips to wave_0_complete: true and nyquist_compliant: true after all gates pass; Test Framework row in VALIDATION.md narrowed to backend-only to match P64-R7 scope"
    - "64-SUMMARY.md exists with evidence links to each plan's SUMMARY, test outputs, and gitnexus reports"
    - "npm --prefix backend test -- run exits 0 across the whole backend"
    - "npm --prefix backend run typecheck exits 0"
    - "ROADMAP.md Phase 64 entry updated: Plans count reflects 5, plan filenames listed, status = Complete"
    - "REQUIREMENTS.md gains P64-R1..P64-R8 rows under a Phase 64 section (all [x] after gate closes)"
  artifacts:
    - path: .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md
      provides: "Updated status: wave_0_complete + nyquist_compliant flipped to true; Test Framework narrowed to backend-only; per-task status column reflects actual green state"
      contains: "nyquist_compliant: true"
    - path: .planning/phases/64-npc-personality-regeneration-parity/64-SUMMARY.md
      provides: "Phase-level closeout with evidence links, test outputs, and scope summary"
      contains: "P64-R1"
    - path: .planning/ROADMAP.md
      provides: "Phase 64 entry with finalized Requirements, Plans count, and plan filenames"
      contains: "P64-R1"
    - path: .planning/REQUIREMENTS.md
      provides: "Phase 64 requirements section (P64-R1..P64-R8) and traceability rows"
      contains: "P64-R1"
  key_links:
    - from: .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md
      to: .planning/phases/64-npc-personality-regeneration-parity/64-01-SUMMARY.md
      via: "per-task verification map cites each plan's green test evidence"
      pattern: "64-0"
    - from: .planning/phases/64-npc-personality-regeneration-parity/64-SUMMARY.md
      to: .planning/REQUIREMENTS.md
      via: "coverage table references P64-R1..P64-R8"
      pattern: "P64-R"
---

<objective>
Close Phase 64 with a BACKEND-ONLY full-suite verification gate and documentation artifacts. Run the full backend Vitest suite (catches integration-level drift from Plans 01-04), confirm the Phase 63 personality regression tests still pass unchanged (P64-R8 — four real test files), flip VALIDATION.md status flags, and write 64-SUMMARY.md + update ROADMAP.md + REQUIREMENTS.md.

Codex B5 resolution: P64-R7 is BINARY and BACKEND-ONLY. CONTEXT.md GA-6 D-13..D-15 specify only backend tests. D-16 deferred PinchTab E2E. No frontend test requirement was ever locked. This plan narrows VALIDATION.md Test Framework row accordingly and removes the self-contradictory "pre-existing frontend failures allowed" escape hatch.

Codex B6 resolution: `files_modified` now includes `.planning/ROADMAP.md` and `.planning/REQUIREMENTS.md` — the actual writes in Task 4.

Codex B7 resolution: the regression targets in P64-R8 use REAL filenames verified present in the repo: `prompt-assembler.personality.test.ts`, `npc-agent.personality.test.ts`, `npc-offscreen.personality.test.ts`, `reflection-agent.personality.test.ts`.

Codex L1 resolution: stale risk note about "frontend test script missing" removed — `frontend/package.json` has `"test": "vitest"` and that scope is out of Phase 64 anyway.

Output:
- Full BACKEND suite green
- 4 Phase 63 personality regression tests pass unchanged
- 64-VALIDATION.md status flags updated; Test Framework row backend-only
- 64-SUMMARY.md created with evidence bundle
- ROADMAP.md + REQUIREMENTS.md updated
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
@.planning/phases/64-npc-personality-regeneration-parity/64-CONTEXT.md
@.planning/phases/64-npc-personality-regeneration-parity/64-RESEARCH.md
@.planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md
@.planning/phases/64-npc-personality-regeneration-parity/64-REVIEWS.md
@.planning/phases/64-npc-personality-regeneration-parity/64-01-personality-schema-foundation-PLAN.md
@.planning/phases/64-npc-personality-regeneration-parity/64-02-worldgen-npcs-step-fix-PLAN.md
@.planning/phases/64-npc-personality-regeneration-parity/64-03-regenerate-integration-test-PLAN.md
@.planning/phases/64-npc-personality-regeneration-parity/64-04-backfill-incomplete-pack-PLAN.md
@CLAUDE.md
@backend/src/engine/__tests__/prompt-assembler.personality.test.ts
@backend/src/engine/__tests__/npc-agent.personality.test.ts
@backend/src/engine/__tests__/npc-offscreen.personality.test.ts
@backend/src/engine/__tests__/reflection-agent.personality.test.ts

<interfaces>
<!-- Phase 63 regression targets (P64-R8) — ALL FOUR exist in the repo, verified by grep: -->
```
backend/src/engine/__tests__/prompt-assembler.personality.test.ts
backend/src/engine/__tests__/npc-agent.personality.test.ts
backend/src/engine/__tests__/npc-offscreen.personality.test.ts
backend/src/engine/__tests__/reflection-agent.personality.test.ts
```
These tests lock engine-side personality behavior. Phase 64 does not touch any engine file (prompt-assembler, npc-agent, npc-offscreen, reflection-agent), so all four must remain green without modification.

<!-- Files modified across Phase 64 Plans 01-04: -->
```
Plan 01: backend/src/character/personality-schema.ts (new)
         backend/src/character/__tests__/personality-schema.test.ts (new)
Plan 02: backend/src/worldgen/scaffold-steps/npcs-step.ts (edit)
         backend/src/worldgen/__tests__/npcs-step.test.ts (edit)
         backend/src/character/npc-generator.ts (edit)
Plan 03: backend/src/routes/__tests__/worldgen.test.ts (edit; possibly split to a new file if vi.mock hoisting forces it)
Plan 04: backend/src/scripts/backfill-personality.ts (edit)
         backend/src/scripts/__tests__/backfill-personality.test.ts (edit)
```
Total: 8 files (possibly 9 if Plan 03 fallback split). gitnexus_detect_changes run from Plan 05 should see exactly this set + the 4 doc files this plan edits.
</interfaces>

<project_conventions>
- No watch mode in CI / verification commands — always `test -- run`
- Phase SUMMARY.md follows the template in `$HOME/.claude/get-shit-done/templates/summary.md`
- ROADMAP.md updates use the existing Phase 64 section; update Plans count + plan list
- REQUIREMENTS.md: add P64-R1..P64-R8 rows to the traceability table and a Phase 64 description block
</project_conventions>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run full backend suite + backend typecheck (P64-R7 binary backend-only gate)</name>
  <files>(no edits — verification only)</files>
  <read_first>
    - .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md (sampling rate + full-suite command)
    - .planning/phases/64-npc-personality-regeneration-parity/64-REVIEWS.md (B5 backend-only scope)
    - All 4 prior Phase 64 plan SUMMARYs (if present)
  </read_first>
  <action>
Per CONTEXT.md GA-6 D-13..D-15, Phase 64 test scope is BACKEND ONLY: backend unit (npcs-step, personality-schema), backend integration (worldgen route, backfill), backend scripts (backfill). D-16 defers PinchTab E2E as optional. Frontend tests are NOT in Phase 64 requirements.

1. Run full backend suite:
   ```
   npm --prefix backend test -- run
   ```
   Expect: exit 0. Capture the test-count line (e.g. "Test Files  NN passed (NN) | Tests  NNN passed (NNN)").

2. Backend typecheck:
   ```
   npm --prefix backend run typecheck
   ```
   Expect: exit 0.

3. Capture command outputs for evidence. Save into 64-SUMMARY.md (Task 3).

4. If ANY test fails, STOP. Hand back a failure report. Do NOT proceed to document-update tasks with red backend tests. P64-R7 is binary: all backend tests green = pass. There is no "pre-existing failure" escape hatch for the backend — if a backend test was red before Phase 64, that is a pre-existing bug OUTSIDE Phase 64 scope and should be fixed separately, but cannot be allowed to bleed into Phase 64 closure.

Note: frontend Vitest suite is NOT run here (out of scope per D-16). If the orchestrator or reviewer requests frontend evidence as a supplementary check, it can be run separately — but frontend results are NOT part of P64-R7.
  </action>
  <verify>
    <automated>npm --prefix backend test -- run && npm --prefix backend run typecheck</automated>
  </verify>
  <acceptance_criteria>
    - `npm --prefix backend test -- run` exits 0
    - `npm --prefix backend run typecheck` exits 0
    - Captured test-count line for the SUMMARY
    - NO frontend command run (out of scope)
  </acceptance_criteria>
  <done>Backend-only full-suite verification gate green; P64-R7 binary scope satisfied.</done>
</task>

<task type="auto">
  <name>Task 2: Confirm all 4 Phase 63 personality regression tests still pass unchanged (P64-R8)</name>
  <files>(no edits — verification only)</files>
  <read_first>
    - backend/src/engine/__tests__/prompt-assembler.personality.test.ts (confirm it still tests the same contract)
    - backend/src/engine/__tests__/npc-agent.personality.test.ts
    - backend/src/engine/__tests__/npc-offscreen.personality.test.ts
    - backend/src/engine/__tests__/reflection-agent.personality.test.ts
    - backend/src/engine/prompt-assembler.ts (spot-check no Phase 64 edits)
    - backend/src/engine/npc-agent.ts
    - backend/src/engine/npc-offscreen.ts
    - backend/src/engine/reflection-agent.ts
  </read_first>
  <action>
1. Run the 4 specific regression tests:
   ```
   npm --prefix backend test -- run "prompt-assembler.personality"
   npm --prefix backend test -- run "npc-agent.personality"
   npm --prefix backend test -- run "npc-offscreen.personality"
   npm --prefix backend test -- run "reflection-agent.personality"
   ```
   Or combined with a pattern:
   ```
   npm --prefix backend test -- run "personality"
   ```
   Expect: each exits 0, all assertions green.

2. Confirm zero-change to the engine files:
   ```
   git diff --stat main...HEAD backend/src/engine/prompt-assembler.ts backend/src/engine/npc-agent.ts backend/src/engine/npc-offscreen.ts backend/src/engine/reflection-agent.ts
   ```
   Expect: empty output (no lines changed in any engine file during Phase 64) OR only Phase 63 commits if the branch base is not main. The point is: NO Phase 64 commit touches these files.

3. Document in the SUMMARY: "All 4 Phase 63 engine personality regression tests green. Engine prompt-assembler, npc-agent, npc-offscreen, reflection-agent files UNCHANGED in Phase 64."
  </action>
  <verify>
    <automated>npm --prefix backend test -- run "prompt-assembler.personality" && npm --prefix backend test -- run "npc-agent.personality" && npm --prefix backend test -- run "npc-offscreen.personality" && npm --prefix backend test -- run "reflection-agent.personality"</automated>
  </verify>
  <acceptance_criteria>
    - All 4 regression tests exit 0 individually
    - `git log --since="<phase 64 start date>" -- backend/src/engine/prompt-assembler.ts backend/src/engine/npc-agent.ts backend/src/engine/npc-offscreen.ts backend/src/engine/reflection-agent.ts` shows no Phase 64 commits on these files
    - SUMMARY contains: "All 4 Phase 63 engine personality regression tests green. Engine prompt-assembler, npc-agent, npc-offscreen, reflection-agent files UNCHANGED in Phase 64."
  </acceptance_criteria>
  <done>All 4 Phase 63 engine regression tests green; Phase 64 scope contained to worldgen + character ingestion + script; P64-R8 satisfied with REAL filenames (B7 fix).</done>
</task>

<task type="auto">
  <name>Task 3: Update 64-VALIDATION.md (backend-only scope) + write 64-SUMMARY.md</name>
  <files>.planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md,.planning/phases/64-npc-personality-regeneration-parity/64-SUMMARY.md</files>
  <read_first>
    - .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md (current frontmatter + per-task table + Test Framework row)
    - $HOME/.claude/get-shit-done/templates/summary.md (template)
    - All 4 Phase 64 plan SUMMARYs (64-01, 64-02, 64-03, 64-04)
  </read_first>
  <action>
**Step A — Update 64-VALIDATION.md frontmatter:**

Change:
```yaml
nyquist_compliant: false
wave_0_complete: false
```
to:
```yaml
nyquist_compliant: true
wave_0_complete: true
verified_on: 2026-04-19   # or actual date of execution
```

**Step B — Narrow the Test Infrastructure table to backend-only (B5 fix):**

Replace the `**Full suite command**` row. Currently reads:
```
| **Full suite command** | `npm --prefix backend test -- run && npm --prefix frontend test -- run` |
```

Change to:
```
| **Full suite command** | `npm --prefix backend test -- run` (backend-only per CONTEXT.md GA-6 D-13..D-15; frontend deferred per D-16) |
```

Update the **Estimated runtime** row to reflect backend-only (~2–3 min instead of 3–4 min combined).

**Step C — Update the Sampling Rate section:**

Change `Before /gsd:verify-work: Full suite (backend + frontend) must be green` to `Before /gsd:verify-work: Full BACKEND suite must be green (frontend out of scope per D-16)`.

**Step D — Fill in concrete Task IDs in the Per-Task Verification Map:**

Flip every `⬜ pending` to `✅ green`. Replace `64-XX-XX` placeholders with actual plan/task numbers:

```
| 64-01-02 | personality-schema foundation  | 1 | P64-R2         | unit            | npm --prefix backend test -- run "personality-schema" | ✅ | ✅ green |
| 64-02-03 | npcs-step schema + mapper      | 2 | P64-R1, P64-R3 | unit            | npm --prefix backend test -- run "npcs-step"          | ✅ | ✅ green |
| 64-02-03 | sample-lines retry heuristic   | 2 | P64-R4         | unit            | npm --prefix backend test -- run "npcs-step"          | ✅ | ✅ green |
| 64-03-01 | regenerate-section integration | 3 | P64-R5         | integration     | npm --prefix backend test -- run "worldgen"           | ✅ | ✅ green |
| 64-04-03 | backfill incomplete-pack mode  | 3 | P64-R6         | integration     | npm --prefix backend test -- run "backfill-personality" | ✅ | ✅ green |
| 64-05-02 | engine personality regression  | 4 | P64-R8         | unit (existing) | npm --prefix backend test -- run "personality"        | ✅ | ✅ green |
| 64-05-01 | backend full suite gate        | 4 | P64-R7         | full            | npm --prefix backend test -- run                      | ✅ | ✅ green |
```

**Step E — Remove the stale L1 risk note about frontend test script:**

Find any mention of "frontend/package.json missing test script" or "frontend npm test script missing" in VALIDATION.md risks or notes. REMOVE. `frontend/package.json` already has `"test": "vitest"`.

Also update the Manual-Only Verifications notes to reflect backend-only scope — the optional PinchTab smoke remains.

**Step F — Update the Validation Sign-Off checkboxes — check every box. Change "Approval: pending" to "Approval: approved 2026-04-19" (or actual date).**

**Step G — Write 64-SUMMARY.md:**

Follow the template at `$HOME/.claude/get-shit-done/templates/summary.md` if it exists; otherwise use this structure:

```markdown
---
phase: 64-npc-personality-regeneration-parity
status: complete
completed: 2026-04-19
---

# Phase 64 — NPC Personality Regeneration Parity — SUMMARY

## Outcome
Closed the Phase 63 parity gap: worldgen scaffold generation and `/api/worldgen/regenerate-section section=npcs` now emit the full structured `identity.personality` block (summary + voice + decisionStyle + worldview + internalContradictions + personalMythology + sampleLines) for every NPC, not only `summary`. A `--mode=incomplete-pack` flag added to `backfill-personality.ts` lets operators repair NPCs persisted with the exact legacy summary-only signature before Phase 64 merged. sampleLines-empty and contradictions-empty records are NOT swept (D-08 compliance — valid for non-dialog / simple NPC types).

## Plans Executed

| Plan | Slug | Wave | Status |
|------|------|------|--------|
| 64-01 | personality-schema-foundation | 1 | Complete |
| 64-02 | worldgen-npcs-step-fix | 2 | Complete |
| 64-03 | regenerate-integration-test | 3 | Complete |
| 64-04 | backfill-incomplete-pack | 3 | Complete |
| 64-05 | verification-gate | 4 | Complete |

## Requirement Coverage

| Requirement | Plan(s) | Evidence |
|-------------|---------|----------|
| P64-R1 (generateNpcsStep emits full personality) | 64-02 | Unit tests A + F in npcs-step.test.ts |
| P64-R2 (shared personality-schema helper) | 64-01 | personality-schema.ts + test |
| P64-R3 (mapper runs AFTER fromLegacyScaffoldNpc per B1 resolution) | 64-02 | mapper call inside spread-merge block; grep order evidence |
| P64-R4 (sample-lines retry heuristic + fallback) | 64-02 | shouldRetrySampleLines + retry try/catch + Tests B/C/D/E/G |
| P64-R5 (regenerate-section returns full personality via REAL step) | 64-03 | Real-step integration test; only LLM seam mocked |
| P64-R6 (backfill --mode=incomplete-pack with tightened predicate) | 64-04 | 7 new Vitest cases including D-08 exclusions |
| P64-R7 (backend full suite green — binary scope) | 64-05 | Task 1 evidence below |
| P64-R8 (all 4 Phase 63 engine personality regressions intact) | 64-05 | Task 2 evidence; engine files unchanged |

## Verification Evidence

### Backend Full Suite
```
<paste output of npm --prefix backend test -- run>
```

### Backend Typecheck
```
<paste exit code>
```

### Phase 63 Regression — 4 engine personality tests
```
<paste output of each of the 4 regression test commands>
```

### gitnexus_detect_changes — Phase 64 Scope
```
<paste JSON/summary output — expect 8 source files + 4 doc files>
```

## Files Changed

| File | Plan | Kind |
|------|------|------|
| backend/src/character/personality-schema.ts | 64-01 | new |
| backend/src/character/__tests__/personality-schema.test.ts | 64-01 | new |
| backend/src/worldgen/scaffold-steps/npcs-step.ts | 64-02 | edit |
| backend/src/worldgen/__tests__/npcs-step.test.ts | 64-02 | edit |
| backend/src/character/npc-generator.ts | 64-02 | edit |
| backend/src/routes/__tests__/worldgen.test.ts | 64-03 | edit |
| backend/src/scripts/backfill-personality.ts | 64-04 | edit |
| backend/src/scripts/__tests__/backfill-personality.test.ts | 64-04 | edit |
| .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md | 64-05 | edit |
| .planning/phases/64-npc-personality-regeneration-parity/64-SUMMARY.md | 64-05 | new |
| .planning/ROADMAP.md | 64-05 | edit |
| .planning/REQUIREMENTS.md | 64-05 | edit |

## Scope Preservation (CONTEXT.md gates)

- D-07: `backend/src/character/known-ip-worldgen-research.ts` UNCHANGED (git diff empty).
- D-04/D-05: `/regenerate-section` stays full-replace; test does not carry preserve-edits merge data.
- D-08: backfill predicate EXCLUDES sampleLines and internalContradictions (valid shapes for non-dialog / simple NPCs preserved).
- Engine prompt-assembler, npc-agent, npc-offscreen, reflection-agent files UNCHANGED in Phase 64.

## Review Feedback Addressed (from 64-REVIEWS.md)

| Concern | Severity | Resolution |
|---------|----------|------------|
| B1 mapper-order contradiction in 64-02 | HIGH | Canonicalized to AFTER-fromLegacyScaffoldNpc with overwrite |
| B2 64-03 not real integration test | HIGH | Rewrote to unmock generateNpcsStep; mocks only LLM seam |
| B3 64-03 negative assertion | HIGH | Deleted |
| B4 64-04 predicate too broad | HIGH | Tightened to legacy-summary-only signature; sampleLines + contradictions excluded |
| B5 64-05 P64-R7 self-contradictory | HIGH | Made binary; narrowed to backend-only |
| B6 64-05 files_modified mismatch | HIGH | Added ROADMAP.md + REQUIREMENTS.md |
| B7 64-05 invalid regression target | HIGH | All 4 real filenames verified in repo and cited |
| Q1 pre-edit gitnexus_impact | MEDIUM | Added as Task 1 in 64-02 and 64-04 |
| Q2 key-tier + ipContext coverage | MEDIUM | Added Test F in 64-02 |
| Q3 retry-failure + all-identical branches | MEDIUM | Added Tests D and E in 64-02 |
| Q4 64-02 scope overload | MEDIUM | Isolated npc-generator migration as Task 4 |
| L1 stale frontend risk note | LOW | Removed |

## Manual-Only Verifications

Deferred per 64-VALIDATION.md:
- Sample-lines voice quality inspection (operator task)
- PinchTab regenerate-section UX smoke (optional per D-16)

## Operator Runbook Addition

Repair legacy summary-only NPCs created before Phase 64 merged:
```
npm --prefix backend run backfill:personality -- --mode incomplete-pack --campaign <id> --dry-run
npm --prefix backend run backfill:personality -- --mode incomplete-pack --campaign <id>
```

## Next
- None. Phase 64 closes the Phase 63 parity gap.
- Deferred follow-ups (per CONTEXT.md Deferred Ideas): preserve-edits-on-regenerate, known-IP personality refinement, PinchTab E2E coverage.
```

Fill in actual command outputs from Tasks 1 and 2 into the Verification Evidence section.

**Step H — Verify by re-reading VALIDATION.md + SUMMARY.md:**

- `nyquist_compliant: true` now present
- `wave_0_complete: true` now present
- Test Framework full-suite command is backend-only
- No "frontend/package.json missing test script" risk note remains
- Every ⬜ in validation map replaced with ✅
- 64-SUMMARY.md has all source files listed in the "Files Changed" table
- Every P64-R1..P64-R8 has a coverage row
  </action>
  <verify>
    <automated>test -f .planning/phases/64-npc-personality-regeneration-parity/64-SUMMARY.md && grep -c "nyquist_compliant: true" .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/phases/64-npc-personality-regeneration-parity/64-SUMMARY.md` exists
    - `grep -c "P64-R" .planning/phases/64-npc-personality-regeneration-parity/64-SUMMARY.md` returns ≥ 8 (one per requirement)
    - `grep "nyquist_compliant: true" .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md` matches
    - `grep "wave_0_complete: true" .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md` matches
    - 64-VALIDATION.md full-suite command row references backend-only (backend-only test; no `npm --prefix frontend test` chained)
    - `grep -ic "frontend npm test script missing\|frontend test script" .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md` returns 0 (stale L1 note removed)
    - 64-VALIDATION.md per-task table contains no remaining ⬜ placeholders (all flipped to ✅)
    - 64-SUMMARY.md contains "Files Changed" table with ≥ 8 source-file rows + 4 doc-file rows
    - 64-SUMMARY.md contains "Review Feedback Addressed" table with B1-B7, Q1-Q4, L1 rows
  </acceptance_criteria>
  <done>64-VALIDATION.md status flipped; Test Framework narrowed to backend-only; 64-SUMMARY.md written with evidence + reviews-resolution table.</done>
</task>

<task type="auto">
  <name>Task 4: Update ROADMAP.md + REQUIREMENTS.md with Phase 64 closure</name>
  <files>.planning/ROADMAP.md,.planning/REQUIREMENTS.md</files>
  <read_first>
    - .planning/ROADMAP.md (Phase 64 section)
    - .planning/REQUIREMENTS.md (Phase 63 requirement block for format reference)
    - .planning/phases/64-npc-personality-regeneration-parity/64-SUMMARY.md (just-written)
  </read_first>
  <action>
**Step A — Update ROADMAP.md Phase 64 section:**

Find the block for Phase 64. Replace placeholders:

```markdown
### Phase 64: NPC Personality Regeneration Parity

**Goal:** Make worldgen and regenerate NPC paths produce the full structured `identity.personality` block...
**Requirements:** P64-R1, P64-R2, P64-R3, P64-R4, P64-R5, P64-R6, P64-R7, P64-R8
**Gap Closure:** Closes the remaining Phase 63 parity gap: worldgen-emitted NPCs (initial scaffold + regenerate-section) get full structured personality packs, not just summary. Includes narrow backfill for legacy summary-only NPCs persisted before the fix.
**Depends on:** Phase 63
**Plans:** 5 plans

Plans:
- [x] 64-01-personality-schema-foundation-PLAN.md — Shared Zod fragment + flat→nested mapper for drift-free reuse across npcs-step and npc-generator.
- [x] 64-02-worldgen-npcs-step-fix-PLAN.md — Extend npcs-step.ts schema + prompt + mapping (AFTER fromLegacyScaffoldNpc) + sample-lines retry with failure-fallback; migrate npc-generator to shared helper.
- [x] 64-03-regenerate-integration-test-PLAN.md — Real-step integration test on /regenerate-section section=npcs mocking only the LLM seam; proves personality round-trips through HTTP.
- [x] 64-04-backfill-incomplete-pack-PLAN.md — backfill-personality.ts --mode=incomplete-pack with tightened legacy-summary-only predicate (excludes sampleLines + contradictions per D-08).
- [x] 64-05-verification-gate-PLAN.md — Backend full suite green + 4 Phase 63 engine personality regressions + evidence bundle + ROADMAP/REQUIREMENTS updates.
```

In the Phase progress table, add or update:
```markdown
| 64. NPC Personality Regeneration Parity | 5/5 | Complete | 2026-04-19 |
```

**Step B — Update REQUIREMENTS.md:**

Add a new section for Phase 64:

```markdown
### Phase 64 — NPC Personality Regeneration Parity

- [x] **P64-R1**: `generateNpcsStep` emits a complete `identity.personality` block (summary + voice + decisionStyle + worldview + internalContradictions + personalMythology + sampleLines) for every NPC tier (key AND supporting), including when `ipContext` triggers `enrichKnownIpWorldgenNpcDraft`.
- [x] **P64-R2**: Shared helper module `backend/src/character/personality-schema.ts` exports `personalityFieldSchema` (Zod fragment) and `mapFlatPersonalityToNested` (flat → `CharacterPersonality`) with compile-time completeness guard via pinned return type. `npcs-step.ts` and `npc-generator.ts` both consume it — no inline field-list duplication.
- [x] **P64-R3**: `mapFlatPersonalityToNested` output is written into `draft.identity.personality` AFTER `fromLegacyScaffoldNpc` returns (canonical ordering per RESEARCH.md §3.2 and B1 resolution), replacing the degenerate stub at `npcs-step.ts:554-564`.
- [x] **P64-R4**: `shouldRetrySampleLines` predicate fires ONE additional LLM call per NPC when the first detail return has sampleLines.length === 0 OR all lines are shorter than 15 chars OR all lines match `/^(I am|I'm|Hello|Greetings|My name)/i` OR all lines are identical (case-insensitive). Max 1 retry per NPC; retry failure (LLM throw) falls back to primary detail without crashing worldgen.
- [x] **P64-R5**: `/api/worldgen/regenerate-section section=npcs` response body carries `draft.identity.personality` with all 7 sub-fields populated — proven by a real-step integration test that mocks only the LLM seam (`safeGenerateObject`) and exercises the actual `generateNpcsStep` runtime.
- [x] **P64-R6**: `backfill-personality.ts --mode=incomplete-pack` includes records where `personality.summary` is non-empty AND all 4 core prose sub-fields (voice, decisionStyle, worldview, personalMythology) are empty — the exact legacy summary-only signature. Records with full prose + empty sampleLines (valid for non-dialog NPCs) OR full prose + empty internalContradictions (valid for simple characters) are SKIPPED per D-08. Default mode unchanged. All Phase 63 REVIEWS safety (backup, side-effect-free dry-run, re-read-before-write, withPipelineRetry, GLM-only provider, config.json sentinel, BACKLOG on failure, runWithTurnContext) preserved.
- [x] **P64-R7**: Full backend Vitest suite exits 0 with Phase 64 changes integrated (backend-only per CONTEXT.md GA-6 D-13..D-15; frontend deferred per D-16).
- [x] **P64-R8**: Phase 63 regressions remain green — `prompt-assembler.personality.test.ts`, `npc-agent.personality.test.ts`, `npc-offscreen.personality.test.ts`, `reflection-agent.personality.test.ts` all pass unchanged. `backend/src/engine/prompt-assembler.ts`, `npc-agent.ts`, `npc-offscreen.ts`, `reflection-agent.ts` UNCHANGED in Phase 64.
```

Update the Traceability table at the bottom of REQUIREMENTS.md with 8 new rows:

```markdown
| P64-R1 | Phase 64 | Complete |
| P64-R2 | Phase 64 | Complete |
| P64-R3 | Phase 64 | Complete |
| P64-R4 | Phase 64 | Complete |
| P64-R5 | Phase 64 | Complete |
| P64-R6 | Phase 64 | Complete |
| P64-R7 | Phase 64 | Complete |
| P64-R8 | Phase 64 | Complete |
```

Update the coverage counter at the bottom of REQUIREMENTS.md accordingly — add 8 to whatever the v1.1 total was.

**Step C — Commit all Phase 64 docs changes:**

```
node "$HOME/.claude/get-shit-done/bin/gsd-tools.cjs" commit "docs(64): close phase 64 NPC personality regeneration parity" --files .planning/ROADMAP.md .planning/REQUIREMENTS.md .planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md .planning/phases/64-npc-personality-regeneration-parity/64-SUMMARY.md
```

(Only if CLAUDE.md / user policy permits the commit at this stage. The phase orchestrator may handle the final commit — in that case, skip and let it happen downstream.)
  </action>
  <verify>
    <automated>grep -c "P64-R" .planning/REQUIREMENTS.md && grep -c "64-01-personality-schema-foundation-PLAN.md" .planning/ROADMAP.md</automated>
  </verify>
  <acceptance_criteria>
    - `.planning/ROADMAP.md` Phase 64 block lists all 8 P64-R requirements in its Requirements line: `grep "P64-R1.*P64-R2.*P64-R3.*P64-R4.*P64-R5.*P64-R6.*P64-R7.*P64-R8" .planning/ROADMAP.md` matches ≥ 1
    - `.planning/ROADMAP.md` Phase 64 Plans count says "5 plans"
    - `.planning/ROADMAP.md` contains all 5 plan filenames: `grep -c "64-0[1-5]-.*-PLAN.md" .planning/ROADMAP.md` returns ≥ 5
    - `.planning/REQUIREMENTS.md` contains a "### Phase 64" section with 8 bullet points (P64-R1 through P64-R8)
    - `.planning/REQUIREMENTS.md` P64-R8 bullet lists all 4 real filenames: `prompt-assembler.personality.test.ts`, `npc-agent.personality.test.ts`, `npc-offscreen.personality.test.ts`, `reflection-agent.personality.test.ts`
    - `.planning/REQUIREMENTS.md` Traceability table contains 8 P64-R* rows mapped to Phase 64
    - REQUIREMENTS.md coverage counter updated
  </acceptance_criteria>
  <done>ROADMAP.md + REQUIREMENTS.md reflect Phase 64 closure; all 8 requirement IDs traceable; P64-R8 cites 4 real engine personality test filenames.</done>
</task>

</tasks>

<verification>
- `npm --prefix backend test -- run` exits 0 (P64-R7 backend-only binary gate).
- `npm --prefix backend run typecheck` exits 0.
- All 4 Phase 63 engine personality regression tests exit 0 individually (P64-R8 B7 fix).
- `.planning/phases/64-npc-personality-regeneration-parity/64-VALIDATION.md` has `nyquist_compliant: true`, `wave_0_complete: true`, backend-only full-suite command, and no stale frontend risk note.
- `.planning/phases/64-npc-personality-regeneration-parity/64-SUMMARY.md` exists with Requirement Coverage P64-R1..P64-R8, command evidence, and Review Feedback Addressed table.
- `.planning/ROADMAP.md` Phase 64 block finalized (Requirements listed, 5 plans, status Complete).
- `.planning/REQUIREMENTS.md` has Phase 64 section + traceability rows.
- gitnexus_detect_changes across Phase 64 branch shows exactly the 8 source files + 4 doc files expected.
</verification>

<success_criteria>
- Phase 64 closes with backend full-suite green + 4 Phase 63 engine regression tests unchanged.
- Evidence bundle (64-SUMMARY.md) links each requirement to a concrete test result AND documents every review concern addressed.
- Operator documentation for the new `--mode=incomplete-pack` flag with tightened predicate lands in the SUMMARY runbook.
- ROADMAP.md + REQUIREMENTS.md tell the project history correctly (5 plans, 8 requirements, Phase 64 complete).
- P64-R7 is binary backend-only (B5 fix).
- P64-R8 cites 4 real filenames (B7 fix).
</success_criteria>

<requirement_coverage>
- **P64-R7** — Task 1 runs full backend suite; acceptance_criteria gates on exit 0. Binary scope per CONTEXT.md GA-6 / B5 resolution. No frontend escape hatch.
- **P64-R8** — Task 2 runs all 4 real Phase 63 engine personality regression tests + verifies engine files UNCHANGED (git diff). B7 fix: filenames verified present in repo.
</requirement_coverage>

<estimates>
- Effort: ~35-45 min Claude execution (backend full-suite run is I/O-bound; doc writes are straightforward; 4 separate regression test commands are quick).
- Full backend suite runtime: ~2-3 min.
- Backend typecheck: ~30s.
- 4 regression tests: < 10s each.
</estimates>

<risks>
- **R1 — Pre-existing backend failures.** If a backend test was red before Phase 64 (unlikely given STATE.md shows 99% progress), that is outside Phase 64 scope but blocks the gate. **Mitigation:** the gate is binary. If a pre-existing red test surfaces, it must be diagnosed. Either it was affected by Phase 64 (fix it) or it was always red (document and optionally hand it to a separate quick task). Phase 64 cannot close with red backend tests.
- **R2 — Engine file diffs.** If Phase 63 closeout work is on the same branch as Phase 64, `git diff main...HEAD` may show Phase 63 engine edits. **Mitigation:** use a narrower diff scope — e.g. `git log --since="<phase 64 start date>" -- backend/src/engine/...` to confirm Phase 64 specifically did not touch the engine.
- **R3 — ROADMAP/REQUIREMENTS schema drift.** Both docs have specific formatting conventions. **Mitigation:** Task 4 Step B explicitly follows the Phase 63 section pattern; read REQUIREMENTS.md first and match format.
- **R4 — gitnexus report staleness.** gitnexus index may be stale at phase close. **Mitigation:** if needed, run `npx gitnexus analyze` before detect_changes.
</risks>

<output>
Final phase artifact: `.planning/phases/64-npc-personality-regeneration-parity/64-SUMMARY.md` is the main evidence bundle. Per-plan SUMMARYs from 64-01..64-04 remain in place as granular evidence. No separate 64-05-SUMMARY.md needed — this plan's outcome lives in 64-SUMMARY.md directly.
</output>
</content>
</invoke>
