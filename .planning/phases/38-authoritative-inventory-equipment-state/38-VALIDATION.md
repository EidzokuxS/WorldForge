---
phase: 38
slug: authoritative-inventory-equipment-state
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-04-12
---

# Phase 38 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `backend/vitest.config.ts`; `frontend/vitest.config.ts` |
| **Quick run command** | `npm --prefix backend exec vitest run src/character/__tests__/record-adapters.test.ts src/routes/__tests__/character.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/prompt-assembler.test.ts src/routes/__tests__/campaigns.test.ts src/campaign/__tests__/checkpoints.test.ts src/engine/__tests__/state-snapshot.test.ts` |
| **Full suite command** | `npm --prefix backend exec vitest run src/character/__tests__/record-adapters.test.ts src/routes/__tests__/character.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/prompt-assembler.test.ts src/routes/__tests__/campaigns.test.ts src/campaign/__tests__/checkpoints.test.ts src/engine/__tests__/state-snapshot.test.ts && npm --prefix frontend exec vitest run app/game/__tests__/page.test.tsx components/game/__tests__/character-panel.test.tsx lib/__tests__/world-data-helpers.test.ts` |
| **Estimated runtime** | ~90 seconds |

---

## Sampling Rate

- **After every task commit:** Run the narrowest command from the Per-Task Verification Map.
- **After every plan wave:** Run the combined backend command for the just-finished wave; run the full suite at the final phase gate.
- **Before `$gsd-verify-work`:** backend authority regressions and frontend inventory/equipment rendering regressions must be green.
- **Max feedback latency:** ~25 seconds per task sample, ~90 seconds at wave/phase gates.
- **Critical focus:** legacy-campaign migration/backfill, restore-path rehydration after checkpoint/retry/undo, and prompt/UI read convergence on authoritative item rows.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | RINT-04 | migration | `npm --prefix backend exec vitest run src/character/__tests__/record-adapters.test.ts src/routes/__tests__/character.test.ts` | ✅ existing+new | ⬜ pending |
| 38-01-02 | 01 | 1 | RINT-04 | restore+migration | `npm --prefix backend exec vitest run src/campaign/__tests__/checkpoints.test.ts src/engine/__tests__/state-snapshot.test.ts` | ✅ existing+new | ⬜ pending |
| 38-02-01 | 02 | 2 | RINT-04 | runtime-write | `npm --prefix backend exec vitest run src/engine/__tests__/tool-executor.test.ts` | ✅ existing+new | ⬜ pending |
| 38-02-02 | 02 | 2 | RINT-04 | prompt+route | `npm --prefix backend exec vitest run src/engine/__tests__/prompt-assembler.test.ts src/routes/__tests__/campaigns.test.ts` | ✅ existing+new | ⬜ pending |
| 38-03-01 | 03 | 3 | RINT-04 | frontend-render | `npm --prefix frontend exec vitest run components/game/__tests__/character-panel.test.tsx lib/__tests__/world-data-helpers.test.ts` | ✅ existing+new | ⬜ pending |
| 38-03-02 | 03 | 3 | RINT-04 | gameplay-integration | `npm --prefix frontend exec vitest run app/game/__tests__/page.test.tsx && npm --prefix backend exec vitest run src/routes/__tests__/campaigns.test.ts src/engine/__tests__/prompt-assembler.test.ts` | ✅ existing+new | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No dedicated Wave 0 is required. Existing backend/frontend Vitest infrastructure already covers the authority seam; execution only needs new or extended regressions in the files listed above.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reload keeps carried and equipped state identical | RINT-04 | Requires live save/reload confirmation across the full app boundary | In a campaign with at least one equipped and one carried item, reload the app or campaign and confirm the same carried/equipped split appears in `/game`, not a loadout fallback. |
| Restore paths do not resurrect legacy fallback items | RINT-04 | Needs live retry/undo or checkpoint round-trip observation | Create or load a campaign with inventory changes, use checkpoint load or retry/undo, then confirm prompts and UI still reflect authoritative item rows instead of old `equippedItems` or seeded loadout values. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
