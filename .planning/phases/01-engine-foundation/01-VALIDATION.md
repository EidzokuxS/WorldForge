---
phase: 1
slug: engine-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (installed in backend) |
| **Config file** | `backend/vitest.config.ts` |
| **Quick run command** | `cd backend && npx vitest run src/engine/__tests__/ --reporter=verbose` |
| **Full suite command** | `cd backend && npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx vitest run src/engine/__tests__/ --reporter=verbose`
- **After every plan wave:** Run `cd backend && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | PRMT-01 | unit | `cd backend && npx vitest run src/engine/__tests__/prompt-assembler.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-01-01 | 01 | 1 | PRMT-02 | unit | `cd backend && npx vitest run src/engine/__tests__/token-budget.test.ts -x` | ❌ W0 | ⬜ pending |
| 01-01-01 | 01 | 1 | PRMT-05 | unit | `cd backend && npx vitest run src/engine/__tests__/prompt-assembler.test.ts -t "lore" -x` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | ORCL-01 | unit | `cd backend && npx vitest run src/engine/__tests__/oracle.test.ts -t "structured" -x` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | ORCL-02 | unit | `cd backend && npx vitest run src/engine/__tests__/oracle.test.ts -t "outcome" -x` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | ORCL-03 | unit | `cd backend && npx vitest run src/engine/__tests__/oracle.test.ts -t "temperature" -x` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | ORCL-04 | unit | `cd backend && npx vitest run src/engine/__tests__/oracle.test.ts -t "soft-fail" -x` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 2 | ORCL-05 | unit | `cd backend && npx vitest run src/engine/__tests__/prompt-assembler.test.ts -t "action result" -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/engine/__tests__/prompt-assembler.test.ts` — stubs for PRMT-01, PRMT-02, PRMT-05, ORCL-05
- [ ] `backend/src/engine/__tests__/oracle.test.ts` — stubs for ORCL-01, ORCL-02, ORCL-03, ORCL-04
- [ ] `backend/src/engine/__tests__/token-budget.test.ts` — stubs for PRMT-02

*Existing vitest infrastructure covers framework needs — no new installs required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Oracle result displayed in UI collapsible panel | ORCL-05 | Frontend rendering requires browser | Open game page, submit action, verify Oracle panel shows chance%, tier, reasoning |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
