---
phase: 50
slug: gameplay-text-presentation-and-rich-readability
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-04-13
---

# Phase 50 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `vitest.config.ts`, `frontend/vitest.config.ts`, `backend/vitest.config.ts` |
| **Task-local run rule** | Use the per-task commands in the verification map below; each task-local sample must stay at or under ~30 seconds. |
| **Wave aggregate smoke** | `npx vitest run frontend/components/game/__tests__/narrative-log.test.tsx frontend/components/game/__tests__/action-bar.test.tsx frontend/app/game/__tests__/page.test.tsx frontend/lib/__tests__/api.test.ts frontend/app/(non-game)/settings/__tests__/page.test.tsx backend/src/routes/__tests__/settings.test.ts` |
| **Full suite command** | `npm run typecheck && npx vitest run` |
| **Estimated runtime** | `<=30s` for task-local samples, `~45s` for the wave aggregate smoke, longer for the full suite |

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
| 50-01-01 | 01 | 1 | UX-01 | frontend unit | `npx vitest run frontend/components/game/__tests__/narrative-log.test.tsx` | ✅ | ⬜ pending |
| 50-01-02 | 01 | 1 | UX-01 | frontend integration | `npx vitest run frontend/app/game/__tests__/page.test.tsx frontend/lib/__tests__/api.test.ts` | ✅ | ⬜ pending |
| 50-02-01 | 02 | 2 | UX-01 | frontend unit | `npx vitest run frontend/components/game/__tests__/action-bar.test.tsx frontend/components/game/__tests__/narrative-log.test.tsx` | ✅ | ⬜ pending |
| 50-02-02 | 02 | 2 | UX-01 | frontend integration | `npx vitest run frontend/app/game/__tests__/page.test.tsx frontend/lib/__tests__/api.test.ts` | ✅ | ⬜ pending |
| 50-03-01 | 03 | 1 | UX-01 | shared/backend integration | `npx vitest run backend/src/routes/__tests__/settings.test.ts` | ✅ | ⬜ pending |
| 50-03-02 | 03 | 1 | UX-01 | frontend unit | `npx vitest run frontend/app/(non-game)/settings/__tests__/page.test.tsx` | ✅ | ⬜ pending |
| 50-04-01 | 04 | 3 | UX-01 | backend/frontend integration | `npx vitest run backend/src/routes/__tests__/chat.test.ts frontend/lib/__tests__/api.test.ts` | ✅ | ⬜ pending |
| 50-04-02 | 04 | 3 | UX-01 | frontend integration | `npx vitest run frontend/components/game/__tests__/narrative-log.test.tsx frontend/app/game/__tests__/page.test.tsx` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ partial*

---

## Wave 0 Requirements

- [ ] Extend `frontend/components/game/__tests__/narrative-log.test.tsx` for bounded RP rich-text rendering, special block separation, and stream-safe partial markup behavior
- [ ] Extend `frontend/components/game/__tests__/action-bar.test.tsx` for sticky/input-shell affordances and lightweight markup guidance without WYSIWYG behavior
- [ ] Extend `frontend/app/game/__tests__/page.test.tsx` to prove `/game` keeps lookup/progress/stream correctness under richer message surfaces
- [ ] Extend `frontend/lib/__tests__/api.test.ts` only if Phase 50 introduces additive rendering metadata or reasoning-bearing transport parsing
- [ ] Extend `frontend/app/(non-game)/settings/__tests__/page.test.tsx` and `backend/src/routes/__tests__/settings.test.ts` for the persisted raw-reasoning toggle
- [ ] Add one focused component test if Phase 50 introduces a new `rich-text-message.tsx` or special-block renderer

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Narration feels materially easier to read in long play than the current dense plain blocks | UX-01 | Requires human judgment of readability and pacing | Play a multi-turn scene in `/game` and confirm the final rendered narration reads like a deliberate story surface rather than a plain pre-wrapped log. |
| Special blocks improve scanability without turning the log into a combat HUD | UX-01 | Needs human judgment of presentation balance | Trigger lookup/progress/mechanical moments in a live run and confirm they read as distinct support blocks without overwhelming narration. |
| Raw reasoning spoiler is useful but stays clearly optional/debug-only | UX-01 | Requires visual and UX judgment | Enable the settings toggle, inspect a provider response that includes reasoning, then disable the toggle and confirm reasoning disappears without affecting canonical message text. |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 ownership
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all partial seams
- [ ] No watch-mode flags
- [ ] Feedback latency <= 30s on task-local samples
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
