---
phase: 2
slug: turn-cycle
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-18
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | `backend/vitest.config.ts` |
| **Quick run command** | `npm --prefix backend test -- --run` |
| **Full suite command** | `npm --prefix backend test -- --run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm --prefix backend test -- --run`
- **After every plan wave:** Run `npm --prefix backend test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | TOOL-04 | unit | `npx --prefix backend vitest run src/engine/__tests__/tool-executor.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-01 | 01 | 1 | TOOL-05 | unit | `npx --prefix backend vitest run src/engine/__tests__/tool-executor.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-01 | 01 | 1 | TOOL-07 | unit | `npx --prefix backend vitest run src/engine/__tests__/tool-executor.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-01 | 01 | 1 | TOOL-08 | unit | `npx --prefix backend vitest run src/engine/__tests__/tool-executor.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-01 | 01 | 1 | TOOL-09 | unit | `npx --prefix backend vitest run src/engine/__tests__/tool-executor.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-01 | 01 | 1 | TOOL-10 | unit | `npx --prefix backend vitest run src/engine/__tests__/tool-executor.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | TURN-01 | unit | `npx --prefix backend vitest run src/engine/__tests__/turn-processor.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | TURN-02 | unit | `npx --prefix backend vitest run src/engine/__tests__/turn-processor.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | TURN-04 | unit | `npx --prefix backend vitest run src/engine/__tests__/turn-processor.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 2 | TURN-03 | integration | `npm --prefix backend run typecheck && npm --prefix frontend run lint` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/engine/__tests__/tool-executor.test.ts` — stubs for TOOL-04, TOOL-05, TOOL-07, TOOL-08, TOOL-09, TOOL-10
- [ ] `backend/src/engine/__tests__/turn-processor.test.ts` — stubs for TURN-01, TURN-02, TURN-04

*Plans use TDD approach — test files created as part of task execution.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE events render correctly in browser | TURN-03 | Frontend SSE parsing requires browser | Open game, submit action, verify narrative streams with oracle panel and quick action buttons |
| Quick action buttons are clickable | TOOL-09 | UI interaction requires browser | Click a quick action button, verify it submits as next turn |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
