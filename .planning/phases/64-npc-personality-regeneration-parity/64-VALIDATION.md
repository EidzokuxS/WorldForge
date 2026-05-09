---
phase: 64
slug: npc-personality-regeneration-parity
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-19
updated: 2026-04-19
verified_on: 2026-04-19
---

# Phase 64 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

Derived from `64-RESEARCH.md §12. Validation Architecture`. Inherits format from Phase 63 `63-VALIDATION.md`.

**Scope note (B5 resolution):** Phase 64 is BACKEND-ONLY per CONTEXT.md GA-6 (D-13 unit test on npcs-step, D-14 integration test on worldgen route, D-15 unit test on backfill script). D-16 defers PinchTab E2E as optional. Frontend tests are NOT part of P64-R7. P64-R7 is binary: backend green = pass.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x (backend only per Phase 64 scope) |
| **Config file** | `backend/vitest.config.ts` |
| **Quick run command** | `npm --prefix backend test -- run <pattern>` |
| **Full suite command** | `cd backend && npm test` (backend-only per CONTEXT.md GA-6 D-13..D-15; frontend deferred per D-16; `npm --prefix backend test -- run` resolves to `vitest run run` and only executes a filtered subset in this repo) |
| **Estimated runtime** | ~10s on the current machine for the full backend suite |

---

## Sampling Rate

- **After every task commit:** Run `npm --prefix backend test -- run <affected-pattern>` — target <10s per file.
- **After every plan wave:** Run `cd backend && npm test` — current full-suite runtime is ~10s.
- **Before `/gsd:verify-work`:** Full BACKEND suite must be green (frontend out of scope per D-16).
- **Max feedback latency:** ~15 seconds on the current machine (full backend suite).

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 64-01-02 | personality-schema foundation | 1 | P64-R2 | unit | `npm --prefix backend test -- run "personality-schema"` | ✅ created | ✅ green |
| 64-02-03 | npcs-step schema + mapper (AFTER fromLegacyScaffoldNpc) | 2 | P64-R1, P64-R3 | unit | `npm --prefix backend test -- run "npcs-step"` | ✅ extended | ✅ green |
| 64-02-03 | sample-lines retry + retry-failure fallback | 2 | P64-R4 | unit | `npm --prefix backend test -- run "npcs-step"` | ✅ extended | ✅ green |
| 64-03-01 | regenerate-section REAL-step integration | 3 | P64-R5 | integration | `npm --prefix backend test -- run "worldgen"` | ✅ extended | ✅ green |
| 64-04-03 | backfill incomplete-pack (tightened predicate) | 3 | P64-R6 | integration | `npm --prefix backend test -- run "backfill-personality"` | ✅ extended | ✅ green |
| 64-05-02 | 4 Phase 63 engine personality regressions | 4 | P64-R8 | unit (existing) | `npm --prefix backend test -- run "prompt-assembler.personality"`; `npm --prefix backend test -- run "npc-agent.personality"`; `npm --prefix backend test -- run "npc-offscreen.personality"`; `npm --prefix backend test -- run "reflection-agent.personality"` | ✅ unchanged | ✅ green |
| 64-05-01 | backend full suite gate (binary) | 4 | P64-R7 | full | `cd backend && npm test` | ✅ | ✅ green |

*Status: ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `backend/src/character/personality-schema.ts` — new shared helper module (Zod fragment + `mapFlatPersonalityToNested`). Covers P64-R2 source.
- [x] `backend/src/character/__tests__/personality-schema.test.ts` — behavior + compile-time completeness assertion against `CharacterPersonality`. Covers P64-R2.
- [x] Sample-lines retry coverage (including all-identical branch + retry-failure fallback branch per Q3) — inline inside `npcs-step.test.ts` (planner chose inline — single-caller scope).
- [x] Extend `backend/src/worldgen/__tests__/npcs-step.test.ts` — assert personality sub-fields non-empty for key-tier + supporting-tier AND for key-tier + ipContext path (D-06 parity per Q2); update existing mocks to return full flat schema. Covers P64-R1, P64-R3, P64-R4.
- [x] Extend `backend/src/routes/__tests__/worldgen.test.ts` section=`npcs` — add a REAL-step integration test that mocks only `../../ai/generate-object-safe.js` (LLM seam) and un-mocks `../../worldgen/index.js`. Asserts response carries all 7 sub-fields populated. Covers P64-R5.
- [x] Extend `backend/src/scripts/__tests__/backfill-personality.test.ts` — new describe block for `--mode=incomplete-pack` with TIGHTENED legacy-summary-only predicate (B4); includes D-08 exclusion regressions for sampleLines-empty and contradictions-empty records. Covers P64-R6.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sample-lines voice quality (human judgement) | P64-R4 supplement | LLM output quality not fully automatable | Run worldgen on 2 campaigns, inspect `scaffold.npcs[*].draft.identity.personality.sampleLines` in world-review UI; confirm lines read as character voice, not narrator commentary |
| Regenerate-section round-trip in world-review UI | P64-R5 supplement | UX smoke against real GLM | PinchTab: open review page, click "Regenerate NPCs", confirm all new NPCs show voice/decisionStyle/sampleLines in personality-section panel |

*PinchTab E2E is OPTIONAL per CONTEXT.md D-16 — not phase-exit blocker.*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (personality-schema.ts + its test)
- [x] No watch-mode flags used in the authoritative commands
- [x] Feedback latency < 180s
- [x] P64-R7 scope is backend-only (B5) — no frontend chain in full-suite command
- [x] P64-R8 regression targets cite 4 REAL engine personality test filenames (B7)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-04-19
</content>
</invoke>
