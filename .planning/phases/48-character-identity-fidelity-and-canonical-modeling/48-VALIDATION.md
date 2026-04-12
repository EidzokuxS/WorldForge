---
phase: 48
slug: character-identity-fidelity-and-canonical-modeling
status: draft
nyquist_compliant: true
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
| **Quick run command** | `npx vitest run backend/src/routes/__tests__/schemas.test.ts backend/src/character/__tests__/generator.test.ts backend/src/character/__tests__/persona-templates.test.ts backend/src/routes/__tests__/character.test.ts backend/src/routes/__tests__/persona-templates.test.ts backend/src/routes/__tests__/campaigns.test.ts backend/src/engine/__tests__/npc-agent.test.ts backend/src/engine/__tests__/reflection-agent.test.ts frontend/lib/__tests__/character-drafts.test.ts frontend/components/character-creation/__tests__/character-card.test.tsx` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run backend/src/routes/__tests__/schemas.test.ts backend/src/character/__tests__/generator.test.ts backend/src/character/__tests__/persona-templates.test.ts backend/src/routes/__tests__/character.test.ts backend/src/routes/__tests__/persona-templates.test.ts backend/src/routes/__tests__/campaigns.test.ts backend/src/engine/__tests__/npc-agent.test.ts backend/src/engine/__tests__/reflection-agent.test.ts frontend/lib/__tests__/character-drafts.test.ts frontend/components/character-creation/__tests__/character-card.test.tsx`
- **After every plan wave:** Run `npx vitest run`
- **Before `$gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 90 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 48-01-01 | 01 | 1 | CHARF-01 | unit | `npx vitest run backend/src/character/__tests__/record-adapters.identity.test.ts backend/src/routes/__tests__/schemas.test.ts` | ❌ W0 | ⬜ pending |
| 48-01-02 | 01 | 1 | CHARF-01 | unit | `npx vitest run backend/src/character/__tests__/record-adapters.test.ts backend/src/character/__tests__/record-adapters.identity.test.ts backend/src/routes/__tests__/schemas.test.ts` | ⚠️ partial | ⬜ pending |
| 48-02-01 | 02 | 2 | CHARF-01 | unit | `npx vitest run backend/src/character/__tests__/generator.test.ts` | ✅ red baseline exists | ⬜ pending |
| 48-02-02 | 02 | 2 | CHARF-01 | unit | `npx vitest run backend/src/character/__tests__/generator.test.ts backend/src/character/__tests__/npc-generator.test.ts backend/src/routes/__tests__/character.test.ts backend/src/routes/__tests__/campaigns.test.ts` | ⚠️ partial | ⬜ pending |
| 48-02-03 | 02 | 2 | CHARF-01 | unit | `npx vitest run backend/src/character/__tests__/persona-templates.test.ts backend/src/routes/__tests__/persona-templates.test.ts` | ⚠️ partial | ⬜ pending |
| 48-03-01 | 03 | 3 | CHARF-01 | unit | `npx vitest run backend/src/engine/__tests__/npc-agent.test.ts backend/src/engine/__tests__/npc-offscreen.test.ts backend/src/engine/__tests__/prompt-assembler.character-identity.test.ts` | ⚠️ partial | ⬜ pending |
| 48-03-02 | 03 | 3 | CHARF-01 | unit | `npx vitest run backend/src/engine/__tests__/reflection-agent.test.ts backend/src/engine/__tests__/reflection-agent.identity-boundaries.test.ts` | ⚠️ partial | ⬜ pending |
| 48-04-01 | 04 | 3 | CHARF-01 | unit | `npx vitest run frontend/lib/__tests__/character-drafts.test.ts` | ✅ exists | ⬜ pending |
| 48-04-02 | 04 | 3 | CHARF-01 | unit | `npx vitest run frontend/lib/__tests__/character-drafts.test.ts frontend/components/character-creation/__tests__/character-card.identity.test.tsx` | ⚠️ partial | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Ownership

Create missing identity-specific tests first in the owning task before implementation turns green. No task may claim completion while relying on an implied future test scaffold.

| Missing Test File | Owning Task | Purpose |
|-------------------|-------------|---------|
| `backend/src/character/__tests__/record-adapters.identity.test.ts` | `48-01-01` | Lock richer identity hydration and compatibility projection before adapter work |
| `backend/src/engine/__tests__/prompt-assembler.character-identity.test.ts` | `48-03-01` | Lock narration-context consumption of richer identity slices before engine rewiring |
| `backend/src/engine/__tests__/reflection-agent.identity-boundaries.test.ts` | `48-03-02` | Lock mutable-vs-stable identity boundaries before reflection changes |
| `frontend/components/character-creation/__tests__/character-card.identity.test.tsx` | `48-04-02` | Lock UI adapters against silently dropping richer identity fields |

Existing suites that need Phase 48 additions rather than brand-new files remain owned by the task that modifies the seam:

| Existing Test File | Owning Task | Required Additions |
|--------------------|-------------|--------------------|
| `backend/src/routes/__tests__/schemas.test.ts` | `48-01-01` and `48-01-02` | Add network-boundary assertions for `baseFacts`, `behavioralCore`, `liveDynamics`, `sourceBundle`, and `continuity` |
| `backend/src/routes/__tests__/character.test.ts` | `48-02-02` | Add parse/generate/import/save assertions that richer fields survive route responses |
| `backend/src/routes/__tests__/campaigns.test.ts` | `48-02-02` | Add world-payload assertions that player/NPC drafts and records retain richer fields |
| `backend/src/character/__tests__/persona-templates.test.ts` | `48-02-03` | Add regression coverage that template application patches richer identity layers |
| `backend/src/routes/__tests__/persona-templates.test.ts` | `48-02-03` | Add API-boundary coverage for richer template application results |
| `backend/src/character/__tests__/npc-generator.test.ts` | `48-02-02` | Add canonical/import assertions that richer structure replaces thin persona/tag truth |

## Wave 0 Requirements

- [ ] `backend/src/character/__tests__/record-adapters.identity.test.ts` — verifies richer identity hydration and compatibility projection
- [ ] `backend/src/routes/__tests__/schemas.test.ts` additions — verify route schemas/materializers preserve richer identity fields across the backend API boundary
- [ ] `backend/src/character/__tests__/npc-generator.test.ts` additions — verifies canonical/card import produces richer structure, not only legacy persona/tags
- [ ] `backend/src/routes/__tests__/character.test.ts` additions — verify parse/generate/import/save character routes preserve richer identity payloads
- [ ] `backend/src/routes/__tests__/campaigns.test.ts` additions — verify world payload player/NPC character contracts preserve richer identity payloads
- [ ] `backend/src/character/__tests__/persona-templates.test.ts` additions — verify template application patches richer identity layers instead of thin persona/tag truth
- [ ] `backend/src/routes/__tests__/persona-templates.test.ts` additions — verify persona-template route responses preserve richer identity/source-bundle payloads
- [ ] `backend/src/engine/__tests__/prompt-assembler.character-identity.test.ts` — verifies narration context includes richer identity slices
- [ ] `backend/src/engine/__tests__/reflection-agent.identity-boundaries.test.ts` — verifies live updates stay in the mutable layer unless explicitly promoted
- [ ] `frontend/components/character-creation/__tests__/character-card.identity.test.tsx` — verifies UI adapters do not drop new fields silently

---

## Baseline Drift To Close

- Current red baseline confirmed on 2026-04-12: `npx vitest run backend/src/character/__tests__/generator.test.ts`
- Observed failures: prompt assertions in `parseCharacterDescription`, `mapV2CardToCharacter`, and `generateCharacterFromArchetype` still expect richer shared-contract language that `generator.ts` no longer emits.
- Planning implication: Plan `48-02` must treat generator/prompt-contract unification as prerequisite work, not polish.

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
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
