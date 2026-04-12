---
phase: 49
slug: search-grounding-and-in-game-research-semantics
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-12
---

# Phase 49 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `vitest.config.ts`, `backend/vitest.config.ts`, `frontend/vitest.config.ts` |
| **Quick run command** | `npx vitest run backend/src/worldgen/__tests__/ip-researcher.test.ts backend/src/character/__tests__/archetype-researcher.test.ts backend/src/routes/__tests__/character.test.ts backend/src/routes/__tests__/worldgen.test.ts backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/routes/__tests__/chat.test.ts frontend/components/settings/__tests__/research-tab.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~45 seconds quick run, longer for full suite |

---

## Sampling Rate

- **After every task commit:** run the task-local verify command from the plan
- **After every plan wave:** run `npx vitest run`
- **Before `$gsd-verify-work`:** full suite must be green
- **Max feedback latency:** ~45 seconds on task-local samples

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 49-01-01 | 01 | 1 | RES-01 | unit | `npx vitest run backend/src/worldgen/__tests__/ip-researcher.test.ts` | ✅ partial | ⬜ pending |
| 49-01-02 | 01 | 1 | RES-01 | integration | `npx vitest run backend/src/routes/__tests__/worldgen.test.ts` | ✅ partial | ⬜ pending |
| 49-02-01 | 02 | 2 | RES-01 | unit | `npx vitest run backend/src/character/__tests__/archetype-researcher.test.ts` | ✅ partial | ⬜ pending |
| 49-02-02 | 02 | 2 | RES-01 | integration | `npx vitest run backend/src/routes/__tests__/character.test.ts` | ✅ partial | ⬜ pending |
| 49-03-01 | 03 | 3 | RES-01 | unit | `npx vitest run backend/src/engine/__tests__/prompt-assembler.test.ts` | ✅ partial | ⬜ pending |
| 49-03-02 | 03 | 3 | RES-01 | integration | `npx vitest run backend/src/routes/__tests__/chat.test.ts` | ✅ partial | ⬜ pending |
| 49-04-01 | 04 | 4 | RES-01 | frontend unit | `npx vitest run frontend/components/settings/__tests__/research-tab.test.ts` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ partial*

---

## Wave 0 Requirements

- [ ] Extend `backend/src/worldgen/__tests__/ip-researcher.test.ts` to assert mixed-premise query decomposition and non-blended retrieval planning
- [ ] Extend `backend/src/routes/__tests__/worldgen.test.ts` to assert canonical-world reuse/storage stays in the existing `ipContext` lane
- [ ] Extend `backend/src/character/__tests__/archetype-researcher.test.ts` to cover durable canon/power grounding instead of archetype-only prose
- [ ] Extend `backend/src/routes/__tests__/character.test.ts` for new grounded character/power profile payloads and persistence
- [ ] Extend `backend/src/engine/__tests__/prompt-assembler.test.ts` for bounded runtime lookup context and no research-blob leakage
- [ ] Extend `backend/src/routes/__tests__/chat.test.ts` for explicit live lookup / clarification flows if added
- [ ] Extend `frontend/components/settings/__tests__/research-tab.test.ts` if research scope wording or settings semantics change

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| A live fact clarification feels like a clean lookup, not an exposition dump | RES-01 | Requires judging scene readability and pacing | Trigger an explicit in-game clarification request and confirm the answer is concise, factual, and does not bloat the surrounding scene. |
| A power comparison feels grounded instead of hand-wavy | RES-01 | Needs human evaluation of usefulness, not just schema validity | Compare two cross-series characters in a live run and confirm the result names grounded strengths, constraints, and uncertainty instead of giving vibe-based certainty. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 ownership
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all partial seams
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s on task-local samples
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
