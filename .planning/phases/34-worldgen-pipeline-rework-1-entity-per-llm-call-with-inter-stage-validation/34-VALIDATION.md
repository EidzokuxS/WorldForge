---
phase: 34
slug: worldgen-pipeline-rework-1-entity-per-llm-call-with-inter-stage-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 34 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Config file** | `backend/vitest.config.ts` |
| **Quick run command** | `npm --prefix backend run test -- --run` |
| **Full suite command** | `npm --prefix backend run test -- --run && npm --prefix backend run typecheck` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm --prefix backend run test -- --run`
- **After every plan wave:** Run `npm --prefix backend run test -- --run && npm --prefix backend run typecheck`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 34-01-01 | 01 | 0 | D-01, D-02 | unit | `npx --prefix backend vitest run src/worldgen/__tests__/pipeline-rework.test.ts` | ❌ W0 | ⬜ pending |
| 34-01-02 | 01 | 0 | D-03, D-04 | unit | `npx --prefix backend vitest run src/worldgen/__tests__/validation.test.ts` | ❌ W0 | ⬜ pending |
| 34-01-03 | 01 | 0 | D-06 | unit | `npx --prefix backend vitest run src/worldgen/__tests__/lore-extractor.test.ts` | ❌ W0 | ⬜ pending |
| 34-01-04 | 01 | 0 | D-07 | unit | `npx --prefix backend vitest run src/worldgen/__tests__/progress.test.ts` | ❌ W0 | ⬜ pending |
| 34-XX-XX | XX | X | COMPAT | integration | `npx --prefix backend vitest run src/routes/__tests__/worldgen.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/worldgen/__tests__/pipeline-rework.test.ts` — stubs for D-01 (per-entity detail), D-02 (sequential accumulator)
- [ ] `backend/src/worldgen/__tests__/validation.test.ts` — stubs for D-03 (validation loop), D-04 (Judge role usage)
- [ ] `backend/src/worldgen/__tests__/lore-extractor.test.ts` — stubs for D-06 (4 category calls, dedup)
- [ ] `backend/src/worldgen/__tests__/progress.test.ts` — stubs for D-07 (sub-progress fields)

*Existing infrastructure covers framework and config — only test files are needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Full worldgen produces valid scaffold | All | Requires real LLM calls | Generate a world via UI, verify locations/factions/NPCs populated correctly |
| Progress bar shows two tiers | D-07 | Visual UI verification | Watch progress during generation, confirm entity-level sub-labels appear |
| Validation fixes broken cross-references | D-03 | Requires real LLM validation | Generate known-IP world, check NPC locationNames match actual locations |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
