---
phase: 30
slug: start-conditions-canonical-loadouts-and-persona-templates
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-01
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 3.2.4 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm --prefix backend exec vitest run src/routes/__tests__/schemas.test.ts src/character/__tests__/persona-templates.test.ts src/character/__tests__/loadout-deriver.test.ts src/worldgen/__tests__/starting-location.test.ts src/routes/__tests__/character.test.ts src/routes/__tests__/persona-templates.test.ts src/routes/__tests__/campaigns.test.ts src/engine/__tests__/prompt-assembler.test.ts && npm --prefix frontend exec vitest run lib/__tests__/api.test.ts lib/__tests__/world-data-helpers.test.ts app/character-creation/__tests__/page.test.tsx app/campaign/[id]/character/__tests__/page.test.tsx app/campaign/[id]/review/__tests__/page.test.tsx components/character-creation/__tests__/character-card.test.tsx components/world-review/__tests__/npcs-section.test.tsx` |
| **Full suite command** | `npm --prefix backend exec vitest run && npm --prefix frontend exec vitest run` |
| **Estimated runtime** | ~45-60 seconds targeted; longer for full suite |

---

## Sampling Rate

- **After every task commit:** Run the task-specific command from the verification map below.
- **After every plan wave:** Run the quick-run command above.
- **Before `/gsd:verify-work`:** Full backend and frontend Vitest suites must be green.
- **Max feedback latency:** 60 seconds for targeted commands.
- **Known constraint:** `.planning/STATE.md` still records sandbox-only Vitest `spawn EPERM` failures, so unrestricted execution may still be required for final closeout even when targeted commands are defined here.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 30-01-01 | 01 | 1 | P30-03, P30-04, P30-06 | schema | `npm --prefix backend exec vitest run src/routes/__tests__/schemas.test.ts` | ✅ extend | ⬜ pending |
| 30-01-02 | 01 | 1 | P30-03, P30-04 | unit | `npm --prefix backend exec vitest run src/character/__tests__/persona-templates.test.ts src/character/__tests__/loadout-deriver.test.ts` | ❌ create | ⬜ pending |
| 30-02-01 | 02 | 2 | P30-01, P30-02, P30-06 | route | `npm --prefix backend exec vitest run src/worldgen/__tests__/starting-location.test.ts src/routes/__tests__/character.test.ts -t "structured start conditions|legacy start alias"` | ✅ extend | ⬜ pending |
| 30-02-02 | 02 | 2 | P30-03, P30-05 | backend-preview+runtime | `npm --prefix backend exec vitest run src/character/__tests__/loadout-deriver.test.ts src/routes/__tests__/character.test.ts src/engine/__tests__/prompt-assembler.test.ts -t "preview canonical loadout|materializes starting items|formats start and loadout context"` | ✅ extend | ⬜ pending |
| 30-03-01 | 03 | 2 | P30-04, P30-06 | storage+route | `npm --prefix backend exec vitest run src/character/__tests__/persona-templates.test.ts src/routes/__tests__/persona-templates.test.ts` | `persona-templates.test.ts`: ❌ create | ⬜ pending |
| 30-03-02 | 03 | 2 | P30-04, P30-05, P30-06 | route | `npm --prefix backend exec vitest run src/routes/__tests__/campaigns.test.ts src/routes/__tests__/persona-templates.test.ts -t "world payload persona templates|404 for missing template"` | `campaigns.test.ts`: ✅ extend | ⬜ pending |
| 30-04-01 | 04 | 3 | P30-01, P30-03, P30-04 | frontend-api | `npm --prefix frontend exec vitest run lib/__tests__/api.test.ts -t "resolve start conditions|preview canonical loadout|persona template"` | ✅ extend | ⬜ pending |
| 30-04-02 | 04 | 3 | P30-04, P30-05 | helper | `npm --prefix frontend exec vitest run lib/__tests__/world-data-helpers.test.ts` | ✅ extend | ⬜ pending |
| 30-05-01 | 05 | 4 | P30-02, P30-03, P30-04 | component | `npm --prefix frontend exec vitest run components/character-creation/__tests__/character-card.test.tsx -t "structured start conditions|persona templates|canonical loadout preview"` | ✅ extend | ⬜ pending |
| 30-05-02 | 05 | 4 | P30-01, P30-02, P30-03, P30-05 | page | `npm --prefix frontend exec vitest run app/character-creation/__tests__/page.test.tsx app/campaign/[id]/character/__tests__/page.test.tsx` | ✅ extend | ⬜ pending |
| 30-06-01 | 06 | 4 | P30-04, P30-05 | review-page | `npm --prefix frontend exec vitest run app/campaign/[id]/review/__tests__/page.test.tsx` | ❌ create | ⬜ pending |
| 30-06-02 | 06 | 4 | P30-04, P30-05 | component | `npm --prefix frontend exec vitest run components/world-review/__tests__/npcs-section.test.tsx -t "applies campaign persona template|shows canonical start and loadout context"` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- No separate Wave 0 plan is required. The missing test files are created inside the first-touch implementation tasks:
  - `backend/src/character/__tests__/persona-templates.test.ts`
  - `backend/src/character/__tests__/loadout-deriver.test.ts`
  - `backend/src/routes/__tests__/persona-templates.test.ts`
  - `frontend/app/campaign/[id]/review/__tests__/page.test.tsx`
- Every implementation task in the revised Phase 30 plan set includes a concrete automated verification command, so Nyquist coverage is satisfied without a standalone test-scaffold plan.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Player-facing editors feel coherent when resolving start state, applying persona templates, and previewing canonical loadout before save | P30-01, P30-02, P30-03, P30-04, P30-05 | Requires live UI interaction across async preview/apply flows on both character pages | Open `/character-creation` and `/campaign/{id}/character`, apply a template, resolve start conditions, preview loadout, save, reload, and confirm the saved player still shows the same canonical start/loadout state |
| NPC review editing can apply a campaign persona template and keep draft-backed data stable after refresh | P30-04, P30-05 | Requires live review-page interaction with NPC editing controls and persisted page reload | Open `/campaign/{id}/review`, edit an NPC draft, apply a template, inspect start/loadout visibility, save review edits, reload, and confirm the NPC still round-trips through the shared draft-backed view |

---

## Validation Sign-Off

- [x] All implementation tasks now verify with targeted automated behavior tests.
- [x] Sampling continuity: no implementation plan relies only on lint or typecheck.
- [x] Wave 0 needs are embedded in the first-touch implementation tasks, so `wave_0_complete: true` is justified.
- [x] No watch-mode flags
- [x] Feedback latency target stays at or below 60 seconds for targeted commands
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
