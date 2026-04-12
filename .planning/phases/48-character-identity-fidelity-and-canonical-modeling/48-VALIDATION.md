---
phase: 48
slug: character-identity-fidelity-and-canonical-modeling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-12
---

# Phase 48 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `vitest.config.ts`, `backend/vitest.config.ts`, `frontend/vitest.config.ts` |
| **Quick run command** | `npx vitest run backend/src/character/__tests__/generator.test.ts backend/src/engine/__tests__/npc-agent.test.ts backend/src/engine/__tests__/reflection-agent.test.ts frontend/lib/__tests__/character-drafts.test.ts frontend/components/character-creation/__tests__/character-card.test.tsx` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run backend/src/character/__tests__/generator.test.ts backend/src/engine/__tests__/npc-agent.test.ts backend/src/engine/__tests__/reflection-agent.test.ts frontend/lib/__tests__/character-drafts.test.ts frontend/components/character-creation/__tests__/character-card.test.tsx`
- **After every plan wave:** Run `npx vitest run`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 48-01-01 | 01 | 1 | CHARF-01 | unit | `npx vitest run backend/src/character/__tests__/record-adapters.identity.test.ts` | ❌ W0 | ⬜ pending |
| 48-01-02 | 01 | 1 | CHARF-01 | unit | `npx vitest run backend/src/character/__tests__/generator.test.ts backend/src/character/__tests__/npc-generator.test.ts` | ⚠️ partial | ⬜ pending |
| 48-02-01 | 02 | 2 | CHARF-01 | unit | `npx vitest run backend/src/engine/__tests__/npc-agent.test.ts backend/src/engine/__tests__/prompt-assembler.character-identity.test.ts` | ⚠️ partial | ⬜ pending |
| 48-02-02 | 02 | 2 | CHARF-01 | unit | `npx vitest run backend/src/engine/__tests__/reflection-agent.identity-boundaries.test.ts` | ❌ W0 | ⬜ pending |
| 48-03-01 | 03 | 3 | CHARF-01 | unit | `npx vitest run frontend/lib/__tests__/character-drafts.test.ts frontend/components/character-creation/__tests__/character-card.identity.test.tsx` | ⚠️ partial | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/character/__tests__/record-adapters.identity.test.ts` — verifies richer identity hydration and compatibility projection
- [ ] `backend/src/character/__tests__/npc-generator.test.ts` additions — verifies canonical/card import produces richer structure, not only legacy persona/tags
- [ ] `backend/src/engine/__tests__/prompt-assembler.character-identity.test.ts` — verifies narration context includes richer identity slices
- [ ] `backend/src/engine/__tests__/reflection-agent.identity-boundaries.test.ts` — verifies live updates stay in the mutable layer unless explicitly promoted
- [ ] `frontend/components/character-creation/__tests__/character-card.identity.test.tsx` — verifies UI adapters do not drop new fields silently

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Imported or canonical character still feels like itself after save/load and several turns | CHARF-01 | This is a gameplay-feel check across creation, persistence, and runtime prompts rather than one isolated unit seam | Create or import a recognizable character, play several turns, reload, and confirm distinctive motives, reactions, and constraints still read as the same person |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
