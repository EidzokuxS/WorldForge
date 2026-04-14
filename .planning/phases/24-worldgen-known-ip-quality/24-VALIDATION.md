---
phase: 24
slug: worldgen-known-ip-quality
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-25
---

# Phase 24 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `backend/vitest.config.ts` |
| **Quick run command** | `cd backend && npx vitest run src/worldgen/__tests__/ --reporter=verbose` |
| **Full suite command** | `cd backend && npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx vitest run src/worldgen/__tests__/ --reporter=verbose`
- **After every plan wave:** Run `cd backend && npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 24-01-01 | 01 | 1 | P24-07 | unit | `npx vitest run src/worldgen/__tests__/prompt-utils.test.ts` | ❌ W0 | ⬜ pending |
| 24-01-02 | 01 | 1 | P24-01 | unit | `npx vitest run src/worldgen/__tests__/seed-suggester.test.ts -t "sequential"` | ❌ W0 | ⬜ pending |
| 24-02-01 | 02 | 1 | P24-02 | unit | `npx vitest run src/worldgen/__tests__/scaffold-generator.test.ts -t "premise"` | ❌ W0 | ⬜ pending |
| 24-02-02 | 02 | 1 | P24-03 | unit | `npx vitest run src/worldgen/__tests__/locations-step.test.ts` | ❌ W0 | ⬜ pending |
| 24-02-03 | 02 | 1 | P24-04 | unit | `npx vitest run src/worldgen/__tests__/factions-step.test.ts` | ❌ W0 | ⬜ pending |
| 24-02-04 | 02 | 1 | P24-05 | unit | `npx vitest run src/worldgen/__tests__/npcs-step.test.ts` | ❌ W0 | ⬜ pending |
| 24-03-01 | 03 | 2 | P24-06 | unit | `npx vitest run src/worldgen/__tests__/lore-extractor.test.ts -t "ip context"` | ❌ W0 | ⬜ pending |
| 24-03-02 | 03 | 2 | P24-08 | integration | `npx vitest run src/worldgen/__tests__/scaffold-generator.test.ts -t "pipeline"` | ❌ W0 | ⬜ pending |
| 24-03-03 | 03 | 2 | P24-09 | unit | `npx vitest run src/worldgen/__tests__/scaffold-saver.test.ts -t "tier"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/worldgen/__tests__/prompt-utils.test.ts` — stubs for IP context block tests
- [ ] `backend/src/worldgen/__tests__/locations-step.test.ts` — stubs for incremental location generation
- [ ] `backend/src/worldgen/__tests__/factions-step.test.ts` — stubs for incremental faction generation
- [ ] `backend/src/worldgen/__tests__/npcs-step.test.ts` — stubs for key/supporting NPC generation
- [ ] Update `seed-suggester.test.ts` — stubs for sequential DNA generation

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Naruto scenario produces canonical locations | P24-03 | Requires real LLM call with research | E2E: create campaign "Naruto Shippuden but..." → verify Konohagakure, Sunagakure in locations |
| Star Wars scenario produces canonical factions | P24-04 | Requires real LLM call with research | E2E: create campaign "Star Wars but Jedi Order survived" → verify Galactic Empire, Rebel Alliance |
| Original world produces coherent locations | P24-03 | Requires real LLM + creativity | E2E: create campaign "Steampunk archipelago..." → verify internally consistent locations |
| DNA categories show inter-dependencies | P24-01 | Requires reading generated DNA reasoning | E2E: create any campaign → verify DNA reasoning references previous categories |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
