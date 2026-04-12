---
phase: 45
slug: authoritative-scene-assembly-and-start-of-play-runtime
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-12
---

# Phase 45 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest |
| **Backend config** | `vitest.config.ts` |
| **Frontend config** | `frontend/vitest.config.ts` |
| **Quick run command** | `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/prompt-assembler.test.ts && npm --prefix frontend exec vitest run components/game/__tests__/narrative-log.test.tsx app/game/__tests__/page.test.tsx` |
| **Estimated runtime** | ~35 seconds |

---

## Smoke Suites

| Suite | Purpose | Automated Command | Estimated Runtime |
|-------|---------|-------------------|-------------------|
| `phase-45-backend-smoke` | turn ordering, scene assembly, duplicate suppression, and rollback-safe narration sequencing | `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/prompt-assembler.test.ts src/routes/__tests__/chat.test.ts` | ~20s |
| `phase-45-frontend-smoke` | `/game` opening surface and narrative presentation contract | `npm --prefix frontend exec vitest run components/game/__tests__/narrative-log.test.tsx app/game/__tests__/page.test.tsx` | ~12s |
| `phase-45-full-smoke` | backend + frontend scene contract together | `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/prompt-assembler.test.ts src/routes/__tests__/chat.test.ts && npm --prefix frontend exec vitest run components/game/__tests__/narrative-log.test.tsx app/game/__tests__/page.test.tsx` | ~35s |

---

## Sampling Rate

- **After every task commit:** run the suite mapped below
- **After every wave:** run `phase-45-full-smoke`
- **Phase gate:** all mapped suites green before `$gsd-execute-phase 45` can claim pass
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 45-01-01 | 01 | 1 | SCEN-01 | regression | `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts src/engine/__tests__/prompt-assembler.test.ts` | ✅ | ⬜ pending |
| 45-01-02 | 01 | 1 | SCEN-01 | regression | `npm --prefix frontend exec vitest run components/game/__tests__/narrative-log.test.tsx app/game/__tests__/page.test.tsx` | ✅ | ⬜ pending |
| 45-02-01 | 02 | 2 | SCEN-01 | integration | `npm --prefix backend exec vitest run src/engine/__tests__/turn-processor.test.ts src/routes/__tests__/chat.test.ts` | ✅ | ⬜ pending |
| 45-02-02 | 02 | 2 | SCEN-01 | integration | `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/engine/__tests__/turn-processor.test.ts` | ✅ | ⬜ pending |
| 45-03-01 | 03 | 3 | SCEN-01 | regression | `npm --prefix frontend exec vitest run components/game/__tests__/narrative-log.test.tsx app/game/__tests__/page.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `turn-processor.test.ts` gets explicit coverage for deferred visible narration and duplicate-block suppression.
- [ ] `narrative-log.test.tsx` and `page.test.tsx` get explicit coverage for “premise is not opening narration”.
- [ ] If a dedicated `scene-assembly.ts` helper is introduced, either add a direct unit test or cover it transitively through `turn-processor.test.ts`.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| First playable scene feels runtime-grounded rather than like a lore dump | SCEN-01 | Requires product judgment on actual prose feel | Start a fresh campaign, land on `/game`, and verify the first visible scene text reads like a concrete scene at a place under pressure, not a recap of the world premise. |
| Same-turn local reactions visibly line up with what the player perceives | SCEN-01 | Needs live feel across player action and local NPC response | Trigger a scene with a present key NPC and confirm the resulting narration reads like one settled scene instead of “your action happened, then the world updated later”. |
| Catastrophic perceivable spillover can enter scene narration without omniscient exposition | SCEN-01 | Hard to prove from narrow unit tests alone | In a scenario with a clearly perceivable neighboring event, confirm the scene text includes the perceivable consequence without acting like the player magically knows the unseen details. |

---

## Validation Sign-Off

- [x] Every plan task includes an automated verify command
- [x] Backend and frontend both have mapped smoke suites
- [x] Sampling continuity stays under 45 seconds
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
