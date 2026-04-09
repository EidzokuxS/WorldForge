---
phase: 40
slug: live-reflection-progression-triggers
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-09
---

# Phase 40 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm --prefix backend exec vitest run src/engine/__tests__/reflection-agent.test.ts src/engine/__tests__/reflection-progression.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts src/routes/__tests__/chat.test.ts` |
| **Full suite command** | `npm --prefix backend test` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm --prefix backend exec vitest run src/engine/__tests__/reflection-agent.test.ts src/engine/__tests__/reflection-progression.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts src/routes/__tests__/chat.test.ts`
- **After every plan wave:** Run `npm --prefix backend test`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 40-01-01 | 01 | 1 | SIMF-01 | unit | `npm --prefix backend exec vitest run src/engine/__tests__/tool-executor.test.ts -t "accumulates reflection budget"` | ❌ W0 | ⬜ pending |
| 40-01-02 | 01 | 1 | SIMF-01 | integration | `npm --prefix backend exec vitest run src/engine/__tests__/npc-agent.test.ts -t "increments reflection budget"` | ❌ W0 | ⬜ pending |
| 40-01-03 | 01 | 1 | SIMF-01 | integration | `npm --prefix backend exec vitest run src/engine/__tests__/npc-offscreen.test.ts -t "increments reflection budget"` | ❌ W0 | ⬜ pending |
| 40-02-01 | 02 | 2 | SIMF-01 | integration | `npm --prefix backend exec vitest run src/routes/__tests__/chat.test.ts -t "triggers reflection during post-turn finalization"` | ❌ W0 | ⬜ pending |
| 40-02-02 | 02 | 2 | SIMF-01 | unit/integration | `npm --prefix backend exec vitest run src/engine/__tests__/reflection-agent.test.ts -t "persists structured state changes"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/engine/__tests__/tool-executor.test.ts` — add `log_event` accumulation coverage for participating NPC rows
- [ ] `backend/src/engine/__tests__/npc-agent.test.ts` — add present-NPC event accumulation coverage
- [ ] `backend/src/engine/__tests__/npc-offscreen.test.ts` — add off-screen accumulation coverage
- [ ] `backend/src/routes/__tests__/chat.test.ts` — add ordinary-play threshold-crossing and reflection-trigger coverage
- [ ] Optional helper-level test for participant name resolution if execution introduces a dedicated helper

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Diegetic visibility of reflection outcome | SIMF-01 | NPC behavior change quality is prompt- and scenario-dependent | Load a campaign with a qualifying NPC, trigger reflection through ordinary play, then confirm later turns show changed beliefs/goals/relationship consequences without relying on a system popup. |
| Secondary debug inspection surface, if implemented in-phase | SIMF-01 | Optional UX surface and not guaranteed to exist in every plan | If a modal/drill-down is added, open the relevant character/NPC card and confirm the reflection/progression state is inspectable without becoming the primary gameplay signal. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
