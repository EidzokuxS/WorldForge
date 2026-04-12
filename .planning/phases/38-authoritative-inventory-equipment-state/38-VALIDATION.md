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
| **Quick run command** | `npm --prefix backend exec vitest run src/inventory/__tests__/inventory-authority.test.ts src/routes/__tests__/chat.inventory-authority.test.ts src/campaign/__tests__/checkpoints.test.ts src/engine/__tests__/state-snapshot.test.ts src/engine/__tests__/tool-schemas.inventory-authority.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/turn-processor.inventory-authority.test.ts src/character/__tests__/record-adapters.test.ts src/engine/__tests__/prompt-assembler.inventory-authority.test.ts src/routes/__tests__/campaigns.inventory-authority.test.ts` |
| **Full suite command** | `npm --prefix backend exec vitest run src/inventory/__tests__/inventory-authority.test.ts src/routes/__tests__/chat.inventory-authority.test.ts src/campaign/__tests__/checkpoints.test.ts src/engine/__tests__/state-snapshot.test.ts src/engine/__tests__/tool-schemas.inventory-authority.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/turn-processor.inventory-authority.test.ts src/character/__tests__/record-adapters.test.ts src/engine/__tests__/prompt-assembler.inventory-authority.test.ts src/routes/__tests__/campaigns.inventory-authority.test.ts && cd frontend && npx vitest run lib/__tests__/api.inventory-authority.test.ts app/game/__tests__/page.test.tsx components/game/__tests__/character-panel.test.tsx` |
| **Estimated runtime** | ~75 seconds |

---

## Sampling Rate

- **After every task commit:** Run the narrowest command from the Per-Task Verification Map.
- **After every plan wave:** Run the combined command for the just-finished wave that matches the plan verifies below; run the full suite at the final phase gate.
- **Before `$gsd-verify-work`:** backend authority regressions and frontend inventory/equipment rendering regressions must be green.
- **Max feedback latency:** ~25 seconds per task sample, ~75 seconds at wave/phase gates.
- **Critical focus:** legacy-campaign migration/backfill, restore-path rehydration after checkpoint/retry/undo, `transfer_item` as the only pickup/drop/equip/unequip storyteller seam, live `processTurn()` reachability of that seam, and prompt/UI read convergence on authoritative item rows.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 38-01-01 | 01 | 1 | RINT-04 | migration+restore-lock | `npm --prefix backend exec vitest run src/inventory/__tests__/inventory-authority.test.ts src/routes/__tests__/chat.inventory-authority.test.ts src/campaign/__tests__/checkpoints.test.ts src/engine/__tests__/state-snapshot.test.ts` | ✅ existing+new | ⬜ pending |
| 38-01-02 | 01 | 1 | RINT-04 | migration+restore-implementation | `npm --prefix backend exec vitest run src/inventory/__tests__/inventory-authority.test.ts src/routes/__tests__/chat.inventory-authority.test.ts src/campaign/__tests__/checkpoints.test.ts src/engine/__tests__/state-snapshot.test.ts` | ✅ existing+new | ⬜ pending |
| 38-02-01 | 02 | 2 | RINT-04 | transfer-item-runtime-lock | `npm --prefix backend exec vitest run src/engine/__tests__/tool-schemas.inventory-authority.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/turn-processor.inventory-authority.test.ts` | ✅ existing+new | ⬜ pending |
| 38-02-02 | 02 | 2 | RINT-04 | prompt+route-lock | `npm --prefix backend exec vitest run src/character/__tests__/record-adapters.test.ts src/engine/__tests__/prompt-assembler.inventory-authority.test.ts src/routes/__tests__/campaigns.inventory-authority.test.ts` | ✅ existing+new | ⬜ pending |
| 38-02-03 | 02 | 2 | RINT-04 | transfer-item-runtime+reader-implementation | `npm --prefix backend exec vitest run src/engine/__tests__/tool-schemas.inventory-authority.test.ts src/engine/__tests__/tool-executor.test.ts src/engine/__tests__/turn-processor.inventory-authority.test.ts src/character/__tests__/record-adapters.test.ts src/engine/__tests__/prompt-assembler.inventory-authority.test.ts src/routes/__tests__/campaigns.inventory-authority.test.ts` | ✅ existing+new | ⬜ pending |
| 38-03-01 | 03 | 3 | RINT-04 | frontend-contract | `cd frontend && npx vitest run lib/__tests__/api.inventory-authority.test.ts app/game/__tests__/page.test.tsx components/game/__tests__/character-panel.test.tsx` | ✅ existing+new | ⬜ pending |
| 38-03-02 | 03 | 3 | RINT-04 | frontend-authority-render | `cd frontend && npx vitest run lib/__tests__/api.inventory-authority.test.ts app/game/__tests__/page.test.tsx components/game/__tests__/character-panel.test.tsx` | ✅ existing+new | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

No dedicated Wave 0 is required. Existing backend/frontend Vitest infrastructure already covers the authority seam; execution only needs new or extended regressions in the files listed above.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reload keeps carried and equipped state identical | RINT-04 | Requires live save/reload confirmation across the full app boundary | In a campaign with at least one equipped and one carried item, reload the app or campaign and confirm the same carried/equipped split appears in `/game`, not a loadout fallback. |
| Restore paths do not resurrect legacy fallback items | RINT-04 | Needs live retry/undo or checkpoint round-trip observation after the automated restore-path regressions pass | Create or load a campaign with inventory changes, use checkpoint load or retry/undo, then confirm prompts and UI still reflect authoritative item rows instead of old `equippedItems` or seeded loadout values. |
| Storyteller-issued item-state changes stay authoritative end-to-end | RINT-04 | Automated tests prove schema reachability and `processTurn()` invocation, but a live app pass is still useful to verify real narration-driven tool choice | Trigger one pickup/drop/equip/unequip scenario through normal gameplay, then confirm later `/game` inventory and the next narrated turn both reflect the same authoritative state without any separate `equip` or `unequip` tool surface. |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all missing references
- [x] No watch-mode flags
- [x] Feedback latency < 90s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
