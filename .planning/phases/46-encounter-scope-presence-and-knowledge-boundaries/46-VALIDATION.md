---
phase: 46
slug: encounter-scope-presence-and-knowledge-boundaries
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-12
---

# Phase 46 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Backend config** | `vitest.config.ts` |
| **Frontend config** | `frontend/vitest.config.ts` |
| **Quick run command** | `npm --prefix backend exec vitest run src/engine/__tests__/scene-presence.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts && npm --prefix frontend exec vitest run lib/__tests__/api.test.ts app/game/__tests__/page.test.tsx components/game/__tests__/location-panel.test.tsx` |
| **Estimated runtime** | ~45 seconds |

---

## Smoke Suites

| Suite | Purpose | Automated Command | Estimated Runtime |
|-------|---------|-------------------|-------------------|
| `phase-46-backend-smoke` | encounter scope resolution, authoritative scene-scope lifecycle, prompt filtering, NPC routing, and off-screen separation | `npm --prefix backend exec vitest run src/engine/__tests__/scene-presence.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts` | ~32s |
| `phase-46-frontend-smoke` | world payload parsing plus `/game` scene-presence compatibility | `npm --prefix frontend exec vitest run lib/__tests__/api.test.ts app/game/__tests__/page.test.tsx components/game/__tests__/location-panel.test.tsx` | ~14s |
| `phase-46-full-smoke` | backend + frontend encounter-scope contract together | `npm --prefix backend exec vitest run src/engine/__tests__/scene-presence.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts && npm --prefix frontend exec vitest run lib/__tests__/api.test.ts app/game/__tests__/page.test.tsx components/game/__tests__/location-panel.test.tsx` | ~50s |

---

## Sampling Rate

- **After every task commit:** run the suite mapped below
- **After every wave:** run `phase-46-full-smoke`
- **Phase gate:** all mapped suites green before `$gsd-execute-phase 46` can claim pass
- **Max feedback latency:** 50 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 46-01-01 | 01 | 1 | SCEN-02 | regression | `npm --prefix backend exec vitest run src/engine/__tests__/scene-presence.test.ts src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/npc-agent.test.ts src/engine/__tests__/npc-offscreen.test.ts src/routes/__tests__/chat.test.ts` | ✅ / W0 | ⬜ pending |
| 46-01-02 | 01 | 1 | SCEN-02 | regression | `npm --prefix frontend exec vitest run app/game/__tests__/page.test.tsx components/game/__tests__/location-panel.test.tsx` | ✅ / W0 | ⬜ pending |
| 46-02-01 | 02 | 2 | SCEN-02 | unit/integration | `npm --prefix backend exec vitest run src/engine/__tests__/scene-presence.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts` | ✅ | ⬜ pending |
| 46-03-01 | 03 | 3 | SCEN-02 | integration | `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/npc-agent.test.ts` | ✅ | ⬜ pending |
| 46-03-02 | 03 | 3 | SCEN-02 | integration | `npm --prefix backend exec vitest run src/engine/__tests__/npc-offscreen.test.ts src/routes/__tests__/chat.test.ts` | ✅ | ⬜ pending |
| 46-04-01 | 04 | 4 | SCEN-02 | parser/integration | `npm --prefix frontend exec vitest run lib/__tests__/api.test.ts app/game/__tests__/page.test.tsx components/game/__tests__/location-panel.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/engine/__tests__/scene-presence.test.ts` — new shared resolver coverage
- [ ] Extend `backend/src/engine/__tests__/prompt-assembler.test.ts` for encounter-scope and awareness-driven scene context
- [ ] Extend `backend/src/engine/__tests__/npc-agent.test.ts` for nearby-entity filtering and recognition boundaries
- [ ] Extend `backend/src/engine/__tests__/npc-offscreen.test.ts` for local-scope vs broad-location routing
- [ ] Extend `backend/src/routes/__tests__/chat.test.ts` for pre-visible settlement under narrowed scene scope
- [ ] Extend `backend/src/engine/__tests__/tool-executor.test.ts` and `turn-processor.test.ts` for scene-scope set/clear/sync lifecycle
- [ ] Extend frontend `/game` tests so location panels no longer equate broad location membership with immediate scene presence
- [ ] Extend frontend API parser coverage so new scene-scoped world payload fields are preserved in `WorldData`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A large location no longer feels like everyone is standing in one room | SCEN-02 | Requires gameplay judgment on scene feel | Start in a large location with multiple notable NPCs seeded across it and confirm only locally present or perceivable actors enter the scene text and “people here” surfaces. |
| Hidden participants feel real without leaking omniscient narration | SCEN-02 | Hard to prove from narrow assertions | Create a scene with a concealed but nearby actor and confirm the player gets hints or consequences, not a full premature reveal. |
| NPC reactions respect how they would know something | SCEN-02 | Requires evaluating reasoning quality, not just payload shape | Trigger a scene where one NPC should know another only through reputation/report/perception and confirm the reaction text follows that basis instead of unexplained omniscience. |

---

## Validation Sign-Off

- [x] Every plan task includes an automated verify command
- [x] Backend and frontend both have mapped smoke suites
- [x] Sampling continuity stays under 50 seconds
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
