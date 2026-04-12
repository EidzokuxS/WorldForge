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
| **Task-local run rule** | Use the per-task commands in the verification map below; each task-local sample must stay at or under ~30 seconds. |
| **Wave aggregate smoke** | `npx vitest run backend/src/worldgen/__tests__/ip-researcher.test.ts backend/src/character/__tests__/archetype-researcher.test.ts backend/src/routes/__tests__/character.test.ts backend/src/routes/__tests__/worldgen.test.ts backend/src/routes/__tests__/schemas.test.ts backend/src/engine/__tests__/prompt-assembler.test.ts backend/src/engine/__tests__/turn-processor.test.ts backend/src/routes/__tests__/chat.test.ts frontend/components/settings/__tests__/research-tab.test.tsx` |
| **Full suite command** | `npx vitest run` |
| **Phase 49 typecheck gap gate** | `node -e "const { spawnSync } = require('node:child_process'); const run = spawnSync('npm', ['--prefix', 'backend', 'run', 'typecheck', '--', '--pretty', 'false'], { encoding: 'utf8', shell: true }); const out = (run.stdout || '') + (run.stderr || ''); process.stdout.write(out); const targets = ['src/routes/worldgen.ts(', 'src/routes/schemas.ts(', 'src/character/npc-generator.ts(', 'src/routes/__tests__/chat.test.ts(', 'src/routes/__tests__/schemas.test.ts(']; process.exit(targets.some((target) => out.includes(target)) ? 1 : 0);"` |
| **Estimated runtime** | `<=30s` for task-local samples, `~45s` for the wave aggregate smoke, longer for full suite |

---

## Sampling Rate

- **After every task commit:** run the task-local verify command from the plan; task-local latency must stay `<=30s`
- **After every plan wave:** run the wave aggregate smoke command above; this aggregate run may take ~45 seconds because it is not the task-local Nyquist gate
- **Before `$gsd-verify-work`:** full suite must be green
- **Max task-local feedback latency:** `<=30s`
- **Longer aggregate latency:** allowed only at plan-wave boundaries or on the full-suite gate

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 49-01-01 | 01 | 1 | RES-01 | unit | `npx vitest run backend/src/worldgen/__tests__/ip-researcher.test.ts` | ✅ partial | ⬜ pending |
| 49-01-02 | 01 | 1 | RES-01 | integration | `npx vitest run backend/src/worldgen/__tests__/ip-researcher.test.ts backend/src/routes/__tests__/worldgen.test.ts` | ✅ partial | ⬜ pending |
| 49-02-01 | 02 | 2 | RES-01 | unit | `npx vitest run backend/src/character/__tests__/record-adapters.identity.test.ts backend/src/routes/__tests__/schemas.test.ts` | ✅ partial | ⬜ pending |
| 49-02-02 | 02 | 2 | RES-01 | integration | `npx vitest run backend/src/character/__tests__/archetype-researcher.test.ts backend/src/routes/__tests__/character.test.ts` | ✅ partial | ⬜ pending |
| 49-03-01 | 03 | 3 | RES-01 | integration | `npx vitest run backend/src/routes/__tests__/chat.test.ts frontend/app/game/__tests__/page.test.tsx` | ✅ partial | ⬜ pending |
| 49-03-02 | 03 | 3 | RES-01 | frontend unit | `npx vitest run frontend/components/settings/__tests__/research-tab.test.tsx` | ✅ | ⬜ pending |
| 49-04-01 | 04 | 4 | RES-01 | targeted typecheck | `node -e "const { spawnSync } = require('node:child_process'); const run = spawnSync('npm', ['--prefix', 'backend', 'run', 'typecheck', '--', '--pretty', 'false'], { encoding: 'utf8', shell: true }); const out = (run.stdout || '') + (run.stderr || ''); process.stdout.write(out); process.exit(out.includes('src/routes/worldgen.ts(') ? 1 : 0);"` | ✅ | ⬜ pending |
| 49-04-02 | 04 | 4 | RES-01 | targeted typecheck | `node -e "const { spawnSync } = require('node:child_process'); const run = spawnSync('npm', ['--prefix', 'backend', 'run', 'typecheck', '--', '--pretty', 'false'], { encoding: 'utf8', shell: true }); const out = (run.stdout || '') + (run.stderr || ''); process.stdout.write(out); const targets = ['src/routes/schemas.ts(', 'src/character/npc-generator.ts(', 'src/routes/__tests__/chat.test.ts(', 'src/routes/__tests__/schemas.test.ts(']; process.exit(targets.some((target) => out.includes(target)) ? 1 : 0);"` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ partial*

---

## Wave 0 Requirements

- [ ] Extend `backend/src/worldgen/__tests__/ip-researcher.test.ts` to assert mixed-premise query decomposition and non-blended retrieval planning
- [ ] Extend `backend/src/routes/__tests__/worldgen.test.ts` to assert canonical-world reuse/storage stays in the existing `ipContext` lane through precedence and single-lane persistence invariants
- [ ] Extend `backend/src/character/__tests__/record-adapters.identity.test.ts` and `backend/src/routes/__tests__/schemas.test.ts` for the new grounding field on the Phase 48 character lane, including `@worldforge/shared` barrel-export coverage
- [ ] Extend `backend/src/character/__tests__/archetype-researcher.test.ts` to cover durable canon/power grounding instead of archetype-only prose, while preserving the existing archetype seam
- [ ] Extend `backend/src/routes/__tests__/character.test.ts` for new grounded character/power profile payloads and persistence
- [ ] Extend `backend/src/routes/__tests__/character.test.ts` to assert graceful degradation when grounding synthesis fails and import stays on the bounded non-live-search path
- [ ] Extend `backend/src/routes/__tests__/chat.test.ts` for the dedicated `/api/chat/lookup` SSE contract and to prove `/api/chat/action` keeps the existing narrative contract
- [ ] Extend `frontend/app/game/__tests__/page.test.tsx` for the minimal explicit lookup trigger/rendering path
- [ ] Extend `frontend/components/settings/__tests__/research-tab.test.tsx` if research scope wording or settings semantics change

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
- [ ] Feedback latency <= 30s on task-local samples
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
