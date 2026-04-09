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

- **After every task commit:** Run only the narrow command for the task you just changed from the Per-Task Verification Map below.
- **After every plan wave:** Run `npm --prefix backend exec vitest run src/engine/__tests__/reflection-agent.test.ts src/engine/__tests__/reflection-progression.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts src/routes/__tests__/chat.test.ts`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds per task sample, ~45 seconds at wave/phase gates

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 40-01-01 | 01 | 1 | SIMF-01 | unit | `npm --prefix backend exec vitest run src/engine/__tests__/reflection-budget.test.ts` | ❌ W0 | ⬜ pending |
| 40-01-02 | 01 | 1 | SIMF-01 | integration | `npm --prefix backend exec vitest run src/engine/__tests__/tool-executor.test.ts -t "accumulates reflection budget" src/engine/__tests__/npc-agent.test.ts -t "increments reflection budget" src/engine/__tests__/npc-offscreen.test.ts -t "increments reflection budget"` | ✅ | ⬜ pending |
| 40-02-01 | 02 | 2 | SIMF-01 | integration | `npm --prefix backend exec vitest run src/routes/__tests__/chat.test.ts -t "triggers reflection during post-turn finalization"` | ✅ | ⬜ pending |
| 40-02-02 | 02 | 2 | SIMF-01 | unit/integration | `npm --prefix backend exec vitest run src/engine/__tests__/reflection-agent.test.ts -t "beliefs, goals, and relationships first" src/engine/__tests__/reflection-agent.test.ts -t "materially stronger evidence"` | ✅ | ⬜ pending |
| 40-02-03 | 02 | 2 | SIMF-01 | integration | `npm --prefix backend exec vitest run src/engine/__tests__/npc-agent.test.ts -t "reads reflected canonical beliefs, goals, and relationships on later turns"` | ✅ | ⬜ pending |

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
| Diegetic visibility of reflection outcome | SIMF-01 | NPC behavior change quality is prompt- and scenario-dependent | Load a campaign with a qualifying NPC, trigger reflection through ordinary play, then play at least one later turn with that NPC and confirm the follow-up behavior or dialogue reflects the updated beliefs/goals/relationship state without relying on a system popup. |
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
